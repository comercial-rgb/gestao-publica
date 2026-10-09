import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { nomesDosCredores } from "./empenho";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { arrecadadoPorFonteMesAMes, arrecadadoPorNaturezaFonteMesAMes } from "../../modules/m04-receita/arrecadado-mes-a-mes";
import { arrecadadoPorNaturezaFonte } from "../../modules/m04-receita/consultas";
import { pagamentosEfetuados, totaisDosPagamentos } from "../../modules/m05-despesa/pagamentos-efetuados";

/**
 * V36 — DUAS LEITURAS DE TESOURARIA SOBRE A RECEITA E A DESPESA, compostas das somas dos módulos donos:
 *  · a receita arrecadada mês a mês, por fonte, dos três últimos exercícios (TR 5.10.2.60) — `arrecadadoPorFonteMesAMes`;
 *  · o demonstrativo DIÁRIO da receita arrecadada e da despesa paga (TR 5.10.2.58) — `arrecadadoPorNaturezaFonte` e
 *    `pagamentosEfetuados` na janela civil do dia.
 * As duas são do ENTE (a receita não tem unidade orçamentária): pedem a leitura do ente.
 */

export interface LinhaDaReceitaMensal {
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly ano: number;
  readonly meses: readonly string[];
  readonly total: string;
}

export async function lerReceitaMesAMes(anoFinal: number): Promise<{ readonly anos: readonly number[]; readonly linhas: readonly LinhaDaReceitaMensal[]; readonly totaisPorAno: ReadonlyMap<number, string> }> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const prisma = cliente();
  const anos = [anoFinal - 2, anoFinal - 1, anoFinal];
  const [porFonte, fontes] = await Promise.all([
    arrecadadoPorFonteMesAMes(prisma, anos),
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true } }),
  ]);
  const fonte = new Map(fontes.map((f) => [f.id, f]));
  const linhas = porFonte
    .map((l) => ({
      fonteCodigo: fonte.get(l.fonteId)?.codigo ?? l.fonteId,
      fonteDescricao: fonte.get(l.fonteId)?.descricao ?? "",
      ano: l.ano,
      meses: l.meses.map((m) => m.toFixed(2)),
      total: l.total.toFixed(2),
    }))
    .sort((a, b) => a.fonteCodigo.localeCompare(b.fonteCodigo) || a.ano - b.ano);
  const totaisPorAno = new Map(
    anos.map((ano) => [ano, porFonte.filter((l) => l.ano === ano).reduce((s, l) => toMoney(s.plus(l.total)), toMoney("0.00")).toFixed(2)])
  );
  return { anos, linhas, totaisPorAno };
}

export interface LinhaDaReceitaPorNatureza {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly meses: readonly string[];
  readonly total: string;
  /** As fontes da receita, cada uma mês a mês (a soma delas é a linha). */
  readonly fontes: readonly LinhaDaReceitaMensal[];
}

/**
 * O DEMONSTRATIVO DA RECEITA ARRECADADA MÊS A MÊS DE UM EXERCÍCIO (TR 5.10.2.59): por natureza, com as fontes de cada
 * uma, e o resumo por fonte. Tudo de `arrecadadoPorNaturezaFonteMesAMes`; aqui só se agrupa e se dá nome à fonte.
 */
export async function lerReceitaPorNaturezaMesAMes(ano: number): Promise<{
  readonly linhas: readonly LinhaDaReceitaPorNatureza[];
  readonly resumoPorFonte: readonly LinhaDaReceitaMensal[];
  readonly meses: readonly string[];
  readonly total: string;
}> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const prisma = cliente();
  const [detalhe, fontes] = await Promise.all([
    arrecadadoPorNaturezaFonteMesAMes(prisma, ano),
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true, descricao: true } }),
  ]);
  const fonte = new Map(fontes.map((f) => [f.id, f]));
  const zero = toMoney("0.00");
  const somarMeses = (a: readonly Money[], b: readonly Money[]): Money[] => a.map((v, i) => toMoney(v.plus(b[i] ?? zero)));
  const doze = (): Money[] => Array.from({ length: 12 }, () => zero);
  const daFonte = (fonteId: string, meses: readonly Money[]): LinhaDaReceitaMensal => ({
    fonteCodigo: fonte.get(fonteId)?.codigo ?? fonteId,
    fonteDescricao: fonte.get(fonteId)?.descricao ?? "",
    ano,
    meses: meses.map((m) => m.toFixed(2)),
    total: meses.reduce((s, m) => toMoney(s.plus(m)), zero).toFixed(2),
  });

  const porNatureza = new Map<string, { descricao: string; meses: Money[]; fontes: LinhaDaReceitaMensal[] }>();
  const porFonte = new Map<string, Money[]>();
  let geral = doze();
  for (const l of detalhe) {
    const n = porNatureza.get(l.naturezaCodigo) ?? { descricao: l.naturezaDescricao, meses: doze(), fontes: [] };
    n.meses = somarMeses(n.meses, l.meses);
    n.fontes.push(daFonte(l.fonteId, l.meses));
    porNatureza.set(l.naturezaCodigo, n);
    porFonte.set(l.fonteId, somarMeses(porFonte.get(l.fonteId) ?? doze(), l.meses));
    geral = somarMeses(geral, l.meses);
  }
  const porCodigo = (a: LinhaDaReceitaMensal, b: LinhaDaReceitaMensal): number => a.fonteCodigo.localeCompare(b.fonteCodigo, "pt-BR", { numeric: true });
  return {
    linhas: [...porNatureza].map(([codigo, n]) => ({
      naturezaCodigo: codigo,
      naturezaDescricao: n.descricao,
      meses: n.meses.map((m) => m.toFixed(2)),
      total: n.meses.reduce((s, m) => toMoney(s.plus(m)), zero).toFixed(2),
      fontes: [...n.fontes].sort(porCodigo),
    })),
    resumoPorFonte: [...porFonte].map(([fonteId, meses]) => daFonte(fonteId, meses)).sort(porCodigo),
    meses: geral.map((m) => m.toFixed(2)),
    total: geral.reduce((s, m) => toMoney(s.plus(m)), zero).toFixed(2),
  };
}

