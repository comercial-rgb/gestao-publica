/**
 * DE-PARA da RCL (RREO Anexo 3) — seed do ente.
 *
 * ═══ OS IMPOSTOS TÊM LASTRO (7.9) — O EMENTÁRIO OFICIAL DA RECEITA DO ENTE ═══
 * Os quatro impostos municipais deixaram de ser inferência. O ementário oficial da receita do ente
 * (extrato buscado na 7.9, hierarquia literal) é a autoridade — e é contra ELE que os códigos abaixo
 * foram escritos, não contra as fixtures que cada arquivo tinha à mão. O extrato vive, colado e com
 * fonte, em `prisma/seed/dados/depara-impostos.test.ts` — o guard que impede a divergência de
 * renascer. Código de imposto novo entra ALI primeiro; aqui só depois.
 *
 * ⚠️ FORA DOS IMPOSTOS, O MAPA SEGUE MÍNIMO. O de-para completo da 15ª edição amarra as CENTENAS de
 * naturezas da planilha oficial da STN às linhas nomeadas do demonstrativo — e ele é PENDÊNCIA DE
 * DADO: entra quando o ente carregar o plano de receita completo. As transferências abaixo NÃO
 * estão no extrato do ementário (ele é a seção de impostos) e não foram tocadas na 7.9. NÃO
 * reconstruir de memória (a lição das subfunções: 10 erros ao reconstruir à mão).
 *
 * ═══ AS DUAS DISCIPLINAS (ver `prisma/schema/m12-rreo-anexo3.prisma`) ═══
 *   · "corrente"  → sub-linha nomeada de RECEITAS CORRENTES (I). FAIL-OPEN: uma natureza de
 *                   categoria 1 SEM entrada aqui cai em "Outras da origem" — não some.
 *   · "deducao"   → sub-linha de DEDUÇÕES (II). FAIL-CLOSED: uma dedução SÓ deduz se estiver
 *                   mapeada aqui. Sem mapa, ela não deduz (e a RCL não sai maior do que é).
 *
 * O `naturezaCodigo` casa com `NaturezaReceita.codigo` (8 dígitos).
 *
 * ═══ ⚠️ ESTE MAPA É PRINCIPAL-ONLY, E ISSO É DELIBERADO ═══
 * O ementário dá quatro sub-códigos para o IPTU (tipos 1-4: principal, M&J, dívida ativa, M&J da
 * DA) e dois para o ISS (1 e 2). Aqui entra SÓ O PRINCIPAL de cada imposto — porque o motor do
 * Anexo 3 (`rreo-anexo3.ts:263-284`) NÃO lê o 8º dígito: ele mapeia natureza→linha e pronto. Quem
 * desce a esse grão é o `asps-deparas.ts`, cujo motor separa os tipos pelo dígito
 * (`base-impostos.ts:189`); lá as quatro sub-linhas partilham a MESMA chave.
 *
 * Consequência, e ela é de NOME, não de VALOR: as multas e a dívida ativa do IPTU caem no fail-open
 * das correntes ("Outras da origem 11"), não na sub-linha "IPTU". O total das correntes — e
 * portanto a RCL — está CERTO; o que falta é o rótulo fino. Mapeá-las aqui faria a sub-linha "IPTU"
 * do Anexo 3 significar coisa diferente da linha "IPTU" do Anexo 12 sem que nada avisasse. Se um
 * dia esta decisão mudar, ela muda com o motor, não com o seed.
 */

export interface DeParaRclSeed {
  readonly naturezaCodigo: string;
  readonly chaveLinha: string;
  /** "corrente" (I, fail-open) | "deducao" (II, fail-closed). */
  readonly tipo: "corrente" | "deducao";
}

