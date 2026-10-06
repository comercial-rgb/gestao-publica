import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { saldoDaDividaEm, travarDivida } from "./divida.js";

/**
 * V36 — AS PARCELAS DA DÍVIDA FUNDADA (TR 5.10.1.84) E O COMPARATIVO INFORMADO × PAGO.
 *
 * ═══ O QUE É INFORMADO E O QUE É FATO ═══
 * A parcela é o cronograma do CONTRATO, digitado (ou colado) por quem cadastra a dívida — a mesma autoridade,
 * `CADASTRAR_DIVIDA`. O sistema não calcula amortização: não há tabela Price nem SAC aqui, porque a regra é do
 * contrato e não do sistema. O PAGO é fato: as amortizações que o pagamento já grava na dívida
 * (`amortizarNoPagamento`), sem as estornadas.
 *
 * ═══ COMO O PAGO SE DISTRIBUI PELAS PARCELAS ═══
 * O pagamento não diz a que parcela se refere. A régua, declarada na tela e no papel: cada parcela recebe o que foi
 * amortizado ENTRE o vencimento anterior (exclusive) e o dela (inclusive), pelo dia civil do ente; o que foi pago
 * depois do último vencimento aparece numa linha própria. É comparação por período, não quitação — a tela não diz
 * "parcela paga".
 *
 * ═══ JUROS E ENCARGOS ═══
 * Informados, mas sem comparativo: o empenho de juros (grupo 2) não se liga à dívida no modelo atual (a guarda do
 * empenho exige dívida só no grupo 6). A tela diz isso.
 */

export interface ParcelaInformada {
  readonly numero: number;
  /** Dia civil "AAAA-MM-DD". */
  readonly vencimento: string;
  readonly valorPrincipal: string;
  readonly valorEncargos: string | null;
}

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dia civil no formato AAAA-MM-DD");

const zParcela = z.object({
  numero: z.number().int().positive(),
  vencimento: zDia,
  valorPrincipal: zMoney,
  valorEncargos: zMoney.nullable(),
});

const zInformar = z.object({
  dividaId: z.string().min(1),
  parcelas: z.array(zParcela).min(1),
  criadoPor: z.string().min(1),
});

const zSubstituir = z.object({
  parcelaId: z.string().min(1),
  vencimento: zDia,
  valorPrincipal: zMoney,
  valorEncargos: zMoney.nullable(),
  motivo: z.string().trim().min(5, "informe o motivo da correção"),
  criadoPor: z.string().min(1),
});

function conferirValores(p: { readonly numero: number; readonly valorPrincipal: Money; readonly valorEncargos: Money | null }): void {
  const principal = p.valorPrincipal;
  const encargos = p.valorEncargos ?? toMoney("0.00");
  if (principal.isNegative() || encargos.isNegative()) {
    throw new Error(`A parcela ${String(p.numero)} tem valor negativo. Nada foi gravado.`);
  }
  if (principal.plus(encargos).isZero()) {
    throw new Error(`A parcela ${String(p.numero)} não tem valor de principal nem de encargos. Nada foi gravado.`);
  }
}

/** Os números das parcelas VIVAS (não substituídas) de uma dívida. */
async function numerosVivos(tx: Pick<PrismaClient, "parcelaDaDivida">, dividaId: string): Promise<Set<number>> {
  const vivas = await tx.parcelaDaDivida.findMany({ where: { dividaId, substituidaPor: null }, select: { numero: true } });
  return new Set(vivas.map((v) => v.numero));
}

/** Grava o cronograma (uma ou mais parcelas) de uma vez. Número repetido — no lote ou já informado — recusa tudo. */
export async function informarParcelasDaDivida(
  prisma: PrismaClient,
  input: z.input<typeof zInformar>
): Promise<{ readonly informadas: number }> {
  const d = zInformar.parse(input);
  const noLote = new Set<number>();
  for (const p of d.parcelas) {
    if (noLote.has(p.numero)) throw new Error(`A parcela ${String(p.numero)} aparece duas vezes no cronograma. Nada foi gravado.`);
    noLote.add(p.numero);
    conferirValores(p);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.informarParcelasDaDivida, "ENTE");
    await travarDivida(tx, d.dividaId);
    const divida = await tx.dividaConsolidada.findUnique({ where: { id: d.dividaId }, select: { identificador: true } });
    if (divida === null) throw new Error("A dívida informada não existe. Nada foi gravado.");
    const vivos = await numerosVivos(tx, d.dividaId);
    const repetidas = d.parcelas.filter((p) => vivos.has(p.numero)).map((p) => p.numero);
    if (repetidas.length > 0) {
      throw new Error(
        `A dívida ${divida.identificador} já tem a(s) parcela(s) ${repetidas.join(", ")}. Para mudar uma parcela informada, use a correção da parcela. Nada foi gravado.`
      );
    }
    await tx.parcelaDaDivida.createMany({
      data: d.parcelas.map((p) => ({
        dividaId: d.dividaId,
        numero: p.numero,
        vencimento: meioDiaCivil(p.vencimento),
        valorPrincipal: p.valorPrincipal,
        valorEncargos: p.valorEncargos,
        criadoPor: d.criadoPor,
      })),
    });
    return { informadas: d.parcelas.length };
  });
}

