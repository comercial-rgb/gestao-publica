import { Decimal, sumMoney, toMoney, type Money } from "../../packages/contracts/index.js";
import { normalizarDocumento } from "../../packages/documento/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * ═══ M11 → M05 — AS PARCELAS RECEBIDAS QUE UMA LIQUIDAÇÃO CONSOME (V7 M2 U3) ═══
 *
 * Art. 63 da Lei 4.320: a liquidação de serviço prestado tem por base o contrato, a nota de empenho e o comprovante da
 * prestação efetiva. Aqui, o comprovante é o RECEBIMENTO DEFINITIVO (art. 140, I, b), e a nota do fornecedor é o
 * documento de cobrança conferido. Esta função é chamada PELO ADAPTER DO M05, dentro da transação da liquidação, ANTES
 * de qualquer gravação; as alocações são gravadas logo depois da liquidação, no mesmo commit.
 *
 * O QUE ELA CONFERE (tudo dentro da transação, sob o trinco do contrato):
 *   · as parcelas somam exatamente o valor liquidado; cada recebimento aparece uma vez;
 *   · o documento de cobrança existe na liquidação (o adapter confere conferência, emitente = credor e saldo) e, se
 *     declara contrato, é deste contrato;
 *   · o empenho informou este contrato, e o credor dele é o contratado;
 *   · o empenho não é de material: parcela de serviço não vira estoque (o caminho de material não é suportado aqui);
 *   · se a ordem indicou um empenho, é ele;
 *   · cada parcela cabe no ELEGÍVEL do recebimento: valor recebido − consumido por liquidações vivas.
 *
 * ⚠️ O CONSUMIDO É DERIVADO. Liquidação estornada inteira libera a alocação. Anulação parcial: com UMA alocação, o
 * consumido é o líquido da liquidação; com VÁRIAS, a alocação continua consumida por inteiro (não há regra para
 * repartir a redução entre parcelas — pendência `ANULACAO-PARCIAL-COM-VARIAS-PARCELAS`). Na dúvida, não libera.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface ParcelaPedida {
  readonly recebimentoDefinitivoId: string;
  readonly valor: Money;
}

/** O consumido de cada recebimento, pelas alocações das liquidações vivas. */
export async function consumoDasParcelas(tx: Tx, recebimentoIds: readonly string[]): Promise<Map<string, Decimal>> {
  const alocacoes = await tx.alocacaoDaLiquidacaoNaParcela.findMany({
    where: { recebimentoDefinitivoId: { in: [...recebimentoIds] } },
    select: {
      recebimentoDefinitivoId: true, valor: true,
      liquidacao: { select: { id: true, valor: true, estornos: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } }, anulacoesParciais: { select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true } }, _count: { select: { alocacoesNaParcela: true } } } },
    },
  });
  const m = new Map<string, Decimal>();
  for (const a of alocacoes) {
    const l = a.liquidacao;
    let consumido: Decimal;
    if (l.estornos.length > 0) consumido = new Decimal(0);
    else if (l.anulacoesParciais.length === 0 || l._count.alocacoesNaParcela > 1) consumido = new Decimal(a.valor.toFixed(2));
    else {
      const liquido = somaLiquidaEstornaveis([
        { id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: null, anulacaoParcialDeId: null },
        ...l.anulacoesParciais.map((x) => ({ id: x.id, valor: toMoney(x.valor.toFixed(2)), estornoDeId: x.estornoDeId, anulacaoParcialDeId: x.anulacaoParcialDeId })),
      ]);
      consumido = Decimal.min(new Decimal(a.valor.toFixed(2)), liquido);
    }
    m.set(a.recebimentoDefinitivoId, (m.get(a.recebimentoDefinitivoId) ?? new Decimal(0)).plus(consumido));
  }
  return m;
}

