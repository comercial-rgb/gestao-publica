import type { RotaTce } from "./contrato.js";

/**
 * FIXTURES DO MOCK (F2) — retorno SINTÉTICO da API de consulta, CONFORME ao schema oficial (o teste
 * valida contra `contrato.ts`; fixture que viola o contrato não passa). Coerentes com a massa POC
 * (mesma UG 999001, mesmos períodos e valores) — EXCETO uma DIVERGÊNCIA PROPOSITAL: o empenho nº 1
 * volta com valor 50000.50 (o local é 50000.00), para a comparação "dados locais × TCE" ter o que
 * mostrar. Nenhum dado real.
 */

/** O empenho nº 1 da massa POC, como o TCE o "devolveria" — com o valor PROPOSITALMENTE divergente. */
const EMPENHOS_POC: readonly Record<string, unknown>[] = [
  {
    codUnidadeGestora: "999001",
    codUnidadeOrcamentaria: "02001",
    anoEmissao: 2026,
    numero: 1,
    dotacao: {
      codFuncao: "04", codSubFuncao: "122", codPrograma: "0001", codAcao: "2001",
      codCategoriaEconomica: "3", codNaturezaDespesa: 3, codModalidadeDespesa: 90, codElementoDespesa: "39", tipoFonteRecurso: 1,
    },
    codSubElemento: "040",
    licitacao: { numero: "000000000", modalidade: 9 },
    tipo: 1,
    competencia: "2026-07-10",
    valor: 50000.5, // ⚠️ DIVERGÊNCIA PROPOSITAL — o local é 50000.00
    historico: "Empenho de servicos - POC",
    cpfCnpjFornecedor: "12345678000199",
    numeroObra: "00000000",
    cpfOrdenador: "11144477735",
    co: { codigo: "1001", descricao: "Acompanhamento POC" },
    naturezaContratacao: { codigo: "3", descricao: "Prestacao de Servicos" },
  },
];

const DOTACOES_POC: readonly Record<string, unknown>[] = [
  { codFuncao: "04", codSubFuncao: "122", codPrograma: "0001", codAcao: "2001", codCategoriaEconomica: "3", codNaturezaDespesa: 3, codModalidadeDespesa: 90, codElementoDespesa: "39", tipoFonteRecurso: 1 },
];

const PAGAMENTOS_POC: readonly Record<string, unknown>[] = [
  { codUnidadeGestora: "999001", codUnidadeOrcamentaria: "02001", anoEmissaoEmpenho: 2026, numEmpenho: 1, numero: 1, competencia: "2026-07-14", valor: 50000.0, codBancoDebito: "001", numAgenciaDebito: "1234", numContaDebito: "11111", tipoContaDebito: 1, tipoFonteRecurso: 1 },
];

const FIXTURES: Record<RotaTce, readonly Record<string, unknown>[]> = {
  empenhos: EMPENHOS_POC,
  dotacoes: DOTACOES_POC,
  pagamentos: PAGAMENTOS_POC,
};

/** Os registros sintéticos de uma rota, filtrados pela UG (o MOCK respeita o filtro obrigatório). */
export function fixturasDaRota(rota: RotaTce, codUnidadeGestora: string): readonly Record<string, unknown>[] {
  return FIXTURES[rota].filter((r) => r["codUnidadeGestora"] === undefined || r["codUnidadeGestora"] === codUnidadeGestora);
}
