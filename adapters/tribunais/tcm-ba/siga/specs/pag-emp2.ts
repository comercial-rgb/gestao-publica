import type { ArquivoSpec } from "../tipos.js";

/**
 * PagEmp2 — arquivo 101, módulo INFORMES, ordem 19. 141 bytes.
 *
 * O pagamento do empenho. É o `PagEmp2` (não o `PagEmp`) porque este é o layout que carrega a
 * conta contábil e o detalhamento do meio de pagamento.
 *
 * ⚠️ `vl_Pagamento` É O VALOR LÍQUIDO — já descontadas as retenções. Isto o distingue do
 * `vl_Liquidacao` (BRUTO) do LiqEmp: os dois campos têm a mesma largura e o mesmo tipo, e trocá-los
 * produz um arquivo válido cujo valor pago não fecha com a liquidação. As retenções vão no
 * PagRetencao (arquivo próprio, fora deste caminho crítico). Aceita negativo (estorno).
 *
 * ⚠️ `dt_Ano` NO PAGAMENTO DE RESTOS A PAGAR É O ANO DE ORIGEM DO EMPENHO, não o exercício
 * corrente. Um RP de 2025 pago em 2026 leva `2025` aqui. Preencher com o ano corrente faria o TCM
 * procurar um empenho que não existe naquele exercício — e o registro seria recusado por
 * inconsistência de referência, um erro que só aparece do lado deles.
 *
 * ⚠️ `nu_EmpenhoSup`: quando NÃO há subempenho, repete-se o próprio número do empenho. Deixar em
 * branco não é o mesmo que repetir.
 */
export const SPEC_PAG_EMP2: ArquivoSpec = {
  identificacao: "PagEmp2",
  numeroManual: 101,
  modulo: "INFORMES",
  ordem: 19,
  totalBytes: 141,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0 },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_UnidadeOrcamentaria", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "nu_Empenho", tipo: "N", inicio: 9, fim: 18, obrigatorio: true },
    { nome: "dt_PagamentoEmpenho", tipo: "D", inicio: 19, fim: 26, obrigatorio: true },
    /** ⚠️ Para RP: o ano de ORIGEM do empenho. Ver o docblock. */
    { nome: "dt_Ano", tipo: "N", inicio: 27, fim: 30, obrigatorio: true },
    {
      nome: "vl_Pagamento",
      tipo: "V",
      inicio: 31,
      fim: 46,
      decimais: 2,
      permiteNegativo: true,
      obrigatorio: true,
    },
    /** O código da conta NO TCM — depende de `DeParaContaSiga`, como o ContaCont. */
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 47, fim: 80, obrigatorio: true },
    /** 1=Cheque 2=Ordem 3=TED 4=DOC 5=Débito. */
    { nome: "tp_Pagamento", tipo: "N", inicio: 81, fim: 81, obrigatorio: true },
    /** O nº do cheque/TED/DOC — o detalhamento do meio escolhido em tp_Pagamento. */
    { nome: "de_DetalheTipoPagto", tipo: "N", inicio: 82, fim: 89 },
    { nome: "nu_Processo", tipo: "N", inicio: 90, fim: 109 },
    { nome: "dt_AnoMes", tipo: "N", inicio: 110, fim: 115, obrigatorio: true },
    { nome: "cd_Orgao", tipo: "N", inicio: 116, fim: 119, obrigatorio: true },
    /** Sem subempenho, REPETE o nu_Empenho — branco não equivale. */
    { nome: "nu_EmpenhoSup", tipo: "N", inicio: 120, fim: 129, obrigatorio: true },
    /** "1"=não é Resto a Pagar, "2"=é Resto a Pagar. */
    { nome: "st_RestoPagar", tipo: "AN", inicio: 130, fim: 130, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 131, fim: 140 },
  ],
};
