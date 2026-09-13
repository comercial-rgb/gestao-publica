import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ordemEstornada, situacaoDaSolicitacao } from "./compras.js";

/**
 * ═══ M11 — O VÍNCULO SOLICITAÇÃO × ORDEM, POR ITEM E QUANTIDADE (V6 P1.1) ═══
 *
 * Fecha `SOLICITACAO-SEM-VINCULO-COM-A-ORDEM` pelo MODELO, não por texto livre: uma
 * ALOCAÇÃO liga uma quantidade de um item da solicitação a um item da ordem. Uma solicitação
 * pode ser atendida em parte por várias ordens; uma ordem pode atender várias solicitações.
 *
 * ═══ TUDO É DERIVADO ═══
 *   · ordenado  = Σ alocações vivas (sem estorno) em ordens vivas (sem estorno);
 *   · recebido  = a parte dos recebimentos do item da ordem ATRIBUÍDA à alocação — por ordem
 *                 de criação das alocações (a primeira alocada é a primeira servida);
 *   · cancelado = Σ alocações desfeitas + Σ alocações de ordens estornadas;
 *   · pendente  = solicitado − ordenado.
 * "Ordenado" NÃO é "atendido": só o recebido é.
 *
 * ═══ CONTROLES ═══
 *   · a solicitação precisa estar AUTORIZADA; o item precisa ser dela e o item da ordem ser da ordem;
 *   · material do item da solicitação = material do item da ordem (unidade incompatível não entra);
 *   · Σ alocado ao item da solicitação ≤ solicitado; Σ alocado ao item da ordem ≤ quantidade da ordem;
 *   · duas ordens concorrentes: lock advisory no item da solicitação (soma-decide-grava);
 *   · desfazer só o que não tem recebimento atribuído; é linha nova com `estornoDeId`;
 *   · legado: item de ordem sem alocação é "sem origem" — nenhum match automático.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const zQuantidade = z
  .union([z.string(), z.number()])
  .transform((v) => new Decimal(v))
  .refine((d) => d.greaterThan(0), "quantidade deve ser > 0");

export const zLinhaDeAlocacao = z.object({
  itemDeSolicitacaoId: z.string().min(1),
  itemDeOrdemId: z.string().min(1),
  quantidade: zQuantidade,
});

export const zVincularSolicitacaoAOrdemInput = z.object({
  ordemId: z.string().min(1),
  alocacoes: z.array(zLinhaDeAlocacao).min(1, "um vínculo sem parcela não liga nada"),
  criadoPor: z.string().min(1),
});
export type VincularSolicitacaoAOrdemInput = z.input<typeof zVincularSolicitacaoAOrdemInput>;

export const zDesfazerVinculoInput = z.object({
  alocacaoId: z.string().min(1),
  motivo: z.string().trim().min(5, "motivo com ao menos 5 caracteres"),
  criadoPor: z.string().min(1),
});
export type DesfazerVinculoInput = z.input<typeof zDesfazerVinculoInput>;

/** Σ das alocações VIVAS (sem estorno) de um conjunto, por chave. */
function somaViva(
  alocacoes: readonly { readonly quantidade: { toFixed(n: number): string }; readonly estornoDeId: string | null; readonly estorno: { readonly id: string } | null }[]
): Money {
  let s = toMoney("0");
  for (const a of alocacoes) {
    if (a.estornoDeId !== null || a.estorno !== null) continue;
    s = s.plus(toMoney(a.quantidade.toFixed(4)));
  }
  return s;
}

/**
 * ALOCAR DENTRO DE UMA TRANSAÇÃO QUE JÁ AUTORIZOU — o composável que `emitirOrdemDeCompra`
 * (ordem formada a partir da solicitação) e `vincularSolicitacaoAOrdem` compartilham. A
 * autorização é do chamador; aqui ficam SÓ os controles do vínculo.
 */
