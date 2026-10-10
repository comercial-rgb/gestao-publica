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
  /**
   * V39-R2 (R2-001) — de onde vêm os saldos e as pendências do `relatorio`:
   *   · FOTO_DO_ENCERRAMENTO: a composição gravada no encerramento (a conferência como foi feita, reproduzível);
   *   · RECALCULADO: período aberto, ou encerrado antes da foto existir (V39-R2) — a leitura de hoje.
   */
  readonly fonteDoRelatorio: "FOTO_DO_ENCERRAMENTO" | "RECALCULADO";
  /** Encerrada com foto: o que a leitura de HOJE tem com data no período e a foto não tinha (fato tardio). */
  readonly fatosTardios: readonly PendenciaDaFoto[];
  /** Encerrada com foto: pendência da foto que hoje não aparece mais (resolvida por algo confirmado depois). */
  readonly resolvidosDepois: readonly PendenciaDaFoto[];
  /**
   * Aberta, com anterior: a pendência deste período datada ANTES do início dele que não estava na herança da anterior
   * — um fato registrado depois do encerramento da anterior, com o período afetado.
   */
  readonly retroativas: readonly { readonly lado: string; readonly referencia: string; readonly periodoAfetado: string }[];
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
  input: EncerrarConciliacaoInput,
  /**
   * SÓ PARA TESTE (R2-002): chamado dentro da transação, depois das primeiras leituras (o retrato REPEATABLE READ já
   * tomado) e ANTES da conferência. É por ele que o teste de concorrência segura o encerramento num ponto determinado
   * enquanto a outra conexão grava: só o isolamento mantém o que ela grava fora da conferência e da foto.
   */
  ganchos: { readonly depoisDoRetrato?: () => Promise<void> } = {}
): Promise<{ readonly conciliacaoId: string; readonly rotulo: string }> {
  const d = zEncerrarConciliacao.parse(input);

  // ⚠️ V39-R2 (R2-001/002) — TUDO NUMA TRANSAÇÃO REPEATABLE READ, E A COMPOSIÇÃO FICA GRAVADA.
  //
  // Até a V39 o relatório era calculado FORA da transação de escrita e as justificativas DENTRO: dois retratos do
  // banco. E nada da conferência ficava gravado — a leitura do encerrado recalculava, e um fato registrado depois
  // (com data no período) mudava o que tinha sido conferido. Agora a conferência, a cobrança das justificativas e a
  // gravação do encerramento e da FOTO acontecem num retrato só (REPEATABLE READ: toda leitura da transação vê o
  // mesmo instante). O que outra conexão confirmar depois desse retrato não entra na foto e aparece, na leitura, como
  // fato tardio — com o período afetado. O índice único parcial do ENCERRAR continua fechando o encerramento duplo.
  return prisma.$transaction(
    async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarConciliacao, "ENTE");

      const c = await tx.conciliacaoBancaria.findUnique({
        where: { id: d.conciliacaoId },
        select: {
          id: true,
          contaBancariaId: true,
          periodoInicio: true,
          periodoFim: true,
          movimentos: { select: { tipo: true, criadoEm: true } },
          justificativas: { select: { lado: true, referencia: true, motivo: true } },
        },
      });
      if (c === null) throw new Error(`Conciliação ${d.conciliacaoId} não encontrada.`);

      exigirConciliacaoAberta(c.movimentos, { inicio: c.periodoInicio, fim: c.periodoFim }, "o encerramento");
      await ganchos.depoisDoRetrato?.();

      // ⚠️ V39-008 — NÃO SE ENCERRA O PERÍODO QUE AINDA NÃO TERMINOU (medido na V38: a FIC-PM-500 foi encerrada às 21h
      // do próprio último dia).
      const agora = new Date();
      if (c.periodoFim.getTime() > agora.getTime()) {
        throw new Error(
          `O período termina em ${diaCivil(c.periodoFim).split("-").reverse().join("/")} e ainda não acabou. ` +
            `Encerrar agora deixaria o fechamento mudar com o que ainda for registrado nesse dia. ` +
            `Encerre depois do fim do período. Nada foi gravado.`
        );
      }

      // A amarração: `conciliacaoBancaria` LANÇA quando a diferença não está toda nomeada (a recusa proibida). Os
      // vínculos contam até agora — a conciliação se faz depois do fim do período (auditoria da V39).
      const relatorio = await conciliacaoBancaria(tx as unknown as PrismaClient, c.contaBancariaId, c.periodoFim, {
        conhecimento: conhecimentoDaConciliacao(c.periodoFim, null, agora),
      });

      // ⚠️ V39-008 — a pendência que atravessa o fechamento leva o motivo (a recusa é do serviço, não do roteiro).
      const pendentes = semJustificativa(relatorio, c.justificativas);
      if (pendentes.length > 0) {
        throw new Error(
          `Encerrar leva as pendências ao período seguinte, e cada uma leva o motivo. ` +
            `${String(pendentes.length)} pendência(s) sem justificativa: ${pendentes.slice(0, 5).join("; ")}` +
            `${pendentes.length > 5 ? `; e mais ${String(pendentes.length - 5)}` : ""}. ` +
            `Vincule ou justifique cada uma e encerre de novo. Nada foi gravado.`
        );
      }

      await tx.movimentoDaConciliacao.create({
        data: { conciliacaoId: c.id, tipo: "ENCERRAR", criadoPor: d.criadoPor },
      });
      await tx.fotoDoEncerramentoDaConciliacao.create({
        data: {
          conciliacaoId: c.id,
          saldoExtrato: relatorio.saldoExtrato,
          saldoContabil: relatorio.saldoContabil,
          diferenca: relatorio.diferenca,
          pendencias: composicaoDaFoto(relatorio, c.justificativas) as unknown as object,
          criadoPor: d.criadoPor,
        },
      });

      return { conciliacaoId: c.id, rotulo: rotuloDoPeriodo(c.periodoInicio, c.periodoFim) };
    },
    { isolationLevel: "RepeatableRead", timeout: 120_000 }
  );
}

