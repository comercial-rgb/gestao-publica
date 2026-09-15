import { createHash } from "node:crypto";
import { z } from "zod";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { titularidadeDoUsuario } from "./servico.js";

/**
 * ═══ M21 — A AVALIAÇÃO DOS SERVIÇOS DA CARTA (V7 M1 U4) ═══
 *
 * As três dimensões pedidas — SATISFAÇÃO, ATENDIMENTO e CUMPRIMENTO DE PRAZOS/COMPROMISSOS — com nota
 * na escala da METODOLOGIA VIGENTE, e a DESCRIÇÃO livre, que é privada (vai à moderação, não ao público).
 *
 * ⚠️ DUAS ORIGENS QUE NÃO SE SOMAM: quem foi ATENDIDO avalia a própria solicitação decidida, pela conta
 * do titular (ou de quem o representa HOJE); a OPINIÃO GERAL sobre o serviço vem sem conta. O resultado
 * público mostra cada origem com o seu próprio número de respostas.
 * ⚠️ REVISAR NÃO É VOTAR DE NOVO: a revisão é linha nova encadeada à anterior (`revisaoDeId` único); o
 * resultado conta só a última de cada cadeia. A raiz é única por (serviço, avaliador) no banco.
 * ⚠️ ESCALA MUDA POR VERSÃO: o resultado usa só as respostas da metodologia vigente e diz quantas
 * ficaram de fora por pertencerem a outra versão — notas de escalas diferentes não se misturam.
 * ⚠️ REMOVER exige motivo (abuso ou dado pessoal) e o público vê quantas foram removidas.
 */

export const QUOTA_DE_OPINIOES_SEM_CONTA_POR_HORA = 10;

const sha256 = (texto: string): string => createHash("sha256").update(texto).digest("hex");

const zRotulo = z.object({ nota: z.number().int(), rotulo: z.string().trim().min(1).max(40) });

export const zCadastrarMetodologiaDeAvaliacao = z.object({
  escalaMinima: z.number().int().min(0),
  escalaMaxima: z.number().int().max(10),
  rotulos: z.array(zRotulo).min(2),
  descricaoDoMetodo: z.string().trim().min(20),
  periodoMeses: z.number().int().min(1).max(60),
  criadoPor: z.string().min(1),
});
export type CadastrarMetodologiaDeAvaliacaoInput = z.input<typeof zCadastrarMetodologiaDeAvaliacao>;

/** Uma NOVA versão da metodologia — a anterior continua registrada, com as avaliações feitas nela. */
export async function cadastrarMetodologiaDeAvaliacao(prisma: PrismaClient, input: CadastrarMetodologiaDeAvaliacaoInput): Promise<{ readonly metodologiaId: string; readonly versao: number }> {
  const d = zCadastrarMetodologiaDeAvaliacao.parse(input);
  if (d.escalaMaxima <= d.escalaMinima) throw new Error("ESCALA-INVALIDA: a nota máxima precisa ser maior que a mínima. Nada foi gravado.");
  const pontos = new Set(d.rotulos.map((r) => r.nota));
  for (let n = d.escalaMinima; n <= d.escalaMaxima; n += 1) {
    if (!pontos.has(n)) throw new Error(`ROTULO-AUSENTE: todo ponto da escala precisa de rótulo, e falta o da nota ${n}. Nada foi gravado.`);
  }
  if (d.rotulos.length !== pontos.size || d.rotulos.some((r) => r.nota < d.escalaMinima || r.nota > d.escalaMaxima)) {
    throw new Error("ROTULO-FORA-DA-ESCALA: há rótulo repetido ou de nota fora da escala. Nada foi gravado.");
  }
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarMetodologiaDeAvaliacao, "ENTE");
      const ultima = await tx.metodologiaDeAvaliacao.findFirst({ orderBy: { versao: "desc" }, select: { versao: true } });
      const versao = (ultima?.versao ?? 0) + 1;
      const m = await tx.metodologiaDeAvaliacao.create({
        data: { versao, escalaMinima: d.escalaMinima, escalaMaxima: d.escalaMaxima, rotulos: [...d.rotulos].sort((a, b) => a.nota - b.nota), descricaoDoMetodo: d.descricaoDoMetodo, periodoMeses: d.periodoMeses, criadoPor: d.criadoPor },
        select: { id: true },
      });
      return { metodologiaId: m.id, versao };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("METODOLOGIA-CONCORRENTE: outra versão da metodologia foi gravada no mesmo instante. Confira e tente de novo. Nada foi gravado.");
    throw e;
  }
}

