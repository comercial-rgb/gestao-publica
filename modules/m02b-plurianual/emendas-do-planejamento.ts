import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, inicioDoDiaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { MODELO_DO_ALVO, PECA_DO_ALVO, grandezaPertenceAoAlvo, rotuloDaGrandeza, type AlvoDaAlteracao } from "./alteracao.js";
import { gravarItensNoAtoDaLei, lerLinhaDoAlvo } from "./servico-alteracao.js";

/**
 * V36 — EMENDAS AO PPA E À LDO (TR 5.9.1.21 a 5.9.1.23 e 5.9.2.11 a 5.9.2.13).
 *
 * O rito das emendas ao projeto da LOA (`emendas.ts`) — cadastro com data, objetivo, justificativa, vereador e texto
 * jurídico; bloqueio do que não pode ser emendado; sanção total, parcial ou veto — com o ALVO da peça: o item aponta a
 * mesma linha planejada que o ato de alteração do planejamento alcança (previsão de receita, programa e ação do PPA;
 * metas fiscais anuais da LDO), com a grandeza e o sinal do ajuste.
 *
 * ═══ ONDE A EMENDA ATUA ═══
 * A emenda sozinha não muda valor nenhum. A SANÇÃO grava o ATO DE ALTERAÇÃO DO PLANEJAMENTO com os itens aprovados
 * (`gravarItensNoAtoDaLei`), pelo guard que já existe: o valor vigente não pode violar o que o banco recusa na linha,
 * no estado atual e no da data da lei. Por isso a viabilidade de uma redução é conferida NA SANÇÃO — é ali que ela
 * vira valor —, e a recusa nomeia a linha e o motivo. Duas emendas sancionadas pela mesma lei entram no mesmo ato.
 *
 * ═══ "DOTAÇÃO" NA LDO ═══
 * A LDO deste sistema não tem previsão orçamentária (pendência LDO-SEM-PREVISAO-ORCAMENTARIA): o valor que a emenda à
 * LDO altera é a META FISCAL anual, o único que o ato de alteração versiona. Decisão local e reversível: quando houver
 * previsão orçamentária na LDO, ela entra como mais um alvo do ato, e a emenda a alcança sem mudar de forma.
 *
 * ═══ AS DUAS AUTORIDADES ═══
 * As mesmas das emendas da LOA: CADASTRAR_EMENDA_AO_ORCAMENTO (cadastro, bloqueio, liberação) e
 * SANCIONAR_EMENDA_AO_ORCAMENTO (sanção). O TR chama as três peças de "emendas do orçamento"; separar crachás por peça
 * daria ao ente uma escolha que não significa nada.
 *
 * ⚠️ INSERT-ONLY. A situação da emenda e o bloqueio vivo são DERIVADOS. Cada ato trava a PEÇA antes de ler.
 */

export class EmendaDoPlanejamentoInvalidaError extends Error {
  constructor(m: string) {
    super(m);
    this.name = "EmendaDoPlanejamentoInvalidaError";
  }
}

function lerOuRecusar<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new EmendaDoPlanejamentoInvalidaError(`${r.error.issues[0]?.message ?? "Dados inválidos."} Nada foi gravado.`);
  return r.data;
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
export type PecaDaEmenda = "PPA" | "LDO";

/** O dia existe no calendário ("2026-02-30" passa na forma e rolaria em silêncio). */
const zDia = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data no formato dd/mm/aaaa.")
  .refine((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || diaCivil(inicioDoDiaCivil(d)) === d, "A data informada não existe no calendário.");
const zValorComSinal = z
  .string()
  .trim()
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), "Informe o valor do item em reais, com sinal de menos na redução (ex.: -1.000,00).")
  .transform((v) => toMoney(v));
const zAlvo = z.enum(["PREVISAO_RECEITA_PPA", "PROGRAMA_PPA", "ACAO_PPA", "META_ANUAL_LDO"]);
const zLinha = z.object({ alvo: zAlvo, alvoId: z.string().trim().min(1), grandeza: z.string().trim().min(1) });

