import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 2: DEMONSTRATIVO DA EXECUÇÃO DAS DESPESAS POR FUNÇÃO/SUBFUNÇÃO.
 * LRF art. 52, II · MDF/STN 15ª edição (Portaria STN/MF 2.057) · Portaria MOG 42/1999.
 *
 * ═══ ⚠️ NASCE AO LADO DO ANEXO 1, E POR QUÊ ═══
 * O Anexo 1 (rreo-anexo1.ts) olha a despesa pela CLASSIFICAÇÃO ECONÔMICA (categoria × grupo). O
 * Anexo 2 olha a MESMA despesa pela CLASSIFICAÇÃO FUNCIONAL (função × subfunção). É o MESMO
 * universo, o MESMO corte (a data do FATO — `empenho.data`, `liquidacao.data`, NUNCA `criadoEm`,
 * a lição do Anexo 1), lido por dois caminhos.
 *
 * Não reuso o `montarDespesas` do Anexo 1 (ele é privado e fixa o agrupamento econômico) — e a
 * regra deste bloco é não tocar o Anexo 1. Em vez de refatorar, confio na IDENTIDADE **A1**: o
 * TOTAL (III) do Anexo 2 tem de bater, coluna a coluna, com a despesa do Anexo 1. Dois caminhos
 * de leitura sobre o mesmo razão, confrontados — e se divergirem, A1 grita. É a confrontação de
 * duas fontes, não a duplicação de uma.
 *
 * ═══ LEITURA PURA (o grep-teste t8 proíbe escrita e soma bruta aqui) ═══
 *
 * ═══ AS IDENTIDADES (todas com mutação no teste) ═══
 *   A1  TOTAL(III), por coluna == a despesa correspondente do Anexo 1.
 *   A2  Σ subfunções == função; Σ funções + Reserva == (I).
 *   A3  (c) == (a) − (b até); (e) == (a) − (d até).
 *   A4  Σ(f) por função == Σ InscricaoRestosAPagar do exercício == (f) do Anexo 1.
 *   A5  "até o bimestre N" == Σ "no bimestre" 1..N.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaFuncional {
  /** "funcao" | "subfuncao" | "reserva" | "subtotal" | "total". */
  readonly nivel: "funcao" | "subfuncao" | "reserva" | "subtotal" | "total";
  /** Código da função (2 díg) ou "função|subfunção" (2+3). Vazio nas linhas agregadas. */
  readonly codigo: string;
  readonly rotulo: string;
  readonly dotacaoInicial: string;
  /** (a) inicial + créditos (suplementações − anulações). */
  readonly dotacaoAtualizada: string;
  readonly empenhadasNoBim: string;
  readonly empenhadasAte: string;
  /** (c) = (a) − (b até). */
  readonly saldoEmpenhar: string;
  readonly liquidadasNoBim: string;
  readonly liquidadasAte: string;
  /** (e) = (a) − (d até). */
  readonly saldoLiquidar: string;
  /** (f) — só no último bimestre; senão "0.00". Lida de InscricaoRestosAPagar (M08). */
  readonly inscritasRpnp: string;
}

export interface Anexo2 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  /** (I) DESPESAS (EXCETO INTRAORÇAMENTÁRIAS) — funções + Reserva de Contingência. */
  readonly despesas: readonly LinhaFuncional[];
  /** A linha (I) totalizada. */
  readonly subtotalExcetoIntra: LinhaFuncional;
  /** (II) DESPESAS INTRAORÇAMENTÁRIAS — modalidade de aplicação 91, tabela própria. */
  readonly intra: readonly LinhaFuncional[];
  readonly subtotalIntra: LinhaFuncional;
  /** (III) TOTAL = (I) + (II). */
  readonly total: LinhaFuncional;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

interface Agregado {
  dotacaoInicial: Money;
  creditos: Money;
  empenhadasNoBim: Money;
  empenhadasAte: Money;
  liquidadasNoBim: Money;
  liquidadasAte: Money;
  rpnp: Money;
}

function agregadoZero(): Agregado {
  return {
    dotacaoInicial: zero(), creditos: zero(),
    empenhadasNoBim: zero(), empenhadasAte: zero(),
    liquidadasNoBim: zero(), liquidadasAte: zero(),
    rpnp: zero(),
  };
}

