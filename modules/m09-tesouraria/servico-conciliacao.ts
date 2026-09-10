import { serializar, toMoney, type Dinheiro } from "../../packages/contracts/index.js";
import {
  diaCivil,
  fimDoDiaCivil,
  inicioDoDiaCivil,
} from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { conciliacaoBancaria, type ConciliacaoBancaria } from "./conciliacao.js";
import {
  estadoDaConciliacao,
  exigirConciliacaoAberta,
  rotuloDoPeriodo,
  zAbrirConciliacao,
  zEncerrarConciliacao,
  zJustificarPendencia,
  zPendenciaManual,
  type AbrirConciliacaoInput,
  type EncerrarConciliacaoInput,
  type EstadoDaConciliacao,
  type JustificarPendenciaInput,
  type PendenciaManualInput,
} from "./conciliacao-periodo.js";

/**
 * A CONCILIAÇÃO POR PERÍODO — os casos de uso.
 *
 * ═══ ⚠️ ELA NÃO SUBSTITUI A ÁLGEBRA; ELA É O RECIPIENTE QUE FALTAVA ═══
 * `conciliacaoBancaria(conta, corte)` continua sendo o motor: ele deriva saldos, enumera
 * os fatos e devolve as pendências, e **lança** quando a identidade não fecha. O que este
 * arquivo acrescenta é o objeto que responde "qual foi a conciliação de junho" — pergunta
 * que a derivação, sozinha, não sabe responder, porque ela só conhece "agora".
 *
 * ═══ ⚠️ "CÓPIA PARA O PERÍODO SEGUINTE" NÃO É CÓPIA ═══
 * A conciliação seguinte REFERENCIA a anterior (`anteriorId`) e lê dela o conjunto não
 * resolvido POR DERIVAÇÃO. Duplicar as linhas criaria dois registros da mesma pendência
 * e **a soma passaria a contar duas vezes** — o oposto do que a conciliação existe para
 * garantir.
 */

export interface PendenciaHerdada {
  readonly lado: string;
  readonly referencia: string;
  readonly descricao: string;
  readonly residual: Dinheiro;
  readonly justificativa: string | null;
}

