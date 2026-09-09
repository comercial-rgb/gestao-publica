import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";
import {
  CATEGORIAS_RECEITA,
  ORIGEM_RECEITA,
  parsearNaturezaReceita,
  type CategoriaReceita,
  type ChaveOrigem,
} from "../m04-receita/natureza.js";

/**
 * RREO — ANEXO 1: BALANÇO ORÇAMENTÁRIO. LRF art. 52 · MDF/STN (Manual de Demonstrativos Fiscais).
 *
 * ═══ ⚠️ NÃO É O ANEXO 12 (Lei 4.320), E A DIFERENÇA NÃO É COSMÉTICA ═══
 * Já existe `balancoOrcamentario` (Anexo 12, ANUAL) — e ele corta por `criadoEm` (o instante do
 * ENCERRAMENTO). O RREO Anexo 1 é BIMESTRAL e corta pela **data do FATO** (`dataArrecadacao`,
 * `empenho.data`, `liquidacao.data`) — é a doutrina do RREO: o bimestre é uma janela de dois
 * MESES do exercício, e o que entra nele é o que ACONTECEU ali, não o que foi digitado. Por
 * isso este leitor NASCE AO LADO do Anexo 12, e não o estende: os cortes são incompatíveis.
 *
 * ═══ LEITURA PURA, COMPOSTA (padrão dos livros) ═══
 * Zero escrita, zero aritmética nova. A receita vem do `arrecadadoPorNaturezaFonte` (M04, que já
 * corta por data do fato e já é líquida de anulações); a despesa agrega os empenhos/liquidações
 * por grupo, com `somaLiquidaEstornaveis` (o líquido de sempre). O grep-teste (t8) proíbe
 * escrita e soma bruta aqui.
 *
 * ═══ AS CINCO IDENTIDADES AUTO-EXECUTÁVEIS ═══
 *   R1  SALDO == (a) − (c), por linha.
 *   R2  Σ espécies == origem; Σ origens == categoria; Σ categorias == total (a A3/L2 da família).
 *   R3  (c) do bimestre N == (c) do N−1 + (b) do N — o acumulado é consistente (pega corte furado).
 *   R4  6º bimestre: empenhada até == liquidada até + RPNP inscrito (MDF; amarra M05 × M08).
 *   R5  Σ receitas realizadas (c) − Σ despesas (liquidada 1-5 / empenhada 6º) == superávit − déficit.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A JANELA DO BIMESTRE
// ═══════════════════════════════════════════════════════════════════════════

export type Bimestre = 1 | 2 | 3 | 4 | 5 | 6;

/** A janela [início, fim] do bimestre (2 meses) e o corte acumulado (fim do bimestre). */
export function janelaDoBimestre(exercicio: number, bimestre: Bimestre): {
  readonly inicio: Date;
  readonly fim: Date;
  /** O início do exercício — o corte inferior do ACUMULADO (coluna c). */
  readonly inicioExercicio: Date;
} {
  const mesInicio = (bimestre - 1) * 2; // 0-indexed: bim1 → mês 0 (jan)
  const inicio = new Date(Date.UTC(exercicio, mesInicio, 1, 0, 0, 0, 0));
  const fim = new Date(Date.UTC(exercicio, mesInicio + 2, 1, 0, 0, 0, 0) - 1);
  const inicioExercicio = new Date(Date.UTC(exercicio, 0, 1, 0, 0, 0, 0));
  return { inicio, fim, inicioExercicio };
}

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaReceitaRreo {
  /** "categoria" | "origem" | "especie" — o nível hierárquico. */
  readonly nivel: "categoria" | "origem" | "especie";
  /** O código do prefixo (1, 2 ou 3 dígitos). */
  readonly codigo: string;
  readonly rotulo: string;
  readonly previsaoInicial: string;
  /** (a) inicial + reestimativas (hoje vazio — ver a pendência). */
  readonly previsaoAtualizada: string;
  /** (b) No Bimestre. */
  readonly noBimestre: string;
  /** %(b/a), 2 casas. */
  readonly percentNoBim: string;
  /** (c) Até o Bimestre. */
  readonly ateBimestre: string;
  /** %(c/a), 2 casas. */
  readonly percentAteBim: string;
  /** SALDO = (a) − (c). */
  readonly saldo: string;
}