function somarAgregados(as: readonly Agregado[]): Agregado {
  return as.reduce<Agregado>((acc, a) => ({
    dotacaoInicial: soma(acc.dotacaoInicial, a.dotacaoInicial),
    creditos: soma(acc.creditos, a.creditos),
    empenhadasNoBim: soma(acc.empenhadasNoBim, a.empenhadasNoBim),
    empenhadasAte: soma(acc.empenhadasAte, a.empenhadasAte),
    liquidadasNoBim: soma(acc.liquidadasNoBim, a.liquidadasNoBim),
    liquidadasAte: soma(acc.liquidadasAte, a.liquidadasAte),
    rpnp: soma(acc.rpnp, a.rpnp),
  }), agregadoZero());
}

function montarLinha(
  nivel: LinhaFuncional["nivel"],
  codigo: string,
  rotulo: string,
  a: Agregado,
  reserva = false
): LinhaFuncional {
  const dotacaoAtualizada = soma(a.dotacaoInicial, a.creditos);
  // ⚠️ A RESERVA DE CONTINGÊNCIA preenche APENAS dotação e saldos — ela NÃO se empenha nem se
  // liquida (enquanto reserva, não há execução; ela é remanejada para outras dotações via
  // crédito). Empenhada/liquidada = 0, e o saldo é a dotação inteira.
  const empenhadasNoBim = reserva ? zero() : a.empenhadasNoBim;
  const empenhadasAte = reserva ? zero() : a.empenhadasAte;
  const liquidadasNoBim = reserva ? zero() : a.liquidadasNoBim;
  const liquidadasAte = reserva ? zero() : a.liquidadasAte;
  return {
    nivel,
    codigo,
    rotulo,
    dotacaoInicial: a.dotacaoInicial.toFixed(2),
    dotacaoAtualizada: dotacaoAtualizada.toFixed(2),
    empenhadasNoBim: empenhadasNoBim.toFixed(2),
    empenhadasAte: empenhadasAte.toFixed(2),
    saldoEmpenhar: toMoney(dotacaoAtualizada.minus(empenhadasAte)).toFixed(2), // (c) = (a) − (b)
    liquidadasNoBim: liquidadasNoBim.toFixed(2),
    liquidadasAte: liquidadasAte.toFixed(2),
    saldoLiquidar: toMoney(dotacaoAtualizada.minus(liquidadasAte)).toFixed(2), // (e) = (a) − (d)
    inscritasRpnp: (reserva ? zero() : a.rpnp).toFixed(2),
  };
}

/** A linha somada a partir de linhas de saída (para subtotais/total — reconstrói o agregado). */
function totalizar(linhas: readonly LinhaFuncional[], nivel: LinhaFuncional["nivel"], rotulo: string): LinhaFuncional {
  const a = somarAgregados(linhas.map((l) => ({
    dotacaoInicial: toMoney(l.dotacaoInicial),
    creditos: toMoney(toMoney(l.dotacaoAtualizada).minus(toMoney(l.dotacaoInicial))),
    empenhadasNoBim: toMoney(l.empenhadasNoBim),
    empenhadasAte: toMoney(l.empenhadasAte),
    liquidadasNoBim: toMoney(l.liquidadasNoBim),
    liquidadasAte: toMoney(l.liquidadasAte),
    rpnp: toMoney(l.inscritasRpnp),
  })));
  return montarLinha(nivel, "", rotulo, a);
}

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

interface FichaInfo {
  readonly funcaoCodigo: string;
  readonly funcaoNome: string;
  readonly subfuncaoCodigo: string;
  readonly subfuncaoNome: string;
  readonly valorDotado: Money;
  /** ⚠️ Reserva de Contingência: categoria econômica 9 — o mesmo sinal do Anexo 12. */
  readonly ehReserva: boolean;
  /** modalidade de aplicação 91 = intraorçamentária. */
  readonly ehIntra: boolean;
}