export async function alocarDentroDaTransacao(
  tx: Tx,
  ordemId: string,
  alocacoes: readonly z.output<typeof zLinhaDeAlocacao>[],
  criadoPor: string
): Promise<readonly { readonly alocacaoId: string; readonly quantidade: Money }[]> {
  if (await ordemEstornada(tx, ordemId)) {
    throw new Error(`A ordem ${ordemId} está ESTORNADA: não recebe vínculo novo. Nada foi gravado.`);
  }
  // ⚠️ O LOCK vem ANTES de qualquer soma: duas ordens alocando o mesmo saldo serializam aqui.
  const idsDeItem = [...new Set(alocacoes.map((a) => a.itemDeSolicitacaoId))];
  await travar(tx, "ItemDeSolicitacaoDeCompra", idsDeItem);

  const itensDaOrdem = await tx.itemDeOrdemDeCompra.findMany({
    where: { ordemId },
    select: { id: true, materialId: true, quantidade: true, origens: { select: { quantidade: true, estornoDeId: true, estorno: { select: { id: true } } } } },
  });
  const itemDaOrdemPorId = new Map(itensDaOrdem.map((i) => [i.id, i]));

  const itensDaSolicitacao = await tx.itemDeSolicitacaoDeCompra.findMany({
    where: { id: { in: idsDeItem } },
    select: {
      id: true, materialId: true, quantidade: true, solicitacaoId: true,
      solicitacao: { select: { numero: true } },
      material: { select: { codigo: true } },
      alocacoes: { select: { quantidade: true, estornoDeId: true, estorno: { select: { id: true } }, itemDeOrdem: { select: { ordemId: true } } } },
    },
  });
  const itemDaSolicitacaoPorId = new Map(itensDaSolicitacao.map((i) => [i.id, i]));

  // a situação de cada solicitação envolvida, uma vez
  const situacoes = new Map<string, "PENDENTE" | "AUTORIZADA" | "ANULADA">();
  for (const s of new Set(itensDaSolicitacao.map((i) => i.solicitacaoId))) {
    situacoes.set(s, await situacaoDaSolicitacao(tx, s));
  }
  // ordens estornadas entre as que já atendem estes itens (as alocações delas não contam)
  const ordensJaLigadas = new Set(itensDaSolicitacao.flatMap((i) => i.alocacoes.map((a) => a.itemDeOrdem.ordemId)));
  const estornadas = new Set<string>();
  for (const o of ordensJaLigadas) if (await ordemEstornada(tx, o)) estornadas.add(o);

  // acumuladores desta chamada (duas linhas para o mesmo item somam)
  const novoPorItemDaSolicitacao = new Map<string, Money>();
  const novoPorItemDaOrdem = new Map<string, Money>();
  const criadas: { readonly alocacaoId: string; readonly quantidade: Money }[] = [];

  for (const a of alocacoes) {
    const is = itemDaSolicitacaoPorId.get(a.itemDeSolicitacaoId);
    if (is === undefined) throw new Error(`Item de solicitação ${a.itemDeSolicitacaoId} não existe. Nada foi gravado.`);
    const io = itemDaOrdemPorId.get(a.itemDeOrdemId);
    if (io === undefined) throw new Error(`Item ${a.itemDeOrdemId} não é desta ordem. Nada foi gravado.`);
    const situacao = situacoes.get(is.solicitacaoId);
    if (situacao !== "AUTORIZADA") {
      throw new Error(
        `A solicitação ${is.solicitacao.numero} está ${situacao ?? "?"}: só a AUTORIZADA se liga a uma ordem. Nada foi gravado.`
      );
    }
    if (is.materialId !== io.materialId) {
      throw new Error(
        `Item incompatível: a solicitação ${is.solicitacao.numero} pede ${is.material.codigo}, e a linha da ordem é de outro material. ` +
          `Ligue cada parcela à linha do MESMO material. Nada foi gravado.`
      );
    }
    const q = toMoney(a.quantidade.toFixed(4));

    const vivasDaSolicitacao = is.alocacoes.filter((x) => !estornadas.has(x.itemDeOrdem.ordemId));
    const jaOrdenado = somaViva(vivasDaSolicitacao).plus(novoPorItemDaSolicitacao.get(is.id) ?? toMoney("0"));
    const solicitado = toMoney(is.quantidade.toFixed(4));
    if (jaOrdenado.plus(q).greaterThan(solicitado)) {
      throw new Error(
        `EXCESSO: a solicitação ${is.solicitacao.numero}, item ${is.material.codigo}, pede ${solicitado.toFixed(4)}; ` +
          `já há ${jaOrdenado.toFixed(4)} em ordens vivas e esta parcela de ${q.toFixed(4)} passaria do pedido. ` +
          `Restam ${solicitado.minus(jaOrdenado).toFixed(4)}. Nada foi gravado.`
      );
    }
    const jaNaOrdem = somaViva(io.origens).plus(novoPorItemDaOrdem.get(io.id) ?? toMoney("0"));
    const quantidadeDaOrdem = toMoney(io.quantidade.toFixed(4));
    if (jaNaOrdem.plus(q).greaterThan(quantidadeDaOrdem)) {
      throw new Error(
        `A linha da ordem tem ${quantidadeDaOrdem.toFixed(4)} e já atribui ${jaNaOrdem.toFixed(4)} a solicitações; ` +
          `mais ${q.toFixed(4)} passaria do que a ordem compra. Nada foi gravado.`
      );
    }
    novoPorItemDaSolicitacao.set(is.id, jaOrdenado.plus(q).minus(somaViva(vivasDaSolicitacao)));
    novoPorItemDaOrdem.set(io.id, jaNaOrdem.plus(q).minus(somaViva(io.origens)));

    const criada = await tx.alocacaoDeSolicitacaoNaOrdem.create({
      data: { itemDeSolicitacaoId: is.id, itemDeOrdemId: io.id, quantidade: q.toFixed(4), criadoPor },
      select: { id: true },
    });
    criadas.push({ alocacaoId: criada.id, quantidade: q });
  }
  return criadas;
}

