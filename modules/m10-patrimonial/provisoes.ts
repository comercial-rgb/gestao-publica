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
import { janelaCivilDoMes } from "../../packages/datas/index.js";

/**
 * M10 — PROVISÕES MATEMÁTICAS PREVIDENCIÁRIAS (TR 5.89).
 *
 * O passivo atuarial do RPPS. Mesma anatomia da dívida consolidada: append-only, saldo
 * por Σ, roteiro por tabela, estornos desde o dia 1.
 *
 * ═══ A REVERSÃO É UM FATO NOVO, NÃO UM ESTORNO — e a diferença é o resultado ═══
 * O cálculo atuarial de 2027 pode mostrar que a provisão de 2026 estava ALTA. Reduzi-la
 * é um GANHO patrimonial: D passivo / C VPA. O ente ficou mais rico porque descobriu
 * que devia menos — e isso é um fato do exercício em que se descobriu.
 *
 * O ESTORNO existe para o OUTRO caso: a provisão lançada ERRADA (digitaram 100.000 em
 * vez de 10.000). Ele desfaz o lançamento, invertendo as pernas — e NÃO gera VPA.
 *
 * Confundir os dois faria o resultado do exercício absorver, como ganho, a correção de
 * um erro de digitação.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type TipoMovimentoProvisao =
  | "CONSTITUICAO"
  | "ATUALIZACAO"
  | "REVERSAO"
  | "ESTORNO_CONSTITUICAO"
  | "ESTORNO_ATUALIZACAO"
  | "ESTORNO_REVERSAO";

/** O passivo CRESCE ao ser constituído e atualizado; DIMINUI ao ser revertido. */
export const SINAL_MOVIMENTO_PROVISAO: Record<TipoMovimentoProvisao, 1 | -1> = {
  CONSTITUICAO: 1,
  ATUALIZACAO: 1,
  REVERSAO: -1,
  ESTORNO_CONSTITUICAO: -1,
  ESTORNO_ATUALIZACAO: -1,
  ESTORNO_REVERSAO: 1,
};

export const TIPO_DO_ESTORNO_PROVISAO: Record<
  TipoMovimentoProvisao,
  TipoMovimentoProvisao | null
> = {
  CONSTITUICAO: "ESTORNO_CONSTITUICAO",
  ATUALIZACAO: "ESTORNO_ATUALIZACAO",
  REVERSAO: "ESTORNO_REVERSAO",
  ESTORNO_CONSTITUICAO: null,
  ESTORNO_ATUALIZACAO: null,
  ESTORNO_REVERSAO: null,
};

export interface MovimentoParaSaldoProvisao {
  readonly tipo: TipoMovimentoProvisao;
  readonly valor: Money;
}

export function saldoDaProvisao(
  movimentos: readonly MovimentoParaSaldoProvisao[]
): Money {
  let saldo = toMoney("0.00");
  for (const m of movimentos) {
    const sinal = SINAL_MOVIMENTO_PROVISAO[m.tipo];
    saldo = toMoney(sinal === 1 ? saldo.plus(m.valor) : saldo.minus(m.valor));
  }
  return saldo;
}

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