export interface LinhaDespesaRreo {
  readonly nivel: "categoria" | "grupo";
  readonly codigo: string;
  readonly rotulo: string;
  readonly dotacaoInicial: string;
  /** inicial + créditos (suplementações − anulações). */
  readonly dotacaoAtualizada: string;
  readonly empenhadasNoBim: string;
  readonly empenhadasAte: string;
  readonly liquidadasNoBim: string;
  readonly liquidadasAte: string;
  /** dotação atualizada − empenhada até. */
  readonly saldoDotacao: string;
  readonly pagasAte: string;
  /** só no 6º bimestre; senão "0.00". */
  readonly inscritasRpnp: string;
}

export interface Anexo1 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly receitas: readonly LinhaReceitaRreo[];
  /** As intra (categorias 7/8) — TABELA SEPARADA, ao final. */
  readonly intraReceitas: readonly LinhaReceitaRreo[];
  /** "Saldos de Exercícios Anteriores" — só em (a) e (c), o montante dos créditos por superávit. */
  readonly saldosExerciciosAnteriores: { readonly previsaoAtualizada: string; readonly ateBimestre: string };
  readonly subtotalReceitas: LinhaReceitaRreo;
  /** ⚠️ NUNCA os dois com valor ao mesmo tempo (o demonstrativo equilibra por UM lado). */
  readonly deficit: string;
  readonly superavit: string;
  readonly despesas: readonly LinhaDespesaRreo[];
  readonly intraDespesas: readonly LinhaDespesaRreo[];
  readonly subtotalDespesas: LinhaDespesaRreo;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE ARITMÉTICA (o mesmo padrão dos outros relatórios)
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

/** %(x/a) com ARREDONDAMENTO a 2 casas (regra Siconfi). `a` zero → "0.00". */
function percent(x: Money, a: Money): string {
  if (a.equals(0)) return "0.00";
  return toMoney(x.dividedBy(a).times(100)).toFixed(2);
}

const GRUPOS_DESPESA: Record<string, string> = {
  "1": "PESSOAL E ENCARGOS SOCIAIS",
  "2": "JUROS E ENCARGOS DA DÍVIDA",
  "3": "OUTRAS DESPESAS CORRENTES",
  "4": "INVESTIMENTOS",
  "5": "INVERSÕES FINANCEIRAS",
  "6": "AMORTIZAÇÃO DA DÍVIDA",
  "9": "RESERVA DE CONTINGÊNCIA",
};

