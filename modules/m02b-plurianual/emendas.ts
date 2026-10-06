import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { valorVigente } from "../m02-planejamento/proposta-orcamentaria.js";

/**
 * V36 — EMENDAS AO PROJETO DA LOA (TR 5.9.3.13 a 5.9.3.15).
 *
 * ═══ ONDE A EMENDA ATUA ═══
 * Sobre a PROPOSTA ORÇAMENTÁRIA ainda não efetivada (M02, V29) — o projeto de lei. Cada item diz quanto uma linha de
 * despesa da proposta ganha ou perde. A emenda, sozinha, não muda valor nenhum: só a SANÇÃO leva os itens aprovados
 * à proposta, gravando um AJUSTE da linha (o mesmo canal de `ajustarLinhaDaProposta`) com o valor vigente somado ao
 * item, na mesma transação, e o motivo citando a emenda e o ato. Proposta efetivada não recebe emenda nem sanção: o
 * orçamento já existe, e daí em diante só muda por crédito adicional (ato do Executivo, M03).
 *
 * ═══ AS DUAS AUTORIDADES ═══
 * `CADASTRAR_EMENDA_AO_ORCAMENTO` registra a emenda e bloqueia (ou libera) dotações para emenda;
 * `SANCIONAR_EMENDA_AO_ORCAMENTO` registra a sanção. A sanção grava o ajuste sem pedir `CADASTRAR_LOA`: o ajuste é
 * efeito da sanção, não digitação da peça.
 *
 * ═══ O QUE O SISTEMA NÃO DECIDE ═══
 * A compensação da emenda (acréscimo com anulação de outra despesa, CF art. 166, §3º, aplicado ao município pela Lei
 * Orgânica) é examinada pela Câmara: o sistema mostra o saldo da emenda (acréscimos menos reduções), não o impõe.
 *
 * ⚠️ INSERT-ONLY. A situação da emenda e o bloqueio vivo são DERIVADOS.
 */

export class EmendaInvalidaError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EmendaInvalidaError";
  }
}

function lerOuRecusar<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new EmendaInvalidaError(`${r.error.issues[0]?.message ?? "Dados inválidos."} Nada foi gravado.`);
  return r.data;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato dd/mm/aaaa.");
const zValorComSinal = z
  .string()
  .trim()
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Informe o valor do item em reais, com sinal de menos na redução (ex.: -1.000,00).")
  .transform((v) => toMoney(v));

const zCadastrarEmenda = z.object({
  propostaOrcamentariaId: z.string().trim().min(1),
  data: zDia,
  objetivo: z.string().trim().min(3, "Informe o objetivo da emenda."),
  justificativa: z.string().trim().min(3, "Informe a justificativa da emenda."),
  vereador: z.string().trim().min(3, "Informe o vereador responsável pela emenda."),
  textoJuridico: z.string().trim().min(3, "Informe o texto jurídico da emenda."),
  itens: z.array(z.object({ linhaDeDespesaId: z.string().trim().min(1), valor: zValorComSinal })).min(1, "Informe ao menos uma dotação com acréscimo ou redução."),
  criadoPor: z.string().trim().min(1),
});

/** A proposta trancada, existente e não efetivada — pré-condição de todo ato da emenda. */
async function propostaAberta(tx: Tx, propostaOrcamentariaId: string): Promise<{ readonly exercicio: number }> {
  await travar(tx, "PropostaOrcamentaria", [propostaOrcamentariaId]);
  const p = await tx.propostaOrcamentaria.findUnique({
    where: { id: propostaOrcamentariaId },
    select: { exercicio: true, efetivacao: { select: { id: true } } },
  });
  if (p === null) throw new EmendaInvalidaError("A proposta orçamentária não existe. Nada foi gravado.");
  if (p.efetivacao !== null) {
    throw new EmendaInvalidaError(
      `A proposta do orçamento de ${String(p.exercicio)} já foi efetivada: o orçamento existe e não recebe mais emenda nem sanção (daqui em diante, só crédito adicional). Nada foi gravado.`
    );
  }
  return { exercicio: p.exercicio };
}

interface LinhaComVigente {
  readonly id: string;
  readonly propostaOrcamentariaId: string;
  readonly rotulo: string;
  readonly vigente: Money;
  readonly bloqueada: boolean;
}