/**
 * VINCULAR PARCELAS DE SOLICITAÇÕES A UMA ORDEM JÁ EMITIDA. O poder é o de quem emite a
 * ordem (decidir o que ela atende), no mesmo escopo da ordem.
 */
export async function vincularSolicitacaoAOrdem(
  prisma: PrismaClient,
  input: VincularSolicitacaoAOrdemInput
): Promise<{ readonly alocacoes: number; readonly quantidade: Money }> {
  const d = zVincularSolicitacaoAOrdemInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const ordem = await tx.ordemDeCompra.findUnique({
      where: { id: d.ordemId },
      select: { id: true, numero: true, ficha: { select: { unidadeOrcId: true } } },
    });
    if (ordem === null) throw new Error(`Ordem de compra ${d.ordemId} não existe.`);
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.vincularSolicitacaoAOrdem, ordem.ficha === null ? "ENTE" : { ug: ordem.ficha.unidadeOrcId });
    await travar(tx, "OrdemDeCompra", [ordem.id]);
    const criadas = await alocarDentroDaTransacao(tx, ordem.id, d.alocacoes, d.criadoPor);
    return { alocacoes: criadas.length, quantidade: criadas.reduce((s, c) => s.plus(c.quantidade), toMoney("0")) };
  });
}

/**
 * DESFAZER UMA ALOCAÇÃO — linha nova com `estornoDeId`. Recusa se já desfeita, se a ordem
 * está estornada (o estorno da ordem já a cancelou) ou se há recebimento ATRIBUÍDO a ela.
 * O poder é o de quem estorna a ordem, no escopo da ordem.
 */
export async function desfazerVinculoDaSolicitacao(
  prisma: PrismaClient,
  input: DesfazerVinculoInput
): Promise<{ readonly estornoId: string }> {
  const d = zDesfazerVinculoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const a = await tx.alocacaoDeSolicitacaoNaOrdem.findUnique({
      where: { id: d.alocacaoId },
      select: {
        id: true, quantidade: true, estornoDeId: true, itemDeSolicitacaoId: true, estorno: { select: { id: true } },
        itemDeOrdem: { select: { id: true, ordemId: true, ordem: { select: { numero: true, ficha: { select: { unidadeOrcId: true } } } } } },
        itemDeSolicitacao: { select: { solicitacao: { select: { numero: true } } } },
      },
    });
    if (a === null) throw new Error(`Alocação ${d.alocacaoId} não existe.`);
    if (a.estornoDeId !== null) throw new Error("Esta linha já É um desfazimento; não se desfaz um desfazimento.");
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.desfazerVinculoDaSolicitacao, a.itemDeOrdem.ordem.ficha === null ? "ENTE" : { ug: a.itemDeOrdem.ordem.ficha.unidadeOrcId });
    await travar(tx, "OrdemDeCompra", [a.itemDeOrdem.ordemId]);
    if (a.estorno !== null) throw new Error(`A alocação da solicitação ${a.itemDeSolicitacao.solicitacao.numero} na ordem ${a.itemDeOrdem.ordem.numero} já foi desfeita.`);
    if (await ordemEstornada(tx, a.itemDeOrdem.ordemId)) {
      throw new Error(`A ordem ${a.itemDeOrdem.ordem.numero} está ESTORNADA — o estorno dela já cancelou esta parcela. Nada foi gravado.`);
    }
    const atribuido = await recebidoAtribuido(tx, a.itemDeOrdem.id);
    const recebido = atribuido.get(a.id) ?? toMoney("0");
    if (recebido.greaterThan(0)) {
      throw new Error(
        `A parcela da solicitação ${a.itemDeSolicitacao.solicitacao.numero} na ordem ${a.itemDeOrdem.ordem.numero} já tem ` +
          `${recebido.toFixed(4)} recebido(s) atribuído(s): o material entrou por ela. Não se desfaz o que já foi entregue. Nada foi gravado.`
      );
    }
    const e = await tx.alocacaoDeSolicitacaoNaOrdem.create({
      data: { itemDeSolicitacaoId: a.itemDeSolicitacaoId, itemDeOrdemId: a.itemDeOrdem.id, quantidade: a.quantidade.toFixed(4), estornoDeId: a.id, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { estornoId: e.id };
  });
}

