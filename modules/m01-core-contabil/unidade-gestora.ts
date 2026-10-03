import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import { documentoTemDigitoValido } from "../../packages/documento/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";

/**
 * V26 (ordem, item 2.9) — AS UNIDADES GESTORAS DO ENTE, como estão no cadastro do TCE-PB
 * (ver `prisma/schema/m01-unidade-gestora.prisma`).
 *
 * O código vem do Tribunal: aqui ele só é conferido (6 dígitos, único). A UG operada aponta a entidade contábil que a
 * escritura neste sistema; a UG sem entidade é a contraparte de fora, cadastrada para identificar o outro lado de uma
 * transferência — nunca para fabricar o lançamento dele.
 */

export const NATUREZAS_JURIDICAS_DA_UG = [
  "CAMARA_MUNICIPAL",
  "PREFEITURA_OU_SECRETARIA",
  "AUTARQUIA",
  "FUNDACAO",
  "SOCIEDADE_DE_ECONOMIA_MISTA",
  "FUNDO",
  "EMPRESA_PUBLICA",
  "AUTARQUIA_PREVIDENCIARIA",
  "FUNDO_PREVIDENCIARIO",
] as const;

export const zCadastrarUnidadeGestora = z.object({
  codigoTce: z.string().trim().regex(/^\d{6}$/, "O código da unidade gestora no Tribunal tem 6 dígitos."),
  nome: z.string().trim().min(3).max(100),
  cnpj: z
    .string()
    .trim()
    .transform((s) => s.replace(/\D/g, ""))
    .nullable(),
  naturezaJuridica: z.enum(NATUREZAS_JURIDICAS_DA_UG),
  entidadeContabilId: z.string().min(1).nullable(),
  vigenteDesde: z.coerce.date(),
  fundamento: z.string().trim().min(10, "Diga de onde vêm o código e a vigência (o cadastro de UG do Tribunal, a data da consulta)."),
  criadoPor: z.string().min(1),
});
export type CadastrarUnidadeGestoraInput = z.input<typeof zCadastrarUnidadeGestora>;

export async function cadastrarUnidadeGestora(prisma: PrismaClient, input: CadastrarUnidadeGestoraInput): Promise<{ readonly id: string }> {
  const d = zCadastrarUnidadeGestora.parse(input);
  if (d.cnpj !== null && d.cnpj !== "" && (d.cnpj.length !== 14 || !documentoTemDigitoValido(d.cnpj))) {
    throw new Error(`O CNPJ ${d.cnpj} não é válido. Nada foi gravado.`);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarUnidadeGestora, "ENTE");
    const ja = await tx.unidadeGestora.findUnique({ where: { codigoTce: d.codigoTce }, select: { nome: true } });
    if (ja !== null) throw new Error(`O código ${d.codigoTce} já é da unidade gestora ${ja.nome}. Nada foi gravado.`);
    if (d.entidadeContabilId !== null) {
      const ent = await tx.entidadeContabil.findUnique({
        where: { id: d.entidadeContabilId },
        select: { codigo: true, unidadesGestoras: { where: { encerramento: null }, select: { codigoTce: true } } },
      });
      if (ent === null) throw new Error("Entidade contábil não encontrada. Nada foi gravado.");
      // Uma entidade com balancete próprio presta contas por UMA unidade gestora vigente.
      const vigente = ent.unidadesGestoras[0];
      if (vigente !== undefined) {
        throw new Error(`A entidade ${ent.codigo} já presta contas pela unidade gestora ${vigente.codigoTce}; encerre-a antes de cadastrar outra. Nada foi gravado.`);
      }
    }
    const c = await tx.unidadeGestora.create({
      data: {
        codigoTce: d.codigoTce,
        nome: d.nome,
        cnpj: d.cnpj === null || d.cnpj === "" ? null : d.cnpj,
        naturezaJuridica: d.naturezaJuridica,
        entidadeContabilId: d.entidadeContabilId,
        vigenteDesde: d.vigenteDesde,
        fundamento: d.fundamento,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { id: c.id };
  });
}

export const zEncerrarUnidadeGestora = z.object({
  ugId: z.string().min(1),
  vigenteAte: z.coerce.date(),
  ato: z.string().trim().min(5, "Informe o ato que encerra a unidade gestora."),
  criadoPor: z.string().min(1),
});

export async function encerrarUnidadeGestora(prisma: PrismaClient, input: z.input<typeof zEncerrarUnidadeGestora>): Promise<void> {
  const d = zEncerrarUnidadeGestora.parse(input);
  await prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.encerrarUnidadeGestora, "ENTE");
    const ug = await tx.unidadeGestora.findUnique({ where: { id: d.ugId }, select: { codigoTce: true, vigenteDesde: true, encerramento: { select: { id: true } } } });
    if (ug === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
    if (ug.encerramento !== null) throw new Error(`A unidade gestora ${ug.codigoTce} já está encerrada. Nada foi gravado.`);
    if (diaCivil(d.vigenteAte) < diaCivil(ug.vigenteDesde)) {
      throw new Error(`A unidade gestora ${ug.codigoTce} vale desde ${diaCivilBr(ug.vigenteDesde)}; o último dia não pode ser anterior. Nada foi gravado.`);
    }
    await tx.encerramentoDaUnidadeGestora.create({ data: { ugId: d.ugId, vigenteAte: d.vigenteAte, ato: d.ato, criadoPor: d.criadoPor } });
  });
}

