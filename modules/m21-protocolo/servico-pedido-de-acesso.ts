import { randomUUID } from "node:crypto";
import { z } from "zod";
import { diaCivil, FUSO_DO_ENTE } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { zAbrirProcesso, zReceber, zTramitar } from "./dominio.js";
import {
  chaveDoFato,
  configuracaoDoPedido,
  registrarFatoDoPedido,
  type ComandoDoPedido,
  type FatoDoPedido,
  type NaturezaDoFato,
  type PedidoDeAcesso,
} from "./pedido-de-acesso.js";
import { escolherConfiguracaoVigente, type ConfiguracaoLida } from "./acesso-a-informacao.js";
import { criarProcessoNaTransacao, receberNaTransacao, tramitarNaTransacao } from "./servico.js";

/**
 * ═══ O RITO DO ACESSO À INFORMAÇÃO — A CASCA (V11 V5.3, Fase B) ═══
 *
 * ⚠️ A DECISÃO NÃO MORA AQUI. Quem decide se um ato cabe é `registrarFatoDoPedido`, que é puro,
 * não lê relógio nem banco, e devolve a recusa com o código PRÓPRIO daquela recusa. Esta camada
 * faz três coisas e nada mais: confere o crachá, TRAVA, e grava o que o domínio aprovou.
 *
 * ⚠️ POR QUE TRAVAR SE O DOMÍNIO JÁ RECUSA. Porque a recusa do domínio é ler-decidir-gravar:
 * duas respostas simultâneas leem "ainda não respondido" e as duas gravam. Os índices únicos
 * parciais (`prisma/sql/uq_fato_do_pedido_de_acesso.sql`) são a rede embaixo — impedem, mas com
 * violação de índice. O trinco é o que permite RECUSAR com o motivo certo.
 *
 * ⚠️ O PEDIDO NÃO TEM JORNADA PRÓPRIA. Distribuir é TRAMITAR o processo; receber é RECEBER o
 * processo. Por isso esta camada chama `tramitarNaTransacao` e `receberNaTransacao` de DENTRO da
 * mesma transação: ou o processo anda e o fato do rito é gravado, ou nenhum dos dois. Um fato do
 * rito sem o movimento correspondente seria uma trilha que conta uma história que o processo não
 * viveu.
 *
 * ⚠️ VINCULAR AO PROCESSO NÃO TORNA O PEDIDO PÚBLICO. As duas projeções são separadas no domínio
 * (`visaoInternaDoPedido` e `visaoDoSolicitante`) e o `fundamentoInterno` é coluna própria.
 */

const Tx_DUMMY = null as unknown as Tx; // nunca usado: existe para o import de tipo não ficar solto
void Tx_DUMMY;

// ────────────────────────────────────────────────────────────────────────────
// LEITURA DO ESTADO — o que o domínio puro precisa receber pronto
// ────────────────────────────────────────────────────────────────────────────

const SELECT_FATO = {
  id: true,
  pedidoId: true,
  processoId: true,
  natureza: true,
  ator: true,
  em: true,
  dia: true,
  configuracaoVersao: true,
  chave: true,
  mensagemAoRequerente: true,
  fundamentoInterno: true,
  setorDestinoId: true,
  documentoId: true,
  classificacao: true,
  instancia: true,
  resultadoDoRecurso: true,
} as const;

/** As versões da configuração, no formato que o domínio lê. */
async function versoesDaConfiguracao(tx: Tx): Promise<readonly ConfiguracaoLida[]> {
  const linhas = await tx.versaoDaConfiguracaoDoAcessoAInformacao.findMany({
    orderBy: { versao: "asc" },
    select: {
      versao: true,
      vigenciaInicio: true,
      prazoDeRespostaEmDias: true,
      prazoDeProrrogacaoEmDias: true,
      prorrogacoesPermitidas: true,
      instanciasDeRecurso: true,
      prazoDeRecursoEmDias: true,
      normaFederal: true,
      normaFederalPublicadaEm: true,
      regulamentacaoLocal: true,
      regulamentacaoLocalPublicadaEm: true,
      observacao: true,
    },
  });
  return linhas.map((l) => ({
    versao: l.versao,
    vigenciaInicio: l.vigenciaInicio,
    prazoDeRespostaEmDias: l.prazoDeRespostaEmDias,
    prazoDeProrrogacaoEmDias: l.prazoDeProrrogacaoEmDias,
    prorrogacoesPermitidas: l.prorrogacoesPermitidas,
    instanciasDeRecurso: l.instanciasDeRecurso,
    prazoDeRecursoEmDias: l.prazoDeRecursoEmDias,
    normaFederal: l.normaFederal,
    normaFederalPublicadaEm: l.normaFederalPublicadaEm,
    regulamentacaoLocal: l.regulamentacaoLocal,
    regulamentacaoLocalPublicadaEm: l.regulamentacaoLocalPublicadaEm,
    observacao: l.observacao,
  }));
}

