import type { ArquivoSpec } from "../tipos.js";

/**
 * Receita Arrecadada — arquivo 196, INFORMES, ordem 10. 87 bytes. Total do manual CONFERE.
 *
 * ⚠️ O MANUAL DIZ "VALOR ACUMULADO POR DATA" — não é uma linha por arrecadação. A agregação é por
 * (item de receita, conta contábil, data), e `vl_Receita` traz a soma do dia. Mapear 1:1 a partir
 * de `ReceitaArrecadada` produziria N linhas onde o TCM espera uma, e o total do dia apareceria
 * multiplicado no relatório do Tribunal.
 *
 * ⚠️ `dt_AnoMes` E `dt_Receita` COEXISTEM, e não são redundantes: o primeiro é a COMPETÊNCIA da
 * remessa (aaaammm), o segundo é a DATA do fato (ddmmaaaa). Uma arrecadação de 31/03 informada na
 * competência 202603 tem os dois preenchidos e diferentes em formato.
 */
export const SPEC_REC_ARREC: ArquivoSpec = {
  identificacao: "RecArrec",
  numeroManual: 196,
  modulo: "INFORMES",
  ordem: 10,
  totalBytes: 87,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "cd_unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    /** O código NO TCM — de/para do EspRec (62). */
    { nome: "cd_ItemReceita", tipo: "N", inicio: 5, fim: 12, obrigatorio: true },
    /** A COMPETÊNCIA da remessa (aaaamm). */
    { nome: "dt_AnoMes", tipo: "N", inicio: 13, fim: 18, obrigatorio: true },
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 19, fim: 52, obrigatorio: true },
    /** Acumulado da DATA, não da arrecadação individual. */
    { nome: "vl_Receita", tipo: "V", inicio: 53, fim: 68, decimais: 2 },
    /** A DATA do fato (ddmmaaaa). */
    { nome: "dt_Receita", tipo: "D", inicio: 69, fim: 76, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 77, fim: 86 },
  ],
};
