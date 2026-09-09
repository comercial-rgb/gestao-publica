import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  arrecadadoPorCodigoAcompanhamento,
  arrecadadoPorNaturezaFonte,
} from "../m04-receita/consultas.js";
import {
  ORIGEM_RECEITA,
  parsearNaturezaReceita,
  type ChaveOrigem,
} from "../m04-receita/natureza.js";
import { type Bimestre } from "./rreo-anexo1.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";

/**
 * RREO — ANEXO 3: DEMONSTRATIVO DA RECEITA CORRENTE LÍQUIDA (RCL).
 * LRF art. 53, I · MDF 15ª ed. (STN) · TR 4.15 · emendas: LRF art. 166-A / EC 105 e 109.
 *
 * ═══ O QUE É A RCL, E POR QUE ELA TEM 12 COLUNAS ═══
 * A RCL é o somatório das receitas correntes LÍQUIDAS de deduções, apurado nos ÚLTIMOS 12 MESES
 * (não no exercício, não no bimestre). É a base dos limites de PESSOAL (art. 19-20) e de
 * ENDIVIDAMENTO (Res. Senado 40/2001). Por isso a janela de 12 meses TERMINA no fim do bimestre
 * de referência e CRUZA o exercício anterior: o Anexo 3 do 1º bimestre de 2026 vai de mar/2025 a
 * fev/2026. Cada uma das 12 colunas é UM mês (líquido, cortado pela `dataArrecadacao` — o FATO),
 * a coluna TOTAL é a soma das 12, e a PREVISÃO ATUALIZADA vem da LOA.
 *
 * ═══ ⚠️ DUAS DISCIPLINAS NO DE-PARA, E A DIFERENÇA É A RCL ═══
 * As sub-linhas nomeadas (IPTU, "Cota-Parte do FPM", "Dedução do FUNDEB"...) são rótulos do MDF,
 * não da natureza — o de-para `DeParaRclAnexo3` amarra `naturezaCodigo → chaveLinha`.
 *   · CORRENTES (linha I): FAIL-OPEN. Uma natureza de categoria 1 SEM entrada cai na "Outras da
 *     ORIGEM" dela (derivada pelo parser). O total das correntes não some por falta de rótulo.
 *   · DEDUÇÕES (linha II): FAIL-CLOSED. Uma dedução só entra se estiver MAPEADA como "deducao".
 *     Uma dedução que vazasse para o fail-open somaria em I e a RCL sairia MAIOR do que é — e a
 *     RCL é base de limite. Dedução sem mapa = ela não deduz (e a natureza, sendo categoria 1,
 *     aparece honestamente em "Outras" de I até ser mapeada); nunca um zero silencioso na II.
 *
 * ═══ AS EMENDAS (IV e VI) — ROL FECHADO DE CÓDIGOS DE ACOMPANHAMENTO ═══
 * A RCL AJUSTADA deduz as transferências obrigatórias de emendas (individuais e de bancada,
 * Portaria STN 710/2021). Elas são marcadas na arrecadação pelo `CodigoAcompanhamento`. Os
 * códigos são um ROL FECHADO por decisão — `{3110,3111}` individuais, `{3120,3121}` bancada —
 * seeded só com o que a norma define hoje; um código novo entra por DECISÃO, não por adivinhação.
 *
 * ═══ AS QUATRO IDENTIDADES AUTO-EXECUTÁVEIS ═══
 *   R1  total12m == Σ das 12 colunas mensais, em TODA linha.
 *   R2  I == Σ sub-linhas de I; II == Σ sub-linhas de II (a hierarquia fecha).
 *   R3  RCL (III) == I − II; RCL-endiv (V) == III − IV; RCL-pessoal (VII) == V − VI — por coluna.
 *   R4  Σ(RCL de cada mês) == III.total12m — a RCL do período é a soma das RCLs mensais (pega
 *       corte furado: uma coluna que somasse fora da própria janela quebraria isto).
 *
 * ═══ LEITURA PURA, COMPOSTA ═══
 * Zero escrita, zero SUM bruto: a receita vem dos leitores do M04 (`arrecadadoPorNaturezaFonte`,
 * `arrecadadoPorCodigoAcompanhamento`), já líquidos e cortados por data do fato; a previsão é a
 * `receitaPrevista` da LOA (assinada por `tipoReceita`). O grep-teste (t8) proíbe escrita e
 * agregação bruta aqui.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA DE 12 MESES (termina no fim do bimestre; cruza exercícios)
// ═══════════════════════════════════════════════════════════════════════════

export interface JanelaMensal {
  readonly ano: number;
  /** 1-12 (humano). */
  readonly mes: number;
  /** Início do mês, INCLUSIVO. */
  readonly desde: Date;
  /** Fim do mês, INCLUSIVO (último ms). */
  readonly ate: Date;
  /** Rótulo curto para o cabeçalho da coluna, ex.: "Mar/2025". */
  readonly rotulo: string;
}

