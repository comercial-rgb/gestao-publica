import type { ArquivoSpec } from "../tipos.js";

/**
 * Fonte de Recurso — arquivo 27, BASICOS, ordem 2. 107 bytes. Total do manual CONFERE.
 *
 * ⚠️ DOIS CÓDIGOS DE FONTE NO MESMO REGISTRO, e confundi-los inverte o de/para:
 *   · `cd_Fonte`       — o código do TCM-BA (vem de `DeParaFonteSiga.codigoTcmBa`);
 *   · `cd_FonteGestor` — o código INTERNO do município (`FonteRecurso.codigo`).
 * É este arquivo que ENSINA ao Tribunal a correspondência entre os dois. Trocá-los faria toda a
 * execução seguinte referenciar a fonte errada — e o TCM aceitaria, porque os dois são numéricos.
 *
 * ⚠️ A LISTA OFICIAL DE CÓDIGOS (Res. TCM 1268/08) NÃO ESTÁ NO MANUAL v44. Sem ela não há como
 * conferir se um `cd_Fonte` cadastrado existe de fato — o validador só consegue cobrar que o
 * de/para esteja preenchido, não que esteja CERTO.
 */
export const SPEC_FONTE: ArquivoSpec = {
  identificacao: "Fonte",
  numeroManual: 27,
  modulo: "BASICOS",
  ordem: 2,
  totalBytes: 107,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    /** O código NO TCM — de `DeParaFonteSiga.codigoTcmBa`. */
    { nome: "cd_Fonte", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    /** O código INTERNO do município — de `FonteRecurso.codigo`. */
    { nome: "cd_FonteGestor", tipo: "N", inicio: 9, fim: 12, obrigatorio: true },
    { nome: "de_Fonte", tipo: "AN", inicio: 13, fim: 92 },
    { nome: "dt_Ano", tipo: "N", inicio: 93, fim: 96, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 97, fim: 106 },
  ],
};
