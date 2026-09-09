import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { saldoDaDividaEm } from "./divida.js";
import { saldoDaProvisaoEm } from "./provisoes.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * AS LEITURAS AGREGADAS DO M10 — o que o RGF Anexo 2 consome.
 *
 * ⚠️ NENHUMA ARITMÉTICA NOVA. O saldo de UMA dívida é `saldoDaDividaEm` (Σ dos
 * movimentos × sinal, pela data do fato), e o de uma provisão é `saldoDaProvisaoEm`.
 * Aqui só se AGRUPA o que eles devolvem. Somar os movimentos de novo, com um `groupBy`
 * por tipo, seria a segunda verdade sobre a mesma dívida — e ela divergiria da primeira
 * no dia em que um tipo de movimento novo nascesse.
 */

/**
 * O SALDO DA DÍVIDA CONSOLIDADA POR TIPO, no corte.
 *
 * ⚠️ O CADASTRO SÓ TEM DUAS DIMENSÕES: `enum TipoDivida { CONTRATUAL, MOBILIARIA }`.
 * **Interna × externa não existe** — e o RGF Anexo 2 as pede. Inferir "externa" do nome
 * do credor seria adivinhação; a distinção é parâmetro nomeado (`DIVIDA-INTERNA-EXTERNA`).
 */
export interface SaldoDaDividaPorTipo {
  readonly mobiliaria: Money;
  readonly contratual: Money;
  /** mobiliaria + contratual. */
  readonly total: Money;
}

export async function saldoDaDividaPorTipo(
  prisma: Tx,
  p: { readonly corte: Date }
): Promise<SaldoDaDividaPorTipo> {
  const dividas = await prisma.dividaConsolidada.findMany({
    select: { id: true, tipo: true },
  });

  const zero = toMoney("0.00");
  let mobiliaria = zero;
  let contratual = zero;

  for (const d of dividas) {
    // ⚠️ UM leitor por dívida — o dono do saldo. Ver o cabeçalho.
    const saldo = await saldoDaDividaEm(prisma, d.id, p.corte);
    if (d.tipo === "MOBILIARIA") mobiliaria = toMoney(mobiliaria.plus(saldo));
    else contratual = toMoney(contratual.plus(saldo));
  }

  return { mobiliaria, contratual, total: toMoney(mobiliaria.plus(contratual)) };
}

/**
 * A VARIAÇÃO MONETÁRIA DA DÍVIDA entre dois cortes — o ajuste NÃO-FISCAL do resultado nominal.
 *
 * ⚠️ POR QUE ESTE NÚMERO EXISTE À PARTE. O resultado nominal abaixo da linha é a variação da DCL;
 * mas nem toda variação da DCL veio de esforço fiscal do período. A `ATUALIZACAO_MONETARIA` (sinal
 * +1) aumenta o passivo por correção de índice, sem que o ente tenha gasto mais do que arrecadou —
 * é o exemplo canônico de "ajuste metodológico". O RREO Anexo 6 abaixo da linha a ISOLA para não
 * contar a correção como déficit.
 *
 * ⚠️ É a ÚNICA variação não-fiscal com fato rastreável E sinal inequívoco no censo. A janela é
 * `(desde, ate]` — EXCLUSIVA no início, porque a DCL do corte inicial já incorporou tudo até ele; o
 * que interessa aqui é o que se moveu DEPOIS. Reusa o mesmo `MovimentoDivida` que é dono do saldo:
 * zero aritmética nova, só o recorte de dois tipos numa janela.
 */