interface EstadoDoPedido {
  readonly pedido: PedidoDeAcesso;
  readonly fatos: readonly FatoDoPedido[];
  readonly config: ConfiguracaoLida | null;
  readonly setorAberturaId: string;
}

/**
 * Carrega o pedido, os fatos e a configuração CONGELADA dele.
 *
 * ⚠️ A CONGELADA, NÃO A VIGENTE. `configuracaoDoPedido` procura a versão sob a qual o pedido
 * nasceu. Ler a vigente de hoje faria a norma nova reescrever, por efeito, o prazo de quem já
 * pediu — sem tocar em nenhuma linha dele.
 */
async function carregarPedido(tx: Tx, pedidoId: string): Promise<EstadoDoPedido> {
  const linha = await tx.pedidoDeAcessoAInformacao.findUnique({
    where: { id: pedidoId },
    select: {
      id: true,
      processoId: true,
      protocoladoEm: true,
      configuracaoVersao: true,
      processo: { select: { numero: true, setorAberturaId: true, exercicio: { select: { ano: true } } } },
      fatos: { orderBy: { em: "asc" }, select: SELECT_FATO },
    },
  });
  if (linha === null) {
    throw new Error(`Pedido de acesso à informação ${pedidoId} não encontrado. Nada foi gravado.`);
  }
  const pedido: PedidoDeAcesso = {
    id: linha.id,
    processoId: linha.processoId,
    protocolo: `${linha.processo.numero}/${linha.processo.exercicio.ano}`,
    protocoladoEm: linha.protocoladoEm,
    configuracaoVersao: linha.configuracaoVersao,
  };
  const versoes = await versoesDaConfiguracao(tx);
  return {
    pedido,
    fatos: linha.fatos as readonly FatoDoPedido[],
    config: configuracaoDoPedido(versoes, pedido),
    setorAberturaId: linha.processo.setorAberturaId,
  };
}

/**
 * Passa o comando pelo domínio e grava o que ele aprovar.
 *
 * ⚠️ CONFERIR ANTES DE GRAVAR, e a ordem não é estética. O efeito colateral antes da guarda
 * envenena a tentativa seguinte: gravar o fato e só então descobrir que ele não cabia deixaria a
 * chave consumida para sempre, e o ato legítimo nunca mais entraria.
 */
async function gravarFato(
  tx: Tx,
  estado: EstadoDoPedido,
  comando: ComandoDoPedido,
  ator: string,
  chave: string,
  agora: Date,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const r = registrarFatoDoPedido({
    pedido: estado.pedido,
    config: estado.config,
    fatos: estado.fatos,
    comando,
    ator,
    em: agora,
    chave,
    id: randomUUID(),
  });
  if (!r.aceito) throw new Error(`${r.codigo}: ${r.motivo}`);
  if (r.repetido) return { fatoId: r.fato.id, repetido: true };

  const f = r.fato;
  await tx.fatoDoPedidoDeAcesso.create({
    data: {
      id: f.id,
      pedidoId: f.pedidoId,
      processoId: f.processoId,
      natureza: f.natureza,
      ator: f.ator,
      em: f.em,
      dia: f.dia,
      configuracaoVersao: f.configuracaoVersao,
      chave: f.chave,
      mensagemAoRequerente: f.mensagemAoRequerente,
      fundamentoInterno: f.fundamentoInterno,
      setorDestinoId: f.setorDestinoId,
      documentoId: f.documentoId,
      classificacao: f.classificacao,
      instancia: f.instancia,
      resultadoDoRecurso: f.resultadoDoRecurso,
    },
  });
  return { fatoId: f.id, repetido: false };
}

