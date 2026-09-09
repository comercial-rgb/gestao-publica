import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
// M10 → M04 (a seta que a composta da dívida ativa já usa — sem ciclo): o saldo do
// reconhecimento é do M04, e é ele que a reclassificação (TR 5.87) baixa.
import { saldoReconhecidoDe } from "../m04-receita/reconhecimento.js";
import {
  TIPOS_QUE_QUITAM_DIVIDA_ATIVA,
  tipoDaNatureza,
} from "../m04-receita/dominio.js";

/**
 * M10 — DÍVIDA ATIVA (TR 5.83, 4.63; art. 39 da Lei 4.320/64).
 *
 * O crédito do ente contra o CONTRIBUINTE — o espelho da dívida consolidada.
 *
 * ═══ ONDE CADA LANÇAMENTO É FEITO ═══
 * INSCRIÇÃO e ATUALIZAÇÃO: D ativo / C VPA (o patrimônio cresce — o ente reconhece
 * um crédito). CANCELAMENTO: D VPD / C ativo (o crédito morre; a perda é despesa).
 *
 * ⚠️ O RECEBIMENTO NÃO TEM ROTEIRO, E É DE PROPÓSITO. Receber dívida ativa é RECEITA
 * ORÇAMENTÁRIA: quem contabiliza é o M04 (D caixa / C ativo). É fato PERMUTATIVO —
 * um ativo vira outro. NÃO há VPA: ela já foi reconhecida na INSCRIÇÃO, e
 * reconhecê-la de novo contaria a mesma receita DUAS VEZES. O roteiro da
 * arrecadação já vem por parâmetro; a perna credora aponta para o ATIVO. É o mesmo
 * desenho do ingresso de operação de crédito (bloco 4), com o sinal trocado.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// OS RECORDS
// ═══════════════════════════════════════════════════════════════════════════

export type OrigemDividaAtiva = "TRIBUTARIA" | "NAO_TRIBUTARIA";

/**
 * Art. 39, § 2º da Lei 4.320/64 — o rol é FECHADO, e a lei o fecha em DOIS: ou o
 * crédito nasce de tributo, ou não nasce. O `Record` exaustivo é o guarda de
 * cardinalidade: uma origem nova no enum não compila sem alguém dizer de onde ela
 * veio na lei.
 */
export const ORIGENS_DIVIDA_ATIVA: Record<
  OrigemDividaAtiva,
  { readonly nome: string; readonly base: string }
> = {
  TRIBUTARIA: {
    nome: "Dívida ativa tributária",
    base: "art. 39, § 2º — crédito da Fazenda proveniente de tributos e seus acréscimos",
  },
  NAO_TRIBUTARIA: {
    nome: "Dívida ativa não tributária",
    base: "art. 39, § 2º — demais créditos (multas, aluguéis, ressarcimentos, alcances)",
  },
};

export type TipoMovimentoDividaAtiva =
  | "INSCRICAO"
  | "ATUALIZACAO"
  | "RECEBIMENTO"
  | "CANCELAMENTO"
  | "ESTORNO_INSCRICAO"
  | "ESTORNO_ATUALIZACAO"
  | "ESTORNO_RECEBIMENTO"
  | "ESTORNO_CANCELAMENTO";

/**
 * O SINAL DE CADA MOVIMENTO SOBRE O SALDO DO CRÉDITO.
 *
 * O crédito CRESCE ao ser inscrito e ao ser atualizado (juros, multa, correção);
 * DIMINUI ao ser recebido (o contribuinte pagou) e ao ser cancelado (prescreveu,
 * foi remido, caiu na Justiça). Os estornos desfazem, cada um com o sinal invertido.
 */
export const SINAL_MOVIMENTO_DIVIDA_ATIVA: Record<
  TipoMovimentoDividaAtiva,
  1 | -1
> = {
  INSCRICAO: 1,
  ATUALIZACAO: 1,
  RECEBIMENTO: -1,
  CANCELAMENTO: -1,
  ESTORNO_INSCRICAO: -1,
  ESTORNO_ATUALIZACAO: -1,
  ESTORNO_RECEBIMENTO: 1,
  ESTORNO_CANCELAMENTO: 1,
};

/** Quais tipos têm lançamento PRÓPRIO (o RECEBIMENTO não tem — ver o cabeçalho). */
export const TIPO_TEM_ROTEIRO: Record<TipoMovimentoDividaAtiva, boolean> = {
  INSCRICAO: true,
  ATUALIZACAO: true,
  CANCELAMENTO: true,
  /** O M04 contabiliza (D caixa / C ativo). Um roteiro aqui creditaria 2x. */
  RECEBIMENTO: false,
  ESTORNO_INSCRICAO: true,
  ESTORNO_ATUALIZACAO: true,
  ESTORNO_CANCELAMENTO: true,
  ESTORNO_RECEBIMENTO: false,
};