/** A UG vale no dia civil `dia`: começou até ele e não terminou antes dele. */
export function ugVigenteNoDia(ug: { readonly vigenteDesde: Date; readonly encerramento: { readonly vigenteAte: Date } | null }, dia: Date): boolean {
  const d = diaCivil(dia);
  return diaCivil(ug.vigenteDesde) <= d && (ug.encerramento === null || diaCivil(ug.encerramento.vigenteAte) >= d);
}

/** As UGs escrituradas neste sistema (com entidade), vigentes no dia — as que podem remeter ao Tribunal. */
export async function unidadesGestorasOperadas(prisma: PrismaClient, dia: Date): Promise<readonly { readonly id: string; readonly codigoTce: string; readonly nome: string; readonly cnpj: string | null; readonly naturezaJuridica: string }[]> {
  const ugs = await prisma.unidadeGestora.findMany({
    where: { entidadeContabilId: { not: null } },
    orderBy: { codigoTce: "asc" },
    select: { id: true, codigoTce: true, nome: true, cnpj: true, naturezaJuridica: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } },
  });
  return ugs.filter((u) => ugVigenteNoDia(u, dia)).map((u) => ({ id: u.id, codigoTce: u.codigoTce, nome: u.nome, cnpj: u.cnpj, naturezaJuridica: u.naturezaJuridica }));
}

// ═══ V33 — DE QUAL UG É CADA UNIDADE ORÇAMENTÁRIA ═══════════════════════════════════════════════════════════════

export const zVincularUnidadeOrcamentaria = z.object({
  unidadeOrcId: z.string().min(1, "Escolha a unidade orçamentária."),
  ugId: z.string().min(1, "Escolha a unidade gestora."),
  vigenteDesde: z.coerce.date(),
  fundamento: z.string().trim().min(10, "Diga de onde vem o vínculo (o quadro de unidades da LOA, o cadastro de UG do Tribunal)."),
  criadoPor: z.string().min(1),
});
export type VincularUnidadeOrcamentariaInput = z.input<typeof zVincularUnidadeOrcamentaria>;

/**
 * Declara que a unidade orçamentária pertence à UG a partir de um dia. Insert-only: trocar de UG é outra declaração
 * com vigência posterior. Só UG ESCRITURADA AQUI recebe unidade: a contraparte de fora não tem despesa neste sistema.
 * Repetir a mesma declaração (unidade, UG, dia) devolve a existente — o duplo clique não vira erro nem linha nova.
 */
