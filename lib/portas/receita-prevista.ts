import { DEDUCAO_SAGRES, detalharReceitaPrevista } from "../../modules/m02-planejamento/detalhe-da-receita-prevista.js";
import { formatarMoeda } from "../format/moeda";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/**
 * V26 — A RECEITA PREVISTA DO EXERCÍCIO, linha a linha, com o que a prestação de contas pede além do valor: o subtipo da
 * dedução (§5.23) e o código como está no documento de origem. A regra é do domínio (`detalhe-da-receita-prevista.ts`).
 */

export { DEDUCAO_SAGRES };

export interface LinhaPrevistaNaTela {
  readonly id: string;
  readonly natureza: string;
  readonly descricao: string;
  readonly fonte: string;
  readonly tipo: "ORCAMENTARIA" | "INTRA_ORCAMENTARIA" | "DEDUCAO";
  readonly valor: string;
  readonly detalhe: { readonly deducao: string | null; readonly codigoNoDocumento: string | null; readonly documento: string } | null;
}

export async function lerReceitaPrevista(exercicio: number): Promise<readonly LinhaPrevistaNaTela[]> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const ls = await cliente().receitaPrevista.findMany({
    where: { exercicio },
    orderBy: [{ naturezaReceita: { codigo: "asc" } }, { fonte: { codigo: "asc" } }],
    select: { id: true, tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true, descricao: true } }, fonte: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true, codigoNoDocumento: true, documento: true } } },
  });
  return ls.map((l) => ({
    id: l.id,
    natureza: l.naturezaReceita.codigo,
    descricao: l.naturezaReceita.descricao,
    fonte: l.fonte.codigo,
    tipo: l.tipoReceita,
    valor: formatarMoeda(l.valorPrevisto.toFixed(2)).texto,
    detalhe:
      l.detalhe === null
        ? null
        : { deducao: l.detalhe.tipoDeducaoSagres === null ? null : (DEDUCAO_SAGRES[l.detalhe.tipoDeducaoSagres as "3" | "4" | "5"] ?? null), codigoNoDocumento: l.detalhe.codigoNoDocumento, documento: l.detalhe.documento },
  }));
}

export async function detalharLinhaPrevista(input: { readonly receitaPrevistaId: string; readonly tipoDeducaoSagres: "3" | "4" | "5" | null; readonly codigoNoDocumento: string | null; readonly documento: string }): Promise<string> {
  await comEscritaAutenticada("CRIAR_RECEITA_PREVISTA", (criadoPor) => detalharReceitaPrevista(cliente(), { ...input, criadoPor }));
  return "Detalhe registrado. A linha publicada não muda; o detalhe vai junto à prestação de contas.";
}
