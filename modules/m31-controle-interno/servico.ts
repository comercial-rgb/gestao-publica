import { createHash } from "node:crypto";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import {
  estadoDaAuditoria,
  zAbrirAuditoriaInput,
  zApreciarProvidenciaInput,
  zEncerrarAuditoriaInput,
  zRegistrarIrregularidadeInput,
  zRegistrarProvidenciaInput,
  zResponderItemInput,
  type AbrirAuditoriaInput,
  type ApreciarProvidenciaInput,
  type EncerrarAuditoriaInput,
  type RegistrarIrregularidadeInput,
  type RegistrarProvidenciaInput,
  type ResponderItemInput,
  type TipoMovimentoDaAuditoria,
} from "./dominio.js";

/**
 * M31 — CONTROLE INTERNO: os casos de uso.
 *
 * ⚠️ REGIME DE SUPERFÍCIE, DECLARADO. Este módulo não move o razão — não há lançamento, não há
 * saldo, não há período contábil a respeitar. O que ele tem de garantir é que o JUÍZO fique
 * registrado com autor, data e motivo, e que nada se apague. Os guards abaixo são todos dessa
 * natureza.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

async function exigirAuditoriaAberta(
  tx: Tx,
  auditoriaId: string,
  ondeUsado: string
): Promise<{ readonly id: string; readonly identificador: string }> {
  const a = await tx.auditoriaInterna.findUnique({
    where: { id: auditoriaId },
    select: {
      id: true,
      identificador: true,
      movimentos: { select: { tipo: true, dataMovimento: true, criadoEm: true } },
    },
  });
  if (a === null) {
    throw new Error(`Auditoria ${auditoriaId} não encontrada. Nada foi gravado.`);
  }
  const estado = estadoDaAuditoria(
    a.movimentos.map((m) => ({
      tipo: m.tipo as TipoMovimentoDaAuditoria,
      dataMovimento: m.dataMovimento,
      criadoEm: m.criadoEm,
    }))
  );
  if (estado === "ENCERRADA") {
    throw new Error(
      `A auditoria ${a.identificador} está ENCERRADA (${ondeUsado}). O relatório já foi ` +
        `emitido e entregue; alterar o que ele descreve depois disso é reescrever um ` +
        `documento que alguém já leu. Para retomar, REABRA a auditoria — reabrir é um fato, ` +
        `e ele exige motivo. Nada foi gravado.`
    );
  }
  return { id: a.id, identificador: a.identificador };
}

export async function abrirAuditoria(
  prisma: PrismaClient,
  input: AbrirAuditoriaInput
): Promise<{ readonly auditoriaId: string }> {
  const d = zAbrirAuditoriaInput.parse(input);
  const periodoInicio = inicioDoDiaCivil(d.diaPeriodoInicio);
  const periodoFim = fimDoDiaCivil(d.diaPeriodoFim);
  if (periodoFim < periodoInicio) {
    throw new Error(
      `PERÍODO INVERTIDO na auditoria ${d.identificador}: termina (${d.diaPeriodoFim}) antes ` +
        `de começar (${d.diaPeriodoInicio}). Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.abrirAuditoria, "ENTE");

    const criada = await tx.auditoriaInterna.create({
      data: {
        identificador: d.identificador,
        objeto: d.objeto,
        tipo: d.tipo,
        orgaoId: d.orgaoId,
        periodoInicio,
        periodoFim,
        responsavel: d.responsavel,
        criadoPor: d.criadoPor,
        // ⚠️ A ABERTURA É UM MOVIMENTO, gravado na MESMA transação do cadastro. Sem ele a
        // auditoria nasceria sem fato de abertura, e o estado — que é derivado — ficaria
        // "aberta" por ausência em vez de por decisão.
        movimentos: {
          create: {
            tipo: "ABERTURA",
            dataMovimento: inicioDoDiaCivil(d.diaAbertura),
            motivo: d.motivo,
            criadoPor: d.criadoPor,
          },
        },
        ...(d.itens.length > 0
          ? {
              itens: {
                create: d.itens.map((i, indice) => ({
                  ordem: indice + 1,
                  pergunta: i.pergunta,
                  baseLegal: i.baseLegal,
                  criadoPor: d.criadoPor,
                })),
              },
            }
          : {}),
      },
      select: { id: true },
    });
    return { auditoriaId: criada.id };
  });
}

/**
 * RESPONDER UM ITEM — append-only. A vigente é a mais recente; as anteriores ficam.
 *
 * ⚠️ "NÃO CONFORME" E "NÃO APLICÁVEL" EXIGEM OBSERVAÇÃO. "Não conforme" sem dizer o que se viu
 * não é achado, é acusação; "não aplicável" sem dizer por quê é o item pulado com aparência de
 * examinado. "Conforme" dispensa: o que se viu é a própria norma cumprida.
 */
