import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { inicioDoDiaCivil, janelaCivilDoMes } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO, type AcaoDoSistema } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  saldoDoRateio,
  tetoDoExercicio,
  TIPO_DO_ESTORNO_CONSORCIO,
  zCadastrarConsorcioInput,
  zContratoDeRateioInput,
  zEstornarMovimentoConsorcioInput,
  zMovimentoConsorcioInput,
  type CadastrarConsorcioInput,
  type ContratoDeRateioInput,
  type EstornarMovimentoConsorcioInput,
  type MovimentoConsorcioInput,
  type TipoMovimentoConsorcio,
} from "./dominio.js";

/**
 * M30 — CONSÓRCIOS PÚBLICOS: os casos de uso.
 *
 * ⚠️ O REPASSE TEM LANÇAMENTO PRÓPRIO SÓ NO CONTROLE. A despesa orçamentária é contabilizada
 * pelo M05 (é o empenho/liquidação/pagamento que a move); o que este módulo lança é o
 * CONTROLE do rateio — quanto da cota anual já foi honrado. Lançar a despesa aqui a debitaria
 * duas vezes.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function travarConsorcio(tx: Tx, id: string): Promise<void> {
  await travar(tx, "ConsorcioPublico", [id]);
}

export async function cadastrarConsorcio(
  prisma: PrismaClient,
  input: CadastrarConsorcioInput
): Promise<{ readonly consorcioId: string }> {
  const d = zCadastrarConsorcioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarConsorcio, "ENTE");
    const criado = await tx.consorcioPublico.create({
      data: {
        identificador: d.identificador,
        denominacao: d.denominacao,
        cnpj: d.cnpj,
        protocoloDeIntencoes: d.protocoloDeIntencoes,
        leiRatificadora: d.leiRatificadora,
        areaDeAtuacao: d.areaDeAtuacao,
        fonteRecursoId: d.fonteRecursoId,
        contaContabilId: d.contaContabilId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { consorcioId: criado.id };
  });
}

/**
 * REGISTRAR O CONTRATO DE RATEIO — é ele que autoriza a despesa do exercício (art. 8º).
 *
 * ⚠️ O EXERCÍCIO TEM DE ESTAR ABERTO. Um contrato de rateio de exercício já encerrado
 * autorizaria despesa num ano cujo balanço já foi publicado.
 */
export async function registrarContratoDeRateio(
  prisma: PrismaClient,
  input: ContratoDeRateioInput
): Promise<{ readonly rateioId: string; readonly tetoDoExercicio: string }> {
  const d = zContratoDeRateioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarContratoDeRateio, "ENTE");
    await travarConsorcio(tx, d.consorcioId);
    await exigirExercicioAberto(tx, d.exercicio, "contrato de rateio de consórcio");

    const consorcio = await tx.consorcioPublico.findUnique({
      where: { id: d.consorcioId },
      select: { id: true, identificador: true },
    });
    if (consorcio === null) {
      throw new Error(`Consórcio ${d.consorcioId} não encontrado. Nada foi gravado.`);
    }

    if (d.aditivoDeId !== undefined) {
      const original = await tx.contratoDeRateio.findUnique({
        where: { id: d.aditivoDeId },
        select: { id: true, consorcioId: true, exercicio: true, aditivoDeId: true },
      });
      if (original === null) {
        throw new Error(`Contrato de rateio ${d.aditivoDeId} não encontrado. Nada foi gravado.`);
      }
      if (original.consorcioId !== d.consorcioId) {
        throw new Error(
          `O rateio ${d.aditivoDeId} é de OUTRO CONSÓRCIO. Aditar por cima faria o teto de um ` +
            `consórcio somar a cota de outro. Nada foi gravado.`
        );
      }
      if (original.exercicio !== d.exercicio) {
        throw new Error(
          `O rateio ${d.aditivoDeId} é do exercício ${original.exercicio}, e o aditivo diz ` +
            `${d.exercicio}. O rateio é ANUAL (art. 8º): um aditivo que troca de exercício ` +
            `moveria a cota de um ano para outro sem contrato novo. Nada foi gravado.`
        );
      }
      if (original.aditivoDeId !== null) {
        throw new Error(
          `O rateio ${d.aditivoDeId} JÁ É UM ADITIVO. Aditivo de aditivo produziria uma cadeia ` +
            `em que o teto depende da ordem de leitura; todo aditivo aponta o contrato ` +
            `ORIGINAL. Nada foi gravado.`
        );
      }
    }

    const criado = await tx.contratoDeRateio.create({
      data: {
        consorcioId: d.consorcioId,
        exercicio: d.exercicio,
        valorDoEnte: d.valorDoEnte.toFixed(2),
        dataAssinatura: inicioDoDiaCivil(d.diaAssinatura),
        ...(d.aditivoDeId !== undefined ? { aditivoDeId: d.aditivoDeId } : {}),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    const rateios = await lerRateios(tx, d.consorcioId, d.exercicio);
    return { rateioId: criado.id, tetoDoExercicio: tetoDoExercicio(rateios).toFixed(2) };
  });
}

