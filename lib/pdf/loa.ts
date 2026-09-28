import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { nomeDoEnteParaDocumentos } from "./ente.js";
import type { LoaDaTela } from "../portas/loa";

/**
 * A LEI ORÇAMENTÁRIA ANUAL IMPRESSA — o resumo e os anexos da Lei 4.320/64, pelo MESMO motor de
 * documento dos demais demonstrativos (hash do conteúdo, hora de emissão, rodapé).
 *
 * ⚠️ ZONA 1: recebe a LOA já lida pela porta (`lerLoa`) — a mesma leitura da tela. Aqui só se
 * formata: nenhuma soma, nenhuma classificação.
 */

const brl = (v: string): string => formatarMoeda(v).texto;

export const SITUACAO_DO_EQUILIBRIO: Readonly<Record<LoaDaTela["resumo"]["situacao"], string>> = {
  EQUILIBRADA: "Equilibrada: a receita prevista é igual à despesa fixada.",
  RECEITA_MAIOR: "A receita prevista supera a despesa fixada.",
  DESPESA_MAIOR: "A despesa fixada supera a receita prevista.",
};

export async function montarPdfLoa(loa: LoaDaTela): Promise<DocumentoPdf> {
  const secoes: SecaoPdf[] = [
    {
      titulo: "Resumo",
      colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor (R$)", alinhamento: "direita" }],
      linhas: [
        ["Receita prevista", brl(loa.resumo.receitaPrevista)],
        ["Despesa fixada", brl(loa.resumo.despesaFixada)],
        ["Diferença (receita − despesa)", brl(loa.resumo.diferenca)],
      ],
      totais: [2],
    },
  ];
  for (const a of loa.anexos) {
    for (const q of a.quadros) {
      const destaques: number[] = [];
      const linhas = q.linhas.map((l, i) => {
        if (l.nivel === "total" || l.nivel === "nivel1") destaques.push(i);
        return [l.codigo, `${"   ".repeat(l.profundidade)}${l.especificacao}`, ...l.valores.map(brl)];
      });
      secoes.push({
        titulo: `Anexo ${a.numero} — ${a.titulo} · ${q.titulo}`,
        colunas: [{ rotulo: "Código" }, { rotulo: "Especificação" }, ...q.colunas.map((c) => ({ rotulo: c, alinhamento: "direita" as const }))],
        linhas,
        totais: destaques,
      });
    }
  }
  if (loa.indisponiveis.length > 0) {
    secoes.push({
      titulo: "Demonstrativos não emitidos",
      colunas: [{ rotulo: "Demonstrativo" }, { rotulo: "Fundamento" }, { rotulo: "Motivo" }],
      linhas: loa.indisponiveis.map((i) => [i.numero !== null ? `Anexo ${i.numero} — ${i.titulo}` : i.titulo, i.fundamento, i.motivo]),
    });
  }
  const notas = [
    SITUACAO_DO_EQUILIBRIO[loa.resumo.situacao],
    "Valores da lei aprovada: dotação inicial das fichas orçamentárias e previsão inicial da receita. Créditos adicionais e reprevisões posteriores não integram estes anexos.",
    "Cada anexo foi conferido, antes da emissão, contra os totais da receita prevista e da despesa fixada.",
    ...loa.anexos.flatMap((a) => a.notas.map((n) => `Anexo ${a.numero}: ${n}`)),
  ];
  return {
    ente: await nomeDoEnteParaDocumentos(),
    titulo: "Lei Orçamentária Anual",
    subtitulo: "Resumo da receita e da despesa e anexos da Lei nº 4.320/1964",
    periodo: `Exercício ${loa.exercicio}`,
    secoes,
    notas,
  };
}
