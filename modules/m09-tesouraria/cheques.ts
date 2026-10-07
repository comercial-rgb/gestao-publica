import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V36 — CHEQUES (TR 5.10.2.42): os emitidos na rotina de pagamento e os avulsos, numa consulta só.
 *
 * O cheque de pagamento nasce dentro do `pagar()` do M05 (campo "número do cheque"); aqui ficam o AVULSO (registro e
 * cancelamento) e a CONSULTA que une os dois. O cheque é documento, não fato contábil: nenhum dos casos de uso abaixo
 * lança no razão nem mexe em saldo — o dinheiro está no fato que o originou. Ver `m09-cheques.prisma`.
 *
 * Autorização: as ações da movimentação bancária (quem registra movimento da conta registra o cheque avulso dela;
 * quem estorna movimento cancela o cheque), no ente — nenhuma ação nova.
 */

const dataBr = (d: Date): string => diaCivil(d).split("-").reverse().join("/");

function exigirNaoFutura(d: Date, oQue: string): void {
  if (diaCivil(d) > diaCivil(new Date())) {
    throw new Error(`A data ${oQue} (${dataBr(d)}) é futura. Registre quando acontecer. Nada foi gravado.`);
  }
}

const zNumeroDoCheque = z.string().trim().min(1, "Informe o número do cheque.").max(15, "O número do cheque tem no máximo 15 caracteres.");

const zChequeAvulso = z.object({
  contaBancariaId: z.string().min(1),
  numero: zNumeroDoCheque,
  data: z.coerce.date(),
  valor: zMoney,
  favorecido: z.string().trim().min(3, "Informe o favorecido do cheque."),
  finalidade: z.string().trim().min(5, "Informe a finalidade do cheque."),
  criadoPor: z.string().min(1),
});
export type RegistrarChequeAvulsoInput = z.input<typeof zChequeAvulso>;

/** Registra o cheque AVULSO (fora da rotina de pagamento). O número é único na conta, contando os de pagamento. */
export async function registrarChequeAvulso(prisma: PrismaClient, input: RegistrarChequeAvulsoInput): Promise<{ readonly chequeId: string }> {
  const d = zChequeAvulso.parse(input);
  if (!d.valor.greaterThan(0)) throw new Error("O valor do cheque tem de ser maior que zero. Nada foi gravado.");
  exigirNaoFutura(d.data, "do cheque");
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarChequeAvulso, "ENTE");
      await exigirCompetenciaEmExercicioAberto(tx, d.data, "cheque avulso");
      const conta = await tx.contaBancaria.findUnique({ where: { id: d.contaBancariaId }, select: { id: true, codigo: true } });
      if (conta === null) throw new Error("A conta bancária não está cadastrada. Nada foi gravado.");
      const usado = await tx.cheque.findUnique({ where: { contaBancariaId_numero: { contaBancariaId: conta.id, numero: d.numero } }, select: { id: true } });
      if (usado !== null) throw new Error(chequeRepetido(d.numero, conta.codigo));
      const c = await tx.cheque.create({
        data: {
          contaBancariaId: conta.id,
          numero: d.numero,
          origem: "AVULSO",
          data: d.data,
          valor: d.valor.toFixed(2),
          favorecido: d.favorecido,
          finalidade: d.finalidade,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      return { chequeId: c.id };
    });
  } catch (e) {
    // Dois registros simultâneos do mesmo número: a unicidade do banco decide, com a mensagem de negócio.
    if (eUnicidade(e)) {
      const conta = await prisma.contaBancaria.findUnique({ where: { id: d.contaBancariaId }, select: { codigo: true } });
      throw new Error(chequeRepetido(d.numero, conta?.codigo ?? d.contaBancariaId));
    }
    throw e;
  }
}

const eUnicidade = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

function chequeRepetido(numero: string, conta: string): string {
  return `O cheque ${numero} já foi emitido na conta ${conta}. Nada foi gravado.`;
}