export const DEPARA_RCL_ANEXO3: readonly DeParaRclSeed[] = [
  // ── CORRENTES (I) — impostos próprios · ementário oficial do ente (7.9), tipo 1 (principal) ──
  { naturezaCodigo: "11180111", chaveLinha: "IPTU", tipo: "corrente" }, // 1.1.1.8.01.1.1
  { naturezaCodigo: "11180141", chaveLinha: "ITBI", tipo: "corrente" }, // 1.1.1.8.01.4.1
  { naturezaCodigo: "11180231", chaveLinha: "ISS", tipo: "corrente" }, // 1.1.1.8.02.3.1
  { naturezaCodigo: "11130311", chaveLinha: "IRRF", tipo: "corrente" }, // 1.1.1.3.03.1.1 — Trabalho
  // ── CORRENTES (I) — transferências constitucionais ──
  // ⚠️ FORA DO EXTRATO DO EMENTÁRIO (seção de impostos). Não conferidas na 7.9 — ver o interruptor.
  { naturezaCodigo: "17210151", chaveLinha: "FPM", tipo: "corrente" },
  { naturezaCodigo: "17210251", chaveLinha: "ICMS", tipo: "corrente" },
  { naturezaCodigo: "17210351", chaveLinha: "IPVA", tipo: "corrente" },
  { naturezaCodigo: "17210451", chaveLinha: "ITR", tipo: "corrente" },
  { naturezaCodigo: "17210551", chaveLinha: "LC87", tipo: "corrente" },
  { naturezaCodigo: "17210651", chaveLinha: "LC61", tipo: "corrente" }, // ⚠️ ver TRANSFERENCIAS-SEM-EMENTARIO
  { naturezaCodigo: "17510151", chaveLinha: "FUNDEB", tipo: "corrente" },
  // ── DEDUÇÕES (II) — fail-closed ──
  { naturezaCodigo: "19229951", chaveLinha: "DED_FUNDEB", tipo: "deducao" }, // dedução p/ FUNDEB
];

/**
 * ⚠️ O INTERRUPTOR: linhas do Anexo 3 que EXISTEM na norma e NÃO têm natureza mapeada.
 *
 * ═══ VAZIO DESDE A 7.9 — E ISSO É A NOTÍCIA ═══
 * A 7.8-a pôs "IRRF" aqui porque o único código então mapeado (`11180111`) era provadamente FALSO —
 * o ementário dá IRRF = `11130311` — e herdar código alheio mente pior do que faltar. Faltava o
 * LASTRO: não há seed de `NaturezaReceita` neste repositório, e a `descricao` de uma fixture não é o
 * ementário do ente. A 7.9 trouxe o extrato oficial; o IRRF ganhou o código dele e SAIU daqui.
 *
 * A lista fica — vazia, exportada e viva. Ela é o MECANISMO, não o caso: linha de imposto cujo
 * código oficial o ementário não dê volta para cá, nomeada. Uma linha ausente é visível; uma linha
 * com o código errado mente. O `m12-depara-rcl.ts` imprime esta lista a cada seed.
 */
export const LINHAS_SEM_NATUREZA_ANEXO3: readonly string[] = [];

/**
 * ⚠️ PENDÊNCIA NOMEADA — `TRANSFERENCIAS-SEM-EMENTARIO` (aberta na 7.9).
 *
 * O extrato do ementário cobre a seção de IMPOSTOS. As sete transferências e a dedução do FUNDEB
 * acima continuam com os códigos de antes — construídos contra fixtures, nunca conferidos contra
 * documento oficial. Não foram alteradas porque alterá-las seria reconstruir de memória exatamente
 * o que o cabeçalho proíbe; e não foram apagadas porque não há prova de que estejam erradas.
 *
 * ⚠️ E UMA DELAS ESTÁ, PROVADAMENTE, EM CONTRADIÇÃO — a 7.9 achou e NÃO consertou:
 * o `17210651` é chamado `LC61` aqui (rótulo "Cota-Parte do IPI-Exportação", `rreo-anexo3.ts:455`)
 * e `IOF_OURO` pelo `asps-deparas.ts`. São tributos DIFERENTES, e `base-impostos.ts` tem os dois
 * como linhas distintas da Tabela 12.2 (`IPI_EXPORTACAO` ordem 6, `IOF_OURO` ordem 7). Exatamente
 * um dos dois seeds está errado, e o extrato desta sessão não desempata: ele não fala de
 * transferências. Escolher no escuro seria repetir a falha que a 7.9 veio corrigir.
 *
 * Quita-se buscando a seção de transferências do ementário — o mesmo movimento da 7.9, outra seção.
 */
export const TRANSFERENCIAS_SEM_EMENTARIO: readonly string[] = [
  "FPM",
  "ICMS",
  "IPVA",
  "ITR",
  "LC87",
  "LC61", // ⚠️ contradiz `asps-deparas.ts`, que chama o MESMO 17210651 de IOF_OURO
  "FUNDEB",
  "DED_FUNDEB",
];