/** Uma pendência como a foto a guarda: identificada (lado, referência), datada, com valor e motivo. */
export interface PendenciaDaFoto {
  readonly lado: string;
  readonly referencia: string;
  readonly data: string;
  readonly descricao: string;
  readonly residual: string;
  readonly justificativa: string | null;
}

/** Puro: a composição conferida — cada pendência dos dois lados, com a justificativa vigente. */
export function composicaoDaFoto(
  relatorio: Pick<ConciliacaoBancaria, "noExtratoSemVinculo" | "internoSemVinculo">,
  justificativas: readonly { readonly lado: string; readonly referencia: string; readonly motivo: string }[]
): readonly PendenciaDaFoto[] {
  const motivo = (lado: string, ref: string): string | null => justificativas.find((j) => j.lado === lado && j.referencia === ref)?.motivo ?? null;
  return [
    ...relatorio.noExtratoSemVinculo.map((l) => ({ lado: "EXTRATO", referencia: l.id, data: l.data.toISOString(), descricao: l.descricao, residual: String(l.residual), justificativa: motivo("EXTRATO", l.id) })),
    ...relatorio.internoSemVinculo.map((l) => ({ lado: String(l.tipoInterno), referencia: l.id, data: l.data.toISOString(), descricao: l.descricao, residual: String(l.residual), justificativa: motivo(String(l.tipoInterno), l.id) })),
  ];
}

/**
 * Puro (R2-001): o que a leitura de HOJE tem e a foto não tinha — e vice-versa. "Tardio" é o fato com data no período
 * que entrou depois do encerramento (ou numa transação confirmada depois do retrato); "resolvido depois" é a pendência
 * da foto que hoje não aparece mais (um vínculo confirmado depois). As duas listas se mostram À PARTE da foto.
 */