async function linhasComVigente(tx: Tx, ids: readonly string[]): Promise<Map<string, LinhaComVigente>> {
  const linhas = await tx.linhaDeDespesaDaProposta.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      propostaOrcamentariaId: true,
      valorProjetado: true,
      fichaDeOrigem: { select: { numero: true } },
      ajustes: { select: { id: true, valor: true, criadoEm: true } },
      bloqueiosDeEmenda: { where: { revogaDeId: null, revogadoPor: null }, select: { id: true } },
    },
  });
  return new Map(
    linhas.map((l) => [
      l.id,
      {
        id: l.id,
        propostaOrcamentariaId: l.propostaOrcamentariaId,
        rotulo: `ficha ${String(l.fichaDeOrigem.numero)}`,
        vigente: valorVigente(
          toMoney(l.valorProjetado.toFixed(2)),
          l.ajustes.map((a) => ({ id: a.id, valor: toMoney(a.valor.toFixed(2)), criadoEm: a.criadoEm }))
        ),
        bloqueada: l.bloqueiosDeEmenda.length > 0,
      },
    ])
  );
}

export async function cadastrarEmendaAoOrcamento(
  prisma: PrismaClient,
  input: z.input<typeof zCadastrarEmenda>
): Promise<{ readonly id: string; readonly numero: number }> {
  const d = lerOuRecusar(zCadastrarEmenda, input);
  const vistos = new Set<string>();
  for (const i of d.itens) {
    if (i.valor.isZero()) throw new EmendaInvalidaError("Um item da emenda está com valor zero: informe o acréscimo ou a redução. Nada foi gravado.");
    if (vistos.has(i.linhaDeDespesaId)) throw new EmendaInvalidaError("A mesma dotação aparece duas vezes na emenda. Nada foi gravado.");
    vistos.add(i.linhaDeDespesaId);
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarEmendaAoOrcamento, "ENTE");
    await propostaAberta(tx, d.propostaOrcamentariaId);
    const linhas = await linhasComVigente(tx, [...vistos]);
    for (const i of d.itens) {
      const l = linhas.get(i.linhaDeDespesaId);
      if (l === undefined || l.propostaOrcamentariaId !== d.propostaOrcamentariaId) {
        throw new EmendaInvalidaError("Uma das dotações informadas não pertence a esta proposta. Nada foi gravado.");
      }
      if (l.bloqueada) throw new EmendaInvalidaError(`A ${l.rotulo} está bloqueada para emendas. Nada foi gravado.`);
      if (l.vigente.plus(i.valor).isNegative()) {
        throw new EmendaInvalidaError(
          `A redução na ${l.rotulo} (${i.valor.negated().toFixed(2)}) é maior que o valor dela na proposta (${l.vigente.toFixed(2)}). Nada foi gravado.`
        );
      }
    }
    const ultima = await tx.emendaAoOrcamento.findFirst({
      where: { propostaOrcamentariaId: d.propostaOrcamentariaId },
      orderBy: { numero: "desc" },
      select: { numero: true },
    });
    const numero = (ultima?.numero ?? 0) + 1;
    const e = await tx.emendaAoOrcamento.create({
      data: {
        propostaOrcamentariaId: d.propostaOrcamentariaId,
        numero,
        data: meioDiaCivil(d.data),
        objetivo: d.objetivo,
        justificativa: d.justificativa,
        vereador: d.vereador,
        textoJuridico: d.textoJuridico,
        criadoPor: d.criadoPor,
        itens: { create: d.itens.map((i) => ({ linhaDeDespesaId: i.linhaDeDespesaId, valor: i.valor.toFixed(2) })) },
      },
      select: { id: true },
    });
    return { id: e.id, numero };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloqueio
// ─────────────────────────────────────────────────────────────────────────────

const zBloquear = z.object({
  linhaDeDespesaId: z.string().trim().min(1),
  motivo: z.string().trim().min(5, "Informe o motivo do bloqueio."),
  criadoPor: z.string().trim().min(1),
});

/** Bloqueia uma dotação da proposta para emendas: a partir daqui nenhuma emenda nova a alcança. */
export async function bloquearDotacaoParaEmendas(prisma: PrismaClient, input: z.input<typeof zBloquear>): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zBloquear, input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.bloquearDotacaoParaEmendas, "ENTE");
    const linha = await tx.linhaDeDespesaDaProposta.findUnique({ where: { id: d.linhaDeDespesaId }, select: { propostaOrcamentariaId: true } });
    if (linha === null) throw new EmendaInvalidaError("A dotação informada não existe na proposta. Nada foi gravado.");
    await propostaAberta(tx, linha.propostaOrcamentariaId);
    const l = (await linhasComVigente(tx, [d.linhaDeDespesaId])).get(d.linhaDeDespesaId)!;
    if (l.bloqueada) throw new EmendaInvalidaError(`A ${l.rotulo} já está bloqueada para emendas. Nada foi gravado.`);
    return tx.bloqueioDeEmenda.create({ data: { linhaDeDespesaId: d.linhaDeDespesaId, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
  });
}

