import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  restosParaAnexo7,
  type InscricaoParaAnexo7,
} from "../m08-restos-a-pagar/consultas.js";

/**
 * RREO — ANEXO 7: DEMONSTRATIVO DOS RESTOS A PAGAR POR PODER E ÓRGÃO.
 * LRF art. 53, V · MDF 15ª ed. (STN), Tabela 7.
 *
 * ═══ DOIS BLOCOS, E A DIFERENÇA É A LIQUIDAÇÃO ═══
 * O demonstrativo separa os RP em dois blocos, com colunas próprias:
 *   BLOCO 1 — RP Processados e RPNP LIQUIDADOS EM EXERCÍCIOS ANTERIORES:
 *     Inscritos: em exercícios anteriores (a) | em 31/12 do ano anterior (b)
 *     Pagos (c) · Cancelados (d) · Saldo e = (a+b) − (c+d)
 *   BLOCO 2 — RP NÃO PROCESSADOS (ainda não liquidados, ou liquidados NO ano de referência):
 *     Inscritos: em exercícios anteriores (f) | em 31/12 do ano anterior (g)
 *     Liquidados (h) · Pagos (i) · Cancelados (j) · Saldo k = (f+g) − (i+j)
 *   Saldo total l = e + k.
 *
 * ⚠️ (h) É INFORMATIVA — NÃO ENTRA EM k. Liquidar um RPNP não extingue a obrigação, só a
 * qualifica para pagamento (a doutrina do próprio M08). Por isso o RPNP liquidado NO exercício de
 * referência PERMANECE no bloco 2 e aparece em (h); só MIGRA para o bloco 1 no exercício SEGUINTE,
 * quando a liquidação já é "de exercício anterior".
 *
 * ═══ A MIGRAÇÃO (a regra que decide o bloco) ═══
 * Para o exercício de referência `ref`, uma inscrição vai para o BLOCO 1 se:
 *   · é PROCESSADO; ou
 *   · é NÃO PROCESSADO e foi LIQUIDADA (LIQUIDACAO_RP) em algum ano < ref.
 * Senão, BLOCO 2 (RPNP nunca liquidado, ou liquidado só em `ref`).
 * ⚠️ FRONTEIRA NOMEADA: a classificação é da inscrição INTEIRA. Uma liquidação PARCIAL de um mesmo
 * RPNP repartida através da virada de `ref` (parte antes, parte em/depois) não é desdobrada — o
 * sistema liquida RPNP por inteiro; o split intra-inscrição é pendência documentada.
 *
 * ═══ PARTIÇÃO DAS INSCRITAS (a/b, f/g) — pelo ANO DE INSCRIÇÃO ═══
 * `exercicioOrigem == ref−1` → coluna (b)/(g); `< ref−1` → (a)/(f). O valor é o SALDO DE ABERTURA
 * (inscrito − pago − cancelado dos anos ANTERIORES a `ref`), não o inscrito bruto — é o que
 * "sobrou" para o exercício de referência começar.
 *
 * ═══ PODER E ÓRGÃO — FAIL-CLOSED ═══
 * Cada órgão cai no seu poder pelo `DeParaOrgaoPoder`. Órgão sem poder mapeado FAZ O GERADOR
 * PARAR, nomeando o órgão — é publicação por poder ao TCE, e um resto "sem poder" ou empurrado
 * para um padrão seria um número no lugar errado. (Contraste com o Anexo 3: lá o não-mapeado é
 * fail-open de apresentação; aqui é fail-closed de publicação.)
 *
 * ═══ INTRA (II) ═══
 * Modalidade de aplicação 91 — o MESMO teste do Anexo 2. Os RP intra saem numa tabela própria (II)
 * e não entram no (I); o total (III) = (I) + (II).
 *
 * ═══ AS IDENTIDADES AUTO-EXECUTÁVEIS ═══
 *   R1  e == (a+b)−(c+d); k == (f+g)−(i+j); l == e+k, por linha.
 *   R2  Σ órgãos == poder; Σ poderes == (I); (III) == (I)+(II).
 *   R3  (g) == Σ InscricaoRestosAPagar NP do encerramento ref−1 (cruza com Anexo 2 de ref−1).
 *   R4  cancelados (d)+(j) == cancelamento de RP do exercício (a MESMA fonte do MANAD).
 *   R5  migração: mesmos dados, dois anos de referência → colunas certas (bloco 2 em ref−1,
 *       bloco 1 em ref).
 *
 * ═══ LEITURA PURA, COMPOSTA ═══
 * Zero escrita, zero SUM bruto. A aritmética de RP (líquido de estornos, sinal) é do M08
 * (`restosParaAnexo7`); o motor só compõe blocos, poder/órgão e a hierarquia. O grep-teste proíbe
 * escrita e agregação bruta aqui.
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

/** As 11 células de valor de uma linha (a..l; (h) informativa fora de k). */
export interface CelulasAnexo7 {
  /** BLOCO 1 */
  readonly inscExAnterioresB1: string; // (a)
  readonly inscAnoAnteriorB1: string; // (b)
  readonly pagosB1: string; // (c)
  readonly canceladosB1: string; // (d)
  readonly saldoB1: string; // (e) = (a+b)−(c+d)
  /** BLOCO 2 */
  readonly inscExAnterioresB2: string; // (f)
  readonly inscAnoAnteriorB2: string; // (g)
  readonly liquidadosB2: string; // (h) — informativa
  readonly pagosB2: string; // (i)
  readonly canceladosB2: string; // (j)
  readonly saldoB2: string; // (k) = (f+g)−(i+j)
  /** TOTAL */
  readonly saldoTotal: string; // (l) = e+k
}