async function lerRateios(
  tx: Tx,
  consorcioId: string,
  exercicio: number
): Promise<readonly { readonly valorDoEnte: Money; readonly ehAditivo: boolean }[]> {
  const linhas = await tx.contratoDeRateio.findMany({
    where: { consorcioId, exercicio },
    select: { valorDoEnte: true, aditivoDeId: true },
  });
  return linhas.map((r) => ({
    valorDoEnte: toMoney(r.valorDoEnte.toFixed(2)),
    ehAditivo: r.aditivoDeId !== null,
  }));
}

/**
 * REPASSAR AO CONSÓRCIO — e o guard é o TETO DO RATEIO daquele exercício.
 *
 * ⚠️ SEM CONTRATO DE RATEIO NÃO HÁ REPASSE, e a recusa é explícita. O art. 8º é claro: os
 * entes só entregam recursos mediante contrato de rateio. Repassar sem ele é despesa sem
 * amparo — e o §2º veda expressamente aplicar recurso de consórcio a despesa genérica.
 */
export async function repassarAoConsorcio(
  prisma: PrismaClient,
  input: MovimentoConsorcioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return comLancamento(prisma, input, "REPASSE", ACAO_DO_SERVICO.repassarAoConsorcio);
}

/** DEVOLVER — o saldo não aplicado volta ao fim do exercício. */
export async function registrarDevolucaoDeConsorcio(
  prisma: PrismaClient,
  input: MovimentoConsorcioInput
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  return comLancamento(prisma, input, "DEVOLUCAO", ACAO_DO_SERVICO.registrarDevolucaoDeConsorcio);
}