/** A chave de um ato vinda da borda, já com o escopo do pedido dentro dela. */
function chaveDoComando(pedidoId: string, natureza: NaturezaDoFato, sufixo: string): string {
  return chaveDoFato(pedidoId, natureza, sufixo);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. PROTOCOLAR
// ────────────────────────────────────────────────────────────────────────────

export const zProtocolarPedidoDeAcesso = z
  .object({
    exercicio: z.number().int().min(1900).max(2200),
    assuntoId: z.string().min(1),
    requerenteId: z.string().min(1).optional(),
    contatoAnonimo: z.string().trim().min(5).optional(),
    setorAberturaId: z.string().min(1),
    /** O que o cidadão quer saber. É o texto de abertura do processo. */
    pedido: z.string().trim().min(10, "Descreva a informação pedida — dez caracteres não descrevem nada."),
    sigiloso: z.boolean().default(false),
    /** O sufixo da chave de idempotência do ato, vindo do formulário. */
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type ProtocolarPedidoDeAcessoInput = z.input<typeof zProtocolarPedidoDeAcesso>;

/**
 * PROTOCOLA o pedido: abre o processo, cria o pedido e grava o fato do protocolo — na MESMA
 * transação.
 *
 * ⚠️ A VERSÃO DA CONFIGURAÇÃO É CONGELADA AQUI, e pode ser NULA. Se o ente ainda não publicou,
 * o pedido corre assim mesmo e o que falta é a DATA — recusar o cidadão porque o ente não se
 * configurou puniria quem tem o direito pelo que o ente não fez.
 */
export async function protocolarPedidoDeAcesso(
  prisma: PrismaClient,
  input: ProtocolarPedidoDeAcessoInput,
): Promise<{ readonly pedidoId: string; readonly processoId: string; readonly protocolo: string; readonly configuracaoVersao: number | null }> {
  const d = zProtocolarPedidoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.protocolarPedidoDeAcesso, { setor: d.setorAberturaId });

    const agora = new Date();
    const versoes = await versoesDaConfiguracao(tx);
    const vigente = escolherConfiguracaoVigente(versoes, diaCivil(agora, FUSO_DO_ENTE));

    const processo = await criarProcessoNaTransacao(
      tx,
      zAbrirProcesso.parse({
        exercicio: d.exercicio,
        assuntoId: d.assuntoId,
        requerenteId: d.requerenteId,
        contatoAnonimo: d.contatoAnonimo,
        finalidade: "ATENDIMENTO_AO_PUBLICO",
        sigiloso: d.sigiloso,
        textoAbertura: d.pedido,
        setorAberturaId: d.setorAberturaId,
        criadoPor: d.criadoPor,
      }),
    );

    const pedidoId = randomUUID();
    await tx.pedidoDeAcessoAInformacao.create({
      data: {
        id: pedidoId,
        processoId: processo.processoId,
        protocoladoEm: agora,
        configuracaoVersao: vigente?.versao ?? null,
        criadoPor: d.criadoPor,
      },
    });

    // O fato do protocolo é escrito DIRETO: o domínio não tem comando para ele, porque ele é o
    // nascimento do pedido — não há estado anterior contra o qual decidir.
    await tx.fatoDoPedidoDeAcesso.create({
      data: {
        id: randomUUID(),
        pedidoId,
        processoId: processo.processoId,
        natureza: "PEDIDO_PROTOCOLADO",
        ator: d.criadoPor,
        em: agora,
        dia: diaCivil(agora, FUSO_DO_ENTE),
        configuracaoVersao: vigente?.versao ?? null,
        chave: chaveDoComando(pedidoId, "PEDIDO_PROTOCOLADO", d.sufixoDaChave),
        mensagemAoRequerente: null,
        fundamentoInterno: null,
      },
    });

    return {
      pedidoId,
      processoId: processo.processoId,
      protocolo: `${processo.numero}/${d.exercicio}`,
      configuracaoVersao: vigente?.versao ?? null,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 2. DISTRIBUIR — tramitar o processo E gravar o fato, juntos
// ────────────────────────────────────────────────────────────────────────────

export const zDistribuirPedidoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    setorDestinoId: z.string().min(1),
    fundamentoInterno: z.string().trim().min(10, "Diga POR QUE este setor — dez caracteres não dizem."),
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type DistribuirPedidoDeAcessoInput = z.input<typeof zDistribuirPedidoDeAcesso>;

export async function distribuirPedidoDeAcesso(
  prisma: PrismaClient,
  input: DistribuirPedidoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zDistribuirPedidoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.distribuirPedidoDeAcesso, {
      setor: estado.setorAberturaId,
    });

    const agora = new Date();
    const r = await gravarFato(
      tx,
      estado,
      { natureza: "PEDIDO_DISTRIBUIDO", setorDestinoId: d.setorDestinoId, fundamentoInterno: d.fundamentoInterno },
      d.criadoPor,
      chaveDoComando(d.pedidoId, "PEDIDO_DISTRIBUIDO", d.sufixoDaChave),
      agora,
    );
    // Repetição não move o processo de novo: a chave já respondeu por este ato.
    if (!r.repetido) {
      await tramitarNaTransacao(
        tx,
        zTramitar.parse({
          processoId: estado.pedido.processoId,
          setorDestinoId: d.setorDestinoId,
          texto: `Pedido de acesso à informação distribuído: ${d.fundamentoInterno}`,
          criadoPor: d.criadoPor,
        }),
      );
    }
    return r;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 3. RECEBER — no setor de destino
// ────────────────────────────────────────────────────────────────────────────

export const zReceberPedidoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type ReceberPedidoDeAcessoInput = z.input<typeof zReceberPedidoDeAcesso>;

export async function receberPedidoDeAcesso(
  prisma: PrismaClient,
  input: ReceberPedidoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zReceberPedidoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    // ⚠️ A AÇÃO É `RECEBER_PROCESSO` — receber o pedido no setor É receber o processo. O escopo
    // é o setor de abertura; `receberNaTransacao`, abaixo, cobra a LOTAÇÃO no setor de destino,
    // que é a conferência que impede quem enviou de dar por recebido em nome de quem não abriu.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.receberPedidoDeAcesso, {
      setor: estado.setorAberturaId,
    });

    const agora = new Date();
    const r = await gravarFato(
      tx,
      estado,
      { natureza: "PEDIDO_RECEBIDO" },
      d.criadoPor,
      chaveDoComando(d.pedidoId, "PEDIDO_RECEBIDO", d.sufixoDaChave),
      agora,
    );
    // ⚠️ O CRACHÁ E A LOTAÇÃO SÃO CONFERIDOS POR `receberNaTransacao`, que é o ato de verdade:
    // receber é ato de quem está no DESTINO, e é ele quem sabe qual é o destino.
    if (!r.repetido) {
      await receberNaTransacao(
        tx,
        zReceber.parse({
          processoId: estado.pedido.processoId,
          texto: "Pedido de acesso à informação recebido no setor.",
          criadoPor: d.criadoPor,
        }),
      );
    }
    return r;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 4. PRORROGAR
// ────────────────────────────────────────────────────────────────────────────

export const zProrrogarPedidoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    fundamentoInterno: z.string().trim().min(10, "A prorrogação é motivada — a norma cobra o motivo."),
    mensagemAoRequerente: z.string().trim().min(10, "O requerente lê este texto: diga a ele o que foi prorrogado."),
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type ProrrogarPedidoDeAcessoInput = z.input<typeof zProrrogarPedidoDeAcesso>;

export async function prorrogarPedidoDeAcesso(
  prisma: PrismaClient,
  input: ProrrogarPedidoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zProrrogarPedidoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.prorrogarPedidoDeAcesso, {
      setor: estado.setorAberturaId,
    });
    return gravarFato(
      tx,
      estado,
      {
        natureza: "PRORROGACAO_CONCEDIDA",
        fundamentoInterno: d.fundamentoInterno,
        mensagemAoRequerente: d.mensagemAoRequerente,
      },
      d.criadoPor,
      chaveDoComando(d.pedidoId, "PRORROGACAO_CONCEDIDA", d.sufixoDaChave),
      new Date(),
    );
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 5. RESPONDER — a prévia e a entrega, pela MESMA ação
// ────────────────────────────────────────────────────────────────────────────

export const zResponderPedidoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    /** `false` registra PRÉVIA: o texto que o setor preparou e ainda não entregou. */
    entregar: z.boolean(),
    classificacao: z.enum(["ACESSO_CONCEDIDO", "ACESSO_PARCIAL", "ACESSO_NEGADO"]).nullable(),
    mensagemAoRequerente: z.string().trim().nullable(),
    fundamentoInterno: z.string().trim().nullable(),
    documentoId: z.string().min(1).nullable(),
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type ResponderPedidoDeAcessoInput = z.input<typeof zResponderPedidoDeAcesso>;

/**
 * RESPONDE — prévia ou entrega.
 *
 * ⚠️ PRÉVIA NÃO É RESPOSTA, e é o domínio quem cobra isso: a prévia não inicia prazo de recurso,
 * não fecha o pedido e não aparece para o requerente. São o mesmo CRACHÁ porque quem redige é
 * quem entrega; são fatos de naturezas diferentes porque só um deles é o ato.
 */
export async function responderPedidoDeAcesso(
  prisma: PrismaClient,
  input: ResponderPedidoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zResponderPedidoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.responderPedidoDeAcesso, {
      setor: estado.setorAberturaId,
    });

    const comando: ComandoDoPedido = d.entregar
      ? {
          natureza: "RESPOSTA_ENTREGUE",
          classificacao: d.classificacao ?? "ACESSO_CONCEDIDO",
          mensagemAoRequerente: d.mensagemAoRequerente ?? "",
          fundamentoInterno: d.fundamentoInterno,
          documentoId: d.documentoId,
        }
      : {
          natureza: "RESPOSTA_PREVIA_REGISTRADA",
          fundamentoInterno: d.fundamentoInterno ?? "",
          documentoId: d.documentoId,
        };

    return gravarFato(
      tx,
      estado,
      comando,
      d.criadoPor,
      chaveDoComando(d.pedidoId, d.entregar ? "RESPOSTA_ENTREGUE" : "RESPOSTA_PREVIA_REGISTRADA", d.sufixoDaChave),
      new Date(),
    );
  });
}

