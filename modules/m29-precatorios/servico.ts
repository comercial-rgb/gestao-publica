import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { inicioDoDiaCivil, janelaCivilDoMes } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  quebraDeOrdemAoPagar,
  saldoDoPrecatorio,
  textoDaQuebra,
  TIPO_DO_ESTORNO_PRECATORIO,
  zCadastrarPrecatorioInput,
  zEstornarMovimentoPrecatorioInput,
  zMovimentoPrecatorioInput,
  type CadastrarPrecatorioInput,
  type EstornarMovimentoPrecatorioInput,
  type MovimentoPrecatorioInput,
  type NaturezaDoPrecatorio,
  type PreferenciaDoPrecatorio,
  type PrecatorioNaFila,
  type TipoMovimentoPrecatorio,
} from "./dominio.js";

/**
 * M29 — PRECATÓRIOS: os casos de uso.
 *
 * ═══ ONDE CADA LANÇAMENTO É FEITO ═══
 * A INSCRIÇÃO e a ATUALIZAÇÃO reconhecem/corrigem o passivo e têm lançamento PRÓPRIO
 * (`RoteiroPrecatorio`). O PAGAMENTO nasce dentro do `pagar()` do M05, na mesma transação —
 * é despesa orçamentária, e o M05 já a contabiliza. Um roteiro de pagamento aqui debitaria o
 * passivo duas vezes.
 *
 * ⚠️ O CANCELAMENTO tem lançamento próprio: extinguir o passivo por decisão judicial é baixa
 * SEM saída de caixa, e ninguém mais a contabiliza.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function travarPrecatorio(tx: Tx, id: string): Promise<void> {
  await travar(tx, "Precatorio", [id]);
}

async function exigirPrecatorio(
  tx: Tx,
  id: string
): Promise<{
  readonly id: string;
  readonly numeroProcesso: string;
  readonly valorOriginal: Money;
  readonly saldo: Money;
  readonly movimentos: readonly { readonly tipo: TipoMovimentoPrecatorio; readonly valor: Money }[];
}> {
  const p = await tx.precatorio.findUnique({
    where: { id },
    select: {
      id: true,
      numeroProcesso: true,
      valorOriginal: true,
      movimentos: { select: { tipo: true, valor: true } },
    },
  });
  if (p === null) throw new Error(`Precatório ${id} não encontrado. Nada foi gravado.`);
  const movimentos = p.movimentos.map((m) => ({
    tipo: m.tipo as TipoMovimentoPrecatorio,
    valor: toMoney(m.valor.toFixed(2)),
  }));
  return {
    id: p.id,
    numeroProcesso: p.numeroProcesso,
    valorOriginal: toMoney(p.valorOriginal.toFixed(2)),
    saldo: saldoDoPrecatorio(movimentos),
    movimentos,
  };
}

export async function cadastrarPrecatorio(
  prisma: PrismaClient,
  input: CadastrarPrecatorioInput
): Promise<{ readonly precatorioId: string }> {
  const d = zCadastrarPrecatorioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarPrecatorio, "ENTE");
    const criado = await tx.precatorio.create({
      data: {
        numeroProcesso: d.numeroProcesso,
        tribunal: d.tribunal,
        ...(d.oficioRequisitorio !== undefined
          ? { oficioRequisitorio: d.oficioRequisitorio }
          : {}),
        beneficiarioNome: d.beneficiarioNome,
        beneficiarioDocumento: d.beneficiarioDocumento,
        natureza: d.natureza,
        preferencia: d.preferencia,
        // ⚠️ MEIO-DIA CIVIL. A apresentação é um DIA (o protocolo no tribunal), e o meio-dia
        // é a hora que nunca troca de dia civil por três horas de fuso nem se perde na virada
        // do horário de verão. Comparar por dia civil já resolveria, mas gravar meia-noite
        // deixaria o instante ambíguo para quem lesse a coluna por fora.
        dataApresentacao: inicioDoDiaCivil(d.diaApresentacao),
        exercicioDePagamento: d.exercicioDePagamento,
        valorOriginal: d.valorOriginal.toFixed(2),
        contaContabilId: d.contaContabilId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { precatorioId: criado.id };
  });
}

/** INSCREVER — o reconhecimento do passivo. Tem lançamento próprio. */
export async function inscreverPrecatorio(
  prisma: PrismaClient,
  input: MovimentoPrecatorioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return comLancamento(prisma, input, "INSCRICAO", ACAO_DO_SERVICO.inscreverPrecatorio, (p, d) => {
    if (p.movimentos.some((m) => m.tipo === "INSCRICAO")) {
      throw new Error(
        `O precatório ${p.numeroProcesso} JÁ FOI INSCRITO. Inscrevê-lo de novo dobraria o ` +
          `passivo, e o ente passaria a deveria ao mesmo beneficiário duas vezes o que o ` +
          `tribunal requisitou. Nada foi gravado.`
      );
    }
    if (!d.valor.eq(p.valorOriginal)) {
      throw new Error(
        `A INSCRIÇÃO DIVERGE DO REQUISITADO no precatório ${p.numeroProcesso}: inscrição de ` +
          `${d.valor.toFixed(2)}, requisitório de ${p.valorOriginal.toFixed(2)}. O passivo ` +
          `reconhecido é o que o tribunal requisitou; correção posterior é ATUALIZAÇÃO, que ` +
          `é outro fato com outra data. Nada foi gravado.`
      );
    }
  });
}

