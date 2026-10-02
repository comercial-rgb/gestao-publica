import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil } from "../../packages/datas/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { OBJETIVO_MILENIO_2026 } from "./objetivos-da-agenda-2030.js";

/**
 * ═══ A DECLARAÇÃO DO PROGRAMA E DA AÇÃO PARA A PRESTAÇÃO DE CONTAS (V26) ═══
 *
 * O SAGRES pede, de cada programa do orçamento, a denominação, o objetivo e o código do objetivo da Agenda 2030
 * (tabela §5.27) — todos obrigatórios (§4.2); de cada ação, a denominação e, opcionais, a meta e a unidade de medida
 * (§4.3). O projeto da LOA (§4.41) exige meta e unidade: a validação daquele arquivo é outra, e mora no gerador dele.
 *
 * Os dados vêm do PPA, do projeto ou da LOA e das leis que os alteram — o sistema não deduz objetivo do nome do
 * programa nem preenche um código genérico para o arquivo passar.
 *
 * ⚠️ VERSIONADA, como a declaração da unidade (`declaracao-da-unidade.ts`): a vigente num corte é a de maior
 * `vigenteDesde` até ele, pelo dia civil; empate, a gravada por último.
 */

const texto = (max: number, campo: string) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${campo}.`)
    .max(max, `${campo[0]?.toUpperCase() ?? ""}${campo.slice(1)} vai à prestação de contas em até ${max} caracteres.`)
    .refine((t) => !/["\u0000-\u001f]/.test(t), `${campo[0]?.toUpperCase() ?? ""}${campo.slice(1)} não pode ter aspas nem quebra de linha.`);

const zFundamento = z
  .string()
  .trim()
  .min(10, "Diga de onde vem a informação (PPA, LOA, lei de alteração), com pelo menos 10 caracteres.");

export const zDeclararDadosDoPrograma = z.object({
  programaId: z.string().min(1),
  descricao: texto(70, "a denominação do programa"),
  objetivo: texto(150, "o objetivo do programa"),
  tipoObjetivoMilenio: z
    .string()
    .trim()
    .refine((c) => c in OBJETIVO_MILENIO_2026, "Escolha o objetivo da Agenda 2030 da tabela do Tribunal."),
  fundamento: zFundamento,
  vigenteDesde: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type DeclararDadosDoProgramaInput = z.input<typeof zDeclararDadosDoPrograma>;

export const zDeclararDadosDaAcao = z
  .object({
    acaoId: z.string().min(1),
    descricao: texto(70, "a denominação da ação"),
    descMeta: z.string().trim().max(150, "A meta vai à prestação de contas em até 150 caracteres.").optional(),
    unidadeMedida: z.string().trim().max(50, "A unidade de medida vai à prestação de contas em até 50 caracteres.").optional(),
    fundamento: zFundamento,
    vigenteDesde: z.coerce.date(),
    criadoPor: z.string().min(1),
  })
  .refine((d) => (d.descMeta ?? "") === "" || (d.unidadeMedida ?? "") !== "", {
    message: "A meta precisa da unidade de medida em que é contada.",
    path: ["unidadeMedida"],
  });
export type DeclararDadosDaAcaoInput = z.input<typeof zDeclararDadosDaAcao>;

export async function declararDadosDoPrograma(
  prisma: PrismaClient,
  input: DeclararDadosDoProgramaInput
): Promise<{ readonly declaracaoId: string; readonly codigo: string; readonly vigenteDesde: string }> {
  const d = zDeclararDadosDoPrograma.parse(input);
  if (d.tipoObjetivoMilenio === "99") {
    // §4.2: o código 5000 é reservado ao programa da Primeira Infância — e o objetivo 99 é dele.
    const p = await prisma.programa.findUnique({ where: { id: d.programaId }, select: { codigo: true } });
    if (p !== null && p.codigo !== "5000") {
      throw new Error(`O objetivo "Primeira Infância" (99) é do programa de código 5000, reservado a ele pelo Tribunal; o programa ${p.codigo} não pode usá-lo. Nada foi gravado.`);
    }
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararDadosDoPrograma, "ENTE");
    const programa = await tx.programa.findUnique({ where: { id: d.programaId }, select: { id: true, codigo: true } });
    if (programa === null) throw new Error("Programa não encontrado. Nada foi gravado.");
    const c = await tx.declaracaoDoPrograma.create({
      data: { programaId: programa.id, descricao: d.descricao, objetivo: d.objetivo, tipoObjetivoMilenio: d.tipoObjetivoMilenio, fundamento: d.fundamento, vigenteDesde: d.vigenteDesde, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { declaracaoId: c.id, codigo: programa.codigo, vigenteDesde: diaCivil(d.vigenteDesde) };
  });
}

export async function declararDadosDaAcao(
  prisma: PrismaClient,
  input: DeclararDadosDaAcaoInput
): Promise<{ readonly declaracaoId: string; readonly codigo: string; readonly vigenteDesde: string }> {
  const d = zDeclararDadosDaAcao.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararDadosDaAcao, "ENTE");
    const acao = await tx.acao.findUnique({ where: { id: d.acaoId }, select: { id: true, codigo: true } });
    if (acao === null) throw new Error("Ação não encontrada. Nada foi gravado.");
    const c = await tx.declaracaoDaAcao.create({
      data: {
        acaoId: acao.id,
        descricao: d.descricao,
        descMeta: (d.descMeta ?? "") === "" ? null : (d.descMeta as string),
        unidadeMedida: (d.unidadeMedida ?? "") === "" ? null : (d.unidadeMedida as string),
        fundamento: d.fundamento,
        vigenteDesde: d.vigenteDesde,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { declaracaoId: c.id, codigo: acao.codigo, vigenteDesde: diaCivil(d.vigenteDesde) };
  });
}
