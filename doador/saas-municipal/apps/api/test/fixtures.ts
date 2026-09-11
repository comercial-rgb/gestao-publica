import postgres from 'postgres'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { env } from '../src/env.js'
import { seedFolhaPublico } from '@saas-municipal/database/seeds/folha-publico'
import { hashSnapshotSha256 } from '@saas-municipal/database/utils/hash-snapshot'
import { createMasterDatabase } from '@saas-municipal/database'

export interface OrcamentoFixtures {
  entidadeId: string
  ppaId: string
  loaId: string
  exercicioId: string
  programaId: string
  acaoId: string
  modalidadeId: string
  fonteId: string
  dotacaoAId: string
  dotacaoBId: string
  valorInicialA: string
  valorInicialB: string
}

/**
 * Cria estrutura mínima de orçamento para testar aplicar-crédito.
 */
export async function seedOrcamentoBasico(
  schemaName: string,
  userId: string,
): Promise<OrcamentoFixtures> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const [entidade] = await tx<{ id: string }[]>`
        INSERT INTO entidades (codigo, nome, tipo)
        VALUES ('001', 'Prefeitura Test', 'prefeitura')
        RETURNING id
      `

      const [ppa] = await tx<{ id: string }[]>`
        INSERT INTO leis_orcamentarias
          (tipo, numero, descricao, ano_inicio, ano_fim, status, created_by)
        VALUES
          ('ppa', 'Lei Test PPA/2026', 'PPA 2026-2029', 2026, 2029, 'em_execucao', ${userId}::uuid)
        RETURNING id
      `

      const [loa] = await tx<{ id: string }[]>`
        INSERT INTO leis_orcamentarias
          (tipo, numero, descricao, ano_inicio, ano_fim, status, ppa_vigente_id, created_by)
        VALUES
          ('loa', 'Lei Test LOA/2026', 'LOA 2026', 2026, 2026, 'em_execucao', ${ppa!.id}::uuid, ${userId}::uuid)
        RETURNING id
      `

      const [exercicio] = await tx<{ id: string }[]>`
        SELECT id FROM exercicios WHERE ano = 2026 LIMIT 1
      `
      if (!exercicio) throw new Error('Exercício 2026 não foi seedado pelo baseline')

      const [programa] = await tx<{ id: string }[]>`
        INSERT INTO programas (ppa_id, codigo, nome, ativo)
        VALUES (${ppa!.id}::uuid, '0001', 'Programa Test', true)
        RETURNING id
      `

      const [acao] = await tx<{ id: string }[]>`
        INSERT INTO acoes (programa_id, codigo, nome, tipo, ativo)
        VALUES (${programa!.id}::uuid, '2003', 'Ação Test', 2, true)
        RETURNING id
      `

      let modalidadeId: string
      const [modalidade] = await tx<{ id: string }[]>`
        SELECT id FROM modalidades_aplicacao WHERE codigo = '90' LIMIT 1
      `
      if (!modalidade) {
        const [m] = await tx<{ id: string }[]>`
          INSERT INTO modalidades_aplicacao (codigo, descricao, tipo, ativo)
          VALUES ('90', 'Aplicações Diretas', 'stn', true)
          RETURNING id
        `
        modalidadeId = m!.id
      } else {
        modalidadeId = modalidade.id
      }

      let fonteId: string
      const [fonte] = await tx<{ id: string }[]>`
        SELECT id FROM fontes_recurso WHERE codigo = '1.500.0000' LIMIT 1
      `
      if (!fonte) {
        const [f] = await tx<{ id: string }[]>`
          INSERT INTO fontes_recurso (codigo, descricao, grupo, tipo, ativo)
          VALUES ('1.500.0000', 'Recursos Não Vinculados de Impostos', '1', 'stn', true)
          RETURNING id
        `
        fonteId = f!.id
      } else {
        fonteId = fonte.id
      }

      const classificacaoA = '03.01.10.301.0001.2003.3.3.90.30.00.1.500.0000.U'
      const [dotacaoA] = await tx<{ id: string }[]>`
        INSERT INTO dotacoes (
          lei_orcamentaria_id, exercicio_id, classificacao_completa,
          entidade_id, orgao_codigo, unidade_codigo, funcao_codigo, subfuncao_codigo,
          programa_id, acao_id,
          natureza_categoria, natureza_grupo, modalidade_aplicacao_id, natureza_elemento,
          fonte_recurso_id, indicador_resultado_primario,
          valor_inicial, valor_atualizado,
          ativo, created_by
        ) VALUES (
          ${loa!.id}::uuid, ${exercicio.id}::uuid, ${classificacaoA},
          ${entidade!.id}::uuid, '03', '01', '10', '301',
          ${programa!.id}::uuid, ${acao!.id}::uuid,
          '3', '3', ${modalidadeId}::uuid, '30',
          ${fonteId}::uuid, 'U',
          '100000.00', '100000.00',
          true, ${userId}::uuid
        ) RETURNING id
      `

      const classificacaoB = '03.01.10.302.0001.2003.3.3.90.30.00.1.500.0000.U'
      const [dotacaoB] = await tx<{ id: string }[]>`
        INSERT INTO dotacoes (
          lei_orcamentaria_id, exercicio_id, classificacao_completa,
          entidade_id, orgao_codigo, unidade_codigo, funcao_codigo, subfuncao_codigo,
          programa_id, acao_id,
          natureza_categoria, natureza_grupo, modalidade_aplicacao_id, natureza_elemento,
          fonte_recurso_id, indicador_resultado_primario,
          valor_inicial, valor_atualizado,
          ativo, created_by
        ) VALUES (
          ${loa!.id}::uuid, ${exercicio.id}::uuid, ${classificacaoB},
          ${entidade!.id}::uuid, '03', '01', '10', '302',
          ${programa!.id}::uuid, ${acao!.id}::uuid,
          '3', '3', ${modalidadeId}::uuid, '30',
          ${fonteId}::uuid, 'U',
          '50000.00', '50000.00',
          true, ${userId}::uuid
        ) RETURNING id
      `

      return {
        entidadeId: entidade!.id,
        ppaId: ppa!.id,
        loaId: loa!.id,
        exercicioId: exercicio.id,
        programaId: programa!.id,
        acaoId: acao!.id,
        modalidadeId,
        fonteId,
        dotacaoAId: dotacaoA!.id,
        dotacaoBId: dotacaoB!.id,
        valorInicialA: '100000.00',
        valorInicialB: '50000.00',
      }
    })
  } finally {
    await client.end()
  }
}