const zNotas = { satisfacao: z.number().int(), atendimento: z.number().int(), prazos: z.number().int(), descricao: z.string().trim().max(2000).optional() };

async function metodologiaVigente(tx: Tx) {
  const m = await tx.metodologiaDeAvaliacao.findFirst({ orderBy: { versao: "desc" }, select: { id: true, escalaMinima: true, escalaMaxima: true } });
  if (m === null) throw new Error("SEM-METODOLOGIA: a avaliação ainda não foi aberta — não há metodologia publicada. Nada foi gravado.");
  return m;
}

function exigirNaEscala(m: { escalaMinima: number; escalaMaxima: number }, notas: { satisfacao: number; atendimento: number; prazos: number }): void {
  for (const [nome, v] of [["satisfação", notas.satisfacao], ["atendimento", notas.atendimento], ["cumprimento de prazos", notas.prazos]] as const) {
    if (v < m.escalaMinima || v > m.escalaMaxima) throw new Error(`NOTA-FORA-DA-ESCALA: a nota de ${nome} precisa estar entre ${m.escalaMinima} e ${m.escalaMaxima}. Nada foi gravado.`);
  }
}

/** A última avaliação da cadeia deste avaliador neste serviço (ou `null`, se é a primeira). */
async function ultimaDaCadeia(tx: Tx, servicoId: string, chaveDoAvaliador: string): Promise<{ readonly id: string } | null> {
  return tx.avaliacaoDeServico.findFirst({ where: { servicoId, chaveDoAvaliador, revisadaPor: { is: null } }, select: { id: true } });
}

async function gravarNaCadeia(
  tx: Tx,
  dados: { servicoId: string; metodologiaId: string; origem: "ATENDIMENTO_COMPROVADO" | "OPINIAO_GERAL"; solicitacaoId: string | null; chaveDoAvaliador: string; satisfacao: number; atendimento: number; prazos: number; descricao: string | null; criadoPor: string | null }
): Promise<{ readonly avaliacaoId: string; readonly revisao: boolean }> {
  const anterior = await ultimaDaCadeia(tx, dados.servicoId, dados.chaveDoAvaliador);
  const a = await tx.avaliacaoDeServico.create({ data: { ...dados, revisaoDeId: anterior?.id ?? null }, select: { id: true } });
  return { avaliacaoId: a.id, revisao: anterior !== null };
}

const concorrencia = (e: unknown): never => {
  if ((e as { code?: string }).code === "P2002") throw new Error("AVALIACAO-CONCORRENTE: outra avaliação deste mesmo avaliador foi gravada no mesmo instante. Recarregue e revise, se quiser. Nada foi gravado.");
  throw e;
};

export const zAvaliarAtendimento = z.object({ solicitacaoId: z.string().min(1), ...zNotas, criadoPor: z.string().min(1) });
export type AvaliarAtendimentoInput = z.input<typeof zAvaliarAtendimento>;

/**
 * AVALIA O ATENDIMENTO RECEBIDO — só a solicitação DECIDIDA, só pela conta do titular ou de quem o
 * representa HOJE (representação revogada não avalia). Avaliar de novo é revisão.
 */
export async function avaliarAtendimento(prisma: PrismaClient, input: AvaliarAtendimentoInput): Promise<{ readonly avaliacaoId: string; readonly revisao: boolean }> {
  const d = zAvaliarAtendimento.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.avaliarAtendimento, "ENTE");
      const s = await tx.solicitacaoDeServico.findUnique({ where: { id: d.solicitacaoId }, select: { id: true, titularId: true, decisao: { select: { id: true } }, versao: { select: { servicoId: true } } } });
      if (s === null) throw new Error(`Solicitação ${d.solicitacaoId} não existe. Nada foi gravado.`);
      if ((await titularidadeDoUsuario(tx, d.criadoPor, s.titularId, new Date())) === null) throw new Error("SEM-ACESSO-A-SOLICITACAO: esta solicitação não é sua nem de quem você representa hoje. Nada foi gravado.");
      if (s.decisao === null) throw new Error("SOLICITACAO-SEM-DECISAO: o atendimento só pode ser avaliado depois da decisão. Nada foi gravado.");
      const m = await metodologiaVigente(tx);
      exigirNaEscala(m, d);
      return gravarNaCadeia(tx, {
        servicoId: s.versao.servicoId, metodologiaId: m.id, origem: "ATENDIMENTO_COMPROVADO", solicitacaoId: s.id, chaveDoAvaliador: `sol:${s.id}`,
        satisfacao: d.satisfacao, atendimento: d.atendimento, prazos: d.prazos, descricao: d.descricao ?? null, criadoPor: d.criadoPor,
      });
    });
  } catch (e) {
    return concorrencia(e);
  }
}

