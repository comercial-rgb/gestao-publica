/**
 * Builder de XML eSocial S-1200 (RGPS) e S-1202 (RPPS).
 *
 * Fase 2 do eSocial (decisao B34.5):
 *   - Gera XML valido pronto pra envio
 *   - NAO envia (Fase 3-4 = B40-B42)
 *   - XML e gravado em arquivo ou retornado pela API pra envio manual
 *
 * Referencia: gov.br/esocial/pt-br/documentacao-tecnica
 * Versao do leiaute: S-1.3 (2025)
 *
 * O XML aqui e o "miolo" do evento -- assinatura digital (XMLDSig) e
 * adicionada na fase de envio (precisa do certificado A1 do empregador).
 */

import { competenciaParaISO } from '../utils/data.js'
import {
  PERFIS_ESOCIAL_PADRAO,
  type PerfilEsocialRubrica,
} from './codigos-s1010.js'
import {
  determinarCategoriaEsocial,
  determinarEventoRemuneracao,
  type CodigoCategoriaEsocial,
  type TipoVinculo,
} from './categoria.js'
import type { HoleriteCalculado, RegimePrevidenciario } from '../types.js'

// ============================================================
// Parametros do builder
// ============================================================

export type DadosEmpregador = {
  /** CNPJ do municipio (14 digitos, sem pontuacao) */
  cnpj: string
  /** Nome do municipio */
  razaoSocial: string
}

export type DadosTrabalhador = {
  /** CPF do servidor (11 digitos sem pontuacao) */
  cpf: string
  /** Nome completo */
  nome: string
  /** Data de nascimento ISO YYYY-MM-DD */
  dataNascimento: string
}

export type DadosVinculo = {
  /** Matricula do servidor */
  matricula: string
  /** Tipo do vinculo (determina categoria eSocial) */
  tipoVinculo: TipoVinculo
  /** Override opcional do codigo de categoria */
  categoriaEsocialOverride?: CodigoCategoriaEsocial
}

export type DadosFolha = {
  /** Identificador unico da apuracao no eSocial (texto livre) */
  idDmDev: string
  /** Identificador da tabela de rubricas configurada no S-1010 */
  ideTabRubr: string
  /** Codigo de lotacao tributaria (geralmente "1" pra municipios) */
  codLotacao: string
}

export type AmbienteEsocial = 'PRODUCAO' | 'PRODUCAO_RESTRITA' | 'TESTE'

export type BuildEventoParams = {
  holerite: HoleriteCalculado
  regimePrevidenciario: RegimePrevidenciario
  empregador: DadosEmpregador
  trabalhador: DadosTrabalhador
  vinculo: DadosVinculo
  folha: DadosFolha
  /** Perfis customizados (sobrescreve PERFIS_ESOCIAL_PADRAO) */
  perfisRubricas?: Record<string, PerfilEsocialRubrica>
  /** 1=producao, 2=restrita, 3=teste */
  ambiente?: AmbienteEsocial
  /** Versao do processo emissor (do sistema) */
  versaoProcesso?: string
  /** Indicador de retificacao (1=original, 2=retificacao) */
  indRetif?: '1' | '2'
}

export type EventoEsocialGerado = {
  tipoEvento: 'S-1200' | 'S-1202'
  idEvento: string
  xml: string
  /** Sem espacos em branco -- para hash e assinatura */
  xmlCompacto: string
}

// ============================================================
// Builder principal
// ============================================================

