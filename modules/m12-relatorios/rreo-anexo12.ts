import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { tipoDaNatureza } from "../m04-receita/natureza.js";
import {
  baseDeImpostos,
  CHAVE_DED_FUNDEB,
  estruturaDaChave,
  lerDeParaBaseImpostos,
  type LinhaBaseImposto,
} from "./base-impostos.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";

/**
 * RREO — ANEXO 12: ASPS (Ações e Serviços Públicos de Saúde), BLOCO 1. LC 141/2012 art. 35 ·
 * MDF 15ª ed. · Tabela 12.2 (municípios). Limite constitucional: 15% da receita de impostos.
 *
 * ═══ TRÊS QUADROS E UMA APURAÇÃO ═══
 *   RECEITAS: impostos líquidos (I) + transferências (II) = base (III). Vem do MOTOR DE BASE
 *     compartilhado (`baseDeImpostos`) — a mesma base do MDE (25%) e do FUNDEB. As transferências
 *     entram pelo BRUTO (a dedução do FUNDEB não abate a base do art. 198).
 *   DESPESAS COM SAÚDE (IV): função 10, por grupo de natureza (corrente/capital), no MESMO corte
 *     do Anexo 2 (data do fato, líquido de estornos).
 *   NÃO COMPUTADAS (V): o que NÃO conta para o mínimo — inativos/pensionistas, despesas custeadas
 *     com recursos de terceiros (SUS, operação de crédito, outros), e interruptores nomeados.
 *   APURAÇÃO: VI = IV − V; VII% = VI / III(b) × 100 (mínimo 15%); diferença = VI − 15% de III(b).
 *
 * ═══ FAIL-CLOSED NA FONTE ═══
 * Toda fonte que custeia despesa de saúde precisa de classe ASPS (`DeParaFonteClasseAsps`). Fonte
 * sem classe FAZ o gerador parar, nomeando-a: é limite constitucional, e custear ASPS com recurso
 * não classificado poria a diferença no lugar errado.
 *
 * ═══ AS IDENTIDADES ═══
 *   R1  III == I+II; VI == IV−V; VII% == VI/III(b)×100 (ARRED 2 casas); diferença == VI−0,15·III(b).
 *   R2  sub-linhas por tipo (principal+multas+DA+multas-DA) == total do imposto (o motor de base).
 *   R3  as linhas comuns batem com o Anexo 3 (dois de-paras, um razão).
 *   R4  IV == recorte função 10 do Anexo 2.
 *   R5  bruto × líquido: a dedução do FUNDEB não abate a base (II) — o líquido difere pela dedução.
 *
 * Leitura pura, composta. Zero escrita, zero SUM bruto.
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaReceitaAsps {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "grupo" | "item" | "total";
  readonly previsaoInicial: string;
  readonly previsaoAtualizada: string; // (a)
  readonly realizada: string; // (b)
  readonly percentRealizada: string; // %(b/a)
}

export interface LinhaDespesaAsps {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "categoria" | "grupo" | "total";
  readonly dotacaoInicial: string;
  readonly dotacaoAtualizada: string; // (c)
  readonly empenhada: string; // (d)
  readonly percentEmpenhada: string; // %(d/c)
  readonly liquidada: string; // (e)
  readonly percentLiquidada: string; // %(e/c)
  readonly rpnpInscritos: string; // só no último bimestre
}

export interface LinhaNaoComputada {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
  /** nota de rodapé (¹ ³) quando houver. */
  readonly nota?: string;
}