export function diferencaDaFoto(
  foto: readonly PendenciaDaFoto[],
  hoje: readonly PendenciaDaFoto[]
): { readonly tardios: readonly PendenciaDaFoto[]; readonly resolvidosDepois: readonly PendenciaDaFoto[] } {
  const chave = (x: PendenciaDaFoto): string => `${x.lado}:${x.referencia}:${x.residual}`;
  const naFoto = new Set(foto.map(chave));
  const agora = new Set(hoje.map(chave));
  return { tardios: hoje.filter((x) => !naFoto.has(chave(x))), resolvidosDepois: foto.filter((x) => !agora.has(chave(x))) };
}

/**
 * V39 (auditoria) — A DATA DO CONHECIMENTO DE UMA CONCILIAÇÃO POR PERÍODO: até quando os vínculos contam.
 *   · ENCERRADA: o instante do encerramento — ela se lê como estava quando foi conferida; vínculo feito depois não a
 *     muda. Se foi encerrada antes do próprio fim (o caso da V38, antes da regra que o impede), vale o fim do período,
 *     porque o motor não aceita conhecimento anterior ao corte.
 *   · ABERTA: agora (ou o fim do período, se ele ainda não chegou) — é quando a conciliação está sendo feita.
 * Até a V38 as duas usavam o fim do período, e como o encerramento passou a exigir o período terminado, nenhum vínculo
 * feito na hora de conciliar contaria (achado da auditoria da V39).
 */
export function conhecimentoDaConciliacao(periodoFim: Date, encerradaEm: Date | null, agora: Date): Date {
  const referencia = encerradaEm ?? agora;
  return referencia.getTime() > periodoFim.getTime() ? referencia : periodoFim;
}

/**
 * Puro: as pendências derivadas (linha do extrato e fato do razão sem vínculo) que não têm justificativa vigente,
 * descritas como a tela as mostra. A chave da justificativa é (lado, referência), a mesma de `justificarPendencia`.
 */