export const TIPO_DO_ESTORNO_DIVIDA_ATIVA: Record<
  TipoMovimentoDividaAtiva,
  TipoMovimentoDividaAtiva | null
> = {
  INSCRICAO: "ESTORNO_INSCRICAO",
  ATUALIZACAO: "ESTORNO_ATUALIZACAO",
  RECEBIMENTO: "ESTORNO_RECEBIMENTO",
  CANCELAMENTO: "ESTORNO_CANCELAMENTO",
  ESTORNO_INSCRICAO: null,
  ESTORNO_ATUALIZACAO: null,
  ESTORNO_RECEBIMENTO: null,
  ESTORNO_CANCELAMENTO: null,
};

export interface MovimentoParaSaldoAtiva {
  readonly tipo: TipoMovimentoDividaAtiva;
  readonly valor: Money;
}

/** Σ(valor × SINAL). Puro, e a fonte única. O estorno SOMA, com o sinal dele. */
export function saldoDaDividaAtiva(
  movimentos: readonly MovimentoParaSaldoAtiva[]
): Money {
  let saldo = toMoney("0.00");
  for (const m of movimentos) {
    const sinal = SINAL_MOVIMENTO_DIVIDA_ATIVA[m.tipo];
    saldo = toMoney(sinal === 1 ? saldo.plus(m.valor) : saldo.minus(m.valor));
  }
  return saldo;
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zCadastrarDividaAtivaInput = z.object({
  identificador: z.string().trim().min(1),
  devedorNome: z.string().trim().min(3),
  devedorDocumento: z.string().trim().min(11, "CPF (11) ou CNPJ (14), sem máscara"),
  origem: z.enum(
    Object.keys(ORIGENS_DIVIDA_ATIVA) as [OrigemDividaAtiva, ...OrigemDividaAtiva[]]
  ),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarDividaAtivaInput = z.input<typeof zCadastrarDividaAtivaInput>;

export const zInscreverDividaAtivaInput = z.object({
  dividaAtivaId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
  /**
   * ⚠️ TR 5.87 — A RECLASSIFICAÇÃO. Presente = este crédito JÁ FOI RECONHECIDO (fato gerador), e
   * inscrevê-lo em dívida ativa é MOVER o ativo (D dívida ativa × C crédito a receber), não criar
   * riqueza. Ausente = o caminho de sempre (D dívida ativa × C VPA — o ente reconhece agora um
   * crédito que não tinha). É o parâmetro que escolhe entre os dois, e fecha a pendência do
   * bloco 6.
   */
  reconhecimentoId: z.string().min(1).optional(),
  /**
   * A conta de crédito a receber a baixar — obrigatória SE e SÓ SE há `reconhecimentoId`. É a
   * mesma conta que o reconhecimento debitou; a borda a conhece pelo roteiro da origem.
   */
  contaCreditoAReceberId: z.string().min(1).optional(),
});
export type InscreverDividaAtivaInput = z.input<typeof zInscreverDividaAtivaInput>;

export const zAtualizarDividaAtivaInput = z.object({
  dividaAtivaId: z.string().min(1),
  valor: zValorPositivo,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AtualizarDividaAtivaInput = z.input<typeof zAtualizarDividaAtivaInput>;

export const zReceberDividaAtivaInput = z.object({
  dividaAtivaId: z.string().min(1),
  /** TR 4.63 — o recebimento NASCE de uma receita arrecadada. */
  receitaArrecadadaId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type ReceberDividaAtivaInput = z.input<typeof zReceberDividaAtivaInput>;

export const zCancelarDividaAtivaInput = z.object({
  dividaAtivaId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type CancelarDividaAtivaInput = z.input<typeof zCancelarDividaAtivaInput>;

export const zEstornarMovimentoDividaAtivaInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoDividaAtivaInput = z.input<
  typeof zEstornarMovimentoDividaAtivaInput
>;

function inicioDaCompetencia(competencia: string): Date {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(Date.UTC(ano!, mes! - 1, 1, 0, 0, 0, 0));
}

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS DERIVADAS
// ═══════════════════════════════════════════════════════════════════════════

export async function saldoDaDividaAtivaEm(
  tx: Tx,
  dividaAtivaId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoDividaAtiva.findMany({
    where: {
      dividaAtivaId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return saldoDaDividaAtiva(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** 6º e último posto da ordem de locks (ver packages/locks). */
async function travarDividaAtiva(tx: Tx, id: string): Promise<void> {
  await travar(tx, "DividaAtiva", [id]);
}

async function exigirDividaAtiva(
  tx: Tx,
  id: string
): Promise<{
  readonly id: string;
  readonly identificador: string;
  readonly contaContabilId: string;
}> {
  const d = await tx.dividaAtiva.findUnique({
    where: { id },
    select: { id: true, identificador: true, contaContabilId: true },
  });
  if (d === null) {
    throw new Error(`Dívida ativa ${id} não existe.`);
  }
  return d;
}

/** O roteiro do tipo — TABELA. Ausente = LANÇA, sem gravar nada. */
async function exigirRoteiro(
  tx: Tx,
  tipo: TipoMovimentoDividaAtiva
): Promise<{ readonly contaDebitoId: string; readonly contaCreditoId: string }> {
  const r = await tx.roteiroDividaAtiva.findUnique({
    where: { tipo },
    select: { contaDebitoId: true, contaCreditoId: true },
  });
  if (r === null) {
    throw new Error(
      `Não há RoteiroDividaAtiva cadastrado para ${tipo}. As contas do PCASP vêm ` +
        `por PARÂMETRO — nenhuma conta é inventada no código. Cadastre o roteiro ` +
        `antes de movimentar a dívida ativa.`
    );
  }
  return r;
}

/** Grava o lançamento do movimento (para os tipos que têm roteiro). */
async function lancar(
  tx: Tx,
  p: {
    readonly tipo: TipoMovimentoDividaAtiva;
    readonly identificador: string;
    readonly valor: Money;
    readonly data: Date;
    readonly competencia: Date;
    readonly dividaAtivaId: string;
    readonly criadoPor: string;
    /** Inverte débito e crédito — é o que um ESTORNO é. */
    readonly inverter: boolean;
    readonly tipoDoRoteiro: TipoMovimentoDividaAtiva;
  }
): Promise<string> {
  const r = await exigirRoteiro(tx, p.tipoDoRoteiro);
  const debito = p.inverter ? r.contaCreditoId : r.contaDebitoId;
  const credito = p.inverter ? r.contaDebitoId : r.contaCreditoId;

  const id = randomUUID();
  await lancarNoRazao(tx, {
      id,
      numeroControle: `DA-${p.identificador}`,
      dataTransacao: p.data,
      historico: `${p.tipo} da dívida ativa ${p.identificador}`,
      origemTipo: "DIVIDA_ATIVA",
      origemId: p.dividaAtivaId,
      criadoPor: p.criadoPor,
      partidas: [
          {
            contaId: debito,
            tipo: "DEBITO",
            subsistema: "PATRIMONIAL",
            valor: p.valor.toFixed(2),
          },
          {
            contaId: credito,
            tipo: "CREDITO",
            subsistema: "PATRIMONIAL",
            valor: p.valor.toFixed(2),
          },
        ]
    });
  return id;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVIÇOS
// ═══════════════════════════════════════════════════════════════════════════

/** O cadastro é IDENTIDADE — zero valor. O valor é o Σ dos movimentos. */
export async function cadastrarDividaAtiva(
  prisma: PrismaClient,
  input: CadastrarDividaAtivaInput
): Promise<{ readonly dividaAtivaId: string }> {
  const d = zCadastrarDividaAtivaInput.parse(input);
  // SEM UG: a dívida ativa é crédito do ENTE contra o contribuinte. Não tem unidade — tem devedor.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarDividaAtiva, "ENTE");

  const criada = await prisma.dividaAtiva.create({
    data: {
      identificador: d.identificador,
      devedorNome: d.devedorNome,
      devedorDocumento: d.devedorDocumento,
      origem: d.origem,
      contaContabilId: d.contaContabilId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { dividaAtivaId: criada.id };
}

/** INSCRIÇÃO — D ativo / C VPA. O ente reconhece o crédito que não tinha. */
export async function inscreverDividaAtiva(
  prisma: PrismaClient,
  input: InscreverDividaAtivaInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zInscreverDividaAtivaInput.parse(input);

  // ⚠️ XOR: reconhecimentoId e contaCreditoAReceberId vêm juntos ou não vêm. Um sem o outro é
  // um pedido malformado — reclassificar exige saber DE QUAL conta o crédito sai.
  const reclassifica = d.reconhecimentoId !== undefined;
  if (reclassifica !== (d.contaCreditoAReceberId !== undefined)) {
    throw new Error(
      `INSCRIÇÃO MALFORMADA: 'reconhecimentoId' e 'contaCreditoAReceberId' andam JUNTOS — a ` +
        `reclassificação (TR 5.87) baixa um crédito reconhecido e precisa saber de qual conta. ` +
        `Informe os dois (reclassificação), ou nenhum (inscrição comum, D dívida ativa × C VPA).`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.inscreverDividaAtiva, "ENTE");

    // ⚠️ ORDEM DOS LOCKS: ReceitaReconhecida (posto 8) ANTES da DividaAtiva (posto 9). O
    // `packages/locks` recusa a inversão — a reclassificação decide sobre o saldo do
    // reconhecimento primeiro, e só então move o crédito para a dívida ativa.
    if (reclassifica) {
      await travar(tx, "ReceitaReconhecida", [d.reconhecimentoId!]);
      const saldo = await saldoReconhecidoDe(tx, d.reconhecimentoId!);
      if (d.valor.greaterThan(saldo)) {
        throw new Error(
          `INSCRIÇÃO ACIMA DO SALDO RECONHECIDO: quer inscrever ${d.valor.toFixed(2)} do ` +
            `reconhecimento ${d.reconhecimentoId}, que tem saldo de ${saldo.toFixed(2)}. Não se ` +
            `reclassifica em dívida ativa mais crédito do que ainda resta a arrecadar. Nada foi gravado.`
        );
      }
    }

    await travarDividaAtiva(tx, d.dividaAtivaId);
    const da = await exigirDividaAtiva(tx, d.dividaAtivaId);

    // ⚠️ A PERNA DE CRÉDITO É A BIFURCAÇÃO. Comum: VPA (do roteiro INSCRICAO — o ente reconhece
    // agora). Reclassificação: crédito a receber (o crédito JÁ foi reconhecido; aqui só muda de
    // lugar, e a VPA NÃO se repete — é o ponto do t3).
    const lancamentoId = reclassifica
      ? await lancarReclassificacao(tx, {
          identificador: da.identificador,
          valor: d.valor,
          data: d.dataMovimento,
          dividaAtivaId: d.dividaAtivaId,
          contaCreditoAReceberId: d.contaCreditoAReceberId!,
          criadoPor: d.criadoPor,
        })
      : await lancar(tx, {
          tipo: "INSCRICAO",
          tipoDoRoteiro: "INSCRICAO",
          inverter: false,
          identificador: da.identificador,
          valor: d.valor,
          data: d.dataMovimento,
          competencia: d.dataMovimento,
          dividaAtivaId: d.dividaAtivaId,
          criadoPor: d.criadoPor,
        });

    const criado = await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: d.dividaAtivaId,
        tipo: "INSCRICAO",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    // A RECLASSIFICAÇÃO baixa o reconhecimento — o vínculo que faz o saldo derivado cair a zero.
    if (reclassifica) {
      await tx.inscricaoDeReconhecimento.create({
        data: {
          reconhecimentoId: d.reconhecimentoId!,
          movimentoDividaAtivaId: criado.id,
          valor: d.valor.toFixed(2),
          criadoPor: d.criadoPor,
        },
      });
    }

    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * O LANÇAMENTO DA RECLASSIFICAÇÃO — D dívida ativa (conta do roteiro INSCRICAO) × C crédito a
 * receber (a conta que o reconhecimento debitou). A VPA do roteiro NÃO entra: o crédito já foi
 * reconhecido, e reconhecê-lo de novo dobraria a receita.
 */
async function lancarReclassificacao(
  tx: Tx,
  p: {
    readonly identificador: string;
    readonly valor: Money;
    readonly data: Date;
    readonly dividaAtivaId: string;
    readonly contaCreditoAReceberId: string;
    readonly criadoPor: string;
  }
): Promise<string> {
  const roteiro = await exigirRoteiro(tx, "INSCRICAO");
  const id = randomUUID();
  await lancarNoRazao(tx, {
    id,
    numeroControle: `DA-RECLASS-${p.identificador}`,
    dataTransacao: p.data,
    historico: `Inscrição em dívida ativa (reclassificação TR 5.87) de ${p.identificador}`,
    origemTipo: "DIVIDA_ATIVA",
    origemId: p.dividaAtivaId,
    criadoPor: p.criadoPor,
    partidas: [
      // D dívida ativa — a mesma conta de débito da inscrição comum (o roteiro INSCRICAO).
      {
        contaId: roteiro.contaDebitoId,
        tipo: "DEBITO",
        subsistema: "PATRIMONIAL",
        valor: p.valor.toFixed(2),
      },
      // C crédito a receber — NÃO a VPA. É o que torna a operação uma RECLASSIFICAÇÃO.
      {
        contaId: p.contaCreditoAReceberId,
        tipo: "CREDITO",
        subsistema: "PATRIMONIAL",
        valor: p.valor.toFixed(2),
      },
    ],
  });
  return id;
}

/**
 * ATUALIZAÇÃO (juros, multa, correção) — D ativo / C VPA.
 *
 * ⚠️ IDEMPOTÊNCIA DERIVADA, NÃO ÍNDICE ÚNICO: duas correções da mesma competência
 * seriam a mesma correção duas vezes. Mas um `@@unique(divida, competencia)`
 * travaria a competência PARA SEMPRE — inclusive depois de a correção ser
 * ESTORNADA, quando ela precisa poder ser refeita. Quem governa é o SALDO da
 * competência (o padrão consolidado: M09 t7, M10 bloco 2 t3, dívida consolidada t4).
 */
export async function atualizarDividaAtiva(
  prisma: PrismaClient,
  input: AtualizarDividaAtivaInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zAtualizarDividaAtivaInput.parse(input);
  const competencia = inicioDaCompetencia(d.competencia);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atualizarDividaAtiva, "ENTE");

    await travarDividaAtiva(tx, d.dividaAtivaId);
    const da = await exigirDividaAtiva(tx, d.dividaAtivaId);

    const daCompetencia = await tx.movimentoDividaAtiva.findMany({
      where: {
        dividaAtivaId: d.dividaAtivaId,
        competencia,
        tipo: { in: ["ATUALIZACAO", "ESTORNO_ATUALIZACAO"] },
      },
      select: { tipo: true, valor: true },
    });
    const jaAtualizado = saldoDaDividaAtiva(
      daCompetencia.map((m) => ({
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    );
    if (!jaAtualizado.isZero()) {
      throw new Error(
        `COMPETÊNCIA ${d.competencia} JÁ ATUALIZADA na dívida ativa ` +
          `${da.identificador} (líquido ${jaAtualizado.toFixed(2)}). Corrigir duas ` +
          `vezes o mesmo mês é cobrar do contribuinte juros que ele não deve. ` +
          `Estorne a atualização anterior se ela estiver errada.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipo: "ATUALIZACAO",
      tipoDoRoteiro: "ATUALIZACAO",
      inverter: false,
      identificador: da.identificador,
      valor: d.valor,
      data: d.dataMovimento,
      competencia,
      dividaAtivaId: d.dividaAtivaId,
      criadoPor: d.criadoPor,
    });

    const criado = await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: d.dividaAtivaId,
        tipo: "ATUALIZACAO",
        valor: d.valor.toFixed(2),
        competencia,
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * RECEBIMENTO (TR 4.63) — SEM LANÇAMENTO PRÓPRIO.
 *
 * Quem contabiliza é o M04 (D caixa / C ativo): receber dívida ativa é RECEITA
 * ORÇAMENTÁRIA e fato PERMUTATIVO. Lançar aqui creditaria o ativo DUAS VEZES.
 *
 * FAIL-CLOSED, na ordem: a dívida existe (e é travada); a receita existe e NÃO está
 * anulada; o valor cabe no SALDO; o valor cabe na RECEITA; e — o guard que não é
 * óbvio — a SOMA dos recebimentos vinculados àquela MESMA receita cabe nela.
 *
 * ⚠️ UMA RECEITA PODE QUITAR VÁRIAS DÍVIDAS (um acordo, uma guia única). Sem o
 * último guard, N dívidas seriam "quitadas" com o mesmo dinheiro — e o razão
 * mostraria um caixa que nunca entrou.
 */
/**
 * ⚠️ INTERNA — roda DENTRO da transação da OPERAÇÃO COMPOSTA.
 *
 * Não é mais serviço público. Receber dívida ativa SEM arrecadar é meio fato: o
 * razão baixaria o ativo (pela arrecadação) e os movimentos não, ou vice-versa. Os
 * dois lados nascem juntos — a lição da retenção do M07 (`pagar()`), aplicada aqui.
 */
export async function receberNaTx(
  tx: Tx,
  input: ReceberDividaAtivaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zReceberDividaAtivaInput.parse(input);
  {
    await travarDividaAtiva(tx, d.dividaAtivaId);
    const da = await exigirDividaAtiva(tx, d.dividaAtivaId);

    const receita = await tx.receitaArrecadada.findUnique({
      where: { id: d.receitaArrecadadaId },
      select: {
        id: true,
        valor: true,
        numeroReceita: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        naturezaReceita: { select: { codigo: true, descricao: true } },
      },
    });
    if (receita === null) {
      throw new Error(
        `Receita arrecadada ${d.receitaArrecadadaId} não existe — e a TR 4.63 exige ` +
          `que o recebimento de dívida ativa nasça de uma receita.`
      );
    }
    if (receita.estornoDeId !== null) {
      throw new Error(
        `A receita ${receita.numeroReceita} É uma ANULAÇÃO — não se quita dívida ` +
          `ativa com o estorno de uma arrecadação.`
      );
    }
    if (receita.estornos.length > 0) {
      throw new Error(
        `A receita ${receita.numeroReceita} foi ANULADA. O dinheiro voltou ao ` +
          `contribuinte; a dívida dele não está quitada.`
      );
    }

    // ⚠️ ATÉ 50783ae NÃO HAVIA GUARD NENHUM AQUI SOBRE A NATUREZA — e este era o
    // MAIS degradado dos quatro: o de crédito ao menos exigia a categoria; este
    // aceitava QUALQUER receita viva. A guia do IPTU do exercício corrente quitava
    // dívida ativa: o contribuinte que pagou o imposto DESTE ano teria sua dívida
    // INSCRITA baixada, e o crédito sumiria do ativo sem que ninguém o pagasse.
    //
    // O que faltava era o TIPO (8º dígito) — a posição do código que distingue o
    // PRINCIPAL (1) da DÍVIDA ATIVA (3), e ela existe justamente para isto. É o
    // mesmo IPTU: muda o tipo, muda o fato.
    const tipoNatureza = tipoDaNatureza(receita.naturezaReceita.codigo);
    if (!TIPOS_QUE_QUITAM_DIVIDA_ATIVA[tipoNatureza]) {
      throw new Error(
        `A receita ${receita.numeroReceita} é da natureza ` +
          `${receita.naturezaReceita.codigo} (${receita.naturezaReceita.descricao}), ` +
          `cujo TIPO é ${tipoNatureza} — e não quita dívida ativa. O 8º dígito do ` +
          `código é quem distingue o crédito do exercício (tipo 1, PRINCIPAL) do ` +
          `crédito INSCRITO em dívida ativa (tipo 3) e dos juros e multas DELE ` +
          `(tipo 4). Quitar a inscrição com a guia do tributo corrente baixaria do ` +
          `ativo um crédito que ninguém pagou.`
      );
    }

    // (1) cabe no SALDO da dívida?
    const saldo = await saldoDaDividaAtivaEm(tx, d.dividaAtivaId);
    if (d.valor.greaterThan(saldo)) {
      throw new Error(
        `RECEBIMENTO MAIOR QUE O SALDO da dívida ativa ${da.identificador}: ` +
          `receber ${d.valor.toFixed(2)} deixaria o crédito NEGATIVO — ele vale ` +
          `${saldo.toFixed(2)}. O contribuinte não deve tanto.`
      );
    }

    // (2) cabe na RECEITA? (e (3) cabe no que SOBROU dela — o guard não óbvio)
    const arrecadado = toMoney(receita.valor.toFixed(2));
    const outros = await tx.movimentoDividaAtiva.findMany({
      where: {
        receitaArrecadadaId: d.receitaArrecadadaId,
        tipo: { in: ["RECEBIMENTO", "ESTORNO_RECEBIMENTO"] },
      },
      select: { tipo: true, valor: true },
    });
    // O Σ com sinal: o ESTORNO_RECEBIMENTO devolve espaço à receita.
    let jaVinculado = toMoney("0.00");
    for (const m of outros) {
      const v = toMoney(m.valor.toFixed(2));
      jaVinculado =
        m.tipo === "RECEBIMENTO"
          ? toMoney(jaVinculado.plus(v))
          : toMoney(jaVinculado.minus(v));
    }
    const depois = toMoney(jaVinculado.plus(d.valor));
    if (depois.greaterThan(arrecadado)) {
      throw new Error(
        `RECEITA ESGOTADA: a guia ${receita.numeroReceita} arrecadou ` +
          `${arrecadado.toFixed(2)}, já quitou ${jaVinculado.toFixed(2)} de dívida ` +
          `ativa, e agora quitaria mais ${d.valor.toFixed(2)} (total ` +
          `${depois.toFixed(2)}). Uma receita pode quitar VÁRIAS dívidas — mas não ` +
          `mais dinheiro do que entrou. Sem este limite, N dívidas seriam baixadas ` +
          `com o mesmo real, e o razão mostraria um caixa que nunca existiu.`
      );
    }

    const criado = await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: d.dividaAtivaId,
        tipo: "RECEBIMENTO",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        receitaArrecadadaId: d.receitaArrecadadaId,
        // SEM lancamentoId: quem contabiliza é o M04 (ver o cabeçalho).
        motivo: `Recebimento pela guia ${receita.numeroReceita}`,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  }
}

/** CANCELAMENTO (prescrição, remissão, decisão judicial) — D VPD / C ativo. */
export async function cancelarDividaAtiva(
  prisma: PrismaClient,
  input: CancelarDividaAtivaInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zCancelarDividaAtivaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG — e esta é a ação mais perigosa do M10: cancelar dívida ativa PERDOA um crédito do ente.
    // Ela é ação PRÓPRIA no censo justamente para poder ser concedida a quase ninguém.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarDividaAtiva, "ENTE");

    await travarDividaAtiva(tx, d.dividaAtivaId);
    const da = await exigirDividaAtiva(tx, d.dividaAtivaId);

    const saldo = await saldoDaDividaAtivaEm(tx, d.dividaAtivaId);
    if (d.valor.greaterThan(saldo)) {
      throw new Error(
        `CANCELAMENTO MAIOR QUE O SALDO da dívida ativa ${da.identificador}: ` +
          `cancelar ${d.valor.toFixed(2)} deixaria o crédito NEGATIVO — ele vale ` +
          `${saldo.toFixed(2)}. Não se perdoa o que não se cobra.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipo: "CANCELAMENTO",
      tipoDoRoteiro: "CANCELAMENTO",
      inverter: false,
      identificador: da.identificador,
      valor: d.valor,
      data: d.dataMovimento,
      competencia: d.dataMovimento,
      dividaAtivaId: d.dividaAtivaId,
      criadoPor: d.criadoPor,
    });

    const criado = await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: d.dividaAtivaId,
        tipo: "CANCELAMENTO",
        valor: d.valor.toFixed(2),
        dataMovimento: d.dataMovimento,
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

/**
 * ESTORNO — simétrico completo.
 *
 * ⚠️ A PORTA DO RECEBIMENTO É FECHADA. Um RECEBIMENTO nasceu de uma RECEITA
 * ARRECADADA (M04). Estorná-lo sozinho ressuscitaria o crédito e deixaria o dinheiro
 * no caixa — o contribuinte teria pago E continuaria devendo. Para desfazê-lo, ANULE
 * A ARRECADAÇÃO no M04.
 *
 * ⚠️⚠️ E AQUI ESTÁ O FURO, NOMEADO: o M04 **não sabe** que existe dívida ativa. Anular
 * a arrecadação **não** estorna o RECEBIMENTO — a `anularArrecadacao` não olha para
 * cá. O caminho de ida está trancado (o `receberDividaAtiva` recusa receita anulada);
 * o de VOLTA está aberto: quem anular a receita DEPOIS de recebê-la deixa a dívida
 * baixada e o dinheiro desfeito. Fechar isso exige um PORT no M04 (o mesmo desenho do
 * `ContratoPort` do M11) — cirurgia que não cabe neste bloco. Está no MODULO.md como
 * PENDÊNCIA, com o furo escrito por extenso: NÃO é uma meia-trava, é uma trava que
 * falta.
 */
export async function estornarMovimentoDividaAtiva(
  prisma: PrismaClient,
  input: EstornarMovimentoDividaAtivaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoDividaAtivaInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoDividaAtiva, "ENTE");

    const original = await tx.movimentoDividaAtiva.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        dividaAtivaId: true,
        tipo: true,
        valor: true,
        competencia: true,
        receitaArrecadadaId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de dívida ativa ${d.movimentoId} não existe.`);
    }

    const tipo = TIPO_DO_ESTORNO_DIVIDA_ATIVA[original.tipo];
    if (tipo === null) {
      throw new Error(
        `${original.tipo} JÁ É um estorno — não se estorna um estorno. Para refazer o ` +
          `fato, registre-o de novo (append-only: o histórico não se reescreve).`
      );
    }

    if (original.tipo === "RECEBIMENTO") {
      throw new Error(
        `PORTA FECHADA: o movimento ${original.id} é um RECEBIMENTO, e ele nasceu da ` +
          `receita ${original.receitaArrecadadaId} (M04). Estorná-lo aqui ` +
          `ressuscitaria o crédito e deixaria o dinheiro no caixa — o contribuinte ` +
          `teria pago E continuaria devendo. ANULE A ARRECADAÇÃO no M04.`
      );
    }

    await travarDividaAtiva(tx, original.dividaAtivaId);
    const da = await exigirDividaAtiva(tx, original.dividaAtivaId);

    if (original.estornos.length > 0) {
      throw new Error(
        `Movimento de dívida ativa ${original.id} JÁ FOI ESTORNADO. Estornar duas ` +
          `vezes desfaria o valor em dobro.`
      );
    }

    const valor = toMoney(original.valor.toFixed(2));
    // O estorno INVERTE as pernas do roteiro do original — é o que ele é.
    const lancamentoId = await lancar(tx, {
      tipo,
      tipoDoRoteiro: original.tipo,
      inverter: true,
      identificador: da.identificador,
      valor,
      data: d.dataMovimento,
      competencia: original.competencia ?? d.dataMovimento,
      dividaAtivaId: original.dividaAtivaId,
      criadoPor: d.criadoPor,
    });

    const criado = await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: original.dividaAtivaId,
        tipo,
        valor: valor.toFixed(2),
        // A competência é PRESERVADA: sem ela, a idempotência da atualização nunca
        // liberaria a competência estornada (o bug do M10 bloco 1, exposto no 2).
        competencia: original.competencia,
        dataMovimento: d.dataMovimento,
        lancamentoId,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A AMARRAÇÃO — a segunda leitura
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Σ DOS MOVIMENTOS × SALDO DA CONTA NO RAZÃO.
 *
 * Duas leituras independentes do MESMO crédito: uma soma os fatos da dívida ativa
 * (com o `SINAL_MOVIMENTO_DIVIDA_ATIVA`); a outra soma as PARTIDAS da conta contábil
 * (débitos − créditos: a conta é de ATIVO, devedora). Se divergirem, ou um roteiro
 * está lançando na conta errada, ou alguém mexeu na conta por fora dos serviços.
 *
 * ⚠️ O GRÃO É A CONTA, NÃO A DÍVIDA. Várias dívidas ativas compartilham a mesma conta
 * do PCASP (o plano não tem uma conta por contribuinte) — então a amarração soma
 * TODAS as dívidas daquela conta. Amarrar por dívida exigiria uma conta por dívida, o
 * que nenhum ente tem.
 */
export async function conferirDividaAtivaContraRazao(
  prisma: Tx,
  contaContabilId: string
): Promise<{ readonly pelosMovimentos: Money; readonly peloRazao: Money }> {
  const dividas = await prisma.dividaAtiva.findMany({
    where: { contaContabilId },
    select: { id: true },
  });

  let pelosMovimentos = toMoney("0.00");
  for (const d of dividas) {
    pelosMovimentos = toMoney(
      pelosMovimentos.plus(await saldoDaDividaAtivaEm(prisma, d.id))
    );
  }

  const partidas = await prisma.partidaContabil.findMany({
    where: { contaId: contaContabilId },
    select: { tipo: true, valor: true },
  });
  let peloRazao = toMoney("0.00");
  for (const p of partidas) {
    const v = toMoney(p.valor.toFixed(2));
    peloRazao =
      p.tipo === "DEBITO"
        ? toMoney(peloRazao.plus(v))
        : toMoney(peloRazao.minus(v));
  }

  if (!pelosMovimentos.equals(peloRazao)) {
    const conta = await prisma.contaPcasp.findUnique({
      where: { id: contaContabilId },
      select: { codigo: true },
    });
    throw new Error(
      `DÍVIDA ATIVA NÃO FECHA COM O RAZÃO (conta ${conta?.codigo ?? contaContabilId}): ` +
        `os movimentos somam ${pelosMovimentos.toFixed(2)} e o razão tem ` +
        `${peloRazao.toFixed(2)}. Diferença: ` +
        `${peloRazao.minus(pelosMovimentos).toFixed(2)}. Duas leituras independentes ` +
        `do mesmo crédito discordaram: ou um roteiro está lançando na conta errada, ` +
        `ou alguém movimentou a conta por fora dos serviços.`
    );
  }

  return { pelosMovimentos, peloRazao };
}

/**
 * A CASCATA DA ANULAÇÃO — estorna os RECEBIMENTOS vivos vinculados à receita anulada.
 *
 * Roda DENTRO da transação da anulação da arrecadação (M04), pela porta
 * `AoAnularArrecadacaoPort`. É o que fecha o furo nomeado em a98f0a5: sem isto, anular
 * a receita devolvia o dinheiro ao contribuinte e deixava a dívida dele BAIXADA — ele
 * teria "pago" sem ter pago.
 *
 * ⚠️ UMA GUIA PODE TER QUITADO VÁRIAS DÍVIDAS: todas voltam, cada uma com o SEU valor
 * (nunca um valor único recarimbado — a lição do `resolverPartidas` do M08).
 */
export async function estornarRecebimentoNaTx(
  tx: Tx,
  receitaArrecadadaId: string
): Promise<void> {
  const recebimentos = await tx.movimentoDividaAtiva.findMany({
    where: { receitaArrecadadaId, tipo: "RECEBIMENTO" },
    select: {
      id: true,
      dividaAtivaId: true,
      valor: true,
      dataMovimento: true,
      estornos: { select: { id: true } },
    },
  });

  for (const r of recebimentos) {
    if (r.estornos.length > 0) continue;
    await travarDividaAtiva(tx, r.dividaAtivaId);
    await tx.movimentoDividaAtiva.create({
      data: {
        dividaAtivaId: r.dividaAtivaId,
        tipo: "ESTORNO_RECEBIMENTO",
        valor: r.valor.toFixed(2),
        dataMovimento: r.dataMovimento,
        receitaArrecadadaId,
        estornoDeId: r.id,
        // SEM lançamento: o M04 já inverteu as partidas na anulação (D ativo / C caixa).
        motivo: "Anulação da arrecadação que quitou esta dívida ativa.",
        criadoPor: "M04:anularArrecadacao",
      },
      select: { id: true },
    });
  }
}
