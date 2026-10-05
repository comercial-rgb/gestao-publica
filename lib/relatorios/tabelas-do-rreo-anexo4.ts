import type { SecaoPdf } from "../pdf/documento";
import { formatarMoeda } from "../format/moeda";
import type { Anexo4, FundoAnexo4, LinhaDespesaAnexo4, LinhaReceitaAnexo4, ResultadoAnexo4, SaldoAnexo4 } from "../../modules/m12-relatorios/rreo-anexo4";
import type { TabelasDoDocumento } from "./tabelas-dos-demonstrativos";

/**
 * V35 — AS TABELAS DO RREO ANEXO 4 (RPPS) para a tela e o CSV. Montagem de linha: os valores e os totais vêm do motor
 * (`modules/m12-relatorios/rreo-anexo4.ts`).
 */

const brl = (v: string): string => formatarMoeda(v).texto;
const recuo = (nivel: number, t: string) => `${"  ".repeat(nivel)}${t}`;
const D = { alinhamento: "direita" } as const;

function receitas(titulo: string, linhas: readonly LinhaReceitaAnexo4[]): SecaoPdf {
  return {
    titulo,
    colunas: [{ rotulo: "Receitas previdenciárias" }, { rotulo: "Previsão atualizada", ...D }, { rotulo: "Realizadas até o bimestre", ...D }],
    linhas: linhas.map((l) => [recuo(l.nivel, l.rotulo), brl(l.previsaoAtualizada), brl(l.realizadaAteBimestre)]),
    totais: linhas.flatMap((l, i) => (l.nivel === 0 ? [i] : [])),
  };
}

function despesas(titulo: string, linhas: readonly LinhaDespesaAnexo4[], sexto: boolean): SecaoPdf {
  return {
    titulo,
    colunas: [
      { rotulo: "Despesas previdenciárias" },
      { rotulo: "Dotação atualizada", ...D },
      { rotulo: "Empenhadas até o bimestre", ...D },
      { rotulo: "Liquidadas até o bimestre", ...D },
      { rotulo: "Pagas até o bimestre", ...D },
      ...(sexto ? [{ rotulo: "Inscritas em restos a pagar não processados", ...D }] : []),
    ],
    linhas: linhas.map((l) => [
      recuo(l.nivel, l.rotulo),
      brl(l.dotacaoAtualizada),
      brl(l.empenhadaAteBimestre),
      brl(l.liquidadaAteBimestre),
      brl(l.pagaAteBimestre),
      ...(sexto ? [brl(l.inscritaEmRpnp)] : []),
    ]),
    totais: linhas.flatMap((l, i) => (l.nivel === 0 ? [i] : [])),
  };
}

function resultado(titulo: string, r: ResultadoAnexo4, sexto: boolean): SecaoPdf {
  return {
    titulo,
    colunas: [{ rotulo: "Especificação" }, { rotulo: "Valor", ...D }],
    linhas: [
      ["Previsão atualizada menos dotação atualizada", brl(r.previsto)],
      [sexto ? "Receita realizada menos despesa empenhada" : "Receita realizada menos despesa liquidada", brl(r.executado)],
    ],
  };
}

function saldos(titulo: string, coluna: string, linhas: readonly SaldoAnexo4[]): SecaoPdf {
  return { titulo, colunas: [{ rotulo: "Especificação" }, { rotulo: coluna, ...D }], linhas: linhas.map((s) => [s.rotulo, brl(s.valor)]) };
}

function fundo(nome: string, f: FundoAnexo4, sexto: boolean): SecaoPdf[] {
  return [
    receitas(`${nome} — receitas`, f.receitas),
    despesas(`${nome} — despesas`, f.despesas, sexto),
    resultado(`${nome} — resultado previdenciário`, f.resultado, sexto),
    saldos(`${nome} — recursos e reserva`, "Valor", [
      { rotulo: "Recursos do RPPS arrecadados em exercícios anteriores", valor: f.recursosDeExerciciosAnteriores },
      { rotulo: "Reserva orçamentária do RPPS", valor: f.reservaOrcamentaria },
    ]),
    saldos(`${nome} — aportes de recursos`, "Aportes realizados", f.aportes),
    saldos(`${nome} — bens e direitos`, "Saldo atual", f.bens),
  ];
}

export function tabelasDoRreoAnexo4(a: Anexo4): TabelasDoDocumento {
  const sexto = a.bimestre === 6;
  return {
    titulo: "Demonstrativo das Receitas e Despesas Previdenciárias",
    subtitulo: "Regime próprio de previdência dos servidores (LRF, art. 53, II)",
    periodo: `${String(a.bimestre)}º bimestre de ${String(a.exercicio)}`,
    secoes: [
      ...fundo("Fundo em capitalização (plano previdenciário)", a.capitalizacao, sexto),
      ...fundo("Fundo em repartição (plano financeiro)", a.reparticao, sexto),
      receitas("Administração do RPPS — receitas", a.administracao.receitas),
      despesas("Administração do RPPS — despesas", a.administracao.despesas, sexto),
      resultado("Administração do RPPS — resultado", a.administracao.resultado, sexto),
      saldos("Administração do RPPS — bens e direitos", "Saldo atual", a.administracao.bens),
      receitas("Benefícios mantidos pelo Tesouro — receitas", a.tesouro.receitas),
      despesas("Benefícios mantidos pelo Tesouro — despesas", a.tesouro.despesas, sexto),
      resultado("Benefícios mantidos pelo Tesouro — resultado", a.tesouro.resultado, sexto),
    ],
    notas: [
      "Linhas pelo mapeamento da Secretaria do Tesouro Nacional para o MDF, 15ª edição: fontes 800 (capitalização), 801 (repartição), 802 (administração) e 804 (Tesouro).",
      "A receita de aportes para amortização de déficit atuarial não compõe o total das receitas do fundo em capitalização.",
      ...a.notas,
      "Valores em R$.",
    ],
  };
}