/**
 * ATUALIZAR — juros e correção do período.
 *
 * ⚠️ A COMPETÊNCIA É OBRIGATÓRIA E DÁ A IDEMPOTÊNCIA. Duas atualizações do mesmo mês seriam a
 * mesma correção duas vezes — e o precatório passaria a valer mais do que a lei manda corrigir.
 * Mesmo desenho da atualização monetária da dívida (M10).
 */
export async function registrarAtualizacaoDePrecatorio(
  prisma: PrismaClient,
  input: MovimentoPrecatorioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return comLancamento(prisma, input, "ATUALIZACAO", ACAO_DO_SERVICO.registrarAtualizacaoDePrecatorio, (p, d) => {
    if (d.competencia === undefined) {
      throw new Error(
        `ATUALIZAÇÃO SEM COMPETÊNCIA no precatório ${p.numeroProcesso}. A competência é o que ` +
          `torna a correção idempotente: sem ela, corrigir duas vezes o mesmo mês infla o ` +
          `passivo com juros que decisão nenhuma determinou. Nada foi gravado.`
      );
    }
    if (p.saldo.lte(0)) {
      throw new Error(
        `O precatório ${p.numeroProcesso} NÃO TEM SALDO DEVIDO (${p.saldo.toFixed(2)}). ` +
          `Corrigir o que já está quitado ressuscitaria a dívida e o poria de volta na fila ` +
          `constitucional à frente de quem ainda espera. Nada foi gravado.`
      );
    }
  });
}

/** CANCELAR — extinção por decisão judicial. Baixa SEM saída de caixa. */
export async function cancelarPrecatorio(
  prisma: PrismaClient,
  input: MovimentoPrecatorioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return comLancamento(prisma, input, "CANCELAMENTO", ACAO_DO_SERVICO.cancelarPrecatorio, (p, d) => {
    if (d.valor.gt(p.saldo)) {
      throw new Error(
        `CANCELAMENTO ACIMA DO DEVIDO no precatório ${p.numeroProcesso}: pedido ` +
          `${d.valor.toFixed(2)}, devido ${p.saldo.toFixed(2)}. Cancelar mais do que se deve ` +
          `inverteria o passivo — o ente passaria a ter crédito contra o beneficiário. Nada ` +
          `foi gravado.`
      );
    }
  });
}