/**
 * O RECEBIDO ATRIBUÍDO A CADA ALOCAÇÃO VIVA DE UM ITEM DA ORDEM — por ordem de criação:
 * R = Σ recebimentos do item; a primeira alocação recebe min(sua quantidade, R), a segunda o
 * que sobrar, e assim por diante. O que exceder as alocações é entrega "sem origem".
 */
async function recebidoAtribuido(tx: Tx, itemDeOrdemId: string): Promise<Map<string, Money>> {
  const item = await tx.itemDeOrdemDeCompra.findUniqueOrThrow({
    where: { id: itemDeOrdemId },
    select: {
      recebimentos: { select: { quantidade: true } },
      origens: { orderBy: { criadoEm: "asc" }, select: { id: true, quantidade: true, estornoDeId: true, estorno: { select: { id: true } } } },
    },
  });
  let restante = item.recebimentos.reduce((s, r) => s.plus(toMoney(r.quantidade.toFixed(4))), toMoney("0"));
  const saida = new Map<string, Money>();
  for (const a of item.origens) {
    if (a.estornoDeId !== null || a.estorno !== null) continue;
    const q = toMoney(a.quantidade.toFixed(4));
    const atribuido = restante.greaterThan(q) ? q : restante.greaterThan(0) ? restante : toMoney("0");
    saida.set(a.id, atribuido);
    restante = restante.minus(atribuido);
  }
  return saida;
}

export interface ParcelaDaSolicitacao {
  readonly alocacaoId: string;
  readonly ordemId: string;
  readonly ordemNumero: string;
  readonly itemDeOrdemId: string;
  readonly quantidade: Money;
  readonly recebido: Money;
  /** "VIVA" | "DESFEITA" | "ORDEM_ESTORNADA" */
  readonly situacao: "VIVA" | "DESFEITA" | "ORDEM_ESTORNADA";
  readonly motivo: string | null;
  readonly criadoPor: string;
  readonly criadoEm: Date;
}

export interface AtendimentoDoItem {
  readonly itemId: string;
  readonly materialId: string;
  readonly materialCodigo: string;
  readonly materialDescricao: string;
  readonly solicitado: Money;
  readonly ordenado: Money;
  readonly recebido: Money;
  readonly cancelado: Money;
  readonly pendente: Money;
  readonly parcelas: readonly ParcelaDaSolicitacao[];
}

