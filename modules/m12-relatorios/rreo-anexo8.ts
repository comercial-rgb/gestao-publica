import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";
import { baseDeImpostos, lerDeParaBaseImpostos } from "./base-impostos.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 8: MDE (Manutenção e Desenvolvimento do Ensino), BLOCO 1. LDB art. 72 · CF art.
 * 212/212-A · MDF 15ª ed. (modelo municípios). Mínimo 25% (CF 212) + FUNDEB (70% profissionais).
 *
 * ═══ RECEITAS: A MESMA BASE, OUTRA REPARTIÇÃO ═══
 * As receitas (impostos + transferências) vêm do MOTOR DE BASE (`baseDeImpostos`) — o mesmo do
 * Anexo 12. A diferença é a REPARTIÇÃO: cada chave cai num GRUPO de apuração:
 *   G20 (base do FUNDEB): FPM(parcela), ICMS, IPI-Export, ITR, IPVA, Compensações → destina-se 20%.
 *   G25 (além do FUNDEB): IPTU, ITBI, ISS, IRRF, FPM(complementações 1%), IOF-Ouro → aplica-se 25%.
 * Linha 4 (destinado ao FUNDEB) = 20% × Σ(G20). Linha 5 (mínimo além) = 5% × Σ(G20) + 25% × Σ(G25).
 *
 * ⚠️ OS GRUPOS SÃO CONFIG POR CHAVE (não por número de linha). A 12ª/13ª tinha as "Outras/
 * Compensações" (2.7) no grupo 25%; a 14ª as moveu para a base do FUNDEB (G20). Adoto G20 (14ª/15ª)
 * com NOTA no demonstrativo; a conferência contra o xlsx da 15ª é pendência de dado (MODULO.md).
 *
 * ⚠️ LINHA 4 É CALCULADA (20% × G20). A dedução do FUNDEB REGISTRADA (a redutora do Anexo 12) pode
 * DIVERGIR — a nota oficial STN admite, e não há campo para explicar. O demonstrativo mostra a
 * CALCULADA; o MODULO.md registra que produção pode divergir. R4 usa fixture com dedução exata.
 *
 * ═══ FUNDEB E O INDICADOR DE 70% ═══
 * As receitas recebidas do FUNDEB (retorno, VAAF, VAAT, rendimentos) vêm do `DeParaFundebReceita`.
 * As despesas do FUNDEB são a função 12 custeada por fonte de classe FUNDEB; o destaque são os
 * PROFISSIONAIS da educação básica (elemento {04, 11, 13, 16}). O indicador (art. 212-A XI CF):
 * % = profissionais / recebido do FUNDEB × 100, mínimo 70%.
 *
 * ⚠️ REGRA DOS BIMESTRES (nota 5 do modelo): 1-5 acompanham pela LIQUIDADA, 6º pela EMPENHADA —
 * o mesmo padrão do Anexo 1. É PARÂMETRO derivado do bimestre, não hardcode.
 *
 * Leitura pura, composta. Zero escrita, zero SUM bruto.
 */

// ═══════════════════════════════════════════════════════════════════════════
// A CONFIG DAS LINHAS DE RECEITA — chaves estáveis, grupos por chave
// ═══════════════════════════════════════════════════════════════════════════

type GrupoMde = "G20" | "G25";

interface ConfigLinhaReceita {
  readonly chave: string; // a chave do motor de base
  readonly numero: string;
  readonly rotulo: string;
  readonly grupo: GrupoMde;
}

/**
 * A estrutura da Tabela do Anexo 8, por CHAVE (não por número). A renumeração da 15ª ed. entra por
 * editar esta tabela — nunca o motor. `grupo` decide a apuração (20% base FUNDEB × 25% além).
 */