export interface ConciliacaoDoPeriodo {
  readonly id: string;
  readonly contaBancariaId: string;
  readonly periodoInicio: Date;
  readonly periodoFim: Date;
  readonly rotulo: string;
  readonly estado: EstadoDaConciliacao;
  readonly encerradaPor: string | null;
  readonly encerradaEm: Date | null;
  /** O relatório derivado, cortado no fim do período. */
  readonly relatorio: ConciliacaoBancaria;
  /**
   * ⚠️ O CONJUNTO NÃO RESOLVIDO DA ANTERIOR, POR REFERÊNCIA — nunca duplicado.
   * Vazio quando esta é a primeira conciliação da conta.
   */
  readonly herdadasDaAnterior: readonly PendenciaHerdada[];
  readonly pendenciasManuais: readonly {
    readonly id: string;
    readonly descricao: string;
    readonly motivo: string;
    readonly valor: Dinheiro;
    readonly natureza: "CREDITO" | "DEBITO";
    readonly resolvida: boolean;
  }[];
  readonly justificativas: readonly {
    readonly lado: string;
    readonly referencia: string;
    readonly motivo: string;
  }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// ABRIR
// ═══════════════════════════════════════════════════════════════════════════

export async function abrirConciliacao(
  prisma: PrismaClient,
  input: AbrirConciliacaoInput
): Promise<{ readonly conciliacaoId: string; readonly rotulo: string }> {
  const d = zAbrirConciliacao.parse(input);

  const inicio = inicioDoDiaCivil(d.diaInicio);
  const fim = fimDoDiaCivil(d.diaFim);
  if (fim < inicio) {
    throw new Error(
      `Período invertido: início ${d.diaInicio} depois do fim ${d.diaFim}. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirConciliacao, "ENTE");

    const conta = await tx.contaBancaria.findUnique({
      where: { id: d.contaBancariaId },
      select: { id: true, codigo: true },
    });
    if (conta === null) {
      throw new Error(`Conta bancária ${d.contaBancariaId} não cadastrada.`);
    }

    // ⚠️ A ANTERIOR É A ÚLTIMA JÁ ENCERRADA DESTA CONTA, e ela precisa estar ENCERRADA.
    //
    // Encadear a uma conciliação ainda ABERTA faria o "conjunto não resolvido" mudar
    // debaixo do período seguinte toda vez que alguém conciliasse mais uma linha no
    // anterior — e o relatório de julho mudaria sozinho, sem ninguém tocar em julho.
    const anteriores = await tx.conciliacaoBancaria.findMany({
      where: { contaBancariaId: conta.id, periodoFim: { lt: inicio } },
      orderBy: { periodoFim: "desc" },
      select: {
        id: true,
        periodoInicio: true,
        periodoFim: true,
        seguinte: { select: { id: true } },
        movimentos: { select: { tipo: true, criadoEm: true } },
      },
    });

    const candidata = anteriores[0];
    let anteriorId: string | null = null;
    if (candidata !== undefined) {
      if (estadoDaConciliacao(candidata.movimentos) !== "ENCERRADA") {
        throw new Error(
          `A conciliação anterior desta conta (${rotuloDoPeriodo(candidata.periodoInicio, candidata.periodoFim)}) ` +
            `ainda está ABERTA. Abrir o período seguinte antes de encerrar o anterior faria ` +
            `o conjunto de pendências herdadas mudar sozinho a cada linha conciliada lá ` +
            `atrás. Encerre o anterior primeiro. Nada foi gravado.`
        );
      }
      // ⚠️ E ELA NÃO PODE JÁ TER SUCESSORA. O índice único em `anteriorId` também
      // garante isso no banco — aqui a mensagem é legível.
      if (candidata.seguinte !== null) {
        throw new Error(
          `A conciliação de ${rotuloDoPeriodo(candidata.periodoInicio, candidata.periodoFim)} ` +
            `já tem um período seguinte. Duas sucessoras herdariam o MESMO conjunto não ` +
            `resolvido, e a mesma pendência apareceria em dois períodos ao mesmo tempo.`
        );
      }
      anteriorId = candidata.id;
    }

    // ⚠️ O ÍNDICE ÚNICO É A GARANTIA; ESTE `catch` É A MENSAGEM.
    //
    // Quem impede duas conciliações do mesmo período na mesma conta é o banco — um
    // `findFirst` antes do `create` perderia a corrida entre duas requisições. Mas o erro
    // cru do Prisma ("Unique constraint failed on the fields...") vazava para a TELA, e o
    // operador lia um nome de coluna em vez de saber o que fazer. O smoke do ENT03a
    // mostrou isso na segunda execução, ao repetir o mesmo período.
    try {
      const criada = await tx.conciliacaoBancaria.create({
        data: {
          contaBancariaId: conta.id,
          periodoInicio: inicio,
          periodoFim: fim,
          anteriorId,
          criadoPor: d.criadoPor,
          movimentos: { create: { tipo: "ABRIR", criadoPor: d.criadoPor } },
        },
        select: { id: true },
      });
      return { conciliacaoId: criada.id, rotulo: rotuloDoPeriodo(inicio, fim) };
    } catch (erro) {
      if (
        typeof erro === "object" &&
        erro !== null &&
        (erro as { code?: unknown }).code === "P2002"
      ) {
        throw new Error(
          `A conta ${conta.codigo} já tem uma conciliação começando em ` +
            `${d.diaInicio}. Duas conciliações do mesmo período na mesma conta seriam ` +
            `duas verdades sobre o mesmo fechamento. Abra o período SEGUINTE, ou consulte ` +
            `o que já existe. Nada foi gravado.`
        );
      }
      throw erro;
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ENCERRAR
// ═══════════════════════════════════════════════════════════════════════════

export async function encerrarConciliacao(
  prisma: PrismaClient,
  input: EncerrarConciliacaoInput
): Promise<{ readonly conciliacaoId: string; readonly rotulo: string }> {
  const d = zEncerrarConciliacao.parse(input);

  // ⚠️ A AMARRAÇÃO É COBRADA ANTES, E FORA DA TRANSAÇÃO DE ESCRITA.
  //
  // `conciliacaoBancaria` LANÇA quando a diferença não está toda nomeada. Encerrar um
  // período cuja identidade não fecha carimbaria como fechado um mês em que sobra
  // dinheiro sem explicação — e o encerramento é justamente o que o controle interno lê
  // como "isto foi conferido".
  const antes = await prisma.conciliacaoBancaria.findUnique({
    where: { id: d.conciliacaoId },
    select: { contaBancariaId: true, periodoFim: true },
  });
  if (antes === null) {
    throw new Error(`Conciliação ${d.conciliacaoId} não encontrada.`);
  }
  await conciliacaoBancaria(prisma, antes.contaBancariaId, antes.periodoFim);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarConciliacao, "ENTE");

    const c = await tx.conciliacaoBancaria.findUniqueOrThrow({
      where: { id: d.conciliacaoId },
      select: {
        id: true,
        periodoInicio: true,
        periodoFim: true,
        movimentos: { select: { tipo: true, criadoEm: true } },
      },
    });

    exigirConciliacaoAberta(
      c.movimentos,
      { inicio: c.periodoInicio, fim: c.periodoFim },
      "o encerramento"
    );

    // O índice único parcial no banco é quem fecha a corrida de dois encerramentos
    // simultâneos; este guard é a mensagem legível do caminho sequencial.
    await tx.movimentoDaConciliacao.create({
      data: { conciliacaoId: c.id, tipo: "ENCERRAR", criadoPor: d.criadoPor },
    });

    return {
      conciliacaoId: c.id,
      rotulo: rotuloDoPeriodo(c.periodoInicio, c.periodoFim),
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// PENDÊNCIA MANUAL — decisão registrada, NÃO fato
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ELA NÃO CRIA LANÇAMENTO, e a ausência é a regra.
 *
 * Uma pendência que gerasse lançamento seria um fato contábil nascido de uma anotação de
 * tela — e o razão passaria a conter o que ninguém empenhou, liquidou ou pagou. Ela
 * aponta o MOTIVO e entra no relatório de pendências; **não** entra na amarração da
 * conciliação, que é uma identidade entre razão e extrato, e a pendência manual não está
 * em nenhum dos dois.
 */
export async function registrarPendenciaManual(
  prisma: PrismaClient,
  input: PendenciaManualInput
): Promise<{ readonly pendenciaId: string }> {
  const d = zPendenciaManual.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarPendenciaManual, "ENTE");

    const c = await tx.conciliacaoBancaria.findUnique({
      where: { id: d.conciliacaoId },
      select: {
        periodoInicio: true,
        periodoFim: true,
        movimentos: { select: { tipo: true, criadoEm: true } },
      },
    });
    if (c === null) {
      throw new Error(`Conciliação ${d.conciliacaoId} não encontrada.`);
    }
    exigirConciliacaoAberta(
      c.movimentos,
      { inicio: c.periodoInicio, fim: c.periodoFim },
      "a inclusão de pendência"
    );

    const p = await tx.pendenciaManualDeConciliacao.create({
      data: {
        conciliacaoId: d.conciliacaoId,
        descricao: d.descricao,
        motivo: d.motivo,
        valor: d.valor.toFixed(2),
        natureza: d.natureza,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { pendenciaId: p.id };
  });
}

/**
 * A JUSTIFICATIVA DE UMA PENDÊNCIA DERIVADA — por que ela atravessou o fechamento.
 *
 * A pendência em si é derivada (o residual). O que não se deriva é a EXPLICAÇÃO —
 * "cheque não compensado", "depósito em trânsito" — e é ela que o controle interno lê.
 */
export async function justificarPendencia(
  prisma: PrismaClient,
  input: JustificarPendenciaInput
): Promise<{ readonly justificativaId: string }> {
  const d = zJustificarPendencia.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.justificarPendencia, "ENTE");

    const c = await tx.conciliacaoBancaria.findUnique({
      where: { id: d.conciliacaoId },
      select: {
        periodoInicio: true,
        periodoFim: true,
        movimentos: { select: { tipo: true, criadoEm: true } },
      },
    });
    if (c === null) {
      throw new Error(`Conciliação ${d.conciliacaoId} não encontrada.`);
    }
    exigirConciliacaoAberta(
      c.movimentos,
      { inicio: c.periodoInicio, fim: c.periodoFim },
      "a justificativa de pendência"
    );

    // ⚠️ `upsert` E NÃO `create`: o índice único é (conciliação, lado, referência) — uma
    // justificativa vigente por pendência. Corrigir o texto é substituir a linha, e o
    // `criadoEm` guarda quando foi. Um `create` cru estouraria no segundo salvamento da
    // mesma tela, que é o gesto mais normal do mundo.
    const j = await tx.justificativaDePendencia.upsert({
      where: {
        conciliacaoId_lado_referencia: {
          conciliacaoId: d.conciliacaoId,
          lado: d.lado,
          referencia: d.referencia,
        },
      },
      create: {
        conciliacaoId: d.conciliacaoId,
        lado: d.lado,
        referencia: d.referencia,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      update: { motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { justificativaId: j.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LER — o objeto do período, com o herdado POR REFERÊNCIA
// ═══════════════════════════════════════════════════════════════════════════

export async function lerConciliacao(
  prisma: PrismaClient,
  conciliacaoId: string
): Promise<ConciliacaoDoPeriodo> {
  const c = await prisma.conciliacaoBancaria.findUnique({
    where: { id: conciliacaoId },
    select: {
      id: true,
      contaBancariaId: true,
      periodoInicio: true,
      periodoFim: true,
      anteriorId: true,
      movimentos: { select: { tipo: true, criadoEm: true, criadoPor: true } },
      pendenciasManuais: {
        select: {
          id: true,
          descricao: true,
          motivo: true,
          valor: true,
          natureza: true,
          resolucao: { select: { id: true } },
        },
        orderBy: { criadoEm: "asc" },
      },
      justificativas: {
        select: { lado: true, referencia: true, motivo: true },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (c === null) {
    throw new Error(`Conciliação ${conciliacaoId} não encontrada.`);
  }

  const relatorio = await conciliacaoBancaria(
    prisma,
    c.contaBancariaId,
    c.periodoFim
  );

  const encerramento = c.movimentos.find((m) => m.tipo === "ENCERRAR");

  return {
    id: c.id,
    contaBancariaId: c.contaBancariaId,
    periodoInicio: c.periodoInicio,
    periodoFim: c.periodoFim,
    rotulo: rotuloDoPeriodo(c.periodoInicio, c.periodoFim),
    estado: estadoDaConciliacao(c.movimentos),
    encerradaPor: encerramento?.criadoPor ?? null,
    encerradaEm: encerramento?.criadoEm ?? null,
    relatorio,
    herdadasDaAnterior:
      c.anteriorId === null ? [] : await naoResolvidasDe(prisma, c.anteriorId),
    pendenciasManuais: c.pendenciasManuais.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      motivo: p.motivo,
      valor: serializar(toMoney(p.valor.toFixed(2))),
      natureza: p.natureza,
      resolvida: p.resolucao !== null,
    })),
    justificativas: c.justificativas,
  };
}

/**
 * O CONJUNTO NÃO RESOLVIDO DE UMA CONCILIAÇÃO — lido POR DERIVAÇÃO, nunca copiado.
 *
 * ⚠️ ELE É CALCULADO NO CORTE DA CONCILIAÇÃO DE ORIGEM, e não no de hoje. É a foto do que
 * estava em aberto quando aquele período fechou — que é o que "as pendências não baixadas
 * da anterior" significa. Calcular no corte de hoje traria linhas que nasceram DEPOIS do
 * fechamento e as apresentaria como herança, o que seria falso.
 */
async function naoResolvidasDe(
  prisma: PrismaClient,
  conciliacaoId: string
): Promise<readonly PendenciaHerdada[]> {
  const c = await prisma.conciliacaoBancaria.findUniqueOrThrow({
    where: { id: conciliacaoId },
    select: {
      contaBancariaId: true,
      periodoFim: true,
      justificativas: { select: { lado: true, referencia: true, motivo: true } },
    },
  });

  const rel = await conciliacaoBancaria(prisma, c.contaBancariaId, c.periodoFim);
  const motivoDe = (lado: string, ref: string): string | null =>
    c.justificativas.find((j) => j.lado === lado && j.referencia === ref)?.motivo ?? null;

  return [
    ...rel.noExtratoSemVinculo.map((l) => ({
      lado: "EXTRATO",
      referencia: l.id,
      descricao: `${diaCivil(l.data)} — ${l.descricao}`,
      residual: l.residual,
      justificativa: motivoDe("EXTRATO", l.id),
    })),
    ...rel.internoSemVinculo.map((l) => ({
      lado: l.tipoInterno as string,
      referencia: l.id,
      descricao: `${diaCivil(l.data)} — ${l.descricao}`,
      residual: l.residual,
      justificativa: motivoDe(l.tipoInterno as string, l.id),
    })),
  ];
}

/** As conciliações de uma conta, da mais recente para a mais antiga — TR 5.10.2.49. */
export async function conciliacoesDaConta(
  prisma: PrismaClient,
  contaBancariaId: string
): Promise<
  readonly {
    readonly id: string;
    readonly rotulo: string;
    readonly estado: EstadoDaConciliacao;
    readonly encerradaPor: string | null;
  }[]
> {
  const linhas = await prisma.conciliacaoBancaria.findMany({
    where: { contaBancariaId },
    orderBy: { periodoInicio: "desc" },
    select: {
      id: true,
      periodoInicio: true,
      periodoFim: true,
      movimentos: { select: { tipo: true, criadoEm: true, criadoPor: true } },
    },
  });
  return linhas.map((c) => ({
    id: c.id,
    rotulo: rotuloDoPeriodo(c.periodoInicio, c.periodoFim),
    estado: estadoDaConciliacao(c.movimentos),
    encerradaPor: c.movimentos.find((m) => m.tipo === "ENCERRAR")?.criadoPor ?? null,
  }));
}