export async function anexo2(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Anexo2> {
  const { inicio, fim } = janelaDoBimestre(p.exercicio, p.bimestre);

  // ── as fichas do exercício, com a funcional e os sinais (reserva / intra) ──
  const fichasRaw = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio: p.exercicio },
    select: {
      id: true,
      valorDotado: true,
      funcao: { select: { codigo: true, nome: true } },
      subfuncao: { select: { codigo: true, nome: true } },
      naturezaDespesa: { select: { codCategoria: true, codModalidade: true } },
    },
  });
  const fichas = new Map<string, FichaInfo>();
  for (const f of fichasRaw) {
    fichas.set(f.id, {
      funcaoCodigo: f.funcao.codigo,
      funcaoNome: f.funcao.nome,
      subfuncaoCodigo: f.subfuncao.codigo,
      subfuncaoNome: f.subfuncao.nome,
      valorDotado: toMoney(f.valorDotado.toFixed(2)),
      ehReserva: f.naturezaDespesa.codCategoria === "9",
      ehIntra: f.naturezaDespesa.codModalidade === "91",
    });
  }

  // ── o agregado por FICHA (dotação, créditos, empenhadas, liquidadas, RPNP) ──
  const porFicha = new Map<string, Agregado>();
  const get = (fichaId: string): Agregado => {
    const a = porFicha.get(fichaId) ?? agregadoZero();
    porFicha.set(fichaId, a);
    return a;
  };
  for (const [id, info] of fichas) get(id).dotacaoInicial = info.valorDotado;

  // CRÉDITOS (M03): SUPLEMENTACAO +, ANULACAO −.
  const itens = await leitor.itemCredito.findMany({
    where: { ficha: { exercicio: p.exercicio } },
    select: { tipo: true, valor: true, fichaId: true },
  });
  for (const it of itens) {
    if (!fichas.has(it.fichaId)) continue;
    const a = get(it.fichaId);
    const v = toMoney(it.valor.toFixed(2));
    a.creditos = it.tipo === "SUPLEMENTACAO" ? soma(a.creditos, v) : toMoney(a.creditos.minus(v));
  }

  // EMPENHADAS — líquido, por empenho.data. (b) na janela, (c/até) acumulado.
  const empenhos = await leitor.empenho.findMany({
    where: { ficha: { exercicio: p.exercicio } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true },
  });
  agregarPorFicha(empenhos, (e) => e.data, inicio, fim, get, "empenhadasNoBim", "empenhadasAte");

  // LIQUIDADAS — por liquidacao.data, via empenho → ficha.
  const liquidacoes = await leitor.liquidacao.findMany({
    where: { empenho: { ficha: { exercicio: p.exercicio } } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, empenho: { select: { fichaId: true } } },
  });
  agregarPorFicha(
    liquidacoes.map((l) => ({ ...l, fichaId: l.empenho.fichaId })),
    (l) => l.data, inicio, fim, get, "liquidadasNoBim", "liquidadasAte"
  );

  // RPNP — só no último bimestre (6). Lido de InscricaoRestosAPagar (M08). A4 amarra M05×M08.
  if (p.bimestre === 6) {
    const inscricoes = await leitor.inscricaoRestosAPagar.findMany({
      where: { exercicioOrigem: p.exercicio, tipo: "NAO_PROCESSADO" },
      select: { valorInscrito: true, empenho: { select: { fichaId: true } } },
    });
    for (const i of inscricoes) {
      if (!fichas.has(i.empenho.fichaId)) continue;
      get(i.empenho.fichaId).rpnp = soma(get(i.empenho.fichaId).rpnp, toMoney(i.valorInscrito.toFixed(2)));
    }
  }

  // ── monta os dois quadros: (I) exceto intra (funções + reserva) e (II) intra ──
  const principais = construirFuncional(fichas, porFicha, false);
  const intraLinhas = construirFuncional(fichas, porFicha, true);

  const subtotalExcetoIntra = totalizar(
    principais.filter((l) => l.nivel === "funcao" || l.nivel === "reserva"),
    "subtotal",
    "DESPESAS (EXCETO INTRAORÇAMENTÁRIAS) (I)"
  );
  const subtotalIntra = totalizar(
    intraLinhas.filter((l) => l.nivel === "funcao"),
    "subtotal",
    "DESPESAS (INTRAORÇAMENTÁRIAS) (II)"
  );
  const total = totalizar([subtotalExcetoIntra, subtotalIntra], "total", "TOTAL (III) = (I) + (II)");

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    despesas: principais,
    subtotalExcetoIntra,
    intra: intraLinhas,
    subtotalIntra,
    total,
  };
}