const LINHAS_RECEITA_MDE: readonly ConfigLinhaReceita[] = [
  { chave: "IPTU", numero: "1.1", rotulo: "IPTU", grupo: "G25" },
  { chave: "ITBI", numero: "1.2", rotulo: "ITBI", grupo: "G25" },
  { chave: "ISS", numero: "1.3", rotulo: "ISS", grupo: "G25" },
  { chave: "IRRF", numero: "1.4", rotulo: "IRRF", grupo: "G25" },
  { chave: "FPM", numero: "2.1.1", rotulo: "Cota-Parte do FPM — Parcela art. 159, I-b (base do FUNDEB)", grupo: "G20" },
  { chave: "FPM_COMPLEMENTACAO", numero: "2.1.2", rotulo: "Cota-Parte do FPM — Complementações 1% (fora do FUNDEB)", grupo: "G25" },
  { chave: "ICMS", numero: "2.2", rotulo: "Cota-Parte do ICMS", grupo: "G20" },
  { chave: "IPI_EXPORTACAO", numero: "2.3", rotulo: "Cota-Parte do IPI-Exportação", grupo: "G20" },
  { chave: "ITR", numero: "2.4", rotulo: "Cota-Parte do ITR", grupo: "G20" },
  { chave: "IPVA", numero: "2.5", rotulo: "Cota-Parte do IPVA", grupo: "G20" },
  { chave: "IOF_OURO", numero: "2.6", rotulo: "Cota-Parte do IOF-Ouro (fora do FUNDEB)", grupo: "G25" },
  { chave: "COMPENSACOES", numero: "2.7", rotulo: "Outras Transferências e Compensações", grupo: "G20" },
];

const PERC_FUNDEB = toMoney("20"); // 20% do grupo G20 destina-se ao FUNDEB
const PERC_ALEM_G20 = toMoney("5"); // 5% do G20 aplica-se além do FUNDEB
const PERC_ALEM_G25 = toMoney("25"); // 25% do G25
const LIMITE_PROFISSIONAIS = toMoney("70.00");

/** Elementos da remuneração dos profissionais da educação básica (rol fechado). */
const ELEMENTOS_PROFISSIONAIS: ReadonlySet<string> = new Set(["04", "11", "13", "16"]);

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaReceitaMde {
  readonly chave: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly nivel: "grupo" | "item" | "total";
  readonly previsaoAtualizada: string; // (a)
  readonly realizada: string; // (b)
  readonly percentRealizada: string; // %(b/a)
}

export interface LinhaFundebReceita {
  readonly papel: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly valor: string;
}

export interface DespesaFundeb {
  readonly rotulo: string;
  readonly empenhada: string;
  readonly liquidada: string;
  readonly paga: string;
  /** o valor de ACOMPANHAMENTO (liquidada nos bim 1-5, empenhada no 6º). */
  readonly acompanhamento: string;
}

export interface Anexo8 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  // RECEITAS (quadro 1)
  readonly receitas: readonly LinhaReceitaMde[]; // 1.x, 1, 2.x, 2
  readonly totalReceitas: LinhaReceitaMde; // 3
  readonly totalDestinadoFundeb: string; // 4 = 20% × Σ(G20)
  readonly minimoAlemFundeb: string; // 5 = 5%×G20 + 25%×G25
  // FUNDEB (quadro 6+)
  readonly receitasFundeb: readonly LinhaFundebReceita[]; // 6.1-6.4
  readonly totalRecebidoFundeb: string; // 6
  readonly superavitAnterior: string; // 8 (tabela-parâmetro vazia)
  readonly totalDisponivelFundeb: string; // 9 = 6 + 8
  readonly despesaFundebTotal: DespesaFundeb; // 10
  readonly despesaProfissionais: DespesaFundeb; // destaque
  // INDICADOR (art. 212-A XI)
  readonly indicadorProfissionais: string; // 15% = profissionais(acomp) / 6 × 100
  readonly limiteProfissionais: string; // "70.00"
  readonly atingiuProfissionais: boolean;
  readonly baseAcompanhamento: "liquidada" | "empenhada";
  readonly notas: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));

/** %(x/a) ARRED 2 casas via Decimal (ROUND_HALF_EVEN do `toMoney`), regra Siconfi. */
function percent(x: Money, a: Money): string {
  if (a.equals(0)) return "0.00";
  return toMoney(x.dividedBy(a).times(100)).toFixed(2);
}
/** p% de base, ARRED 2 casas via Decimal. */
function percentualDe(base: Money, p: Money): Money {
  return toMoney(base.times(p).dividedBy(100));
}

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