const CATEGORIAS_DESPESA: Record<string, string> = {
  "3": "DESPESAS CORRENTES",
  "4": "DESPESAS DE CAPITAL",
  "9": "RESERVA DE CONTINGÊNCIA",
};

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function anexo1(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo1> {
  const { inicio, fim } = janelaDoBimestre(p.exercicio, p.bimestre);

  const receitasTudo = await montarReceitas(leitor, p.exercicio, inicio, fim);
  const despesasTudo = await montarDespesas(leitor, p.exercicio, inicio, fim, p.bimestre);
  const saldosExAnt = await lerSaldosExerciciosAnteriores(leitor, p.exercicio);

  // ── SUBTOTAL de receitas (só as NÃO-intra) ──
  const subtotalReceitas = totalizarReceitas(receitasTudo.principais, "SUBTOTAL DAS RECEITAS (I)");

  // ── SUBTOTAL de despesas (as NÃO-intra) ──
  const subtotalDespesas = totalizarDespesas(despesasTudo.principais, "SUBTOTAL DAS DESPESAS (III)");

  // ── DÉFICIT / SUPERÁVIT — o equilíbrio, por UM lado só (MDF) ──
  // A régua da despesa muda no 6º bimestre: liquidada nos bimestres 1-5, EMPENHADA no 6º.
  const receitaRealizadaAte = toMoney(subtotalReceitas.ateBimestre);
  const despesaParaEquilibrio =
    p.bimestre === 6
      ? toMoney(subtotalDespesas.empenhadasAte)
      : toMoney(subtotalDespesas.liquidadasAte);
  const resultado = toMoney(receitaRealizadaAte.minus(despesaParaEquilibrio));
  // resultado > 0 → sobrou receita (superávit); < 0 → faltou (déficit). NUNCA os dois.
  const superavit = resultado.greaterThan(0) ? resultado.toFixed(2) : "0.00";
  const deficit = resultado.lessThan(0) ? toMoney(resultado.negated()).toFixed(2) : "0.00";

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    receitas: receitasTudo.principais,
    intraReceitas: receitasTudo.intra,
    saldosExerciciosAnteriores: {
      previsaoAtualizada: saldosExAnt.toFixed(2),
      ateBimestre: saldosExAnt.toFixed(2),
    },
    subtotalReceitas,
    deficit,
    superavit,
    despesas: despesasTudo.principais,
    intraDespesas: despesasTudo.intra,
    subtotalDespesas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// RECEITAS — categoria → origem → espécie (3 primeiros dígitos)
// ═══════════════════════════════════════════════════════════════════════════

interface AgregadoReceita {
  previsaoInicial: Money;
  /** Σ dos ajustes de reprevisão — previsão atualizada = inicial + reprevisao. */
  reprevisao: Money;
  noBimestre: Money;
  ateBimestre: Money;
}

async function montarReceitas(
  leitor: Tx,
  exercicio: number,
  inicio: Date,
  fim: Date
): Promise<{ principais: readonly LinhaReceitaRreo[]; intra: readonly LinhaReceitaRreo[] }> {
  // PREVISÃO INICIAL: da LOA (ReceitaPrevista), líquida de deduções (SINAL na tabela).
  const previstas = await leitor.receitaPrevista.findMany({
    where: { exercicio },
    select: { tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } } },
  });

  // ARRECADADO: (b) no bimestre e (c) até o bimestre — do M04, cortando por data do fato.
  const arrecBim = await arrecadadoPorNaturezaFonte(leitor, { desde: inicio, ate: fim });
  const arrecAte = await arrecadadoPorNaturezaFonte(leitor, { ate: fim });

  // Agrega por ESPÉCIE (3 primeiros dígitos), separando intra (categoria 7/8).
  const porEspecie = new Map<string, AgregadoReceita>();
  const ehIntra = new Map<string, boolean>();

  const bump = (codigo: string, campo: keyof AgregadoReceita, valor: Money): void => {
    const nat = parsearNaturezaReceita(codigo.padEnd(8, "0"));
    const especie = codigo.slice(0, 3);
    const acc = porEspecie.get(especie) ?? { previsaoInicial: zero(), reprevisao: zero(), noBimestre: zero(), ateBimestre: zero() };
    acc[campo] = soma(acc[campo], valor);
    porEspecie.set(especie, acc);
    ehIntra.set(especie, nat.intraorcamentaria);
  };

  for (const r of previstas) {
    // o SINAL da previsão: DEDUCAO subtrai (líquida de deduções).
    const v = toMoney(r.valorPrevisto.toFixed(2));
    const assinado = r.tipoReceita === "DEDUCAO" ? toMoney(v.negated()) : v;
    bump(r.naturezaReceita.codigo, "previsaoInicial", assinado);
  }
  // previsão ATUALIZADA = inicial + Σ reprevisões (destrava a coluna).
  for (const [cod, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio })) bump(cod, "reprevisao", ajuste);
  for (const a of arrecBim) bump(a.naturezaCodigo, "noBimestre", a.arrecadado);
  for (const a of arrecAte) bump(a.naturezaCodigo, "ateBimestre", a.arrecadado);

  // Constrói a hierarquia cat → origem → espécie, para principais e intra separadamente.
  const principais = construirHierarquiaReceita(porEspecie, ehIntra, false);
  const intra = construirHierarquiaReceita(porEspecie, ehIntra, true);
  return { principais, intra };
}