export async function vincularUnidadeOrcamentariaAUg(prisma: PrismaClient, input: VincularUnidadeOrcamentariaInput): Promise<{ readonly id: string; readonly repetido: boolean }> {
  const d = zVincularUnidadeOrcamentaria.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularUnidadeOrcamentariaAUg, "ENTE");
    const [uo, ug] = await Promise.all([
      tx.unidadeOrcamentaria.findUnique({ where: { id: d.unidadeOrcId }, select: { codigo: true } }),
      tx.unidadeGestora.findUnique({ where: { id: d.ugId }, select: { codigoTce: true, entidadeContabilId: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } }),
    ]);
    if (uo === null) throw new Error("Unidade orçamentária não encontrada. Nada foi gravado.");
    if (ug === null) throw new Error("Unidade gestora não encontrada. Nada foi gravado.");
    if (ug.entidadeContabilId === null) {
      throw new Error(`A unidade gestora ${ug.codigoTce} é escriturada fora deste sistema; a despesa da unidade ${uo.codigo} não pode ser dela aqui. Nada foi gravado.`);
    }
    if (!ugVigenteNoDia(ug, d.vigenteDesde)) {
      throw new Error(`A unidade gestora ${ug.codigoTce} não está vigente em ${diaCivilBr(d.vigenteDesde)}. Nada foi gravado.`);
    }
    const mesmoDia = await tx.vinculoDaUnidadeOrcamentariaComUg.findMany({
      where: { unidadeOrcId: d.unidadeOrcId },
      select: { id: true, ugId: true, vigenteDesde: true, ug: { select: { codigoTce: true } } },
    });
    const ja = mesmoDia.find((v) => diaCivil(v.vigenteDesde) === diaCivil(d.vigenteDesde));
    if (ja !== undefined) {
      if (ja.ugId === d.ugId) return { id: ja.id, repetido: true };
      throw new Error(`A unidade ${uo.codigo} já foi declarada da unidade gestora ${ja.ug.codigoTce} a partir de ${diaCivilBr(d.vigenteDesde)}. Para mudar, declare a nova unidade gestora com outro dia de início. Nada foi gravado.`);
    }
    const c = await tx.vinculoDaUnidadeOrcamentariaComUg.create({
      data: { unidadeOrcId: d.unidadeOrcId, ugId: d.ugId, vigenteDesde: d.vigenteDesde, fundamento: d.fundamento, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { id: c.id, repetido: false };
  });
}

/**
 * Código da unidade orçamentária → código da UG, no dia civil `dia`: o vínculo mais recente que já valia, e só se a
 * UG está vigente naquele dia. Unidade sem vínculo NÃO aparece no mapa — e quem recorta trata a ausência como recusa.
 */
export async function ugDasUnidadesOrcamentarias(prisma: PrismaClient, dia: Date): Promise<ReadonlyMap<string, string>> {
  const vinculos = await prisma.vinculoDaUnidadeOrcamentariaComUg.findMany({
    select: {
      vigenteDesde: true,
      unidadeOrc: { select: { codigo: true } },
      ug: { select: { codigoTce: true, vigenteDesde: true, encerramento: { select: { vigenteAte: true } } } },
    },
  });
  const d = diaCivil(dia);
  const ultimo = new Map<string, { readonly desde: string; readonly ug: (typeof vinculos)[number]["ug"] }>();
  for (const v of vinculos) {
    const desde = diaCivil(v.vigenteDesde);
    if (desde > d) continue;
    const atual = ultimo.get(v.unidadeOrc.codigo);
    if (atual === undefined || desde > atual.desde) ultimo.set(v.unidadeOrc.codigo, { desde, ug: v.ug });
  }
  const mapa = new Map<string, string>();
  for (const [uo, v] of ultimo) if (ugVigenteNoDia(v.ug, dia)) mapa.set(uo, v.ug.codigoTce);
  return mapa;
}
