import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { TODAS_AS_COLUNAS, type ColunaDoDemonstrativo } from "./publicacao-de-pessoal.js";

/**
 * ═══ OS TRÊS ATOS DA POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2) ═══
 *
 * ⚠️ REDIGIR E APROVAR SÃO ATOS SEPARADOS, e aqui a razão é mais forte do que na versão de
 * rubrica: o que esta política autoriza é expor dado pessoal de cada servidor num portal aberto,
 * sem cadastro. Um ato só faria de quem redige o texto o autor da decisão de expor, e do
 * aprovador um campo sem significado.
 *
 * ⚠️ A POLÍTICA NASCE RASCUNHO E NÃO PUBLICA NADA. Enquanto não houver uma APROVADA vigente, o
 * demonstrativo individual mostra zero linhas e diz por quê.
 */

const zCompetencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência no formato AAAA-MM");
const zColuna = z.enum(TODAS_AS_COLUNAS as [ColunaDoDemonstrativo, ...ColunaDoDemonstrativo[]]);

export class PoliticaNaoEncontradaError extends Error {
  constructor(id: string) {
    super(`POLITICA-INEXISTENTE: a política ${id} não existe. Nada foi gravado.`);
    this.name = "PoliticaNaoEncontradaError";
  }
}

export class SituacaoImpedeError extends Error {
  constructor(esperada: string, atual: string, ato: string) {
    super(`SITUACAO-IMPEDE: ${ato} exige política ${esperada}; esta está ${atual}. Nada foi gravado.`);
    this.name = "SituacaoImpedeError";
  }
}

export class AprovacaoPeloProprioAutorError extends Error {
  constructor() {
    super(
      "APROVACAO-PELO-PROPRIO-AUTOR: quem redigiu a política de publicação não a aprova. Ela autoriza expor remuneração nominal de cada servidor no portal aberto — a revisão por outra pessoa é o que separa uma decisão do ente de uma configuração de tela. Nada foi gravado.",
    );
    this.name = "AprovacaoPeloProprioAutorError";
  }
}

export class VigenciaInvalidaError extends Error {
  constructor(motivo: string) {
    super(`VIGENCIA-INVALIDA: ${motivo} Nada foi gravado.`);
    this.name = "VigenciaInvalidaError";
  }
}

/** O mês anterior a uma competência AAAA-MM. Janeiro recua para dezembro do ano anterior. */
export function competenciaAnterior(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return mes === 1 ? `${ano - 1}-12` : `${ano}-${String(mes - 1).padStart(2, "0")}`;
}

export const zCadastrarPoliticaInput = z
  .object({
    competenciaInicio: zCompetencia,
    competenciaFim: zCompetencia.nullable().optional(),
    fundamentacaoLegal: z.string().trim().min(10, "a fundamentação é o ato que autoriza a exposição; um texto de dez caracteres não é ato"),
    // ⚠️ AO MENOS UMA COLUNA. Uma política que não declara nada é indistinguível de não haver
    // política — e faria a tela dizer "publicado sob a política 3" mostrando um vazio.
    colunas: z.array(zColuna).min(1, "declare ao menos uma coluna publicável, ou não crie a política"),
    criadoPor: z.string().min(1),
  })
  .strict();
export type CadastrarPoliticaInput = z.input<typeof zCadastrarPoliticaInput>;

export const zAprovarPoliticaInput = z.object({ politicaId: z.string().min(1), aprovadoPor: z.string().min(1) }).strict();
export const zRevogarPoliticaInput = z
  .object({ politicaId: z.string().min(1), motivo: z.string().trim().min(10), revogadoPor: z.string().min(1) })
  .strict();