export async function anexo8(
  leitor: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre; readonly incluirIBS?: boolean }
): Promise<Anexo8> {
  const { fim } = janelaDoBimestre(p.exercicio, p.bimestre);
  const notas: string[] = [];
  const baseAcompanhamento: "liquidada" | "empenhada" = p.bimestre === 6 ? "empenhada" : "liquidada";

  const receitas = await montarReceitas(leitor, p.exercicio, fim, p.incluirIBS ?? false, notas);
  const fundeb = await montarFundeb(leitor, p.exercicio, fim, baseAcompanhamento, notas);

  // INDICADOR 70% dos profissionais (art. 212-A XI): profissionais(acomp) / recebido do FUNDEB.
  const recebido = toMoney(fundeb.totalRecebido);
  const profissionaisAcomp = toMoney(fundeb.despesaProfissionais.acompanhamento);
  const indicadorProfissionais = percent(profissionaisAcomp, recebido);

  notas.push(
    baseAcompanhamento === "empenhada"
      ? "6º bimestre: o acompanhamento das despesas usa a EMPENHADA (nota 5 do modelo MDF)."
      : "Bimestres 1-5: o acompanhamento das despesas usa a LIQUIDADA (nota 5 do modelo MDF)."
  );

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    receitas: receitas.linhas,
    totalReceitas: receitas.total,
    totalDestinadoFundeb: receitas.totalDestinadoFundeb,
    minimoAlemFundeb: receitas.minimoAlemFundeb,
    receitasFundeb: fundeb.receitas,
    totalRecebidoFundeb: fundeb.totalRecebido,
    superavitAnterior: "0.00",
    totalDisponivelFundeb: fundeb.totalRecebido, // 9 = 6 + 8 (8 = 0)
    despesaFundebTotal: fundeb.despesaTotal,
    despesaProfissionais: fundeb.despesaProfissionais,
    indicadorProfissionais,
    limiteProfissionais: LIMITE_PROFISSIONAIS.toFixed(2),
    atingiuProfissionais: toMoney(indicadorProfissionais).greaterThanOrEqualTo(LIMITE_PROFISSIONAIS),
    baseAcompanhamento,
    notas,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO RECEITAS (1-5)
// ═══════════════════════════════════════════════════════════════════════════

async function montarReceitas(
  leitor: Tx,
  exercicio: number,
  fim: Date,
  incluirIBS: boolean,
  notas: string[]
): Promise<{
  linhas: LinhaReceitaMde[];
  total: LinhaReceitaMde;
  totalDestinadoFundeb: string;
  minimoAlemFundeb: string;
}> {
  const base = await baseDeImpostos(leitor, { exercicio, ate: fim, incluirIBS });
  const realizadaPorChave = new Map<string, Money>();
  for (const l of [...base.impostos, ...base.transferencias]) realizadaPorChave.set(l.chave, toMoney(l.total));

  // previsão da LOA, pelo MESMO de-para do motor de base.
  const dePara = await lerDeParaBaseImpostos(leitor);
  const previsaoPorChave = new Map<string, Money>();
  const somarPrevisao = (codigo: string, valor: Money): void => {
    const chave = dePara.get(codigo);
    if (chave === undefined || chave === "DED_FUNDEB") return;
    previsaoPorChave.set(chave, soma(previsaoPorChave.get(chave) ?? zero(), valor));
  };
  for (const r of await leitor.receitaPrevista.findMany({ where: { exercicio }, select: { valorPrevisto: true, naturezaReceita: { select: { codigo: true } } } })) somarPrevisao(r.naturezaReceita.codigo, toMoney(r.valorPrevisto.toFixed(2)));
  // previsão ATUALIZADA = inicial + reprevisões (append-only, M02).
  for (const [cod, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio })) somarPrevisao(cod, ajuste);

  const itens: LinhaReceitaMde[] = LINHAS_RECEITA_MDE.map((c) => linhaReceita(c.chave, c.numero, c.rotulo, "item", previsaoPorChave, realizadaPorChave));

  // subtotais 1 (impostos: numero começa com "1.") e 2 (transferências: "2.")
  const grupo1 = itens.filter((l) => l.numero.startsWith("1."));
  const grupo2 = itens.filter((l) => l.numero.startsWith("2."));
  const sub1 = totalizar("GRUPO_1", "1", "RECEITA DE IMPOSTOS", grupo1);
  const sub2 = totalizar("GRUPO_2", "2", "RECEITA DE TRANSFERÊNCIAS CONSTITUCIONAIS E LEGAIS", grupo2);
  const total = totalizar("TOTAL_3", "3", "TOTAL DAS RECEITAS (3) = (1) + (2)", [sub1, sub2]);

  // linhas 4 e 5 — pelos GRUPOS de apuração (G20/G25), sobre a REALIZADA.
  const somaGrupo = (g: GrupoMde) =>
    LINHAS_RECEITA_MDE.filter((c) => c.grupo === g).reduce((s, c) => soma(s, realizadaPorChave.get(c.chave) ?? zero()), zero());
  const g20 = somaGrupo("G20");
  const g25 = somaGrupo("G25");
  const totalDestinadoFundeb = percentualDe(g20, PERC_FUNDEB); // 4 = 20% × G20
  const minimoAlemFundeb = soma(percentualDe(g20, PERC_ALEM_G20), percentualDe(g25, PERC_ALEM_G25)); // 5

  notas.push(
    "Grupos de apuração (config por chave): 2.7 (Outras/Compensações) está no grupo do FUNDEB (20%) " +
      "conforme a 14ª/15ª ed.; a 12ª/13ª a tratava no grupo dos 25%. Conferência contra o xlsx da 15ª " +
      "é pendência de dado."
  );
  notas.push(
    "A linha 4 (Total Destinado ao FUNDEB) é CALCULADA (20% da base). A dedução efetivamente " +
      "registrada pode divergir — a nota oficial da STN admite (ver o MODULO.md)."
  );

  // ordem final: itens de 1, subtotal 1, itens de 2, subtotal 2, total 3.
  const linhas = [...grupo1, sub1, ...grupo2, sub2];
  return { linhas, total, totalDestinadoFundeb: totalDestinadoFundeb.toFixed(2), minimoAlemFundeb: minimoAlemFundeb.toFixed(2) };
}