const zRevogar = z.object({
  bloqueioId: z.string().trim().min(1),
  motivo: z.string().trim().min(5, "Informe o motivo da liberação."),
  criadoPor: z.string().trim().min(1),
});

/** Libera a dotação: um registro novo que revoga o bloqueio (o bloqueio fica no histórico). */
export async function revogarBloqueioDeEmenda(prisma: PrismaClient, input: z.input<typeof zRevogar>): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zRevogar, input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarBloqueioDeEmenda, "ENTE");
    const b = await tx.bloqueioDeEmenda.findUnique({
      where: { id: d.bloqueioId },
      select: { linhaDeDespesaId: true, revogaDeId: true, revogadoPor: { select: { id: true } }, linhaDeDespesa: { select: { propostaOrcamentariaId: true } } },
    });
    if (b === null || b.revogaDeId !== null) throw new EmendaInvalidaError("O bloqueio informado não existe. Nada foi gravado.");
    await propostaAberta(tx, b.linhaDeDespesa.propostaOrcamentariaId);
    if (b.revogadoPor !== null) throw new EmendaInvalidaError("Este bloqueio já foi liberado. Nada foi gravado.");
    return tx.bloqueioDeEmenda.create({
      data: { linhaDeDespesaId: b.linhaDeDespesaId, motivo: d.motivo, revogaDeId: d.bloqueioId, criadoPor: d.criadoPor },
      select: { id: true },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanção
// ─────────────────────────────────────────────────────────────────────────────

const zSancionar = z.object({
  emendaId: z.string().trim().min(1),
  resultado: z.enum(["APROVADA", "REJEITADA", "PARCIAL"]),
  /** Só na PARCIAL: os itens sancionados. */
  itensAprovados: z.array(z.string().trim().min(1)).default([]),
  data: zDia,
  ato: z.string().trim().min(3, "Informe o ato da sanção ou do veto."),
  criadoPor: z.string().trim().min(1),
});

/**
 * REGISTRA A SANÇÃO e leva os itens aprovados à proposta. Aprovação total: todos os itens; reprovação total: nenhum;
 * parcial: os escolhidos — ao menos um, e não todos (todos é aprovação total, e chamar de parcial esconderia isso).
 * Cada item aprovado vira um ajuste da linha com valor = vigente + item; se algum ficar negativo (a linha foi reduzida
 * por outro caminho depois da emenda), NADA é gravado.
 */
export async function sancionarEmendaAoOrcamento(
  prisma: PrismaClient,
  input: z.input<typeof zSancionar>
): Promise<{ readonly id: string; readonly itensAprovados: number }> {
  const d = lerOuRecusar(zSancionar, input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.sancionarEmendaAoOrcamento, "ENTE");
    const emenda = await tx.emendaAoOrcamento.findUnique({
      where: { id: d.emendaId },
      select: { numero: true, propostaOrcamentariaId: true, sancao: { select: { id: true } }, itens: { select: { id: true, linhaDeDespesaId: true, valor: true } } },
    });
    if (emenda === null) throw new EmendaInvalidaError("A emenda informada não existe. Nada foi gravado.");
    await propostaAberta(tx, emenda.propostaOrcamentariaId);
    if (emenda.sancao !== null) throw new EmendaInvalidaError(`A emenda nº ${String(emenda.numero)} já foi sancionada ou vetada. Nada foi gravado.`);

    const doItem = new Set(emenda.itens.map((i) => i.id));
    let aprovados: typeof emenda.itens;
    if (d.resultado === "APROVADA") aprovados = emenda.itens;
    else if (d.resultado === "REJEITADA") aprovados = [];
    else {
      const escolhidos = new Set(d.itensAprovados);
      if (escolhidos.size === 0) throw new EmendaInvalidaError("Na sanção parcial, informe quais dotações foram sancionadas. Nada foi gravado.");
      if ([...escolhidos].some((id) => !doItem.has(id))) throw new EmendaInvalidaError("Uma das dotações escolhidas não é desta emenda. Nada foi gravado.");
      if (escolhidos.size === emenda.itens.length) {
        throw new EmendaInvalidaError("Todas as dotações foram escolhidas: isso é aprovação total, não sanção parcial. Nada foi gravado.");
      }
      aprovados = emenda.itens.filter((i) => escolhidos.has(i.id));
    }

    const linhas = await linhasComVigente(tx, aprovados.map((i) => i.linhaDeDespesaId));
    const novos = aprovados.map((i) => {
      const l = linhas.get(i.linhaDeDespesaId)!;
      const novo = toMoney(l.vigente.plus(toMoney(i.valor.toFixed(2))));
      if (novo.isNegative()) {
        throw new EmendaInvalidaError(
          `A ${l.rotulo} tem hoje ${l.vigente.toFixed(2)} na proposta, e a redução da emenda a deixaria negativa. Nada foi gravado.`
        );
      }
      return { item: i, novo };
    });

    const sancao = await tx.sancaoDaEmenda.create({
      data: { emendaId: d.emendaId, resultado: d.resultado, data: meioDiaCivil(d.data), ato: d.ato, criadoPor: d.criadoPor },
      select: { id: true },
    });
    const dia = diaCivil(meioDiaCivil(d.data)).split("-").reverse().join("/");
    for (const { item, novo } of novos) {
      const ajuste = await tx.ajusteDeDespesaDaProposta.create({
        data: { linhaId: item.linhaDeDespesaId, valor: novo.toFixed(2), motivo: `Emenda nº ${String(emenda.numero)} sancionada em ${dia} (${d.ato})`, criadoPor: d.criadoPor },
        select: { id: true },
      });
      await tx.itemSancionado.create({ data: { sancaoId: sancao.id, itemId: item.id, ajusteId: ajuste.id } });
    }
    return { id: sancao.id, itensAprovados: novos.length };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDaEmenda = "AGUARDANDO_SANCAO" | "APROVADA" | "REJEITADA" | "PARCIAL";

export interface EmendaNaLista {
  readonly id: string;
  readonly numero: number;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly situacao: SituacaoDaEmenda;
  readonly ato: string | null;
  readonly dataDaSancao: string | null;
  readonly acrescimos: Money;
  readonly reducoes: Money;
  readonly itens: readonly { readonly id: string; readonly linhaDeDespesaId: string; readonly valor: Money; readonly sancionado: boolean | null }[];
}

/** As emendas de uma proposta, com a situação DERIVADA da sanção (sem sanção: aguardando). */
export async function emendasDaProposta(prisma: PrismaClient, propostaOrcamentariaId: string): Promise<readonly EmendaNaLista[]> {
  const emendas = await prisma.emendaAoOrcamento.findMany({
    where: { propostaOrcamentariaId },
    orderBy: { numero: "asc" },
    select: {
      id: true, numero: true, data: true, objetivo: true, justificativa: true, vereador: true, textoJuridico: true,
      sancao: { select: { resultado: true, ato: true, data: true, itensAprovados: { select: { itemId: true } } } },
      itens: { select: { id: true, linhaDeDespesaId: true, valor: true } },
    },
  });
  return emendas.map((e) => {
    const aprovados = new Set(e.sancao?.itensAprovados.map((i) => i.itemId) ?? []);
    let acrescimos = toMoney("0.00");
    let reducoes = toMoney("0.00");
    const itens = e.itens.map((i) => {
      const valor = toMoney(i.valor.toFixed(2));
      if (valor.isNegative()) reducoes = toMoney(reducoes.plus(valor.negated()));
      else acrescimos = toMoney(acrescimos.plus(valor));
      return { id: i.id, linhaDeDespesaId: i.linhaDeDespesaId, valor, sancionado: e.sancao === null ? null : aprovados.has(i.id) };
    });
    return {
      id: e.id, numero: e.numero, data: diaCivil(e.data), objetivo: e.objetivo, justificativa: e.justificativa, vereador: e.vereador, textoJuridico: e.textoJuridico,
      situacao: e.sancao === null ? "AGUARDANDO_SANCAO" : e.sancao.resultado,
      ato: e.sancao?.ato ?? null,
      dataDaSancao: e.sancao === null ? null : diaCivil(e.sancao.data),
      acrescimos, reducoes, itens,
    };
  });
}