/** A coluna tipada do alvo, para gravar e filtrar. */
const fkDo = (alvo: AlvoDaAlteracao, alvoId: string): Record<string, string> => ({ [MODELO_DO_ALVO[alvo].fk]: alvoId });
const chaveDa = (l: { alvo: string; alvoId: string; grandeza: string }): string => `${l.alvo}|${l.alvoId}|${l.grandeza}`;

async function exigirPeca(tx: Tx, peca: PecaDaEmenda, pecaId: string): Promise<void> {
  await travar(tx, "PecaDoPlanejamento", [pecaId]);
  const existe =
    peca === "PPA"
      ? await tx.planoPlurianual.findUnique({ where: { id: pecaId }, select: { id: true } })
      : await tx.leiDiretrizesOrcamentarias.findUnique({ where: { id: pecaId }, select: { id: true } });
  if (existe === null) throw new EmendaDoPlanejamentoInvalidaError(`${peca === "PPA" ? "O plano plurianual" : "A LDO"} informad${peca === "PPA" ? "o" : "a"} não existe. Nada foi gravado.`);
}

/** A linha planejada da peça, com o rótulo — ou a recusa nomeando por quê. */
async function linhaDaPeca(tx: Tx, peca: PecaDaEmenda, pecaId: string, l: { alvo: AlvoDaAlteracao; alvoId: string; grandeza: string }): Promise<string> {
  if (PECA_DO_ALVO[l.alvo] !== peca) throw new EmendaDoPlanejamentoInvalidaError(`Um dos itens aponta uma linha ${peca === "PPA" ? "da LDO" : "do PPA"}: a emenda altera só a peça a que pertence. Nada foi gravado.`);
  if (!grandezaPertenceAoAlvo(l.alvo, l.grandeza)) throw new EmendaDoPlanejamentoInvalidaError(`O valor "${l.grandeza}" não pertence à linha escolhida. Nada foi gravado.`);
  const linha = await lerLinhaDoAlvo(tx, l.alvo, l.alvoId);
  if (linha === null || linha.pecaId !== pecaId) throw new EmendaDoPlanejamentoInvalidaError("Uma das linhas informadas não pertence a esta peça. Nada foi gravado.");
  return `${linha.rotulo} (${rotuloDaGrandeza(l.grandeza).toLowerCase()})`;
}

