import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";
import { POC_SAGRES } from "./sagres-poc";
import {
  lerFatosCadastroConta,
  lerFatosDotacao,
  lerFatosEmpenhos,
  lerFatosLiquidacao,
  lerFatosMovimentacao,
  lerFatosSaldoMensal,
} from "../../adapters/tribunais/tce-pb/sagres";
import {
  cadastroContaParaCaptura,
  dotacaoParaCaptura,
  empenhoParaCaptura,
  liquidacaoParaCaptura,
  montarEnvelope,
  movimentacaoParaCaptura,
  saldoMensalParaCaptura,
  submeterCaptura,
  totalDeSchemasOficiais,
  validarEnvelopeCaptura,
  type EntidadeCaptura,
  type ModoCaptura,
  type ResultadoSubmissao,
  type ViolacaoCaptura,
} from "../../adapters/tribunais/tce-pb/captura";
import { anoCivil } from "../../packages/datas/index";

export type { EntidadeCaptura, ModoCaptura } from "../../adapters/tribunais/tce-pb/captura";

/**
 * O TOTAL DE SCHEMAS OFICIAIS incorporados — para a tela AFIRMAR o número com lastro.
 * Contado do próprio arquivo de schemas (ver `totalDeSchemasOficiais` no M18), nunca digitado.
 */
export function contarSchemasOficiais(): number {
  return totalDeSchemasOficiais();
}

/**
 * PORTA — SAGRES Captura 2.0 (M18). A tela consome ISTO, nunca o domínio direto (grep trivalente).
 *
 * A MESMA massa da S1/S-massa vira JSON (F1: DTO único, duas serializações), valida contra o schema
 * OFICIAL (F2) e simula a submissão (F3, MOCK → SIMULATED). O que a tela mostra é o que ACONTECEU —
 * "Simulação executada · Transmissão externa NÃO realizada" (DIRETIVA §7).
 */

const TS_POC = "2026-07-19T10:00:00.000000"; // timestamp POC fixo — a prévia é determinística

/** Lê os fatos da massa POC e mapeia para elementos Captura, por entidade. */
async function elementosDaEntidade(entidade: EntidadeCaptura): Promise<Record<string, unknown>[]> {
  const prisma = cliente();
  const ug = POC_SAGRES.codUnidadeGestora;
  const cnpj = POC_SAGRES.cnpjGerenciadora;
  const dia = POC_SAGRES.dia;
  // ⚠️ O EXERCÍCIO DO FATO É O DO CALENDÁRIO DO ENTE.
  const exercicio = anoCivil(dia);
  switch (entidade) {
    case "dotacao":
      return (await lerFatosDotacao(prisma, { codUnidadeGestora: ug, exercicio })).map((f) => dotacaoParaCaptura(f));
    case "empenhos":
      return (await lerFatosEmpenhos(prisma, { codUnidadeGestora: ug, dia })).map((f) => empenhoParaCaptura(f));
    case "liquidacao":
      return (await lerFatosLiquidacao(prisma, { codUnidadeGestora: ug, dia })).map((f) => liquidacaoParaCaptura(f));
    case "cadastroConta":
      return (await lerFatosCadastroConta(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj })).map((f) => cadastroContaParaCaptura(f));
    case "saldoMensal":
      return (await lerFatosSaldoMensal(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: cnpj, competencia: dia })).map((f) => saldoMensalParaCaptura(f));
    case "movimentacao":
      return (await lerFatosMovimentacao(prisma, { codUnidadeGestora: ug, dia })).map((f) => movimentacaoParaCaptura(f));
  }
}

export const ENTIDADES_UI: readonly { readonly chave: EntidadeCaptura; readonly rotulo: string }[] = [
  { chave: "dotacao", rotulo: "Dotações" },
  { chave: "empenhos", rotulo: "Empenhos" },
  { chave: "liquidacao", rotulo: "Liquidações" },
  { chave: "cadastroConta", rotulo: "Contas Bancárias" },
  { chave: "saldoMensal", rotulo: "Saldos Mensais" },
  { chave: "movimentacao", rotulo: "Transferências Bancárias" },
];

export interface PreviewEntidadeCaptura {
  readonly entidade: EntidadeCaptura;
  readonly rotulo: string;
  readonly registros: number;
  /** O JSON Captura 2.0 (envelope), formatado. */
  readonly json: string;
  readonly violacoes: readonly ViolacaoCaptura[];
}

/** Gera o JSON de cada entidade a partir da massa POC e valida contra o schema oficial (leitura). */
export async function montarPreviewCaptura(): Promise<readonly PreviewEntidadeCaptura[]> {
  await exigirSessao();
  const saida: PreviewEntidadeCaptura[] = [];
  for (const { chave, rotulo } of ENTIDADES_UI) {
    const elementos = await elementosDaEntidade(chave);
    const envelope = montarEnvelope(elementos, TS_POC);
    saida.push({
      entidade: chave,
      rotulo,
      registros: elementos.length,
      json: JSON.stringify(envelope, null, 2),
      violacoes: validarEnvelopeCaptura(chave, envelope),
    });
  }
  return saida;
}

/** SIMULA a submissão de uma entidade (MOCK → SIMULATED). Mutação: o serviço cobra SUBMETER_CAPTURA. */
export async function simularSubmissaoCaptura(entidade: EntidadeCaptura, modo: ModoCaptura = "MOCK"): Promise<ResultadoSubmissao> {
  const ident = (await exigirSessao()).identificador;
  const elementos = await elementosDaEntidade(entidade);
  return submeterCaptura(cliente(), { entidade, elementos, modo, criadoPor: ident, timestamp: TS_POC });
}

export interface ExecucaoResumo {
  readonly correlationId: string;
  readonly entidade: string;
  readonly modo: string;
  readonly estado: string;
  readonly simulationId: string | null;
  readonly hashPayload: string;
  readonly quando: Date;
}

/** As submissões recentes — a linha do tempo/histórico da tela (leitura). */
export async function ultimasExecucoesCaptura(limite = 10): Promise<readonly ExecucaoResumo[]> {
  await exigirSessao();
  const rows = await cliente().execucaoCaptura.findMany({ orderBy: { criadoEm: "desc" }, take: limite });
  return rows.map((r) => ({
    correlationId: r.correlationId,
    entidade: r.entidade,
    modo: r.modo,
    estado: r.estado,
    simulationId: r.simulationId,
    hashPayload: r.hashPayload,
    quando: r.criadoEm,
  }));
}
