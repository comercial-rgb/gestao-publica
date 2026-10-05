import type { DocumentoPdf } from "./documento";
import { nomeDoEnteParaDocumentos } from "./ente.js";
import { gerarBalancoFinanceiro, gerarBalancoOrcamentario } from "../portas/demonstrativos";
import { gerarFluxosDeCaixa } from "../portas/fluxos-de-caixa";
import { lerComposicao, type LinhaPedida } from "../portas/composicao";
import { gerarAnexo16, gerarAnexo17, gerarTermoDeCaixa } from "../portas/demonstrativos-da-pca";
import { lerNotasExplicativas, ROTULO_DA_DEMONSTRACAO } from "../portas/notas-explicativas";
import { gerarDmpl } from "../portas/dmpl";
import { formatarMoeda } from "../format/moeda";
import { tabelasDoAnexo16, tabelasDoAnexo17, tabelasDoTermoDeCaixa } from "../relatorios/tabelas-da-pca";
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

// V35 — os demonstrativos da prestação de contas anual (Anexos 16 e 17, termo de caixa): as mesmas tabelas da tela e do CSV.
export async function montarPdfAnexo16(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDoAnexo16(await gerarAnexo16({ exercicio: p.exercicio })));
}
export async function montarPdfAnexo17(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDoAnexo17(await gerarAnexo17({ exercicio: p.exercicio })));
}
export async function montarPdfTermoDeCaixa(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  return documento(tabelasDoTermoDeCaixa(await gerarTermoDeCaixa({ exercicio: p.exercicio })));
}

// V35 C2 — as notas explicativas: uma seção por item da ordem do MCASP (Parte V, 8.2), uma linha por nota, numeradas
// como na tela; o texto é o da versão vigente, sem nada recalculado.
export async function montarPdfNotasExplicativas(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const n = await lerNotasExplicativas(p.exercicio);
  return {
    ente: await nomeDoEnteParaDocumentos(),
    titulo: "Notas Explicativas às Demonstrações Contábeis",
    subtitulo: "MCASP 11ª ed., Parte V, item 8",
    periodo: `Exercício de ${String(p.exercicio)}`,
    orientacao: "retrato",
    secoes: n.secoes
      .filter((s) => s.notas.length > 0)
      .map((s) => ({
        titulo: s.rotulo,
        colunas: [{ rotulo: "Nota" }, { rotulo: "Texto" }],
        linhas: s.notas.map((x) => [`${String(x.numero)}. ${x.titulo}`, `${x.texto.join(" ")} [${ROTULO_DA_DEMONSTRACAO[x.demonstracao]}]`]),
      })),
    notas: n.temasPendentes.map((t) => `Tema ainda não redigido: ${t.titulo} (${t.fonte}).`),
  };
}

/** V35 — o PDF da DMPL: o mesmo leitor da tela, a matriz em paisagem e as pendências nas notas. */
export async function montarPdfDmpl(p: { readonly exercicio: number }): Promise<DocumentoPdf> {
  const d = await gerarDmpl(p.exercicio);
  const brl = (v: string): string => formatarMoeda(v).texto;
  return {
    ente: await nomeDoEnteParaDocumentos(),
    titulo: "Demonstração das Mutações no Patrimônio Líquido",
    subtitulo: "MCASP 11ª ed., Parte V, item 7",
    orientacao: "paisagem",
    periodo: `Exercício de ${String(p.exercicio)}`,
    secoes: [
      {
        colunas: [{ rotulo: "Especificação" }, ...d.colunas.map((c) => ({ rotulo: c, alinhamento: "direita" as const }))],
        linhas: d.linhas.map((l) => [l.rotulo, ...l.valores.map(brl)]),
      },
    ],
    notas: [...d.semLinha.map((s) => `Sem linha definida: lançamento ${s.numeroControle}, conta ${s.conta}, ${brl(s.valor)}.`), ...d.notas],
  };
}
