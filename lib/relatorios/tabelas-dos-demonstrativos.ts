import type { SecaoPdf } from "../pdf/documento";
import { formatarMoeda } from "../format/moeda";
import { paraCsv } from "../csv/csv";
import { dataBr } from "../recorte";
import type { BalancoFinanceiro, BalancoOrcamentario } from "../portas/demonstrativos";
import type { DemonstracaoFluxosDeCaixa } from "../portas/fluxos-de-caixa";
import type { ComposicaoDaTela } from "../portas/composicao";

/**
 * V34 — AS TABELAS DO BALANÇO FINANCEIRO, DO ORÇAMENTÁRIO, DA DFC E DA COMPOSIÇÃO, para o PDF e o CSV.
 *
 * ⚠️ MONTAGEM DE LINHA, NÃO ARITMÉTICA. Cada função recebe o MESMO objeto que a porta entrega à tela (`gerarBalanco*`,
 * `gerarFluxosDeCaixa`, `lerComposicao`) e só o dispõe em linhas: os totais, os saldos e os fluxos vêm do motor. É isto
 * que faz a tela, a composição, o PDF e o CSV dizerem o mesmo número — uma apuração, quatro saídas.
 */

export interface TabelasDoDocumento {
  readonly titulo: string;
  readonly subtitulo: string;
  readonly periodo: string;
  readonly secoes: readonly SecaoPdf[];
  readonly notas: readonly string[];
}

const brl = (v: string): string => formatarMoeda(v).texto;
const situacao = (parcial: boolean, exercicio: number): string =>
  parcial ? `Exercício ${String(exercicio)} em andamento — posição parcial` : `Exercício ${String(exercicio)} encerrado`;

export function tabelasDoBalancoFinanceiro(d: BalancoFinanceiro): TabelasDoDocumento {
  const lado = (titulo: string, linhas: BalancoFinanceiro["ingressos"], rotuloTotal: string, total: string): SecaoPdf => ({
    titulo,
    colunas: [{ rotulo: "Fonte" }, { rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }],
    linhas: [...linhas.map((l) => [l.codigo ?? "", l.rotulo, brl(l.valor)]), ["", rotuloTotal, brl(total)]],
    totais: [linhas.length],
  });
  return {
    titulo: "Balanço Financeiro",
    subtitulo: "Ingressos e dispêndios por fonte, e o saldo em espécie (art. 103 da Lei 4.320)",
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes: [
      lado("Ingressos", d.ingressos, "Total dos ingressos", d.totalIngressos),
      lado("Dispêndios", d.dispendios, "Total dos dispêndios", d.totalDispendios),
      {
        titulo: "Saldo em espécie",
        colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }],
        linhas: [
          ["Saldo em espécie do exercício anterior", brl(d.saldoEmEspecie.anterior)],
          ["Saldo em espécie para o exercício seguinte", brl(d.saldoEmEspecie.seguinte)],
          ["Caixa apurado pelos lançamentos contábeis", brl(d.saldoEmEspecie.apuradoPelasPartidas)],
        ],
      },
    ],
    notas: [situacao(d.parcial, d.exercicio), "Valores em R$."],
  };
}

export function tabelasDoBalancoOrcamentario(d: BalancoOrcamentario): TabelasDoDocumento {
  return {
    titulo: "Balanço Orçamentário",
    subtitulo: "Receita prevista e realizada; despesa autorizada e executada (art. 102 da Lei 4.320)",
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes: [
      {
        titulo: "Receitas",
        colunas: [
          { rotulo: "Nota" }, { rotulo: "Código" }, { rotulo: "Especificação" },
          { rotulo: "Previsão inicial (a)", alinhamento: "direita" }, { rotulo: "Previsão atualizada (b)", alinhamento: "direita" },
          { rotulo: "Realizada (c)", alinhamento: "direita" }, { rotulo: "Saldo (d)", alinhamento: "direita" },
        ],
        linhas: d.receitas.map((l) => [l.nota ?? "", l.codigo ?? "", l.rotulo ?? "", brl(l.previsaoInicial), brl(l.previsaoAtualizada), brl(l.realizadas), brl(l.saldo)]),
        totais: d.receitas.flatMap((l, i) => (l.nivel === "TOTAL" ? [i] : [])),
      },
      {
        titulo: "Despesas",
        colunas: [
          { rotulo: "Nota" }, { rotulo: "Código" }, { rotulo: "Especificação" },
          { rotulo: "Dotação inicial (e)", alinhamento: "direita" }, { rotulo: "Créditos adicionais (f)", alinhamento: "direita" },
          { rotulo: "Dotação atualizada (g)", alinhamento: "direita" }, { rotulo: "Empenhada (h)", alinhamento: "direita" },
          { rotulo: "Liquidada (i)", alinhamento: "direita" }, { rotulo: "Paga (j)", alinhamento: "direita" }, { rotulo: "Saldo (k)", alinhamento: "direita" },
        ],
        linhas: d.despesas.map((l) => [
          l.nota ?? "", l.codigo ?? "", l.rotulo, brl(l.dotacaoInicial), brl(l.creditosAdicionais), brl(l.dotacaoAtualizada),
          brl(l.empenhadas), brl(l.liquidadas), brl(l.pagas), brl(l.saldoDotacao),
        ]),
        totais: d.despesas.flatMap((l, i) => (l.nivel === "TOTAL" ? [i] : [])),
      },
    ],
    notas: [
      situacao(d.parcial, d.exercicio),
      "Valores em R$ · (d) = c − b · (g) = e + f · (k) = g − h.",
    ],
  };
}