// ────────────────────────────────────────────────────────────────────────────
// 6. O RECURSO — interpor e decidir
// ────────────────────────────────────────────────────────────────────────────

export const zInterporRecursoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    razoes: z.string().trim().min(10, "As razões do recurso são do requerente, e elas ficam registradas."),
    sufixoDaChave: z.string().trim().min(1),
    /** Quem registra. `"REQUERENTE"` quando o recurso chega pelo balcão. */
    criadoPor: z.string().min(1),
  })
  .strict();

export type InterporRecursoDeAcessoInput = z.input<typeof zInterporRecursoDeAcesso>;

export const zDecidirRecursoDeAcesso = z
  .object({
    pedidoId: z.string().min(1),
    resultado: z.enum(["PROVIDO", "PROVIDO_EM_PARTE", "DESPROVIDO"]),
    mensagemAoRequerente: z.string().trim().min(10),
    fundamentoInterno: z.string().trim().nullable(),
    sufixoDaChave: z.string().trim().min(1),
    criadoPor: z.string().min(1),
  })
  .strict();

export type DecidirRecursoDeAcessoInput = z.input<typeof zDecidirRecursoDeAcesso>;

/**
 * DECIDE o recurso.
 *
 * ⚠️ A INTERPOSIÇÃO ENTRA POR AQUI TAMBÉM, e de propósito: interpor é ato do REQUERENTE, que
 * não tem crachá nenhum — quem o registra é o servidor que o recebe, sob a ação de decidir o
 * recurso, porque é o mesmo setor recursal que protocola a peça. Quem responde não julga o
 * próprio ato: é isso que separa `RESPONDER_` de `DECIDIR_RECURSO_`.
 */