export async function seedCreditoAprovado(
  schemaName: string,
  userId: string,
  fixtures: OrcamentoFixtures,
  opts: {
    valorReforcoA: string
    valorAnulacaoB: string
    numero?: string
  },
): Promise<{ creditoId: string; linhaReforcoId: string; linhaAnulacaoId: string }> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const numero = opts.numero ?? `Decreto TEST-${Math.floor(Math.random() * 10000)}`
      const valorTotal = (Number(opts.valorReforcoA) + Number(opts.valorAnulacaoB)).toFixed(2)

      const [credito] = await tx<{ id: string }[]>`
        INSERT INTO creditos_orcamentarios (
          exercicio_id, lei_orcamentaria_id, numero, tipo, origem,
          valor, data_decreto, justificativa, status, created_by
        ) VALUES (
          ${fixtures.exercicioId}::uuid, ${fixtures.loaId}::uuid,
          ${numero}, 'suplementar', 'anulacao_dotacao',
          ${valorTotal}, '2026-05-01',
          'Crédito de teste para validação automatizada de aplicação',
          'aprovado', ${userId}::uuid
        ) RETURNING id
      `

      const [reforco] = await tx<{ id: string }[]>`
        INSERT INTO creditos_dotacoes (credito_id, dotacao_id, sinal, valor)
        VALUES (${credito!.id}::uuid, ${fixtures.dotacaoAId}::uuid, 1, ${opts.valorReforcoA})
        RETURNING id
      `

      const [anulacao] = await tx<{ id: string }[]>`
        INSERT INTO creditos_dotacoes (credito_id, dotacao_id, sinal, valor)
        VALUES (${credito!.id}::uuid, ${fixtures.dotacaoBId}::uuid, -1, ${opts.valorAnulacaoB})
        RETURNING id
      `

      return {
        creditoId: credito!.id,
        linhaReforcoId: reforco!.id,
        linhaAnulacaoId: anulacao!.id,
      }
    })
  } finally {
    await client.end()
  }
}

