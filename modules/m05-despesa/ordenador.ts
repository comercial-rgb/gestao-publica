import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Tx } from "../m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../../packages/datas/index.js";
import { documentoTemDigitoValido, normalizarDocumento } from "../../packages/documento/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 — O ORDENADOR DE DESPESA E O RESPONSÁVEL PELO SISTEMA (SAGRES §4.36, §4.48 e o cpfOrdenador do §4.8).
 * Ver `prisma/schema/m05-ordenador-e-siafic.prisma`.
 */

const zCpf = z
  .string()
  .transform((c) => normalizarDocumento(c))
  .refine((c) => /^\d{11}$/.test(c) && documentoTemDigitoValido(c), "CPF inválido (confira os dígitos).");
const zSemAspas = (max: number, oque: string) =>
  z
    .string()
    .trim()
    .min(3, `Informe ${oque}.`)
    .max(max, `${oque} vai à prestação de contas em até ${max} caracteres.`)
    .refine((t) => !/["\u0000-\u001f]/.test(t), `${oque} não pode ter aspas nem quebra de linha.`);

export const zDesignarOrdenador = z
  .object({
    cpf: zCpf,
    nome: zSemAspas(50, "o nome do ordenador"),
    escopo: z.enum(["ENTE", "UNIDADE_ORCAMENTARIA"]),
    unidadeOrcId: z.string().min(1).nullable(),
    tipoDoAto: z.enum(["NOMEACAO", "DELEGACAO", "SUBSTITUICAO"]),
    ato: z.string().trim().min(5, "Informe o ato (ex.: Portaria 12/2026)."),
    vigenteDesde: z.coerce.date(),
    criadoPor: z.string().min(1),
  })
  .refine((d) => (d.escopo === "UNIDADE_ORCAMENTARIA") === (d.unidadeOrcId !== null), {
    message: "A designação para uma unidade orçamentária precisa da unidade; a do ente todo, não.",
    path: ["unidadeOrcId"],
  });
export type DesignarOrdenadorInput = z.input<typeof zDesignarOrdenador>;

export async function designarOrdenador(prisma: PrismaClient, input: DesignarOrdenadorInput): Promise<{ readonly id: string }> {
  const d = zDesignarOrdenador.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.designarOrdenador, "ENTE");
    if (d.unidadeOrcId !== null && (await tx.unidadeOrcamentaria.findUnique({ where: { id: d.unidadeOrcId } })) === null) {
      throw new Error("Unidade orçamentária não encontrada. Nada foi gravado.");
    }
    const c = await tx.designacaoDeOrdenador.create({
      data: { cpf: d.cpf, nome: d.nome, escopo: d.escopo, unidadeOrcId: d.unidadeOrcId, tipoDoAto: d.tipoDoAto, ato: d.ato, vigenteDesde: d.vigenteDesde, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: c.id };
  });
}

export const zEncerrarDesignacao = z.object({
  designacaoId: z.string().min(1),
  vigenteAte: z.coerce.date(),
  ato: z.string().trim().min(5, "Informe o ato que encerra a designação."),
  criadoPor: z.string().min(1),
});

export async function encerrarDesignacaoDeOrdenador(prisma: PrismaClient, input: z.input<typeof zEncerrarDesignacao>): Promise<void> {
  const d = zEncerrarDesignacao.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarDesignacaoDeOrdenador, "ENTE");
    const g = await tx.designacaoDeOrdenador.findUnique({ where: { id: d.designacaoId }, select: { vigenteDesde: true, encerramento: { select: { id: true } } } });
    if (g === null) throw new Error("Designação não encontrada. Nada foi gravado.");
    if (g.encerramento !== null) throw new Error("Esta designação já foi encerrada. Nada foi gravado.");
    if (diaCivil(d.vigenteAte) < diaCivil(g.vigenteDesde)) throw new Error("O fim da designação não pode ser antes do início. Nada foi gravado.");
    await tx.encerramentoDaDesignacaoDeOrdenador.create({ data: { designacaoId: d.designacaoId, vigenteAte: d.vigenteAte, ato: d.ato, criadoPor: d.criadoPor } });
  });
}

export interface OrdenadorVigente {
  readonly cpf: string;
  readonly nome: string;
  readonly designacaoId: string;
}