export function buildEventoRemuneracao(params: BuildEventoParams): EventoEsocialGerado {
  const tipoEvento = determinarEventoRemuneracao(params.regimePrevidenciario)
  const categoriaEsocial = determinarCategoriaEsocial({
    regimePrevidenciario: params.regimePrevidenciario,
    tipoVinculo: params.vinculo.tipoVinculo,
    override: params.vinculo.categoriaEsocialOverride,
  })

  const competencia = competenciaParaISO(params.holerite.competencia).slice(0, 7) // YYYY-MM
  const idEvento = gerarIdEvento({
    empregadorCnpj: params.empregador.cnpj,
    cpfTrabalhador: params.trabalhador.cpf,
  })

  const ambienteCodigo = ambienteParaCodigo(params.ambiente ?? 'TESTE')
  const versaoProc = params.versaoProcesso ?? '1.0.0'
  const indRetif = params.indRetif ?? '1'

  // Monta verbas (rubricas) baseado no holerite
  const verbasXml = construirVerbas({
    holerite: params.holerite,
    perfisRubricas: params.perfisRubricas ?? {},
    ideTabRubr: params.folha.ideTabRubr,
  })

  const namespaceEvento =
    tipoEvento === 'S-1202'
      ? 'http://www.esocial.gov.br/schema/evt/evtRmnRPPS/v_S_01_03_00'
      : 'http://www.esocial.gov.br/schema/evt/evtRemun/v_S_01_03_00'

  const rootElement = tipoEvento === 'S-1202' ? 'evtRmnRPPS' : 'evtRemun'

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="${namespaceEvento}">
  <${rootElement} Id="${escapeXml(idEvento)}">
    <ideEvento>
      <indRetif>${indRetif}</indRetif>
      <perApur>${escapeXml(competencia)}</perApur>
      <indApuracao>1</indApuracao>
      <indGuia>1</indGuia>
      <tpAmb>${ambienteCodigo}</tpAmb>
      <procEmi>1</procEmi>
      <verProc>${escapeXml(versaoProc)}</verProc>
    </ideEvento>
    <ideEmpregador>
      <tpInsc>1</tpInsc>
      <nrInsc>${escapeXml(params.empregador.cnpj.slice(0, 8))}</nrInsc>
    </ideEmpregador>
    <ideTrabalhador>
      <cpfTrab>${escapeXml(params.trabalhador.cpf)}</cpfTrab>
    </ideTrabalhador>
    <dmDev>
      <ideDmDev>${escapeXml(params.folha.idDmDev)}</ideDmDev>
      <codCateg>${categoriaEsocial}</codCateg>
      <infoPerApur>
        <ideEstabLot>
          <tpInsc>1</tpInsc>
          <nrInsc>${escapeXml(params.empregador.cnpj)}</nrInsc>
          <codLotacao>${escapeXml(params.folha.codLotacao)}</codLotacao>
${verbasXml}
        </ideEstabLot>
      </infoPerApur>
    </dmDev>
  </${rootElement}>
</eSocial>`

  return {
    tipoEvento,
    idEvento,
    xml,
    xmlCompacto: compactarXml(xml),
  }
}

// ============================================================
// Helpers privados
// ============================================================

function gerarIdEvento(params: {
  empregadorCnpj: string
  cpfTrabalhador: string
}): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, '')
    .slice(0, 14)
  const cnpjLimpo = params.empregadorCnpj.replace(/\D/g, '').padStart(14, '0')
  const sequencial = params.cpfTrabalhador.slice(-5).padStart(5, '0')

  return `ID1${cnpjLimpo}${timestamp}${sequencial}`.slice(0, 36)
}

function ambienteParaCodigo(ambiente: AmbienteEsocial): string {
  return { PRODUCAO: '1', PRODUCAO_RESTRITA: '2', TESTE: '3' }[ambiente]
}

function construirVerbas(params: {
  holerite: HoleriteCalculado
  perfisRubricas: Record<string, PerfilEsocialRubrica>
  ideTabRubr: string
}): string {
  const linhas: string[] = []

  // Rubricas calculadas
  for (const rubrica of params.holerite.rubricas) {
    const perfil = resolverPerfil(rubrica.codigo, params.perfisRubricas)
    if (!perfil) continue

    linhas.push(`          <detVerbas>
            <codRubr>${escapeXml(perfil.codigoEsocial)}</codRubr>
            <ideTabRubr>${escapeXml(params.ideTabRubr)}</ideTabRubr>
            <qtdRubr>1</qtdRubr>
            <fatorRubr>${rubrica.fatorProporcionalidade.toFixed(2)}</fatorRubr>
            <vrUnit>${rubrica.valorBase.toFixed(2)}</vrUnit>
            <vrRubr>${rubrica.valor.toFixed(2)}</vrRubr>
          </detVerbas>`)
  }

  // INSS (sempre se houver)
  if (params.holerite.inss.valor > 0) {
    const perfil = params.perfisRubricas.INSS ?? PERFIS_ESOCIAL_PADRAO.INSS!
    linhas.push(`          <detVerbas>
            <codRubr>${escapeXml(perfil.codigoEsocial)}</codRubr>
            <ideTabRubr>${escapeXml(params.ideTabRubr)}</ideTabRubr>
            <qtdRubr>1</qtdRubr>
            <vrUnit>${params.holerite.inss.valor.toFixed(2)}</vrUnit>
            <vrRubr>${params.holerite.inss.valor.toFixed(2)}</vrRubr>
          </detVerbas>`)
  }

  // IRRF (sempre se houver)
  if (params.holerite.irrf.valor > 0) {
    const perfil = params.perfisRubricas.IRRF ?? PERFIS_ESOCIAL_PADRAO.IRRF!
    linhas.push(`          <detVerbas>
            <codRubr>${escapeXml(perfil.codigoEsocial)}</codRubr>
            <ideTabRubr>${escapeXml(params.ideTabRubr)}</ideTabRubr>
            <qtdRubr>1</qtdRubr>
            <vrUnit>${params.holerite.irrf.valor.toFixed(2)}</vrUnit>
            <vrRubr>${params.holerite.irrf.valor.toFixed(2)}</vrRubr>
          </detVerbas>`)
  }

  // Salario-familia (informativa)
  if (params.holerite.salarioFamilia && params.holerite.salarioFamilia.valorTotal > 0) {
    const perfil = params.perfisRubricas.SALARIO_FAMILIA ?? PERFIS_ESOCIAL_PADRAO.SALARIO_FAMILIA!
    linhas.push(`          <detVerbas>
            <codRubr>${escapeXml(perfil.codigoEsocial)}</codRubr>
            <ideTabRubr>${escapeXml(params.ideTabRubr)}</ideTabRubr>
            <qtdRubr>${params.holerite.salarioFamilia.numeroFilhosElegiveis}</qtdRubr>
            <vrUnit>${params.holerite.salarioFamilia.valorPorFilho.toFixed(2)}</vrUnit>
            <vrRubr>${params.holerite.salarioFamilia.valorTotal.toFixed(2)}</vrRubr>
          </detVerbas>`)
  }

  return linhas.join('\n')
}

function resolverPerfil(
  codigoRubrica: string,
  perfis: Record<string, PerfilEsocialRubrica>,
): PerfilEsocialRubrica | null {
  // Tenta override do tenant
  if (perfis[codigoRubrica]) return perfis[codigoRubrica]!

  // Tenta padrao por codigo comum
  if (PERFIS_ESOCIAL_PADRAO[codigoRubrica]) return PERFIS_ESOCIAL_PADRAO[codigoRubrica]!

  // Heuristica por codigo conhecido
  const codigo = codigoRubrica.toUpperCase()
  if (codigo.includes('VENC')) return PERFIS_ESOCIAL_PADRAO.VENCIMENTO!
  if (codigo.includes('13')) return PERFIS_ESOCIAL_PADRAO.GRATIFICACAO_NATALINA!
  if (codigo.includes('FERIAS')) return PERFIS_ESOCIAL_PADRAO.TERCO_FERIAS!

  return null
}

/** Escape basico de XML */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Remove whitespace entre tags (nao dentro de valores) */
function compactarXml(xml: string): string {
  return xml.replace(/>\s+</g, '><').trim()
}