export interface Anexo12 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  // RECEITAS
  readonly impostos: readonly LinhaReceitaAsps[]; // sub-linhas de (I)
  readonly totalImpostos: LinhaReceitaAsps; // (I)
  readonly transferencias: readonly LinhaReceitaAsps[]; // sub-linhas de (II)
  readonly totalTransferencias: LinhaReceitaAsps; // (II)
  readonly baseAsps: LinhaReceitaAsps; // (III)
  // DESPESAS
  readonly despesas: readonly LinhaDespesaAsps[];
  readonly totalDespesasSaude: LinhaDespesaAsps; // (IV)
  // NÃO COMPUTADAS
  readonly naoComputadas: readonly LinhaNaoComputada[]; // (V) itens
  readonly totalNaoComputadas: string; // (V)
  // APURAÇÃO
  readonly totalAsps: string; // (VI) = IV − V (base: liquidada até o bimestre)
  readonly percentualAplicacao: string; // (VII%)
  readonly limitePercentual: string; // "15.00"
  readonly valorDiferenca: string; // VI − 0,15·III(b)
  readonly atingiuMinimo: boolean;
  readonly notas: readonly string[]; // ¹ ³ e pendências nomeadas
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

/** %(x/a) ARRED 2 casas via Decimal (ROUND_HALF_EVEN do `toMoney`), regra Siconfi. `a` zero → "0.00". */
function percent(x: Money, a: Money): string {
  if (a.equals(0)) return "0.00";
  return toMoney(x.dividedBy(a).times(100)).toFixed(2);
}

const LIMITE_ASPS = toMoney("15.00");
const ELEMENTOS_INATIVOS: ReadonlySet<string> = new Set(["01", "03"]); // aposentadorias/reformas, pensões

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

