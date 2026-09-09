import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { totaisPorConsignatario, SINAL_MOVIMENTO_EXTRA } from "./dominio.js";

/** O client OU uma transação dele — ver a nota do M04 (`consultas.ts`). */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * O EXTRAORÇAMENTÁRIO DE CADA FONTE — leitura pura, aritmética do próprio M07.
 *
 * ═══ A FONTE VEM DA CONTA BANCÁRIA, E SÓ DE LÁ ═══
 * `MovimentoExtraorcamentario` não tem fonte própria — tem `contaBancariaId`
 * (NOT NULL), e a conta bancária tem fonte (NOT NULL). É a fonte do CAIXA em que
 * o dinheiro de terceiro está parado, e é essa que importa: quando o repasse
 * sair, sai daquele caixa. A "fonte do terceiro" não existe (o INSS não tem fonte
 * de recurso).
 *
 * ═══ A RETENÇÃO NÃO TRANSITA — E É POR ISSO QUE ELA NÃO ENTRA NO CAIXA ═══
 * Uma retenção nasce DENTRO de um pagamento (`pagamentoId` preenchido): o dinheiro
 * nunca chegou a sair do caixa, ele só mudou de dono lá dentro. O caixa do
 * pagamento já foi contado LÍQUIDO pelo M05. Somar a retenção aqui como entrada de
 * caixa contaria o mesmo real duas vezes — foi exatamente a lição do M09.
 * Já o INGRESSO AVULSO (caução, depósito) é dinheiro que ENTRA de fato: esse conta.
 *
 * ⚠️ Mas no SALDO A REPASSAR a retenção ENTRA: a obrigação com o consignatário
 * existe, tenha o dinheiro transitado ou não. Caixa e passivo contam histórias
 * diferentes sobre o mesmo fato, e as duas são verdadeiras.
 */
export interface ExtraDaFonte {
  /** Ingressos AVULSOS (caução, depósito), líquidos de estorno: ENTRAM no caixa. */
  readonly caixaIngressoAvulso: Money;
  /** Repasses/devoluções, líquidos de estorno: SAEM do caixa. */
  readonly caixaDispendio: Money;
  /** O passivo com terceiros — retenções INCLUÍDAS. */
  readonly saldoARepassar: Money;
}

export async function extraorcamentarioPorFonte(
  prisma: Tx,
  p: { readonly ate: Date }
): Promise<ReadonlyMap<string, ExtraDaFonte>> {
  const movimentos = await prisma.movimentoExtraorcamentario.findMany({
    where: { data: { lte: p.ate } },
    select: {
      tipo: true,
      valor: true,
      pagamentoId: true,
      contaBancaria: { select: { fonteId: true } },
    },
  });

  const por = new Map<string, ExtraDaFonte>();
  const fontes = new Set(movimentos.map((m) => m.contaBancaria.fonteId));

  for (const fonteId of fontes) {
    const daFonte = movimentos
      .filter((m) => m.contaBancaria.fonteId === fonteId)
      .map((m) => ({
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
        naoTransitou: m.pagamentoId !== null,
      }));

    // O CAIXA: só o que de fato entrou/saiu do banco (os avulsos).
    const doCaixa = totaisPorConsignatario(
      daFonte.filter((m) => !m.naoTransitou)
    );
    // O PASSIVO: tudo — a retenção também é obrigação.
    const doPassivo = totaisPorConsignatario(daFonte);

    por.set(fonteId, {
      caixaIngressoAvulso: doCaixa.ingressoLiquido,
      caixaDispendio: doCaixa.dispendioLiquido,
      saldoARepassar: doPassivo.saldo,
    });
  }

  return por;
}

// ── LISTAGENS PARA A TELA/PDF (TRAVA-2) — leitura pura, dinheiro em string na borda ──────────────

export interface TipoConsignacaoNaLista {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly ativo: boolean;
}

/** Os EVENTOS (tipos de consignação) — o cadastro extensível (INSS/ISS/consignações). */
export async function listarTiposConsignacao(prisma: PrismaClient): Promise<TipoConsignacaoNaLista[]> {
  const tipos = await prisma.tipoConsignacao.findMany({ orderBy: [{ codigo: "asc" }] });
  return tipos.map((t) => ({ id: t.id, codigo: t.codigo, descricao: t.descricao, ativo: t.ativo }));
}

