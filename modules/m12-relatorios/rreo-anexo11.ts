import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 11: RECEITAS E DESPESAS DA ALIENAÇÃO DE ATIVOS. LRF art. 44 e 53 §1º III · MDF 15ª ed.
 *
 * ═══ A REGRA (art. 44 da LRF) ═══
 * O dinheiro da venda de um bem NÃO custeia despesa CORRENTE — ele volta para o patrimônio, via
 * despesa de CAPITAL (ou os regimes de previdência). O Anexo 11 mostra os dois lados: as RECEITAS
 * de alienação realizadas (I) e a APLICAÇÃO delas (II); e o saldo financeiro a aplicar guarda a
 * diferença de um exercício para o outro.
 *
 * ═══ DE ONDE VÊM OS NÚMEROS ═══
 *   · Receitas (I): as arrecadações de ORIGEM 2 da categoria de capital (alienação — o mesmo que o
 *     M10 exige ao sustentar a baixa de um bem, TR 4.65), mapeadas por `DeParaReceitaAlienacao` nas
 *     sub-linhas móveis/imóveis/intangíveis + os rendimentos de aplicação.
 *   · Aplicação (II): as despesas custeadas por FONTES marcadas como de alienação
 *     (`DeParaFonteAlienacao` — interruptor nomeado; sem fonte marcada, o quadro é zero nomeado),
 *     por grupo de natureza. Corte pela data do fato, líquido de estornos.
 *   · Saldo financeiro do exercício (j) = anterior (i, tabela-parâmetro) + receitas realizadas −
 *     (pagas + pagamento de RP) da aplicação.
 *
 * ═══ IDENTIDADES ═══
 *   R1  c == a − b (por linha de receita); h == d − e (por linha de aplicação); j == i + b − (g + RPpagos).
 *   R2  (I) == recorte da origem de alienação no Anexo 1 (mesmo razão de receita).
 *   R3  as alienações do M10 (que sustentam a receita) ↔ a receita (I) — o mesmo `ReceitaArrecadada`.
 *
 * Leitura pura, composta. Zero escrita, zero SUM bruto.
 */

const CHAVES_RECEITA: readonly { readonly chave: string; readonly rotulo: string }[] = [
  { chave: "MOVEIS", rotulo: "Alienação de Bens Móveis" },
  { chave: "IMOVEIS", rotulo: "Alienação de Bens Imóveis" },
  { chave: "INTANGIVEIS", rotulo: "Alienação de Bens Intangíveis" },
  { chave: "RENDIMENTOS", rotulo: "Rendimentos de Aplicações Financeiras" },
];

const GRUPOS_ND: Record<string, string> = {
  "1": "Pessoal e Encargos (Regimes de Previdência)",
  "3": "Outras Despesas Correntes (Regimes de Previdência)",
  "4": "Investimentos",
  "5": "Inversões Financeiras",
  "6": "Amortização da Dívida",
};

export interface LinhaReceitaAlienacao {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "item" | "total";
  readonly previsaoAtualizada: string; // (a)
  readonly realizada: string; // (b)
  readonly saldo: string; // (c) = a − b
}

export interface LinhaAplicacaoAlienacao {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "grupo" | "total";
  readonly dotacaoAtualizada: string; // (d)
  readonly empenhada: string; // (e)
  readonly liquidada: string; // (f)
  readonly paga: string; // (g)
  readonly rpnpInscritos: string;
  readonly pagamentoRp: string;
  readonly saldo: string; // (h) = d − e
}

