import type { DocumentoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { dataBr } from "../recorte";
import type { BorderoDeMovimentos } from "../portas/tesouraria";

/**
 * V36 (TR 5.10.2.22) — O PDF DO BORDERÔ DOS MOVIMENTOS BANCÁRIOS: a conta (banco, agência e número), os movimentos
 * vigentes do período com o sentido, o total de entradas e de saídas, e o espaço do visto. Montagem pura.
 */
const ROTULO_DO_TIPO: Readonly<Record<string, string>> = {
  DEPOSITO: "Depósito",
  SAQUE: "Saque",
  APLICACAO: "Aplicação financeira",
  RESGATE: "Resgate de aplicação",
  RENDIMENTO: "Rendimento creditado",
  TARIFA: "Tarifa bancária",
};
const brl = (v: string): string => formatarMoeda(v).texto;
const diaBr = (iso: string): string => iso.split("-").reverse().join("/");

export function documentoDoBorderoDeMovimentos(p: { readonly ente: string; readonly desde: string; readonly ate: string; readonly bordero: BorderoDeMovimentos }): DocumentoPdf {
  const b = p.bordero;
  const c = b.conta;
  return {
    ente: p.ente,
    titulo: "Borderô de movimentos bancários",
    subtitulo: `Conta ${c.codigo} — ${c.descricao}`,
    periodo: `${diaBr(p.desde)} a ${diaBr(p.ate)}`,
    orientacao: "retrato",
    filtros: [`Banco: ${c.banco ?? "não informado"}`, `Agência: ${c.agencia ?? "não informada"}`, `Conta: ${c.numero ?? "não informada"}`],
    secoes: [
      {
        titulo: "Movimentos",
        colunas: [{ rotulo: "Data" }, { rotulo: "Operação" }, { rotulo: "Fonte" }, { rotulo: "Histórico" }, { rotulo: "Entrada", alinhamento: "direita" }, { rotulo: "Saída", alinhamento: "direita" }],
        linhas: [
          ...b.linhas.map((l) => [dataBr(l.data), ROTULO_DO_TIPO[l.tipo] ?? l.tipo, l.fonteCodigo, l.historico, l.sentido === "ENTRADA" ? brl(l.valor.toFixed(2)) : "", l.sentido === "SAIDA" ? brl(l.valor.toFixed(2)) : ""]),
          ["", "", "", `Total (${String(b.linhas.length)} movimento(s))`, brl(b.entradas.toFixed(2)), brl(b.saidas.toFixed(2))],
        ],
        totais: [b.linhas.length],
      },
      {
        titulo: "Visto",
        colunas: [{ rotulo: "Tesoureiro" }, { rotulo: "Ordenador da despesa" }],
        linhas: [["Nome, assinatura e data", "Nome, assinatura e data"]],
      },
    ],
    notas: [
      "Relaciona só os movimentos vigentes: o estorno e o movimento estornado se anulam e não entram.",
      ...(b.foraPorEstorno > 0 ? [`${String(b.foraPorEstorno)} movimento(s) do período ficaram fora por estorno.`] : []),
      ...(b.linhas.length === 0 ? ["Nenhum movimento vigente nesta conta no período."] : []),
    ],
  };
}