export async function conferirParcelasDaLiquidacao(
  tx: Tx,
  p: {
    readonly empenho: { readonly id: string; readonly contratoId: string | null; readonly credorCpfCnpj: string; readonly debitaEstoque: boolean };
    readonly documentoFiscalId: string | undefined;
    readonly valor: Money;
    readonly data: Date;
    readonly parcelas: readonly ParcelaPedida[];
  }
): Promise<void> {
  if (p.parcelas.length === 0) throw new Error("PARCELAS-VAZIAS: a liquidação pela parcela recebida precisa de ao menos uma parcela. Nada foi gravado.");
  const ids = p.parcelas.map((x) => x.recebimentoDefinitivoId);
  if (new Set(ids).size !== ids.length) throw new Error("PARCELA-REPETIDA: cada recebimento entra uma vez na liquidação. Nada foi gravado.");
  const soma = sumMoney(p.parcelas.map((x) => x.valor));
  if (!soma.eq(p.valor)) throw new Error(`PARCELAS-NAO-FECHAM: as parcelas somam ${soma.toFixed(2)} e a liquidação é de ${p.valor.toFixed(2)}. Nada foi gravado.`);
  if (p.documentoFiscalId === undefined) {
    throw new Error("DOCUMENTO-DE-COBRANCA-OBRIGATORIO: a liquidação da parcela de serviço tem por base o documento de cobrança conferido do fornecedor (Lei 4.320, art. 63). Registre e confira a nota antes. Nada foi gravado.");
  }
  if (p.empenho.debitaEstoque) {
    throw new Error("PARCELA-EM-EMPENHO-DE-MATERIAL: o empenho é de material (debita estoque) e a parcela recebida é de serviço da ordem; a liquidação de material pela ordem de serviço não é suportada. Nada foi gravado.");
  }
  const recebimentos = await tx.recebimentoDefinitivo.findMany({
    where: { id: { in: ids } },
    select: { id: true, numero: true, data: true, estorno: { select: { data: true, motivo: true } }, itens: { select: { valor: true } }, medicao: { select: { numero: true, ordem: { select: { numero: true, ano: true, contratoId: true, empenhoId: true, contrato: { select: { numeroContrato: true, contratadoDocumento: true } } } } } } },
  });
  const faltante = ids.find((id) => !recebimentos.some((r) => r.id === id));
  if (faltante !== undefined) throw new Error(`RECEBIMENTO-INEXISTENTE: o recebimento ${faltante} não existe. Nada foi gravado.`);
  // ⚠️ V9 N4 — RECEBIMENTO ESTORNADO NÃO LASTREIA LIQUIDAÇÃO. Sem esta guarda, a ordem inversa da
  // cadeia (estornar o recebimento e liquidá-lo depois) produziria despesa sem documento que a
  // comprove — e a tela não mostraria nada de errado, porque o termo original continua no
  // histórico. A recusa vem ANTES de qualquer escrita.
  const estornado = recebimentos.find((r) => r.estorno !== null);
  if (estornado !== undefined) {
    throw new Error(
      `RECEBIMENTO-ESTORNADO: o recebimento definitivo nº ${estornado.numero} da medição nº ${estornado.medicao.numero} da ordem nº ` +
        `${estornado.medicao.ordem.numero}/${estornado.medicao.ordem.ano} foi estornado em ${diaCivil(estornado.estorno!.data)} e não lastreia liquidação. ` +
        `Registre o recebimento corrigido e liquide por ele. Nada foi gravado.`
    );
  }
  const contratos = [...new Set(recebimentos.map((r) => r.medicao.ordem.contratoId))];
  if (contratos.length !== 1) throw new Error("PARCELAS-DE-CONTRATOS-DIFERENTES: uma liquidação consome parcelas de um contrato só. Nada foi gravado.");
  const contratoId = contratos[0]!;
  // ⚠️ O TRINCO DO CONTRATO ANTES DE SOMAR O CONSUMIDO: duas liquidações da mesma parcela, com chaves e números
  // diferentes, esperam uma pela outra e a segunda já enxerga a primeira (LI03).
  await travar(tx, "Contrato", [contratoId]);
  const contrato = recebimentos[0]!.medicao.ordem.contrato;
  if (p.empenho.contratoId !== contratoId) throw new Error(`EMPENHO-DE-OUTRO-CONTRATO: o empenho não informou o contrato ${contrato.numeroContrato}. Nada foi gravado.`);
  if (normalizarDocumento(p.empenho.credorCpfCnpj) !== normalizarDocumento(contrato.contratadoDocumento)) {
    throw new Error(`CREDOR-NAO-E-O-CONTRATADO: o credor do empenho (${p.empenho.credorCpfCnpj}) não é o contratado do contrato ${contrato.numeroContrato} (${contrato.contratadoDocumento}). Nada foi gravado.`);
  }
  const doc = await tx.documentoFiscalRecebido.findUnique({ where: { id: p.documentoFiscalId }, select: { numero: true, serie: true, contratoId: true } });
  if (doc !== null && doc.contratoId !== null && doc.contratoId !== contratoId) {
    throw new Error(`DOCUMENTO-DE-OUTRO-CONTRATO: o documento ${doc.numero}/${doc.serie} declara outro contrato. Nada foi gravado.`);
  }
  const consumo = await consumoDasParcelas(tx, ids);
  for (const pedido of p.parcelas) {
    const r = recebimentos.find((x) => x.id === pedido.recebimentoDefinitivoId)!;
    const rotulo = `recebimento definitivo nº ${r.numero} da medição nº ${r.medicao.numero} da ordem nº ${r.medicao.ordem.numero}/${r.medicao.ordem.ano}`;
    if (r.medicao.ordem.empenhoId !== null && r.medicao.ordem.empenhoId !== p.empenho.id) {
      throw new Error(`EMPENHO-DIFERENTE-DO-DA-ORDEM: a ordem nº ${r.medicao.ordem.numero} indicou outro empenho para suportar a liquidação. Nada foi gravado.`);
    }
    if (diaCivil(r.data) > diaCivil(p.data)) throw new Error(`LIQUIDACAO-ANTES-DO-RECEBIMENTO: o ${rotulo} é de ${diaCivil(r.data)}; a liquidação não pode ser anterior. Nada foi gravado.`);
    const recebido = r.itens.reduce((t, i) => t.plus(i.valor.toFixed(2)), new Decimal(0));
    const consumido = consumo.get(r.id) ?? new Decimal(0);
    const elegivel = recebido.minus(consumido);
    if (pedido.valor.gt(elegivel)) {
      throw new Error(
        `${elegivel.lte(0) ? "PARCELA-JA-LIQUIDADA" : "PARCELA-ACIMA-DO-ELEGIVEL"}: o ${rotulo} vale ${recebido.toFixed(2)}, já foi liquidado em ${consumido.toFixed(2)} ` +
          `e resta ${Decimal.max(elegivel, 0).toFixed(2)}; a liquidação pede ${pedido.valor.toFixed(2)}. Nada foi gravado.`
      );
    }
  }
}

/** As alocações, gravadas logo depois da liquidação, na mesma transação. */
export async function gravarAlocacoesDaLiquidacao(tx: Tx, liquidacaoId: string, parcelas: readonly ParcelaPedida[], criadoPor: string): Promise<void> {
  await tx.alocacaoDaLiquidacaoNaParcela.createMany({ data: parcelas.map((x) => ({ liquidacaoId, recebimentoDefinitivoId: x.recebimentoDefinitivoId, valor: x.valor.toFixed(2), criadoPor })) });
}