export interface Anexo11 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly receitas: readonly LinhaReceitaAlienacao[]; // I (sub-linhas)
  readonly totalReceitas: LinhaReceitaAlienacao; // I
  readonly aplicacoes: readonly LinhaAplicacaoAlienacao[]; // II (por grupo)
  readonly totalAplicacao: LinhaAplicacaoAlienacao; // II
  readonly saldoAnterior: string; // (i) tabela-parâmetro
  readonly saldoExercicio: string; // (j) = i + b − (g + RPpagos)
  readonly notas: readonly string[];
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function anexo11(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo11> {
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const notas: string[] = [
    "Saldo financeiro anterior (i) é tabela-parâmetro (superávit financeiro por fonte de alienação " +
      "de exercícios anteriores) — vazio = 0,00 com nota, no padrão da reestimativa.",
    "Conferência do saldo contra o modelo da 15ª ed. é pendência de dado nomeada (MODULO).",
  ];

  const receitas = await montarReceitas(leitor, p.exercicio, fim);
  const aplicacao = await montarAplicacao(leitor, p.exercicio, fim, p.bimestre, notas);

  // (j) = i + Σ receitas realizadas − (Σ pagas + Σ pagamento de RP)
  const saldoAnterior = zero(); // (i)
  const receitasRealizadas = toMoney(receitas.total.realizada);
  const pagas = toMoney(aplicacao.total.paga);
  const rpPagos = toMoney(aplicacao.total.pagamentoRp);
  const saldoExercicio = sub(soma(saldoAnterior, receitasRealizadas), soma(pagas, rpPagos));

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    receitas: receitas.itens,
    totalReceitas: receitas.total,
    aplicacoes: aplicacao.itens,
    totalAplicacao: aplicacao.total,
    saldoAnterior: saldoAnterior.toFixed(2),
    saldoExercicio: saldoExercicio.toFixed(2),
    notas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECEITAS (I)
// ═══════════════════════════════════════════════════════════════════════════

async function montarReceitas(
  leitor: Tx,
  exercicio: number,
  fim: Date
): Promise<{ itens: LinhaReceitaAlienacao[]; total: LinhaReceitaAlienacao }> {
  const dePara = new Map<string, string>();
  for (const d of await leitor.deParaReceitaAlienacao.findMany({ select: { naturezaCodigo: true, chave: true } })) {
    dePara.set(d.naturezaCodigo, d.chave);
  }

  const realizadaPorChave = new Map<string, Money>();
  for (const a of await arrecadadoPorNaturezaFonte(leitor, { ate: fim })) {
    const chave = dePara.get(a.naturezaCodigo);
    if (chave === undefined) continue;
    realizadaPorChave.set(chave, soma(realizadaPorChave.get(chave) ?? zero(), a.arrecadado));
  }

  const previsaoPorChave = new Map<string, Money>();
  for (const r of await leitor.receitaPrevista.findMany({ where: { exercicio }, select: { valorPrevisto: true, naturezaReceita: { select: { codigo: true } } } })) {
    const chave = dePara.get(r.naturezaReceita.codigo);
    if (chave === undefined) continue;
    previsaoPorChave.set(chave, soma(previsaoPorChave.get(chave) ?? zero(), toMoney(r.valorPrevisto.toFixed(2))));
  }

  const itens: LinhaReceitaAlienacao[] = CHAVES_RECEITA.map(({ chave, rotulo }) => {
    const a = previsaoPorChave.get(chave) ?? zero();
    const b = realizadaPorChave.get(chave) ?? zero();
    return { chave, rotulo, nivel: "item", previsaoAtualizada: a.toFixed(2), realizada: b.toFixed(2), saldo: sub(a, b).toFixed(2) };
  });
  const a = itens.reduce((s, l) => soma(s, toMoney(l.previsaoAtualizada)), zero());
  const b = itens.reduce((s, l) => soma(s, toMoney(l.realizada)), zero());
  const total: LinhaReceitaAlienacao = { chave: "TOTAL_I", rotulo: "RECEITAS DE ALIENAÇÃO DE ATIVOS (I)", nivel: "total", previsaoAtualizada: a.toFixed(2), realizada: b.toFixed(2), saldo: sub(a, b).toFixed(2) };
  return { itens, total };
}

// ═══════════════════════════════════════════════════════════════════════════
// APLICAÇÃO (II) — despesas custeadas por fonte de alienação
// ═══════════════════════════════════════════════════════════════════════════

interface AccAplic {
  dotacaoInicial: Money;
  creditos: Money;
  empenhada: Money;
  liquidada: Money;
  paga: Money;
  rpnp: Money;
  rpPagos: Money;
}
const aplicZero = (): AccAplic => ({ dotacaoInicial: zero(), creditos: zero(), empenhada: zero(), liquidada: zero(), paga: zero(), rpnp: zero(), rpPagos: zero() });

async function montarAplicacao(
  leitor: Tx,
  exercicio: number,
  fim: Date,
  bimestre: Bimestre,
  notas: string[]
): Promise<{ itens: LinhaAplicacaoAlienacao[]; total: LinhaAplicacaoAlienacao }> {
  const fontesAlienacao = new Set<string>();
  for (const d of await leitor.deParaFonteAlienacao.findMany({ select: { fonteCodigo: true } })) fontesAlienacao.add(d.fonteCodigo);

  if (fontesAlienacao.size === 0) {
    notas.push("Nenhuma fonte marcada como recurso de alienação (DeParaFonteAlienacao) — o quadro de aplicação está zerado (interruptor nomeado).");
    const vazio = totalAplic([]);
    return { itens: [], total: vazio };
  }

  const fichas = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio, fonte: { codigo: { in: [...fontesAlienacao] } } },
    select: { id: true, valorDotado: true, naturezaDespesa: { select: { codNatureza: true } } },
  });
  const grupoDaFicha = new Map<string, string>();
  const porGrupo = new Map<string, AccAplic>();
  const get = (g: string) => {
    const acc = porGrupo.get(g) ?? aplicZero();
    porGrupo.set(g, acc);
    return acc;
  };
  for (const f of fichas) {
    const g = f.naturezaDespesa.codNatureza;
    grupoDaFicha.set(f.id, g);
    get(g).dotacaoInicial = soma(get(g).dotacaoInicial, toMoney(f.valorDotado.toFixed(2)));
  }

  const ids = [...grupoDaFicha.keys()];
  if (ids.length === 0) {
    return { itens: [], total: totalAplic([]) };
  }

  // créditos
  for (const it of await leitor.itemCredito.findMany({ where: { fichaId: { in: ids } }, select: { tipo: true, valor: true, fichaId: true } })) {
    const g = grupoDaFicha.get(it.fichaId);
    if (g === undefined) continue;
    const v = toMoney(it.valor.toFixed(2));
    get(g).creditos = it.tipo === "SUPLEMENTACAO" ? soma(get(g).creditos, v) : sub(get(g).creditos, v);
  }

  // empenhada / liquidada (data do fato) por grupo
  await agregarPorGrupo(await leitor.empenho.findMany({ where: { fichaId: { in: ids } }, select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true } }), (e) => e.data, (e) => e.fichaId, fim, grupoDaFicha, get, "empenhada");
  const liqs = await leitor.liquidacao.findMany({ where: { empenho: { fichaId: { in: ids } } }, select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, empenho: { select: { fichaId: true } } } });
  await agregarPorGrupo(liqs.map((l) => ({ ...l, fichaId: l.empenho.fichaId })), (l) => l.data, (l) => l.fichaId, fim, grupoDaFicha, get, "liquidada");

  // pagas (data do fato)
  const pags = await leitor.pagamento.findMany({ where: { liquidacao: { empenho: { fichaId: { in: ids } } }, data: { lte: fim } }, select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenho: { select: { fichaId: true } } } } } });
  const pagPorGrupo = new Map<string, typeof pags>();
  for (const pg of pags) {
    const g = grupoDaFicha.get(pg.liquidacao.empenho.fichaId);
    if (g === undefined) continue;
    (pagPorGrupo.get(g) ?? pagPorGrupo.set(g, []).get(g)!).push(pg);
  }
  for (const [g, arr] of pagPorGrupo) get(g).paga = somaLiquidaEstornaveis(arr.map((pg) => ({ id: pg.id, valor: toMoney(pg.valor.toFixed(2)), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId })));

  // RPNP inscritos (último bimestre)
  if (bimestre === 6) {
    for (const i of await leitor.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: exercicio, tipo: "NAO_PROCESSADO", empenho: { fichaId: { in: ids } } }, select: { valorInscrito: true, empenho: { select: { fichaId: true } } } })) {
      const g = grupoDaFicha.get(i.empenho.fichaId);
      if (g === undefined) continue;
      get(g).rpnp = soma(get(g).rpnp, toMoney(i.valorInscrito.toFixed(2)));
    }
  }

  // pagamento de RP (MovimentoRestosAPagar PAGAMENTO − ESTORNO, por dataTransacao) das fichas de alienação
  const movs = await leitor.movimentoRestosAPagar.findMany({
    where: { tipo: { in: ["PAGAMENTO", "ESTORNO_PAGAMENTO"] }, inscricao: { empenho: { fichaId: { in: ids } } } },
    select: { tipo: true, valor: true, inscricao: { select: { empenho: { select: { fichaId: true } } } }, lancamento: { select: { dataTransacao: true } } },
  });
  for (const m of movs) {
    if (m.lancamento === null || m.lancamento.dataTransacao > fim) continue;
    const g = grupoDaFicha.get(m.inscricao.empenho.fichaId);
    if (g === undefined) continue;
    const v = toMoney(m.valor.toFixed(2));
    get(g).rpPagos = m.tipo === "PAGAMENTO" ? soma(get(g).rpPagos, v) : sub(get(g).rpPagos, v);
  }

  const itens: LinhaAplicacaoAlienacao[] = [...porGrupo.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([g, acc]) => linhaAplic("grupo", g, GRUPOS_ND[g] ?? `Grupo ${g}`, acc));
  const total = totalAplic(itens);
  return { itens, total };
}