async function comLancamento(
  prisma: PrismaClient,
  input: MovimentoConsorcioInput,
  tipo: Extract<TipoMovimentoConsorcio, "REPASSE" | "DEVOLUCAO">,
  /** ⚠️ A AÇÃO VEM DO SERVIÇO PÚBLICO — ver a nota do mesmo helper no M28. */
  acao: AcaoDoSistema
): Promise<{ readonly movimentoId: string; readonly lancamentoId: string }> {
  const d = zMovimentoConsorcioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, acao, "ENTE");
    await travarConsorcio(tx, d.consorcioId);
    await exigirExercicioAberto(tx, d.exercicio, `${tipo} a consórcio`);

    const c = await tx.consorcioPublico.findUnique({
      where: { id: d.consorcioId },
      select: { id: true, identificador: true },
    });
    if (c === null) {
      throw new Error(`Consórcio ${d.consorcioId} não encontrado. Nada foi gravado.`);
    }

    const rateios = await lerRateios(tx, d.consorcioId, d.exercicio);
    if (tipo === "REPASSE" && rateios.length === 0) {
      throw new Error(
        `SEM CONTRATO DE RATEIO para ${d.exercicio} no consórcio ${c.identificador}. O art. 8º ` +
          `da Lei 11.107/2005 é expresso: os entes só entregam recursos ao consórcio mediante ` +
          `contrato de rateio, formalizado em CADA exercício. Registre o contrato antes de ` +
          `repassar. Nada foi gravado.`
      );
    }

    const movimentos = await tx.movimentoConsorcio.findMany({
      where: { consorcioId: d.consorcioId, exercicio: d.exercicio },
      select: { tipo: true, valor: true },
    });
    const saldo = saldoDoRateio(
      rateios,
      movimentos.map((m) => ({
        tipo: m.tipo as TipoMovimentoConsorcio,
        valor: toMoney(m.valor.toFixed(2)),
      }))
    );
    if (tipo === "REPASSE" && d.valor.gt(saldo)) {
      throw new Error(
        `TETO DO RATEIO EXCEDIDO no consórcio ${c.identificador}, exercício ${d.exercicio}: ` +
          `pedido ${d.valor.toFixed(2)}, disponível ${saldo.toFixed(2)} (teto ` +
          `${tetoDoExercicio(rateios).toFixed(2)}). Repassar acima do rateio é despesa sem ` +
          `amparo no instrumento que a autoriza — se a cota mudou, o caminho é ADITIVO ao ` +
          `contrato de rateio, ANTES do repasse. Nada foi gravado.`
      );
    }

    const roteiro = await tx.roteiroConsorcio.findUnique({
      where: { tipo },
      select: {
        contaDebito: { select: { id: true } },
        contaCredito: { select: { id: true } },
        historicoPadrao: true,
      },
    });
    if (roteiro === null) {
      throw new Error(
        `Não há RoteiroConsorcio cadastrado para ${tipo}. As contas do PCASP vêm por ` +
          `PARÂMETRO. Cadastre o roteiro. Nada foi gravado.`
      );
    }

    const dataFato = inicioDoDiaCivil(d.diaMovimento);
    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `CONS-${c.identificador}-${d.exercicio}-${tipo}-${d.diaMovimento}`,
      dataTransacao: dataFato,
      historico: `${roteiro.historicoPadrao} — consórcio ${c.identificador} (${d.exercicio})`,
      origemTipo: `CONSORCIO_${tipo}`,
      origemId: c.id,
      criadoPor: d.criadoPor,
      partidas: [
        {
          contaId: roteiro.contaDebito.id,
          tipo: "DEBITO",
          subsistema: "CONTROLE",
          valor: d.valor.toFixed(2),
        },
        {
          contaId: roteiro.contaCredito.id,
          tipo: "CREDITO",
          subsistema: "CONTROLE",
          valor: d.valor.toFixed(2),
        },
      ],
    });

    const criado = await tx.movimentoConsorcio.create({
      data: {
        consorcioId: d.consorcioId,
        tipo,
        valor: d.valor.toFixed(2),
        exercicio: d.exercicio,
        dataMovimento: dataFato,
        competencia: janelaCivilDoMes(d.competencia).inicio,
        ...(d.empenhoId !== undefined ? { empenhoId: d.empenhoId } : {}),
        lancamentoId,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id, lancamentoId };
  });
}

export async function estornarMovimentoConsorcio(
  prisma: PrismaClient,
  input: EstornarMovimentoConsorcioInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEstornarMovimentoConsorcioInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarMovimentoConsorcio, "ENTE");

    const original = await tx.movimentoConsorcio.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        consorcioId: true,
        tipo: true,
        valor: true,
        exercicio: true,
        competencia: true,
        estornos: { select: { id: true } },
      },
    });
    if (original === null) {
      throw new Error(`Movimento de consórcio ${d.movimentoId} não encontrado. Nada foi gravado.`);
    }
    await travarConsorcio(tx, original.consorcioId);

    const tipoDoEstorno = TIPO_DO_ESTORNO_CONSORCIO[original.tipo as TipoMovimentoConsorcio];
    if (tipoDoEstorno === null) {
      throw new Error(
        `O movimento ${d.movimentoId} JÁ É UM ESTORNO (${original.tipo}). Nada foi gravado.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(`O movimento ${d.movimentoId} JÁ FOI ESTORNADO. Nada foi gravado.`);
    }

    const criado = await tx.movimentoConsorcio.create({
      data: {
        consorcioId: original.consorcioId,
        tipo: tipoDoEstorno,
        valor: original.valor,
        // ⚠️ O EXERCÍCIO É O DO ORIGINAL. Carimbar o corrente devolveria cota de um ano ao
        // teto de outro — e o guard do rateio passaria a autorizar repasse que o contrato
        // daquele exercício não previu.
        exercicio: original.exercicio,
        dataMovimento: inicioDoDiaCivil(d.diaMovimento),
        competencia: original.competencia,
        estornoDeId: original.id,
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}
