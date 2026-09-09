import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { anexo3, janelaDosDozeMeses } from "./rreo-anexo3.js";

/**
 * RGF — ANEXO 1: DEMONSTRATIVO DA DESPESA COM PESSOAL. LRF art. 55, I, "a" · art. 18-20 · MDF 15ª ed.
 *
 * ═══ A DESPESA TOTAL COM PESSOAL (DTP) E O LIMITE ═══
 * O limite de pessoal (art. 20) é apurado sobre os ÚLTIMOS 12 MESES, POR PODER. A DTP é a despesa
 * BRUTA com pessoal (I) menos as NÃO COMPUTADAS (II); o percentual é DTP / RCL AJUSTADA. O limite
 * máximo é 54% (Executivo) ou 6% (Legislativo) da RCL; o prudencial é 0,95× e o alerta 0,90×.
 *
 * ═══ A JANELA E OS DOIS MOTORES ═══
 * A janela é a MESMA do Anexo 3 (12 meses, corte por data do fato) — um quadrimestre Q termina no
 * mês 4Q, o mesmo fim do bimestre 2Q. A RCL (IV) vem do Anexo 3 (`anexo3(...).rcl`) — dois motores,
 * UMA janela: se divergissem, o limite de pessoal e a RCL publicada seriam números diferentes.
 *
 * ═══ A PARTIÇÃO TEMPORAL DAS NÃO COMPUTADAS (§1º art. 19) ═══
 * "De período anterior" NÃO é uma flag — é temporal. Uma sentença judicial (elem. 91) ou DEA
 * (elem. 92) LIQUIDADA na janela conta na bruta (I); mas se o EMPENHO (o fato gerador) é de período
 * ANTERIOR à janela, ela é despesa "de período anterior" e DEDUZ em (II). O empenho fora da janela
 * é a "data do fato fora da janela" do §1º. Assim III = I − II fica coerente (II ⊆ I).
 *
 * ═══ POR PODER (via DeParaOrgaoPoder, o de-para do Anexo 7) ═══
 * Cada ficha cai no seu poder pelo órgão. O limite é aplicado ao PODER certo (54 Exec / 6 Legis).
 * Órgão sem poder mapeado FAZ o gerador parar (fail-closed) — é apuração de limite constitucional.
 *
 * ═══ AS IDENTIDADES ═══
 *   R1  III == I − II; VII == IV − V − VI − ACS; % e limites com ARRED HALF_EVEN.
 *   R2  IV == a linha III do Anexo 3 no mesmo mês de referência (dois motores, uma janela).
 *   R3  partição temporal: sentença com empenho DENTRO da janela conta em I e não deduz; empenho de
 *       período anterior deduz em II.
 *   R4  por poder: Σ DTP dos poderes == DTP consolidado; limites 54/6 no poder certo.
 *
 * Leitura pura, composta. Zero escrita, zero SUM bruto.
 */

export type Quadrimestre = 1 | 2 | 3;

const LIMITE_POR_PODER: Record<string, Money> = {
  EXECUTIVO: toMoney("54.00"),
  LEGISLATIVO: toMoney("6.00"),
};
const ROTULO_PODER: Record<string, string> = { EXECUTIVO: "Poder Executivo", LEGISLATIVO: "Poder Legislativo" };
const FATOR_PRUDENCIAL = toMoney("0.95");
const FATOR_ALERTA = toMoney("0.90");

const ELEMENTOS_INATIVOS: ReadonlySet<string> = new Set(["01", "03"]);
const ELEM_TERCEIRIZACAO = "34";
const ELEM_SENTENCA = "91";
const ELEM_DEA = "92";
const ELEMENTOS_INDENIZACAO: ReadonlySet<string> = new Set(["93", "94"]);

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaPessoal {
  readonly chave: string;
  readonly rotulo: string;
  readonly liquidadas: string; // (a)
  readonly rpnp: string; // (b)
  readonly total: string; // (a) + (b)
}
export interface LinhaNaoComputadaRgf {
  readonly chave: string;
  readonly rotulo: string;
  readonly valor: string;
}

export interface PoderRgf {
  readonly poder: string;
  readonly rotulo: string;
  readonly bruta: readonly LinhaPessoal[]; // ativo / inativo / terceirização
  readonly despesaBruta: LinhaPessoal; // (I)
  readonly naoComputadas: readonly LinhaNaoComputadaRgf[]; // (II)
  readonly totalNaoComputadas: string; // (II)
  readonly dtp: string; // (III) = I − II
  readonly percentDtp: string; // III / RCL AJUSTADA
  readonly limiteMaximo: string; // 54 / 6
  readonly limitePrudencial: string; // 0,95×
  readonly limiteAlerta: string; // 0,90×
  /** "abaixo" (verde, ≤ alerta) | "alerta" (âmbar, entre alerta e prudencial) | "acima" (vermelho, > prudencial). */
  readonly situacao: "abaixo" | "alerta" | "acima";
}

