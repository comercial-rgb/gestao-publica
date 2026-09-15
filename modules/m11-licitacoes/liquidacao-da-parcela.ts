import { createHash } from "node:crypto";
import { z } from "zod";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { RoteiroContabil } from "../m05-despesa/dominio.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ M11 → M05 — LIQUIDAR A PARCELA RECEBIDA (V7 M2 U3) — composição de casos de uso, não outra contabilidade ═══
 *
 * O agente financeiro escolhe as parcelas recebidas em definitivo, o documento de cobrança conferido e o empenho do
 * contrato; esta função compõe a liquidação do M05 (`liquidar`), que confere tudo de novo na própria transação — o
 * empenho, o documento (conferido, emitente = credor, saldo), o período e, pelas `parcelasDoContrato`, o elegível de
 * cada parcela sob o trinco do contrato — e grava liquidação, lançamento e alocações no MESMO commit.
 *
 * ⚠️ IDEMPOTÊNCIA DO ATO (LI04). O número da liquidação é DETERMINÍSTICO para o mesmo pedido (empenho, documento e
 * parcelas com valores). Se a resposta se perdeu depois do commit, a nova tentativa acha a liquidação VIVA pelo par
 * (empenho, número), confere que ela carrega exatamente as mesmas alocações e devolve o resultado anterior — sem
 * segundo lançamento. Pedido diferente com a mesma parcela não colide no número: é recusado pelo elegível (LI03).
 * Liquidação ANULADA não é "a mesma": o pedido refeito depois da anulação recebe o número seguinte (`-2`, `-3`), porque
 * o par (empenho, número) é único e a anulação não apaga a original.
 *
 * ⚠️ O que ela NÃO faz: não paga (o pagamento é o do M05, já existente), não mexe na folha nem nos encargos (que
 * liquidam pelo título próprio), não gera estoque (parcela de serviço em empenho de material é recusada).
 */

const zValor = z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Valor com até 2 casas, ponto decimal.");
const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil AAAA-MM-DD.");

export const zLiquidarParcelasDoContrato = z
  .object({
    empenhoId: z.string().min(1),
    documentoFiscalId: z.string().min(1),
    data: zDia,
    parcelas: z.array(z.object({ recebimentoDefinitivoId: z.string().min(1), valor: zValor }).strict()).min(1),
    criadoPor: z.string().min(1),
  })
  .strict();
export type LiquidarParcelasDoContratoInput = z.input<typeof zLiquidarParcelasDoContrato>;

/** O número determinístico do pedido — o mesmo pedido, o mesmo número. */
export function numeroDaLiquidacaoDaParcela(p: { readonly empenhoId: string; readonly documentoFiscalId: string; readonly parcelas: readonly { readonly recebimentoDefinitivoId: string; readonly valor: string }[] }): string {
  const canon = JSON.stringify([p.empenhoId, p.documentoFiscalId, [...p.parcelas].map((x) => [x.recebimentoDefinitivoId, toMoney(x.valor).toFixed(2)]).sort()]);
  return `PARC-${createHash("sha256").update(canon, "utf8").digest("hex").slice(0, 16).toUpperCase()}`;
}

export interface ResultadoDaLiquidacaoDaParcela {
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly valor: string;
  /** A liquidação já existia com as mesmas alocações (resposta perdida): nada foi gravado de novo. */
  readonly jaExistia: boolean;
}

export async function liquidarParcelasDoContrato(prisma: PrismaClient, input: LiquidarParcelasDoContratoInput, roteiro: RoteiroContabil, deps: M05Deps): Promise<ResultadoDaLiquidacaoDaParcela> {
  const d = zLiquidarParcelasDoContrato.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.liquidarParcelasDoContrato, { empenho: d.empenhoId });
  });
  const base = numeroDaLiquidacaoDaParcela(d);
  const valor = d.parcelas.reduce((t, x) => t.plus(toMoney(x.valor)), toMoney(0));

  const anteriores = await prisma.liquidacao.findMany({
    where: { empenhoId: d.empenhoId, OR: [{ numero: base }, { numero: { startsWith: `${base}-` } }] },
    select: { id: true, numero: true, valor: true, estornos: { select: { id: true } }, alocacoesNaParcela: { select: { recebimentoDefinitivoId: true, valor: true } } },
  });
  const ja = anteriores.find((l) => l.estornos.length === 0);
  const numero = ja?.numero ?? (anteriores.length === 0 ? base : `${base}-${anteriores.length + 1}`);
  if (ja !== undefined) {
    const mesma = ja.alocacoesNaParcela.length === d.parcelas.length && d.parcelas.every((p) => ja.alocacoesNaParcela.some((a) => a.recebimentoDefinitivoId === p.recebimentoDefinitivoId && toMoney(a.valor.toFixed(2)).eq(toMoney(p.valor))));
    if (!mesma) throw new Error(`LIQUIDACAO-COM-OUTRAS-PARCELAS: a liquidação ${numero} deste empenho existe e não carrega as mesmas parcelas. Nada foi gravado.`);
    return { liquidacaoId: ja.id, numero, valor: toMoney(ja.valor.toFixed(2)).toFixed(2), jaExistia: true };
  }

  const recebimentos = await prisma.recebimentoDefinitivo.findMany({
    where: { id: { in: d.parcelas.map((p) => p.recebimentoDefinitivoId) } },
    orderBy: { data: "asc" },
    select: { numero: true, data: true, sha256: true, designacao: { select: { atoDesignacao: true, pessoa: { select: { documento: true, versoes: { orderBy: { criadoEm: "desc" }, take: 1, select: { nome: true } } } } } }, medicao: { select: { numero: true, ordem: { select: { numero: true, ano: true, contrato: { select: { numeroContrato: true } } } } } } },
  });
  const responsaveis = [...new Set(recebimentos.map((r) => `${r.designacao.pessoa.versoes[0]?.nome ?? r.designacao.pessoa.documento} (${r.designacao.atoDesignacao})`))].join("; ");
  const termos = recebimentos.map((r) => `ordem ${r.medicao.ordem.numero}/${r.medicao.ordem.ano}, medição ${r.medicao.numero}, recebimento definitivo ${r.numero} de ${diaCivil(r.data)} (termo ${r.sha256.slice(0, 12)})`).join("; ");
  const contrato = recebimentos[0]?.medicao.ordem.contrato.numeroContrato ?? "?";

  const r = await liquidar(
    {
      empenhoId: d.empenhoId,
      numero,
      valor: valor.toFixed(2),
      data: inicioDoDiaCivil(d.data),
      responsavelAtesto: responsaveis === "" ? "recebedor definitivo designado" : responsaveis,
      documentoFiscalId: d.documentoFiscalId,
      historico: `Contrato ${contrato} — parcelas recebidas em definitivo: ${termos}.`,
      parcelasDoContrato: d.parcelas.map((p) => ({ recebimentoDefinitivoId: p.recebimentoDefinitivoId, valor: p.valor })),
      criadoPor: d.criadoPor,
    },
    roteiro,
    deps
  );
  return { liquidacaoId: r.liquidacaoId, numero, valor: valor.toFixed(2), jaExistia: false };
}
