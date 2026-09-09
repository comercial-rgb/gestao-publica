import type { ArquivoSpec } from "../tipos.js";

/**
 * LiqEmp — arquivo 29, módulo INFORMES, ordem 18. 77 bytes.
 *
 * ═══ ⚠️ A ORDEM DOS CAMPOS AQUI É DIFERENTE DE TODOS OS OUTROS ARQUIVOS ═══
 * Em Empenho e PagEmp2 a sequência é `cd_Unidade` → `cd_UnidadeOrcamentaria` → `nu_Empenho`.
 * Aqui é `cd_UnidadeOrcamentaria` → `nu_Empenho` → `cd_Unidade`: a unidade ORÇAMENTÁRIA vem
 * primeiro e a unidade GESTORA vem depois do número do empenho.
 *
 * Isso não é erro de transcrição — é o layout. E é a armadilha perfeita, porque os três campos são
 * numéricos e de larguras parecidas: trocá-los produz um arquivo com o tamanho certo, sem nenhum
 * erro de formatação, apontando para a unidade errada. Nunca assuma ordem uniforme entre arquivos
 * do SIGA; leia a spec.
 *
 * ⚠️ `vl_Liquidacao` É O VALOR BRUTO e ACEITA NEGATIVO — a anulação de liquidação entra como
 * valor negativo. É por isso que `permiteNegativo: true` está aqui e NÃO está no `vl_Dotacao`.
 *
 * ⚠️ REGRA DE NEGÓCIO (não expressável na spec): se a Liquidação for enviada para um Empenho, o
 * Subempenho NÃO deve ser enviado para o mesmo Empenho. Os dois juntos duplicam a despesa.
 */
export const SPEC_LIQ_EMP: ArquivoSpec = {
  identificacao: "LiqEmp",
  numeroManual: 29,
  modulo: "INFORMES",
  ordem: 18,
  totalBytes: 77,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0 },
    // ⚠️ ORDEM INVERTIDA — ver o docblock. A orçamentária vem ANTES do número do empenho.
    { nome: "cd_UnidadeOrcamentaria", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "nu_Empenho", tipo: "N", inicio: 5, fim: 14, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 15, fim: 18, obrigatorio: true },
    { nome: "dt_Liquidacao", tipo: "D", inicio: 19, fim: 26, obrigatorio: true },
    {
      nome: "vl_Liquidacao",
      tipo: "V",
      inicio: 27,
      fim: 42,
      decimais: 2,
      permiteNegativo: true,
      obrigatorio: true,
    },
    { nome: "dt_Ano", tipo: "N", inicio: 43, fim: 46, obrigatorio: true },
    { nome: "dt_AnoMes", tipo: "N", inicio: 47, fim: 52, obrigatorio: true },
    { nome: "cd_Orgao", tipo: "N", inicio: 53, fim: 56, obrigatorio: true },
    { nome: "reservado_tcm_1", tipo: "N", inicio: 57, fim: 66, literal: "0000000000" },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 67, fim: 76 },
  ],
};
