import { Decimal } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * ═══ M11 — AS VERSÕES DOS ITENS DO CONTRATO (V7 M2 U5) ═══
 *
 * O item guarda a quantidade e o unitário ORIGINAIS; cada aditivo por itens VIVO (não estornado) acrescenta uma versão
 * que vale a partir da vigência dele. Estas funções são a ÚNICA leitura do "vigente num dia": a ordem de serviço, a
 * medição da ordem, a medição por itens, o cadastro de item e as telas leem daqui — nenhuma lê `ItemDoContrato.quantidade`
 * como se fosse o contratado de hoje.
 *
 * ⚠️ QUANTIDADE PARA COMPROMETER: a MENOR quantidade entre a versão do dia e as versões futuras já registradas. Uma
 * supressão com vigência no mês que vem não deixa comprometer hoje o que deixará de existir amanhã.
 * ⚠️ PREÇO DE UM PERÍODO: o da versão vigente no primeiro dia. Se um novo unitário começa DENTRO do período, o período
 * se divide — quem decide onde é o fiscal, não uma proporção inventada aqui.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface VersaoDoItem {
  /** Primeiro dia (AAAA-MM-DD) em que vale; `null` na versão original do contrato. */
  readonly desde: string | null;
  readonly quantidade: Decimal;
  readonly valorUnitario: Decimal;
  readonly numeroAditivo: string | null;
}

export interface HistoricoDoItem {
  readonly itemId: string;
  /** Em ordem de vigência; a primeira é a original. */
  readonly versoes: readonly VersaoDoItem[];
}

export function versaoNoDia(h: HistoricoDoItem, dia: string): VersaoDoItem {
  let atual = h.versoes[0]!;
  for (const v of h.versoes) if (v.desde === null || v.desde <= dia) atual = v;
  return atual;
}

export function quantidadeParaComprometerDesde(h: HistoricoDoItem, dia: string): Decimal {
  let menor = versaoNoDia(h, dia).quantidade;
  for (const v of h.versoes) if (v.desde !== null && v.desde > dia && v.quantidade.lt(menor)) menor = v.quantidade;
  return menor;
}

/** A versão com unitário diferente que começa depois do primeiro dia e até o último dia do período, se houver. */
export function novoPrecoDentroDoPeriodo(h: HistoricoDoItem, inicio: string, fim: string): VersaoDoItem | null {
  const doInicio = versaoNoDia(h, inicio);
  for (const v of h.versoes) {
    if (v.desde !== null && v.desde > inicio && v.desde <= fim && !v.valorUnitario.eq(doInicio.valorUnitario)) return v;
  }
  return null;
}

export function ultimaVersao(h: HistoricoDoItem): VersaoDoItem {
  return h.versoes[h.versoes.length - 1]!;
}

/** Os históricos dos itens pedidos (por contrato ou por ids), só com aditivos vivos. */
export async function historicosDosItens(tx: Tx, filtro: { readonly contratoId: string } | { readonly ids: readonly string[] }): Promise<Map<string, HistoricoDoItem>> {
  const itens = await tx.itemDoContrato.findMany({
    where: "contratoId" in filtro ? { contratoId: filtro.contratoId } : { id: { in: [...filtro.ids] } },
    select: {
      id: true, quantidade: true, valorUnitario: true,
      // TODAS as alterações (as de aditivo estornado também): a inclusão estornada continua dizendo que o item vale zero.
      alteracoesPorAditivo: {
        select: { quantidade: true, valorUnitario: true, inclusao: true, aditivo: { select: { vigenciaInicio: true, numeroAditivo: true, criadoEm: true, estorno: { select: { id: true } } } } },
      },
    },
  });
  const mapa = new Map<string, HistoricoDoItem>();
  for (const i of itens) {
    const incluido = i.alteracoesPorAditivo.some((a) => a.inclusao);
    const posteriores = i.alteracoesPorAditivo.filter((a) => a.aditivo.estorno === null)
      .sort((a, b) => a.aditivo.vigenciaInicio.getTime() - b.aditivo.vigenciaInicio.getTime() || a.aditivo.criadoEm.getTime() - b.aditivo.criadoEm.getTime())
      .map((a): VersaoDoItem => ({ desde: diaCivil(a.aditivo.vigenciaInicio), quantidade: new Decimal(a.quantidade.toFixed(4)), valorUnitario: new Decimal(a.valorUnitario.toFixed(4)), numeroAditivo: a.aditivo.numeroAditivo }));
    mapa.set(i.id, { itemId: i.id, versoes: [{ desde: null, quantidade: incluido ? new Decimal(0) : new Decimal(i.quantidade.toFixed(4)), valorUnitario: new Decimal(i.valorUnitario.toFixed(4)), numeroAditivo: null }, ...posteriores] });
  }
  return mapa;
}

/** Os aditivos por itens do contrato, com as versões e o estorno — para o dossiê e a projeção pública (sem quem registrou). */
export async function aditivosPorItensDoContrato(prisma: Tx, contratoId: string): Promise<readonly {
  readonly id: string; readonly numeroAditivo: string; readonly dataAssinatura: string; readonly vigenciaInicio: string; readonly fundamento: string; readonly motivo: string;
  readonly variacao: string; readonly sha256: string; readonly estornado: { readonly data: string; readonly motivo: string } | null;
  readonly itens: readonly { readonly item: number; readonly descricao: string; readonly unidade: string; readonly quantidadeAnterior: string; readonly quantidade: string; readonly valorUnitarioAnterior: string; readonly valorUnitario: string; readonly variacao: string }[];
}[]> {
  const rs = await prisma.aditivoPorItensDoContrato.findMany({
    where: { contratoId },
    orderBy: [{ vigenciaInicio: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true, numeroAditivo: true, dataAssinatura: true, vigenciaInicio: true, fundamento: true, motivo: true, variacao: true, sha256: true,
      estorno: { select: { data: true, motivo: true } },
      alteracoes: { orderBy: { itemDoContrato: { numero: "asc" } }, select: { quantidadeAnterior: true, quantidade: true, valorUnitarioAnterior: true, valorUnitario: true, variacao: true, itemDoContrato: { select: { numero: true, descricao: true, unidade: true } } } },
    },
  });
  return rs.map((r) => ({
    id: r.id, numeroAditivo: r.numeroAditivo, dataAssinatura: diaCivil(r.dataAssinatura), vigenciaInicio: diaCivil(r.vigenciaInicio), fundamento: r.fundamento, motivo: r.motivo,
    variacao: r.variacao.toFixed(2), sha256: r.sha256, estornado: r.estorno === null ? null : { data: diaCivil(r.estorno.data), motivo: r.estorno.motivo },
    itens: r.alteracoes.map((x) => ({ item: x.itemDoContrato.numero, descricao: x.itemDoContrato.descricao, unidade: x.itemDoContrato.unidade, quantidadeAnterior: x.quantidadeAnterior.toFixed(4), quantidade: x.quantidade.toFixed(4), valorUnitarioAnterior: x.valorUnitarioAnterior.toFixed(4), valorUnitario: x.valorUnitario.toFixed(4), variacao: x.variacao.toFixed(2) })),
  }));
}