async function bloqueioVivo(tx: Tx, l: { alvo: AlvoDaAlteracao; alvoId: string; grandeza: string }): Promise<{ readonly id: string } | null> {
  return tx.bloqueioDeEmendaAoPlanejamento.findFirst({
    where: { ...fkDo(l.alvo, l.alvoId), grandeza: l.grandeza, revogaDeId: null, revogadoPor: null },
    select: { id: true },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cadastro
// ─────────────────────────────────────────────────────────────────────────────

const zCadastrar = z.object({
  peca: z.enum(["PPA", "LDO"]),
  pecaId: z.string().trim().min(1),
  data: zDia,
  objetivo: z.string().trim().min(3, "Informe o objetivo da emenda."),
  justificativa: z.string().trim().min(3, "Informe a justificativa da emenda."),
  vereador: z.string().trim().min(3, "Informe o vereador responsável pela emenda."),
  textoJuridico: z.string().trim().min(3, "Informe o texto jurídico da emenda."),
  itens: z.array(zLinha.extend({ valor: zValorComSinal })).min(1, "Informe ao menos uma linha com acréscimo ou redução."),
  criadoPor: z.string().trim().min(1),
});

export async function cadastrarEmendaAoPlanejamento(
  prisma: PrismaClient,
  input: z.input<typeof zCadastrar>
): Promise<{ readonly id: string; readonly numero: number }> {
  const d = lerOuRecusar(zCadastrar, input);
  const vistos = new Set<string>();
  for (const i of d.itens) {
    if (i.valor.isZero()) throw new EmendaDoPlanejamentoInvalidaError("Um item da emenda está com valor zero: informe o acréscimo ou a redução. Nada foi gravado.");
    if (vistos.has(chaveDa(i))) throw new EmendaDoPlanejamentoInvalidaError("A mesma linha aparece duas vezes na emenda. Nada foi gravado.");
    vistos.add(chaveDa(i));
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cadastrarEmendaAoPlanejamento, "ENTE");
    await exigirPeca(tx, d.peca, d.pecaId);
    for (const i of d.itens) {
      const rotulo = await linhaDaPeca(tx, d.peca, d.pecaId, i);
      if ((await bloqueioVivo(tx, i)) !== null) throw new EmendaDoPlanejamentoInvalidaError(`A linha ${rotulo} está bloqueada para emendas. Nada foi gravado.`);
    }
    const daPeca = d.peca === "PPA" ? { planoId: d.pecaId } : { ldoId: d.pecaId };
    const ultima = await tx.emendaAoPlanejamento.findFirst({ where: daPeca, orderBy: { numero: "desc" }, select: { numero: true } });
    const numero = (ultima?.numero ?? 0) + 1;
    const e = await tx.emendaAoPlanejamento.create({
      data: {
        ...daPeca,
        numero,
        data: meioDiaCivil(d.data),
        objetivo: d.objetivo,
        justificativa: d.justificativa,
        vereador: d.vereador,
        textoJuridico: d.textoJuridico,
        criadoPor: d.criadoPor,
        itens: { create: d.itens.map((i) => ({ ...fkDo(i.alvo, i.alvoId), grandeza: i.grandeza, valor: i.valor.toFixed(2) })) },
      },
      select: { id: true },
    });
    return { id: e.id, numero };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloqueio
// ─────────────────────────────────────────────────────────────────────────────

const zBloquear = zLinha.extend({
  motivo: z.string().trim().min(5, "Informe o motivo do bloqueio."),
  criadoPor: z.string().trim().min(1),
});

/** Bloqueia uma linha da peça (alvo e valor) para emendas: daqui em diante nenhuma emenda nova a alcança. */
export async function bloquearLinhaParaEmendas(prisma: PrismaClient, input: z.input<typeof zBloquear>): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zBloquear, input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.bloquearLinhaParaEmendas, "ENTE");
    const linha = await lerLinhaDoAlvo(tx, d.alvo, d.alvoId);
    if (linha === null) throw new EmendaDoPlanejamentoInvalidaError("A linha informada não existe. Nada foi gravado.");
    await exigirPeca(tx, PECA_DO_ALVO[d.alvo], linha.pecaId);
    const rotulo = await linhaDaPeca(tx, PECA_DO_ALVO[d.alvo], linha.pecaId, d);
    if ((await bloqueioVivo(tx, d)) !== null) throw new EmendaDoPlanejamentoInvalidaError(`A linha ${rotulo} já está bloqueada para emendas. Nada foi gravado.`);
    return tx.bloqueioDeEmendaAoPlanejamento.create({ data: { ...fkDo(d.alvo, d.alvoId), grandeza: d.grandeza, motivo: d.motivo, criadoPor: d.criadoPor }, select: { id: true } });
  });
}

const zRevogar = z.object({
  bloqueioId: z.string().trim().min(1),
  motivo: z.string().trim().min(5, "Informe o motivo da liberação."),
  criadoPor: z.string().trim().min(1),
});

/** Libera a linha: um registro novo que revoga o bloqueio (o bloqueio fica no histórico). */
export async function revogarBloqueioDeEmendaAoPlanejamento(prisma: PrismaClient, input: z.input<typeof zRevogar>): Promise<{ readonly id: string }> {
  const d = lerOuRecusar(zRevogar, input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.revogarBloqueioDeEmendaAoPlanejamento, "ENTE");
    const b = await tx.bloqueioDeEmendaAoPlanejamento.findUnique({
      where: { id: d.bloqueioId },
      select: { previsaoReceitaPpaId: true, programaPpaId: true, acaoPpaId: true, metaAnualLdoId: true, grandeza: true, revogaDeId: true },
    });
    if (b === null || b.revogaDeId !== null) throw new EmendaDoPlanejamentoInvalidaError("O bloqueio informado não existe. Nada foi gravado.");
    const alvo = alvoDoRegistro(b);
    const linha = await lerLinhaDoAlvo(tx, alvo.alvo, alvo.alvoId);
    if (linha === null) throw new EmendaDoPlanejamentoInvalidaError("A linha do bloqueio não existe mais. Nada foi gravado.");
    await exigirPeca(tx, PECA_DO_ALVO[alvo.alvo], linha.pecaId);
    // Relido DEPOIS da trava: duas liberações simultâneas leriam "ainda não liberado" antes dela.
    const ja = await tx.bloqueioDeEmendaAoPlanejamento.findFirst({ where: { revogaDeId: d.bloqueioId }, select: { id: true } });
    if (ja !== null) throw new EmendaDoPlanejamentoInvalidaError("Este bloqueio já foi liberado. Nada foi gravado.");
    return tx.bloqueioDeEmendaAoPlanejamento.create({
      data: { ...fkDo(alvo.alvo, alvo.alvoId), grandeza: b.grandeza, motivo: d.motivo, revogaDeId: d.bloqueioId, criadoPor: d.criadoPor },
      select: { id: true },
    });
  });
}

