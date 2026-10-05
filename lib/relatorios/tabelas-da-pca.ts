import type { SecaoPdf } from "../pdf/documento";
import { formatarMoeda } from "../format/moeda";
import type { Anexo16, Anexo17, TermoDeConferenciaDeCaixa } from "../portas/demonstrativos-da-pca";
import type { TabelasDoDocumento } from "./tabelas-dos-demonstrativos";

/**
 * V35 — AS TABELAS DO ANEXO 16, DO ANEXO 17 E DO TERMO DE CONFERÊNCIA DE CAIXA, para a tela, o PDF e o CSV.
 * Montagem de linha, não aritmética: os saldos e os totais vêm do motor (`modules/m12-relatorios/demonstrativos-da-pca.ts`).
 */

const brl = (v: string): string => formatarMoeda(v).texto;
const DIREITA = { alinhamento: "direita" } as const;

export function tabelasDoAnexo16(d: Anexo16): TabelasDoDocumento {
  const colunas = [
    { rotulo: "Dívida" },
    { rotulo: "Credor" },
    { rotulo: "Lei autorizativa" },
    { rotulo: "Saldo do exercício anterior", ...DIREITA },
    { rotulo: "Contratação ou emissão", ...DIREITA },
    { rotulo: "Atualização monetária", ...DIREITA },
    { rotulo: "Amortização ou resgate", ...DIREITA },
    { rotulo: "Saldo para o exercício seguinte", ...DIREITA },
  ];
  const secao = (titulo: string, linhas: Anexo16["interna"], total: Anexo16["totalInterna"]): SecaoPdf => ({
    titulo,
    colunas,
    linhas: [
      ...linhas.map((l) => [l.identificador, l.credor, l.leiAutorizativa, brl(l.saldoAnterior), brl(l.contratacao), brl(l.atualizacao), brl(l.amortizacao), brl(l.saldoSeguinte)]),
      ["", `Total da dívida ${titulo.toLowerCase()}`, "", brl(total.saldoAnterior), brl(total.contratacao), brl(total.atualizacao), brl(total.amortizacao), brl(total.saldoSeguinte)],
    ],
    totais: [linhas.length],
  });
  return {
    titulo: "Demonstração da Dívida Fundada",
    subtitulo: "Dívida fundada interna e externa (Lei 4.320, art. 98 e Anexo 16)",
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes: [
      secao("Interna", d.interna, d.totalInterna),
      secao("Externa", d.externa, d.totalExterna),
      {
        titulo: "Total geral",
        colunas: [{ rotulo: "Especificação" }, ...colunas.slice(3)],
        linhas: [["Dívida fundada", brl(d.total.saldoAnterior), brl(d.total.contratacao), brl(d.total.atualizacao), brl(d.total.amortizacao), brl(d.total.saldoSeguinte)]],
        totais: [0],
      },
    ],
    notas: [
      "Interna ou externa conforme a conta do passivo de cada dívida no plano de contas.",
      "Movimentos pela data do fato, no dia civil do município; estornos já descontados da coluna do movimento que estornam.",
      "Valores em R$.",
    ],
  };
}

const GRUPOS_17: readonly { readonly grupo: Anexo17["linhas"][number]["grupo"]; readonly titulo: string }[] = [
  { grupo: "RESTOS_A_PAGAR", titulo: "Restos a pagar (exceto serviços da dívida)" },
  { grupo: "SERVICO_DA_DIVIDA", titulo: "Serviços da dívida a pagar" },
  { grupo: "DEPOSITOS", titulo: "Depósitos e consignações" },
  { grupo: "DEBITOS_DE_TESOURARIA", titulo: "Débitos de tesouraria" },
];