export function tabelasDosFluxosDeCaixa(d: DemonstracaoFluxosDeCaixa): TabelasDoDocumento {
  const fluxo = (f: DemonstracaoFluxosDeCaixa["fluxos"][number]): SecaoPdf => {
    const linhas: string[][] = [
      ["Ingressos", ""],
      ...f.ingressos.map((l) => [l.nivel === "DETALHE" ? `   ${l.rotulo}` : l.rotulo, brl(l.valor)]),
      ["Total dos ingressos", brl(f.totalIngressos)],
      ["Desembolsos", ""],
      ...f.desembolsos.map((l) => [l.nivel === "DETALHE" ? `   ${l.rotulo}` : l.rotulo, brl(l.valor)]),
      ["Total dos desembolsos", brl(f.totalDesembolsos)],
      ["Fluxo de caixa líquido da atividade", brl(f.fluxoLiquido)],
    ];
    const n = linhas.length;
    return {
      titulo: f.titulo.charAt(0) + f.titulo.slice(1).toLowerCase(),
      colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }],
      linhas,
      totais: [f.ingressos.length + 1, n - 2, n - 1],
    };
  };
  return {
    titulo: "Demonstração dos Fluxos de Caixa",
    subtitulo: "Ingressos e desembolsos de caixa por atividade",
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes: [
      ...d.fluxos.map(fluxo),
      {
        titulo: "Apuração do fluxo de caixa do período",
        colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", alinhamento: "direita" }],
        linhas: [
          ["Geração líquida de caixa e equivalentes de caixa", brl(d.geracaoLiquida)],
          ["Caixa e equivalentes de caixa inicial", brl(d.caixaInicial)],
          ["Caixa e equivalentes de caixa final", brl(d.caixaFinal)],
          ["Caixa apurado pelos lançamentos contábeis", brl(d.caixaApuradoPelasPartidas)],
        ],
        totais: [0, 2],
      },
    ],
    notas: [situacao(d.parcial, d.exercicio), "Valores em R$ · as linhas recuadas (\"dos quais\") já estão dentro da linha acima."],
  };
}

export function tabelasDaComposicao(d: ComposicaoDaTela, exercicio: number): TabelasDoDocumento {
  const conferencia =
    d.linha === null
      ? "Esta linha não aparece na demonstração do exercício."
      : "indisponivel" in d.linha
        ? `A demonstração não foi emitida; os documentos não puderam ser conferidos contra a linha: ${d.linha.indisponivel}`
        : d.confere === true
          ? "A soma dos documentos confere com a linha da demonstração."
          : "A soma dos documentos NÃO confere com a linha da demonstração.";
  return {
    titulo: d.titulo,
    subtitulo: `${d.demonstracao.nome}: os documentos que formam a linha`,
    periodo: `Exercício ${String(exercicio)}`,
    secoes: [
      {
        colunas: [{ rotulo: "Data" }, { rotulo: "Documento" }, { rotulo: "Descrição" }, { rotulo: "Classificação" }, ...d.colunas.map((c) => ({ rotulo: c, alinhamento: "direita" as const }))],
        linhas: [
          ...d.documentos.map((x) => [x.data === null ? "" : dataBr(x.data), x.documento, x.descricao, x.classificacao, ...x.valores.map(brl)]),
          ["", "", "Total dos documentos", "", ...d.totais.map(brl)],
        ],
        totais: [d.documentos.length],
      },
    ],
    notas: [conferencia, "Valores em R$ · anulações entram negativas."],
  };
}

/** O CSV das mesmas tabelas: uma seção depois da outra, com o título da seção numa linha própria. */
export function csvDasTabelas(t: TabelasDoDocumento): string {
  const largura = Math.max(...t.secoes.map((s) => s.colunas.length));
  const linhas: string[][] = [];
  for (const s of t.secoes) {
    if (s.titulo !== undefined) linhas.push([s.titulo]);
    linhas.push(s.colunas.map((c) => c.rotulo));
    for (const l of s.linhas) linhas.push([...l]);
    linhas.push([]);
  }
  for (const n of t.notas) linhas.push([n]);
  return paraCsv([t.titulo, `${t.periodo}`, ...Array.from({ length: Math.max(0, largura - 2) }, () => "")], linhas);
}
