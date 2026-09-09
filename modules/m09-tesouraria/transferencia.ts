import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { zMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * TRANSFERÊNCIA ENTRE CONTAS DA MESMA UG — TR 5.61. É o FATO que faltava para o SAGRES
 * MovimentacaoEntreContasBancarias (§4.59): a tripla (M15/S2) identifica as contas, mas o EVENTO
 * não existia.
 *
 * ═══ A CONTABILIZAÇÃO VAI PELO FUNIL (razao.ts) ═══
 * D conta-contábil DESTINO / C conta-contábil ORIGEM, subsistema PATRIMONIAL. O lançamento é
 * BALANCEADO POR CONSTRUÇÃO (o mesmo `valor` nas duas pernas). Quando as duas contas bancárias
 * apontam para a MESMA conta contábil (o caso comum — "Bancos Conta Movimento"), o razão registra
 * um lançamento de saldo LÍQUIDO ZERO: é a trilha de auditoria do TR 5.61 (o agregado de caixa não
 * muda quando o dinheiro anda entre contas próprias). O detalhe origem/destino vive no FATO.
 *
 * ═══ FONTE DERIVA DO FATO ═══
 * A fonte da transferência é a da conta de ORIGEM (de onde o dinheiro sai) — não se informa à mão.
 *
 * ⚠️ FAIL-CLOSED: sem `contaContabilId` nas duas contas, a operação CAI nomeando — é o operador que
 * sabe qual conta contábil é qual (a mesma doutrina da conciliação). E não há transferência para si.
 */

export const zTransferirEntreContas = z.object({
  contaOrigemId: z.string().min(1),
  contaDestinoId: z.string().min(1),
  valor: zMoney, // string decimal, > 0 (o zMoney valida)
  data: z.date(),
  /** Número de controle (SAGRES §4.59, Caractere 7). */
  codigo: z.string().min(1).max(7),
  historico: z.string().min(3),
  criadoPor: z.string().min(1),
});
/** O INPUT (o `valor` chega como string decimal; o `.parse` o transforma em Money). */
export type TransferirEntreContasInput = z.input<typeof zTransferirEntreContas>;

export interface ResultadoTransferencia {
  readonly transferenciaId: string;
  readonly lancamentoId: string;
}

export async function transferirEntreContas(
  prisma: PrismaClient,
  input: TransferirEntreContasInput
): Promise<ResultadoTransferencia> {
  const dados = zTransferirEntreContas.parse(input);

  if (dados.contaOrigemId === dados.contaDestinoId) {
    throw new Error("Transferência inválida: origem e destino são a mesma conta.");
  }
  const valorStr = dados.valor.toFixed(2);

  return prisma.$transaction(async (tx) => {
    const origem = await tx.contaBancaria.findUnique({ where: { id: dados.contaOrigemId }, select: { id: true, codigo: true, contaContabilId: true, fonteId: true } });
    const destino = await tx.contaBancaria.findUnique({ where: { id: dados.contaDestinoId }, select: { id: true, codigo: true, contaContabilId: true } });
    if (origem === null) throw new Error(`Conta de origem ${dados.contaOrigemId} não cadastrada.`);
    if (destino === null) throw new Error(`Conta de destino ${dados.contaDestinoId} não cadastrada.`);
    if (origem.contaContabilId === null || destino.contaContabilId === null) {
      throw new Error(
        `Transferência: a conta ${origem.contaContabilId === null ? origem.codigo : destino.codigo} não tem ` +
          `conta contábil (PCASP) mapeada. A contabilização exige o mapeamento — é o operador que sabe qual é qual.`
      );
    }

    // ⚠️ SEM UG: a transferência é entre contas do ENTE. `criadoPor` é a identidade (quem assina).
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.transferirEntreContas, "ENTE");

    // O lançamento pelo funil — balanceado por construção (mesmo valor nas duas pernas).
    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `TR-${dados.codigo}`,
      dataTransacao: dados.data,
      historico: dados.historico,
      origemTipo: "TRANSFERENCIA_ENTRE_CONTAS",
      criadoPor: dados.criadoPor,
      partidas: [
        { contaId: destino.contaContabilId, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: valorStr },
        { contaId: origem.contaContabilId, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: valorStr },
      ],
    });

    const transferencia = await tx.transferenciaEntreContas.create({
      data: {
        contaOrigemId: origem.id,
        contaDestinoId: destino.id,
        valor: valorStr,
        data: dados.data,
        codigo: dados.codigo,
        historico: dados.historico,
        lancamentoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    return { transferenciaId: transferencia.id, lancamentoId };
  });
}