function linhaReceita(
  chave: string,
  numero: string,
  rotulo: string,
  nivel: LinhaReceitaMde["nivel"],
  previsao: ReadonlyMap<string, Money>,
  realizada: ReadonlyMap<string, Money>
): LinhaReceitaMde {
  const prev = previsao.get(chave) ?? zero();
  const real = realizada.get(chave) ?? zero();
  return {
    chave, numero, rotulo, nivel,
    previsaoAtualizada: prev.toFixed(2),
    realizada: real.toFixed(2),
    percentRealizada: percent(real, prev),
  };
}

function totalizar(chave: string, numero: string, rotulo: string, linhas: readonly LinhaReceitaMde[]): LinhaReceitaMde {
  const prev = linhas.reduce((s, l) => soma(s, toMoney(l.previsaoAtualizada)), zero());
  const real = linhas.reduce((s, l) => soma(s, toMoney(l.realizada)), zero());
  return {
    chave, numero, rotulo, nivel: numero === "3" ? "total" : "grupo",
    previsaoAtualizada: prev.toFixed(2),
    realizada: real.toFixed(2),
    percentRealizada: percent(real, prev),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// QUADRO FUNDEB (6-15)
// ═══════════════════════════════════════════════════════════════════════════

const PAPEIS_FUNDEB: readonly { readonly papel: string; readonly numero: string; readonly rotulo: string }[] = [
  { papel: "RETORNO", numero: "6.1", rotulo: "Transferências de Recursos do FUNDEB (retorno)" },
  { papel: "VAAF", numero: "6.2", rotulo: "Complementação da União ao FUNDEB — VAAF" },
  { papel: "VAAT", numero: "6.3", rotulo: "Complementação da União ao FUNDEB — VAAT" },
  { papel: "RENDIMENTOS", numero: "6.4", rotulo: "Receita de Aplicação Financeira dos Recursos do FUNDEB" },
];

async function montarFundeb(
  leitor: Tx,
  exercicio: number,
  fim: Date,
  base: "liquidada" | "empenhada",
  notas: string[]
): Promise<{
  receitas: LinhaFundebReceita[];
  totalRecebido: string;
  despesaTotal: DespesaFundeb;
  despesaProfissionais: DespesaFundeb;
}> {
  // ── RECEITAS do FUNDEB (6.1-6.4), por papel ──
  const dePara = new Map<string, string>();
  for (const d of await leitor.deParaFundebReceita.findMany({ select: { naturezaCodigo: true, papel: true } })) {
    dePara.set(d.naturezaCodigo, d.papel);
  }
  const arrec = await arrecadadoPorNaturezaFonte(leitor, { ate: fim });
  const porPapel = new Map<string, Money>();
  for (const a of arrec) {
    const papel = dePara.get(a.naturezaCodigo);
    if (papel === undefined) continue;
    porPapel.set(papel, soma(porPapel.get(papel) ?? zero(), a.arrecadado));
  }
  const receitas: LinhaFundebReceita[] = PAPEIS_FUNDEB.map((p) => ({
    papel: p.papel, numero: p.numero, rotulo: p.rotulo, valor: (porPapel.get(p.papel) ?? zero()).toFixed(2),
  }));
  const totalRecebido = receitas.reduce((s, r) => soma(s, toMoney(r.valor)), zero());

  // ── DESPESAS do FUNDEB (função 12, fonte de classe FUNDEB) ──
  const classeDaFonte = new Map<string, string>();
  for (const d of await leitor.deParaFonteClasseEducacao.findMany({ select: { fonteCodigo: true, classe: true } })) {
    classeDaFonte.set(d.fonteCodigo, d.classe);
  }
  const fichas = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio, funcao: { codigo: "12" } },
    select: { id: true, naturezaDespesa: { select: { codElemento: true } }, fonte: { select: { codigo: true } } },
  });

  const fichasFundeb: string[] = [];
  const fichasProfissionais = new Set<string>();
  for (const f of fichas) {
    // FAIL-CLOSED: fonte de educação sem classe PARA o gerador, nomeando-a.
    const classe = classeDaFonte.get(f.fonte.codigo);
    if (classe === undefined) {
      throw new Error(
        `RREO Anexo 8 (MDE): a fonte "${f.fonte.codigo}" custeia despesa de educação (função 12) mas ` +
          `NÃO tem classe mapeada (DeParaFonteClasseEducacao). Classifique-a (FUNDEB/VAAT/IMPOSTOS_MDE/` +
          `OUTRAS) — o mínimo de 25% e o indicador de 70% são limites constitucionais.`
      );
    }
    if (classe !== "FUNDEB") continue; // o quadro do FUNDEB é só a classe FUNDEB
    fichasFundeb.push(f.id);
    if (ELEMENTOS_PROFISSIONAIS.has(f.naturezaDespesa.codElemento)) fichasProfissionais.add(f.id);
  }

  const despesaTotal = await medirDespesa(leitor, fichasFundeb, null, exercicio, fim, base, "Total das Despesas com Recursos do FUNDEB");
  const despesaProfissionais = await medirDespesa(leitor, fichasFundeb, fichasProfissionais, exercicio, fim, base, "Profissionais da Educação Básica");

  if (fichasProfissionais.size === 0 && fichasFundeb.length > 0) {
    notas.push("Nenhuma despesa do FUNDEB caiu nos elementos de profissionais {04,11,13,16} — verifique a classificação da despesa.");
  }

  return { receitas, totalRecebido: totalRecebido.toFixed(2), despesaTotal, despesaProfissionais };
}

