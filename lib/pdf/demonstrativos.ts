import { gerarRreoAnexo1 } from "../portas/rreo";
import { formatarMoeda } from "../format/moeda";
import { gerarPdfDoDemonstrativo, type ResultadoPdf } from "./gerar";
import type { DocumentoPdf, SecaoPdf } from "./documento";

/**
 * O REGISTRO DOS DEMONSTRATIVOS PUBLICÁVEIS — cada um sabe montar o seu `DocumentoPdf` a partir do
 * MOTOR (via porta), e o motor de PDF o imprime. É a mesma leitura da tela; o PDF é a tela.
 *
 * ⚠️ O NOME DO ENTE é constante por ora — não há entidade de "identificação do ente" no schema (é
 * `IDENTIFICACAO-DO-ENTE`, pendência de dado). Campina Grande é o ente do projeto; quando o cadastro
 * existir, esta constante vira leitura.
 *
 * ⚠️ ZONA 1 (não é porta): este arquivo lê o motor SÓ via `lib/portas/**` — nunca `modules/**`
 * direto. O grep trivalente vale para ele como para qualquer tela.
 */

const ENTE = "Município de Campina Grande — PB";

const brl = (v: string): string => formatarMoeda(v).texto;

export interface DemonstrativoPublico {
  readonly slug: string;
  readonly rotulo: string;
  /** Aceita `{ exercicio, bimestre }`; o builder valida o que usa. */
  readonly montar: (p: { readonly exercicio: number; readonly bimestre: number }) => Promise<DocumentoPdf>;
  /** O nome-base do arquivo (o período é anexado). */
  readonly nomeBase: string;
}

async function montarRreoAnexo1(p: { readonly exercicio: number; readonly bimestre: number }): Promise<DocumentoPdf> {
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(p.bimestre as 1) ? (p.bimestre as 1) : 1;
  const a1 = await gerarRreoAnexo1({ exercicio: p.exercicio, bimestre });

  const receitas: SecaoPdf = {
    titulo: "Receitas",
    colunas: [
      { rotulo: "Especificação" },
      { rotulo: "Previsão atualizada", alinhamento: "direita" },
      { rotulo: "Realizada até o bimestre", alinhamento: "direita" },
      { rotulo: "Saldo", alinhamento: "direita" },
    ],
    linhas: [
      ...a1.receitas.map((r) => [r.rotulo, brl(r.previsaoAtualizada), brl(r.ateBimestre), brl(r.saldo)]),
      ["SUBTOTAL DAS RECEITAS (I)", brl(a1.subtotalReceitas.previsaoAtualizada), brl(a1.subtotalReceitas.ateBimestre), brl(a1.subtotalReceitas.saldo)],
    ],
    totais: [a1.receitas.length],
  };

  const despesas: SecaoPdf = {
    titulo: "Despesas",
    colunas: [
      { rotulo: "Especificação" },
      { rotulo: "Dotação atualizada", alinhamento: "direita" },
      { rotulo: "Empenhada até", alinhamento: "direita" },
      { rotulo: "Liquidada até", alinhamento: "direita" },
      { rotulo: "Paga até", alinhamento: "direita" },
    ],
    linhas: [
      ...a1.despesas.map((d) => [d.rotulo, brl(d.dotacaoAtualizada), brl(d.empenhadasAte), brl(d.liquidadasAte), brl(d.pagasAte)]),
      ["SUBTOTAL DAS DESPESAS (III)", brl(a1.subtotalDespesas.dotacaoAtualizada), brl(a1.subtotalDespesas.empenhadasAte), brl(a1.subtotalDespesas.liquidadasAte), brl(a1.subtotalDespesas.pagasAte)],
    ],
    totais: [a1.despesas.length],
  };

  const resultado = a1.superavit !== "0.00" ? `Superávit orçamentário: ${brl(a1.superavit)}` : `Déficit orçamentário: ${brl(a1.deficit)}`;

  return {
    ente: ENTE,
    titulo: "RREO — Anexo 1 · Balanço Orçamentário",
    subtitulo: "LRF art. 52 · regime orçamentário",
    periodo: `Exercício ${p.exercicio} · ${bimestre}º bimestre`,
    secoes: [receitas, despesas],
    notas: [resultado, "Valores em R$ · demonstrativo oficial (leitura pública, LC 131/2009)."],
  };
}

/** O rol público — o que a área de transparência lista e imprime sob demanda. */
export const DEMONSTRATIVOS_PUBLICOS: readonly DemonstrativoPublico[] = [
  { slug: "rreo-anexo1", rotulo: "RREO — Anexo 1 · Balanço Orçamentário", nomeBase: "rreo-anexo1", montar: montarRreoAnexo1 },
];

export function acharDemonstrativo(slug: string): DemonstrativoPublico | undefined {
  return DEMONSTRATIVOS_PUBLICOS.find((d) => d.slug === slug);
}

/** Gera o PDF de um demonstrativo público pelo slug — o que a rota pública e a Server Action chamam. */
export async function gerarPdfPublico(slug: string, p: { readonly exercicio: number; readonly bimestre: number }): Promise<ResultadoPdf | null> {
  const dem = acharDemonstrativo(slug);
  if (dem === undefined) return null;
  const doc = await dem.montar(p);
  return gerarPdfDoDemonstrativo(doc, { nomeBase: dem.nomeBase });
}