const NOMES_MES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/**
 * As 12 janelas mensais que TERMINAM no fim do `bimestre` do `exercicio`, em ordem cronológica
 * (a mais antiga primeiro). O último mês do bimestre b é o mês `2b` (1-indexado); a janela recua
 * 11 meses a partir dele — e é por isso que ela entra no exercício anterior nos primeiros
 * bimestres. Datas em UTC, mesmo eixo do `janelaDoBimestre`.
 */
export function janelaDosDozeMeses(
  exercicio: number,
  bimestre: Bimestre
): readonly JanelaMensal[] {
  // último mês do bimestre, 0-indexado: bim1 → fev (índice 1), bim6 → dez (índice 11).
  const ultimoMes0 = bimestre * 2 - 1;
  const janelas: JanelaMensal[] = [];
  for (let i = 11; i >= 0; i--) {
    // índice de mês ABSOLUTO (pode ser negativo → o Date rola para o ano anterior).
    const idx = ultimoMes0 - i;
    const desde = new Date(Date.UTC(exercicio, idx, 1, 0, 0, 0, 0));
    const ate = new Date(Date.UTC(exercicio, idx + 1, 1, 0, 0, 0, 0) - 1);
    const ano = desde.getUTCFullYear();
    const mes = desde.getUTCMonth() + 1;
    janelas.push({ ano, mes, desde, ate, rotulo: `${NOMES_MES[mes - 1]}/${ano}` });
  }
  return janelas;
}

// ═══════════════════════════════════════════════════════════════════════════
// OS CÓDIGOS DE ACOMPANHAMENTO DAS EMENDAS — ROL FECHADO POR DECISÃO
// ═══════════════════════════════════════════════════════════════════════════

/** IV — emendas individuais (deduz da RCL para o limite de endividamento). */
const CO_EMENDAS_INDIVIDUAIS: ReadonlySet<string> = new Set(["3110", "3111"]);
/** VI — emendas de bancada (deduz da RCL para o limite de pessoal). */
const CO_EMENDAS_BANCADA: ReadonlySet<string> = new Set(["3120", "3121"]);

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface ColunaMes {
  readonly ano: number;
  readonly mes: number;
  readonly rotulo: string;
}

export interface LinhaRcl {
  /** A chave estável da linha ("RECEITAS_CORRENTES", "IPTU", "DED_FUNDEB", "RCL", ...). */
  readonly chave: string;
  readonly rotulo: string;
  /**
   * "grupo"   — os totais I e II.
   * "item"    — as sub-linhas nomeadas / "Outras da origem".
   * "total"   — os resultados III, V, VII.
   * "deducao" — as deduções de emenda IV, VI (mostradas subtraindo).
   */
  readonly nivel: "grupo" | "item" | "total" | "deducao";
  /** As 12 colunas mensais, em ordem cronológica (string money). */
  readonly meses: readonly string[];
  /** Σ das 12 colunas. R1: sempre igual à soma de `meses`. */
  readonly total12m: string;
  /** Previsão atualizada da LOA (líquida de deduções onde aplicável). */
  readonly previsaoAtualizada: string;
}