export function tabelasDoAnexo17(d: Anexo17): TabelasDoDocumento {
  const colunas = [
    { rotulo: "Código" },
    { rotulo: "Especificação" },
    { rotulo: "Saldo do exercício anterior", ...DIREITA },
    { rotulo: "Inscrição", ...DIREITA },
    { rotulo: "Baixa", ...DIREITA },
    { rotulo: "Saldo para o exercício seguinte", ...DIREITA },
  ];
  const linha = (l: Anexo17["linhas"][number]) => [l.codigo, l.descricao, brl(l.saldoAnterior), brl(l.inscricao), brl(l.baixa), brl(l.saldoSeguinte)];
  const secoes: SecaoPdf[] = GRUPOS_17.map((g) => {
    const linhas = d.linhas.filter((l) => l.grupo === g.grupo);
    return { titulo: g.titulo, colunas, linhas: linhas.length === 0 ? [["", "Sem saldo nem movimento no exercício", "", "", "", ""]] : linhas.map(linha) };
  });
  secoes.push({
    titulo: "Total",
    colunas,
    linhas: [["", "Dívida flutuante", brl(d.total.saldoAnterior), brl(d.total.inscricao), brl(d.total.baixa), brl(d.total.saldoSeguinte)]],
    totais: [0],
  });
  return {
    titulo: "Demonstração da Dívida Flutuante",
    subtitulo: "Restos a pagar, serviços da dívida, depósitos e débitos de tesouraria (Lei 4.320, art. 92 e Anexo 17)",
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes,
    notas: [
      "Restos a pagar: inscrição é o inscrito no encerramento do exercício; baixa é o pago e o cancelado no exercício, líquidos de estornos.",
      "Serviços da dívida: restos de juros e encargos (grupo 2) e de amortização (grupo 6).",
      "Depósitos e débitos de tesouraria: inscrição é o crédito e baixa é o débito na conta, pela data do fato.",
      "Valores em R$.",
    ],
  };
}

export function tabelasDoTermoDeCaixa(d: TermoDeConferenciaDeCaixa): TabelasDoDocumento {
  const semExtrato = d.contas.filter((c) => c.linhasDeExtrato === 0).map((c) => c.codigo);
  return {
    titulo: "Termo de Conferência de Caixa e Bancos",
    subtitulo: `Saldos em 31/12/${String(d.exercicio)}, conferidos contra o extrato bancário`,
    periodo: `Exercício ${String(d.exercicio)}`,
    secoes: [
      {
        titulo: "Contas bancárias",
        colunas: [
          { rotulo: "Conta" },
          { rotulo: "Descrição" },
          { rotulo: "Banco, agência e conta" },
          { rotulo: "Conta contábil" },
          { rotulo: "Saldo contábil", ...DIREITA },
          { rotulo: "Saldo do extrato", ...DIREITA },
          { rotulo: "Diferença", ...DIREITA },
          { rotulo: "Pendências", ...DIREITA },
        ],
        linhas: [
          ...d.contas.map((c) => [c.codigo, c.descricao, c.identificacao, c.contaContabil, brl(c.saldoContabil), c.linhasDeExtrato === 0 ? "sem extrato" : brl(c.saldoExtrato), brl(c.diferenca), String(c.pendencias)]),
          ["", "Total das contas bancárias", "", "", brl(d.totalContabil), brl(d.totalExtrato), "", ""],
        ],
        totais: [d.contas.length],
      },
      {
        titulo: "Disponibilidades sem conta bancária",
        colunas: [{ rotulo: "Conta contábil" }, { rotulo: "Nome" }, { rotulo: "Saldo", ...DIREITA }],
        linhas: d.outras.length === 0 ? [["", "Nenhuma", ""]] : d.outras.map((o) => [o.contaContabil, o.nome, brl(o.saldo)]),
      },
      {
        titulo: "Conferência com o razão",
        colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", ...DIREITA }],
        linhas: [
          ["Caixa e equivalentes de caixa no razão", brl(d.totalNoRazao)],
          ["Lançamentos em conta contábil compartilhada que não são de conta bancária nenhuma", brl(d.naoAtribuido)],
        ],
      },
    ],
    notas: [
      "Saldo contábil e diferença como na conciliação bancária de cada conta; pendência é lançamento no banco sem par no razão, ou o inverso.",
      ...(semExtrato.length > 0 ? [`Sem extrato importado até 31/12: ${semExtrato.join(", ")}. O saldo do banco destas contas não foi conferido.`] : []),
      "Quando 31/12 não é dia útil, a posição é a do último dia útil se não houve movimento depois dele.",
      "Valores em R$.",
    ],
  };
}