export interface Anexo1Rgf {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
  // APURAÇÃO DA RCL AJUSTADA (ente)
  readonly rcl: string; // (IV) == Anexo 3 linha III
  readonly emendasIndividuais: string; // (V)
  readonly emendasBancada: string; // (VI)
  readonly transferenciasAcsAce: string; // dedução CF 198 §11 (interruptor nomeado)
  readonly rclAjustada: string; // (VII)
  readonly poderes: readonly PoderRgf[];
  readonly consolidado: { readonly dtp: string; readonly percentDtp: string };
  readonly notas: readonly string[];
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

function percent(x: Money, a: Money): string {
  if (a.equals(0)) return "0.00";
  return toMoney(x.dividedBy(a).times(100)).toFixed(2);
}
function fatorDe(base: Money, f: Money): Money {
  return toMoney(base.times(f));
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function rgfAnexo1(
  leitor: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<Anexo1Rgf> {
  const notas: string[] = [];
  // a janela dos 12 meses termina no fim do quadrimestre = fim do bimestre 2Q.
  const bimestre = (p.quadrimestre * 2) as 2 | 4 | 6;
  const janelas = janelaDosDozeMeses(p.exercicio, bimestre);
  const desde = janelas[0]!.desde;
  const ate = janelas[11]!.ate;

  // ── RCL AJUSTADA (do Anexo 3, mesma janela) ──
  const a3 = await anexo3(leitor, { exercicio: p.exercicio, bimestre });
  const rcl = toMoney(a3.rcl.total12m); // (IV) == linha III do Anexo 3
  const emendasV = toMoney(a3.linhas.find((l) => l.chave === "EMENDAS_INDIVIDUAIS")?.total12m ?? "0.00");
  const emendasVI = toMoney(a3.linhas.find((l) => l.chave === "EMENDAS_BANCADA")?.total12m ?? "0.00");
  // ACS/ACE (CF 198 §11): dedução NOVA, sem natureza/CO no repositório → interruptor nomeado.
  const acsAce = zero();
  notas.push(
    "Transferências da União para ACS/ACE (CF art. 198 §11) — dedução da RCL para o limite de " +
      "pessoal — é interruptor vazio nomeado: não há natureza/código de acompanhamento próprio no " +
      "repositório. Entra quando o ente classificar essas transferências."
  );
  notas.push(
    "Inativos e pensionistas com recursos vinculados (não computados) dependem da classificação de " +
      "fonte do RPPS — pendência nomeada; hoje 0,00."
  );
  const rclAjustada = sub(sub(sub(rcl, emendasV), emendasVI), acsAce); // (VII)

  // ── DESPESA COM PESSOAL, dirigida pelas LIQUIDAÇÕES na janela (a janela cruza exercícios) ──
  const mapaPoder = new Map<string, string>();
  for (const d of await leitor.deParaOrgaoPoder.findMany({ select: { orgaoCodigo: true, poder: true } })) {
    mapaPoder.set(d.orgaoCodigo, d.poder);
  }
  const ehPessoal = { OR: [{ naturezaDespesa: { codNatureza: "1" } }, { naturezaDespesa: { codElemento: ELEM_TERCEIRIZACAO } }] };
  const poderDoOrgao = (codigo: string): string => {
    const poder = mapaPoder.get(codigo);
    if (poder === undefined) {
      throw new Error(
        `RGF Anexo 1: o órgão "${codigo}" tem despesa de pessoal mas NÃO está mapeado a um Poder ` +
          `(DeParaOrgaoPoder). O limite de pessoal é apurado por Poder (54% Executivo / 6% ` +
          `Legislativo) — mapeie o órgão e gere de novo.`
      );
    }
    return poder;
  };

  // acumulador por poder.
  const acc = new Map<string, AccPoder>();
  const doPoder = (poder: string): AccPoder => {
    const a = acc.get(poder) ?? accPoderZero();
    acc.set(poder, a);
    return a;
  };

  // liquidações na janela, com a ficha (poder/grupo/elemento) e a data do EMPENHO (fato gerador).
  const liqs = await leitor.liquidacao.findMany({
    where: { data: { gte: desde, lte: ate }, empenho: { ficha: ehPessoal } },
    select: {
      id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true,
      empenho: { select: { data: true, ficha: { select: { orgao: { select: { codigo: true } }, naturezaDespesa: { select: { codNatureza: true, codElemento: true } } } } } },
    },
  });
  // agrupa por (poder, elemento, empenhoAnterior) para somar o líquido de estornos corretamente.
  const grupos = new Map<string, { poder: string; elemento: string; anterior: boolean; linhas: typeof liqs }>();
  for (const l of liqs) {
    const f = l.empenho.ficha;
    const poder = poderDoOrgao(f.orgao.codigo);
    const elemento = f.naturezaDespesa.codElemento;
    const anterior = l.empenho.data < desde; // o EMPENHO (fato) é de período anterior à janela
    const chave = `${poder}|${elemento}|${anterior ? "A" : "N"}`;
    const g = grupos.get(chave) ?? { poder, elemento, anterior, linhas: [] };
    g.linhas.push(l);
    grupos.set(chave, g);
  }
  for (const g of grupos.values()) {
    const liquido = somaLiquidaEstornaveis(g.linhas.map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));
    aplicarPessoal(doPoder(g.poder), g.elemento, liquido, g.anterior, "liquidada");
  }

  // RPNP inscritos cujo encerramento (31/12 do ano de origem) está contido na janela.
  for (const i of await leitor.inscricaoRestosAPagar.findMany({ where: { tipo: "NAO_PROCESSADO", empenho: { ficha: ehPessoal } }, select: { valorInscrito: true, exercicioOrigem: true, empenho: { select: { ficha: { select: { orgao: { select: { codigo: true } }, naturezaDespesa: { select: { codElemento: true } } } } } } } })) {
    const dezembro = new Date(Date.UTC(i.exercicioOrigem, 11, 31, 23, 59, 59, 0));
    if (dezembro < desde || dezembro > ate) continue;
    const f = i.empenho.ficha;
    aplicarPessoal(doPoder(poderDoOrgao(f.orgao.codigo)), f.naturezaDespesa.codElemento, toMoney(i.valorInscrito.toFixed(2)), false, "rpnp");
  }

  const poderes = [...acc.keys()].sort(ordenarPoder).map((poder) => montarPoder(poder, acc.get(poder)!, rclAjustada));

  const dtpConsolidado = poderes.reduce((s, p2) => soma(s, toMoney(p2.dtp)), zero());

  return {
    exercicio: p.exercicio,
    quadrimestre: p.quadrimestre,
    rcl: rcl.toFixed(2),
    emendasIndividuais: emendasV.toFixed(2),
    emendasBancada: emendasVI.toFixed(2),
    transferenciasAcsAce: acsAce.toFixed(2),
    rclAjustada: rclAjustada.toFixed(2),
    poderes,
    consolidado: { dtp: dtpConsolidado.toFixed(2), percentDtp: percent(dtpConsolidado, rclAjustada) },
    notas,
  };
}

interface Par { liq: Money; rpnp: Money; }
interface AccPoder {
  ativo: Par;
  inativo: Par;
  terceirizacao: Par;
  indenizacoes: Money;
  sentencasAnteriores: Money;
  deaAnteriores: Money;
}
function accPoderZero(): AccPoder {
  return { ativo: { liq: zero(), rpnp: zero() }, inativo: { liq: zero(), rpnp: zero() }, terceirizacao: { liq: zero(), rpnp: zero() }, indenizacoes: zero(), sentencasAnteriores: zero(), deaAnteriores: zero() };
}

/** Soma um valor de pessoal na categoria do elemento; e nas não computadas quando for o caso. */
function aplicarPessoal(a: AccPoder, elemento: string, valor: Money, empenhoAnterior: boolean, campo: "liquidada" | "rpnp"): void {
  const cat = elemento === ELEM_TERCEIRIZACAO ? a.terceirizacao : ELEMENTOS_INATIVOS.has(elemento) ? a.inativo : a.ativo;
  if (campo === "liquidada") cat.liq = soma(cat.liq, valor);
  else cat.rpnp = soma(cat.rpnp, valor);
  // NÃO COMPUTADAS (subconjunto da bruta) — apuradas sobre a LIQUIDADA.
  if (campo === "liquidada") {
    if (ELEMENTOS_INDENIZACAO.has(elemento)) a.indenizacoes = soma(a.indenizacoes, valor);
    if (elemento === ELEM_SENTENCA && empenhoAnterior) a.sentencasAnteriores = soma(a.sentencasAnteriores, valor);
    if (elemento === ELEM_DEA && empenhoAnterior) a.deaAnteriores = soma(a.deaAnteriores, valor);
  }
}

function montarPoder(poder: string, a: AccPoder, rclAjustada: Money): PoderRgf {
  const indenizacoes = a.indenizacoes;
  const sentencasAnteriores = a.sentencasAnteriores;
  const deaAnteriores = a.deaAnteriores;

  const bruta: LinhaPessoal[] = [
    linhaPessoal("ATIVO", "Pessoal Ativo", a.ativo.liq, a.ativo.rpnp),
    linhaPessoal("INATIVO", "Pessoal Inativo e Pensionista", a.inativo.liq, a.inativo.rpnp),
    linhaPessoal("TERCEIRIZACAO", "Outras Desp. de Pessoal (terceirização — §1º art. 18)", a.terceirizacao.liq, a.terceirizacao.rpnp),
  ];
  const totalBrutaLiq = [a.ativo, a.inativo, a.terceirizacao].reduce((s, x) => soma(s, x.liq), zero());
  const totalBrutaRpnp = [a.ativo, a.inativo, a.terceirizacao].reduce((s, x) => soma(s, x.rpnp), zero());
  const despesaBruta = linhaPessoal("BRUTA", "DESPESA BRUTA COM PESSOAL (I)", totalBrutaLiq, totalBrutaRpnp);

  const naoComputadas: LinhaNaoComputadaRgf[] = [
    { chave: "INDENIZACOES", rotulo: "Indenizações por Demissão e Incentivo à Demissão Voluntária", valor: indenizacoes.toFixed(2) },
    { chave: "SENTENCAS_ANT", rotulo: "Decorrentes de Decisão Judicial de Período Anterior", valor: sentencasAnteriores.toFixed(2) },
    { chave: "DEA_ANT", rotulo: "Despesas de Exercícios Anteriores de Período Anterior", valor: deaAnteriores.toFixed(2) },
    { chave: "INATIVOS_VINCULADOS", rotulo: "Inativos e Pensionistas com Recursos Vinculados (RPPS)", valor: "0.00" },
  ];
  const totalNaoComputadas = naoComputadas.reduce((s, l) => soma(s, toMoney(l.valor)), zero());
  const dtp = sub(toMoney(despesaBruta.total), totalNaoComputadas);

  const limiteMaximoPct = LIMITE_POR_PODER[poder] ?? zero();
  const percentDtp = percent(dtp, rclAjustada);
  // limites em VALOR (% do RCL ajustada): máximo, prudencial (0,95×) e alerta (0,90×).
  const limiteMaximoValor = fatorDe(rclAjustada, toMoney(limiteMaximoPct.dividedBy(100)));
  const prudencialValor = fatorDe(limiteMaximoValor, FATOR_PRUDENCIAL);
  const alertaValor = fatorDe(limiteMaximoValor, FATOR_ALERTA);
  // faixa: ≤ alerta (verde) | entre alerta e prudencial (âmbar) | > prudencial (vermelho).
  const faixa: PoderRgf["situacao"] = dtp.greaterThan(prudencialValor) ? "acima" : dtp.greaterThan(alertaValor) ? "alerta" : "abaixo";

  return {
    poder,
    rotulo: ROTULO_PODER[poder] ?? poder,
    bruta,
    despesaBruta,
    naoComputadas,
    totalNaoComputadas: totalNaoComputadas.toFixed(2),
    dtp: dtp.toFixed(2),
    percentDtp,
    limiteMaximo: limiteMaximoPct.toFixed(2),
    limitePrudencial: toMoney(limiteMaximoPct.times(FATOR_PRUDENCIAL)).toFixed(2),
    limiteAlerta: toMoney(limiteMaximoPct.times(FATOR_ALERTA)).toFixed(2),
    situacao: faixa,
  };
}

function linhaPessoal(chave: string, rotulo: string, liq: Money, rpnp: Money): LinhaPessoal {
  return { chave, rotulo, liquidadas: liq.toFixed(2), rpnp: rpnp.toFixed(2), total: soma(liq, rpnp).toFixed(2) };
}

const ORDEM_PODER = ["EXECUTIVO", "LEGISLATIVO"] as const;
function ordenarPoder(x: string, y: string): number {
  const ix = ORDEM_PODER.indexOf(x as (typeof ORDEM_PODER)[number]);
  const iy = ORDEM_PODER.indexOf(y as (typeof ORDEM_PODER)[number]);
  const rx = ix === -1 ? ORDEM_PODER.length : ix;
  const ry = iy === -1 ? ORDEM_PODER.length : iy;
  return rx !== ry ? rx - ry : x.localeCompare(y);
}