export interface Anexo3 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  /** Os 12 cabeçalhos de coluna, cronológicos — a mesma ordem de `LinhaRcl.meses`. */
  readonly colunas: readonly ColunaMes[];
  /** As linhas do demonstrativo, na ordem do MDF (I, sub-I, II, sub-II, III, IV, V, VI, VII). */
  readonly linhas: readonly LinhaRcl[];
  /** A RCL (III) — atalho para o consumidor que só quer o número da base. */
  readonly rcl: LinhaRcl;
  /** A RCL AJUSTADA para o limite de PESSOAL (VII) — a base do art. 19-20 da LRF. */
  readonly rclAjustadaPessoal: LinhaRcl;
  /** Pendências de DADO nomeadas (nunca silenciosas): reestimativa de previsão, etc. */
  readonly pendencias: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE ARITMÉTICA (o mesmo padrão dos outros relatórios)
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

/** Um vetor de 12 zeros — o acumulador por coluna. */
const vetorZero = (): Money[] => Array.from({ length: 12 }, () => zero());

/** Σ de dois vetores de 12, posição a posição. */
function somaVetor(a: readonly Money[], b: readonly Money[]): Money[] {
  return a.map((x, i) => soma(x, b[i]!));
}
/** a − b, posição a posição. */
function subVetor(a: readonly Money[], b: readonly Money[]): Money[] {
  return a.map((x, i) => sub(x, b[i]!));
}
/** Σ das 12 posições. */
function totalDoVetor(v: readonly Money[]): Money {
  return v.reduce((acc, x) => soma(acc, x), zero());
}

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/** Uma linha em construção: 12 acumuladores mensais + a previsão. */
interface LinhaEmConstrucao {
  rotulo: string;
  nivel: LinhaRcl["nivel"];
  meses: Money[];
  previsao: Money;
}