export async function cadastrarPoliticaDePessoal(
  prisma: PrismaClient,
  input: CadastrarPoliticaInput,
): Promise<{ readonly politicaId: string; readonly versao: number }> {
  const d = zCadastrarPoliticaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarPoliticaDePessoal, "ENTE");
    if (d.competenciaFim !== null && d.competenciaFim !== undefined && d.competenciaFim < d.competenciaInicio) {
      throw new VigenciaInvalidaError(`o fim ${d.competenciaFim} é anterior ao início ${d.competenciaInicio}.`);
    }
    const ultima = await tx.politicaDePublicacaoDePessoal.findFirst({ orderBy: { versao: "desc" }, select: { versao: true } });
    const versao = (ultima?.versao ?? 0) + 1;
    const p = await tx.politicaDePublicacaoDePessoal.create({
      data: {
        versao,
        competenciaInicio: d.competenciaInicio,
        competenciaFim: d.competenciaFim ?? null,
        fundamentacaoLegal: d.fundamentacaoLegal,
        situacao: "RASCUNHO",
        criadoPor: d.criadoPor,
        colunas: { create: [...new Set(d.colunas)].map((c) => ({ coluna: c })) },
      },
      select: { id: true, versao: true },
    });
    return { politicaId: p.id, versao: p.versao };
  });
}

export async function aprovarPoliticaDePessoal(
  prisma: PrismaClient,
  input: z.input<typeof zAprovarPoliticaInput>,
): Promise<{ readonly politicaId: string; readonly anteriorFechadaEm: string | null }> {
  const d = zAprovarPoliticaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.aprovadoPor, ACAO_DO_SERVICO.aprovarPoliticaDePessoal, "ENTE");
    const p = await tx.politicaDePublicacaoDePessoal.findUnique({
      where: { id: d.politicaId },
      select: { id: true, versao: true, situacao: true, criadoPor: true, competenciaInicio: true },
    });
    if (p === null) throw new PoliticaNaoEncontradaError(d.politicaId);
    if (p.situacao !== "RASCUNHO") throw new SituacaoImpedeError("RASCUNHO", p.situacao, "aprovar");
    if (p.criadoPor === d.aprovadoPor) throw new AprovacaoPeloProprioAutorError();

    // ⚠️ APROVAR A SUCESSORA FECHA A ANTECESSORA. Sem isto, duas políticas vigeriam na mesma
    // competência e o demonstrativo recusaria por ambiguidade no dia da consulta — longe daqui.
    const abertas = await tx.politicaDePublicacaoDePessoal.findMany({
      where: { situacao: "APROVADA", id: { not: p.id }, OR: [{ competenciaFim: null }, { competenciaFim: { gte: p.competenciaInicio } }] },
      select: { id: true, versao: true, competenciaInicio: true },
    });
    const fim = competenciaAnterior(p.competenciaInicio);
    for (const a of abertas) {
      if (a.competenciaInicio >= p.competenciaInicio) {
        throw new VigenciaInvalidaError(`a política ${a.versao} já vale desde ${a.competenciaInicio}, que não é anterior a ${p.competenciaInicio}; ela teria de ser revogada antes.`);
      }
      await tx.politicaDePublicacaoDePessoal.update({ where: { id: a.id }, data: { competenciaFim: fim } });
    }

    await tx.politicaDePublicacaoDePessoal.update({
      where: { id: p.id },
      data: { situacao: "APROVADA", aprovadoPor: d.aprovadoPor, aprovadoEm: new Date() },
    });
    return { politicaId: p.id, anteriorFechadaEm: abertas.length === 0 ? null : fim };
  });
}

export async function revogarPoliticaDePessoal(
  prisma: PrismaClient,
  input: z.input<typeof zRevogarPoliticaInput>,
): Promise<{ readonly politicaId: string }> {
  const d = zRevogarPoliticaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.revogadoPor, ACAO_DO_SERVICO.revogarPoliticaDePessoal, "ENTE");
    const p = await tx.politicaDePublicacaoDePessoal.findUnique({ where: { id: d.politicaId }, select: { id: true, situacao: true } });
    if (p === null) throw new PoliticaNaoEncontradaError(d.politicaId);
    if (p.situacao === "REVOGADA") throw new SituacaoImpedeError("RASCUNHO ou APROVADA", p.situacao, "revogar");
    // ⚠️ REVOGAR É FATO, NÃO APAGAMENTO — e aqui ele tem efeito imediato e forte: revogada a
    // política, o demonstrativo individual VOLTA A NÃO PUBLICAR NADA. É o caminho pela tela para
    // o ente parar de expor, sem depender de ninguém apagar registro.
    await tx.politicaDePublicacaoDePessoal.update({
      where: { id: p.id },
      data: { situacao: "REVOGADA", revogadoPor: d.revogadoPor, revogadoEm: new Date(), motivoDaRevogacao: d.motivo },
    });
    return { politicaId: p.id };
  });
}