export interface SaldoConsignatarioNaLista {
  readonly tipoCodigo: string;
  readonly tipoDescricao: string;
  readonly consignatario: string;
  readonly ingressado: string;
  readonly dispendido: string;
  /** ingressado − dispendido — o que o ente ainda deve ao consignatário (TR 5.41). Strings. */
  readonly saldo: string;
}

/** Os SALDOS por (tipo, consignatário) — a receita extra com o seu saldo próprio. */
export async function listarSaldosExtra(prisma: PrismaClient): Promise<SaldoConsignatarioNaLista[]> {
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    include: { tipoConsignacao: { select: { codigo: true, descricao: true } } },
  });
  const acc = new Map<string, { tipoCodigo: string; tipoDescricao: string; consignatario: string; ingressado: Decimal; dispendido: Decimal }>();
  for (const m of movs) {
    const k = `${m.tipoConsignacao.codigo}||${m.credorConsignatario}`;
    const cur = acc.get(k) ?? { tipoCodigo: m.tipoConsignacao.codigo, tipoDescricao: m.tipoConsignacao.descricao, consignatario: m.credorConsignatario, ingressado: new Decimal(0), dispendido: new Decimal(0) };
    const sinal = SINAL_MOVIMENTO_EXTRA[m.tipo];
    // Ingressado = o que ENTROU (INGRESSO/estorno de ingresso); dispendido = o que SAIU.
    if (m.tipo === "INGRESSO" || m.tipo === "ESTORNO_INGRESSO") cur.ingressado = cur.ingressado.plus(new Decimal(m.valor).times(sinal));
    else cur.dispendido = cur.dispendido.plus(new Decimal(m.valor).times(-sinal));
    acc.set(k, cur);
  }
  return [...acc.values()]
    .map((v) => ({ tipoCodigo: v.tipoCodigo, tipoDescricao: v.tipoDescricao, consignatario: v.consignatario, ingressado: v.ingressado.toFixed(2), dispendido: v.dispendido.toFixed(2), saldo: v.ingressado.minus(v.dispendido).toFixed(2) }))
    .sort((a, b) => (a.tipoCodigo < b.tipoCodigo ? -1 : a.tipoCodigo > b.tipoCodigo ? 1 : a.consignatario.localeCompare(b.consignatario)));
}

export interface RetencaoNaLista {
  readonly id: string;
  readonly data: Date;
  readonly valor: string;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  /** Drill ao documento: o pagamento e o empenho de origem (TR 5.25). */
  readonly pagamentoNumero: string | null;
  readonly empenhoNumero: string | null;
}

/** As RETENÇÕES do exercício (ingressos nascidos DENTRO de um pagamento — vínculo 5.25), com drill. */
export async function listarRetencoes(prisma: PrismaClient, params: { readonly exercicio: number }): Promise<RetencaoNaLista[]> {
  const gte = new Date(Date.UTC(params.exercicio, 0, 1));
  const lt = new Date(Date.UTC(params.exercicio + 1, 0, 1));
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "INGRESSO", pagamentoId: { not: null }, data: { gte, lt } },
    include: {
      tipoConsignacao: { select: { codigo: true } },
      pagamento: { select: { numero: true, liquidacao: { select: { empenho: { select: { numero: true } } } } } },
    },
    orderBy: [{ data: "asc" }],
  });
  return movs.map((m) => ({
    id: m.id,
    data: m.data,
    valor: new Decimal(m.valor).toFixed(2),
    tipoCodigo: m.tipoConsignacao.codigo,
    consignatario: m.credorConsignatario,
    pagamentoNumero: m.pagamento?.numero ?? null,
    empenhoNumero: m.pagamento?.liquidacao.empenho.numero ?? null,
  }));
}

export interface DispendioNaLista {
  readonly id: string;
  readonly data: Date;
  readonly valor: string;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  readonly historico: string;
}

/** As DESPESAS EXTRA (recolhimentos/repasses ao consignatário) do exercício. */
export async function listarDispendios(prisma: PrismaClient, params: { readonly exercicio: number }): Promise<DispendioNaLista[]> {
  const gte = new Date(Date.UTC(params.exercicio, 0, 1));
  const lt = new Date(Date.UTC(params.exercicio + 1, 0, 1));
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: { tipo: "DISPENDIO", data: { gte, lt } },
    include: { tipoConsignacao: { select: { codigo: true } } },
    orderBy: [{ data: "asc" }],
  });
  return movs.map((m) => ({ id: m.id, data: m.data, valor: new Decimal(m.valor).toFixed(2), tipoCodigo: m.tipoConsignacao.codigo, consignatario: m.credorConsignatario, historico: m.historico }));
}
