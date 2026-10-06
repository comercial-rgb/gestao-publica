import type { DocumentoPdf, SecaoPdf } from "./documento";
import { formatarMoeda } from "../format/moeda";
import { dataBr } from "../recorte";
import { formatarDocumento } from "../../packages/documento/index.js";
import type { FiltroDosPagamentos, PagamentoEfetuadoDaTela, PagamentosEfetuadosDaTela } from "../portas/pagamentos-efetuados";

/**
 * V36 — O PDF DO RELATÓRIO DE PAGAMENTOS EFETUADOS: o mesmo resultado da tela (`lerPagamentosEfetuados`), uma seção
 * por grupo quando agrupado, com os subtotais, e o total geral. Montagem pura.
 */
const brl = (v: string): string => formatarMoeda(v).texto;

function secao(titulo: string | undefined, linhas: readonly PagamentoEfetuadoDaTela[], total: PagamentosEfetuadosDaTela["totais"], comRetencoes: boolean): SecaoPdf {
  const base = (l: PagamentoEfetuadoDaTela): string[] => [
    dataBr(l.data),
    `${l.numero}${l.anulado ? " (anulado)" : ""}`,
    l.origem === "RESTOS" ? `RP ${String(l.exercicioDaDotacao)}` : "Exercício",
    l.empenhoNumero,
    l.credorNome ?? formatarDocumento(l.credorCpfCnpj),
    l.fonteCodigo,
    l.contaBancaria,
    brl(l.pagoVivo),
  ];
  return {
    ...(titulo !== undefined ? { titulo } : {}),
    colunas: [
      { rotulo: "Data" }, { rotulo: "Nº" }, { rotulo: "Origem" }, { rotulo: "Empenho" }, { rotulo: "Credor" }, { rotulo: "Fonte" }, { rotulo: "Conta" },
      { rotulo: "Pago", alinhamento: "direita" },
      ...(comRetencoes ? [{ rotulo: "Retido", alinhamento: "direita" as const }, { rotulo: "Líquido", alinhamento: "direita" as const }] : []),
    ],
    linhas: [
      ...linhas.map((l) => [...base(l), ...(comRetencoes ? [brl(l.retido), brl(l.liquido)] : [])]),
      ["", "", "", "", "Total", "", "", brl(total.pagoVivo), ...(comRetencoes ? [brl(total.retido), brl(total.liquido)] : [])],
    ],
    totais: [linhas.length],
  };
}

export function documentoDosPagamentosEfetuados(p: {
  readonly ente: string;
  readonly periodoDoRecorte: string;
  readonly filtro: FiltroDosPagamentos;
  readonly dados: PagamentosEfetuadosDaTela;
}): DocumentoPdf {
  const f = p.filtro;
  const secoes =
    p.dados.grupos.length > 0
      ? [
          ...p.dados.grupos.map((g) => secao(g.rotulo, g.linhas, g.totais, f.comRetencoes)),
          secao("Total geral", [], p.dados.totais, f.comRetencoes),
        ]
      : [secao(undefined, p.dados.linhas, p.dados.totais, f.comRetencoes)];
  const credor = p.dados.opcoes.credores.find((c) => c.documento === f.credor);
  return {
    ente: p.ente,
    titulo: "Pagamentos efetuados",
    subtitulo: "Do exercício e de restos a pagar",
    periodo: `${f.desde.split("-").reverse().join("/")} a ${f.ate.split("-").reverse().join("/")} · ${p.periodoDoRecorte}`,
    filtros: [
      f.credor !== "" ? `Credor: ${credor?.nome ?? formatarDocumento(f.credor)}` : null,
      f.fonte !== "" ? `Fonte: ${f.fonte}` : null,
      f.conta !== "" ? `Conta bancária: ${f.conta}` : null,
      f.agrupar !== "" ? `Agrupado por ${f.agrupar === "conta" ? "conta bancária" : f.agrupar}` : null,
    ].filter((x): x is string => x !== null),
    secoes,
    notas: [
      "Pago = valor pago menos as anulações; retido = retenções na fonte e próprias vivas; líquido = pago menos retido.",
      "Pagamento anulado por inteiro continua listado, com pago zero.",
    ],
  };
}
