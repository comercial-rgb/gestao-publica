import type { ArquivoSpec } from "../tipos.js";

/**
 * Projeto/Atividade — arquivo 50, ORCAMENTO, ordem 4. 655 bytes. Total do manual CONFERE.
 *
 * ═══ ⚠️ AQUI OS NOMES MENTEM (ver `siga/hierarquia.ts`) ═══
 *   · `cd_Programa`    recebe a **SUBFUNÇÃO**;
 *   · `cd_SubPrograma` recebe o **PROGRAMA**.
 *
 * Preencher pelo nome produz um arquivo estruturalmente PERFEITO com a classificação funcional
 * trocada — o TCM aceita, nenhum teste de geometria acusa, e o erro aparece meses depois num
 * relatório do Tribunal com a despesa na função errada.
 *
 * O único caminho autorizado é `camposHierarquiaSiga({ funcao, subfuncao, programa })`, e o
 * `hierarquia.test.ts` recusa qualquer atribuição direta destes dois campos.
 *
 * ⚠️ DOMÍNIO AUSENTE: `tp_ProjetoAtividade` aponta para a "Tabela Projeto/Atividade", que NÃO
 * consta do manual v44. O campo é obrigatório aqui, no Dotacao (22) e no Empenho (23).
 */
export const SPEC_PROJ_ATV: ArquivoSpec = {
  identificacao: "ProjAtv",
  numeroManual: 50,
  modulo: "ORCAMENTO",
  ordem: 4,
  totalBytes: 655,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0, literal: "1" },
    { nome: "dt_Ano", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Unidade", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    /** ⚠️ Domínio "Tabela Projeto/Atividade" AUSENTE do manual v44. */
    { nome: "tp_ProjetoAtividade", tipo: "N", inicio: 9, fim: 9, obrigatorio: true },
    { nome: "nu_ProjetoAtividade", tipo: "N", inicio: 10, fim: 13, obrigatorio: true },
    { nome: "de_ProjetoAtividade", tipo: "AN", inicio: 14, fim: 268 },
    { nome: "de_ObjetivoProjetoAtividade", tipo: "AN", inicio: 269, fim: 388 },
    { nome: "reservado_tcm_1", tipo: "N", inicio: 389, fim: 394, literal: "000000" },
    { nome: "cd_Funcao", tipo: "N", inicio: 395, fim: 396, obrigatorio: true },
    /** ⚠️ RECEBE A SUBFUNÇÃO — use `camposHierarquiaSiga`. */
    { nome: "cd_Programa", tipo: "N", inicio: 397, fim: 400, obrigatorio: true },
    /** ⚠️ RECEBE O PROGRAMA — use `camposHierarquiaSiga`. */
    { nome: "cd_SubPrograma", tipo: "N", inicio: 401, fim: 404, obrigatorio: true },
    { nome: "de_UniMed", tipo: "AN", inicio: 405, fim: 524 },
    { nome: "de_Meta", tipo: "AN", inicio: 525, fim: 644 },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 645, fim: 654 },
  ],
};