export async function responderItemDoChecklist(
  prisma: PrismaClient,
  input: ResponderItemInput
): Promise<{ readonly respostaId: string }> {
  const d = zResponderItemInput.parse(input);
  if (d.resposta !== "CONFORME" && (d.observacao ?? "").trim() === "") {
    throw new Error(
      `RESPOSTA "${d.resposta}" SEM OBSERVAÇÃO. "Não conforme" sem dizer o que se viu não é ` +
        `achado, é acusação; "não aplicável" sem dizer por quê é o item pulado com aparência ` +
        `de examinado. Escreva o que foi verificado. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderItemDoChecklist, "ENTE");

    const item = await tx.itemDeChecklist.findUnique({
      where: { id: d.itemId },
      select: { id: true, auditoriaId: true, ordem: true },
    });
    if (item === null) {
      throw new Error(`Item de checklist ${d.itemId} não encontrado. Nada foi gravado.`);
    }
    await exigirAuditoriaAberta(tx, item.auditoriaId, `resposta do item ${item.ordem}`);

    const criada = await tx.respostaDeChecklist.create({
      data: {
        itemId: d.itemId,
        resposta: d.resposta,
        ...(d.observacao !== undefined ? { observacao: d.observacao } : {}),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { respostaId: criada.id };
  });
}

/**
 * REGISTRAR UMA IRREGULARIDADE — com PROVIDÊNCIA e PRAZO, sem os quais ela é observação.
 *
 * ⚠️ O PRAZO É UM DIA CIVIL, gravado no ÚLTIMO instante dele. Um prazo "até 31/01" inclui o dia
 * 31 inteiro; gravado como meia-noite, ele venceria no começo do dia e o auditado perderia um
 * dia de prazo — num rótulo ("prazo vencido") que produz providência disciplinar.
 */
export async function registrarIrregularidade(
  prisma: PrismaClient,
  input: RegistrarIrregularidadeInput
): Promise<{ readonly irregularidadeId: string }> {
  const d = zRegistrarIrregularidadeInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarIrregularidade, "ENTE");
    await exigirAuditoriaAberta(tx, d.auditoriaId, "registro de irregularidade");

    if (d.itemId !== undefined) {
      const item = await tx.itemDeChecklist.findUnique({
        where: { id: d.itemId },
        select: { auditoriaId: true, ordem: true },
      });
      if (item === null) {
        throw new Error(`Item de checklist ${d.itemId} não encontrado. Nada foi gravado.`);
      }
      if (item.auditoriaId !== d.auditoriaId) {
        throw new Error(
          `O item ${item.ordem} é de OUTRA AUDITORIA. Vincular o achado a um roteiro que não é ` +
            `o desta auditoria faria as duas contarem a mesma irregularidade. Nada foi gravado.`
        );
      }
    }

    const criada = await tx.irregularidade.create({
      data: {
        auditoriaId: d.auditoriaId,
        ...(d.itemId !== undefined ? { itemId: d.itemId } : {}),
        descricao: d.descricao,
        gravidade: d.gravidade,
        providencia: d.providencia,
        prazo: fimDoDiaCivil(d.diaPrazo),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { irregularidadeId: criada.id };
  });
}

/** REGISTRAR A PROVIDÊNCIA do auditado — ainda não apreciada. */
export async function registrarProvidencia(
  prisma: PrismaClient,
  input: RegistrarProvidenciaInput
): Promise<{ readonly providenciaId: string }> {
  const d = zRegistrarProvidenciaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarProvidencia, "ENTE");

    const irregularidade = await tx.irregularidade.findUnique({
      where: { id: d.irregularidadeId },
      select: { id: true, auditoriaId: true },
    });
    if (irregularidade === null) {
      throw new Error(`Irregularidade ${d.irregularidadeId} não encontrada. Nada foi gravado.`);
    }
    await exigirAuditoriaAberta(tx, irregularidade.auditoriaId, "registro de providência");

    const criada = await tx.providenciaDaIrregularidade.create({
      data: {
        irregularidadeId: d.irregularidadeId,
        relato: d.relato,
        dataProvidencia: inicioDoDiaCivil(d.diaProvidencia),
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { providenciaId: criada.id };
  });
}

/**
 * APRECIAR A PROVIDÊNCIA — e é OUTRO CRACHÁ.
 *
 * ⚠️ QUEM RELATA A PROVIDÊNCIA NÃO A APRECIA. O auditado relata; o auditor aceita ou recusa.
 * Um crachá só faria o auditado declarar sanada a própria irregularidade — que é o arranjo
 * que o art. 74 manda impedir.
 *
 * ⚠️ RECUSAR EXIGE MOTIVO. "Não aceita" sem dizer por quê deixa o auditado sem saber o que
 * fazer, e o prazo continua correndo contra ele.
 */
export async function apreciarProvidencia(
  prisma: PrismaClient,
  input: ApreciarProvidenciaInput
): Promise<{ readonly providenciaId: string }> {
  const d = zApreciarProvidenciaInput.parse(input);
  if (!d.aceita && (d.motivoDaRecusa ?? "").trim() === "") {
    throw new Error(
      `RECUSA SEM MOTIVO. "Não aceita" sem dizer por quê deixa o auditado sem saber o que ` +
        `fazer, e o prazo continua correndo contra ele. Escreva o que falta. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apreciarProvidencia, "ENTE");

    const p = await tx.providenciaDaIrregularidade.findUnique({
      where: { id: d.providenciaId },
      select: {
        id: true,
        aceita: true,
        criadoPor: true,
        irregularidade: { select: { auditoriaId: true } },
      },
    });
    if (p === null) {
      throw new Error(`Providência ${d.providenciaId} não encontrada. Nada foi gravado.`);
    }
    await exigirAuditoriaAberta(tx, p.irregularidade.auditoriaId, "apreciação de providência");

    if (p.aceita !== null) {
      throw new Error(
        `A providência ${d.providenciaId} JÁ FOI APRECIADA. Mudar a apreciação depois ` +
          `apagaria o juízo anterior — se o auditor mudou de entendimento, o caminho é o ` +
          `auditado registrar providência NOVA e ela ser apreciada. Nada foi gravado.`
      );
    }
    if (p.criadoPor === d.criadoPor) {
      throw new Error(
        `SEGREGAÇÃO DE FUNÇÃO: ${d.criadoPor} relatou esta providência e está tentando ` +
          `APRECIÁ-LA. O auditado relata; o auditor aceita ou recusa. Um só poder para as ` +
          `duas coisas faria o auditado declarar sanada a própria irregularidade. Nada foi ` +
          `gravado.`
      );
    }

    await tx.providenciaDaIrregularidade.update({
      where: { id: d.providenciaId },
      data: {
        aceita: d.aceita,
        ...(d.motivoDaRecusa !== undefined ? { motivoDaRecusa: d.motivoDaRecusa } : {}),
      },
    });
    return { providenciaId: p.id };
  });
}

