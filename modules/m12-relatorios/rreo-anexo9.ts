import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { calcularSaldos, type TipoMovimentoDotacao } from "../m05-despesa/dominio.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 9: DEMONSTRATIVO DAS RECEITAS DE OPERAÇÕES DE CRÉDITO E DESPESAS DE CAPITAL (REGRA DE OURO).
 * LRF, art. 53, § 1º, I; CF, art. 167, III; MDF 15ª ed., Tabela 9. Integra o RREO do último bimestre.
 *
 * As linhas vêm do mapeamento oficial da STN (`docs/oficial/stn-sof/mapeamento-rreo-mdf15-msc2026.zip`, "RREO - ANEXO 09",
 * linhas 12 e 18 a 22):
 *   Receitas de operações de crédito (I) ...... NR começada por 21 ou 81 (a intraorçamentária)
 *   Investimentos .............................. ND começada por 44
 *   Inversões financeiras ...................... ND começada por 45
 *   Amortização da dívida ...................... ND começada por 46
 *   (−) Incentivos fiscais a contribuinte ...... informação gerencial do ente (a MSC não a tem): zero, com nota
 *   Despesa de capital líquida (II) = soma − incentivos;   Resultado (III) = (II − I)
 *
 * Previsão atualizada = previsão da LOA + reprevisões; realizada = arrecadado líquido até o fim do bimestre (M04).
 * Dotação atualizada = régua do M05 (créditos e realocações); empenhada = líquida de estornos, até o fim do bimestre.
 * As operações de crédito autorizadas por créditos com finalidade precisa aprovados por maioria absoluta (a exceção do
 * art. 167, III) não se identificam no cadastro: entram todas, e a nota diz.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zero = (): Money => toMoney("0.00");
const soma = (a: Money, b: Money): Money => toMoney(a.plus(b));
const sub = (a: Money, b: Money): Money => toMoney(a.minus(b));

export const PREFIXOS_DA_OPERACAO_DE_CREDITO: readonly string[] = ["21", "81"];
export const GRUPOS_DA_DESPESA_DE_CAPITAL: readonly { readonly chave: string; readonly rotulo: string; readonly prefixo: string }[] = [
  { chave: "INVESTIMENTOS", rotulo: "Investimentos", prefixo: "44" },
  { chave: "INVERSOES", rotulo: "Inversões Financeiras", prefixo: "45" },
  { chave: "AMORTIZACAO", rotulo: "Amortização da Dívida", prefixo: "46" },
];

export interface LinhaReceitaAnexo9 {
  readonly previsaoAtualizada: string;
  readonly realizada: string;
  readonly saldoNaoRealizado: string;
}

export interface LinhaDespesaAnexo9 {
  readonly chave: string;
  readonly rotulo: string;
  readonly dotacaoAtualizada: string;
  readonly empenhada: string;
  readonly saldoNaoExecutado: string;
}

export interface Anexo9 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly operacoesDeCredito: LinhaReceitaAnexo9;
  readonly despesasDeCapital: readonly LinhaDespesaAnexo9[];
  readonly despesaDeCapitalLiquida: LinhaDespesaAnexo9;
  /** (II − I): na previsão (d − a) e na execução (e − b). Positivo: a regra de ouro foi cumprida. */
  readonly resultado: { readonly previsto: string; readonly executado: string };
  readonly cumpreRegraDeOuro: boolean;
  readonly notas: readonly string[];
}