async function comLancamento(
  prisma: PrismaClient,
  input: MovimentoPrecatorioInput,
  tipo: Extract<TipoMovimentoPrecatorio, "INSCRICAO" | "ATUALIZACAO" | "CANCELAMENTO">,
  /** ⚠️ A AÇÃO VEM DO SERVIÇO PÚBLICO — ver a nota do mesmo helper no M28. */
  acao: AcaoDoSistema,
  guarda: (
    p: Awaited<ReturnType<typeof exigirPrecatorio>>,
    d: ReturnType<typeof zMovimentoPrecatorioInput.parse>
  ) => void
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zMovimentoPrecatorioInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, acao, "ENTE");
    await travarPrecatorio(tx, d.precatorioId);
    const p = await exigirPrecatorio(tx, d.precatorioId);

    const dataFato = inicioDoDiaCivil(d.diaMovimento);
    await exigirCompetenciaEmExercicioAberto(tx, dataFato, `${tipo} de precatório`);

    if (tipo === "ATUALIZACAO" && d.competencia !== undefined) {
      // IDEMPOTÊNCIA pela competência: o líquido do mês (originais − estornos) tem de ser 0.
      const competencia = janelaCivilDoMes(d.competencia).inicio;
      const doMes = await tx.movimentoPrecatorio.findMany({
        where: {
          precatorioId: d.precatorioId,
          competencia,
          tipo: { in: ["ATUALIZACAO", "ESTORNO_ATUALIZACAO"] },
        },
        select: { tipo: true, valor: true },
      });
      const liquido = saldoDoPrecatorio(
        doMes.map((m) => ({
          tipo: m.tipo as TipoMovimentoPrecatorio,
          valor: toMoney(m.valor.toFixed(2)),
        }))
      );
      if (!liquido.isZero()) {
        throw new Error(
          `COMPETÊNCIA ${d.competencia} JÁ ATUALIZADA no precatório ${p.numeroProcesso} ` +
            `(líquido ${liquido.toFixed(2)}). Estorne a atualização anterior se ela estiver ` +
            `errada. Nada foi gravado.`
        );
      }
    }

    guarda(p, d);

    const roteiro = await tx.roteiroPrecatorio.findUnique({
      where: { tipo },
      select: {
        contaDebito: { select: { id: true } },
        contaCredito: { select: { id: true } },
        historicoPadrao: true,
      },
    });
    if (roteiro === null) {
      throw new Error(
        `Não há RoteiroPrecatorio cadastrado para ${tipo}. As contas do PCASP vêm por ` +
          `PARÂMETRO — nenhuma conta é inventada no código. Cadastre o roteiro. Nada foi gravado.`
      );
    }

    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `PREC-${p.numeroProcesso}-${tipo}-${d.diaMovimento}`,
      dataTransacao: dataFato,
      historico: `${roteiro.historicoPadrao} — precatório ${p.numeroProcesso}`,
      origemTipo: `PRECATORIO_${tipo}`,
      origemId: p.id,
      criadoPor: d.criadoPor,
      partidas: [
        {
          contaId: roteiro.contaDebito.id,
          tipo: "DEBITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
        {
          contaId: roteiro.contaCredito.id,
          tipo: "CREDITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
      ],
    });

    const criado = await tx.movimentoPrecatorio.create({
      data: {
        precatorioId: d.precatorioId,
        tipo,
        valor: d.valor.toFixed(2),
        ...(d.competencia !== undefined
          ? { competencia: janelaCivilDoMes(d.competencia).inicio }
          : {}),
        dataMovimento: dataFato,
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
 * A FILA DO ART. 100, do banco — a mesma que o guard usa.
 *
 * ⚠️ ELA LÊ TODOS OS PRECATÓRIOS DO EXERCÍCIO e o filtro de "ainda devendo" acontece na
 * ALGEBRA (`quebraDeOrdemAoPagar`), não no SQL. O saldo é Σ dos movimentos: filtrá-lo no SQL
 * exigiria uma coluna de saldo — a segunda verdade que este módulo recusa.
 */
export async function filaDePrecatorios(
  tx: Tx,
  exercicio: number
): Promise<readonly PrecatorioNaFila[]> {
  const linhas = await tx.precatorio.findMany({
    where: { exercicioDePagamento: exercicio },
    select: {
      id: true,
      numeroProcesso: true,
      natureza: true,
      preferencia: true,
      dataApresentacao: true,
      movimentos: { select: { tipo: true, valor: true } },
    },
  });
  return linhas.map((p) => ({
    id: p.id,
    numeroProcesso: p.numeroProcesso,
    natureza: p.natureza as NaturezaDoPrecatorio,
    preferencia: p.preferencia as PreferenciaDoPrecatorio,
    dataApresentacao: p.dataApresentacao,
    saldoDevido: saldoDoPrecatorio(
      p.movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoPrecatorio,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    ),
  }));
}

/**
 * O GUARD DA ORDEM CONSTITUCIONAL — chamado de DENTRO do `pagar()` do M05, na transação dele.
 *
 * ⚠️ ELE NÃO É UM SERVIÇO PÚBLICO, e por isso não cobra ação do censo: quem cobra é o
 * `pagar()`. Pagar precatório por fora do pagamento seria baixar o passivo sem o dinheiro
 * sair — e é justamente o que o M05 impede.
 *
 * ⚠️ A TRANSAÇÃO É A DO PAGAMENTO: se a ordem está furada e não há justificativa, o PAGAMENTO
 * INTEIRO aborta. Não existe "pagou mas furou a fila".
 */
export async function exigirOrdemDoArt100(
  tx: Tx,
  p: {
    readonly precatorioId: string;
    readonly exercicio: number;
    readonly justificativaOrdemConstitucional?: string | undefined;
  }
): Promise<{ readonly houveQuebra: boolean }> {
  const fila = await filaDePrecatorios(tx, p.exercicio);
  const quebra = quebraDeOrdemAoPagar(fila, p.precatorioId);
  if (quebra === null) return { houveQuebra: false };

  const justificativa = (p.justificativaOrdemConstitucional ?? "").trim();
  if (justificativa.length < 20) {
    throw new Error(
      textoDaQuebra(quebra) +
        (justificativa.length === 0
          ? ""
          : `\n\nA justificativa informada tem ${justificativa.length} caracteres — o mínimo ` +
            `é 20. "Ordem do secretário" não é justificativa: o que se registra é o ` +
            `FUNDAMENTO (o acordo homologado, o ofício do tribunal).`)
    );
  }
  return { houveQuebra: true };
}

export async function estornarMovimentoPrecatorio(
  prisma: PrismaClient,
  input: EstornarMovimentoPrecatorioInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoPrecatorioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoPrecatorio, "ENTE");

    const original = await tx.movimentoPrecatorio.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        precatorioId: true,
        tipo: true,
        valor: true,
        competencia: true,
        pagamentoId: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de precatório ${d.movimentoId} não encontrado. Nada foi gravado.`);
    }
    await travarPrecatorio(tx, original.precatorioId);

    // ⚠️ QUEM NASCEU JUNTO, MORRE JUNTO. Um movimento com `pagamentoId` nasceu dentro do
    // `pagar()`; estorná-lo por fora deixaria o pagamento existindo sem a baixa do passivo —
    // o precatório voltaria à fila com o dinheiro já fora do caixa. É a lição da retenção
    // (M07) e da amortização da dívida (M10).
    if (original.pagamentoId !== null) {
      throw new Error(
        `Este movimento nasceu DENTRO de um pagamento. Estorná-lo isoladamente deixaria o ` +
          `dinheiro fora do caixa e o passivo de volta na fila constitucional. ANULE O ` +
          `PAGAMENTO — a anulação desfaz os dois na mesma transação. Nada foi gravado.`
      );
    }

    const tipoDoEstorno = TIPO_DO_ESTORNO_PRECATORIO[original.tipo as TipoMovimentoPrecatorio];
    if (tipoDoEstorno === null) {
      throw new Error(
        `O movimento ${d.movimentoId} JÁ É UM ESTORNO (${original.tipo}). Nada foi gravado.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(
        `O movimento ${d.movimentoId} JÁ FOI ESTORNADO. Nada foi gravado.`
      );
    }

    const criado = await tx.movimentoPrecatorio.create({
      data: {
        precatorioId: original.precatorioId,
        tipo: tipoDoEstorno,
        valor: original.valor,
        ...(original.competencia !== null ? { competencia: original.competencia } : {}),
        dataMovimento: inicioDoDiaCivil(d.diaMovimento),
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * A BAIXA DO PRECATÓRIO NASCE DENTRO DO `pagar()` (M05) — esta função é chamada de LÁ, com a
 * transação do pagamento. Não é serviço público: baixar por fora seria extinguir o passivo
 * sem o dinheiro ter saído.
 *
 * ⚠️ PELO BRUTO. O pagamento pode ter retenção (M07), e o caixa sai LÍQUIDO — mas a OBRIGAÇÃO
 * morre inteira: o retido não foi perdoado pelo beneficiário, ele mudou de dono. Baixar pelo
 * líquido deixaria o precatório eternamente aberto na parte retida — e, pior, o manteria na
 * fila constitucional à frente de quem ainda espera.
 *
 * ⚠️ A TRANSAÇÃO É A DO PAGAMENTO: se o precatório não cobre o valor, o PAGAMENTO INTEIRO
 * aborta. Não existe "pagou mas não baixou".
 */
export async function baixarPrecatorioNoPagamento(
  tx: Tx,
  p: {
    readonly precatorioId: string;
    readonly pagamentoId: string;
    readonly valorBruto: Money;
    readonly data: Date;
    readonly numeroPagamento: string;
    readonly criadoPor: string;
    readonly justificativaQuebraDeOrdem?: string | undefined;
  }
): Promise<{ readonly movimentoId: string }> {
  await travarPrecatorio(tx, p.precatorioId);
  const prec = await exigirPrecatorio(tx, p.precatorioId);

  if (p.valorBruto.gt(prec.saldo)) {
    throw new Error(
      `PAGAMENTO ACIMA DO DEVIDO no precatório ${prec.numeroProcesso}: pagamento ` +
        `${p.valorBruto.toFixed(2)} (BRUTO), devido ${prec.saldo.toFixed(2)}. A baixa é pelo ` +
        `bruto porque a retenção não perdoa parte do precatório — ela muda o credor daquele ` +
        `pedaço. O PAGAMENTO INTEIRO foi abortado: não existe "pagou mas não baixou".`
    );
  }

  const criado = await tx.movimentoPrecatorio.create({
    data: {
      precatorioId: p.precatorioId,
      tipo: "PAGAMENTO",
      valor: p.valorBruto.toFixed(2),
      dataMovimento: p.data,
      pagamentoId: p.pagamentoId,
      ...(p.justificativaQuebraDeOrdem !== undefined
        ? { justificativaQuebraDeOrdem: p.justificativaQuebraDeOrdem }
        : {}),
      motivo: `Baixa pelo pagamento ${p.numeroPagamento}`,
      criadoPor: p.criadoPor,
    },
    select: { id: true },
  });
  return { movimentoId: criado.id };
}
