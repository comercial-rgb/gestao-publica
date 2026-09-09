import type { ArquivoSpec } from "../tipos.js";

/**
 * Itens de Receita — arquivo 62, ORCAMENTO, ordem 5. 86 bytes. Total do manual CONFERE.
 *
 * ⚠️ MESMO PADRÃO DE DE/PARA DO `Fonte` (27): dois códigos no mesmo registro.
 *   · `cd_ItemReceita`       — o código do TCM-BA;
 *   · `cd_ItemReceitaGestor` — o código INTERNO do município.
 * Este arquivo ensina a correspondência; trocá-los faz toda a arrecadação seguinte apontar para o
 * item errado, e o TCM aceita porque os dois são numéricos de 8 dígitos.
 *
 * ⚠️ `cd_receblanc` É `AN`, NÃO `N` — e isso é do manual, não descuido. O domínio é "1"/"2"
 * (Sim/Não), o que convida a tipá-lo como numérico; mas `N` alinharia à direita com BRANCOS e
 * `AN` alinha à esquerda. Em campo de 1 byte o resultado seria o mesmo hoje — e deixaria de ser
 * no dia em que alguém copiasse a spec para um campo mais largo. Mantido como o manual declara.
 *
 * ⚠️ A LISTA OFICIAL (Res. TCM 1293/10) NÃO ESTÁ NO MANUAL v44.
 */
export const SPEC_ESP_REC: ArquivoSpec = {
  identificacao: "EspRec",
  numeroManual: 62,
  modulo: "ORCAMENTO",
  ordem: 5,
  totalBytes: 86,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    /** O código INTERNO do município. */
    { nome: "cd_ItemReceitaGestor", tipo: "N", inicio: 5, fim: 12, obrigatorio: true },
    { nome: "de_ItemReceita", tipo: "AN", inicio: 13, fim: 62 },
    /** O código NO TCM (Res. 1293/10 — lista ausente do manual v44). */
    { nome: "cd_ItemReceita", tipo: "N", inicio: 63, fim: 70, obrigatorio: true },
    { nome: "dt_ano", tipo: "N", inicio: 71, fim: 74, obrigatorio: true },
    /** 1=Sim 2=Não. `AN` por declaração do manual — ver o docblock. */
    { nome: "cd_receblanc", tipo: "AN", inicio: 75, fim: 75, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 76, fim: 85 },
  ],
};
