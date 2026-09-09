import type { ArquivoSpec } from "../tipos.js";

/**
 * Estorno de Receita Arrecadada — arquivo 197, INFORMES, ordem 11. 95 bytes. Manual CONFERE.
 *
 * ⚠️ REGRA DO MANUAL: `vl_Estorno` NÃO PODE EXCEDER O SALDO do lançamento estornado.
 *
 * Isso casa exatamente com o invariante que este repositório já defende no banco
 * (`prisma/sql/uq_estorno_receita_unico.sql` e a doutrina de estorno do M01/M04): estorno é
 * append-only e limitado ao saldo. A validação prévia (SIGA-E022) existe para que a recusa
 * aconteça AQUI, nomeando a receita, e não do lado do Tribunal com mensagem genérica.
 *
 * ⚠️ TRÊS DATAS NO MESMO REGISTRO, e confundi-las inverte o sentido do estorno:
 *   · `dt_AnoMes`   — a COMPETÊNCIA da remessa (aaaamm);
 *   · `dt_Receita`  — a data do fato ORIGINAL, que identifica o que está sendo estornado;
 *   · `dt_Estorno`  — a data do estorno em si.
 * Trocar `dt_Receita` por `dt_Estorno` faria o TCM procurar uma arrecadação que não existe naquela
 * data — e o registro seria recusado por referência, um erro que só aparece do lado deles.
 */
export const SPEC_ESTOR_REC: ArquivoSpec = {
  identificacao: "EstorRec",
  numeroManual: 197,
  modulo: "INFORMES",
  ordem: 11,
  totalBytes: 95,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "cd_unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_ItemReceita", tipo: "N", inicio: 5, fim: 12, obrigatorio: true },
    /** A COMPETÊNCIA da remessa (aaaamm). */
    { nome: "dt_AnoMes", tipo: "N", inicio: 13, fim: 18, obrigatorio: true },
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 19, fim: 52, obrigatorio: true },
    /** ⚠️ A data do fato ORIGINAL — é ela que identifica o que se estorna. */
    { nome: "dt_Receita", tipo: "D", inicio: 53, fim: 60, obrigatorio: true },
    /** Não pode exceder o saldo do lançamento estornado (SIGA-E022). */
    { nome: "vl_Estorno", tipo: "V", inicio: 61, fim: 76, decimais: 2 },
    /** ⚠️ A data do ESTORNO, não a do fato original. */
    { nome: "dt_Estorno", tipo: "D", inicio: 77, fim: 84, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 85, fim: 94 },
  ],
};
