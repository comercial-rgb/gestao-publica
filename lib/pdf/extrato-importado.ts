import type { DocumentoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { diaCivilBr } from "../../packages/datas/index.js";
import type { ExtratoParaImpressao } from "../portas/conciliacao";

/**
 * V36 — A IMPRESSÃO DO EXTRATO IMPORTADO (TR 5.10.2.44). As linhas como o banco as mandou, na ordem do banco, com o
 * total de créditos e de débitos do arquivo e a situação de cada linha na conciliação no momento da emissão.
 *
 * Sem saldo corrido: o extrato gravado não traz o saldo inicial, e a nota diz isso no papel.
 */
const brl = (v: string): string => formatarMoeda(v).texto;

export const SITUACAO_DA_LINHA: Readonly<Record<ExtratoParaImpressao["linhas"][number]["situacao"], string>> = {
  CONCILIADA: "conciliada",
  PARCIAL: "conciliada em parte",
  PENDENTE: "pendente",
};

export function documentoDoExtratoImportado(p: { readonly ente: string; readonly extrato: ExtratoParaImpressao }): DocumentoPdf {
  const e = p.extrato;
  const linhas: string[][] = e.linhas.map((l) => [
    diaCivilBr(l.data),
    l.documento ?? "",
    l.memo,
    l.fitid,
    l.natureza === "CREDITO" ? brl(l.valor) : "",
    l.natureza === "DEBITO" ? brl(l.valor) : "",
    SITUACAO_DA_LINHA[l.situacao],
  ]);
  if (linhas.length === 0) linhas.push(["", "", "O extrato não tem lançamentos.", "", "", "", ""]);
  const indiceDoTotal = linhas.length;
  linhas.push(["", "", "Total do arquivo", "", brl(e.totalCreditos), brl(e.totalDebitos), ""]);
  linhas.push(["", "", "Movimento do período (créditos menos débitos)", "", brl(e.movimentoLiquido), "", ""]);

  const doArquivo =
    e.bancoDoArquivo !== null || e.contaDoArquivoMascarada !== null
      ? `O arquivo declarou banco ${e.bancoDoArquivo ?? "não informado"} e conta ${e.contaDoArquivoMascarada ?? "não informada"}.`
      : "O arquivo não declarou banco e conta (importação anterior a esse registro).";

  return {
    ente: p.ente,
    titulo: "Extrato bancário importado",
    subtitulo: `Conta ${e.conta.codigo} · ${e.conta.descricao} · agência ${e.conta.agenciaMascarada} · conta ${e.conta.contaMascarada}`,
    periodo: `${diaCivilBr(e.periodoInicio)} a ${diaCivilBr(e.periodoFim)}`,
    orientacao: "paisagem",
    secoes: [
      {
        titulo: `Lançamentos (${String(e.linhas.length)})`,
        colunas: [
          { rotulo: "Data" },
          { rotulo: "Documento" },
          { rotulo: "Histórico" },
          { rotulo: "Identificador no banco" },
          { rotulo: "Crédito", alinhamento: "direita" },
          { rotulo: "Débito", alinhamento: "direita" },
          { rotulo: "Na conciliação" },
        ],
        linhas,
        totais: [indiceDoTotal, indiceDoTotal + 1],
      },
    ],
    notas: [
      `Origem: ${e.origem === "API_BB" ? "API do Banco do Brasil" : "arquivo OFX"}. Importado por ${e.importadoPor} em ${diaCivilBr(e.importadoEm)}. ${doArquivo}`,
      `Identificação do arquivo (sha256): ${e.hashOrigem}.`,
      "Os totais são do movimento do arquivo, não o saldo da conta: o extrato gravado não guarda o saldo inicial.",
      "A coluna da conciliação mostra a situação no momento da emissão.",
    ],
  };
}