export interface DespesaPipelineFixtures {
  fornecedorId: string
  empenhoId: string
  empenhoNumero: string
  liquidacaoId: string
  liquidacaoNumero: string
  opId: string
  opNumero: string
  mesFiscalId: string
  empenhoValor: string
  empenhoLiquidadoInicial: string
  opValor: string
}

/**
 * Cria pipeline pronto ate liquidacao:
 *   - usa seedOrcamentoBasico para ter dotacao A (100k)
 *   - cria 1 fornecedor PJ
 *   - cria 1 empenho de 30k na dotacao A
 *   - cria 1 liquidacao de 15k do empenho
 *   - cria 1 OP de 15k aprovada (pronta pra receber pagamento)
 */
export async function seedDespesaProntaParaPagar(
  schemaName: string,
  userId: string,
  orcamento: OrcamentoFixtures,
): Promise<DespesaPipelineFixtures> {
  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      const [mes] = await tx<{ id: string }[]>`
        SELECT id FROM meses_fiscais WHERE exercicio_id = ${orcamento.exercicioId}::uuid AND mes = 1
      `
      if (!mes) throw new Error('Mes fiscal 01/2026 nao foi seedado pelo baseline')

      const [fornecedor] = await tx<{ id: string }[]>`
        INSERT INTO pessoas (tipo, nome, documento, active) VALUES ('PJ', 'Fornecedor Test Ltda', '12345678000100', true) RETURNING id
      `

      const [empenho] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO empenhos (numero, tipo, status, exercicio_id, mes_fiscal_id, dotacao_id, fornecedor_pessoa_id, data_empenho, valor, valor_liquidado, valor_pago, valor_anulado, objeto, created_by)
        VALUES ('2026/TEST01', 'ordinario', 'vigente', ${orcamento.exercicioId}::uuid, ${mes!.id}::uuid, ${orcamento.dotacaoAId}::uuid, ${fornecedor!.id}::uuid, '2026-01-15', '30000.00', '0', '0', '0', 'Empenho de teste para cobertura de cascata de pagamento', ${userId}::uuid)
        RETURNING id, numero
      `

      await tx`UPDATE dotacoes SET valor_empenhado = valor_empenhado + 30000 WHERE id = ${orcamento.dotacaoAId}::uuid`

      const [liquidacao] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO liquidacoes (numero, status, empenho_id, mes_fiscal_id, data_liquidacao, valor, valor_pago, documento_comprovante, created_by)
        VALUES ('2026/TEST-L01', 'vigente', ${empenho!.id}::uuid, ${mes!.id}::uuid, '2026-01-20', '15000.00', '0', 'NF TEST-001', ${userId}::uuid)
        RETURNING id, numero
      `

      await tx`UPDATE empenhos SET valor_liquidado = valor_liquidado + 15000 WHERE id = ${empenho!.id}::uuid`
      await tx`UPDATE dotacoes SET valor_liquidado = valor_liquidado + 15000 WHERE id = ${orcamento.dotacaoAId}::uuid`

      const [op] = await tx<{ id: string; numero: string }[]>`
        INSERT INTO ordens_pagamento (numero, status, liquidacao_id, mes_fiscal_id, valor, valor_pago, data_emissao, data_aprovacao, aprovada_em, aprovada_por_user_id, created_by)
        VALUES ('2026/TEST-OP01', 'aprovada', ${liquidacao!.id}::uuid, ${mes!.id}::uuid, '15000.00', '0', '2026-01-21', '2026-01-22', NOW(), ${userId}::uuid, ${userId}::uuid)
        RETURNING id, numero
      `

      return {
        fornecedorId: fornecedor!.id,
        empenhoId: empenho!.id, empenhoNumero: empenho!.numero,
        liquidacaoId: liquidacao!.id, liquidacaoNumero: liquidacao!.numero,
        opId: op!.id, opNumero: op!.numero,
        mesFiscalId: mes!.id,
        empenhoValor: '30000.00', empenhoLiquidadoInicial: '15000.00', opValor: '15000.00',
      }
    })
  } finally {
    await client.end()
  }
}

// ─────────────────────────────────────────────────────────────
// Folha calculo (B35)
// ─────────────────────────────────────────────────────────────

