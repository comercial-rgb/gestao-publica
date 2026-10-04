import type { DocumentoPdf } from "./documento";
import { nomeDoEnteParaDocumentos } from "./ente.js";
import { gerarBalancoFinanceiro, gerarBalancoOrcamentario } from "../portas/demonstrativos";
import { gerarFluxosDeCaixa } from "../portas/fluxos-de-caixa";
import { lerComposicao, type LinhaPedida } from "../portas/composicao";
import {
  tabelasDaComposicao,
  tabelasDoBalancoFinanceiro,
  tabelasDoBalancoOrcamentario,
  tabelasDosFluxosDeCaixa,
  type TabelasDoDocumento,
} from "../relatorios/tabelas-dos-demonstrativos";

/**
 * V34 — O PDF DO BALANÇO FINANCEIRO, DO ORÇAMENTÁRIO, DA DFC E DA COMPOSIÇÃO DE UMA LINHA. O mesmo gerador da tela
 * (`gerarBalanco*`, `gerarFluxosDeCaixa`, `lerComposicao`) e as mesmas tabelas do CSV
 * (`lib/relatorios/tabelas-dos-demonstrativos.ts`): o papel não recalcula nada.
 */
async function documento(t: TabelasDoDocumento): Promise<DocumentoPdf> {
  return { ente: await nomeDoEnteParaDocumentos(), titulo: t.titulo, subtitulo: t.subtitulo, periodo: t.periodo, secoes: t.secoes, notas: t.notas };
}

export async function montarPdfBalancoFinanceiro(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDoBalancoFinanceiro(await gerarBalancoFinanceiro({ exercicio: p.exercicio })));
}
export async function montarPdfBalancoOrcamentario(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDoBalancoOrcamentario(await gerarBalancoOrcamentario({ exercicio: p.exercicio })));
}
export async function montarPdfFluxosDeCaixa(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDosFluxosDeCaixa(await gerarFluxosDeCaixa({ exercicio: p.exercicio })));
}
export async function montarPdfComposicao(p: { readonly exercicio: number; readonly linha: LinhaPedida }): Promise<DocumentoPdf> {
  return documento(tabelasDaComposicao(await lerComposicao({ exercicio: p.exercicio, linha: p.linha }), p.exercicio));
}