/**
 * O ORDENADOR DE UM FATO: o designado vigente na data (dia civil) para a unidade da ficha; na falta, o do ente todo.
 * Dois candidatos no mesmo nível é ambiguidade — a resposta é a recusa nomeada, não a escolha de um deles.
 * Nenhum designado: nulo (quem chama decide se recusa).
 */
export async function ordenadorNaData(db: Tx, p: { readonly data: Date; readonly unidadeOrcId: string }): Promise<OrdenadorVigente | null> {
  const dia = diaCivil(p.data);
  const todas = await db.designacaoDeOrdenador.findMany({
    where: { OR: [{ escopo: "UNIDADE_ORCAMENTARIA", unidadeOrcId: p.unidadeOrcId }, { escopo: "ENTE" }] },
    select: { id: true, cpf: true, nome: true, escopo: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } },
  });
  const vigentes = todas.filter((g) => diaCivil(g.vigenteDesde) <= dia && (g.encerramento === null || diaCivil(g.encerramento.vigenteAte) >= dia));
  for (const nivel of ["UNIDADE_ORCAMENTARIA", "ENTE"] as const) {
    const n = vigentes.filter((g) => g.escopo === nivel);
    const cpfs = [...new Set(n.map((g) => g.cpf))];
    if (cpfs.length > 1) {
      throw new Error(`SAGRES/Ordenador — há ${cpfs.length} ordenadores vigentes em ${dia.split("-").reverse().join("/")} no mesmo escopo (${n.map((g) => g.nome).join(", ")}): encerre a designação que acabou antes de exportar.`);
    }
    const g = n[0];
    if (g !== undefined) return { cpf: g.cpf, nome: g.nome, designacaoId: g.id };
  }
  return null;
}

// ── O responsável pelo SIAFIC ─────────────────────────────────────────────────────────────────────

const zTelefone = z
  .string()
  .transform((t) => t.replace(/\D/g, ""))
  .refine((t) => t === "" || /^\d{10,11}$/.test(t), "Telefone com DDD, 10 ou 11 dígitos.");
const zEmail = z.string().trim().email("E-mail inválido.").max(30, "O e-mail vai ao Tribunal em até 30 caracteres.");

export const zDeclararResponsavelSiafic = z.object({
  modalidade: z.enum(["TERCEIRIZADA", "PROPRIA"]),
  cnpjEmpresa: z
    .string()
    .transform((c) => normalizarDocumento(c))
    .refine((c) => /^\d{14}$/.test(c) && documentoTemDigitoValido(c), "CNPJ inválido."),
  nomeEmpresa: zSemAspas(80, "o nome da empresa (ou da prefeitura)"),
  telefoneEmpresa: zTelefone,
  emailEmpresa: zEmail,
  denominacaoSiafic: zSemAspas(30, "o nome do sistema"),
  cpfResponsavelTecnico: zCpf,
  nomeResponsavelTecnico: zSemAspas(60, "o nome do responsável técnico"),
  emailResponsavelTecnico: zEmail,
  telefoneResponsavelTecnico: zTelefone,
  fundamento: z.string().trim().min(10, "Diga de onde vêm os dados (contrato de manutenção ou ato de designação)."),
  vigenteDesde: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type DeclararResponsavelSiaficInput = z.input<typeof zDeclararResponsavelSiafic>;

export async function declararResponsavelSiafic(prisma: PrismaClient, input: DeclararResponsavelSiaficInput): Promise<{ readonly id: string }> {
  const d = zDeclararResponsavelSiafic.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararResponsavelSiafic, "ENTE");
    const c = await tx.declaracaoDoResponsavelSiafic.create({
      data: {
        modalidade: d.modalidade,
        cnpjEmpresa: d.cnpjEmpresa,
        nomeEmpresa: d.nomeEmpresa,
        telefoneEmpresa: d.telefoneEmpresa === "" ? null : d.telefoneEmpresa,
        emailEmpresa: d.emailEmpresa,
        denominacaoSiafic: d.denominacaoSiafic,
        cpfResponsavelTecnico: d.cpfResponsavelTecnico,
        nomeResponsavelTecnico: d.nomeResponsavelTecnico,
        emailResponsavelTecnico: d.emailResponsavelTecnico,
        telefoneResponsavelTecnico: d.telefoneResponsavelTecnico === "" ? null : d.telefoneResponsavelTecnico,
        fundamento: d.fundamento,
        vigenteDesde: d.vigenteDesde,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: c.id };
  });
}