export const zCadastrarProvisaoInput = z.object({
  identificador: z.string().trim().min(1),
  descricao: z.string().trim().min(10),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarProvisaoInput = z.input<typeof zCadastrarProvisaoInput>;

export const zConstituirProvisaoInput = z.object({
  provisaoId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type ConstituirProvisaoInput = z.input<typeof zConstituirProvisaoInput>;

export const zAtualizarProvisaoInput = z.object({
  provisaoId: z.string().min(1),
  valor: zValorPositivo,
  competencia: z.string().regex(/^\d{4}-\d{2}$/, "Competência no formato YYYY-MM"),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type AtualizarProvisaoInput = z.input<typeof zAtualizarProvisaoInput>;

export const zReverterProvisaoInput = z.object({
  provisaoId: z.string().min(1),
  valor: zValorPositivo,
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type ReverterProvisaoInput = z.input<typeof zReverterProvisaoInput>;

export const zEstornarMovimentoProvisaoInput = z.object({
  movimentoId: z.string().min(1),
  dataMovimento: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoProvisaoInput = z.input<
  typeof zEstornarMovimentoProvisaoInput
>;

function inicioDaCompetencia(competencia: string): Date {
  return janelaCivilDoMes(competencia).inicio;
}

export async function saldoDaProvisaoEm(
  tx: Tx,
  provisaoId: string,
  corte?: Date
): Promise<Money> {
  const movimentos = await tx.movimentoProvisao.findMany({
    where: {
      provisaoId,
      ...(corte !== undefined ? { dataMovimento: { lte: corte } } : {}),
    },
    select: { tipo: true, valor: true },
  });
  return saldoDaProvisao(
    movimentos.map((m) => ({ tipo: m.tipo, valor: toMoney(m.valor.toFixed(2)) }))
  );
}

/** 8º e último posto da ordem de locks. */
async function travarProvisao(tx: Tx, id: string): Promise<void> {
  await travar(tx, "ProvisaoMatematica", [id]);
}

async function exigirProvisao(
  tx: Tx,
  id: string
): Promise<{ readonly id: string; readonly identificador: string }> {
  const p = await tx.provisaoMatematica.findUnique({
    where: { id },
    select: { id: true, identificador: true },
  });
  if (p === null) throw new Error(`Provisão ${id} não existe.`);
  return p;
}

async function exigirRoteiro(
  tx: Tx,
  tipo: TipoMovimentoProvisao
): Promise<{ readonly contaDebitoId: string; readonly contaCreditoId: string }> {
  const r = await tx.roteiroProvisao.findUnique({
    where: { tipo },
    select: { contaDebitoId: true, contaCreditoId: true },
  });
  if (r === null) {
    throw new Error(
      `Não há RoteiroProvisao cadastrado para ${tipo}. As contas do PCASP vêm por ` +
        `PARÂMETRO — nenhuma conta é inventada no código.`
    );
  }
  return r;
}

async function lancar(
  tx: Tx,
  p: {
    readonly tipoDoRoteiro: TipoMovimentoProvisao;
    readonly inverter: boolean;
    readonly identificador: string;
    readonly valor: Money;
    readonly data: Date;
    readonly competencia: Date;
    readonly provisaoId: string;
    readonly criadoPor: string;
    readonly historico: string;
  }
): Promise<string> {
  const r = await exigirRoteiro(tx, p.tipoDoRoteiro);
  const debito = p.inverter ? r.contaCreditoId : r.contaDebitoId;
  const credito = p.inverter ? r.contaDebitoId : r.contaCreditoId;

  const id = randomUUID();
  await lancarNoRazao(tx, {
      id,
      numeroControle: `PRV-${p.identificador}`,
      dataTransacao: p.data,
      historico: p.historico,
      origemTipo: "PROVISAO",
      origemId: p.provisaoId,
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

export async function cadastrarProvisao(
  prisma: PrismaClient,
  input: CadastrarProvisaoInput
): Promise<{ readonly provisaoId: string }> {
  const d = zCadastrarProvisaoInput.parse(input);
  // SEM UG: a provisão (matemática previdenciária, cível) é do ente — o cálculo atuarial é do RPPS
  // inteiro, não de uma secretaria.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.cadastrarProvisao, "ENTE");

  const criada = await prisma.provisaoMatematica.create({
    data: {
      identificador: d.identificador,
      descricao: d.descricao,
      contaContabilId: d.contaContabilId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { provisaoId: criada.id };
}

/** CONSTITUIÇÃO — D VPD / C passivo. O ente reconhece o que vai dever. */
export async function constituirProvisao(
  prisma: PrismaClient,
  input: ConstituirProvisaoInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zConstituirProvisaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.constituirProvisao, "ENTE");

    await travarProvisao(tx, d.provisaoId);
    const p = await exigirProvisao(tx, d.provisaoId);

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: "CONSTITUICAO",
      inverter: false,
      identificador: p.identificador,
      valor: d.valor,
      data: d.dataMovimento,
      competencia: d.dataMovimento,
      provisaoId: d.provisaoId,
      criadoPor: d.criadoPor,
      historico: `Constituição da provisão ${p.identificador}`,
    });

    const criado = await tx.movimentoProvisao.create({
      data: {
        provisaoId: d.provisaoId,
        tipo: "CONSTITUICAO",
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
 * ATUALIZAÇÃO — D VPD / C passivo.
 *
 * IDEMPOTÊNCIA DERIVADA pelo saldo da competência (não índice único, que travaria a
 * competência PARA SEMPRE — inclusive depois de estornada, quando ela precisa poder ser
 * refeita). É o padrão consolidado do repositório.
 */
export async function atualizarProvisao(
  prisma: PrismaClient,
  input: AtualizarProvisaoInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zAtualizarProvisaoInput.parse(input);
  const competencia = inicioDaCompetencia(d.competencia);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atualizarProvisao, "ENTE");

    await travarProvisao(tx, d.provisaoId);
    const p = await exigirProvisao(tx, d.provisaoId);

    const daCompetencia = await tx.movimentoProvisao.findMany({
      where: {
        provisaoId: d.provisaoId,
        competencia,
        tipo: { in: ["ATUALIZACAO", "ESTORNO_ATUALIZACAO"] },
      },
      select: { tipo: true, valor: true },
    });
    const jaAtualizado = saldoDaProvisao(
      daCompetencia.map((m) => ({
        tipo: m.tipo,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    );
    if (!jaAtualizado.isZero()) {
      throw new Error(
        `COMPETÊNCIA ${d.competencia} JÁ ATUALIZADA na provisão ${p.identificador} ` +
          `(líquido ${jaAtualizado.toFixed(2)}). Atualizar duas vezes o mesmo mês é ` +
          `inflar o passivo atuarial com um cálculo que ninguém fez. Estorne a ` +
          `atualização anterior se ela estiver errada.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: "ATUALIZACAO",
      inverter: false,
      identificador: p.identificador,
      valor: d.valor,
      data: d.dataMovimento,
      competencia,
      provisaoId: d.provisaoId,
      criadoPor: d.criadoPor,
      historico: `Atualização da provisão ${p.identificador} (${d.competencia})`,
    });

    const criado = await tx.movimentoProvisao.create({
      data: {
        provisaoId: d.provisaoId,
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
 * REVERSÃO — D passivo / C VPA. **FATO NOVO**, não estorno (ver o cabeçalho).
 *
 * O cálculo atuarial mostrou que o ente deve MENOS. Isso é um GANHO do exercício em que
 * se descobriu — e é por isso que a perna credora é uma VPA, e não a inversão de um
 * lançamento antigo.
 */
export async function reverterProvisao(
  prisma: PrismaClient,
  input: ReverterProvisaoInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zReverterProvisaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reverterProvisao, "ENTE");

    await travarProvisao(tx, d.provisaoId);
    const p = await exigirProvisao(tx, d.provisaoId);

    const saldo = await saldoDaProvisaoEm(tx, d.provisaoId);
    if (d.valor.greaterThan(saldo)) {
      throw new Error(
        `REVERSÃO MAIOR QUE A PROVISÃO ${p.identificador}: reverter ` +
          `${d.valor.toFixed(2)} deixaria o passivo NEGATIVO — ele vale ` +
          `${saldo.toFixed(2)}. O ente não pode "descobrir" que devia menos do que zero.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: "REVERSAO",
      inverter: false,
      identificador: p.identificador,
      valor: d.valor,
      data: d.dataMovimento,
      competencia: d.dataMovimento,
      provisaoId: d.provisaoId,
      criadoPor: d.criadoPor,
      historico: `Reversão da provisão ${p.identificador} (novo cálculo atuarial)`,
    });

    const criado = await tx.movimentoProvisao.create({
      data: {
        provisaoId: d.provisaoId,
        tipo: "REVERSAO",
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

/** ESTORNO — simétrico completo; INVERTE as pernas do roteiro do original. */
export async function estornarMovimentoProvisao(
  prisma: PrismaClient,
  input: EstornarMovimentoProvisaoInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoProvisaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoProvisao, "ENTE");

    const original = await tx.movimentoProvisao.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        provisaoId: true,
        tipo: true,
        valor: true,
        competencia: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de provisão ${d.movimentoId} não existe.`);
    }

    const tipo = TIPO_DO_ESTORNO_PROVISAO[original.tipo];
    if (tipo === null) {
      throw new Error(
        `${original.tipo} JÁ É um estorno — não se estorna um estorno.`
      );
    }

    await travarProvisao(tx, original.provisaoId);
    const p = await exigirProvisao(tx, original.provisaoId);

    if (original.estornos.length > 0) {
      throw new Error(
        `Movimento de provisão ${original.id} JÁ FOI ESTORNADO. Estornar duas vezes ` +
          `desfaria o valor em dobro.`
      );
    }

    const valor = toMoney(original.valor.toFixed(2));
    const saldo = await saldoDaProvisaoEm(tx, original.provisaoId);
    if (SINAL_MOVIMENTO_PROVISAO[tipo] === -1 && valor.greaterThan(saldo)) {
      throw new Error(
        `ESTORNO DEIXARIA A PROVISÃO NEGATIVA (${p.identificador}): desfazer ` +
          `${valor.toFixed(2)} de um passivo de ${saldo.toFixed(2)}.`
      );
    }

    const lancamentoId = await lancar(tx, {
      tipoDoRoteiro: original.tipo,
      inverter: true,
      identificador: p.identificador,
      valor,
      data: d.dataMovimento,
      competencia: original.competencia ?? d.dataMovimento,
      provisaoId: original.provisaoId,
      criadoPor: d.criadoPor,
      historico: `Estorno de ${original.tipo} da provisão ${p.identificador}`,
    });

    const criado = await tx.movimentoProvisao.create({
      data: {
        provisaoId: original.provisaoId,
        tipo,
        valor: valor.toFixed(2),
        // A competência é PRESERVADA: sem ela, a idempotência nunca liberaria a
        // competência estornada.
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

/** A AMARRAÇÃO — Σ dos movimentos × saldo CREDOR da conta no razão (grão = conta). */
export async function conferirProvisaoContraRazao(
  prisma: Tx,
  contaContabilId: string
): Promise<{ readonly pelosMovimentos: Money; readonly peloRazao: Money }> {
  const provisoes = await prisma.provisaoMatematica.findMany({
    where: { contaContabilId },
    select: { id: true },
  });

  let pelosMovimentos = toMoney("0.00");
  for (const p of provisoes) {
    pelosMovimentos = toMoney(
      pelosMovimentos.plus(await saldoDaProvisaoEm(prisma, p.id))
    );
  }

  const partidas = await prisma.partidaContabil.findMany({
    where: { contaId: contaContabilId },
    select: { tipo: true, valor: true },
  });
  // Conta de PASSIVO: CREDORA (ΣC − ΣD).
  let peloRazao = toMoney("0.00");
  for (const p of partidas) {
    const v = toMoney(p.valor.toFixed(2));
    peloRazao =
      p.tipo === "CREDITO" ? toMoney(peloRazao.plus(v)) : toMoney(peloRazao.minus(v));
  }

  if (!pelosMovimentos.equals(peloRazao)) {
    const conta = await prisma.contaPcasp.findUnique({
      where: { id: contaContabilId },
      select: { codigo: true },
    });
    throw new Error(
      `PROVISÃO NÃO FECHA COM O RAZÃO (conta ${conta?.codigo ?? contaContabilId}): os ` +
        `movimentos somam ${pelosMovimentos.toFixed(2)} e o razão tem ` +
        `${peloRazao.toFixed(2)}. Diferença: ` +
        `${peloRazao.minus(pelosMovimentos).toFixed(2)}.`
    );
  }

  return { pelosMovimentos, peloRazao };
}