function agregarPorFicha<T extends { id: string; valor: { toFixed(n: number): string }; estornoDeId: string | null; anulacaoParcialDeId: string | null; fichaId: string }>(
  linhas: readonly T[],
  dataDe: (l: T) => Date,
  inicio: Date,
  fim: Date,
  get: (fichaId: string) => Agregado,
  campoBim: "empenhadasNoBim" | "liquidadasNoBim",
  campoAte: "empenhadasAte" | "liquidadasAte"
): void {
  // agrupa por ficha, separando janela (b) e acumulado (até). O líquido é sobre o CONJUNTO
  // (originais + estornos + parciais), então agrupamos e só então somamos.
  const porFichaBim = new Map<string, T[]>();
  const porFichaAte = new Map<string, T[]>();
  for (const l of linhas) {
    const d = dataDe(l);
    if (d > fim) continue;
    (porFichaAte.get(l.fichaId) ?? porFichaAte.set(l.fichaId, []).get(l.fichaId)!).push(l);
    if (d >= inicio) (porFichaBim.get(l.fichaId) ?? porFichaBim.set(l.fichaId, []).get(l.fichaId)!).push(l);
  }
  const aplicar = (mapa: Map<string, T[]>, campo: "empenhadasNoBim" | "liquidadasNoBim" | "empenhadasAte" | "liquidadasAte") => {
    for (const [fichaId, arr] of mapa) {
      (get(fichaId) as unknown as Record<string, Money>)[campo] = somaLiquidaEstornaveis(
        arr.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId }))
      );
    }
  };
  aplicar(porFichaBim, campoBim);
  aplicar(porFichaAte, campoAte);
}

/**
 * Constrói a hierarquia FUNÇÃO → SUBFUNÇÃO, filtrando pelo lado (intra ou não), e acrescenta a
 * linha da RESERVA DE CONTINGÊNCIA (só no quadro principal).
 */
function construirFuncional(
  fichas: ReadonlyMap<string, FichaInfo>,
  porFicha: ReadonlyMap<string, Agregado>,
  querIntra: boolean
): readonly LinhaFuncional[] {
  // ── a RESERVA fica FORA da hierarquia de funções (linha própria), e só no quadro principal ──
  const reservaFichas = [...fichas].filter(([, f]) => f.ehReserva && f.ehIntra === querIntra);
  const funcionaisFichas = [...fichas].filter(([, f]) => !f.ehReserva && f.ehIntra === querIntra);

  const linhas: LinhaFuncional[] = [];

  // agrupa as fichas funcionais por função → subfunção.
  const funcoes = [...new Set(funcionaisFichas.map(([, f]) => f.funcaoCodigo))].sort();
  for (const funcaoCod of funcoes) {
    const daFuncao = funcionaisFichas.filter(([, f]) => f.funcaoCodigo === funcaoCod);
    const nomeFuncao = daFuncao[0]![1].funcaoNome;
    const aggFuncao = somarAgregados(daFuncao.map(([id]) => porFicha.get(id) ?? agregadoZero()));
    linhas.push(montarLinha("funcao", funcaoCod, nomeFuncao, aggFuncao));

    // subfunções (podem ser ATÍPICAS — reportamos o que a ficha declara, sem guard de tipicidade).
    const subs = [...new Set(daFuncao.map(([, f]) => f.subfuncaoCodigo))].sort();
    for (const subCod of subs) {
      const daSub = daFuncao.filter(([, f]) => f.subfuncaoCodigo === subCod);
      const nomeSub = daSub[0]![1].subfuncaoNome;
      const aggSub = somarAgregados(daSub.map(([id]) => porFicha.get(id) ?? agregadoZero()));
      linhas.push(montarLinha("subfuncao", `${funcaoCod}${subCod}`, nomeSub, aggSub));
    }
  }

  // ── a RESERVA DE CONTINGÊNCIA (só no principal) ──
  if (reservaFichas.length > 0) {
    const agg = somarAgregados(reservaFichas.map(([id]) => porFicha.get(id) ?? agregadoZero()));
    linhas.push(montarLinha("reserva", "", "RESERVA DE CONTINGÊNCIA", agg, true));
  }

  return linhas;
}
