import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * M21 — OS CADASTROS DO PROTOCOLO: setor, lotação, assunto e roteiro.
 *
 * ═══ ⚠️ SEM ELES O MÓDULO NÃO É CONFIGURÁVEL, E ISSO SERIA UM DEFEITO ═══
 * O catálogo pede roteiro configurável POR ASSUNTO, com prazo por etapa, e acesso
 * definido por centro de custo. Entregar o motor sem a configuração deixaria a entidade
 * dependente de um seed — e um sistema que só o fornecedor consegue parametrizar é o
 * oposto do que "altamente configurável" significa.
 *
 * ═══ ⚠️ O ROTEIRO É CADASTRADO JUNTO COM O ASSUNTO, numa transação ═══
 * Um assunto sem roteiro é legítimo (nem todo pedido tem etapas), mas um assunto criado
 * e um roteiro criado em chamadas separadas abrem uma janela em que processos nascem
 * sem roteiro nenhum — e a cópia feita na abertura é definitiva.
 */

export const zCriarSetor = z.object({
  codigo: z.string().trim().min(1).max(10).regex(/^[A-Z0-9-]+$/, "O código do setor usa maiúsculas, dígitos e '-'."),
  nome: z.string().trim().min(3).max(120),
  unidadeOrcId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CriarSetorInput = z.input<typeof zCriarSetor>;

export async function criarSetor(
  prisma: PrismaClient,
  input: CriarSetorInput
): Promise<{ readonly setorId: string }> {
  const d = zCriarSetor.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarSetor, { ug: d.unidadeOrcId });

    const ug = await tx.unidadeOrcamentaria.findUnique({
      where: { id: d.unidadeOrcId },
      select: { id: true },
    });
    if (ug === null) {
      throw new Error(`Unidade gestora ${d.unidadeOrcId} não existe. Nada foi gravado.`);
    }

    const existente = await tx.setor.findUnique({
      where: { codigo: d.codigo },
      select: { nome: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe o setor "${d.codigo}" (${existente.nome}). O código identifica o setor ` +
          `no ente inteiro — reaproveitá-lo faria o histórico de dois setores se misturar. ` +
          `Nada foi gravado.`
      );
    }

    const s = await tx.setor.create({
      data: {
        codigo: d.codigo,
        nome: d.nome,
        unidadeOrcId: d.unidadeOrcId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { setorId: s.id };
  });
}

export const zLotarUsuario = z.object({
  usuarioIdent: z.string().trim().min(1),
  setorId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type LotarUsuarioInput = z.input<typeof zLotarUsuario>;

/**
 * LOTA um usuário num setor.
 *
 * ⚠️ O USUÁRIO TEM DE EXISTIR E ESTAR ATIVO. Lotar uma string livre criaria uma lotação
 * que nunca dá acesso a ninguém e que ninguém consegue explicar depois — a mesma classe
 * de problema que o `criadoPor` livre tinha antes do M16.
 */
export async function lotarUsuarioNoSetor(
  prisma: PrismaClient,
  input: LotarUsuarioInput
): Promise<{ readonly lotacaoId: string }> {
  const d = zLotarUsuario.parse(input);

  return prisma.$transaction(async (tx) => {
    const setor = await tx.setor.findUnique({
      where: { id: d.setorId },
      select: { unidadeOrcId: true, codigo: true, nome: true, ativo: true },
    });
    if (setor === null) {
      throw new Error(`Setor ${d.setorId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.lotarUsuarioNoSetor, {
      ug: setor.unidadeOrcId,
    });
    if (!setor.ativo) {
      throw new Error(
        `O setor ${setor.codigo} (${setor.nome}) está DESATIVADO e não recebe lotação nova. ` +
          `Nada foi gravado.`
      );
    }

    const usuario = await tx.usuario.findUnique({
      where: { identificador: d.usuarioIdent },
      select: { ativo: true },
    });
    if (usuario === null) {
      throw new Error(
        `USUÁRIO NÃO CADASTRADO: "${d.usuarioIdent}". Lotar uma string livre criaria uma ` +
          `lotação que nunca dá acesso a ninguém e que ninguém consegue explicar depois. ` +
          `Cadastre o usuário primeiro. Nada foi gravado.`
      );
    }
    if (!usuario.ativo) {
      throw new Error(
        `USUÁRIO INATIVO: "${d.usuarioIdent}". O acesso dele foi revogado — lotá-lo agora ` +
          `seria devolver alcance a quem o perdeu. Nada foi gravado.`
      );
    }

    const l = await tx.usuarioDoSetor.upsert({
      where: {
        usuarioIdent_setorId: { usuarioIdent: d.usuarioIdent, setorId: d.setorId },
      },
      update: {},
      create: {
        usuarioIdent: d.usuarioIdent,
        setorId: d.setorId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { lotacaoId: l.id };
  });
}

const zEtapa = z.object({
  ordem: z.number().int().min(1).max(99),
  setorId: z.string().min(1),
  prazoDias: z.number().int().min(1).max(3650),
  descricao: z.string().trim().min(3).max(200),
});

export const zCriarAssunto = z.object({
  codigo: z.string().trim().min(1).max(10).regex(/^[A-Z0-9-]+$/, "O código do assunto usa maiúsculas, dígitos e '-'."),
  nome: z.string().trim().min(3).max(160),
  textoOrientacao: z.string().trim().max(2000).optional(),
  termoDeAceite: z.string().trim().min(10).max(4000).optional(),
  permiteAnonimo: z.boolean().default(false),
  sigiloPadrao: z.boolean().default(false),
  bloqueiaTramiteComTaxaAberta: z.boolean().default(false),
  /** ⚠️ A UNIDADE GESTORA É EXIGIDA PARA AUTORIZAR — o assunto em si é do ente. */
  unidadeOrcId: z.string().min(1),
  subassuntos: z
    .array(z.object({ codigo: z.string().trim().min(1).max(10), nome: z.string().trim().min(3) }))
    .default([]),
  roteiro: z.array(zEtapa).default([]),
  criadoPor: z.string().min(1),
});
export type CriarAssuntoInput = z.input<typeof zCriarAssunto>;

export async function criarAssunto(
  prisma: PrismaClient,
  input: CriarAssuntoInput
): Promise<{ readonly assuntoId: string }> {
  const d = zCriarAssunto.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarAssunto, {
      ug: d.unidadeOrcId,
    });

    const existente = await tx.assunto.findUnique({
      where: { codigo: d.codigo },
      select: { nome: true },
    });
    if (existente !== null) {
      throw new Error(
        `Já existe o assunto "${d.codigo}" (${existente.nome}). Nada foi gravado.`
      );
    }

    const ordens = new Set(d.roteiro.map((e) => e.ordem));
    if (ordens.size !== d.roteiro.length) {
      throw new Error(
        "Duas etapas do roteiro com a mesma ordem. A ordem é a sequência em que o " +
          "processo percorre os setores — duas iguais não dizem qual vem antes. " +
          "Nada foi gravado."
      );
    }

    for (const e of d.roteiro) {
      const setor = await tx.setor.findUnique({
        where: { id: e.setorId },
        select: { ativo: true, codigo: true },
      });
      if (setor === null || !setor.ativo) {
        throw new Error(
          `A etapa ${e.ordem} aponta para um setor inexistente ou desativado. ` +
            `Nada foi gravado.`
        );
      }
    }

    const a = await tx.assunto.create({
      data: {
        codigo: d.codigo,
        nome: d.nome,
        textoOrientacao: d.textoOrientacao ?? null,
        termoDeAceite: d.termoDeAceite ?? null,
        permiteAnonimo: d.permiteAnonimo,
        sigiloPadrao: d.sigiloPadrao,
        bloqueiaTramiteComTaxaAberta: d.bloqueiaTramiteComTaxaAberta,
        criadoPor: d.criadoPor,
        subassuntos: {
          create: d.subassuntos.map((s) => ({
            codigo: s.codigo,
            nome: s.nome,
            criadoPor: d.criadoPor,
          })),
        },
        roteiro: {
          create: d.roteiro.map((e) => ({
            ordem: e.ordem,
            setorId: e.setorId,
            prazoDias: e.prazoDias,
            descricao: e.descricao,
            criadoPor: d.criadoPor,
          })),
        },
      },
      select: { id: true },
    });
    return { assuntoId: a.id };
  });
}

export const zRegistrarTaxa = z.object({
  processoId: z.string().min(1),
  descricao: z.string().trim().min(3).max(160),
  /** ⚠️ STRING DECIMAL. Dinheiro não atravessa fronteira como número. */
  valor: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "O valor da taxa é decimal com até duas casas."),
  vencimento: z.date(),
  criadoPor: z.string().min(1),
});
export type RegistrarTaxaInput = z.input<typeof zRegistrarTaxa>;

/**
 * REGISTRA UMA TAXA no processo.
 *
 * ⚠️ ISTO NÃO EMITE GUIA. A emissão em padrão FEBRABAN/PIX pertence ao bloco de
 * arrecadação, que não existe neste repositório — pendência PROTOCOLO-GUIA-BANCARIA. O
 * que existe aqui é o REGISTRO da taxa, que é o que o bloqueio de tramitação consome.
 */
export async function registrarTaxaDoProcesso(
  prisma: PrismaClient,
  input: RegistrarTaxaInput
): Promise<{ readonly taxaId: string }> {
  const d = zRegistrarTaxa.parse(input);

  return prisma.$transaction(async (tx) => {
    const p = await tx.processo.findUnique({
      where: { id: d.processoId },
      select: { setorAberturaId: true, setorAbertura: { select: { unidadeOrcId: true } } },
    });
    if (p === null) {
      throw new Error(`Processo ${d.processoId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarTaxaDoProcesso, {
      setor: p.setorAberturaId,
    });

    const t = await tx.taxaDoProcesso.create({
      data: {
        processoId: d.processoId,
        descricao: d.descricao,
        valor: d.valor,
        vencimento: d.vencimento,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { taxaId: t.id };
  });
}

export const zBaixarTaxa = z.object({
  taxaId: z.string().min(1),
  tipo: z.enum(["PAGAMENTO", "CANCELAMENTO"]),
  motivo: z.string().trim().max(500).optional(),
  criadoPor: z.string().min(1),
});
export type BaixarTaxaInput = z.input<typeof zBaixarTaxa>;

export async function baixarTaxaDoProcesso(
  prisma: PrismaClient,
  input: BaixarTaxaInput
): Promise<{ readonly movimentoId: string }> {
  const d = zBaixarTaxa.parse(input);

  return prisma.$transaction(async (tx) => {
    const t = await tx.taxaDoProcesso.findUnique({
      where: { id: d.taxaId },
      select: {
        descricao: true,
        processo: {
          select: { setorAberturaId: true },
        },
        movimentos: { select: { tipo: true } },
      },
    });
    if (t === null) {
      throw new Error(`Taxa ${d.taxaId} não existe. Nada foi gravado.`);
    }
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.baixarTaxaDoProcesso, {
      setor: t.processo.setorAberturaId,
    });

    if (t.movimentos.length > 0) {
      throw new Error(
        `A taxa "${t.descricao}" já foi baixada. Baixá-la de novo criaria um segundo fato ` +
          `sobre o mesmo pagamento. Nada foi gravado.`
      );
    }
    if (d.tipo === "CANCELAMENTO" && (d.motivo ?? "").trim().length < 10) {
      throw new Error(
        "Cancelar uma taxa exige motivo — é ato que o controle interno vai querer " +
          "explicado. Nada foi gravado."
      );
    }

    const m = await tx.movimentoDaTaxa.create({
      data: {
        taxaId: d.taxaId,
        tipo: d.tipo,
        motivo: d.motivo ?? null,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return { movimentoId: m.id };
  });
}
