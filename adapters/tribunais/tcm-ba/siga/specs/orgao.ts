import type { ArquivoSpec } from "../tipos.js";

/**
 * Órgãos — arquivo 38, ORCAMENTO, ordem 1. 101 bytes. Total do manual CONFERE.
 *
 * ⚠️ O MANUAL EXIGE AO MENOS DOIS ÓRGÃOS: um Legislativo e um Executivo. Um município que enviar
 * só o Executivo tem a remessa recusada — e a mensagem do Tribunal não diz qual falta. O validador
 * cobra isso antes (SIGA-E018).
 *
 * ⚠️ `tp_poder` OCUPA 6 BYTES PARA UM VALOR DE 1 DÍGITO. Não é engano de transcrição: o campo é
 * numérico de largura 6, e como `N` alinha à direita com brancos, o "1" sai como "     1". Quem
 * assumir que a largura acompanha o domínio escreveria 1 byte e deslocaria o registro inteiro.
 *
 * ⚠️ DUAS TABELAS DE DOMÍNIO AUSENTES DO MANUAL v44:
 *   · `tp_Credito`   → "Tabela Tipo Crédito";
 *   · `tp_ordenador` → "Tabela Tipo Responsável".
 * Os campos são obrigatórios e não há lista de valores válidos. Preenchê-los por analogia seria
 * inventar domínio, que é o que o PATCH §4 proíbe — precisam vir do TCM antes da primeira remessa.
 */
export const SPEC_ORGAO: ArquivoSpec = {
  identificacao: "Orgao",
  numeroManual: 38,
  modulo: "ORCAMENTO",
  ordem: 1,
  totalBytes: 101,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "dt_Ano", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "cd_Orgao", tipo: "N", inicio: 9, fim: 12, obrigatorio: true },
    { nome: "de_Orgao", tipo: "AN", inicio: 13, fim: 62 },
    /** 1=Executivo-Prefeitura 2=Legislativo 3=Executivo-Outros 4=Executivo-Fundos. 6 bytes. */
    { nome: "tp_poder", tipo: "N", inicio: 63, fim: 68, obrigatorio: true },
    { nome: "cd_CPFOrdenador", tipo: "AN", inicio: 69, fim: 79, obrigatorio: true },
    /** ⚠️ Domínio "Tabela Tipo Crédito" AUSENTE do manual v44. */
    { nome: "tp_Credito", tipo: "AN", inicio: 80, fim: 80, obrigatorio: true },
    { nome: "dt_Iniciogestao", tipo: "D", inicio: 81, fim: 88 },
    /** ⚠️ Domínio "Tabela Tipo Responsável" AUSENTE do manual v44. */
    { nome: "tp_ordenador", tipo: "N", inicio: 89, fim: 90, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 91, fim: 100 },
  ],
};

/** O manual exige Executivo + Legislativo. Menos que isso, a remessa é recusada. */
export const MINIMO_ORGAOS_SIGA = 2;
/** `tp_poder` = 2 é o Legislativo — o que costuma faltar. */
export const TP_PODER_LEGISLATIVO = "2";
