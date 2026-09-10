import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { nomeSeguroNoZip, ziparEntradas } from "../../packages/zip/index.js";
import { podeVerProcesso } from "../m21-protocolo/consultas.js";
import { baixarAnexo, podeVerComunicado } from "./anexos.js";
import { lerArquivo } from "./armazenamento.js";

/**
 * M22 — AS LEITURAS DOS ANEXOS: a lista e o lote.
 *
 * ═══ ⚠️ A REGRA DE ACESSO É A MESMA DO `baixarAnexo`, E ISSO NÃO É REPETIÇÃO ═══
 * A lista pergunta ao REGISTRO DONO se o usuário pode vê-lo — a mesma pergunta, à mesma
 * função (`podeVerProcesso`, do M21). Não há uma segunda regra aqui.
 *
 * A divergência que isso evita é concreta e já tem nome: a tela do processo sigiloso
 * some da caixa, e a LISTA de anexos continua enumerando os arquivos dele para quem tiver
 * o identificador. Enumerar já é vazamento — os nomes dos arquivos de um processo
 * disciplinar contam a história inteira sem que ninguém baixe nada.
 *
 * ⚠️ E O LOTE NÃO É UM ATALHO PARA FORA DA REGRA. Ele monta o zip com os arquivos que
 * `baixarAnexo` entregaria UM A UM, passando por ele. Um lote que consultasse a tabela
 * direto seria exatamente a segunda verdade que este módulo recusa desde o cabeçalho do
 * schema — e ela vazaria em bloco, que é pior.
 */

export interface AnexoNaLista {
  readonly id: string;
  readonly nome: string;
  readonly mimeType: string;
  readonly tamanhoBytes: number;
  readonly sha256: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  /** De onde ele pende: o processo em si ou um movimento da linha do tempo. */
  readonly origem: "PROCESSO" | "MOVIMENTO";
  /** O rótulo do movimento, quando o anexo pende de um. */
  readonly movimento: string | null;
}

/**
 * OS ANEXOS DE UM PROCESSO — os do processo e os dos movimentos, numa lista só.
 *
 * ⚠️ SEM PERMISSÃO, LISTA VAZIA — nunca um erro. É a mesma escolha do `baixarAnexo`, pelo
 * mesmo motivo: uma resposta que distinguisse "não existe" de "não pode" transformaria a
 * tela num oráculo de quais processos existem.
 */
export async function listarAnexosDoProcesso(
  prisma: PrismaClient,
  processoId: string,
  usuarioIdent: string
): Promise<readonly AnexoNaLista[]> {
  const visao = await podeVerProcesso(prisma, processoId, usuarioIdent);
  if (!visao.pode) return [];

  const anexos = await prisma.anexo.findMany({
    where: {
      OR: [{ processoId }, { movimentoProcesso: { processoId } }],
    },
    select: {
      id: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      sha256: true,
      criadoEm: true,
      criadoPor: true,
      processoId: true,
      movimentoProcesso: { select: { tipo: true, criadoEm: true } },
    },
    orderBy: { criadoEm: "asc" },
  });

  return anexos.map((a) => ({
    id: a.id,
    nome: a.nomeOriginal,
    mimeType: a.mimeType,
    tamanhoBytes: a.tamanhoBytes,
    sha256: a.sha256,
    criadoEm: a.criadoEm,
    criadoPor: a.criadoPor,
    origem: a.processoId !== null ? ("PROCESSO" as const) : ("MOVIMENTO" as const),
    movimento: a.movimentoProcesso?.tipo ?? null,
  }));
}

/**
 * OS ANEXOS DE UMA PESSOA.
 *
 * ⚠️ O CADASTRO DE PESSOAS É COMPARTILHADO (M19), e a regra de acesso dele é a do ENTE:
 * qualquer usuário ATIVO lê. Não é frouxidão — é a mesma regra que a tela da pessoa já
 * aplica ao nome, ao documento e ao histórico. Um anexo com regra MAIS restrita que a
 * ficha a que ele pertence seria uma promessa que a própria tela ao lado desmente.
 *
 * (Um dia em que o cadastro de pessoas ganhar sigilo por registro, ele ganha AQUI e no
 * `baixarAnexo` ao mesmo tempo — as duas chamam a mesma função, como o processo faz.)
 */
export async function listarAnexosDaPessoa(
  prisma: PrismaClient,
  pessoaId: string,
  usuarioIdent: string
): Promise<readonly AnexoNaLista[]> {
  const u = await prisma.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: { ativo: true },
  });
  if (u === null || !u.ativo) return [];

  const anexos = await prisma.anexo.findMany({
    where: { pessoaId },
    select: {
      id: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      sha256: true,
      criadoEm: true,
      criadoPor: true,
    },
    orderBy: { criadoEm: "asc" },
  });

  return anexos.map((a) => ({
    id: a.id,
    nome: a.nomeOriginal,
    mimeType: a.mimeType,
    tamanhoBytes: a.tamanhoBytes,
    sha256: a.sha256,
    criadoEm: a.criadoEm,
    criadoPor: a.criadoPor,
    origem: "PROCESSO" as const,
    movimento: null,
  }));
}

