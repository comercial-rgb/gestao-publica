import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { familiaDoTipo } from "./documento-da-despesa";
import { ROTA_DA_ORIGEM } from "../rota-da-origem";

/**
 * UM LANÇAMENTO CONTÁBIL, INTEIRO (V31) — o elo do meio entre o relatório e o documento.
 *
 * Do razão ou do balancete chega-se aqui; daqui, cada partida abre o razão da própria conta e o lançamento
 * abre o documento de origem (empenho, liquidação, pagamento pelo dossiê do empenho; os demais pela lista).
 * O estorno aponta o original, e o original aponta os estornos — append-only, nos dois sentidos.
 *
 * ⚠️ LEITURA DO ENTE (CONSULTAR_CONTABILIDADE): o lançamento não carrega unidade gestora, e o razão de
 * onde se chega é do ente. Quem só lê uma unidade recebe a recusa com o motivo, e não o lançamento.
 */

export { PortaSemBancoError };

export interface PartidaDoLancamento {
  readonly id: string;
  readonly contaCodigo: string;
  readonly contaTitulo: string;
  readonly tipo: "DEBITO" | "CREDITO";
  readonly subsistema: string;
  readonly valor: string;
  readonly ficha: { readonly id: string; readonly numero: number; readonly exercicio: number } | null;
}

export interface LancamentoDetalhado {
  readonly id: string;
  readonly numeroControle: string;
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly natureza: string;
  readonly origemTipo: string;
  readonly origemId: string | null;
  /** Para onde o contador vai ao pedir a origem; null quando o lançamento não tem documento (manual). */
  readonly origem: { readonly href: string; readonly rotulo: string } | null;
  readonly estornoDe: { readonly id: string; readonly numeroControle: string } | null;
  readonly estornos: readonly { readonly id: string; readonly numeroControle: string }[];
  readonly partidas: readonly PartidaDoLancamento[];
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/** O destino da origem — o mesmo critério do drill da lista de lançamentos. */
export function destinoDaOrigem(origemTipo: string, origemId: string | null): { readonly href: string; readonly rotulo: string } | null {
  if (origemId === null) return null;
  const familia = familiaDoTipo(origemTipo);
  const d = ROTA_DA_ORIGEM[origemTipo];
  if (familia !== null) {
    return { href: `/despesa/documento/${encodeURIComponent(origemTipo)}/${encodeURIComponent(origemId)}`, rotulo: d?.documento ?? "Documento da despesa" };
  }
  // V33 — a arrecadação (e a anulação dela, que aponta a original) abre o PRÓPRIO registro, com a cadeia da receita.
  if (origemTipo === "ARRECADACAO" || origemTipo === "ANULACAO_RECEITA") return { href: `/receita/arrecadacoes/${encodeURIComponent(origemId)}`, rotulo: "Arrecadação" };
  if (d === undefined) return null;
  return { href: d.rota, rotulo: `${d.documento} (na lista)` };
}

export async function lerLancamento(id: string): Promise<LancamentoDetalhado | null> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const l = await cliente().lancamentoContabil.findUnique({
    where: { id },
    select: {
      id: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      natureza: true,
      origemTipo: true,
      origemId: true,
      criadoEm: true,
      criadoPor: true,
      estornoDe: { select: { id: true, numeroControle: true } },
      estornos: { select: { id: true, numeroControle: true }, orderBy: { criadoEm: "asc" } },
      partidas: {
        orderBy: [{ tipo: "asc" }, { id: "asc" }],
        select: {
          id: true,
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true, nome: true } },
          ficha: { select: { id: true, numero: true, exercicio: true } },
        },
      },
    },
  });
  if (l === null) return null;
  return {
    id: l.id,
    numeroControle: l.numeroControle,
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    natureza: l.natureza ?? "NORMAL",
    origemTipo: l.origemTipo,
    origemId: l.origemId,
    origem: destinoDaOrigem(l.origemTipo, l.origemId),
    estornoDe: l.estornoDe,
    estornos: l.estornos,
    partidas: l.partidas.map((p) => ({
      id: p.id,
      contaCodigo: p.conta.codigo,
      contaTitulo: p.conta.nome,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
      ficha: p.ficha,
    })),
    criadoEm: l.criadoEm,
    criadoPor: l.criadoPor,
  };
}