async function agregarPorGrupo<T extends { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null; fichaId: string }>(
  linhas: readonly T[],
  dataDe: (l: T) => Date,
  fichaDe: (l: T) => string,
  fim: Date,
  grupoDaFicha: ReadonlyMap<string, string>,
  get: (g: string) => AccAplic,
  campo: "empenhada" | "liquidada"
): Promise<void> {
  const porGrupo = new Map<string, T[]>();
  for (const l of linhas) {
    if (dataDe(l) > fim) continue;
    const g = grupoDaFicha.get(fichaDe(l));
    if (g === undefined) continue;
    (porGrupo.get(g) ?? porGrupo.set(g, []).get(g)!).push(l);
  }
  for (const [g, arr] of porGrupo) {
    get(g)[campo] = somaLiquidaEstornaveis(arr.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
  }
}

function linhaAplic(nivel: LinhaAplicacaoAlienacao["nivel"], chave: string, rotulo: string, a: AccAplic): LinhaAplicacaoAlienacao {
  const dot = soma(a.dotacaoInicial, a.creditos);
  return {
    chave, rotulo, nivel,
    dotacaoAtualizada: dot.toFixed(2),
    empenhada: a.empenhada.toFixed(2),
    liquidada: a.liquidada.toFixed(2),
    paga: a.paga.toFixed(2),
    rpnpInscritos: a.rpnp.toFixed(2),
    pagamentoRp: a.rpPagos.toFixed(2),
    saldo: sub(dot, a.empenhada).toFixed(2),
  };
}

function totalAplic(itens: readonly LinhaAplicacaoAlienacao[]): LinhaAplicacaoAlienacao {
  const acc = itens.reduce<AccAplic>((s, l) => ({
    dotacaoInicial: soma(s.dotacaoInicial, toMoney(l.dotacaoAtualizada)),
    creditos: zero(),
    empenhada: soma(s.empenhada, toMoney(l.empenhada)),
    liquidada: soma(s.liquidada, toMoney(l.liquidada)),
    paga: soma(s.paga, toMoney(l.paga)),
    rpnp: soma(s.rpnp, toMoney(l.rpnpInscritos)),
    rpPagos: soma(s.rpPagos, toMoney(l.pagamentoRp)),
  }), aplicZero());
  return linhaAplic("total", "TOTAL_II", "APLICAÇÃO DOS RECURSOS DA ALIENAÇÃO (II)", acc);
}
