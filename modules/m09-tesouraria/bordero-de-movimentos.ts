import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { SENTIDO_MOVIMENTO_BANCARIO } from "./dominio.js";

type Tx = Pick<PrismaClient, "contaBancaria" | "movimentoBancario">;

/**
 * V36 — O BORDERÔ DOS MOVIMENTOS BANCÁRIOS (TR 5.10.2.22): o documento que relaciona, para uma conta e um período, os
 * movimentos que o tesoureiro leva ao banco (depósitos, saques, aplicações, resgates, rendimentos e tarifas), com o
 * total de entradas e de saídas.
 *
 * Entram só os movimentos VIGENTES NO FIM DO PERÍODO: o estorno e o movimento estornado até ali se anulam, e
 * relacioná-los num borderô seria pedir ao banco uma operação desfeita. O estorno feito DEPOIS do período não tira o
 * movimento do borderô daquele período: o documento de um período encerrado não muda depois de emitido. A quantidade deixada de fora vai no documento, para ninguém ler a ausência
 * como esquecimento. O sentido de cada tipo é o de `SENTIDO_MOVIMENTO_BANCARIO`, o mesmo do caixa e da conciliação.
 *
 * É LEITURA: o borderô não grava nada. O documento sai com o hash do conteúdo pelo motor de PDF, e o mesmo período
 * dá o mesmo hash.
 */

export interface LinhaDoBordero {
  readonly id: string;
  readonly data: Date;
  readonly tipo: string;
  readonly sentido: "ENTRADA" | "SAIDA";
  readonly fonteCodigo: string;
  readonly historico: string;
  readonly valor: Money;
}

export interface BorderoDeMovimentos {
  readonly conta: {
    readonly codigo: string;
    readonly descricao: string;
    readonly banco: string | null;
    readonly agencia: string | null;
    readonly numero: string | null;
  };
  readonly linhas: readonly LinhaDoBordero[];
  readonly entradas: Money;
  readonly saidas: Money;
  /** Estornos e movimentos estornados do período, que não entram. */
  readonly foraPorEstorno: number;
}

const comDigito = (n: string | null, d: string | null): string | null => (n === null || n === "" ? null : d === null || d === "" ? n : `${n}-${d}`);

export async function borderoDosMovimentos(
  prisma: Tx,
  r: { readonly contaBancariaId: string; readonly de: Date; readonly ate: Date }
): Promise<BorderoDeMovimentos | null> {
  const conta = await prisma.contaBancaria.findUnique({
    where: { id: r.contaBancariaId },
    select: { codigo: true, descricao: true, banco: true, agencia: true, digitoAgencia: true, conta: true, digitoConta: true },
  });
  if (conta === null) return null;
  const movimentos = await prisma.movimentoBancario.findMany({
    where: { contaBancariaId: r.contaBancariaId, data: { gte: r.de, lte: r.ate } },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, data: true, tipo: true, valor: true, historico: true, estornoDeId: true, fonte: { select: { codigo: true } }, estornos: { where: { data: { lte: r.ate } }, select: { id: true } } },
  });
  const vigentes = movimentos.filter((m) => m.estornoDeId === null && m.estornos.length === 0);
  const linhas: LinhaDoBordero[] = vigentes.map((m) => ({
    id: m.id,
    data: m.data,
    tipo: m.tipo,
    sentido: SENTIDO_MOVIMENTO_BANCARIO[m.tipo],
    fonteCodigo: m.fonte.codigo,
    historico: m.historico,
    valor: toMoney(m.valor.toFixed(2)),
  }));
  const soma = (s: "ENTRADA" | "SAIDA"): Money => linhas.filter((l) => l.sentido === s).reduce((a, l) => toMoney(a.plus(l.valor)), toMoney("0.00"));
  return {
    conta: {
      codigo: conta.codigo,
      descricao: conta.descricao,
      banco: conta.banco,
      agencia: comDigito(conta.agencia, conta.digitoAgencia),
      numero: comDigito(conta.conta, conta.digitoConta),
    },
    linhas,
    entradas: soma("ENTRADA"),
    saidas: soma("SAIDA"),
    foraPorEstorno: movimentos.length - vigentes.length,
  };
}
