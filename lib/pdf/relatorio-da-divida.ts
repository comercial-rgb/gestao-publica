import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import type { RelatorioDaDivida } from "../portas/relatorio-da-divida";

/**
 * V36 — O RELATÓRIO GERENCIAL DA DÍVIDA FUNDADA EM PDF (TR 5.10.1.86): todas as dívidas com os totais e, quando
 * uma foi escolhida, o comparativo das parcelas informadas com o amortizado. Mesmo leitor da tela.
 */
const brl = (v: string): string => formatarMoeda(v).texto;
const diaBr = (d: string): string => d.split("-").reverse().join("/");
export const TIPO_DA_DIVIDA: Readonly<Record<"CONTRATUAL" | "MOBILIARIA", string>> = { CONTRATUAL: "contratual", MOBILIARIA: "mobiliária" };

export const NOTA_DO_COMPARATIVO =
  "Cada parcela recebe o que foi amortizado entre o vencimento anterior e o dela, pelo dia do ente; o pago depois do último vencimento aparece em linha própria. É comparação por período, não quitação de parcela. Juros e encargos são os informados: o pagamento de juros não se liga à dívida no sistema.";

export function documentoDaDivida(p: { readonly ente: string; readonly relatorio: RelatorioDaDivida; readonly emissao: string }): DocumentoPdf {
  const r = p.relatorio;
  const todas: SecaoPdf = {
    titulo: "Dívidas fundadas",
    colunas: [
      { rotulo: "Dívida" }, { rotulo: "Credor" }, { rotulo: "Tipo" },
      { rotulo: "Ingressado", alinhamento: "direita" }, { rotulo: "Atualizado", alinhamento: "direita" },
      { rotulo: "Amortizado", alinhamento: "direita" }, { rotulo: "Saldo", alinhamento: "direita" },
    ],
    linhas: [
      ...(r.dividas.length === 0
        ? [["Nenhuma dívida fundada cadastrada.", "", "", "", "", "", ""]]
        : r.dividas.map((d) => [d.identificador, d.credorNome, TIPO_DA_DIVIDA[d.tipo], brl(d.ingressado), brl(d.atualizado), brl(d.amortizado), brl(d.saldo)])),
      ["Total", "", "", brl(r.totais.ingressado), brl(r.totais.atualizado), brl(r.totais.amortizado), brl(r.totais.saldo)],
    ],
    totais: [Math.max(1, r.dividas.length)],
  };
  const secoes: SecaoPdf[] = [todas];
  const e = r.escolhida;
  if (e !== null) {
    secoes.push({
      titulo: `Parcelas da dívida ${e.identificador}: informado × amortizado`,
      colunas: [
        { rotulo: "Parcela" }, { rotulo: "Vencimento" },
        { rotulo: "Principal informado", alinhamento: "direita" }, { rotulo: "Encargos informados", alinhamento: "direita" },
        { rotulo: "Amortizado no período", alinhamento: "direita" }, { rotulo: "Diferença", alinhamento: "direita" },
      ],
      linhas: [
        ...(e.linhas.length === 0
          ? [["", "", "Nenhuma parcela informada.", "", "", ""]]
          : e.linhas.map((l) => [
              l.numero === null ? "Pago depois do último vencimento" : `${String(l.numero)}${l.corrigida ? " (corrigida)" : ""}`,
              l.vencimento === null ? "" : diaBr(l.vencimento),
              brl(l.principalInformado),
              l.encargosInformados === null ? "" : brl(l.encargosInformados),
              brl(l.amortizadoNoPeriodo),
              brl(l.diferenca),
            ])),
        ["Total", "", brl(e.totalInformado), "", brl(e.totalAmortizadoNasLinhas), ""],
      ],
      totais: [Math.max(1, e.linhas.length)],
    });
  }
  return {
    ente: p.ente,
    titulo: "Relatório da dívida fundada",
    subtitulo: e === null ? "Todas as dívidas fundadas" : `Dívida ${e.identificador} · ${e.credorNome} · ${e.leiAutorizativa}`,
    periodo: `Posição em ${p.emissao}`,
    orientacao: "paisagem",
    secoes,
    notas: e === null ? ["Saldo = ingressos + atualizações − amortizações, com os estornos, dos movimentos da dívida."] : [NOTA_DO_COMPARATIVO],
  };
}