/** Os anexos de um comunicado — a regra de acesso é a do M23 (`podeVerComunicado`). */
export async function listarAnexosDoComunicado(
  prisma: PrismaClient,
  comunicadoId: string,
  usuarioIdent: string
): Promise<readonly AnexoNaLista[]> {
  if (!(await podeVerComunicado(prisma, comunicadoId, usuarioIdent))) return [];

  const anexos = await prisma.anexo.findMany({
    where: { comunicadoId },
    select: {
      id: true,
      nomeOriginal: true,
      mimeType: true,
      tamanhoBytes: true,
      sha256: true,
      criadoEm: true,
      criadoPor: true,
    },
    orderBy: { criadoEm: "asc" },
  });

  return anexos.map((a) => ({
    id: a.id,
    nome: a.nomeOriginal,
    mimeType: a.mimeType,
    tamanhoBytes: a.tamanhoBytes,
    sha256: a.sha256,
    criadoEm: a.criadoEm,
    criadoPor: a.criadoPor,
    origem: "PROCESSO" as const,
    movimento: null,
  }));
}

/**
 * ⚠️ O TETO DO LOTE — 200 MB descomprimidos, e ele existe porque o zip é montado NA
 * MEMÓRIA do servidor.
 *
 * Sem teto, um processo com trezentos anexos de 25 MB derruba o processo do Node com um
 * out-of-memory — e não só para quem pediu o download: para TODOS os usuários daquele
 * servidor. Um limite nomeado transforma um incidente de disponibilidade numa mensagem
 * que diz o que fazer.
 */
export const TETO_DO_LOTE_BYTES = 200 * 1024 * 1024;

export interface LoteDeAnexos {
  readonly nome: string;
  readonly zip: Buffer;
  readonly arquivos: number;
}

/**
 * O LOTE DE UM PROCESSO — um .zip com os anexos que ESTE usuário pode baixar.
 *
 * ⚠️ ELE PASSA PELO `lerArquivo`, QUE CONFERE O HASH DE CADA ARQUIVO. Um anexo trocado no
 * disco derruba o lote inteiro, com o nome do arquivo — em vez de entrar no zip
 * silenciosamente como se fosse o original. A integridade não pode valer só no download
 * individual: seria uma porta dos fundos com a mesma aparência da porta da frente.
 *
 * ⚠️ E ELE DEVOLVE `null` QUANDO NÃO HÁ NADA A ENTREGAR — sem permissão ou sem anexos. A
 * rota traduz isso em 404, pelo mesmo motivo de sempre: 403 confirmaria a existência.
 */
export async function loteDeAnexosDoProcesso(
  prisma: PrismaClient,
  processoId: string,
  usuarioIdent: string
): Promise<LoteDeAnexos | null> {
  const lista = await listarAnexosDoProcesso(prisma, processoId, usuarioIdent);
  if (lista.length === 0) return null;

  const total = lista.reduce((s, a) => s + a.tamanhoBytes, 0);
  if (total > TETO_DO_LOTE_BYTES) {
    const mb = (total / 1024 / 1024).toFixed(0);
    throw new Error(
      `O lote deste processo tem ${mb} MB em ${lista.length} arquivos, e o limite é de ` +
        `${TETO_DO_LOTE_BYTES / 1024 / 1024} MB — o zip é montado na memória do servidor, ` +
        `e um lote maior derrubaria o processo para todos os usuários, não só para quem ` +
        `pediu. Baixe os arquivos individualmente.`
    );
  }

  const p = await prisma.processo.findUnique({
    where: { id: processoId },
    select: { numero: true, exercicio: { select: { ano: true } } },
  });
  if (p === null) return null;

  const entradas = await Promise.all(
    lista.map(async (a, i) => ({
      nome: nomeSeguroNoZip(i + 1, a.nome),
      conteudo: await lerArquivo(a.id, a.sha256),
    }))
  );

  return {
    nome: `processo-${p.numero}-${p.exercicio.ano}-anexos.zip`,
    zip: ziparEntradas(entradas),
    arquivos: entradas.length,
  };
}

/**
 * O LOTE DE UMA PESSOA. Mesma anatomia do lote do processo; a diferença é só de quem
 * responde "pode?" — ver `listarAnexosDaPessoa`.
 */
export async function loteDeAnexosDaPessoa(
  prisma: PrismaClient,
  pessoaId: string,
  usuarioIdent: string
): Promise<LoteDeAnexos | null> {
  const lista = await listarAnexosDaPessoa(prisma, pessoaId, usuarioIdent);
  if (lista.length === 0) return null;

  const total = lista.reduce((s, a) => s + a.tamanhoBytes, 0);
  if (total > TETO_DO_LOTE_BYTES) {
    const mb = (total / 1024 / 1024).toFixed(0);
    throw new Error(
      `O lote desta pessoa tem ${mb} MB em ${lista.length} arquivos, e o limite é de ` +
        `${TETO_DO_LOTE_BYTES / 1024 / 1024} MB — o zip é montado na memória do servidor. ` +
        `Baixe os arquivos individualmente.`
    );
  }

  const pessoa = await prisma.pessoa.findUnique({
    where: { id: pessoaId },
    select: { documento: true },
  });
  if (pessoa === null) return null;

  const entradas = await Promise.all(
    lista.map(async (a, i) => ({
      nome: nomeSeguroNoZip(i + 1, a.nome),
      conteudo: await lerArquivo(a.id, a.sha256),
    }))
  );

  return {
    nome: `pessoa-${pessoa.documento}-anexos.zip`,
    zip: ziparEntradas(entradas),
    arquivos: entradas.length,
  };
}

/**
 * ⚠️ REEXPORTADO DE PROPÓSITO. A rota de download individual e a de lote são vizinhas, e
 * quem for editá-las deve encontrar as duas leituras no mesmo import — não uma aqui e a
 * outra num módulo que parece só de escrita.
 */
export { baixarAnexo };
