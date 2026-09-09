import type { ArquivoSpec } from "../tipos.js";

/**
 * ═══ ⚠️ OS NOMES DA HIERARQUIA MENTEM NESTE ARQUIVO ═══
 * `cd_Programa` recebe a **SUBFUNÇÃO** e `cd_SubPrograma` recebe o **PROGRAMA**. Preencher pelo
 * nome gera um arquivo estruturalmente perfeito com a classificação funcional trocada, que o TCM
 * ACEITA — o erro só aparece num relatório do Tribunal meses depois. Ver `siga/hierarquia.ts`, que
 * é o único caminho autorizado para estes campos.
 *
 * Dotacao — arquivo 22, módulo ORCAMENTO, ordem 8. 83 bytes.
 *
 * A dotação orçamentária por classificação. `vl_Dotacao` é o valor da ficha.
 *
 * ⚠️ `reservado_tcm_2` E `reservado_tcm_3` SÃO A EXCEÇÃO DO TIPO `N`. Os dois são declarados
 * numéricos no manual, mas ele manda "preencher com zeros" — o oposto do que `N` faz (brancos).
 * Por isso levam `literal`: a exceção fica DECLARADA na spec, onde dá para conferir contra o
 * manual, em vez de depender de o chamador lembrar de passar "000000" à mão.
 */
export const SPEC_DOTACAO: ArquivoSpec = {
  identificacao: "Dotacao",
  numeroManual: 22,
  modulo: "ORCAMENTO",
  ordem: 8,
  totalBytes: 83,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0 },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_Elemento", tipo: "N", inicio: 5, fim: 12, obrigatorio: true },
    { nome: "cd_UnidadeOrcamentaria", tipo: "N", inicio: 13, fim: 16, obrigatorio: true },
    { nome: "dt_Ano", tipo: "N", inicio: 17, fim: 20, obrigatorio: true },
    { nome: "tp_ProjetoAtividade", tipo: "N", inicio: 21, fim: 21, obrigatorio: true },
    { nome: "nu_ProjetoAtividade", tipo: "N", inicio: 22, fim: 25, obrigatorio: true },
    /** Vem de `DeParaFonteSiga.codigoTcmBa` — o código da fonte no TCM, não o do ente. */
    { nome: "cd_FonteRecurso", tipo: "N", inicio: 26, fim: 29, obrigatorio: true },
    { nome: "cd_Funcao", tipo: "N", inicio: 30, fim: 31, obrigatorio: true },
    /** ⚠️ RECEBE A SUBFUNÇÃO, apesar do nome — use `camposHierarquiaSiga`. */
    { nome: "cd_Programa", tipo: "N", inicio: 32, fim: 35, obrigatorio: true },
    /** ⚠️ RECEBE O PROGRAMA, apesar do nome — use `camposHierarquiaSiga`. */
    { nome: "cd_SubPrograma", tipo: "N", inicio: 36, fim: 39, obrigatorio: true },
    { nome: "vl_Dotacao", tipo: "V", inicio: 40, fim: 55, decimais: 2, obrigatorio: true },
    { nome: "reservado_tcm_1", tipo: "AN", inicio: 56, fim: 56 },
    { nome: "reservado_tcm_2", tipo: "N", inicio: 57, fim: 62, literal: "000000" },
    { nome: "reservado_tcm_3", tipo: "N", inicio: 63, fim: 68, literal: "000000" },
    { nome: "cd_Orgao", tipo: "N", inicio: 69, fim: 72, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 73, fim: 82 },
  ],
};