export const zOpinarSobreServico = z.object({
  slug: z.string().min(1),
  /** Token aleatório do navegador (cookie), nunca identificador pessoal. O banco guarda o sha256. */
  token: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
  ...zNotas,
  chaveDeQuota: z.string().regex(/^[0-9a-f]{64}$/),
});
export type OpinarSobreServicoInput = z.input<typeof zOpinarSobreServico>;

/**
 * A OPINIÃO GERAL SEM CONTA — ATO PÚBLICO. Serviço publicado, metodologia vigente, quota local por
 * origem e uma cadeia por token. Não prova atendimento e é contada à parte.
 */
export async function opinarSobreServico(prisma: PrismaClient, input: OpinarSobreServicoInput): Promise<{ readonly avaliacaoId: string; readonly revisao: boolean }> {
  const d = zOpinarSobreServico.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      const recentes = await tx.envioPublicoSemConta.count({ where: { chave: d.chaveDeQuota, criadoEm: { gte: new Date(Date.now() - 3600_000) } } });
      if (recentes >= QUOTA_DE_OPINIOES_SEM_CONTA_POR_HORA) throw new Error("QUOTA-DE-ENVIOS: muitos envios desta origem na última hora. Tente mais tarde. Nada foi gravado.");
      const servico = await tx.servicoDaCarta.findFirst({ where: { slug: d.slug, versoes: { some: { publicacao: { isNot: null } } } }, select: { id: true } });
      if (servico === null) throw new Error("SERVICO-NAO-PUBLICADO: não há serviço publicado neste endereço. Nada foi gravado.");
      const m = await metodologiaVigente(tx);
      exigirNaEscala(m, d);
      const r = await gravarNaCadeia(tx, {
        servicoId: servico.id, metodologiaId: m.id, origem: "OPINIAO_GERAL", solicitacaoId: null, chaveDoAvaliador: sha256(`opiniao:${d.token}`),
        satisfacao: d.satisfacao, atendimento: d.atendimento, prazos: d.prazos, descricao: d.descricao ?? null, criadoPor: null,
      });
      await tx.envioPublicoSemConta.create({ data: { chave: d.chaveDeQuota, finalidade: "OPINIAO" } });
      return r;
    });
  } catch (e) {
    return concorrencia(e);
  }
}

export const zRemoverAvaliacao = z.object({ avaliacaoId: z.string().min(1), motivo: z.enum(["ABUSO", "DADOS_PESSOAIS"]), justificativa: z.string().trim().min(10), criadoPor: z.string().min(1) });
export type RemoverAvaliacaoInput = z.input<typeof zRemoverAvaliacao>;

/** A MODERAÇÃO — abuso ou dado pessoal, com justificativa. Discordância não é motivo. */
export async function removerAvaliacao(prisma: PrismaClient, input: RemoverAvaliacaoInput): Promise<{ readonly remocaoId: string }> {
  const d = zRemoverAvaliacao.parse(input);
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.removerAvaliacao, "ENTE");
      const a = await tx.avaliacaoDeServico.findUnique({ where: { id: d.avaliacaoId }, select: { id: true } });
      if (a === null) throw new Error(`Avaliação ${d.avaliacaoId} não existe. Nada foi gravado.`);
      return { remocaoId: (await tx.remocaoDeAvaliacao.create({ data: { avaliacaoId: a.id, motivo: d.motivo, justificativa: d.justificativa, criadoPor: d.criadoPor }, select: { id: true } })).id };
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new Error("AVALIACAO-JA-REMOVIDA: esta avaliação já foi removida. Nada foi gravado.");
    throw e;
  }
}