/**
 * Empenhada/liquidada/paga (até `fim`, data do fato, líquido de estornos) de um conjunto
 * de fichas.
 *
 * ⚠️ EXPORTADA NA 7.6-b para o bloco 2 (VAAT, áreas de atuação) reusá-la. A regra
 * bimestral — liquidada nos bimestres 1-5, empenhada no 6º (nota 5 do MDF) — tem UM
 * dono, e é este. Uma segunda medição no `mde-vaat.ts` divergiria dela no primeiro
 * estorno, e os dois quadros do mesmo anexo passariam a discordar sobre a mesma despesa.
 */
export async function medirDespesa(
  leitor: Tx,
  fichaIds: readonly string[],
  filtro: ReadonlySet<string> | null,
  exercicio: number,
  fim: Date,
  base: "liquidada" | "empenhada",
  rotulo: string
): Promise<DespesaFundeb> {
  void exercicio;
  const ids = filtro === null ? fichaIds : fichaIds.filter((id) => filtro.has(id));
  if (ids.length === 0) {
    return { rotulo, empenhada: "0.00", liquidada: "0.00", paga: "0.00", acompanhamento: "0.00" };
  }

  const empenhos = await leitor.empenho.findMany({
    where: { fichaId: { in: [...ids] } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const empenhada = somaLiquidaEstornaveis(empenhos.filter((e) => e.data <= fim).map((e) => ({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId })));

  const liqs = await leitor.liquidacao.findMany({
    where: { empenho: { fichaId: { in: [...ids] } } },
    select: { id: true, valor: true, data: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const liquidada = somaLiquidaEstornaveis(liqs.filter((l) => l.data <= fim).map((l) => ({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId })));

  const pags = await leitor.pagamento.findMany({
    where: { liquidacao: { empenho: { fichaId: { in: [...ids] } } }, data: { lte: fim } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const paga = somaLiquidaEstornaveis(pags.map((pg) => ({ id: pg.id, valor: toMoney(pg.valor.toFixed(2)), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId })));

  return {
    rotulo,
    empenhada: empenhada.toFixed(2),
    liquidada: liquidada.toFixed(2),
    paga: paga.toFixed(2),
    acompanhamento: (base === "empenhada" ? empenhada : liquidada).toFixed(2),
  };
}
