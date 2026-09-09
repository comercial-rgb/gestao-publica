import type { ArquivoSpec } from "../tipos.js";

/**
 * Movimento Contábil — arquivo 32, INFORMES, ordem 12. 97 bytes.
 *
 * ═══ ⚠️ SPEC INCOMPLETA — NÃO GERÁVEL. ═══
 * O `origemSpec` termina em `-INCOMPLETO`, e isso NÃO é anotação: o `montarPacoteSiga` RECUSA
 * gerar qualquer spec assim marcada, e o validador emite SIGA-E014. A geometria está conferida e
 * fecha; o que falta é DOMÍNIO, e domínio faltante não se contorna com um valor plausível.
 *
 * ⚠️ (1) O TOTAL DO MANUAL ESTÁ ERRADO. Ele declara 96; o último campo termina na posição 96 e as
 * posições são 0-based, logo a contagem é 97. É o mesmo off-by-one do UnidOrca (66).
 *
 * ⚠️ (2) `tp_MovContabil` APONTA PARA A "Tabela Tipo Movimento Contábil", QUE NÃO CONSTA DO
 * MANUAL v44. O campo é obrigatório e de 1 byte. Chutar um valor aqui classificaria TODO o
 * movimento contábil do mês numa categoria inventada — e o TCM aceitaria o arquivo, porque
 * qualquer dígito cabe. É por isso que a spec inteira fica bloqueada, e não só o campo.
 *
 * ═══ ⚠️ (3) A SEMÂNTICA NÃO É "UMA LINHA POR PARTIDA" ═══
 * Este arquivo é AGREGAÇÃO MENSAL: uma linha por (conta contábil, tp_MovContabil, competência,
 * nu_sequencialTC), com o valor ACUMULADO no mês. Quem o implementar precisa de um `groupBy` sobre
 * `PartidaContabil` — não de um `map`.
 *
 * E o resultado tem de fechar DÉBITO = CRÉDITO por subsistema, ou o TCM recusa a remessa em bloco.
 * O repositório já tem `assertBalanced` (packages/contracts) para essa conferência; o alerta
 * SIGA-A008 existe para acusar o desequilíbrio ANTES do envio, não depois da recusa.
 */
export const SPEC_MOV_CONTA: ArquivoSpec = {
  identificacao: "MovConta",
  numeroManual: 32,
  modulo: "INFORMES",
  ordem: 12,
  // O manual diz 96. A soma das larguras diz 97, e a soma é o fato.
  totalBytes: 97,
  // ⚠️ O sufixo BLOQUEIA a geração — ver `SPECS_INCOMPLETAS` em `specs/index.ts`.
  origemSpec: "manual-v44-2014-INCOMPLETO",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "dt_AnoCriacao", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "cd_ContaContabil", tipo: "AN", inicio: 9, fim: 42, obrigatorio: true },
    /** ⚠️ DOMÍNIO AUSENTE do manual v44 — é este campo que bloqueia o arquivo inteiro. */
    { nome: "tp_MovContabil", tipo: "N", inicio: 43, fim: 43, obrigatorio: true },
    { nome: "dt_AnoMes", tipo: "N", inicio: 44, fim: 49, obrigatorio: true },
    /** Valor ACUMULADO no mês, não da partida individual. */
    { nome: "vl_Debito", tipo: "V", inicio: 50, fim: 65, decimais: 2 },
    { nome: "vl_Credito", tipo: "V", inicio: 66, fim: 81, decimais: 2 },
    /** O sequencial da conta no TCM — de `DeParaContaSiga.sequencialTcm`. */
    { nome: "nu_sequencialTC", tipo: "N", inicio: 82, fim: 86, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 87, fim: 96 },
  ],
};