export async function anexo9(leitor: Tx, p: { readonly exercicio: number; readonly bimestre: Bimestre }): Promise<Anexo9> {
  const { fim, inicioExercicio } = janelaDoBimestre(p.exercicio, p.bimestre);
  const ehOperacao = (nat: string) => PREFIXOS_DA_OPERACAO_DE_CREDITO.some((x) => nat.startsWith(x));

  // ── (I) receitas de operações de crédito ──
  let previsto = zero();
  for (const r of await leitor.receitaPrevista.findMany({ where: { exercicio: p.exercicio }, select: { tipoReceita: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } } } })) {
    if (!ehOperacao(r.naturezaReceita.codigo)) continue;
    const v = toMoney(r.valorPrevisto.toFixed(2));
    previsto = r.tipoReceita === "DEDUCAO" ? sub(previsto, v) : soma(previsto, v);
  }
  for (const [nat, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio: p.exercicio })) {
    if (ehOperacao(nat)) previsto = soma(previsto, ajuste);
  }
  let realizado = zero();
  for (const a of await arrecadadoPorNaturezaFonte(leitor, { desde: inicioExercicio, ate: fim })) {
    if (ehOperacao(a.naturezaCodigo)) realizado = soma(realizado, a.arrecadado);
  }

  // ── despesas de capital ──
  const fichas = await leitor.fichaOrcamentaria.findMany({ where: { exercicio: p.exercicio }, select: { id: true, naturezaDespesa: { select: { codigoCompleto: true } } } });
  const grupoDaFicha = new Map<string, string>();
  for (const f of fichas) {
    const g = GRUPOS_DA_DESPESA_DE_CAPITAL.find((x) => f.naturezaDespesa.codigoCompleto.startsWith(x.prefixo));
    if (g !== undefined) grupoDaFicha.set(f.id, g.chave);
  }
  const dotacao = new Map<string, Money>();
  const totais = new Map<string, Partial<Record<TipoMovimentoDotacao, Money>>>();
  for (const m of await leitor.movimentoDotacao.groupBy({ by: ["fichaId", "tipo"], where: { ficha: { exercicio: p.exercicio }, competencia: { lte: fim } }, _sum: { valor: true } })) {
    if (!grupoDaFicha.has(m.fichaId)) continue;
    const t = totais.get(m.fichaId) ?? {};
    t[m.tipo] = toMoney(m._sum.valor?.toFixed(2) ?? "0.00");
    totais.set(m.fichaId, t);
  }
  for (const [fichaId, t] of totais) {
    const g = grupoDaFicha.get(fichaId)!;
    dotacao.set(g, soma(dotacao.get(g) ?? zero(), calcularSaldos(t).autorizado));
  }
  const empenhosPorGrupo = new Map<string, { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[]>();
  for (const e of await leitor.empenho.findMany({ where: { ficha: { exercicio: p.exercicio }, data: { lte: fim } }, select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true } })) {
    const g = grupoDaFicha.get(e.fichaId);
    if (g === undefined) continue;
    const arr = empenhosPorGrupo.get(g) ?? [];
    arr.push({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId });
    empenhosPorGrupo.set(g, arr);
  }

  const linhas: LinhaDespesaAnexo9[] = GRUPOS_DA_DESPESA_DE_CAPITAL.map((g) => {
    const d = dotacao.get(g.chave) ?? zero();
    const e = somaLiquidaEstornaveis(empenhosPorGrupo.get(g.chave) ?? []);
    return { chave: g.chave, rotulo: g.rotulo, dotacaoAtualizada: d.toFixed(2), empenhada: e.toFixed(2), saldoNaoExecutado: sub(d, e).toFixed(2) };
  });
  const incentivos = zero();
  const dLiq = sub(linhas.reduce((a, l) => soma(a, toMoney(l.dotacaoAtualizada)), zero()), incentivos);
  const eLiq = sub(linhas.reduce((a, l) => soma(a, toMoney(l.empenhada)), zero()), incentivos);
  const liquida: LinhaDespesaAnexo9 = { chave: "LIQUIDA", rotulo: "DESPESA DE CAPITAL LÍQUIDA (II)", dotacaoAtualizada: dLiq.toFixed(2), empenhada: eLiq.toFixed(2), saldoNaoExecutado: sub(dLiq, eLiq).toFixed(2) };

  const resPrev = sub(dLiq, previsto);
  const resExec = sub(eLiq, realizado);
  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    operacoesDeCredito: { previsaoAtualizada: previsto.toFixed(2), realizada: realizado.toFixed(2), saldoNaoRealizado: sub(previsto, realizado).toFixed(2) },
    despesasDeCapital: linhas,
    despesaDeCapitalLiquida: liquida,
    resultado: { previsto: resPrev.toFixed(2), executado: resExec.toFixed(2) },
    cumpreRegraDeOuro: !resPrev.isNegative() && !resExec.isNegative(),
    notas: [
      "Incentivos fiscais a contribuinte (por empréstimo ou financiamento): informação do ente que a matriz de saldos contábeis não carrega; nenhum foi declarado, e as duas linhas ficam em zero.",
      "Todas as operações de crédito entram em (I). As autorizadas por créditos com finalidade precisa aprovados por maioria absoluta (CF, art. 167, III) não se distinguem no cadastro.",
      ...(p.bimestre !== 6 ? ["O demonstrativo integra o RREO do último bimestre; antes dele, é posição parcial."] : []),
    ],
  };
}