/** Corrige uma parcela gravando outra no lugar dela (append-only). A substituída sai do cronograma. */
export async function substituirParcelaDaDivida(
  prisma: PrismaClient,
  input: z.input<typeof zSubstituir>
): Promise<{ readonly parcelaId: string }> {
  const d = zSubstituir.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.substituirParcelaDaDivida, "ENTE");
    const atual = await tx.parcelaDaDivida.findUnique({
      where: { id: d.parcelaId },
      select: { id: true, dividaId: true, numero: true, substituidaPor: { select: { id: true } } },
    });
    if (atual === null) throw new Error("A parcela informada não existe. Nada foi gravado.");
    await travarDivida(tx, atual.dividaId);
    if (atual.substituidaPor !== null) {
      throw new Error(`A parcela ${String(atual.numero)} já foi corrigida; corrija a versão que está no cronograma. Nada foi gravado.`);
    }
    conferirValores({ numero: atual.numero, valorPrincipal: d.valorPrincipal, valorEncargos: d.valorEncargos });
    const nova = await tx.parcelaDaDivida.create({
      data: {
        dividaId: atual.dividaId,
        numero: atual.numero,
        vencimento: meioDiaCivil(d.vencimento),
        valorPrincipal: d.valorPrincipal,
        valorEncargos: d.valorEncargos,
        substituiDeId: atual.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { parcelaId: nova.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O COMPARATIVO
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaDoComparativo {
  readonly parcelaId: string | null;
  readonly numero: number | null;
  /** Dia civil do vencimento; nulo na linha do que foi pago depois do último vencimento. */
  readonly vencimento: string | null;
  readonly principalInformado: Money;
  readonly encargosInformados: Money | null;
  /** O que foi amortizado no intervalo da parcela (vencimento anterior, exclusive, até o dela, inclusive). */
  readonly amortizadoNoPeriodo: Money;
  /** Amortizado menos informado: negativo = pagou menos que o previsto no período. */
  readonly diferenca: Money;
  readonly corrigida: boolean;
}

export interface ComparativoDaDivida {
  readonly linhas: readonly LinhaDoComparativo[];
  readonly totalInformado: Money;
  readonly totalAmortizado: Money;
  readonly saldo: Money;
}

export async function comparativoDaDivida(prisma: PrismaClient, dividaId: string): Promise<ComparativoDaDivida> {
  const [parcelas, amortizacoes, saldo] = await Promise.all([
    prisma.parcelaDaDivida.findMany({
      where: { dividaId, substituidaPor: null },
      select: { id: true, numero: true, vencimento: true, valorPrincipal: true, valorEncargos: true, substituiDeId: true },
    }),
    // VIVA = a amortização que nenhum estorno desfez (o estorno aponta o original por estornoDeId).
    prisma.movimentoDivida.findMany({
      where: { dividaId, tipo: "AMORTIZACAO", estornos: { none: {} } },
      select: { valor: true, dataMovimento: true },
    }),
    saldoDaDividaEm(prisma, dividaId),
  ]);

  const ordenadas = parcelas
    .map((p) => ({ ...p, dia: diaCivil(p.vencimento) }))
    .sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : a.numero - b.numero));
  const pagos = amortizacoes.map((a) => ({ dia: diaCivil(a.dataMovimento), valor: toMoney(a.valor.toFixed(2)) }));

  const linhas: LinhaDoComparativo[] = [];
  let anterior: string | null = null;
  let totalInformado = toMoney("0.00");
  let totalAmortizado = toMoney("0.00");
  for (const p of ordenadas) {
    let noPeriodo = toMoney("0.00");
    for (const a of pagos) if ((anterior === null || a.dia > anterior) && a.dia <= p.dia) noPeriodo = toMoney(noPeriodo.plus(a.valor));
    const principal = toMoney(p.valorPrincipal.toFixed(2));
    linhas.push({
      parcelaId: p.id,
      numero: p.numero,
      vencimento: p.dia,
      principalInformado: principal,
      encargosInformados: p.valorEncargos === null ? null : toMoney(p.valorEncargos.toFixed(2)),
      amortizadoNoPeriodo: noPeriodo,
      diferenca: toMoney(noPeriodo.minus(principal)),
      corrigida: p.substituiDeId !== null,
    });
    totalInformado = toMoney(totalInformado.plus(principal));
    totalAmortizado = toMoney(totalAmortizado.plus(noPeriodo));
    // Duas parcelas no MESMO dia: a segunda não recebe de novo o que a primeira já recebeu.
    anterior = p.dia;
  }
  let depois = toMoney("0.00");
  for (const a of pagos) if (anterior === null || a.dia > anterior) depois = toMoney(depois.plus(a.valor));
  if (!depois.isZero()) {
    linhas.push({
      parcelaId: null,
      numero: null,
      vencimento: null,
      principalInformado: toMoney("0.00"),
      encargosInformados: null,
      amortizadoNoPeriodo: depois,
      diferenca: depois,
      corrigida: false,
    });
    totalAmortizado = toMoney(totalAmortizado.plus(depois));
  }
  return { linhas, totalInformado, totalAmortizado, saldo };
}