export interface MovimentoDoDia {
  readonly dia: string;
  readonly receitas: readonly { readonly naturezaCodigo: string; readonly naturezaDescricao: string; readonly fonteCodigo: string; readonly arrecadado: string }[];
  readonly totalDaReceita: string;
  readonly pagamentos: readonly {
    readonly id: string;
    readonly numero: string;
    readonly empenhoId: string;
    readonly empenhoNumero: string;
    readonly credor: string;
    readonly fonteCodigo: string;
    readonly origem: "EXERCICIO" | "RESTOS";
    readonly pago: string;
    readonly retido: string;
    readonly liquido: string;
  }[];
  readonly totaisDaDespesa: { readonly pago: string; readonly retido: string; readonly liquido: string };
}

/** O dia civil (AAAA-MM-DD). Valor malformado é recusado pelo chamador, nunca trocado por outro dia. */
/** V38 — o último dia civil com pagamento ou arrecadação, para a tela não abrir vazia em "hoje". */
export async function ultimoDiaComMovimento(): Promise<string | null> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  const prisma = cliente();
  const [pg, ar] = await Promise.all([
    prisma.pagamento.findFirst({ orderBy: { data: "desc" }, select: { data: true } }),
    prisma.receitaArrecadada.findFirst({ orderBy: { dataArrecadacao: "desc" }, select: { dataArrecadacao: true } }),
  ]);
  const datas = [pg?.data, ar?.dataArrecadacao].filter((d): d is Date => d instanceof Date);
  if (datas.length === 0) return null;
  return diaCivil(new Date(Math.max(...datas.map((d) => d.getTime()))));
}

export async function lerMovimentoDoDia(dia: string): Promise<MovimentoDoDia> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  await exigirLeituraDoEnte("CONSULTAR_DESPESA");
  const prisma = cliente();
  const janela = { de: inicioDoDiaCivil(dia), ate: fimDoDiaCivil(dia) };
  const [receitas, pagamentos, fontes] = await Promise.all([
    arrecadadoPorNaturezaFonte(prisma, { desde: janela.de, ate: janela.ate }),
    pagamentosEfetuados(prisma, janela),
    prisma.fonteRecurso.findMany({ select: { id: true, codigo: true } }),
  ]);
  const codigo = new Map(fontes.map((f) => [f.id, f.codigo]));
  const nomes = await nomesDosCredores([...new Set(pagamentos.map((p) => p.credorCpfCnpj))]);
  const t = totaisDosPagamentos(pagamentos);
  return {
    dia,
    receitas: receitas
      .map((r) => ({ naturezaCodigo: r.naturezaCodigo, naturezaDescricao: r.naturezaDescricao, fonteCodigo: codigo.get(r.fonteId) ?? r.fonteId, arrecadado: r.arrecadado.toFixed(2) }))
      .sort((a, b) => a.naturezaCodigo.localeCompare(b.naturezaCodigo) || a.fonteCodigo.localeCompare(b.fonteCodigo)),
    totalDaReceita: receitas.reduce((s, r) => toMoney(s.plus(r.arrecadado)), toMoney("0.00")).toFixed(2),
    pagamentos: pagamentos.map((p) => ({
      id: p.id, numero: p.numero, empenhoId: p.empenhoId, empenhoNumero: p.empenhoNumero, credor: nomes.get(p.credorCpfCnpj) ?? p.credorCpfCnpj,
      fonteCodigo: p.fonteCodigo, origem: p.origem, pago: p.pagoVivo.toFixed(2), retido: p.retido.toFixed(2), liquido: p.liquido.toFixed(2),
    })),
    totaisDaDespesa: { pago: t.pagoVivo.toFixed(2), retido: t.retido.toFixed(2), liquido: t.liquido.toFixed(2) },
  };
}