export interface LinhaAnexo7 extends CelulasAnexo7 {
  /** "poder" (destaque) | "orgao" (indentado) | "total". */
  readonly nivel: "poder" | "orgao" | "total";
  readonly chave: string;
  readonly rotulo: string;
}

export interface Anexo7 {
  readonly exercicio: number;
  /** (I) RESTOS A PAGAR (EXCETO INTRAORÇAMENTÁRIOS) — poderes com órgãos. */
  readonly excetoIntra: readonly LinhaAnexo7[];
  readonly subtotalExcetoIntra: LinhaAnexo7; // (I)
  /** (II) RESTOS A PAGAR (INTRAORÇAMENTÁRIOS) — modalidade 91. */
  readonly intra: readonly LinhaAnexo7[];
  readonly subtotalIntra: LinhaAnexo7; // (II)
  readonly total: LinhaAnexo7; // (III) = (I) + (II)
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE ARITMÉTICA
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

/** Um acumulador mutável das 11 medidas (Money), antes de virar strings. */
interface Acc {
  a: Money; b: Money; c: Money; d: Money;
  f: Money; g: Money; h: Money; i: Money; j: Money;
}
const accZero = (): Acc => ({
  a: zero(), b: zero(), c: zero(), d: zero(),
  f: zero(), g: zero(), h: zero(), i: zero(), j: zero(),
});
function accSoma(x: Acc, y: Acc): Acc {
  return {
    a: soma(x.a, y.a), b: soma(x.b, y.b), c: soma(x.c, y.c), d: soma(x.d, y.d),
    f: soma(x.f, y.f), g: soma(x.g, y.g), h: soma(x.h, y.h), i: soma(x.i, y.i), j: soma(x.j, y.j),
  };
}

/** Fecha o Acc em células (string), calculando (e), (k), (l) — R1 é por construção. */
function celulasDe(acc: Acc): CelulasAnexo7 {
  const e = toMoney(soma(acc.a, acc.b).minus(soma(acc.c, acc.d))); // (a+b)−(c+d)
  const k = toMoney(soma(acc.f, acc.g).minus(soma(acc.i, acc.j))); // (f+g)−(i+j) — (h) fora
  const l = soma(e, k);
  return {
    inscExAnterioresB1: acc.a.toFixed(2),
    inscAnoAnteriorB1: acc.b.toFixed(2),
    pagosB1: acc.c.toFixed(2),
    canceladosB1: acc.d.toFixed(2),
    saldoB1: e.toFixed(2),
    inscExAnterioresB2: acc.f.toFixed(2),
    inscAnoAnteriorB2: acc.g.toFixed(2),
    liquidadosB2: acc.h.toFixed(2),
    pagosB2: acc.i.toFixed(2),
    canceladosB2: acc.j.toFixed(2),
    saldoB2: k.toFixed(2),
    saldoTotal: l.toFixed(2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export async function anexo7(
  leitor: Tx,
  p: { readonly exercicio: number }
): Promise<Anexo7> {
  const ref = p.exercicio;

  // ── de-para órgão → poder (fail-closed é aplicado por inscrição, abaixo) ──
  const mapaPoder = new Map<string, string>();
  for (const d of await leitor.deParaOrgaoPoder.findMany({
    select: { orgaoCodigo: true, poder: true },
  })) {
    mapaPoder.set(d.orgaoCodigo, d.poder);
  }

  // ── as inscrições, já recortadas por ano do fato pelo M08 ──
  const inscricoes = await restosParaAnexo7(leitor, { exercicioReferencia: ref });

  // Acumuladores: [intra?][poder][orgao] → Acc.
  const porGrupo = {
    principal: new Map<string, Map<string, Acc>>(), // poder → (orgao → Acc)
    intra: new Map<string, Map<string, Acc>>(),
  };

  for (const insc of inscricoes) {
    const acc = classificarInscricao(insc, ref);
    if (acc === null) continue; // inscrição sem saldo nem movimento no recorte: não aparece

    const poder = mapaPoder.get(insc.orgaoCodigo);
    if (poder === undefined) {
      // FAIL-CLOSED: publicação por poder — órgão sem poder PARA o gerador, nomeando-o.
      throw new Error(
        `RREO Anexo 7: o órgão "${insc.orgaoCodigo}" tem Restos a Pagar mas NÃO está mapeado a um ` +
          `Poder (DeParaOrgaoPoder). O Anexo 7 publica por Poder e Órgão — mapeie o órgão ` +
          `(EXECUTIVO/LEGISLATIVO) e gere de novo. Nada foi omitido nem chutado.`
      );
    }

    const destino = insc.ehIntra ? porGrupo.intra : porGrupo.principal;
    const doPoder = destino.get(poder) ?? new Map<string, Acc>();
    destino.set(poder, doPoder);
    const doOrgao = doPoder.get(insc.orgaoCodigo) ?? accZero();
    doPoder.set(insc.orgaoCodigo, accSoma(doOrgao, acc));
  }

  const exceto = construirHierarquia(porGrupo.principal);
  const intra = construirHierarquia(porGrupo.intra);

  const subtotalExcetoIntra = linhaTotal(
    "SUBTOTAL_I",
    "RESTOS A PAGAR (EXCETO INTRAORÇAMENTÁRIOS) (I)",
    exceto.filter((l) => l.nivel === "poder")
  );
  const subtotalIntra = linhaTotal(
    "SUBTOTAL_II",
    "RESTOS A PAGAR (INTRAORÇAMENTÁRIOS) (II)",
    intra.filter((l) => l.nivel === "poder")
  );
  const total = linhaTotal("TOTAL_III", "TOTAL (III) = (I) + (II)", [
    subtotalExcetoIntra,
    subtotalIntra,
  ]);

  return {
    exercicio: ref,
    excetoIntra: exceto,
    subtotalExcetoIntra,
    intra,
    subtotalIntra,
    total,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A CLASSIFICAÇÃO DE UMA INSCRIÇÃO EM COLUNAS (a..j)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Distribui UMA inscrição nas colunas do bloco certo. Devolve `null` se, no recorte, a inscrição
 * não tem saldo de abertura NEM movimento no ano (não polui o relatório com linhas de zero).
 */
function classificarInscricao(insc: InscricaoParaAnexo7, ref: number): Acc | null {
  const acc = accZero();

  // saldo de abertura = inscrito − pago − cancelado dos anos ANTERIORES a `ref`.
  const abertura = toMoney(
    insc.inscrito.minus(insc.pagoAntes).minus(insc.canceladoAntes)
  );

  // BLOCO 1 se PROCESSADO, ou RPNP liquidado em ano < ref (a migração).
  const noBloco1 =
    insc.tipo === "PROCESSADO" || insc.liquidadoAntes.greaterThan(0);

  // partição das inscritas pelo ANO DE INSCRIÇÃO (exercicioOrigem).
  const inscritaAnoAnterior = insc.exercicioOrigem === ref - 1; // (b)/(g)

  if (noBloco1) {
    if (inscritaAnoAnterior) acc.b = abertura;
    else acc.a = abertura;
    acc.c = insc.pagoNo;
    acc.d = insc.canceladoNo;
  } else {
    if (inscritaAnoAnterior) acc.g = abertura;
    else acc.f = abertura;
    acc.h = insc.liquidadoNo; // informativa
    acc.i = insc.pagoNo;
    acc.j = insc.canceladoNo;
  }

  // nada a mostrar? (abertura zero e nenhum movimento no ano)
  const semMovimento =
    abertura.isZero() &&
    insc.pagoNo.isZero() &&
    insc.canceladoNo.isZero() &&
    insc.liquidadoNo.isZero();
  return semMovimento ? null : acc;
}

// ═══════════════════════════════════════════════════════════════════════════
// A HIERARQUIA poder → órgão
// ═══════════════════════════════════════════════════════════════════════════

/** A ordem canônica dos poderes no demonstrativo. */
const ORDEM_PODER = ["EXECUTIVO", "LEGISLATIVO"] as const;
const ROTULO_PODER: Record<string, string> = {
  EXECUTIVO: "PODER EXECUTIVO",
  LEGISLATIVO: "PODER LEGISLATIVO",
};

function construirHierarquia(
  porPoder: ReadonlyMap<string, Map<string, Acc>>
): readonly LinhaAnexo7[] {
  const linhas: LinhaAnexo7[] = [];
  const poderes = [...porPoder.keys()].sort(ordenarPoder);

  for (const poder of poderes) {
    const orgaos = porPoder.get(poder)!;
    const linhasOrgao: LinhaAnexo7[] = [...orgaos.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([orgao, acc]) => ({
        nivel: "orgao" as const,
        chave: `${poder}:${orgao}`,
        rotulo: `Órgão ${orgao}`,
        ...celulasDe(acc),
      }));

    const accPoder = [...orgaos.values()].reduce(accSoma, accZero());
    linhas.push({
      nivel: "poder",
      chave: poder,
      rotulo: ROTULO_PODER[poder] ?? poder,
      ...celulasDe(accPoder),
    });
    linhas.push(...linhasOrgao);
  }
  return linhas;
}

/** Poderes na ordem canônica; um poder fora do rol vai para o fim, por nome. */
function ordenarPoder(x: string, y: string): number {
  const ix = ORDEM_PODER.indexOf(x as (typeof ORDEM_PODER)[number]);
  const iy = ORDEM_PODER.indexOf(y as (typeof ORDEM_PODER)[number]);
  const rx = ix === -1 ? ORDEM_PODER.length : ix;
  const ry = iy === -1 ? ORDEM_PODER.length : iy;
  return rx !== ry ? rx - ry : x.localeCompare(y);
}

/** Uma linha de total = Σ das células de várias linhas (só as de nível "poder", para não duplicar). */
function linhaTotal(
  chave: string,
  rotulo: string,
  linhas: readonly LinhaAnexo7[]
): LinhaAnexo7 {
  const acc = linhas.reduce<Acc>((soFar, l) => accSoma(soFar, accDeLinha(l)), accZero());
  return { nivel: "total", chave, rotulo, ...celulasDe(acc) };
}

/** Reconstrói o Acc a partir das células de uma linha (para os totais). (e)/(k)/(l) são derivadas. */
function accDeLinha(l: LinhaAnexo7): Acc {
  return {
    a: toMoney(l.inscExAnterioresB1),
    b: toMoney(l.inscAnoAnteriorB1),
    c: toMoney(l.pagosB1),
    d: toMoney(l.canceladosB1),
    f: toMoney(l.inscExAnterioresB2),
    g: toMoney(l.inscAnoAnteriorB2),
    h: toMoney(l.liquidadosB2),
    i: toMoney(l.pagosB2),
    j: toMoney(l.canceladosB2),
  };
}
