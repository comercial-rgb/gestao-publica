import type { ArquivoSpec } from "../tipos.js";

/**
 * Itens de Despesa — arquivo 61, ORCAMENTO, ordem 6. 136 bytes. Total do manual CONFERE.
 *
 * ⚠️ DE/PARA DO ELEMENTO DE DESPESA, mesmo padrão do `Fonte` (27) e do `EspRec` (62):
 *   · `cd_Elemento`       — o código do TCM-BA;
 *   · `cd_ElementoGestor` — o código INTERNO do município.
 *
 * ⚠️ A ORDEM DOS DOIS É INVERTIDA EM RELAÇÃO AO `EspRec`. No EspRec o código do GESTOR vem antes
 * (5–12) e o do TCM depois (63–70); aqui o do gestor vem em 5–12 e o do TCM logo em seguida,
 * 13–20. Não há regra: cada arquivo do SIGA ordena como quer. Ler a spec, nunca supor simetria.
 *
 * ⚠️ A LISTA OFICIAL (Res. TCM 1293/10) NÃO ESTÁ NO MANUAL v44.
 */
export const SPEC_ESP_DESP: ArquivoSpec = {
  identificacao: "EspDesp",
  numeroManual: 61,
  modulo: "ORCAMENTO",
  ordem: 6,
  totalBytes: 136,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    /** O código INTERNO do município. */
    { nome: "cd_ElementoGestor", tipo: "N", inicio: 5, fim: 12, obrigatorio: true },
    /** O código NO TCM (Res. 1293/10 — lista ausente do manual v44). */
    { nome: "cd_Elemento", tipo: "N", inicio: 13, fim: 20, obrigatorio: true },
    { nome: "de_ElementoGestor", tipo: "AN", inicio: 21, fim: 120 },
    { nome: "dt_ano", tipo: "N", inicio: 121, fim: 124, obrigatorio: true },
    /** 1=Sim 2=Não. `AN` por declaração do manual, como no EspRec. */
    { nome: "cd_receblanc", tipo: "AN", inicio: 125, fim: 125, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 126, fim: 135 },
  ],
};