const zCancelamento = z.object({
  chequeId: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().trim().min(5, "Informe o motivo do cancelamento."),
  criadoPor: z.string().min(1),
});
export type CancelarChequeAvulsoInput = z.input<typeof zCancelamento>;

/** Cancela o cheque AVULSO. O de pagamento cancela com a anulação do pagamento, e é recusado aqui com esse caminho dito. */
export async function cancelarChequeAvulso(prisma: PrismaClient, input: CancelarChequeAvulsoInput): Promise<{ readonly cancelamentoId: string }> {
  const d = zCancelamento.parse(input);
  exigirNaoFutura(d.data, "do cancelamento");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarChequeAvulso, "ENTE");
    const c = await tx.cheque.findUnique({
      where: { id: d.chequeId },
      select: { numero: true, origem: true, data: true, cancelamento: { select: { id: true } }, pagamento: { select: { numero: true } } },
    });
    if (c === null) throw new Error("O cheque não existe. Nada foi gravado.");
    if (c.origem === "PAGAMENTO") {
      throw new Error(`O cheque ${c.numero} é do pagamento ${c.pagamento?.numero ?? ""}: ele é cancelado anulando o pagamento, na tela de anulações. Nada foi gravado.`);
    }
    if (c.cancelamento !== null) throw new Error(`O cheque ${c.numero} já está cancelado. Nada foi gravado.`);
    if (diaCivil(d.data) < diaCivil(c.data)) {
      throw new Error(`O cancelamento (${dataBr(d.data)}) não pode ser anterior à emissão do cheque (${dataBr(c.data)}). Nada foi gravado.`);
    }
    await exigirCompetenciaEmExercicioAberto(tx, d.data, "cancelamento de cheque");
    try {
      const r = await tx.cancelamentoDeCheque.create({ data: { chequeId: d.chequeId, data: d.data, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
      return { cancelamentoId: r.id };
    } catch (e) {
      if (eUnicidade(e)) throw new Error(`O cheque ${c.numero} já está cancelado. Nada foi gravado.`);
      throw e;
    }
  });
}

// ── A CONSULTA ─────────────────────────────────────────────────────────────────────────────

export type OrigemDoCheque = "PAGAMENTO" | "AVULSO";
export type SituacaoDoCheque = "EMITIDO" | "CANCELADO";

export interface ChequeEmitido {
  readonly id: string;
  readonly origem: OrigemDoCheque;
  readonly numero: string;
  readonly contaBancaria: string;
  readonly data: Date;
  readonly valor: Money;
  /** Avulso: o favorecido digitado. Pagamento: o CPF/CNPJ do credor do empenho (o nome a porta resolve). */
  readonly favorecido: string;
  readonly credorCpfCnpj: string | null;
  /** Avulso: a finalidade. Pagamento: "Pagamento N — empenho E". */
  readonly finalidade: string;
  readonly situacao: SituacaoDoCheque;
  readonly canceladoEm: Date | null;
  readonly motivoDoCancelamento: string | null;
  readonly pagamentoId: string | null;
  readonly empenhoId: string | null;
}

export interface RecorteDosCheques {
  /** Instantes já resolvidos pelo chamador (início e fim do dia civil). */
  readonly de: Date;
  readonly ate: Date;
  readonly contaBancariaId?: string | undefined;
  readonly origem?: OrigemDoCheque | undefined;
  readonly situacao?: SituacaoDoCheque | undefined;
  /**
   * Os de pagamento mostram credor e empenho — dado da despesa. Quem não lê a despesa no ente recebe só os avulsos
   * (a porta diz o motivo). Obrigatório, para o chamador decidir de propósito.
   */
  readonly incluirDePagamento: boolean;
}