function construirHierarquiaReceita(
  porEspecie: ReadonlyMap<string, AgregadoReceita>,
  ehIntra: ReadonlyMap<string, boolean>,
  querIntra: boolean
): readonly LinhaReceitaRreo[] {
  // filtra as espécies do lado pedido (intra ou não).
  const especies = [...porEspecie.entries()].filter(([e]) => (ehIntra.get(e) ?? false) === querIntra);
  if (especies.length === 0) return [];

  // agrupa por categoria (1 díg) e origem (2 díg).
  const linhas: LinhaReceitaRreo[] = [];
  const categorias = [...new Set(especies.map(([e]) => e[0]!))].sort();

  for (const cat of categorias) {
    const daCategoria = especies.filter(([e]) => e[0] === cat);
    const aggCat = agregar(daCategoria.map(([, a]) => a));
    linhas.push(linhaReceita("categoria", cat, rotuloCategoria(cat), aggCat));

    const origens = [...new Set(daCategoria.map(([e]) => e.slice(0, 2)))].sort();
    for (const ori of origens) {
      const daOrigem = daCategoria.filter(([e]) => e.slice(0, 2) === ori);
      const aggOri = agregar(daOrigem.map(([, a]) => a));
      linhas.push(linhaReceita("origem", ori, rotuloOrigem(ori), aggOri));

      for (const [esp, a] of daOrigem.sort(([x], [y]) => x.localeCompare(y))) {
        linhas.push(linhaReceita("especie", esp, `Espécie ${esp}`, a));
      }
    }
  }
  return linhas;
}

function agregar(as: readonly AgregadoReceita[]): AgregadoReceita {
  return as.reduce<AgregadoReceita>(
    (acc, a) => ({
      previsaoInicial: soma(acc.previsaoInicial, a.previsaoInicial),
      reprevisao: soma(acc.reprevisao, a.reprevisao),
      noBimestre: soma(acc.noBimestre, a.noBimestre),
      ateBimestre: soma(acc.ateBimestre, a.ateBimestre),
    }),
    { previsaoInicial: zero(), reprevisao: zero(), noBimestre: zero(), ateBimestre: zero() }
  );
}

function linhaReceita(
  nivel: LinhaReceitaRreo["nivel"],
  codigo: string,
  rotulo: string,
  a: AgregadoReceita
): LinhaReceitaRreo {
  // PREVISÃO ATUALIZADA (a) = inicial + reprevisões (append-only, M02). Sem reprevisão, == inicial.
  const previsaoAtualizada = soma(a.previsaoInicial, a.reprevisao);
  return {
    nivel,
    codigo,
    rotulo,
    previsaoInicial: a.previsaoInicial.toFixed(2),
    previsaoAtualizada: previsaoAtualizada.toFixed(2),
    noBimestre: a.noBimestre.toFixed(2),
    percentNoBim: percent(a.noBimestre, previsaoAtualizada),
    ateBimestre: a.ateBimestre.toFixed(2),
    percentAteBim: percent(a.ateBimestre, previsaoAtualizada),
    saldo: toMoney(previsaoAtualizada.minus(a.ateBimestre)).toFixed(2), // R1
  };
}

function totalizarReceitas(linhas: readonly LinhaReceitaRreo[], rotulo: string): LinhaReceitaRreo {
  // soma SÓ as linhas de nível "categoria" (senão contaria em triplicado).
  const cats = linhas.filter((l) => l.nivel === "categoria");
  const a = agregar(
    cats.map((l) => ({
      previsaoInicial: toMoney(l.previsaoInicial),
      // reconstrói a reprevisão a partir das strings: atualizada − inicial.
      reprevisao: toMoney(toMoney(l.previsaoAtualizada).minus(toMoney(l.previsaoInicial))),
      noBimestre: toMoney(l.noBimestre),
      ateBimestre: toMoney(l.ateBimestre),
    }))
  );
  return linhaReceita("categoria", "", rotulo, a);
}