/**
 * ENCERRAR A AUDITORIA — e ela recusa fechar com item pendente de resposta.
 *
 * ⚠️ ITEM SEM RESPOSTA NÃO É "CONFORME". Encerrar com o roteiro pela metade produziria um
 * relatório que diz, por omissão, que tudo o que não foi examinado está certo. Se o item não
 * se aplica, a resposta é `NAO_APLICAVEL` COM observação — que é uma decisão de alguém.
 */
export async function encerrarAuditoria(
  prisma: PrismaClient,
  input: EncerrarAuditoriaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zEncerrarAuditoriaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarAuditoria, "ENTE");
    const a = await exigirAuditoriaAberta(tx, d.auditoriaId, "encerramento");

    const itens = await tx.itemDeChecklist.findMany({
      where: { auditoriaId: d.auditoriaId },
      select: { ordem: true, pergunta: true, respostas: { select: { id: true } } },
      orderBy: { ordem: "asc" },
    });
    const pendentes = itens.filter((i) => i.respostas.length === 0);
    if (pendentes.length > 0) {
      throw new Error(
        `A auditoria ${a.identificador} tem ${pendentes.length} item(ns) do checklist SEM ` +
          `RESPOSTA: ${pendentes.map((i) => `#${i.ordem}`).join(", ")}. Encerrar com o ` +
          `roteiro pela metade produz um relatório que diz, POR OMISSÃO, que tudo o que não ` +
          `foi examinado está certo. Se o item não se aplica, responda NAO_APLICAVEL com a ` +
          `observação — isso é uma decisão de alguém. Nada foi gravado.`
      );
    }

    const criado = await tx.movimentoDaAuditoria.create({
      data: {
        auditoriaId: d.auditoriaId,
        tipo: "ENCERRAMENTO",
        dataMovimento: inicioDoDiaCivil(d.diaEncerramento),
        motivo: d.motivo,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: criado.id };
  });
}

