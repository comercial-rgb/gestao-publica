import type {
  CadastroContaFato,
  DotacaoFato,
  EmpenhoFato,
  LiquidacaoFato,
  MovimentacaoFato,
  SaldoMensalFato,
} from "../sagres/index.js";
import { NATUREZA_CONTRATACAO_SAGRES, TIPO_EMPENHO_SAGRES } from "../sagres/index.js";

/**
 * CAPTURA 2.0 (M18) — a MESMA massa, OUTRA serialização.
 *
 * ⚠️ DOUTRINA DO DONO ÚNICO, APLICADA AO FUTURO (F1). O TXT (SAGRES 2026, M15) e o JSON (Captura 2.0)
 * são DUAS SERIALIZAÇÕES do MESMO DTO — os `*Fato` que a registry da S1 produz. Não há aritmética
 * nova no caminho JSON: cada campo já existe no DTO; aqui só se traduz o NOME (cod* → codigo*), o
 * FORMATO (valor string-vírgula do TXT → number do JSON; exercícioFonte 1/2 → enum ATUAL/ANTERIOR) e
 * a ESTRUTURA (envelope `{ timestamp, elementos: [...] }`). A migração para o Captura 2.0 em 2027 não
 * reescreve o motor — troca a serialização.
 *
 * Fonte dos schemas: `captura20-entidades-contabilidade.html` (JSON Schema draft 2020-12 oficial,
 * extraído para `schemas-captura-2026.json`, sha256 no MANIFEST). Nada inventado (PATCH §4).
 */

export type AcaoCaptura = "CREATE" | "UPDATE" | "DELETE";

/** Código numérico com a largura EXATA que o schema exige (minLength=maxLength): só dígitos, zeros à esq. */
function cod(v: string, tamanho: number): string {
  return v.replace(/\D/g, "").padStart(tamanho, "0");
}

/** Money → number JSON (o schema pede `number`, não a string-vírgula do TXT). */
function num(v: { toFixed(casas: number): string }): number {
  return Number(v.toFixed(2));
}

// ── Os 6 mapeadores: DTO da S1 → elemento Captura 2.0 (com os nomes/format oficiais). ──

export function dotacaoParaCaptura(f: DotacaoFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  return {
    codigoUnidadeGestora: cod(f.codUnidadeGestora, 6),
    codigoUnidadeOrcamentaria: cod(f.codUnidadeOrcamentaria, 5),
    codigoFuncao: cod(f.codFuncao, 2),
    codigoSubfuncao: cod(f.codSubfuncao, 3),
    codigoPrograma: cod(f.codPrograma, 4),
    codigoAcao: cod(f.codAcao, 4),
    codigoCategoriaEconomica: cod(f.codCategoriaEconomica, 1),
    codigoNaturezaDespesa: cod(f.codNaturezaDespesa, 1),
    codigoModalidadeDespesa: cod(f.codModalidadeDespesa, 2),
    codigoElementoDespesa: cod(f.codElementoDespesa, 2),
    exercicioFonteRecurso: f.exercicioFonteRecurso === 1 ? "ATUAL" : "ANTERIOR",
    codigoFonteRecurso: cod(f.codFonteRecurso, 3),
    valorDotacao: num(f.valor),
    action,
  };
}

export function empenhoParaCaptura(f: EmpenhoFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  const e: Record<string, unknown> = {
    codigoUnidadeOrcamentaria: cod(f.codUnidadeOrcamentaria, 5),
    numeroEmpenho: cod(f.numEmpenho, 7),
    tipoEmpenho: TIPO_EMPENHO_SAGRES[f.tipoEmpenho],
    valorEmpenho: num(f.valor),
    codigoFuncao: cod(f.codFuncao, 2),
    codigoSubfuncao: cod(f.codSubfuncao, 3),
    codigoPrograma: cod(f.codPrograma, 4),
    codigoAcao: cod(f.codAcao, 4),
    codigoCategoriaEconomica: cod(f.codCategoriaEconomica, 1),
    codigoNaturezaDespesa: cod(f.codNaturezaDespesa, 1),
    codigoModalidadeDespesa: cod(f.codModalidadeDespesa, 2),
    codigoElementoDespesa: cod(f.codElementoDespesa, 2),
    codigoSubelementoDespesa: cod(f.codSubelemento ?? "", 3),
    exercicioFonteRecurso: f.exercicioFonteRecurso === 1 ? "ATUAL" : "ANTERIOR",
    codigoFonteRecurso: cod(f.codFonteRecurso, 3),
    codigoNaturezaContratacao: NATUREZA_CONTRATACAO_SAGRES[f.naturezaContratacao],
    historico: f.historico,
    cpfCnpjCredor: f.credorCpfCnpj.replace(/\D/g, ""),
    // cpfOrdenador é OBRIGATÓRIO no schema, mas não há origem por-empenho (ver M15/matriz). Quando
    // ausente, é omitido — e o validador (F2) o acusa, honestamente, como o TXT já acusa.
    ...(f.cpfOrdenador !== null ? { cpfOrdenador: cod(f.cpfOrdenador, 11) } : {}),
    ...(f.co !== null ? { codigoCO: cod(f.co, 4) } : {}),
    action,
  };
  return e;
}