function rotuloCategoria(cat: string): string {
  return CATEGORIAS_RECEITA[cat as CategoriaReceita] ?? `Categoria ${cat}`;
}
function rotuloOrigem(ori: string): string {
  return ORIGEM_RECEITA[ori as ChaveOrigem] ?? `Origem ${ori}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// DESPESAS — categoria → grupo de natureza
// ═══════════════════════════════════════════════════════════════════════════

interface AgregadoDespesa {
  dotacaoInicial: Money;
  creditos: Money;
  empenhadasNoBim: Money;
  empenhadasAte: Money;
  liquidadasNoBim: Money;
  liquidadasAte: Money;
  pagasAte: Money;
  rpnp: Money;
}

function despesaZero(): AgregadoDespesa {
  return {
    dotacaoInicial: zero(), creditos: zero(),
    empenhadasNoBim: zero(), empenhadasAte: zero(),
    liquidadasNoBim: zero(), liquidadasAte: zero(),
    pagasAte: zero(), rpnp: zero(),
  };
}

async function montarDespesas(
  leitor: Tx,
  exercicio: number,
  inicio: Date,
  fim: Date,
  bimestre: Bimestre
): Promise<{ principais: readonly LinhaDespesaRreo[]; intra: readonly LinhaDespesaRreo[] }> {
  // DOTAÇÃO INICIAL: soma dos valorDotado das fichas do exercício, por (categoria, grupo).
  const fichas = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio },
    select: { id: true, valorDotado: true, naturezaDespesa: { select: { codCategoria: true, codNatureza: true } } },
  });
  const grupoPorFicha = new Map<string, { cat: string; grupo: string }>();
  const por = new Map<string, AgregadoDespesa>(); // chave `${cat}|${grupo}`
  const chave = (cat: string, grupo: string) => `${cat}|${grupo}`;
  const get = (cat: string, grupo: string) => {
    const k = chave(cat, grupo);
    const acc = por.get(k) ?? despesaZero();
    por.set(k, acc);
    return acc;
  };

  for (const f of fichas) {
    const cat = f.naturezaDespesa.codCategoria;
    const grupo = f.naturezaDespesa.codNatureza;
    grupoPorFicha.set(f.id, { cat, grupo });
    const acc = get(cat, grupo);
    acc.dotacaoInicial = soma(acc.dotacaoInicial, toMoney(f.valorDotado.toFixed(2)));
  }

  // CRÉDITOS ADICIONAIS: itemCredito (SUPLEMENTACAO +, ANULACAO −), por ficha → grupo.
  const itens = await leitor.itemCredito.findMany({
    where: { ficha: { exercicio } },
    select: { tipo: true, valor: true, fichaId: true },
  });
  for (const it of itens) {
    const g = grupoPorFicha.get(it.fichaId);
    if (g === undefined) continue;
    const acc = get(g.cat, g.grupo);
    const v = toMoney(it.valor.toFixed(2));
    acc.creditos = it.tipo === "SUPLEMENTACAO" ? soma(acc.creditos, v) : toMoney(acc.creditos.minus(v));
  }

  // EMPENHADAS — líquido, por data do fato (empenho.data). (b) na janela, (c) até o fim.
  const empenhos = await leitor.empenho.findMany({
    where: { ficha: { exercicio } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true },
  });
  agregarEstornaveis(empenhos, grupoPorFicha, inicio, fim, get, "empenhadasNoBim", "empenhadasAte", (e) => e.data);

  // LIQUIDADAS — por liquidacao.data, via empenho → ficha → grupo.
  const liquidacoes = await leitor.liquidacao.findMany({
    where: { empenho: { ficha: { exercicio } } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, empenho: { select: { fichaId: true } } },
  });
  agregarEstornaveis(
    liquidacoes.map((l) => ({ ...l, fichaId: l.empenho.fichaId })),
    grupoPorFicha, inicio, fim, get, "liquidadasNoBim", "liquidadasAte", (l) => l.data
  );

  // PAGAS até o fim (acumulado), por pagamento.data, via liquidacao → empenho → ficha.
  const pagamentos = await leitor.pagamento.findMany({
    where: { liquidacao: { empenho: { ficha: { exercicio } } }, data: { lte: fim } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenho: { select: { fichaId: true } } } } },
  });
  const pagPorGrupo = new Map<string, typeof pagamentos>();
  for (const pg of pagamentos) {
    const g = grupoPorFicha.get(pg.liquidacao.empenho.fichaId);
    if (g === undefined) continue;
    const k = chave(g.cat, g.grupo);
    const arr = pagPorGrupo.get(k) ?? [];
    arr.push(pg);
    pagPorGrupo.set(k, arr);
  }
  for (const [k, arr] of pagPorGrupo) {
    const [cat, grupo] = k.split("|") as [string, string];
    get(cat, grupo).pagasAte = somaLiquidaEstornaveis(arr.map((pg) => ({ id: pg.id, valor: toMoney(pg.valor.toFixed(2)), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId })));
  }

  // RPNP INSCRITO — só no 6º bimestre. Lido de InscricaoRestosAPagar (M08). R4 amarra M05 × M08.
  if (bimestre === 6) {
    const inscricoes = await leitor.inscricaoRestosAPagar.findMany({
      where: { exercicioOrigem: exercicio, tipo: "NAO_PROCESSADO" },
      select: { valorInscrito: true, empenho: { select: { fichaId: true } } },
    });
    for (const i of inscricoes) {
      const g = grupoPorFicha.get(i.empenho.fichaId);
      if (g === undefined) continue;
      get(g.cat, g.grupo).rpnp = soma(get(g.cat, g.grupo).rpnp, toMoney(i.valorInscrito.toFixed(2)));
    }
  }

  // separa intra (categoria de despesa não distingue intra; o "intra" na despesa vem da
  // MODALIDADE 91 — mas o RREO da despesa não desdobra intra como a receita; mantemos vazio e
  // documentamos: a intra-despesa é a modalidade 91, tratada no bloco de consolidação futuro).
  const linhas = construirHierarquiaDespesa(por);
  return { principais: linhas, intra: [] };
}

function agregarEstornaveis<T extends { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null; fichaId: string }>(
  linhas: readonly T[],
  grupoPorFicha: ReadonlyMap<string, { cat: string; grupo: string }>,
  inicio: Date,
  fim: Date,
  get: (cat: string, grupo: string) => AgregadoDespesa,
  campoBim: "empenhadasNoBim" | "liquidadasNoBim",
  campoAte: "empenhadasAte" | "liquidadasAte",
  dataDe: (l: T) => Date
): void {
  // agrupa por grupo, e dentro do grupo separa a janela (b) do acumulado (c). O líquido tem de
  // ser calculado sobre o CONJUNTO (originais + estornos), então agrupamos e só então somamos.
  const porGrupoBim = new Map<string, T[]>();
  const porGrupoAte = new Map<string, T[]>();
  for (const l of linhas) {
    const g = grupoPorFicha.get(l.fichaId);
    if (g === undefined) continue;
    const k = `${g.cat}|${g.grupo}`;
    const d = dataDe(l);
    if (d <= fim) {
      (porGrupoAte.get(k) ?? porGrupoAte.set(k, []).get(k)!).push(l);
      if (d >= inicio) (porGrupoBim.get(k) ?? porGrupoBim.set(k, []).get(k)!).push(l);
    }
  }
  const aplicar = (mapa: Map<string, T[]>, campo: "empenhadasNoBim" | "liquidadasNoBim" | "empenhadasAte" | "liquidadasAte") => {
    for (const [k, arr] of mapa) {
      const [cat, grupo] = k.split("|") as [string, string];
      (get(cat, grupo) as unknown as Record<string, Money>)[campo] = somaLiquidaEstornaveis(
        arr.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }))
      );
    }
  };
  aplicar(porGrupoBim, campoBim);
  aplicar(porGrupoAte, campoAte);
}

function construirHierarquiaDespesa(por: ReadonlyMap<string, AgregadoDespesa>): readonly LinhaDespesaRreo[] {
  const linhas: LinhaDespesaRreo[] = [];
  const entradas = [...por.entries()];
  const categorias = [...new Set(entradas.map(([k]) => k.split("|")[0]!))].sort();

  for (const cat of categorias) {
    const daCat = entradas.filter(([k]) => k.split("|")[0] === cat);
    const aggCat = agregarDespesa(daCat.map(([, a]) => a));
    linhas.push(linhaDespesa("categoria", cat, CATEGORIAS_DESPESA[cat] ?? `Categoria ${cat}`, aggCat));

    for (const [k, a] of daCat.sort(([x], [y]) => x.localeCompare(y))) {
      const grupo = k.split("|")[1]!;
      linhas.push(linhaDespesa("grupo", grupo, GRUPOS_DESPESA[grupo] ?? `Grupo ${grupo}`, a));
    }
  }
  return linhas;
}

function agregarDespesa(as: readonly AgregadoDespesa[]): AgregadoDespesa {
  return as.reduce<AgregadoDespesa>((acc, a) => ({
    dotacaoInicial: soma(acc.dotacaoInicial, a.dotacaoInicial),
    creditos: soma(acc.creditos, a.creditos),
    empenhadasNoBim: soma(acc.empenhadasNoBim, a.empenhadasNoBim),
    empenhadasAte: soma(acc.empenhadasAte, a.empenhadasAte),
    liquidadasNoBim: soma(acc.liquidadasNoBim, a.liquidadasNoBim),
    liquidadasAte: soma(acc.liquidadasAte, a.liquidadasAte),
    pagasAte: soma(acc.pagasAte, a.pagasAte),
    rpnp: soma(acc.rpnp, a.rpnp),
  }), despesaZero());
}

function linhaDespesa(nivel: LinhaDespesaRreo["nivel"], codigo: string, rotulo: string, a: AgregadoDespesa): LinhaDespesaRreo {
  const dotacaoAtualizada = soma(a.dotacaoInicial, a.creditos);
  return {
    nivel, codigo, rotulo,
    dotacaoInicial: a.dotacaoInicial.toFixed(2),
    dotacaoAtualizada: dotacaoAtualizada.toFixed(2),
    empenhadasNoBim: a.empenhadasNoBim.toFixed(2),
    empenhadasAte: a.empenhadasAte.toFixed(2),
    liquidadasNoBim: a.liquidadasNoBim.toFixed(2),
    liquidadasAte: a.liquidadasAte.toFixed(2),
    saldoDotacao: toMoney(dotacaoAtualizada.minus(a.empenhadasAte)).toFixed(2),
    pagasAte: a.pagasAte.toFixed(2),
    inscritasRpnp: a.rpnp.toFixed(2),
  };
}

function totalizarDespesas(linhas: readonly LinhaDespesaRreo[], rotulo: string): LinhaDespesaRreo {
  const cats = linhas.filter((l) => l.nivel === "categoria");
  const a = agregarDespesa(cats.map((l) => ({
    dotacaoInicial: toMoney(l.dotacaoInicial),
    creditos: toMoney(toMoney(l.dotacaoAtualizada).minus(toMoney(l.dotacaoInicial))),
    empenhadasNoBim: toMoney(l.empenhadasNoBim),
    empenhadasAte: toMoney(l.empenhadasAte),
    liquidadasNoBim: toMoney(l.liquidadasNoBim),
    liquidadasAte: toMoney(l.liquidadasAte),
    pagasAte: toMoney(l.pagasAte),
    rpnp: toMoney(l.inscritasRpnp),
  })));
  return linhaDespesa("categoria", "", rotulo, a);
}

/**
 * "SALDOS DE EXERCÍCIOS ANTERIORES" — o montante dos créditos abertos por SUPERÁVIT FINANCEIRO.
 *
 * ⚠️ MESMA FONTE do Anexo 12 (`lerSaldosExerciciosAnteriores`, cf765b0): `itemCredito` de
 * decreto com `origemRecurso = SUPERAVIT_FINANCEIRO`. A query é replicada aqui (não importada)
 * porque a privada do Anexo 12 corta diferente; mas a VERDADE é a mesma tabela, e um teste
 * cruzado as manteria juntas se divergirem.
 */
async function lerSaldosExerciciosAnteriores(leitor: Tx, exercicio: number): Promise<Money> {
  const itens = await leitor.itemCredito.findMany({
    where: { tipo: "SUPLEMENTACAO", ficha: { exercicio }, decreto: { origemRecurso: "SUPERAVIT_FINANCEIRO" } },
    select: { valor: true },
  });
  return itens.reduce((acc, i) => soma(acc, toMoney(i.valor.toFixed(2))), zero());
}