/**
 * EMITIR O RELATÓRIO CIRCUNSTANCIADO — o produto da auditoria, e ele é DOCUMENTO.
 *
 * ⚠️ O TEXTO CANÔNICO VIRA O CONTEÚDO ASSINÁVEL, e o `hashConteudo` é o SHA-256 DELE. Mesmo
 * desenho do borderô (M09) e da nota de empenho (M05): a fila do M22 assina um CONTEÚDO, e o
 * hash só significa alguma coisa se houver conteúdo a que ele corresponda.
 *
 * ⚠️ A VERSÃO É APPEND-ONLY. Um relatório refeito é OUTRA linha, e a anterior fica: é ela que
 * o auditado recebeu, e é contra ela que ele respondeu.
 */
export async function emitirRelatorioCircunstanciado(
  prisma: PrismaClient,
  input: {
    readonly auditoriaId: string;
    readonly texto: string;
    readonly criadoPor: string;
  }
): Promise<{
  readonly relatorioId: string;
  readonly versao: number;
  readonly hashConteudo: string;
}> {
  const texto = input.texto.trim();
  if (texto.length < 100) {
    throw new Error(
      `RELATÓRIO CIRCUNSTANCIADO COM ${texto.length} CARACTERES. "Circunstanciado" é o que a ` +
        `lei pede: o relatório descreve o que foi examinado, o que se achou e o que se ` +
        `determinou. Um texto de uma linha assinado tem a mesma aparência de um completo, e é ` +
        `a aparência que o tribunal recebe. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      input.criadoPor,
      ACAO_DO_SERVICO.emitirRelatorioCircunstanciado,
      "ENTE"
    );

    const a = await tx.auditoriaInterna.findUnique({
      where: { id: input.auditoriaId },
      select: { id: true, identificador: true },
    });
    if (a === null) {
      throw new Error(`Auditoria ${input.auditoriaId} não encontrada. Nada foi gravado.`);
    }

    const ultima = await tx.relatorioCircunstanciado.findFirst({
      where: { auditoriaId: input.auditoriaId },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const versao = (ultima?.versao ?? 0) + 1;

    const hashConteudo = createHash("sha256").update(texto, "utf8").digest("hex");

    const criado = await tx.relatorioCircunstanciado.create({
      data: {
        auditoriaId: input.auditoriaId,
        versao,
        hashConteudo,
        criadoPor: input.criadoPor,
      },
      select: { id: true },
    });
    return { relatorioId: criado.id, versao, hashConteudo };
  });
}