export function liquidacaoParaCaptura(f: LiquidacaoFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  const l: Record<string, unknown> = {
    codigoUnidadeOrcamentaria: cod(f.codUnidadeOrcamentaria, 5),
    numeroEmpenho: cod(f.numEmpenho, 7),
    numeroLiquidacao: cod(f.numero, 7),
    valorLiquidacao: num(f.valor),
    action,
  };
  if (f.notaFiscal !== null) {
    l["tipoNotaFiscal"] = cod(f.notaFiscal.tipo, 2);
    l["numeroChaveNotaFiscal"] = f.notaFiscal.chave.replace(/\D/g, "");
    l["numeroNotaFiscal"] = f.notaFiscal.numero;
    l["serieNotaFiscal"] = f.notaFiscal.serie;
    l["valorNotaFiscal"] = num(f.notaFiscal.valor);
  }
  return l;
}

export function cadastroContaParaCaptura(f: CadastroContaFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  return {
    numeroContaBancaria: f.numeroConta,
    codigoBancoContaBancaria: cod(f.banco, 3),
    numeroAgenciaContaBancaria: f.numeroAgencia,
    descricaoContaBancaria: f.descricao,
    tipoContaBancaria: cod(f.tipo, 1),
    cnpjGerenciaContaBancaria: f.cnpjGerencia.replace(/\D/g, ""),
    action,
  };
}

export function saldoMensalParaCaptura(f: SaldoMensalFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  return {
    numeroContaBancaria: f.numeroConta,
    numeroAgenciaContaBancaria: f.numeroAgencia,
    codigoBancoContaBancaria: cod(f.banco, 3),
    valorSaldoMensal: num(f.valor),
    tipoContaBancaria: cod(f.tipo, 1),
    cnpjGerenciaContaBancaria: f.cnpjGerencia.replace(/\D/g, ""),
    action,
  };
}

export function movimentacaoParaCaptura(f: MovimentacaoFato, action: AcaoCaptura = "CREATE"): Record<string, unknown> {
  return {
    codigoBancoContaBancariaOrigem: cod(f.codBancoOrigem, 3),
    numeroAgenciaContaBancariaOrigem: cod(f.numAgenciaOrigem, 6),
    numeroContaBancariaOrigem: cod(f.numeroCtaOrigem, 13),
    tipoContaBancariaOrigem: cod(f.tipoCtaOrigem, 1),
    codigoBancoContaBancariaDestino: cod(f.codBancoDestino, 3),
    numeroAgenciaContaBancariaDestino: cod(f.numAgenciaDestino, 6),
    numeroContaBancariaDestino: cod(f.numeroCtaDestino, 13),
    tipoContaBancariaDestino: cod(f.tipoCtaDestino, 1),
    valorTransferencia: num(f.valor),
    codigoMovimentacao: cod(f.codigo, 7),
    action,
  };
}

/** O ENVELOPE Captura 2.0: `{ timestamp, elementos: [...] }`. O timestamp é INJETADO (determinismo). */
export interface EnvelopeCaptura {
  readonly timestamp: string;
  readonly elementos: readonly Record<string, unknown>[];
}

export function montarEnvelope(elementos: readonly Record<string, unknown>[], timestamp: string): EnvelopeCaptura {
  return { timestamp, elementos };
}