export interface FolhaFixtures {
  entidadeId: string
  cargoId: string
  nivelReferenciaId: string
  rppsAliquotaId: string
  /** RGPS, vencimento baixo + 2 dependentes -> exercita salario-familia */
  vinculoRgpsId: string
  pessoaRgpsId: string
  /** RPPS, vencimento medio + 1 dependente IR -> exercita aliquota linear 14% */
  vinculoRppsId: string
  pessoaRppsId: string
  /** Comissionado RGPS acima do teto -> exercita teto INSS + IRRF faixa alta */
  vinculoComissionadoId: string
  pessoaComissionadoId: string
  rubricaVencimentoId: string
  rubricaGratificacaoId: string
  exercicioId: string
  mesFiscalId: string
  competenciaIso: string
  vencimentoRgps: string
  vencimentoRpps: string
  vencimentoComissionado: string
  gratificacaoComissionado: string
}

/**
 * Seed completo do modulo folha-calculo (B35.5).
 *
 * Cria um cenario ponta-a-ponta com 3 vinculos que cobrem os tres regimes
 * previdenciarios relevantes, mais rubricas, dependentes e a aliquota RPPS
 * do municipio. Suficiente pra fechar uma folha de verdade pelo worker.
 *
 * Aplica em ORDEM:
 *   1. seedFolhaPublico (INSS/IRRF/SF 2020-2026) no schema public
 *   2. entidade + cargo + nivel/referencia
 *   3. RPPS aliquota vigente do tenant
 *   4. 3 pessoas + 3 vinculos ativos
 *   5. dependentes (IR e salario-familia)
 *   6. rubricas + atribuicao por vinculo (rubricas_vinculos)
 */