export async function variacaoMonetariaDaDivida(
  prisma: Tx,
  p: { readonly desde: Date; readonly ate: Date }
): Promise<Money> {
  const movimentos = await prisma.movimentoDivida.findMany({
    where: {
      tipo: { in: ["ATUALIZACAO_MONETARIA", "ESTORNO_ATUALIZACAO_MONETARIA"] },
      dataMovimento: { gt: p.desde, lte: p.ate },
    },
    select: { tipo: true, valor: true },
  });

  let total = toMoney("0.00");
  for (const m of movimentos) {
    // ⚠️ O sinal do estorno é o oposto — mesma regra do `SINAL_MOVIMENTO_DIVIDA` que o saldo usa.
    const parcela = toMoney(m.valor.toFixed(2));
    total = m.tipo === "ATUALIZACAO_MONETARIA" ? toMoney(total.plus(parcela)) : toMoney(total.minus(parcela));
  }
  return total;
}

/**
 * OS INGRESSOS DE OPERAÇÃO DE CRÉDITO numa janela, por tipo de dívida — o FLUXO do estoque.
 *
 * ⚠️ É FLUXO, NÃO SALDO. O `saldoDaDividaPorTipo` dá o estoque acumulado num corte; aqui a soma dos
 * `INGRESSO_OPERACAO_CREDITO` (menos os estornos) que ENTRARAM na janela `(desde, ate]`. É o que o
 * RGF Anexo 4 mede pelo lado da dívida — e o que amarra ao lado da receita (a origem 21 do M04): o
 * mesmo ingresso é UM fato, gravado nos dois subsistemas pelo composto `arrecadarIngresso...`.
 *
 * ⚠️ O tipo (MOBILIARIA/CONTRATUAL) mora na `DividaConsolidada`, não no movimento — daí o join. O
 * cadastro não tem "externa" (só o enum de duas dimensões); a interna×externa da receita é do lado
 * do M04 (a espécie da natureza), não daqui. Mesma janela EXCLUSIVA-no-início do `variacaoMonetaria`.
 */
export interface IngressosOperacaoCredito {
  readonly mobiliaria: Money;
  readonly contratual: Money;
  /** mobiliaria + contratual. */
  readonly total: Money;
}

export async function ingressosOperacaoCreditoPorTipo(
  prisma: Tx,
  p: { readonly desde: Date; readonly ate: Date }
): Promise<IngressosOperacaoCredito> {
  const movimentos = await prisma.movimentoDivida.findMany({
    where: {
      tipo: { in: ["INGRESSO_OPERACAO_CREDITO", "ESTORNO_INGRESSO_OPERACAO_CREDITO"] },
      dataMovimento: { gt: p.desde, lte: p.ate },
    },
    select: { tipo: true, valor: true, divida: { select: { tipo: true } } },
  });

  let mobiliaria = toMoney("0.00");
  let contratual = toMoney("0.00");
  for (const m of movimentos) {
    // ⚠️ O estorno tem o sinal oposto do ingresso — a mesma regra do `SINAL_MOVIMENTO_DIVIDA`.
    const parcela = toMoney(m.valor.toFixed(2));
    const comSinal = m.tipo === "INGRESSO_OPERACAO_CREDITO" ? parcela : toMoney(parcela.negated());
    if (m.divida.tipo === "MOBILIARIA") mobiliaria = toMoney(mobiliaria.plus(comSinal));
    else contratual = toMoney(contratual.plus(comSinal));
  }

  return { mobiliaria, contratual, total: toMoney(mobiliaria.plus(contratual)) };
}

/**
 * O PASSIVO ATUARIAL — a Σ das provisões matemáticas previdenciárias no corte (TR 5.89).
 *
 * É o que o quadro "Outros Valores não Integrantes da DC" do RGF Anexo 2 informa: a
 * dívida com os futuros aposentados, que NÃO entra na Dívida Consolidada (a LRF a
 * excluiu do limite do Senado) mas que existe e precisa ser publicada.
 */
export async function passivoAtuarialEm(
  prisma: Tx,
  p: { readonly corte: Date }
): Promise<Money> {
  const provisoes = await prisma.provisaoMatematica.findMany({ select: { id: true } });

  let total = toMoney("0.00");
  for (const pr of provisoes) {
    total = toMoney(total.plus(await saldoDaProvisaoEm(prisma, pr.id, p.corte)));
  }
  return total;
}