export async function anexo3(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo3> {
  const janelas = janelaDosDozeMeses(p.exercicio, p.bimestre);
  const pendencias: string[] = [];

  // ── O DE-PARA: naturezaCodigo → { chaveLinha, tipo } ──
  const deParaRows = await leitor.deParaRclAnexo3.findMany({
    select: { naturezaCodigo: true, chaveLinha: true, tipo: true },
  });
  const dePara = new Map<string, { chaveLinha: string; tipo: string }>();
  for (const d of deParaRows) {
    dePara.set(d.naturezaCodigo, { chaveLinha: d.chaveLinha, tipo: d.tipo });
  }

  // ── ARRECADAÇÃO por natureza, mês a mês (12 janelas, uma leitura cada) ──
  const arrecPorMes = await Promise.all(
    janelas.map((j) => arrecadadoPorNaturezaFonte(leitor, { desde: j.desde, ate: j.ate }))
  );
  // ── ARRECADAÇÃO marcada por CO (emendas), mês a mês ──
  const coPorMes = await Promise.all(
    janelas.map((j) => arrecadadoPorCodigoAcompanhamento(leitor, { desde: j.desde, ate: j.ate }))
  );

  // ── PREVISÃO da LOA, por natureza, assinada por tipoReceita ──
  const previstas = await leitor.receitaPrevista.findMany({
    where: { exercicio: p.exercicio },
    select: {
      tipoReceita: true,
      valorPrevisto: true,
      naturezaReceita: { select: { codigo: true } },
    },
  });
  const previsaoPorNatureza = new Map<string, Money>();
  for (const r of previstas) {
    const v = toMoney(r.valorPrevisto.toFixed(2));
    const assinado = r.tipoReceita === "DEDUCAO" ? toMoney(v.negated()) : v;
    const cod = r.naturezaReceita.codigo;
    previsaoPorNatureza.set(cod, soma(previsaoPorNatureza.get(cod) ?? zero(), assinado));
  }
  // ── previsão ATUALIZADA = inicial + Σ reprevisões (o que destrava esta coluna) ──
  for (const [cod, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio: p.exercicio })) {
    previsaoPorNatureza.set(cod, soma(previsaoPorNatureza.get(cod) ?? zero(), ajuste));
  }

  // ═══ MONTA AS SUB-LINHAS de CORRENTES e DEDUÇÕES ═══
  // Chaves dinâmicas: as nomeadas do de-para + as "Outras da origem" do fail-open.
  const correntes = new Map<string, LinhaEmConstrucao>();
  const deducoes = new Map<string, LinhaEmConstrucao>();

  const pega = (
    mapa: Map<string, LinhaEmConstrucao>,
    chave: string,
    rotulo: string,
    nivel: LinhaRcl["nivel"]
  ): LinhaEmConstrucao => {
    const l = mapa.get(chave) ?? { rotulo, nivel, meses: vetorZero(), previsao: zero() };
    mapa.set(chave, l);
    return l;
  };

  // Cada natureza precisa ir para a sua linha UMA vez na previsão (não 12×). Rastreia quais
  // naturezas já mapeamos e para qual (chave, mapa), para creditar a previsão uma só vez.
  const destinoDaNatureza = new Map<string, { mapa: Map<string, LinhaEmConstrucao>; chave: string }>();

  const classificar = (
    naturezaCodigo: string
  ): { mapa: Map<string, LinhaEmConstrucao>; chave: string } | null => {
    const mapeado = dePara.get(naturezaCodigo);
    if (mapeado !== undefined) {
      if (mapeado.tipo === "deducao") {
        // FAIL-CLOSED: só entra na II porque foi mapeada explicitamente.
        pega(deducoes, mapeado.chaveLinha, rotuloDeChave(mapeado.chaveLinha), "item");
        return { mapa: deducoes, chave: mapeado.chaveLinha };
      }
      // "corrente" (ou qualquer outro tipo) → sub-linha nomeada de I.
      pega(correntes, mapeado.chaveLinha, rotuloDeChave(mapeado.chaveLinha), "item");
      return { mapa: correntes, chave: mapeado.chaveLinha };
    }
    // NÃO mapeada. Só as CORRENTES (categoria 1) caem no fail-open; capital não é RCL.
    const nat = parsearNaturezaReceita(naturezaCodigo.padEnd(8, "0"));
    if (nat.categoria !== "1") return null;
    const origem = naturezaCodigo.slice(0, 2);
    const chave = `OUTRAS_${origem}`;
    pega(correntes, chave, `Outras — ${rotuloOrigem(origem)}`, "item");
    return { mapa: correntes, chave };
  };

  // ── despeja a arrecadação mês a mês nas sub-linhas ──
  for (let m = 0; m < 12; m++) {
    for (const a of arrecPorMes[m]!) {
      const destino = classificar(a.naturezaCodigo);
      if (destino === null) continue; // receita de capital: fora da RCL.
      destino.mapa.get(destino.chave)!.meses[m] = soma(
        destino.mapa.get(destino.chave)!.meses[m]!,
        a.arrecadado
      );
      destinoDaNatureza.set(a.naturezaCodigo, destino);
    }
  }

  // ── a PREVISÃO de cada natureza vai para a linha onde a natureza caiu. Uma natureza prevista
  //    que NUNCA arrecadou no período ainda precisa de linha: classifica-a também. ──
  for (const [naturezaCodigo, prev] of previsaoPorNatureza) {
    let destino = destinoDaNatureza.get(naturezaCodigo);
    if (destino === undefined) {
      const c = classificar(naturezaCodigo);
      if (c === null) continue;
      destino = c;
      destinoDaNatureza.set(naturezaCodigo, c);
    }
    const linha = destino.mapa.get(destino.chave)!;
    // Uma natureza de DEDUÇÃO chega com previsão ASSINADA negativa (tipoReceita=DEDUCAO). A
    // linha II mostra a dedução como MAGNITUDE positiva (a fórmula III = I − II é quem subtrai),
    // então nas deduções a previsão entra negada; nas correntes, com o sinal que veio.
    const valor = destino.mapa === deducoes ? toMoney(prev.negated()) : prev;
    linha.previsao = soma(linha.previsao, valor);
  }

  // ═══ AS EMENDAS (IV, VI) — soma das arrecadações marcadas, mês a mês ═══
  const emendasIndividuais = vetorZero();
  const emendasBancada = vetorZero();
  for (let m = 0; m < 12; m++) {
    for (const c of coPorMes[m]!) {
      if (CO_EMENDAS_INDIVIDUAIS.has(c.co)) {
        emendasIndividuais[m] = soma(emendasIndividuais[m]!, c.arrecadado);
      } else if (CO_EMENDAS_BANCADA.has(c.co)) {
        emendasBancada[m] = soma(emendasBancada[m]!, c.arrecadado);
      }
      // CO fora do rol das emendas: não é dedução de RCL. Ignora (silêncio correto: nem toda
      // marcação de acompanhamento é emenda).
    }
  }

  // ═══ OS TOTAIS (I, II, III, V, VII) — por construção, R2 e R3 fecham ═══
  const subCorrentes = ordenarLinhas(correntes);
  const subDeducoes = ordenarLinhas(deducoes);

  const totalCorrentes = totalizar(subCorrentes.map((l) => l.linha)); // I
  const totalDeducoes = totalizar(subDeducoes.map((l) => l.linha)); // II

  const rclMeses = subVetor(totalCorrentes.meses, totalDeducoes.meses); // III por coluna
  const rclPrev = sub(totalCorrentes.previsao, totalDeducoes.previsao);

  const rclEndivMeses = subVetor(rclMeses, emendasIndividuais); // V = III − IV
  const rclPessoalMeses = subVetor(rclEndivMeses, emendasBancada); // VII = V − VI

  // ── monta as LinhaRcl finais ──
  const linhaI = finalizar("RECEITAS_CORRENTES", "RECEITAS CORRENTES (I)", "grupo", totalCorrentes.meses, totalCorrentes.previsao);
  const linhaII = finalizar("DEDUCOES", "(−) DEDUÇÕES (II)", "grupo", totalDeducoes.meses, totalDeducoes.previsao);
  const linhaIII = finalizar("RCL", "RECEITA CORRENTE LÍQUIDA (III) = (I − II)", "total", rclMeses, rclPrev);
  const linhaIV = finalizar("EMENDAS_INDIVIDUAIS", "(−) Transferências obrigatórias — emendas individuais (IV)", "deducao", emendasIndividuais, zero());
  const linhaV = finalizar("RCL_ENDIVIDAMENTO", "RCL AJUSTADA p/ ENDIVIDAMENTO (V) = (III − IV)", "total", rclEndivMeses, rclPrev);
  const linhaVI = finalizar("EMENDAS_BANCADA", "(−) Transferências obrigatórias — emendas de bancada (VI)", "deducao", emendasBancada, zero());
  const linhaVII = finalizar("RCL_PESSOAL", "RCL AJUSTADA p/ PESSOAL (VII) = (V − VI)", "total", rclPessoalMeses, rclPrev);

  // ── previsão de emendas não existe na LOA como dedução de RCL → coluna vazia, NOMEADA ──
  pendencias.push(
    "Previsão das emendas (IV, VI): a LOA não orça a dedução de emenda da RCL — a coluna " +
      "PREVISÃO ATUALIZADA dessas linhas fica 0.00 por ausência de fonte, não por cálculo."
  );
  pendencias.push(
    "Reestimativa de previsão: a PREVISÃO ATUALIZADA reflete a previsão inicial da LOA — a " +
      "reprevisão de receita ainda não é rastreada (mesma pendência do Anexo 1)."
  );

  const linhas: LinhaRcl[] = [
    linhaI,
    ...subCorrentes.map((l) => l.linha),
    linhaII,
    ...subDeducoes.map((l) => l.linha),
    linhaIII,
    linhaIV,
    linhaV,
    linhaVI,
    linhaVII,
  ];

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    colunas: janelas.map((j) => ({ ano: j.ano, mes: j.mes, rotulo: j.rotulo })),
    linhas,
    rcl: linhaIII,
    rclAjustadaPessoal: linhaVII,
    pendencias,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE MONTAGEM
// ═══════════════════════════════════════════════════════════════════════════

/** Ordena as sub-linhas de um mapa: nomeadas primeiro (por chave), "Outras" ao fim. */
function ordenarLinhas(
  mapa: ReadonlyMap<string, LinhaEmConstrucao>
): readonly { chave: string; linha: LinhaRcl }[] {
  return [...mapa.entries()]
    .sort(([a], [b]) => {
      const oa = a.startsWith("OUTRAS_") ? 1 : 0;
      const ob = b.startsWith("OUTRAS_") ? 1 : 0;
      return oa !== ob ? oa - ob : a.localeCompare(b);
    })
    .map(([chave, l]) => ({ chave, linha: finalizar(chave, l.rotulo, l.nivel, l.meses, l.previsao) }));
}

/** Σ de várias linhas (por coluna e previsão) — a base de R2. */
function totalizar(linhas: readonly LinhaRcl[]): { meses: Money[]; previsao: Money } {
  let meses = vetorZero();
  let previsao = zero();
  for (const l of linhas) {
    meses = somaVetor(
      meses,
      l.meses.map((s) => toMoney(s))
    );
    previsao = soma(previsao, toMoney(l.previsaoAtualizada));
  }
  return { meses, previsao };
}

/** Converte 12 acumuladores + previsão numa LinhaRcl. R1 (total == Σ meses) é POR CONSTRUÇÃO. */
function finalizar(
  chave: string,
  rotulo: string,
  nivel: LinhaRcl["nivel"],
  meses: readonly Money[],
  previsao: Money
): LinhaRcl {
  return {
    chave,
    rotulo,
    nivel,
    meses: meses.map((m) => m.toFixed(2)),
    total12m: totalDoVetor(meses).toFixed(2),
    previsaoAtualizada: previsao.toFixed(2),
  };
}

function rotuloOrigem(ori: string): string {
  return ORIGEM_RECEITA[ori as ChaveOrigem] ?? `Origem ${ori}`;
}

/**
 * O rótulo humano de uma chave de linha do de-para. O de-para carrega SÓ a amarração
 * natureza→chave; o rótulo (norma do MDF, fixo) mora aqui. Uma chave sem rótulo aparece crua —
 * visível, nunca inventada.
 */
const ROTULO_CHAVE: Record<string, string> = {
  IPTU: "Imposto Predial e Territorial Urbano — IPTU",
  ISS: "Imposto sobre Serviços — ISS",
  ITBI: "Imposto de Transmissão Inter Vivos — ITBI",
  IRRF: "Imposto de Renda Retido na Fonte — IRRF",
  FPM: "Cota-Parte do Fundo de Participação dos Municípios — FPM",
  ICMS: "Cota-Parte do ICMS",
  IPVA: "Cota-Parte do IPVA",
  ITR: "Cota-Parte do ITR",
  LC87: "Transferências da LC 87/1996 (desoneração)",
  LC61: "Cota-Parte do IPI-Exportação (LC 61/1989)",
  FUNDEB: "Transferências de recursos do FUNDEB",
  IBS: "Imposto sobre Bens e Serviços — IBS (EC 132/2023)",
  DED_FUNDEB: "(−) Dedução de receita para formação do FUNDEB",
  DED_FPM: "(−) Dedução — FPM",
  DED_ICMS: "(−) Dedução — ICMS",
};

function rotuloDeChave(chave: string): string {
  return ROTULO_CHAVE[chave] ?? chave;
}