export async function seedFolhaCalculoCompleto(opts: {
  schemaName: string
  userId: string
  /** Primeiro dia da competencia, ex: new Date('2026-05-01T00:00:00Z') */
  competencia: Date
}): Promise<FolhaFixtures> {
  const { schemaName, userId, competencia } = opts
  const competenciaIso = competencia.toISOString().slice(0, 10)
  const ano = competencia.getUTCFullYear()
  const mes = competencia.getUTCMonth() + 1

  // Valores escolhidos pra exercitar faixas distintas de INSS/IRRF.
  const vencimentoRgps = '1600.00'
  const vencimentoRpps = '6500.00'
  const vencimentoComissionado = '9000.00'
  const gratificacaoComissionado = '1500.00'

  // 1. Seed publico (idempotente) — tabelas federais vivem no schema public
  const masterDb = createMasterDatabase(env.DATABASE_URL)
  await seedFolhaPublico(masterDb as unknown as PostgresJsDatabase<Record<string, never>>)

  const client = postgres(env.DATABASE_URL, { max: 1 })

  try {
    return await client.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL search_path TO "${schemaName}", public`)

      // ── Periodo fiscal (provisionado pelo baseline do tenant) ──
      const [exercicio] = await tx<{ id: string }[]>`
        SELECT id FROM exercicios WHERE ano = ${ano} LIMIT 1
      `
      if (!exercicio) {
        throw new Error(`Exercicio ${ano} nao foi seedado pelo baseline do tenant`)
      }

      const [mesFiscal] = await tx<{ id: string }[]>`
        SELECT id FROM meses_fiscais
        WHERE exercicio_id = ${exercicio.id}::uuid AND mes = ${mes}
        LIMIT 1
      `
      if (!mesFiscal) throw new Error(`Mes fiscal ${mes}/${ano} nao encontrado`)

      // ── Entidade (unidade gestora dos vinculos) ──
      const [entidade] = await tx<{ id: string }[]>`
        INSERT INTO entidades (codigo, nome, tipo)
        VALUES ('900', 'Prefeitura Folha Test', 'prefeitura')
        RETURNING id
      `

      // ── Aliquota RPPS do municipio ──
      const [rpps] = await tx<{ id: string }[]>`
        INSERT INTO rpps_aliquotas (
          vigencia_inicio, vigencia_fim, aliquota_servidor,
          aliquota_patronal_normal, aliquota_patronal_suplementar,
          teto_contribuicao, fundamentacao_legal, ativa
        ) VALUES (
          '2024-01-01', NULL, '0.1400',
          '0.2200', '0.0500',
          NULL, 'Lei Municipal n. XXX/YYYY (fixture de teste)', true
        ) RETURNING id
      `

      // ── Cargo + nivel/referencia ──
      const [cargo] = await tx<{ id: string }[]>`
        INSERT INTO cargos (codigo, nome, regime_juridico, carga_horaria_semanal, ativo, created_by)
        VALUES ('C900', 'Agente Administrativo', 'estatutario', 40, true, ${userId}::uuid)
        RETURNING id
      `

      const [nivel] = await tx<{ id: string }[]>`
        INSERT INTO cargos_niveis_referencias
          (cargo_id, nivel, referencia, vencimento_base, ativo, vigencia_inicio)
        VALUES (${cargo!.id}::uuid, 'I', 'A', ${vencimentoRgps}, true, '2020-01-01')
        RETURNING id
      `

      // ── Pessoas ──
      const inserirPessoa = async (
        documento: string,
        nome: string,
        dataNascimento: string,
      ): Promise<string> => {
        const [p] = await tx<{ id: string }[]>`
          INSERT INTO pessoas (tipo, documento, nome, data_nascimento, sexo, active, created_by)
          VALUES ('PF', ${documento}, ${nome}, ${dataNascimento}, 'F', true, ${userId}::uuid)
          RETURNING id
        `
        return p!.id
      }

      const pessoaRgpsId = await inserirPessoa('90000000001', 'Maria Silva RGPS', '1990-03-12')
      const pessoaRppsId = await inserirPessoa('90000000002', 'Joao Souza RPPS', '1980-07-25')
      const pessoaComissionadoId = await inserirPessoa('90000000003', 'Ana Lima Comissionada', '1975-11-02')

      // ── Vinculos funcionais ──
      const inserirVinculo = async (p: {
        pessoaId: string
        matricula: string
        tipo: string
        regimeJuridico: string
        regimePrevidenciario: string
        qtdDependentesIrrf: number
        qtdDependentesSalarioFamilia: number
      }): Promise<string> => {
        const [v] = await tx<{ id: string }[]>`
          INSERT INTO vinculos_funcionais (
            pessoa_id, matricula, tipo, status, cargo_id, nivel_referencia_id, entidade_id,
            regime_juridico, regime_previdenciario, data_admissao, carga_horaria_semanal,
            qtd_dependentes_irrf, qtd_dependentes_salario_familia, created_by
          ) VALUES (
            ${p.pessoaId}::uuid, ${p.matricula}, ${p.tipo}::vinculo_tipo, 'ativo',
            ${cargo!.id}::uuid, ${nivel!.id}::uuid, ${entidade!.id}::uuid,
            ${p.regimeJuridico}::regime_juridico, ${p.regimePrevidenciario}::regime_previdenciario,
            '2020-01-15', 40,
            ${p.qtdDependentesIrrf}, ${p.qtdDependentesSalarioFamilia}, ${userId}::uuid
          ) RETURNING id
        `
        return v!.id
      }

      const vinculoRgpsId = await inserirVinculo({
        pessoaId: pessoaRgpsId, matricula: 'M9001', tipo: 'efetivo',
        regimeJuridico: 'estatutario', regimePrevidenciario: 'rgps',
        qtdDependentesIrrf: 2, qtdDependentesSalarioFamilia: 2,
      })

      const vinculoRppsId = await inserirVinculo({
        pessoaId: pessoaRppsId, matricula: 'M9002', tipo: 'efetivo',
        regimeJuridico: 'estatutario', regimePrevidenciario: 'rpps',
        qtdDependentesIrrf: 1, qtdDependentesSalarioFamilia: 0,
      })

      const vinculoComissionadoId = await inserirVinculo({
        pessoaId: pessoaComissionadoId, matricula: 'M9003', tipo: 'comissionado',
        regimeJuridico: 'comissionado', regimePrevidenciario: 'rgps',
        qtdDependentesIrrf: 0, qtdDependentesSalarioFamilia: 0,
      })

      // ── Dependentes ──
      const inserirDependente = async (p: {
        pessoaId: string
        nome: string
        dataNascimento: string
        dependenteIR: boolean
        dependenteSalarioFamilia: boolean
      }) => {
        await tx`
          INSERT INTO pessoa_dependentes (
            pessoa_id, nome, data_nascimento, parentesco, invalido,
            dependente_ir, dependente_salario_familia, dependente_plano_saude,
            data_inicio_dependencia, created_by
          ) VALUES (
            ${p.pessoaId}::uuid, ${p.nome}, ${p.dataNascimento}, 'FILHO', false,
            ${p.dependenteIR}, ${p.dependenteSalarioFamilia}, false,
            ${p.dataNascimento}, ${userId}::uuid
          )
        `
      }

      await inserirDependente({
        pessoaId: pessoaRgpsId, nome: 'Filho Um', dataNascimento: '2018-04-10',
        dependenteIR: true, dependenteSalarioFamilia: true,
      })
      await inserirDependente({
        pessoaId: pessoaRgpsId, nome: 'Filho Dois', dataNascimento: '2021-09-01',
        dependenteIR: true, dependenteSalarioFamilia: true,
      })
      await inserirDependente({
        pessoaId: pessoaRppsId, nome: 'Filha Unica', dataNascimento: '2015-01-20',
        dependenteIR: true, dependenteSalarioFamilia: false,
      })

      // ── Rubricas ──
      // INTEGRAL mantem o calculo deterministico (sem depender de eventos do mes).
      const [rubricaVencimento] = await tx<{ id: string }[]>`
        INSERT INTO rubricas (
          codigo, nome, tipo, calculo,
          incide_inss, incide_irrf, incide_fgts, incide_rpps,
          folha_mensal, estrategia_proporcionalidade, codigo_esocial, ativo, created_by
        ) VALUES (
          '0001', 'Vencimento Base', 'provento', 'fixo',
          true, true, false, true,
          true, 'INTEGRAL', '1000', true, ${userId}::uuid
        ) RETURNING id
      `

      const [rubricaGratificacao] = await tx<{ id: string }[]>`
        INSERT INTO rubricas (
          codigo, nome, tipo, calculo,
          incide_inss, incide_irrf, incide_fgts, incide_rpps,
          folha_mensal, estrategia_proporcionalidade, codigo_esocial, ativo, created_by
        ) VALUES (
          '0002', 'Gratificacao de Funcao', 'provento', 'fixo',
          true, true, false, true,
          true, 'INTEGRAL', '1010', true, ${userId}::uuid
        ) RETURNING id
      `

      // ── Atribuicao rubrica -> vinculo ──
      const atribuir = async (vinculoId: string, rubricaId: string, valor: string) => {
        await tx`
          INSERT INTO rubricas_vinculos (vinculo_id, rubrica_id, valor, vigencia_inicio, ativo, created_by)
          VALUES (${vinculoId}::uuid, ${rubricaId}::uuid, ${valor}, '2020-01-15', true, ${userId}::uuid)
        `
      }

      await atribuir(vinculoRgpsId, rubricaVencimento!.id, vencimentoRgps)
      await atribuir(vinculoRppsId, rubricaVencimento!.id, vencimentoRpps)
      await atribuir(vinculoComissionadoId, rubricaVencimento!.id, vencimentoComissionado)
      await atribuir(vinculoComissionadoId, rubricaGratificacao!.id, gratificacaoComissionado)

      return {
        entidadeId: entidade!.id,
        cargoId: cargo!.id,
        nivelReferenciaId: nivel!.id,
        rppsAliquotaId: rpps!.id,
        vinculoRgpsId,
        pessoaRgpsId,
        vinculoRppsId,
        pessoaRppsId,
        vinculoComissionadoId,
        pessoaComissionadoId,
        rubricaVencimentoId: rubricaVencimento!.id,
        rubricaGratificacaoId: rubricaGratificacao!.id,
        exercicioId: exercicio.id,
        mesFiscalId: mesFiscal.id,
        competenciaIso,
        vencimentoRgps,
        vencimentoRpps,
        vencimentoComissionado,
        gratificacaoComissionado,
      }
    })
  } finally {
    await client.end()
  }
}

/**
 * Helper pra testes: gera holerite snapshot fake e calcula hash.
 */
export function gerarSnapshotFake(opts: {
  vinculoId: string
  bruto: number
  liquido: number
}) {
  const snapshot = {
    vinculoId: opts.vinculoId,
    competencia: '2026-05-01',
    rubricas: [
      { codigo: 'VENCIMENTO', valor: opts.bruto, tipo: 'PROVENTO' },
      { codigo: 'INSS', valor: opts.bruto * 0.14, tipo: 'DESCONTO' },
    ],
    totais: { bruto: opts.bruto, descontos: opts.bruto - opts.liquido, liquido: opts.liquido },
  }
  return { snapshot, hash: hashSnapshotSha256(snapshot) }
}
