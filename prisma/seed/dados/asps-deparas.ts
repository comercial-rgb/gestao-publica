/**
 * DE-PARAS do RREO Anexo 12 (ASPS) — seed do ente.
 *
 * ═══ OS IMPOSTOS TÊM LASTRO (7.9) — O EMENTÁRIO OFICIAL DA RECEITA DO ENTE ═══
 * Os quatro impostos municipais deixaram de ser inferência. O ementário oficial da receita do ente
 * (extrato buscado na 7.9, hierarquia literal) é a autoridade — e é contra ELE que os códigos abaixo
 * foram escritos, não contra "o código dos fixtures", que era o que este arquivo dizia de si mesmo
 * até aqui. O extrato vive, colado e com fonte, em `prisma/seed/dados/depara-impostos.test.ts`, o
 * guard que prova que este mapa e o `depara-rcl-anexo3.ts` falam do MESMO imposto. Código de imposto
 * novo entra ALI primeiro; aqui só depois.
 *
 * ⚠️ FORA DOS IMPOSTOS, O MAPA SEGUE MÍNIMO. As centenas de naturezas da Portaria 163 e o rol de
 * fontes da Portaria STN 710 são PENDÊNCIA DE DADO — entram com o plano do ente. As transferências
 * abaixo NÃO estão no extrato (ele é a seção de impostos) e não foram tocadas na 7.9 — ver
 * `TRANSFERENCIAS_SEM_EMENTARIO` em `depara-rcl-anexo3.ts`, que nomeia a pendência e registra uma
 * contradição VIVA entre os dois seeds sobre o `17210651`.
 */

// ── as CHAVES da base (a estrutura da Tabela 12.2 mora aqui, não no banco) ──
export const CHAVE_DED_FUNDEB = "DED_FUNDEB";
export const CHAVE_IBS = "IBS";

export interface BaseImpostoSeed {
  readonly naturezaCodigo: string;
  readonly chave: string;
}

/**
 * Naturezas → chave. O 8º dígito (tipo: principal/multas/DA/multas-DA) é lido pelo motor
 * (`base-impostos.ts:189`, via `tipoDaNatureza`); aqui só a IDENTIDADE. As sub-linhas de um imposto
 * partilham a MESMA chave — é assim que o motor as reúne numa linha e as separa em colunas.
 *
 * ⚠️ ESTE MAPA DESCE AO GRÃO DO TIPO; o `depara-rcl-anexo3.ts` não (o motor do Anexo 3 não lê o 8º
 * dígito). Por isso o IPTU aparece aqui com quatro códigos e lá com um. Os dois concordam sobre o
 * PRINCIPAL de cada imposto, e é isso que o guard exige.
 *
 * ⚠️ SÓ O QUE O EMENTÁRIO DÁ. O ITBI entra com o principal e mais nada; o ISS, com principal e M&J.
 * A ausência é do EXTRATO, não uma afirmação de que o ente não inscreve ITBI em dívida ativa —
 * inventar `11180143` porque "o padrão sugere" seria reconstruir de memória o mapa que a 7.9 veio
 * parar de reconstruir. Sub-código novo entra quando o ementário o mostrar.
 */
export const BASE_IMPOSTO_ASPS: readonly BaseImpostoSeed[] = [
  // ── impostos municipais (grupo I) — ementário oficial do ente (7.9) ──
  // IPTU — 1.1.1.8.01.1.x, os quatro tipos
  { naturezaCodigo: "11180111", chave: "IPTU" }, // 1.1.1.8.01.1.1 · principal
  { naturezaCodigo: "11180112", chave: "IPTU" }, // 1.1.1.8.01.1.2 · multas e juros de mora
  { naturezaCodigo: "11180113", chave: "IPTU" }, // 1.1.1.8.01.1.3 · dívida ativa
  { naturezaCodigo: "11180114", chave: "IPTU" }, // 1.1.1.8.01.1.4 · M&J de mora da dívida ativa
  // ITBI — 1.1.1.8.01.4.1 · o ementário dá só o principal
  { naturezaCodigo: "11180141", chave: "ITBI" },
  // ISS — 1.1.1.8.02.3.x · o ementário dá principal e M&J
  { naturezaCodigo: "11180231", chave: "ISS" }, // 1.1.1.8.02.3.1 · principal
  { naturezaCodigo: "11180232", chave: "ISS" }, // 1.1.1.8.02.3.2 · multas e juros de mora
  // IRRF — 1.1.1.3.03.1.1 · Trabalho, principal
  { naturezaCodigo: "11130311", chave: "IRRF" },
  // ── transferências constitucionais (grupo II) ──
  // ⚠️ FORA DO EXTRATO DO EMENTÁRIO. Não conferidas na 7.9.
  { naturezaCodigo: "17210151", chave: "FPM" },
  { naturezaCodigo: "17210451", chave: "ITR" },
  { naturezaCodigo: "17210351", chave: "IPVA" },
  { naturezaCodigo: "17210251", chave: "ICMS" },
  { naturezaCodigo: "17210651", chave: "IOF_OURO" }, // ⚠️ o RCL chama este MESMO código de LC61
  { naturezaCodigo: "17210551", chave: "COMPENSACOES" }, // desoneração LC 87/1996
  // ── dedução do FUNDEB (redutora) — a base usa BRUTO, então o motor a EXCLUI do bruto ──
  { naturezaCodigo: "19229951", chave: CHAVE_DED_FUNDEB },
];

export interface FonteClasseSeed {
  readonly fonteCodigo: string;
  readonly classe: string;
}

export const CLASSE_PROPRIOS = "PROPRIOS";
export const CLASSE_SUS = "SUS";
export const CLASSE_OPERACAO_CREDITO = "OPERACAO_CREDITO";
export const CLASSE_OUTROS = "OUTROS";
export const CLASSES_ASPS: readonly string[] = [CLASSE_PROPRIOS, CLASSE_SUS, CLASSE_OPERACAO_CREDITO, CLASSE_OUTROS];

/** Fontes → classe ASPS. Seed com as fontes que o ente usa; rol completo (710) é pendência. */
export const FONTE_CLASSE_ASPS: readonly FonteClasseSeed[] = [
  { fonteCodigo: "500", classe: CLASSE_PROPRIOS }, // recursos não vinculados de impostos
  { fonteCodigo: "600", classe: CLASSE_SUS }, // transferências do SUS
  { fonteCodigo: "999", classe: CLASSE_OUTROS }, // convênios
];
