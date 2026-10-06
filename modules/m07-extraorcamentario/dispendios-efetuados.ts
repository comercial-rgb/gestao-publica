import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

type Tx = Pick<PrismaClient, "movimentoExtraorcamentario">;

/**
 * V36 — OS DISPÊNDIOS EXTRAORÇAMENTÁRIOS EFETUADOS NUM PERÍODO (TR 5.10.2.2): o recolhimento ao consignatário, a
 * devolução da caução, o repasse do depósito de terceiro — dinheiro que SAIU do caixa sem ser despesa orçamentária.
 * O relatório de pagamentos efetuados os mostra numa seção própria, ao lado dos pagamentos do exercício e de restos.
 *
 * ⚠️ O ESTORNO SE DESCONTA, E A LINHA FICA. Vivo = valor − Σ estornos do dispêndio (o estorno é um movimento
 * `ESTORNO_DISPENDIO` que aponta o original, em qualquer data — a mesma régua do pagamento anulado, que continua na
 * lista com pago zero). O recorte é pela data do dispêndio original.
 *
 * ⚠️ A FONTE PODE FALTAR. Movimento gravado antes da coluna `fonteId` não declara fonte, e preenchê-la com a da conta
 * seria inventar (ver o schema); ele sai com fonte nula, e o filtro por fonte não o alcança.
 */

export interface DispendioEfetuado {
  readonly id: string;
  readonly data: Date;
  readonly tipoCodigo: string;
  readonly consignatario: string;
  readonly fonteCodigo: string | null;
  readonly contaBancaria: string;
  readonly historico: string;
  readonly lancamentoId: string;
  readonly valor: Money;
  readonly estornado: Money;
  readonly vivo: Money;
}

export interface RecorteDosDispendios {
  /** Instantes já resolvidos pelo chamador (início e fim do dia civil). */
  readonly de: Date;
  readonly ate: Date;
  readonly consignatario?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  readonly contaBancaria?: string | undefined;
}

export async function dispendiosEfetuados(prisma: Tx, r: RecorteDosDispendios): Promise<readonly DispendioEfetuado[]> {
  const movs = await prisma.movimentoExtraorcamentario.findMany({
    where: {
      tipo: "DISPENDIO",
      data: { gte: r.de, lte: r.ate },
      ...(r.consignatario !== undefined ? { credorConsignatario: r.consignatario } : {}),
      ...(r.fonteCodigo !== undefined ? { fonte: { codigo: r.fonteCodigo } } : {}),
      ...(r.contaBancaria !== undefined ? { contaBancaria: { codigo: r.contaBancaria } } : {}),
    },
    orderBy: [{ data: "asc" }, { id: "asc" }],
    select: {
      id: true,
      data: true,
      valor: true,
      historico: true,
      lancamentoId: true,
      credorConsignatario: true,
      tipoConsignacao: { select: { codigo: true } },
      fonte: { select: { codigo: true } },
      contaBancaria: { select: { codigo: true } },
      estornos: { where: { tipo: "ESTORNO_DISPENDIO" }, select: { valor: true } },
    },
  });
  return movs.map((m) => {
    const valor = toMoney(m.valor.toFixed(2));
    const estornado = m.estornos.reduce((acc, e) => toMoney(acc.plus(e.valor.toFixed(2))), toMoney("0.00"));
    return {
      id: m.id,
      data: m.data,
      tipoCodigo: m.tipoConsignacao.codigo,
      consignatario: m.credorConsignatario,
      fonteCodigo: m.fonte?.codigo ?? null,
      contaBancaria: m.contaBancaria.codigo,
      historico: m.historico,
      lancamentoId: m.lancamentoId,
      valor,
      estornado,
      vivo: toMoney(valor.minus(estornado)),
    };
  });
}

/** O total vivo dos dispêndios (Decimal). */
export function totalDosDispendios(linhas: readonly DispendioEfetuado[]): Money {
  return linhas.reduce((acc, l) => toMoney(acc.plus(l.vivo)), toMoney("0.00"));
}
