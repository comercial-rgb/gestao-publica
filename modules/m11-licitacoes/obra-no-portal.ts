import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { posicaoFinanceiraDaObra, type PosicaoFinanceiraDaObra } from "./posicao-da-obra.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * V36 — A OBRA NO PORTAL DA TRANSPARÊNCIA (TR 5.10.1.54): o cadastro, os valores e os anexos da obra, sem sessão, só
 * depois de um ATO de publicação (ver `m11-publicacao-da-obra.prisma`). A situação é a do ato mais recente; retirar
 * exige o motivo e não apaga a publicação.
 *
 * O portal lê só por estas funções, e todas começam pela mesma pergunta — "a obra está publicada agora?". Uma obra não
 * publicada responde igual a uma inexistente (`null`): o portal não confirma a existência do que não publicou.
 */

const zPublicar = z
  .object({
    obraId: z.string().min(1),
    publicar: z.boolean(),
    motivo: z.string().trim().optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (!v.publicar && (v.motivo ?? "").length < 10) {
      ctx.addIssue({ code: "custom", path: ["motivo"], message: "Diga por que a obra sai do portal (ao menos 10 caracteres)." });
    }
  });

/** A obra está no portal agora? — o ato mais recente decide; sem ato, não está. */
export async function obraEstaPublicada(tx: Tx, obraId: string): Promise<boolean> {
  const ultimo = await tx.publicacaoDaObra.findFirst({ where: { obraId }, orderBy: [{ criadoEm: "desc" }, { id: "desc" }], select: { publicada: true } });
  return ultimo?.publicada ?? false;
}

/** PUBLICA ou RETIRA a obra do portal. Recusa o ato que não muda nada (publicar a publicada, retirar a que não está). */
export async function publicarObraNoPortal(
  prisma: PrismaClient,
  input: z.input<typeof zPublicar>
): Promise<{ readonly publicacaoId: string }> {
  const d = zPublicar.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.publicarObraNoPortal, "ENTE");
    const obra = await tx.obra.findUnique({ where: { id: d.obraId }, select: { identificador: true } });
    if (obra === null) throw new Error("A obra não existe. Nada foi gravado.");
    const agora = await obraEstaPublicada(tx, d.obraId);
    if (agora === d.publicar) {
      throw new Error(d.publicar ? `A obra ${obra.identificador} já está no portal da transparência.` : `A obra ${obra.identificador} não está no portal da transparência.`);
    }
    const p = await tx.publicacaoDaObra.create({
      data: { obraId: d.obraId, publicada: d.publicar, ...(d.motivo !== undefined && d.motivo !== "" ? { motivo: d.motivo } : {}), criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { publicacaoId: p.id };
  });
}

export interface ObraNoPortal {
  readonly id: string;
  readonly identificador: string;
  readonly descricao: string;
  readonly tipoObraServico: string;
  readonly cei: string | null;
  readonly orgao: string | null;
  readonly publicadaEm: Date;
  readonly posicao: PosicaoFinanceiraDaObra;
  readonly medicoesAprovadas: readonly { readonly numero: number; readonly periodoInicio: Date; readonly periodoFim: Date; readonly valor: string; readonly contrato: string }[];
  readonly anexos: readonly { readonly id: string; readonly nome: string; readonly tamanhoBytes: number }[];
}

/** As obras publicadas, com a posição financeira de cada uma. */
export async function obrasNoPortal(tx: Tx): Promise<readonly ObraNoPortal[]> {
  const comAto = await tx.publicacaoDaObra.findMany({ distinct: ["obraId"], select: { obraId: true } });
  const out: ObraNoPortal[] = [];
  for (const { obraId } of comAto) {
    const o = await obraNoPortal(tx, obraId);
    if (o !== null) out.push(o);
  }
  return out.sort((a, b) => a.identificador.localeCompare(b.identificador, "pt-BR"));
}

/** Uma obra publicada; `null` quando não existe OU não está publicada (as duas respostas são a mesma). */
export async function obraNoPortal(tx: Tx, obraId: string): Promise<ObraNoPortal | null> {
  if (!(await obraEstaPublicada(tx, obraId))) return null;
  const o = await tx.obra.findUnique({
    where: { id: obraId },
    select: {
      id: true,
      identificador: true,
      descricao: true,
      tipoObraServico: true,
      cei: true,
      orgao: { select: { codigo: true, nome: true } },
      medicoes: {
        where: { OR: [{ aprovadaEm: { not: null } }, { aprovacao: { isNot: null } }] },
        orderBy: { numero: "asc" },
        select: { numero: true, periodoInicio: true, periodoFim: true, valorMedido: true, contrato: { select: { numeroContrato: true } } },
      },
      anexos: { orderBy: { criadoEm: "asc" }, select: { id: true, nomeOriginal: true, tamanhoBytes: true } },
      publicacoes: { where: { publicada: true }, orderBy: { criadoEm: "desc" }, take: 1, select: { criadoEm: true } },
    },
  });
  if (o === null) return null;
  return {
    id: o.id,
    identificador: o.identificador,
    descricao: o.descricao,
    tipoObraServico: o.tipoObraServico,
    cei: o.cei,
    orgao: o.orgao === null ? null : `${o.orgao.codigo} — ${o.orgao.nome}`,
    publicadaEm: o.publicacoes[0]?.criadoEm ?? new Date(0),
    posicao: await posicaoFinanceiraDaObra(tx, o.id),
    medicoesAprovadas: o.medicoes.map((m) => ({ numero: m.numero, periodoInicio: m.periodoInicio, periodoFim: m.periodoFim, valor: m.valorMedido.toFixed(2), contrato: m.contrato.numeroContrato })),
    anexos: o.anexos.map((a) => ({ id: a.id, nome: a.nomeOriginal, tamanhoBytes: a.tamanhoBytes })),
  };
}