/**
 * Os cheques emitidos no período (pela data de EMISSÃO), das duas origens, em ordem de data, conta e número. A situação
 * é a do fim do recorte: o cancelamento posterior ao `ate` ainda não aconteceu para quem consulta aquele período.
 *  · avulso: cancelado pela linha de `CancelamentoDeCheque`;
 *  · pagamento: cancelado quando o pagamento foi ANULADO POR INTEIRO (a anulação parcial reduz o pagamento, mas o cheque
 *    emitido continua sendo o mesmo documento — fica emitido).
 */
export async function chequesEmitidos(
  prisma: Pick<PrismaClient, "cheque">,
  r: RecorteDosCheques
): Promise<readonly ChequeEmitido[]> {
  if (!r.incluirDePagamento && r.origem === "PAGAMENTO") return [];
  const linhas = await prisma.cheque.findMany({
    where: {
      data: { gte: r.de, lte: r.ate },
      ...(r.contaBancariaId !== undefined ? { contaBancariaId: r.contaBancariaId } : {}),
      ...(r.origem !== undefined ? { origem: r.origem } : !r.incluirDePagamento ? { origem: "AVULSO" } : {}),
    },
    orderBy: [{ data: "asc" }, { contaBancaria: { codigo: "asc" } }, { numero: "asc" }],
    select: {
      id: true,
      origem: true,
      numero: true,
      data: true,
      valor: true,
      favorecido: true,
      finalidade: true,
      contaBancaria: { select: { codigo: true } },
      cancelamento: { select: { data: true, motivo: true } },
      pagamento: {
        select: {
          id: true,
          numero: true,
          estornos: { select: { data: true, motivo: true }, orderBy: { data: "asc" } },
          liquidacao: { select: { empenho: { select: { id: true, numero: true, credorCpfCnpj: true } } } },
        },
      },
    },
  });
  const ate = diaCivil(r.ate);
  const doRecorte = (d: Date | undefined): boolean => d !== undefined && diaCivil(d) <= ate;
  const saida: ChequeEmitido[] = [];
  for (const c of linhas) {
    const origem = c.origem as OrigemDoCheque;
    const estorno = c.pagamento?.estornos[0];
    const cancelado = origem === "AVULSO" ? (c.cancelamento !== null && doRecorte(c.cancelamento.data) ? c.cancelamento : null) : estorno !== undefined && doRecorte(estorno.data) ? estorno : null;
    const situacao: SituacaoDoCheque = cancelado !== null ? "CANCELADO" : "EMITIDO";
    if (r.situacao !== undefined && r.situacao !== situacao) continue;
    const emp = c.pagamento?.liquidacao.empenho;
    saida.push({
      id: c.id,
      origem,
      numero: c.numero,
      contaBancaria: c.contaBancaria.codigo,
      data: c.data,
      valor: toMoney(c.valor.toFixed(2)),
      favorecido: origem === "AVULSO" ? (c.favorecido ?? "") : (emp?.credorCpfCnpj ?? ""),
      credorCpfCnpj: emp?.credorCpfCnpj ?? null,
      finalidade: origem === "AVULSO" ? (c.finalidade ?? "") : `Pagamento ${c.pagamento?.numero ?? ""} — empenho ${emp?.numero ?? ""}`,
      situacao,
      canceladoEm: cancelado?.data ?? null,
      motivoDoCancelamento: cancelado?.motivo ?? null,
      pagamentoId: c.pagamento?.id ?? null,
      empenhoId: emp?.id ?? null,
    });
  }
  return saida;
}

/** Totais (Decimal): o emitido que vale e o cancelado. */
export function totaisDosCheques(linhas: readonly ChequeEmitido[]): { readonly emitido: Money; readonly cancelado: Money; readonly quantidade: number } {
  let emitido = toMoney("0.00");
  let cancelado = toMoney("0.00");
  for (const l of linhas) {
    if (l.situacao === "CANCELADO") cancelado = toMoney(cancelado.plus(l.valor));
    else emitido = toMoney(emitido.plus(l.valor));
  }
  return { emitido, cancelado, quantidade: linhas.length };
}