/** O alvo de um registro com as quatro colunas tipadas (exatamente uma preenchida, pelo CHECK). */
function alvoDoRegistro(r: {
  readonly previsaoReceitaPpaId: string | null;
  readonly programaPpaId: string | null;
  readonly acaoPpaId: string | null;
  readonly metaAnualLdoId: string | null;
}): { readonly alvo: AlvoDaAlteracao; readonly alvoId: string } {
  if (r.previsaoReceitaPpaId !== null) return { alvo: "PREVISAO_RECEITA_PPA", alvoId: r.previsaoReceitaPpaId };
  if (r.programaPpaId !== null) return { alvo: "PROGRAMA_PPA", alvoId: r.programaPpaId };
  if (r.acaoPpaId !== null) return { alvo: "ACAO_PPA", alvoId: r.acaoPpaId };
  if (r.metaAnualLdoId !== null) return { alvo: "META_ANUAL_LDO", alvoId: r.metaAnualLdoId };
  throw new Error("Registro de emenda sem alvo: o CHECK da tabela deveria ter impedido.");
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanção
// ─────────────────────────────────────────────────────────────────────────────

const zSancionar = z.object({
  emendaId: z.string().trim().min(1),
  resultado: z.enum(["APROVADA", "REJEITADA", "PARCIAL"]),
  /** Só na PARCIAL: os itens sancionados. */
  itensAprovados: z.array(z.string().trim().min(1)).default([]),
  /** A lei da sanção (ou o ato do veto): número e ano. */
  leiNumero: z.string().trim().min(1, "Informe o número da lei ou do ato."),
  leiAno: z.number().int().min(1900).max(2200),
  data: zDia,
  /** A publicação da lei (na rejeitada, a do ato do veto). Não antes da data. */
  dataPublicacao: zDia,
  criadoPor: z.string().trim().min(1),
});

/**
 * REGISTRA A SANÇÃO. Aprovação total: todos os itens; reprovação total: nenhum (e nenhum ato de alteração); parcial: os
 * escolhidos — ao menos um, e não todos. Os aprovados entram no ATO DE ALTERAÇÃO da lei (criado ou o já existente da
 * mesma lei), pelo guard do ato; se algum item tornar uma linha inviável, NADA é gravado.
 */
export async function sancionarEmendaAoPlanejamento(
  prisma: PrismaClient,
  input: z.input<typeof zSancionar>
): Promise<{ readonly id: string; readonly itensAprovados: number; readonly atoId: string | null }> {
  const d = lerOuRecusar(zSancionar, input);
  if (d.dataPublicacao < d.data) throw new EmendaDoPlanejamentoInvalidaError("A publicação não pode ser anterior à data da lei. Nada foi gravado.");
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.sancionarEmendaAoPlanejamento, "ENTE");
    const cabeca = await tx.emendaAoPlanejamento.findUnique({ where: { id: d.emendaId }, select: { planoId: true, ldoId: true } });
    if (cabeca === null) throw new EmendaDoPlanejamentoInvalidaError("A emenda informada não existe. Nada foi gravado.");
    const peca: PecaDaEmenda = cabeca.planoId !== null ? "PPA" : "LDO";
    const pecaId = (cabeca.planoId ?? cabeca.ldoId) as string;
    await exigirPeca(tx, peca, pecaId);
    // Relida DEPOIS da trava: duas sanções simultâneas leriam "sem sanção" antes dela.
    const emenda = await tx.emendaAoPlanejamento.findUniqueOrThrow({
      where: { id: d.emendaId },
      select: {
        numero: true,
        vereador: true,
        sancao: { select: { id: true } },
        itens: { select: { id: true, previsaoReceitaPpaId: true, programaPpaId: true, acaoPpaId: true, metaAnualLdoId: true, grandeza: true, valor: true } },
      },
    });
    if (emenda.sancao !== null) throw new EmendaDoPlanejamentoInvalidaError(`A emenda nº ${String(emenda.numero)} já foi sancionada ou vetada. Nada foi gravado.`);

    const doItem = new Set(emenda.itens.map((i) => i.id));
    let aprovados: typeof emenda.itens;
    if (d.resultado === "APROVADA") aprovados = emenda.itens;
    else if (d.resultado === "REJEITADA") aprovados = [];
    else {
      const escolhidos = new Set(d.itensAprovados);
      if (escolhidos.size === 0) throw new EmendaDoPlanejamentoInvalidaError("Na sanção parcial, informe quais linhas foram sancionadas. Nada foi gravado.");
      if ([...escolhidos].some((id) => !doItem.has(id))) throw new EmendaDoPlanejamentoInvalidaError("Uma das linhas escolhidas não é desta emenda. Nada foi gravado.");
      if (escolhidos.size === emenda.itens.length) {
        throw new EmendaDoPlanejamentoInvalidaError("Todas as linhas foram escolhidas: isso é aprovação total, não sanção parcial. Nada foi gravado.");
      }
      aprovados = emenda.itens.filter((i) => escolhidos.has(i.id));
    }

    const data = meioDiaCivil(d.data);
    let atoId: string | null = null;
    let alteracaoIds: readonly string[] = [];
    if (aprovados.length > 0) {
      const gravado = await gravarItensNoAtoDaLei(tx, {
        peca,
        pecaId,
        numero: d.leiNumero,
        ano: d.leiAno,
        data,
        dataPublicacao: meioDiaCivil(d.dataPublicacao),
        fundamento: `Sanção da emenda nº ${String(emenda.numero)} (vereador ${emenda.vereador})`,
        itens: aprovados.map((i) => {
          const a = alvoDoRegistro(i);
          return { alvo: a.alvo, alvoId: a.alvoId, grandeza: i.grandeza, valorAjuste: i.valor.toFixed(2), justificativa: `Emenda nº ${String(emenda.numero)}` };
        }),
        criadoPor: d.criadoPor,
      });
      atoId = gravado.atoId;
      alteracaoIds = gravado.alteracaoIds;
    }
    const sancao = await tx.sancaoDaEmendaAoPlanejamento.create({
      data: { emendaId: d.emendaId, resultado: d.resultado, data, atoId, leiNumero: d.leiNumero, leiAno: d.leiAno, criadoPor: d.criadoPor },
      select: { id: true },
    });
    for (const [k, item] of aprovados.entries()) {
      await tx.itemSancionadoDoPlanejamento.create({ data: { sancaoId: sancao.id, itemId: item.id, alteracaoId: alteracaoIds[k] as string } });
    }
    return { id: sancao.id, itensAprovados: aprovados.length, atoId };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Leitura
// ─────────────────────────────────────────────────────────────────────────────

export type SituacaoDaEmendaDoPlanejamento = "AGUARDANDO_SANCAO" | "APROVADA" | "REJEITADA" | "PARCIAL";

export interface EmendaDoPlanejamentoNaLista {
  readonly id: string;
  readonly numero: number;
  readonly data: string;
  readonly objetivo: string;
  readonly justificativa: string;
  readonly vereador: string;
  readonly textoJuridico: string;
  readonly situacao: SituacaoDaEmendaDoPlanejamento;
  readonly lei: string | null;
  readonly dataDaSancao: string | null;
  readonly acrescimos: Money;
  readonly reducoes: Money;
  readonly itens: readonly { readonly id: string; readonly rotulo: string; readonly valor: Money; readonly sancionado: boolean | null }[];
}

/** As emendas de uma peça, com a situação DERIVADA da sanção e o rótulo de cada linha. */
export async function emendasDaPeca(prisma: PrismaClient, peca: PecaDaEmenda, pecaId: string): Promise<readonly EmendaDoPlanejamentoNaLista[]> {
  const emendas = await prisma.emendaAoPlanejamento.findMany({
    where: peca === "PPA" ? { planoId: pecaId } : { ldoId: pecaId },
    orderBy: { numero: "asc" },
    select: {
      id: true, numero: true, data: true, objetivo: true, justificativa: true, vereador: true, textoJuridico: true,
      sancao: { select: { resultado: true, leiNumero: true, leiAno: true, data: true, itensAprovados: { select: { itemId: true } } } },
      itens: { select: { id: true, previsaoReceitaPpaId: true, programaPpaId: true, acaoPpaId: true, metaAnualLdoId: true, grandeza: true, valor: true } },
    },
  });
  const rotulos = new Map<string, string>();
  for (const e of emendas) {
    for (const i of e.itens) {
      const a = alvoDoRegistro(i);
      const k = `${a.alvo}|${a.alvoId}`;
      if (!rotulos.has(k)) rotulos.set(k, (await lerLinhaDoAlvo(prisma, a.alvo, a.alvoId))?.rotulo ?? "linha removida");
    }
  }
  return emendas.map((e) => {
    const aprovados = new Set(e.sancao?.itensAprovados.map((i) => i.itemId) ?? []);
    let acrescimos = toMoney("0.00");
    let reducoes = toMoney("0.00");
    const itens = e.itens.map((i) => {
      const a = alvoDoRegistro(i);
      const valor = toMoney(i.valor.toFixed(2));
      if (valor.isNegative()) reducoes = toMoney(reducoes.plus(valor.negated()));
      else acrescimos = toMoney(acrescimos.plus(valor));
      return { id: i.id, rotulo: `${rotulos.get(`${a.alvo}|${a.alvoId}`) ?? ""} — ${rotuloDaGrandeza(i.grandeza).toLowerCase()}`, valor, sancionado: e.sancao === null ? null : aprovados.has(i.id) };
    });
    return {
      id: e.id, numero: e.numero, data: diaCivil(e.data), objetivo: e.objetivo, justificativa: e.justificativa, vereador: e.vereador, textoJuridico: e.textoJuridico,
      situacao: e.sancao === null ? "AGUARDANDO_SANCAO" : e.sancao.resultado,
      lei: e.sancao === null ? null : `${e.sancao.leiNumero}/${String(e.sancao.leiAno)}`,
      dataDaSancao: e.sancao === null ? null : diaCivil(e.sancao.data),
      acrescimos, reducoes, itens,
    };
  });
}

export interface BloqueioDaPeca {
  readonly id: string;
  readonly alvo: AlvoDaAlteracao;
  readonly alvoId: string;
  readonly grandeza: string;
  readonly rotulo: string;
  readonly motivo: string;
}

/** Os bloqueios VIVOS das linhas de uma peça (nenhuma liberação os revogou). */
export async function bloqueiosDaPeca(prisma: PrismaClient, peca: PecaDaEmenda, pecaId: string): Promise<readonly BloqueioDaPeca[]> {
  const vivos = await prisma.bloqueioDeEmendaAoPlanejamento.findMany({
    where: { revogaDeId: null, revogadoPor: null },
    orderBy: { criadoEm: "asc" },
    select: { id: true, previsaoReceitaPpaId: true, programaPpaId: true, acaoPpaId: true, metaAnualLdoId: true, grandeza: true, motivo: true },
  });
  const saida: BloqueioDaPeca[] = [];
  for (const b of vivos) {
    const a = alvoDoRegistro(b);
    if (PECA_DO_ALVO[a.alvo] !== peca) continue;
    const linha = await lerLinhaDoAlvo(prisma, a.alvo, a.alvoId);
    if (linha === null || linha.pecaId !== pecaId) continue;
    saida.push({ id: b.id, alvo: a.alvo, alvoId: a.alvoId, grandeza: b.grandeza, rotulo: `${linha.rotulo} — ${rotuloDaGrandeza(b.grandeza).toLowerCase()}`, motivo: b.motivo });
  }
  return saida;
}