export interface ResultadoDaOrigem {
  readonly respostas: number;
  /** Médias com uma casa, em texto (`"4,5"`); `null` sem respostas. */
  readonly satisfacao: string | null;
  readonly atendimento: string | null;
  readonly prazos: string | null;
}

export type ResultadoPublicoDasAvaliacoes =
  | { readonly situacao: "SEM-METODOLOGIA" }
  | {
      readonly situacao: "PUBLICADO";
      readonly metodologia: { readonly versao: number; readonly escalaMinima: number; readonly escalaMaxima: number; readonly descricaoDoMetodo: string; readonly periodoMeses: number };
      readonly periodo: { readonly de: Date; readonly ate: Date };
      readonly atendimentoComprovado: ResultadoDaOrigem;
      readonly opiniaoGeral: ResultadoDaOrigem;
      readonly removidas: number;
      readonly deOutraMetodologia: number;
    };

/** Média com uma casa decimal, arredondada meio-para-cima, em inteiros (sem ponto flutuante). */
export function mediaComUmaCasa(soma: number, n: number): string | null {
  if (n === 0) return null;
  const decimos = Math.floor((soma * 20 + n) / (2 * n));
  return `${Math.floor(decimos / 10)},${decimos % 10}`;
}

/**
 * Início da janela: o DIA CIVIL do ente `meses` meses antes do dia civil de `agora` (limitado ao fim do mês),
 * às 00:00 do ente. ⚠️ Por dia civil, não por UTC: a avaliação das 22h do último dia do mês é daquele mês
 * para o ente, e a janela não pode deixá-la de fora por Greenwich (achado do `data-civil.test.ts`).
 */
export function inicioDaJanela(agora: Date, meses: number): Date {
  const [ano, mes, dia] = diaCivil(agora).split("-").map(Number) as [number, number, number];
  const total = ano * 12 + (mes - 1) - meses;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const ultimo = [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] as number;
  return inicioDoDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`);
}

/**
 * O RESULTADO PÚBLICO de um serviço — LEITURA pública agregada: nenhum autor, nenhuma descrição.
 * Conta a última avaliação de cada cadeia, feita na janela e na metodologia vigente, não removida.
 */
export async function resultadoPublicoDasAvaliacoes(prisma: PrismaClient, servicoId: string, agora: Date = new Date()): Promise<ResultadoPublicoDasAvaliacoes> {
  const m = await prisma.metodologiaDeAvaliacao.findFirst({ orderBy: { versao: "desc" }, select: { id: true, versao: true, escalaMinima: true, escalaMaxima: true, descricaoDoMetodo: true, periodoMeses: true } });
  if (m === null) return { situacao: "SEM-METODOLOGIA" };
  const de = inicioDaJanela(agora, m.periodoMeses);
  const folhas = await prisma.avaliacaoDeServico.findMany({
    where: { servicoId, revisadaPor: { is: null }, criadoEm: { gte: de, lte: agora } },
    select: { origem: true, metodologiaId: true, satisfacao: true, atendimento: true, prazos: true, remocao: { select: { id: true } } },
  });
  const validas = folhas.filter((a) => a.remocao === null);
  const daVigente = validas.filter((a) => a.metodologiaId === m.id);
  const porOrigem = (origem: "ATENDIMENTO_COMPROVADO" | "OPINIAO_GERAL"): ResultadoDaOrigem => {
    const xs = daVigente.filter((a) => a.origem === origem);
    const soma = (f: (a: (typeof xs)[number]) => number) => xs.reduce((t, a) => t + f(a), 0);
    return { respostas: xs.length, satisfacao: mediaComUmaCasa(soma((a) => a.satisfacao), xs.length), atendimento: mediaComUmaCasa(soma((a) => a.atendimento), xs.length), prazos: mediaComUmaCasa(soma((a) => a.prazos), xs.length) };
  };
  return {
    situacao: "PUBLICADO",
    metodologia: { versao: m.versao, escalaMinima: m.escalaMinima, escalaMaxima: m.escalaMaxima, descricaoDoMetodo: m.descricaoDoMetodo, periodoMeses: m.periodoMeses },
    periodo: { de, ate: agora },
    atendimentoComprovado: porOrigem("ATENDIMENTO_COMPROVADO"),
    opiniaoGeral: porOrigem("OPINIAO_GERAL"),
    removidas: folhas.length - validas.length,
    deOutraMetodologia: validas.length - daVigente.length,
  };
}