export async function decidirRecursoDeAcesso(
  prisma: PrismaClient,
  input: DecidirRecursoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zDecidirRecursoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.decidirRecursoDeAcesso, {
      setor: estado.setorAberturaId,
    });
    return gravarFato(
      tx,
      estado,
      {
        natureza: "RECURSO_DECIDIDO",
        resultadoDoRecurso: d.resultado,
        mensagemAoRequerente: d.mensagemAoRequerente,
        fundamentoInterno: d.fundamentoInterno,
      },
      d.criadoPor,
      chaveDoComando(d.pedidoId, "RECURSO_DECIDIDO", d.sufixoDaChave),
      new Date(),
    );
  });
}

/** INTERPÕE o recurso — sob a mesma ação do setor recursal. Ver a nota de `decidirRecursoDeAcesso`. */
export async function interporRecursoDeAcesso(
  prisma: PrismaClient,
  input: InterporRecursoDeAcessoInput,
): Promise<{ readonly fatoId: string; readonly repetido: boolean }> {
  const d = zInterporRecursoDeAcesso.parse(input);

  return prisma.$transaction(async (tx) => {
    await travar(tx, "PedidoDeAcessoAInformacao", [d.pedidoId]);
    const estado = await carregarPedido(tx, d.pedidoId);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.interporRecursoDeAcesso, {
      setor: estado.setorAberturaId,
    });
    return gravarFato(
      tx,
      estado,
      { natureza: "RECURSO_INTERPOSTO", mensagemAoRequerente: d.razoes },
      d.criadoPor,
      chaveDoComando(d.pedidoId, "RECURSO_INTERPOSTO", d.sufixoDaChave),
      new Date(),
    );
  });
}