export async function anexo12(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre; readonly incluirIBS?: boolean }
): Promise<Anexo12> {
  const { inicio, fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const notas: string[] = [];

  const receitas = await montarReceitas(leitor, p.exercicio, fim, p.incluirIBS ?? false);
  const despesas = await montarDespesas(leitor, p.exercicio, inicio, fim, p.bimestre, notas);

  // ── APURAÇÃO ──
  const baseB = toMoney(receitas.baseAsps.realizada); // III(b)
  const IV = toMoney(despesas.total.liquidada); // base do VI: liquidada até o bimestre
  const V = despesas.totalNaoComputadas;
  const VI = toMoney(IV.minus(V));
  const percentualAplicacao = percent(VI, baseB); // VII%
  const minimoExigido = toMoney(baseB.times(LIMITE_ASPS).dividedBy(100)); // 15% de III(b)
  const valorDiferenca = toMoney(VI.minus(minimoExigido));

  notas.push(
    "VI usa a despesa LIQUIDADA até o bimestre. No último bimestre o MDF soma os RPNP inscritos; " +
      "esse ajuste é bloco posterior (o RPNP inscrito já aparece na coluna própria do quadro de despesas)."
  );

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    impostos: receitas.impostos,
    totalImpostos: receitas.totalImpostos,
    transferencias: receitas.transferencias,
    totalTransferencias: receitas.totalTransferencias,
    baseAsps: receitas.baseAsps,
    despesas: despesas.linhas,
    totalDespesasSaude: despesas.total,
    naoComputadas: despesas.naoComputadas,
    totalNaoComputadas: V.toFixed(2),
    totalAsps: VI.toFixed(2),
    percentualAplicacao,
    limitePercentual: LIMITE_ASPS.toFixed(2),
    valorDiferenca: valorDiferenca.toFixed(2),
    atingiuMinimo: toMoney(percentualAplicacao).greaterThanOrEqualTo(LIMITE_ASPS),
    notas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO RECEITAS (I, II, III) — realizadas do motor de base; previsão da LOA
// ═══════════════════════════════════════════════════════════════════════════

async function montarReceitas(
  leitor: Tx,
  exercicio: number,
  fim: Date,
  incluirIBS: boolean
): Promise<{
  impostos: LinhaReceitaAsps[];
  totalImpostos: LinhaReceitaAsps;
  transferencias: LinhaReceitaAsps[];
  totalTransferencias: LinhaReceitaAsps;
  baseAsps: LinhaReceitaAsps;
}> {
  // REALIZADAS — do motor de base (líquido, corte pela data do fato até o fim do bimestre).
  const base = await baseDeImpostos(leitor, { exercicio, ate: fim, incluirIBS });

  // PREVISÃO — da LOA, classificada pelo MESMO de-para + dígito (fonte única do motor de base).
  const dePara = await lerDeParaBaseImpostos(leitor);
  const previstas = await leitor.receitaPrevista.findMany({
    where: { exercicio },
    select: { valorPrevisto: true, naturezaReceita: { select: { codigo: true } } },
  });
  const previsaoPorLinha = new Map<string, Money>();
  // classifica uma natureza na linha certa e soma o valor (previsão inicial OU reprevisão).
  const somarPrevisao = (codigo: string, valor: Money): void => {
    const chave = dePara.get(codigo);
    if (chave === undefined || chave === CHAVE_DED_FUNDEB) return; // fora da base / redutora (bruto)
    const estrutura = estruturaDaChave(chave);
    if (estrutura === undefined) return;
    if (estrutura.ehIBS === true && !incluirIBS) return;
    const linhaKey = chaveDaLinhaReceita(chave, estrutura.grupo, codigo);
    previsaoPorLinha.set(linhaKey, soma(previsaoPorLinha.get(linhaKey) ?? zero(), valor));
  };
  for (const r of previstas) somarPrevisao(r.naturezaReceita.codigo, toMoney(r.valorPrevisto.toFixed(2)));
  // previsão ATUALIZADA = inicial + reprevisões (append-only, M02).
  for (const [cod, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio })) somarPrevisao(cod, ajuste);

  // REALIZADAS por linha, a partir das linhas do motor de base.
  const realizadaPorLinha = new Map<string, Money>();
  const bump = (key: string, v: Money) => realizadaPorLinha.set(key, soma(realizadaPorLinha.get(key) ?? zero(), v));
  for (const imp of base.impostos) {
    bump(imp.chave, toMoney(imp.principal)); // linha nomeada do imposto (principal)
    bump("MULTAS_IMPOSTOS", toMoney(imp.multas));
    bump("DA_IMPOSTOS", toMoney(imp.dividaAtiva));
    bump("MULTAS_DA_IMPOSTOS", toMoney(imp.multasDividaAtiva));
  }
  for (const tr of base.transferencias) bump(tr.chave, toMoney(tr.total)); // transferência: bruto total

  // monta as sub-linhas de (I): nomeadas dos impostos + os três agregados por tipo.
  const impostos: LinhaReceitaAsps[] = [];
  for (const imp of base.impostos) {
    impostos.push(linhaReceita(imp.chave, imp.rotulo, "item", previsaoPorLinha, realizadaPorLinha));
  }
  impostos.push(linhaReceita("MULTAS_IMPOSTOS", "Multas, Juros de Mora e Outros Encargos dos Impostos", "item", previsaoPorLinha, realizadaPorLinha));
  impostos.push(linhaReceita("DA_IMPOSTOS", "Dívida Ativa dos Impostos", "item", previsaoPorLinha, realizadaPorLinha));
  impostos.push(linhaReceita("MULTAS_DA_IMPOSTOS", "Multas, Juros de Mora e Outros Encargos da Dívida Ativa", "item", previsaoPorLinha, realizadaPorLinha));

  const transferencias: LinhaReceitaAsps[] = base.transferencias.map((tr) =>
    linhaReceita(tr.chave, tr.rotulo, "item", previsaoPorLinha, realizadaPorLinha)
  );

  const totalImpostos = totalizarReceita("RECEITA_IMPOSTOS", "RECEITA DE IMPOSTOS LÍQUIDA (I)", impostos);
  const totalTransferencias = totalizarReceita("RECEITA_TRANSFERENCIAS", "RECEITA DE TRANSFERÊNCIAS CONSTITUCIONAIS E LEGAIS (II)", transferencias);
  const baseAsps = totalizarReceita("BASE_ASPS", "TOTAL DAS RECEITAS PARA APURAÇÃO EM ASPS (III) = (I) + (II)", [totalImpostos, totalTransferencias]);

  return { impostos, totalImpostos, transferencias, totalTransferencias, baseAsps };
}

/** A linha de receita para onde uma natureza (chave, grupo, tipo) vai. */
function chaveDaLinhaReceita(chave: string, grupo: "imposto" | "transferencia", codigo: string): string {
  if (grupo === "transferencia") return chave; // transferência: tudo na linha da transferência
  switch (tipoDaNatureza(codigo)) {
    case "MULTAS_E_JUROS_DE_MORA": return "MULTAS_IMPOSTOS";
    case "DIVIDA_ATIVA": return "DA_IMPOSTOS";
    case "MULTAS_E_JUROS_DE_MORA_DA_DIVIDA_ATIVA": return "MULTAS_DA_IMPOSTOS";
    default: return chave; // PRINCIPAL (e agregadora) → a linha nomeada do imposto
  }
}

function linhaReceita(
  chave: string,
  rotulo: string,
  nivel: LinhaReceitaAsps["nivel"],
  previsao: ReadonlyMap<string, Money>,
  realizada: ReadonlyMap<string, Money>
): LinhaReceitaAsps {
  // previsão atualizada == inicial: a reprevisão de receita não é rastreada (mesma pendência do Anexo 1/3).
  const prev = previsao.get(chave) ?? zero();
  const real = realizada.get(chave) ?? zero();
  return {
    chave,
    rotulo,
    nivel,
    previsaoInicial: prev.toFixed(2),
    previsaoAtualizada: prev.toFixed(2),
    realizada: real.toFixed(2),
    percentRealizada: percent(real, prev),
  };
}

function totalizarReceita(chave: string, rotulo: string, linhas: readonly LinhaReceitaAsps[]): LinhaReceitaAsps {
  const prev = linhas.reduce((s, l) => soma(s, toMoney(l.previsaoAtualizada)), zero());
  const real = linhas.reduce((s, l) => soma(s, toMoney(l.realizada)), zero());
  return {
    chave, rotulo, nivel: "total",
    previsaoInicial: prev.toFixed(2),
    previsaoAtualizada: prev.toFixed(2),
    realizada: real.toFixed(2),
    percentRealizada: percent(real, prev),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO DESPESAS (IV) + NÃO COMPUTADAS (V) — função 10
// ═══════════════════════════════════════════════════════════════════════════

interface AccDespesa {
  dotacaoInicial: Money;
  creditos: Money;
  empenhada: Money;
  liquidada: Money;
  rpnp: Money;
}
const despesaZero = (): AccDespesa => ({ dotacaoInicial: zero(), creditos: zero(), empenhada: zero(), liquidada: zero(), rpnp: zero() });

const GRUPOS_ND: Record<string, string> = {
  "1": "Pessoal e Encargos Sociais",
  "2": "Juros e Encargos da Dívida",
  "3": "Outras Despesas Correntes",
  "4": "Investimentos",
  "5": "Inversões Financeiras",
  "6": "Amortização da Dívida",
};
const CATEGORIAS_ND: Record<string, string> = { "3": "DESPESAS CORRENTES", "4": "DESPESAS DE CAPITAL" };

async function montarDespesas(
  leitor: Tx,
  exercicio: number,
  inicio: Date,
  fim: Date,
  bimestre: Bimestre,
  notas: string[]
): Promise<{
  linhas: LinhaDespesaAsps[];
  total: LinhaDespesaAsps;
  naoComputadas: LinhaNaoComputada[];
  totalNaoComputadas: Money;
}> {
  // as fichas de FUNÇÃO 10 (Saúde) do exercício, com natureza (categoria/grupo/elemento) e fonte.
  const fichas = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio, funcao: { codigo: "10" } },
    select: {
      id: true,
      valorDotado: true,
      naturezaDespesa: { select: { codCategoria: true, codNatureza: true, codElemento: true } },
      fonte: { select: { codigo: true } },
    },
  });

  // classe ASPS das fontes (fail-closed).
  const classeDaFonte = new Map<string, string>();
  for (const d of await leitor.deParaFonteClasseAsps.findMany({ select: { fonteCodigo: true, classe: true } })) {
    classeDaFonte.set(d.fonteCodigo, d.classe);
  }

  interface MetaFicha {
    cat: string; grupo: string; elemento: string; fonte: string;
  }
  const metaPorFicha = new Map<string, MetaFicha>();
  const porGrupo = new Map<string, AccDespesa>(); // `${cat}|${grupo}`
  const porFicha = new Map<string, AccDespesa>(); // para o quadro V (por elemento/fonte)
  const chaveGrupo = (cat: string, grupo: string) => `${cat}|${grupo}`;

  for (const f of fichas) {
    const cat = f.naturezaDespesa.codCategoria;
    const grupo = f.naturezaDespesa.codNatureza;
    metaPorFicha.set(f.id, { cat, grupo, elemento: f.naturezaDespesa.codElemento, fonte: f.fonte.codigo });
    const accG = porGrupo.get(chaveGrupo(cat, grupo)) ?? despesaZero();
    accG.dotacaoInicial = soma(accG.dotacaoInicial, toMoney(f.valorDotado.toFixed(2)));
    porGrupo.set(chaveGrupo(cat, grupo), accG);
    porFicha.set(f.id, despesaZero());
    porFicha.get(f.id)!.dotacaoInicial = toMoney(f.valorDotado.toFixed(2));
  }

  if (fichas.length === 0) {
    const totalVazio = linhaDespesa("total", "TOTAL DAS DESPESAS COM SAÚDE (IV)", despesaZero());
    return { linhas: [], total: totalVazio, naoComputadas: naoComputadasVazias(), totalNaoComputadas: zero() };
  }

  const idsFicha = [...metaPorFicha.keys()];

  // CRÉDITOS adicionais (suplementação − anulação), por ficha.
  for (const it of await leitor.itemCredito.findMany({ where: { fichaId: { in: idsFicha } }, select: { tipo: true, valor: true, fichaId: true } })) {
    const meta = metaPorFicha.get(it.fichaId);
    if (meta === undefined) continue;
    const v = toMoney(it.valor.toFixed(2));
    const delta = it.tipo === "SUPLEMENTACAO" ? v : toMoney(v.negated());
    porGrupo.get(chaveGrupo(meta.cat, meta.grupo))!.creditos = soma(porGrupo.get(chaveGrupo(meta.cat, meta.grupo))!.creditos, delta);
    porFicha.get(it.fichaId)!.creditos = soma(porFicha.get(it.fichaId)!.creditos, delta);
  }

  // EMPENHADAS e LIQUIDADAS até o fim do bimestre — líquido de estornos, por data do FATO.
  await agregarEstornaveis(
    await leitor.empenho.findMany({ where: { fichaId: { in: idsFicha } }, select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true } }),
    (e) => e.data, (e) => e.fichaId, fim, porGrupo, porFicha, metaPorFicha, "empenhada"
  );
  const liqs = await leitor.liquidacao.findMany({
    where: { empenho: { fichaId: { in: idsFicha } } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, empenho: { select: { fichaId: true } } },
  });
  await agregarEstornaveis(
    liqs.map((l) => ({ ...l, fichaId: l.empenho.fichaId })),
    (l) => l.data, (l) => l.fichaId, fim, porGrupo, porFicha, metaPorFicha, "liquidada"
  );

  // RPNP inscritos — só no último bimestre (informativo no quadro de despesas).
  if (bimestre === 6) {
    for (const i of await leitor.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: exercicio, tipo: "NAO_PROCESSADO", empenho: { fichaId: { in: idsFicha } } }, select: { valorInscrito: true, empenho: { select: { fichaId: true } } } })) {
      const meta = metaPorFicha.get(i.empenho.fichaId);
      if (meta === undefined) continue;
      const v = toMoney(i.valorInscrito.toFixed(2));
      porGrupo.get(chaveGrupo(meta.cat, meta.grupo))!.rpnp = soma(porGrupo.get(chaveGrupo(meta.cat, meta.grupo))!.rpnp, v);
    }
  }

  // ── monta as linhas por categoria → grupo ──
  const linhas: LinhaDespesaAsps[] = [];
  const cats = [...new Set([...porGrupo.keys()].map((k) => k.split("|")[0]!))].sort();
  for (const cat of cats) {
    const daCat = [...porGrupo.entries()].filter(([k]) => k.split("|")[0] === cat);
    const accCat = daCat.reduce((acc, [, a]) => somarDespesa(acc, a), despesaZero());
    linhas.push(linhaDespesa("categoria", CATEGORIAS_ND[cat] ?? `Categoria ${cat}`, accCat));
    for (const [k, a] of daCat.sort(([x], [y]) => x.localeCompare(y))) {
      linhas.push(linhaDespesa("grupo", GRUPOS_ND[k.split("|")[1]!] ?? `Grupo ${k.split("|")[1]}`, a));
    }
  }
  const totalAcc = [...porGrupo.values()].reduce((acc, a) => somarDespesa(acc, a), despesaZero());
  const total = linhaDespesa("total", "TOTAL DAS DESPESAS COM SAÚDE (IV)", totalAcc);

  // ── QUADRO V: não computadas (base LIQUIDADA, particionada por ficha) ──
  const { naoComputadas, totalNaoComputadas } = montarNaoComputadas(porFicha, metaPorFicha, classeDaFonte, notas);

  return { linhas, total, naoComputadas, totalNaoComputadas };
}

