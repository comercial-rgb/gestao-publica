import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import {
  relatorioDeIncorporacao,
  type FiltroDeIncorporacao,
  type SituacaoDaIncorporacao,
} from "../../modules/m10-patrimonial/relatorio-de-incorporacao";

/**
 * V36 — PORTA DO RELATÓRIO DE BENS INCORPORADOS E A INCORPORAR (TR 5.10.1.56). A conta é do M10; a porta troca
 * `Money` por string e devolve as opções dos filtros tiradas do universo do exercício (fichas de capital e classes),
 * nunca do cadastro inteiro.
 */

export interface OpcaoDoFiltro {
  readonly valor: string;
  readonly rotulo: string;
}

export interface RelatorioDeIncorporacaoDaTela {
  readonly liquidacoes: readonly {
    readonly liquidacaoId: string;
    readonly liquidacaoNumero: string;
    readonly data: Date;
    readonly empenhoId: string;
    readonly empenhoNumero: string;
    readonly credorCpfCnpj: string;
    readonly fichaNumero: number;
    readonly unidadeCodigo: string;
    readonly naturezaCodigo: string;
    readonly fonteCodigo: string;
    readonly classePrometida: string | null;
    readonly liquidado: string;
    readonly incorporado: string;
    readonly aIncorporar: string;
    readonly situacao: SituacaoDaIncorporacao;
  }[];
  readonly incorporacoes: readonly {
    readonly movimentoId: string;
    readonly data: Date;
    readonly valor: string;
    readonly bem: string | null;
    readonly classe: string;
    readonly conta: string;
    readonly liquidacaoNumero: string;
    readonly empenhoNumero: string;
  }[];
  readonly totais: { readonly liquidado: string; readonly incorporado: string; readonly aIncorporar: string; readonly incorporadoNoPeriodo: string };
  readonly opcoes: {
    readonly unidades: readonly OpcaoDoFiltro[];
    readonly funcoes: readonly OpcaoDoFiltro[];
    readonly programas: readonly OpcaoDoFiltro[];
    readonly acoes: readonly OpcaoDoFiltro[];
    readonly naturezas: readonly OpcaoDoFiltro[];
    readonly fontes: readonly OpcaoDoFiltro[];
    readonly classes: readonly OpcaoDoFiltro[];
    readonly contas: readonly OpcaoDoFiltro[];
  };
}

function unicas(xs: readonly OpcaoDoFiltro[]): readonly OpcaoDoFiltro[] {
  const m = new Map<string, OpcaoDoFiltro>();
  for (const x of xs) m.set(x.valor, x);
  return [...m.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

export async function lerRelatorioDeIncorporacao(f: FiltroDeIncorporacao): Promise<RelatorioDeIncorporacaoDaTela> {
  await exigirLeituraDoEnte("CONSULTAR_PATRIMONIO");
  const db = cliente();
  const r = await relatorioDeIncorporacao(db, f);

  const [fichas, classes] = await Promise.all([
    db.fichaOrcamentaria.findMany({
      where: { exercicio: f.exercicio, naturezaDespesa: { codNatureza: { in: ["4", "5"] } } },
      select: {
        unidadeOrc: { select: { id: true, codigo: true, descricao: true } },
        funcao: { select: { id: true, codigo: true, nome: true } },
        programa: { select: { id: true, codigo: true, descricao: true } },
        acao: { select: { id: true, codigo: true, descricao: true } },
        naturezaDespesa: { select: { id: true, codigoCompleto: true, descricao: true } },
        fonte: { select: { id: true, codigo: true, descricao: true } },
      },
    }),
    db.classeDeBens.findMany({ select: { id: true, codigo: true, descricao: true, contaContabilAtivo: { select: { id: true, codigo: true, nome: true } } } }),
  ]);

  return {
    liquidacoes: r.liquidacoes.map((l) => ({ ...l, liquidado: l.liquidado.toFixed(2), incorporado: l.incorporado.toFixed(2), aIncorporar: l.aIncorporar.toFixed(2) })),
    incorporacoes: r.incorporacoes.map((i) => ({ ...i, valor: i.valor.toFixed(2) })),
    totais: {
      liquidado: r.totais.liquidado.toFixed(2),
      incorporado: r.totais.incorporado.toFixed(2),
      aIncorporar: r.totais.aIncorporar.toFixed(2),
      incorporadoNoPeriodo: r.totais.incorporadoNoPeriodo.toFixed(2),
    },
    opcoes: {
      unidades: unicas(fichas.map((x) => ({ valor: x.unidadeOrc.id, rotulo: `${x.unidadeOrc.codigo} — ${x.unidadeOrc.descricao}` }))),
      funcoes: unicas(fichas.map((x) => ({ valor: x.funcao.id, rotulo: `${x.funcao.codigo} — ${x.funcao.nome}` }))),
      programas: unicas(fichas.map((x) => ({ valor: x.programa.id, rotulo: `${x.programa.codigo} — ${x.programa.descricao}` }))),
      acoes: unicas(fichas.map((x) => ({ valor: x.acao.id, rotulo: `${x.acao.codigo} — ${x.acao.descricao}` }))),
      naturezas: unicas(fichas.map((x) => ({ valor: x.naturezaDespesa.id, rotulo: `${x.naturezaDespesa.codigoCompleto} — ${x.naturezaDespesa.descricao}` }))),
      fontes: unicas(fichas.map((x) => ({ valor: x.fonte.id, rotulo: `${x.fonte.codigo} — ${x.fonte.descricao}` }))),
      classes: unicas(classes.map((c) => ({ valor: c.id, rotulo: `${c.codigo} — ${c.descricao}` }))),
      contas: unicas(classes.map((c) => ({ valor: c.contaContabilAtivo.id, rotulo: `${c.contaContabilAtivo.codigo} — ${c.contaContabilAtivo.nome}` }))),
    },
  };
}