/** O ATENDIMENTO DA SOLICITAÇÃO, item a item — leitura, tudo derivado. */
export async function atendimentoDaSolicitacao(tx: Tx, solicitacaoId: string): Promise<readonly AtendimentoDoItem[]> {
  const itens = await tx.itemDeSolicitacaoDeCompra.findMany({
    where: { solicitacaoId },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true, materialId: true, quantidade: true,
      material: { select: { codigo: true, descricaoSucinta: true } },
      alocacoes: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true, quantidade: true, estornoDeId: true, motivo: true, criadoPor: true, criadoEm: true,
          estorno: { select: { id: true, motivo: true } },
          itemDeOrdem: { select: { id: true, ordemId: true, ordem: { select: { numero: true, movimentos: { where: { tipo: "ESTORNO" }, select: { id: true } } } } } },
        },
      },
    },
  });
  const saida: AtendimentoDoItem[] = [];
  for (const i of itens) {
    const atribuidoPorItemDaOrdem = new Map<string, Map<string, Money>>();
    const parcelas: ParcelaDaSolicitacao[] = [];
    let ordenado = toMoney("0");
    let recebido = toMoney("0");
    let cancelado = toMoney("0");
    for (const a of i.alocacoes) {
      if (a.estornoDeId !== null) continue; // a linha de estorno aparece pela original
      const q = toMoney(a.quantidade.toFixed(4));
      const estornada = a.itemDeOrdem.ordem.movimentos.length > 0;
      const situacao: ParcelaDaSolicitacao["situacao"] = a.estorno !== null ? "DESFEITA" : estornada ? "ORDEM_ESTORNADA" : "VIVA";
      let rec = toMoney("0");
      if (situacao === "VIVA") {
        let m = atribuidoPorItemDaOrdem.get(a.itemDeOrdem.id);
        if (m === undefined) {
          m = await recebidoAtribuido(tx, a.itemDeOrdem.id);
          atribuidoPorItemDaOrdem.set(a.itemDeOrdem.id, m);
        }
        rec = m.get(a.id) ?? toMoney("0");
        ordenado = ordenado.plus(q);
        recebido = recebido.plus(rec);
      } else {
        cancelado = cancelado.plus(q);
      }
      parcelas.push({
        alocacaoId: a.id, ordemId: a.itemDeOrdem.ordemId, ordemNumero: a.itemDeOrdem.ordem.numero, itemDeOrdemId: a.itemDeOrdem.id,
        quantidade: q, recebido: rec, situacao, motivo: a.estorno?.motivo ?? null, criadoPor: a.criadoPor, criadoEm: a.criadoEm,
      });
    }
    const solicitado = toMoney(i.quantidade.toFixed(4));
    saida.push({
      itemId: i.id, materialId: i.materialId, materialCodigo: i.material.codigo, materialDescricao: i.material.descricaoSucinta,
      solicitado, ordenado, recebido, cancelado, pendente: solicitado.minus(ordenado), parcelas,
    });
  }
  return saida;
}

export interface OrigemDoItemDaOrdem {
  readonly itemId: string;
  readonly materialCodigo: string;
  readonly materialDescricao: string;
  readonly quantidade: Money;
  readonly parcelas: readonly {
    readonly alocacaoId: string;
    readonly solicitacaoId: string;
    readonly solicitacaoNumero: string;
    readonly setor: string;
    readonly solicitante: string;
    readonly quantidade: Money;
    readonly recebido: Money;
    readonly situacao: "VIVA" | "DESFEITA";
  }[];
  /** quantidade − Σ parcelas vivas: compra direta ou legado sem vínculo — nunca casada automaticamente. */
  readonly semOrigem: Money;
}

/** A ORIGEM DA ORDEM, item a item — leitura, tudo derivado. */
export async function origemDaOrdem(tx: Tx, ordemId: string): Promise<readonly OrigemDoItemDaOrdem[]> {
  const itens = await tx.itemDeOrdemDeCompra.findMany({
    where: { ordemId },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true, quantidade: true,
      material: { select: { codigo: true, descricaoSucinta: true } },
      origens: {
        orderBy: { criadoEm: "asc" },
        select: {
          id: true, quantidade: true, estornoDeId: true, estorno: { select: { id: true } },
          itemDeSolicitacao: { select: { solicitacaoId: true, solicitacao: { select: { numero: true, solicitante: true, setor: { select: { codigo: true, nome: true } } } } } },
        },
      },
    },
  });
  const saida: OrigemDoItemDaOrdem[] = [];
  for (const i of itens) {
    const atribuido = await recebidoAtribuido(tx, i.id);
    let vivas = toMoney("0");
    const parcelas = i.origens
      .filter((a) => a.estornoDeId === null)
      .map((a) => {
        const q = toMoney(a.quantidade.toFixed(4));
        const situacao: "VIVA" | "DESFEITA" = a.estorno === null ? "VIVA" : "DESFEITA";
        if (situacao === "VIVA") vivas = vivas.plus(q);
        return {
          alocacaoId: a.id, solicitacaoId: a.itemDeSolicitacao.solicitacaoId, solicitacaoNumero: a.itemDeSolicitacao.solicitacao.numero,
          setor: `${a.itemDeSolicitacao.solicitacao.setor.codigo} — ${a.itemDeSolicitacao.solicitacao.setor.nome}`,
          solicitante: a.itemDeSolicitacao.solicitacao.solicitante,
          quantidade: q, recebido: atribuido.get(a.id) ?? toMoney("0"), situacao,
        };
      });
    const quantidade = toMoney(i.quantidade.toFixed(4));
    saida.push({ itemId: i.id, materialCodigo: i.material.codigo, materialDescricao: i.material.descricaoSucinta, quantidade, parcelas, semOrigem: quantidade.minus(vivas) });
  }
  return saida;
}
