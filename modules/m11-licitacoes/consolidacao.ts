import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { travar } from "../../packages/locks/index.js";
import { Decimal } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { situacaoDaSolicitacao } from "./compras.js";
import { atendimentoDaSolicitacao } from "./compras-alocacao.js";

/**
 * V39-R3 (R3-019, V39-039) — AS SOLICITAÇÕES DE COMPRA CONSOLIDADAS NO PROCESSO LICITATÓRIO.
 *
 * As solicitações AUTORIZADAS escolhidas viram os itens do processo: um item por material, com a quantidade = Σ do que
 * ainda falta consolidar de cada item de solicitação daquele material. Cada parcela fica gravada
 * (\`AlocacaoDeSolicitacaoNoProcesso\`): de que solicitação, de que setor, quanto. Nada se perde na soma.
 *
 * ═══ A RESERVA NÃO É TOCADA ═══
 * A solicitação não reserva dotação, e consolidar também não: a reserva continua sendo uma só, a do processo
 * (\`ReservaDotacao.processoId\`), quando houver. Consolidar e depois reservar não consome a dotação duas vezes.
 *
 * ═══ UMA VEZ, ANTES DO JULGAMENTO ═══
 * A quantidade do item do processo nasce com ele e não se reescreve (append-only). Por isso a consolidação é o ato que
 * forma os itens: processo que já tem itens (digitados ou consolidados) ou resultado é recusado, nomeando o motivo.
 * Item de solicitação já consolidado (inteiro) em outro processo não entra de novo.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const nada = " Nada foi gravado.";

export const zConsolidarSolicitacoes = z.object({
  processoId: z.string().min(1),
  solicitacaoIds: z.array(z.string().min(1)).min(1, "Escolha ao menos uma solicitação."),
  criadoPor: z.string().min(1),
});

export async function consolidarSolicitacoesNoProcesso(
  prisma: PrismaClient,
  input: z.input<typeof zConsolidarSolicitacoes>,
): Promise<{ readonly itens: number; readonly parcelas: number }> {
  const d = zConsolidarSolicitacoes.parse(input);
  const ids = [...new Set(d.solicitacaoIds)];
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.consolidarSolicitacoesNoProcesso, "ENTE");
    const solicitacoes = await tx.solicitacaoDeCompra.findMany({
      where: { id: { in: ids } },
      select: { id: true, numero: true, itens: { select: { id: true, materialId: true, quantidade: true } } },
    });
    if (solicitacoes.length !== ids.length) throw new Error(`Solicitação de compra não encontrada.${nada}`);
    // Os itens das solicitações primeiro (posto 24), o processo depois (45): duas consolidações, a ordem de compra e a
    // anulação da solicitação travam os mesmos itens; a situação e o que resta são lidos DEPOIS da trava.
    const itens = solicitacoes.flatMap((s) => s.itens.map((i) => ({ ...i, solicitacao: s.numero })));
    await travar(tx, "ItemDeSolicitacaoDeCompra", itens.map((i) => i.id));
    for (const s of solicitacoes) {
      const situacao = await situacaoDaSolicitacao(tx, s.id);
      if (situacao !== "AUTORIZADA") throw new Error(`A solicitação ${s.numero} está ${situacao === "PENDENTE" ? "pendente de autorização" : "anulada"}: só a autorizada vai ao processo.${nada}`);
    }
    const p = await tx.processoLicitatorio.findUnique({ where: { id: d.processoId }, select: { id: true, numeroProcesso: true } });
    if (p === null) throw new Error(`O processo ${d.processoId} não existe.${nada}`);
    await travar(tx, "ProcessoLicitatorio", [p.id]);
    if ((await tx.resultadoDoProcesso.count({ where: { processoId: p.id } })) > 0) {
      throw new Error(`O processo ${p.numeroProcesso} já tem resultado registrado: os itens não mudam depois do julgamento.${nada}`);
    }
    if ((await tx.itemDoProcesso.count({ where: { processoId: p.id } })) > 0) {
      throw new Error(`O processo ${p.numeroProcesso} já tem itens: a consolidação forma os itens de uma vez, e a quantidade de um item não se reescreve.${nada}`);
    }
    // O que resta de cada item: o pedido menos o que já está em ORDEM viva e o que já foi a PROCESSO — a mesma conta do
    // atendimento da solicitação (uma régua só), para a mesma necessidade não ser comprada pelos dois caminhos.
    const pendentes = new Map<string, Decimal>();
    for (const s of solicitacoes) for (const a of await atendimentoDaSolicitacao(tx, s.id)) pendentes.set(a.itemId, new Decimal(a.pendente.toFixed(4)));
    const restantes = itens
      .map((i) => ({ ...i, resta: pendentes.get(i.id) ?? new Decimal(0) }))
      .filter((i) => i.resta.greaterThan(0));
    if (restantes.length === 0) throw new Error(`As solicitações escolhidas não têm o que consolidar: já estão inteiras em processo ou em ordem de compra.${nada}`);

    const materiais = await tx.material.findMany({
      where: { id: { in: [...new Set(restantes.map((i) => i.materialId))] } },
      orderBy: { codigo: "asc" },
      select: { id: true, codigo: true, descricaoSucinta: true, unidades: { select: { ehDeEstoque: true, unidadeDeMedida: { select: { sigla: true } } } } },
    });
    let numero = 0;
    let parcelas = 0;
    for (const m of materiais) {
      // A solicitação grava a quantidade SEM unidade. Ela só se lê sem dúvida quando o material tem uma unidade só (a de
      // estoque); com mais de uma (caixa e unidade, por exemplo), o item poderia licitar 5 unidades onde se pediram 5
      // caixas — recusa nomeando, em vez de presumir (achado da auditoria).
      if (m.unidades.length !== 1 || m.unidades[0]?.ehDeEstoque !== true) {
        throw new Error(`O material ${m.codigo} tem ${m.unidades.length === 0 ? "nenhuma unidade" : "mais de uma unidade"} cadastrada, e a solicitação não diz em qual pediu: o item do processo não saberia a unidade. Forme este item à mão.${nada}`);
      }
      const sigla = m.unidades[0].unidadeDeMedida.sigla;
      const doMaterial = restantes.filter((i) => i.materialId === m.id);
      const total = doMaterial.reduce((t, i) => t.plus(i.resta), new Decimal(0));
      numero += 1;
      const item = await tx.itemDoProcesso.create({
        data: { processoId: p.id, numero, descricao: m.descricaoSucinta, unidade: sigla, quantidade: total.toFixed(4), materialId: m.id, criadoPor: d.criadoPor },
        select: { id: true },
      });
      for (const i of doMaterial) {
        await tx.alocacaoDeSolicitacaoNoProcesso.create({ data: { itemDeSolicitacaoId: i.id, itemDoProcessoId: item.id, quantidade: i.resta.toFixed(4), criadoPor: d.criadoPor } });
        parcelas += 1;
      }
    }
    return { itens: numero, parcelas };
  });
}

/** A origem de cada item do processo: as parcelas, com a solicitação, o setor e a quantidade. Leitura. */
export async function origemDosItensDoProcesso(
  tx: Tx,
  processoId: string,
): Promise<ReadonlyMap<string, readonly { readonly solicitacao: string; readonly setor: string; readonly quantidade: string }[]>> {
  const parcelas = await tx.alocacaoDeSolicitacaoNoProcesso.findMany({
    where: { itemDoProcesso: { processoId } },
    orderBy: { criadoEm: "asc" },
    select: { itemDoProcessoId: true, quantidade: true, itemDeSolicitacao: { select: { solicitacao: { select: { numero: true, setor: { select: { nome: true } } } } } } },
  });
  const por = new Map<string, { solicitacao: string; setor: string; quantidade: string }[]>();
  for (const x of parcelas) {
    const lista = por.get(x.itemDoProcessoId) ?? [];
    lista.push({ solicitacao: x.itemDeSolicitacao.solicitacao.numero, setor: x.itemDeSolicitacao.solicitacao.setor.nome, quantidade: x.quantidade.toString() });
    por.set(x.itemDoProcessoId, lista);
  }
  return por;
}

/** As solicitações autorizadas que ainda têm o que consolidar, para a tela escolher. Leitura. */
export async function solicitacoesConsolidaveis(tx: Tx): Promise<readonly { readonly id: string; readonly numero: string; readonly setor: string; readonly itens: number; readonly resumo: string }[]> {
  const todas = await tx.solicitacaoDeCompra.findMany({
    orderBy: { numero: "asc" },
    select: { id: true, numero: true, setor: { select: { nome: true } }, itens: { select: { id: true, quantidade: true } } },
  });
  const saida: { id: string; numero: string; setor: string; itens: number; resumo: string }[] = [];
  for (const s of todas) {
    if ((await situacaoDaSolicitacao(tx, s.id)) !== "AUTORIZADA") continue;
    const comResto = (await atendimentoDaSolicitacao(tx, s.id)).filter((a) => a.pendente.greaterThan(0));
    if (comResto.length > 0) saida.push({ id: s.id, numero: s.numero, setor: s.setor.nome, itens: comResto.length, resumo: comResto.map((a) => `${a.materialDescricao} ${a.pendente.toFixed(4).replace(/\.?0+$/, "")}`).join("; ") });
  }
  return saida;
}