export function semJustificativa(
  relatorio: {
    readonly noExtratoSemVinculo: readonly { readonly id: string; readonly data: Date; readonly descricao: string; readonly residual: string }[];
    readonly internoSemVinculo: readonly { readonly id: string; readonly tipoInterno: string; readonly data: Date; readonly descricao: string; readonly residual: string }[];
  },
  justificativas: readonly { readonly lado: string; readonly referencia: string }[]
): readonly string[] {
  const tem = (lado: string, ref: string): boolean => justificativas.some((j) => j.lado === lado && j.referencia === ref);
  return [
    ...relatorio.noExtratoSemVinculo.filter((l) => !tem("EXTRATO", l.id)).map((l) => `no extrato, ${diaCivil(l.data)} ${l.descricao} (${l.residual})`),
    ...relatorio.internoSemVinculo.filter((l) => !tem(l.tipoInterno, l.id)).map((l) => `no razão, ${diaCivil(l.data)} ${l.descricao} (${l.residual})`),
  ];
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

  const encerramento = c.movimentos.find((m) => m.tipo === "ENCERRAR");
  const recalculado = await conciliacaoBancaria(prisma, c.contaBancariaId, c.periodoFim, {
    conhecimento: conhecimentoDaConciliacao(c.periodoFim, encerramento?.criadoEm ?? null, new Date()),
  });

  // V39-R2 (R2-001) — encerrada com foto: a conferência se lê pela foto; o recálculo de hoje só aponta a diferença.
  const foto = encerramento === undefined ? null : await prisma.fotoDoEncerramentoDaConciliacao.findUnique({ where: { conciliacaoId: c.id } });
  const fotoPendencias = foto === null ? null : (foto.pendencias as unknown as readonly PendenciaDaFoto[]);
  const relatorio: ConciliacaoBancaria =
    foto === null || fotoPendencias === null
      ? recalculado
      : {
          ...recalculado,
          saldoExtrato: serializar(toMoney(foto.saldoExtrato.toFixed(2))),
          saldoContabil: serializar(toMoney(foto.saldoContabil.toFixed(2))),
          diferenca: serializar(toMoney(foto.diferenca.toFixed(2))),
          noExtratoSemVinculo: fotoPendencias.filter((x) => x.lado === "EXTRATO").map((x) => ({ id: x.referencia, data: new Date(x.data), descricao: x.descricao, residual: x.residual as Dinheiro })),
          internoSemVinculo: fotoPendencias.filter((x) => x.lado !== "EXTRATO").map((x) => ({ id: x.referencia, data: new Date(x.data), descricao: x.descricao, residual: x.residual as Dinheiro, tipoInterno: x.lado as ConciliacaoBancaria["internoSemVinculo"][number]["tipoInterno"] })),
        };
  const diferenca = fotoPendencias === null ? { tardios: [], resolvidosDepois: [] } : diferencaDaFoto(fotoPendencias, composicaoDaFoto(recalculado, c.justificativas));

  // Aberta, com anterior: o que é datado antes do início deste período e não veio na herança é retroativo à anterior.
  const herdadas = c.anteriorId === null ? [] : await naoResolvidasDe(prisma, c.anteriorId);
  let retroativas: { lado: string; referencia: string; periodoAfetado: string }[] = [];
  if (encerramento === undefined && c.anteriorId !== null) {
    const ant = await prisma.conciliacaoBancaria.findUniqueOrThrow({ where: { id: c.anteriorId }, select: { periodoInicio: true, periodoFim: true } });
    const naHeranca = new Set(herdadas.map((h) => `${h.lado}:${h.referencia}`));
    retroativas = composicaoDaFoto(recalculado, [])
      .filter((x) => new Date(x.data).getTime() < c.periodoInicio.getTime() && !naHeranca.has(`${x.lado}:${x.referencia}`))
      .map((x) => ({ lado: x.lado, referencia: x.referencia, periodoAfetado: rotuloDoPeriodo(ant.periodoInicio, ant.periodoFim) }));
  }

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
    herdadasDaAnterior: herdadas,
    pendenciasManuais: c.pendenciasManuais.map((p) => ({
      id: p.id,
      descricao: p.descricao,
      motivo: p.motivo,
      valor: serializar(toMoney(p.valor.toFixed(2))),
      natureza: p.natureza,
      resolvida: p.resolucao !== null,
    })),
    justificativas: c.justificativas,
    fonteDoRelatorio: foto === null ? "RECALCULADO" : "FOTO_DO_ENCERRAMENTO",
    fatosTardios: diferenca.tardios,
    resolvidosDepois: diferenca.resolvidosDepois,
    retroativas,
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
      movimentos: { select: { tipo: true, criadoEm: true } },
      fotoDoEncerramento: { select: { pendencias: true } },
    },
  });

  // V39-R2 — a herança é a FOTO gravada no encerramento da anterior, quando existe: exatamente o que foi conferido.
  if (c.fotoDoEncerramento !== null) {
    return (c.fotoDoEncerramento.pendencias as unknown as readonly PendenciaDaFoto[]).map((x) => ({
      lado: x.lado,
      referencia: x.referencia,
      descricao: `${diaCivil(new Date(x.data))} — ${x.descricao}`,
      residual: x.residual as Dinheiro,
      justificativa: x.justificativa,
    }));
  }

  // Anterior encerrada antes da foto (V39-R2): o que estava em aberto QUANDO ela foi encerrada (o conhecimento do encerramento).
  const encerradaEm = c.movimentos.find((m) => m.tipo === "ENCERRAR")?.criadoEm ?? null;
  const rel = await conciliacaoBancaria(prisma, c.contaBancariaId, c.periodoFim, { conhecimento: conhecimentoDaConciliacao(c.periodoFim, encerradaEm, new Date()) });
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
