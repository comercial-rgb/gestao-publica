import type { ArquivoSpec } from "../tipos.js";

/**
 * ═══ ⚠️ OS NOMES DA HIERARQUIA MENTEM NESTE ARQUIVO ═══
 * `cd_Programa` recebe a **SUBFUNÇÃO** e `cd_SubPrograma` recebe o **PROGRAMA**. Ver
 * `siga/hierarquia.ts` — é o único caminho autorizado para estes campos, e há um grep que recusa
 * atribuição direta deles.
 *
 * Empenho — arquivo 23, módulo INFORMES, ordem 14. 500 bytes.
 *
 * O arquivo central da execução da despesa. É o maior do caminho crítico e o mais exposto a erro.
 *
 * ⚠️ `nu_Empenho` É `N` — BRANCOS À ESQUERDA, NUNCA ZEROS. Zeros à esquerda no número do empenho
 * fazem o TCM devolver ERRO. O tipo `N` já garante isso no writer, mas o caso tem teste próprio
 * porque é o erro mais fácil de reintroduzir: quem vem de outro layout fixed-width zero-pada por
 * reflexo, e o arquivo continua "parecendo certo" na inspeção visual.
 *
 * ⚠️ `de_Historico` (255 bytes) É O CAMPO MAIS EXPOSTO À BLACKLIST. É texto livre digitado por
 * humano — o lugar onde um ponto-e-vírgula ou um "Compra de material - - urgente" aparece sem
 * ninguém notar, e o TCM recusa a REMESSA INTEIRA por causa dele. O writer sanitiza; o validador
 * emite ALERTA quando a sanitização de fato alterou o texto, porque o que sai passa a diferir do
 * que o contador escreveu, e isso a Comissão precisa saber.
 *
 * ⚠️ `reservado_tcm_1` (14 bytes) e `reservado_tcm_2` (1 byte): "preencher com zeros" — a mesma
 * exceção ao tipo `N` documentada em `dotacao.ts`.
 */
export const SPEC_EMPENHO: ArquivoSpec = {
  identificacao: "Empenho",
  numeroManual: 23,
  modulo: "INFORMES",
  ordem: 14,
  totalBytes: 500,
  origemSpec: "manual-v44-2014",
  campos: [
    { nome: "tp_registro", tipo: "N", inicio: 0, fim: 0 },
    { nome: "cd_Unidade", tipo: "N", inicio: 1, fim: 4, obrigatorio: true },
    { nome: "cd_UnidadeOrcamentaria", tipo: "N", inicio: 5, fim: 8, obrigatorio: true },
    { nome: "nu_Empenho", tipo: "N", inicio: 9, fim: 18, obrigatorio: true },
    { nome: "nu_ProcessoLicitatorio", tipo: "AN", inicio: 19, fim: 54 },
    { nome: "dt_Ano", tipo: "N", inicio: 55, fim: 58, obrigatorio: true },
    { nome: "tp_ProjetoAtividade", tipo: "N", inicio: 59, fim: 59, obrigatorio: true },
    { nome: "nu_ProjetoAtividade", tipo: "N", inicio: 60, fim: 63, obrigatorio: true },
    { nome: "cd_FonteRecurso", tipo: "N", inicio: 64, fim: 67, obrigatorio: true },
    { nome: "reservado_tcm_1", tipo: "N", inicio: 68, fim: 81, literal: "00000000000000" },
    { nome: "cd_Elemento", tipo: "N", inicio: 82, fim: 89, obrigatorio: true },
    { nome: "vl_Empenho", tipo: "V", inicio: 90, fim: 105, decimais: 2, obrigatorio: true },
    { nome: "de_Historico", tipo: "AN", inicio: 106, fim: 360, obrigatorio: true },
    { nome: "tp_Empenho", tipo: "N", inicio: 361, fim: 361, obrigatorio: true },
    { nome: "dt_Empenho", tipo: "D", inicio: 362, fim: 369, obrigatorio: true },
    /** Obrigatório quando st_contrato_aplicavel = "S". */
    { nome: "nu_Contrato", tipo: "AN", inicio: 370, fim: 385 },
    { nome: "nm_Credor", tipo: "AN", inicio: 386, fim: 435, obrigatorio: true },
    { nome: "dt_AnoMes", tipo: "N", inicio: 436, fim: 441, obrigatorio: true },
    { nome: "nu_CGC_Credor", tipo: "AN", inicio: 442, fim: 455, obrigatorio: true },
    /** 1=Física 2=Jurídica. Default 1. */
    { nome: "tp_Pessoa", tipo: "N", inicio: 456, fim: 456, obrigatorio: true },
    { nome: "cd_Orgao", tipo: "N", inicio: 457, fim: 460, obrigatorio: true },
    /** Alternativa a nu_ProcessoLicitatorio quando st_licitacao_sujeito = "S". */
    { nome: "cd_Dispensa", tipo: "AN", inicio: 461, fim: 476 },
    { nome: "reservado_tcm_2", tipo: "N", inicio: 477, fim: 477, literal: "0" },
    { nome: "cd_Funcao", tipo: "N", inicio: 478, fim: 479, obrigatorio: true },
    /** ⚠️ RECEBE A SUBFUNÇÃO, apesar do nome — use `camposHierarquiaSiga`. */
    { nome: "cd_Programa", tipo: "N", inicio: 480, fim: 483, obrigatorio: true },
    /** ⚠️ RECEBE O PROGRAMA, apesar do nome — use `camposHierarquiaSiga`. */
    { nome: "cd_SubPrograma", tipo: "N", inicio: 484, fim: 487, obrigatorio: true },
    /** "S"/"N" MAIÚSCULO — se "S", nu_Contrato é obrigatório. */
    { nome: "st_contrato_aplicavel", tipo: "AN", inicio: 488, fim: 488, obrigatorio: true },
    /** "S"/"N" MAIÚSCULO — se "S", nu_ProcessoLicitatorio OU cd_Dispensa é obrigatório. */
    { nome: "st_licitacao_sujeito", tipo: "AN", inicio: 489, fim: 489, obrigatorio: true },
    { nome: "nu_SequencialRegistro", tipo: "N", inicio: 490, fim: 499 },
  ],
};

/** O limite do histórico. Acima disso o validador emite ALERTA de truncamento. */
export const LIMITE_HISTORICO_EMPENHO = 255;