/** Distribui empenhos/liquidações por (grupo, ficha), líquido de estornos, até `fim`. */
async function agregarEstornaveis<T extends { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null }>(
  linhas: readonly (T & { fichaId: string })[],
  dataDe: (l: T & { fichaId: string }) => Date,
  fichaDe: (l: T & { fichaId: string }) => string,
  fim: Date,
  porGrupo: Map<string, AccDespesa>,
  porFicha: Map<string, AccDespesa>,
  meta: Map<string, { cat: string; grupo: string; elemento: string; fonte: string }>,
  campo: "empenhada" | "liquidada"
): Promise<void> {
  const porGrupoLinhas = new Map<string, (T & { fichaId: string })[]>();
  const porFichaLinhas = new Map<string, (T & { fichaId: string })[]>();
  for (const l of linhas) {
    if (dataDe(l) > fim) continue;
    const m = meta.get(fichaDe(l));
    if (m === undefined) continue;
    const kg = `${m.cat}|${m.grupo}`;
    (porGrupoLinhas.get(kg) ?? porGrupoLinhas.set(kg, []).get(kg)!).push(l);
    (porFichaLinhas.get(fichaDe(l)) ?? porFichaLinhas.set(fichaDe(l), []).get(fichaDe(l))!).push(l);
  }
  const liquidar = (arr: readonly (T & { fichaId: string })[]) =>
    somaLiquidaEstornaveis(arr.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
  for (const [k, arr] of porGrupoLinhas) porGrupo.get(k)![campo] = liquidar(arr);
  for (const [k, arr] of porFichaLinhas) porFicha.get(k)![campo] = liquidar(arr);
}

function somarDespesa(a: AccDespesa, b: AccDespesa): AccDespesa {
  return {
    dotacaoInicial: soma(a.dotacaoInicial, b.dotacaoInicial),
    creditos: soma(a.creditos, b.creditos),
    empenhada: soma(a.empenhada, b.empenhada),
    liquidada: soma(a.liquidada, b.liquidada),
    rpnp: soma(a.rpnp, b.rpnp),
  };
}

function linhaDespesa(nivel: LinhaDespesaAsps["nivel"], rotulo: string, a: AccDespesa): LinhaDespesaAsps {
  const atualizada = soma(a.dotacaoInicial, a.creditos);
  return {
    chave: rotulo, rotulo, nivel,
    dotacaoInicial: a.dotacaoInicial.toFixed(2),
    dotacaoAtualizada: atualizada.toFixed(2),
    empenhada: a.empenhada.toFixed(2),
    percentEmpenhada: percent(a.empenhada, atualizada),
    liquidada: a.liquidada.toFixed(2),
    percentLiquidada: percent(a.liquidada, atualizada),
    rpnpInscritos: a.rpnp.toFixed(2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO V — NÃO COMPUTADAS (partição por ficha: inativo × classe de fonte)
// ═══════════════════════════════════════════════════════════════════════════

function montarNaoComputadas(
  porFicha: ReadonlyMap<string, AccDespesa>,
  meta: ReadonlyMap<string, { cat: string; grupo: string; elemento: string; fonte: string }>,
  classeDaFonte: ReadonlyMap<string, string>,
  notas: string[]
): { naoComputadas: LinhaNaoComputada[]; totalNaoComputadas: Money } {
  let inativos = zero();
  let sus = zero();
  let opCredito = zero();
  let outros = zero();

  for (const [fichaId, acc] of porFicha) {
    const m = meta.get(fichaId)!;
    const liq = acc.liquidada;
    if (liq.isZero()) continue;

    // FAIL-CLOSED: fonte de saúde sem classe mapeada PARA o gerador, nomeando-a.
    const classe = classeDaFonte.get(m.fonte);
    if (classe === undefined) {
      throw new Error(
        `RREO Anexo 12 (ASPS): a fonte "${m.fonte}" custeia despesa de saúde mas NÃO tem classe ` +
          `ASPS mapeada (DeParaFonteClasseAsps). Classifique-a (PROPRIOS/SUS/OPERACAO_CREDITO/OUTROS) ` +
          `— a base é limite constitucional e não admite fonte no escuro.`
      );
    }

    // inativos/pensionistas primeiro (elemento 01/03), para não contar duas vezes.
    if (ELEMENTOS_INATIVOS.has(m.elemento)) {
      inativos = soma(inativos, liq);
      continue;
    }
    // custeadas com recursos de terceiros → não computadas por CLASSE.
    if (classe === "SUS") sus = soma(sus, liq);
    else if (classe === "OPERACAO_CREDITO") opCredito = soma(opCredito, liq);
    else if (classe === "OUTROS") outros = soma(outros, liq);
    // PROPRIOS, não-inativo → COMPUTADA (fica no VI).
  }

  notas.push(
    "¹ ³ Os quadros de controle plurianual (RPNP sem disponibilidade, RP cancelados, mínimo não " +
      "aplicado em exercícios anteriores) são controle de vários exercícios — neste bloco entram " +
      "como tabela-parâmetro vazia nomeada, no padrão da reestimativa."
  );

  const naoComputadas: LinhaNaoComputada[] = [
    { chave: "INATIVOS", rotulo: "Despesas com Inativos e Pensionistas", valor: inativos.toFixed(2) },
    { chave: "SEM_ACESSO_UNIVERSAL", rotulo: "Despesas com Assistência à Saúde sem Acesso Universal", valor: "0.00", nota: "interruptor vazio — sem fonte de dado no domínio" },
    { chave: "REC_SUS", rotulo: "Despesas custeadas com Recursos de Transferências do SUS", valor: sus.toFixed(2) },
    { chave: "REC_OP_CREDITO", rotulo: "Despesas custeadas com Recursos de Operações de Crédito", valor: opCredito.toFixed(2) },
    { chave: "REC_OUTROS", rotulo: "Despesas custeadas com Outros Recursos", valor: outros.toFixed(2) },
    { chave: "OUTRAS_NAO_COMPUTADAS", rotulo: "Outras Ações e Serviços não computados", valor: "0.00", nota: "interruptor vazio" },
    { chave: "RPNP_SEM_DISPONIBILIDADE", rotulo: "RPNP inscritos indevidamente sem disponibilidade financeira", valor: "0.00", nota: "¹ controle plurianual — pendência nomeada" },
    { chave: "RP_CANCELADOS", rotulo: "Despesas custeadas com disponibilidade vinculada a RP cancelados", valor: "0.00", nota: "³ controle plurianual — pendência nomeada" },
    { chave: "MINIMO_NAO_APLICADO", rotulo: "Despesas custeadas com recursos vinculados à parcela do mínimo não aplicada em exercícios anteriores", valor: "0.00", nota: "³ controle plurianual — pendência nomeada" },
  ];
  const total = [inativos, sus, opCredito, outros].reduce(soma, zero());
  return { naoComputadas, totalNaoComputadas: total };
}

function naoComputadasVazias(): LinhaNaoComputada[] {
  return montarNaoComputadas(new Map(), new Map(), new Map(), []).naoComputadas;
}
