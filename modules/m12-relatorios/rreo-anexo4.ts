import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somasPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { reprevisaoAcumuladaPorNatureza } from "../m02-planejamento/consultas.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { calcularSaldos, type TipoMovimentoDotacao } from "../m05-despesa/dominio.js";
import { janelaDoBimestre, type Bimestre } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 4: DEMONSTRATIVO DAS RECEITAS E DESPESAS PREVIDENCIÁRIAS DO RPPS (LRF, art. 53, II).
 * MDF 15ª ed., Tabela 4 (Municípios). As regras de cada linha são TRANSCRITAS do mapeamento oficial da STN
 * (`docs/oficial/stn-sof/mapeamento-rreo-mdf15-msc2026.zip`, "RREO - ANEXO 04", aba "Anexo 4 - RPPS ( M e DF )",
 * atualizado 04/2026; sha256 9e626eed…); o número entre colchetes em cada regra é a linha da planilha. O teste confere
 * cada lista transcrita contra a célula oficial, lida de forma independente.
 *
 * ═══ QUEM É DE QUAL QUADRO ═══
 * Pela FONTE, como o mapeamento manda: 800 fundo em capitalização, 801 fundo em repartição, 802 administração (taxa),
 * 804 benefícios mantidos pelo Tesouro. Os benefícios pagos com OUTRA fonte entram no fundo quando a ficha traz o código
 * de acompanhamento previdenciário (1111… capitalização, 2111… repartição) na subfunção 272, e no quadro do Tesouro
 * quando estão na subfunção 274 — os "blocos de informação complementar" do mapeamento.
 *
 * ═══ ONDE ESTE SISTEMA SE AFASTA DO MAPEAMENTO, E POR QUÊ (nomeado nas notas do demonstrativo) ═══
 *   · O subelemento é opcional no empenho e não existe na ficha. Aposentadoria (01), pensão (03) e compensação (86)
 *     se classificam pelo ELEMENTO; sentenças (91), despesas de exercícios anteriores (92) e indenizações (94), que o
 *     mapeamento parte por subelemento, vão a "Demais despesas previdenciárias" quando o subelemento falta.
 *   · O saldo das contas não carrega a fonte: no quadro de bens, a conta 1.1.1.1.3 (que o mapeamento parte pela fonte)
 *     não entra; entram as contas próprias de cada plano.
 *   · O bloco de despesa da administração paga com outra fonte (pelo Poder/Órgão do RPPS) não é lido.
 *   · A reprevisão da receita é por natureza: vai ao quadro em que a natureza foi prevista; se foi prevista em mais de
 *     um (ou em nenhum), fica fora e é nomeada.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zero = (): Money => toMoney("0.00");
const soma = (a: Money, b: Money): Money => toMoney(a.plus(b));
const sub = (a: Money, b: Money): Money => toMoney(a.minus(b));

// ═══════════════════════════════════════════════════════════════════════════
// AS REGRAS (transcritas do mapeamento oficial)
// ═══════════════════════════════════════════════════════════════════════════

export type QuadroDoRpps = "CAPITALIZACAO" | "REPARTICAO" | "ADMINISTRACAO" | "TESOURO";

/** A fonte de cada quadro (os três dígitos depois do indicador de exercício). */
export const FONTE_DO_QUADRO: Readonly<Record<QuadroDoRpps, string>> = {
  CAPITALIZACAO: "800",
  REPARTICAO: "801",
  ADMINISTRACAO: "802",
  TESOURO: "804",
};
/** As fontes que o mapeamento exclui dos blocos complementares ("TODAS FR EXCETO"). */
export const FONTES_PREVIDENCIARIAS: readonly string[] = ["800", "801", "802", "803", "804"];
/** Os códigos de acompanhamento que levam benefício pago com outra fonte ao fundo [48]/[104]. */
export const CO_DO_FUNDO: Readonly<Record<"CAPITALIZACAO" | "REPARTICAO", readonly string[]>> = {
  CAPITALIZACAO: ["1111", "1121", "1122", "1123", "1124", "1125", "1131", "1132", "1141", "1151"],
  REPARTICAO: ["2111", "2121", "2122", "2123", "2124", "2125", "2131", "2132", "2141", "2151"],
};

export interface RegraDeReceita {
  readonly chave: string;
  readonly rotulo: string;
  /** A natureza (8 dígitos) entra se COMEÇA por um destes. */
  readonly comeca: readonly string[];
  /** …e não começa por nenhum destes. */
  readonly exceto?: readonly string[];
  /** A linha da planilha oficial. */
  readonly linha: number;
}

/** As receitas do fundo em capitalização [linhas 18 a 39]; o de repartição é igual, sem a linha de aportes. */
export const REGRAS_DA_RECEITA: readonly RegraDeReceita[] = [
  { chave: "SEG_ATIVO", rotulo: "Ativo", comeca: ["1215011", "1215014", "121503", "7215011", "7215014", "721503"], linha: 19 },
  { chave: "SEG_INATIVO", rotulo: "Inativo", comeca: ["1215012", "1215015", "7215012", "7215015"], linha: 20 },
  { chave: "SEG_PENSIONISTA", rotulo: "Pensionista", comeca: ["1215013", "1215016", "7215013", "7215016"], linha: 21 },
  { chave: "PAT_ATIVO", rotulo: "Ativo", comeca: ["1215021", "1215022", "1215511", "7215021", "7215022", "7215511"], linha: 23 },
  { chave: "PAT_INATIVO", rotulo: "Inativo", comeca: ["1215501", "1215503", "1215512", "7215501", "7215503", "7215512"], linha: 24 },
  { chave: "PAT_PENSIONISTA", rotulo: "Pensionista", comeca: ["1215502", "1215504", "1215513", "7215502", "7215504", "7215513"], linha: 25 },
  { chave: "IMOBILIARIAS", rotulo: "Receitas Imobiliárias", comeca: ["131", "731"], linha: 27 },
  { chave: "MOBILIARIOS", rotulo: "Receitas de Valores Mobiliários", comeca: ["132", "732"], linha: 28 },
  { chave: "OUTRAS_PATRIMONIAIS", rotulo: "Outras Receitas Patrimoniais", comeca: ["13", "73"], exceto: ["131", "132", "731", "732"], linha: 29 },
  { chave: "SERVICOS", rotulo: "Receita de Serviços", comeca: ["16", "76"], linha: 30 },
  { chave: "COMPENSACAO", rotulo: "Compensação Financeira entre os regimes", comeca: ["199903", "799903"], linha: 32 },
  { chave: "APORTES", rotulo: "Receita de Aportes Periódicos para Amortização de Déficit Atuarial do RPPS (II)", comeca: ["199901", "799901"], linha: 33 },
  { chave: "DEMAIS_CORRENTES", rotulo: "Demais Receitas Correntes", comeca: ["19", "79", "1219509", "7219509"], exceto: ["199903", "199901", "799903", "799901"], linha: 34 },
  { chave: "ALIENACAO", rotulo: "Alienação de Bens, Direitos e Ativos", comeca: ["22", "82"], linha: 36 },
  { chave: "AMORTIZACAO", rotulo: "Amortização de Empréstimos", comeca: ["23", "83"], linha: 37 },
  { chave: "OUTRAS_CAPITAL", rotulo: "Outras Receitas de Capital", comeca: ["2", "8"], exceto: ["22", "23", "82", "83"], linha: 38 },
];

/** No fundo em repartição não há linha de aportes, e os aportes caem em "Demais" [90]. */
function regraDoQuadro(quadro: "CAPITALIZACAO" | "REPARTICAO", r: RegraDeReceita): RegraDeReceita | null {
  if (quadro === "CAPITALIZACAO") return r;
  if (r.chave === "APORTES") return null;
  if (r.chave === "DEMAIS_CORRENTES") return { ...r, exceto: ["199903", "799903"], linha: 90 };
  return r;
}

/** A receita da administração: toda receita corrente da fonte 802 [124]; a do Tesouro: as contribuições 1219501/09 [149]. */
export const RECEITA_DA_ADMINISTRACAO: RegraDeReceita = { chave: "ADM_CORRENTES", rotulo: "Receitas Correntes", comeca: ["1", "7"], linha: 124 };
export const RECEITA_DO_TESOURO: RegraDeReceita = { chave: "TES_CONTRIBUICOES", rotulo: "Contribuições dos Servidores", comeca: ["1219501", "1219509", "7219501", "7219509"], linha: 149 };

/** Os subelementos que o mapeamento manda para aposentadoria e pensão nos elementos 91, 92 e 94 [47]/[48]. */
export const SUBELEMENTOS_DO_BENEFICIO: Readonly<Record<"91" | "92" | "94", { readonly aposentadoria: readonly string[]; readonly pensao: readonly string[]; readonly compensacao: readonly string[] }>> = {
  "91": { aposentadoria: ["09", "15", "23", "28"], pensao: ["10", "16", "30", "36"], compensacao: [] },
  "92": { aposentadoria: ["01"], pensao: ["03"], compensacao: ["86"] },
  "94": { aposentadoria: ["03"], pensao: ["13"], compensacao: [] },
};

/** Contas do quadro de aportes [59]-[62] e [111]-[112] (saldo no fim do período, sem débito/crédito). */
export const CONTAS_DOS_APORTES: Readonly<Record<"CAPITALIZACAO" | "REPARTICAO", readonly { readonly rotulo: string; readonly comeca: readonly string[] }[]>> = {
  CAPITALIZACAO: [
    { rotulo: "Plano de Amortização - Contribuição Patronal Suplementar", comeca: ["451320205"] },
    { rotulo: "Plano de Amortização - Aporte Periódico de Valores Predefinidos", comeca: ["451320202"] },
    { rotulo: "Outros Aportes para o RPPS", comeca: ["451320206", "451320299", "4513299"] },
    { rotulo: "Recursos para Cobertura de Déficit Financeiro", comeca: ["451320201"] },
  ],
  REPARTICAO: [
    { rotulo: "Recursos para Cobertura de Insuficiências Financeiras", comeca: ["451320101", "451320199"] },
    { rotulo: "Recursos para Formação de Reserva", comeca: ["451320102"] },
  ],
};

/** Contas do quadro de bens e direitos [64]-[66], [114]-[116], [139]-[140]. O sinal "-" marca retificadora. */
export const CONTAS_DOS_BENS: Readonly<Record<"CAPITALIZACAO" | "REPARTICAO" | "ADMINISTRACAO", readonly { readonly rotulo: string; readonly comeca: readonly string[] }[]>> = {
  CAPITALIZACAO: [
    { rotulo: "Caixa e Equivalentes de Caixa", comeca: ["111110603", "1111153"] },
    { rotulo: "Investimentos e Aplicações", comeca: ["1144101", "1144102", "1144103", "1144104", "1144105", "1144106", "1144107", "1144199", "1149105", "1149107", "1213109", "1213110", "1213111", "1213112", "1213113", "1213114", "1213115", "1213131", "121319905", "121319907", "1223101", "1223102", "1223105", "1229103"] },
    { rotulo: "Outros Bens e Direitos", comeca: ["112410701", "112410702", "112410703", "112410704", "112410709", "112410711", "1124207", "1124307", "1124407", "1124507", "113610101", "113610201", "1136199", "113620101", "113620102", "113620201", "113620202", "1136204", "1136205", "1136209", "1136299", "11363", "11364", "11365", "121110303", "121110304", "121110309", "121110310", "1211106", "121110313", "121110315", "121119906", "121120601", "121120602", "121120603", "121120604", "121120605", "121120698", "121120699", "1211208", "1211306", "1211406", "1211506", "121140305", "121140306", "121140307", "121140308", "121150305", "121150306", "121150307", "121150308"] },
  ],
  REPARTICAO: [
    { rotulo: "Caixa e Equivalentes de Caixa", comeca: ["111110602", "1111151"] },
    { rotulo: "Investimentos e Aplicações", comeca: ["1144111", "1144112", "1144113", "1144114", "1144115", "1144116", "1144117", "1149106", "1149108", "1213116", "1213117", "1213118", "1213119", "121312", "1213121", "1213122", "121319906", "121319908", "1223103", "1223104", "1229105"] },
    { rotulo: "Outros Bens e Direitos", comeca: ["112410705", "112410706", "112410707", "112410708", "112410710", "112410712", "112910702", "112910704", "113610102", "113610202", "113620103", "113620104", "113620203", "113620204", "113620600", "121110305", "121110306", "121110311", "121110312", "121110314", "121110316", "121119907", "121120606", "121120607", "121120608", "121120609", "121120610", "121120696", "121120697", "121140311", "121140312", "121140313", "121140314"] },
  ],
  ADMINISTRACAO: [
    { rotulo: "Caixa e Equivalentes de Caixa", comeca: ["111110604", "1111152"] },
    { rotulo: "Investimentos e Aplicações", comeca: ["114413", "1149109", "121313", "121319909"] },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// OS TIPOS DE SAÍDA
// ═══════════════════════════════════════════════════════════════════════════

export interface LinhaReceitaAnexo4 {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: 0 | 1 | 2;
  readonly previsaoAtualizada: string;
  readonly realizadaAteBimestre: string;
}

export interface LinhaDespesaAnexo4 {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: 0 | 1 | 2;
  readonly dotacaoAtualizada: string;
  readonly empenhadaAteBimestre: string;
  readonly liquidadaAteBimestre: string;
  readonly pagaAteBimestre: string;
  /** Só no 6º bimestre (no encerramento); antes, zero. */
  readonly inscritaEmRpnp: string;
}

export interface SaldoAnexo4 {
  readonly rotulo: string;
  readonly valor: string;
}

export interface ResultadoAnexo4 {
  /** Previsão atualizada − dotação atualizada. */
  readonly previsto: string;
  /** Realizada − liquidada (1º ao 5º bimestre) ou − empenhada (6º). */
  readonly executado: string;
}

export interface FundoAnexo4 {
  readonly receitas: readonly LinhaReceitaAnexo4[];
  readonly despesas: readonly LinhaDespesaAnexo4[];
  readonly resultado: ResultadoAnexo4;
  readonly recursosDeExerciciosAnteriores: string;
  readonly reservaOrcamentaria: string;
  readonly aportes: readonly SaldoAnexo4[];
  readonly bens: readonly SaldoAnexo4[];
}

export interface Anexo4 {
  readonly exercicio: number;
  readonly bimestre: Bimestre;
  readonly capitalizacao: FundoAnexo4;
  readonly reparticao: FundoAnexo4;
  readonly administracao: { readonly receitas: readonly LinhaReceitaAnexo4[]; readonly despesas: readonly LinhaDespesaAnexo4[]; readonly resultado: ResultadoAnexo4; readonly bens: readonly SaldoAnexo4[] };
  readonly tesouro: { readonly receitas: readonly LinhaReceitaAnexo4[]; readonly despesas: readonly LinhaDespesaAnexo4[]; readonly resultado: ResultadoAnexo4 };
  readonly notas: readonly string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// AS CLASSIFICAÇÕES (puras)
// ═══════════════════════════════════════════════════════════════════════════

const comecaPorAlgum = (codigo: string, lista: readonly string[]) => lista.some((p) => codigo.startsWith(p));

export function regraQueCasa(regras: readonly RegraDeReceita[], natureza: string): RegraDeReceita | null {
  for (const r of regras) {
    if (comecaPorAlgum(natureza, r.comeca) && !comecaPorAlgum(natureza, r.exceto ?? [])) return r;
  }
  return null;
}

export type LinhaDaDespesa = "APOSENTADORIAS" | "PENSOES" | "COMPENSACAO" | "DEMAIS" | "DEMAIS_SEM_SUBELEMENTO" | "FORA";

/**
 * A linha da despesa previdenciária pela natureza (6 dígitos: categoria, grupo, modalidade, elemento) e pelo
 * subelemento (2 dígitos, ou nulo). "FORA": o mapeamento não a leva a linha nenhuma (intraorçamentária fora dos
 * benefícios, ou subelemento de 91/92/94 que não é benefício).
 */
export function linhaDaDespesaPrevidenciaria(natureza: string, subelemento: string | null): LinhaDaDespesa {
  const modalidade = natureza.slice(2, 4);
  const elemento = natureza.slice(4, 6);
  if (natureza.startsWith("3190")) {
    if (elemento === "01") return "APOSENTADORIAS";
    if (elemento === "03") return "PENSOES";
    if (elemento === "86") return "COMPENSACAO";
    if (elemento === "91" || elemento === "92" || elemento === "94") {
      if (subelemento === null) return "DEMAIS_SEM_SUBELEMENTO";
      const s = SUBELEMENTOS_DO_BENEFICIO[elemento];
      if (s.aposentadoria.includes(subelemento)) return "APOSENTADORIAS";
      if (s.pensao.includes(subelemento)) return "PENSOES";
      if (s.compensacao.includes(subelemento)) return "COMPENSACAO";
      return "FORA";
    }
  }
  if (natureza.startsWith("3191") && elemento === "86") return "COMPENSACAO";
  if (modalidade === "91") return "FORA";
  if (natureza.startsWith("3") || natureza.startsWith("4")) return "DEMAIS";
  return "FORA";
}

export type LinhaDaAdministracao = "PESSOAL" | "DEMAIS_CORRENTES" | "CAPITAL" | "FORA";

/** A despesa da administração [133]-[135]: pessoal (31, fora os benefícios), demais correntes (32, 33), capital (4). */
export function linhaDaDespesaDaAdministracao(natureza: string, subelemento: string | null): LinhaDaAdministracao {
  if (natureza.startsWith("31")) {
    const l = linhaDaDespesaPrevidenciaria(natureza, subelemento);
    return l === "APOSENTADORIAS" || l === "PENSOES" || l === "COMPENSACAO" ? "FORA" : "PESSOAL";
  }
  if (natureza.startsWith("32") || natureza.startsWith("33")) return "DEMAIS_CORRENTES";
  if (natureza.startsWith("4")) return "CAPITAL";
  return "FORA";
}

/**
 * De qual quadro é uma ficha. Pela fonte; ou, com outra fonte, pelo código de acompanhamento na subfunção 272 (fundos)
 * ou pela subfunção 274 (benefícios do Tesouro). Nulo: não é previdenciária.
 */
export function quadroDaFicha(f: { readonly fonte: string; readonly co: string | null; readonly subfuncao: string }): QuadroDoRpps | null {
  for (const q of Object.keys(FONTE_DO_QUADRO) as QuadroDoRpps[]) if (FONTE_DO_QUADRO[q] === f.fonte) return q;
  if (FONTES_PREVIDENCIARIAS.includes(f.fonte)) return null;
  if (f.subfuncao === "272" && f.co !== null) {
    if (CO_DO_FUNDO.CAPITALIZACAO.includes(f.co)) return "CAPITALIZACAO";
    if (CO_DO_FUNDO.REPARTICAO.includes(f.co)) return "REPARTICAO";
  }
  if (f.subfuncao === "274") return "TESOURO";
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// O LEITOR
// ═══════════════════════════════════════════════════════════════════════════

interface AccDespesa {
  dotacao: Money;
  empenhos: { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[];
  liquidacoes: { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[];
  pagamentos: { id: string; valor: Money; estornoDeId: string | null; anulacaoParcialDeId: string | null }[];
  rpnp: Money;
}
const accDespesa = (): AccDespesa => ({ dotacao: zero(), empenhos: [], liquidacoes: [], pagamentos: [], rpnp: zero() });

export async function anexo4(leitor: Tx, p: { readonly exercicio: number; readonly bimestre: Bimestre }): Promise<Anexo4> {
  const { fim, inicioExercicio } = janelaDoBimestre(p.exercicio, p.bimestre);
  const notas: string[] = [];

  // ── as fontes (código de 3 dígitos) ──
  const fontes = new Map((await leitor.fonteRecurso.findMany({ select: { id: true, codigo: true } })).map((f) => [f.id, f.codigo]));

  // ── RECEITA: previsão por (natureza, fonte) e realizada até o bimestre ──
  const previsao = new Map<string, Money>(); // `${quadro}|${natureza}`
  const quadrosDaNatureza = new Map<string, Set<QuadroDoRpps>>();
  const quadroDaFonte = (fonteId: string): QuadroDoRpps | null => {
    const c = fontes.get(fonteId);
    if (c === undefined) return null;
    for (const q of Object.keys(FONTE_DO_QUADRO) as QuadroDoRpps[]) if (FONTE_DO_QUADRO[q] === c) return q;
    return null;
  };
  for (const r of await leitor.receitaPrevista.findMany({ where: { exercicio: p.exercicio }, select: { tipoReceita: true, valorPrevisto: true, fonteId: true, naturezaReceita: { select: { codigo: true } } } })) {
    const q = quadroDaFonte(r.fonteId);
    if (q === null) continue;
    const v = toMoney(r.valorPrevisto.toFixed(2));
    const k = `${q}|${r.naturezaReceita.codigo}`;
    previsao.set(k, soma(previsao.get(k) ?? zero(), r.tipoReceita === "DEDUCAO" ? toMoney(v.negated()) : v));
    const s = quadrosDaNatureza.get(r.naturezaReceita.codigo) ?? new Set<QuadroDoRpps>();
    s.add(q);
    quadrosDaNatureza.set(r.naturezaReceita.codigo, s);
  }
  const reprevisaoFora: string[] = [];
  for (const [nat, ajuste] of await reprevisaoAcumuladaPorNatureza(leitor, { exercicio: p.exercicio })) {
    const qs = quadrosDaNatureza.get(nat);
    if (qs === undefined) continue; // não é previdenciária
    if (qs.size !== 1) {
      reprevisaoFora.push(nat);
      continue;
    }
    const k = `${[...qs][0]!}|${nat}`;
    previsao.set(k, soma(previsao.get(k) ?? zero(), ajuste));
  }
  if (reprevisaoFora.length > 0) notas.push(`Reprevisão de natureza prevista em mais de um quadro, fora da previsão atualizada: ${reprevisaoFora.join(", ")}.`);

  const realizada = new Map<string, Money>();
  for (const a of await arrecadadoPorNaturezaFonte(leitor, { desde: inicioExercicio, ate: fim })) {
    const q = quadroDaFonte(a.fonteId);
    if (q === null) continue;
    const k = `${q}|${a.naturezaCodigo}`;
    realizada.set(k, soma(realizada.get(k) ?? zero(), a.arrecadado));
  }

  /** Soma, para um quadro, as naturezas que casam com cada regra. Naturezas sem regra são nomeadas. */
  const receitasDoQuadro = (q: QuadroDoRpps, regras: readonly RegraDeReceita[]) => {
    const por = new Map<string, { prev: Money; real: Money }>();
    const semRegra = new Set<string>();
    for (const [mapa, campo] of [[previsao, "prev"], [realizada, "real"]] as const) {
      for (const [k, v] of mapa) {
        const [quadro, nat] = k.split("|") as [QuadroDoRpps, string];
        if (quadro !== q) continue;
        const r = regraQueCasa(regras, nat);
        if (r === null) {
          if (!v.isZero()) semRegra.add(nat);
          continue;
        }
        const acc = por.get(r.chave) ?? { prev: zero(), real: zero() };
        acc[campo] = soma(acc[campo], v);
        por.set(r.chave, acc);
      }
    }
    if (semRegra.size > 0) notas.push(`Receita das fontes do RPPS (${q.toLowerCase()}) em natureza sem linha no demonstrativo: ${[...semRegra].sort().join(", ")}.`);
    return (chave: string) => por.get(chave) ?? { prev: zero(), real: zero() };
  };

  // ── DESPESA: por empenho, classificado pela ficha e pelo subelemento ──
  const fichas = await leitor.fichaOrcamentaria.findMany({
    where: { exercicio: p.exercicio },
    select: { id: true, fonteId: true, co: { select: { codigo: true } }, subfuncao: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } } },
  });
  const infoFicha = new Map(
    fichas.map((f) => [f.id, { quadro: quadroDaFicha({ fonte: fontes.get(f.fonteId) ?? "", co: f.co?.codigo ?? null, subfuncao: f.subfuncao.codigo }), natureza: f.naturezaDespesa.codigoCompleto }])
  );
  const despesa = new Map<string, AccDespesa>(); // `${quadro}|${linha}`
  const acc = (q: QuadroDoRpps, linha: string) => {
    const k = `${q}|${linha}`;
    const a = despesa.get(k) ?? accDespesa();
    despesa.set(k, a);
    return a;
  };
  const linhaPara = (q: QuadroDoRpps, natureza: string, subelemento: string | null): string => {
    if (q === "ADMINISTRACAO") return linhaDaDespesaDaAdministracao(natureza, subelemento);
    const l = linhaDaDespesaPrevidenciaria(natureza, subelemento);
    // no quadro do Tesouro não há linha de compensação: ela é "outras" [160]
    if (q === "TESOURO" && l === "COMPENSACAO") return "FORA";
    return l;
  };
  // dotação atualizada pela ficha (sem subelemento): a régua do M05
  const movs = await leitor.movimentoDotacao.groupBy({ by: ["fichaId", "tipo"], where: { ficha: { exercicio: p.exercicio }, competencia: { lte: fim } }, _sum: { valor: true } });
  const totaisPorFicha = new Map<string, Partial<Record<TipoMovimentoDotacao, Money>>>();
  for (const m of movs) {
    const t = totaisPorFicha.get(m.fichaId) ?? {};
    t[m.tipo] = toMoney(m._sum.valor?.toFixed(2) ?? "0.00");
    totaisPorFicha.set(m.fichaId, t);
  }
  let dotacaoSemSubelemento = zero();
  for (const [fichaId, t] of totaisPorFicha) {
    const f = infoFicha.get(fichaId);
    if (f === undefined || f.quadro === null) continue;
    const linha = linhaPara(f.quadro, f.natureza, null);
    if (linha === "DEMAIS_SEM_SUBELEMENTO") dotacaoSemSubelemento = soma(dotacaoSemSubelemento, calcularSaldos(t).autorizado);
    const a = acc(f.quadro, linha === "DEMAIS_SEM_SUBELEMENTO" ? "DEMAIS" : linha);
    a.dotacao = soma(a.dotacao, calcularSaldos(t).autorizado);
  }

  const empenhos = await leitor.empenho.findMany({
    where: { ficha: { exercicio: p.exercicio }, data: { lte: fim } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, fichaId: true, subelemento: { select: { codigo: true } } },
  });
  // o estorno e a anulação parcial herdam a linha do empenho original (a mesma ficha; o subelemento pode faltar neles)
  const original = new Map(empenhos.map((e) => [e.id, e]));
  const raiz = (id: string): (typeof empenhos)[number] => {
    let e = original.get(id)!;
    for (let n = 0; n < 10; n++) {
      const pai = e.estornoDeId ?? e.anulacaoParcialDeId;
      if (pai === null || !original.has(pai)) return e;
      e = original.get(pai)!;
    }
    return e;
  };
  const linhaDoEmpenho = new Map<string, { quadro: QuadroDoRpps; linha: string } | null>();
  let empenhosSemSubelemento = 0;
  for (const e of empenhos) {
    const f = infoFicha.get(e.fichaId);
    if (f === undefined || f.quadro === null) {
      linhaDoEmpenho.set(e.id, null);
      continue;
    }
    const r = raiz(e.id);
    let linha = linhaPara(f.quadro, f.natureza, r.subelemento?.codigo.padStart(2, "0").slice(-2) ?? null);
    if (linha === "DEMAIS_SEM_SUBELEMENTO") {
      if (r.id === e.id) empenhosSemSubelemento += 1;
      linha = "DEMAIS";
    }
    linhaDoEmpenho.set(e.id, { quadro: f.quadro, linha });
    acc(f.quadro, linha).empenhos.push({ id: e.id, valor: toMoney(e.valor.toFixed(2)), estornoDeId: e.estornoDeId, anulacaoParcialDeId: e.anulacaoParcialDeId });
  }
  if (empenhosSemSubelemento > 0 || !dotacaoSemSubelemento.isZero()) {
    notas.push(
      `Sentenças, despesas de exercícios anteriores e indenizações (elementos 91, 92 e 94) sem subelemento não se partem entre aposentadoria e pensão: ` +
        `estão em "Demais despesas previdenciárias" (${String(empenhosSemSubelemento)} empenho(s); dotação ${dotacaoSemSubelemento.toFixed(2)}).`
    );
  }
  const liquidacoes = await leitor.liquidacao.findMany({
    where: { empenho: { ficha: { exercicio: p.exercicio } }, data: { lte: fim } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, empenhoId: true },
  });
  for (const l of liquidacoes) {
    const d = linhaDoEmpenho.get(l.empenhoId);
    if (d == null) continue;
    acc(d.quadro, d.linha).liquidacoes.push({ id: l.id, valor: toMoney(l.valor.toFixed(2)), estornoDeId: l.estornoDeId, anulacaoParcialDeId: l.anulacaoParcialDeId });
  }
  const pagamentos = await leitor.pagamento.findMany({
    where: { liquidacao: { empenho: { ficha: { exercicio: p.exercicio } } }, data: { lte: fim } },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true, liquidacao: { select: { empenhoId: true } } },
  });
  for (const pg of pagamentos) {
    const d = linhaDoEmpenho.get(pg.liquidacao.empenhoId);
    if (d == null) continue;
    acc(d.quadro, d.linha).pagamentos.push({ id: pg.id, valor: toMoney(pg.valor.toFixed(2)), estornoDeId: pg.estornoDeId, anulacaoParcialDeId: pg.anulacaoParcialDeId });
  }
  if (p.bimestre === 6) {
    for (const i of await leitor.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: p.exercicio, tipo: "NAO_PROCESSADO" }, select: { valorInscrito: true, empenhoId: true } })) {
      const d = linhaDoEmpenho.get(i.empenhoId);
      if (d == null) continue;
      const a = acc(d.quadro, d.linha);
      a.rpnp = soma(a.rpnp, toMoney(i.valorInscrito.toFixed(2)));
    }
  }

  const linhaDespesa = (q: QuadroDoRpps, chave: string, rotulo: string, nivel: 0 | 1 | 2, linhas: readonly string[]): LinhaDespesaAnexo4 => {
    let dot = zero(), emp = zero(), liq = zero(), pag = zero(), rp = zero();
    for (const l of linhas) {
      const a = despesa.get(`${q}|${l}`);
      if (a === undefined) continue;
      dot = soma(dot, a.dotacao);
      emp = soma(emp, somaLiquidaEstornaveis(a.empenhos));
      liq = soma(liq, somaLiquidaEstornaveis(a.liquidacoes));
      pag = soma(pag, somaLiquidaEstornaveis(a.pagamentos));
      rp = soma(rp, a.rpnp);
    }
    return { chave, rotulo, nivel, dotacaoAtualizada: dot.toFixed(2), empenhadaAteBimestre: emp.toFixed(2), liquidadaAteBimestre: liq.toFixed(2), pagaAteBimestre: pag.toFixed(2), inscritaEmRpnp: rp.toFixed(2) };
  };

  const resultadoDe = (receitaTotal: LinhaReceitaAnexo4, despesaTotal: LinhaDespesaAnexo4): ResultadoAnexo4 => ({
    previsto: sub(toMoney(receitaTotal.previsaoAtualizada), toMoney(despesaTotal.dotacaoAtualizada)).toFixed(2),
    executado: sub(toMoney(receitaTotal.realizadaAteBimestre), toMoney(p.bimestre === 6 ? despesaTotal.empenhadaAteBimestre : despesaTotal.liquidadaAteBimestre)).toFixed(2),
  });

  // ── os saldos de contas (aportes, bens): ΣD − ΣC até o fim do bimestre, por prefixo ──
  const contas = await leitor.contaPcasp.findMany({ where: { analitica: true }, select: { codigo: true } });
  const digitos = (c: string) => c.replace(/\./g, "");
  const saldosPorPrefixo = async (prefixos: readonly string[], natureza: "DEVEDOR" | "CREDOR"): Promise<Money> => {
    const codigos = contas.map((c) => c.codigo).filter((c) => prefixos.some((p) => digitos(c).startsWith(p)));
    if (codigos.length === 0) return zero();
    let s = zero();
    for (const x of await somasPorConta(leitor, { codigos, ate: fim, campoData: "dataTransacao" })) {
      s = soma(s, natureza === "DEVEDOR" ? sub(x.debito, x.credito) : sub(x.credito, x.debito));
    }
    return s;
  };

  const fundo = async (q: "CAPITALIZACAO" | "REPARTICAO"): Promise<FundoAnexo4> => {
    const regras = REGRAS_DA_RECEITA.map((r) => regraDoQuadro(q, r)).filter((r): r is RegraDeReceita => r !== null);
    const de = receitasDoQuadro(q, regras);
    const linha = (chave: string, rotulo: string, nivel: 0 | 1 | 2, chaves: readonly string[]): LinhaReceitaAnexo4 => {
      let prev = zero(), real = zero();
      for (const c of chaves) {
        prev = soma(prev, de(c).prev);
        real = soma(real, de(c).real);
      }
      return { chave, rotulo, nivel, previsaoAtualizada: prev.toFixed(2), realizadaAteBimestre: real.toFixed(2) };
    };
    const seg = ["SEG_ATIVO", "SEG_INATIVO", "SEG_PENSIONISTA"];
    const pat = ["PAT_ATIVO", "PAT_INATIVO", "PAT_PENSIONISTA"];
    const patr = ["IMOBILIARIAS", "MOBILIARIOS", "OUTRAS_PATRIMONIAIS"];
    const outras = q === "CAPITALIZACAO" ? ["COMPENSACAO", "APORTES", "DEMAIS_CORRENTES"] : ["COMPENSACAO", "DEMAIS_CORRENTES"];
    const cap = ["ALIENACAO", "AMORTIZACAO", "OUTRAS_CAPITAL"];
    const correntes = [...seg, ...pat, ...patr, "SERVICOS", ...outras];
    const rotuloDe = (c: string) => REGRAS_DA_RECEITA.find((r) => r.chave === c)!.rotulo;
    const receitas: LinhaReceitaAnexo4[] = [
      linha("CORRENTES", q === "CAPITALIZACAO" ? "RECEITAS CORRENTES (I)" : "RECEITAS CORRENTES (VII)", 0, correntes),
      linha("SEGURADOS", "Receita de Contribuições dos Segurados", 1, seg),
      ...seg.map((c) => linha(c, rotuloDe(c), 2, [c])),
      linha("PATRONAIS", "Receita de Contribuições Patronais", 1, pat),
      ...pat.map((c) => linha(c, rotuloDe(c), 2, [c])),
      linha("PATRIMONIAL", "Receita Patrimonial", 1, patr),
      ...patr.map((c) => linha(c, rotuloDe(c), 2, [c])),
      linha("SERVICOS", "Receita de Serviços", 1, ["SERVICOS"]),
      linha("OUTRAS_CORRENTES", "Outras Receitas Correntes", 1, outras),
      ...outras.map((c) => linha(c, rotuloDe(c), 2, [c])),
      linha("CAPITAL", q === "CAPITALIZACAO" ? "RECEITAS DE CAPITAL (III)" : "RECEITAS DE CAPITAL (VIII)", 0, cap),
      ...cap.map((c) => linha(c, rotuloDe(c), 1, [c])),
    ];
    // total: (I + III − II) na capitalização; (VII + VIII) na repartição
    const semAportes = [...correntes.filter((c) => c !== "APORTES"), ...cap];
    const total = linha("TOTAL", q === "CAPITALIZACAO" ? "TOTAL DAS RECEITAS DO FUNDO EM CAPITALIZAÇÃO (IV) = (I + III − II)" : "TOTAL DAS RECEITAS DO FUNDO EM REPARTIÇÃO (IX) = (VII + VIII)", 0, semAportes);
    receitas.push(total);

    const despesas: LinhaDespesaAnexo4[] = [
      linhaDespesa(q, "BENEFICIOS", "Benefícios", 0, ["APOSENTADORIAS", "PENSOES"]),
      linhaDespesa(q, "APOSENTADORIAS", "Aposentadorias", 1, ["APOSENTADORIAS"]),
      linhaDespesa(q, "PENSOES", "Pensões por Morte", 1, ["PENSOES"]),
      linhaDespesa(q, "OUTRAS", "Outras Despesas Previdenciárias", 0, ["COMPENSACAO", "DEMAIS"]),
      linhaDespesa(q, "COMPENSACAO", "Compensação Financeira entre os regimes", 1, ["COMPENSACAO"]),
      linhaDespesa(q, "DEMAIS", "Demais Despesas Previdenciárias", 1, ["DEMAIS"]),
    ];
    const totalDesp = linhaDespesa(q, "TOTAL", q === "CAPITALIZACAO" ? "TOTAL DAS DESPESAS DO FUNDO EM CAPITALIZAÇÃO (V)" : "TOTAL DAS DESPESAS DO FUNDO EM REPARTIÇÃO (X)", 0, ["APOSENTADORIAS", "PENSOES", "COMPENSACAO", "DEMAIS"]);
    despesas.push(totalDesp);

    // recursos arrecadados em exercícios anteriores [53]: a previsão em natureza 999…; reserva [56]: dotação em 9999…
    let anteriores = zero();
    for (const [k, v] of previsao) {
      const [quadro, nat] = k.split("|") as [QuadroDoRpps, string];
      if (quadro === q && nat.startsWith("999")) anteriores = soma(anteriores, v);
    }
    let reserva = zero();
    for (const [fichaId, t] of totaisPorFicha) {
      const f = infoFicha.get(fichaId);
      if (f?.quadro === q && f.natureza.startsWith("9999")) reserva = soma(reserva, calcularSaldos(t).autorizado);
    }
    const aportes: SaldoAnexo4[] = [];
    for (const a of CONTAS_DOS_APORTES[q]) aportes.push({ rotulo: a.rotulo, valor: (await saldosPorPrefixo(a.comeca, "CREDOR")).toFixed(2) });
    const bens: SaldoAnexo4[] = [];
    for (const b of CONTAS_DOS_BENS[q]) bens.push({ rotulo: b.rotulo, valor: (await saldosPorPrefixo(b.comeca, "DEVEDOR")).toFixed(2) });
    return { receitas, despesas, resultado: resultadoDe(total, totalDesp), recursosDeExerciciosAnteriores: anteriores.toFixed(2), reservaOrcamentaria: reserva.toFixed(2), aportes, bens };
  };

  const capitalizacao = await fundo("CAPITALIZACAO");
  const reparticao = await fundo("REPARTICAO");

  // ── administração ──
  const deAdm = receitasDoQuadro("ADMINISTRACAO", [RECEITA_DA_ADMINISTRACAO]);
  const recAdm: LinhaReceitaAnexo4 = { chave: "ADM_TOTAL", rotulo: "TOTAL DAS RECEITAS DA ADMINISTRAÇÃO RPPS (XII)", nivel: 0, previsaoAtualizada: deAdm("ADM_CORRENTES").prev.toFixed(2), realizadaAteBimestre: deAdm("ADM_CORRENTES").real.toFixed(2) };
  const despAdmTotal = linhaDespesa("ADMINISTRACAO", "ADM_TOTAL", "TOTAL DAS DESPESAS DA ADMINISTRAÇÃO RPPS (XV) = (XIII + XIV)", 0, ["PESSOAL", "DEMAIS_CORRENTES", "CAPITAL"]);
  const bensAdm: SaldoAnexo4[] = [];
  for (const b of CONTAS_DOS_BENS.ADMINISTRACAO) bensAdm.push({ rotulo: b.rotulo, valor: (await saldosPorPrefixo(b.comeca, "DEVEDOR")).toFixed(2) });
  const administracao = {
    receitas: [{ ...recAdm, chave: "ADM_CORRENTES", rotulo: "Receitas Correntes", nivel: 1 as const }, recAdm],
    despesas: [
      linhaDespesa("ADMINISTRACAO", "ADM_CORRENTES", "Despesas Correntes (XIII)", 0, ["PESSOAL", "DEMAIS_CORRENTES"]),
      linhaDespesa("ADMINISTRACAO", "PESSOAL", "Pessoal e Encargos Sociais", 1, ["PESSOAL"]),
      linhaDespesa("ADMINISTRACAO", "DEMAIS_CORRENTES", "Demais Despesas Correntes", 1, ["DEMAIS_CORRENTES"]),
      linhaDespesa("ADMINISTRACAO", "CAPITAL", "Despesas de Capital (XIV)", 0, ["CAPITAL"]),
      despAdmTotal,
    ],
    resultado: resultadoDe(recAdm, despAdmTotal),
    bens: bensAdm,
  };

  // ── benefícios mantidos pelo Tesouro ──
  const deTes = receitasDoQuadro("TESOURO", [RECEITA_DO_TESOURO]);
  const recTes: LinhaReceitaAnexo4 = { chave: "TES_TOTAL", rotulo: "TOTAL DAS RECEITAS (BENEFÍCIOS MANTIDOS PELO TESOURO) (XVII)", nivel: 0, previsaoAtualizada: deTes("TES_CONTRIBUICOES").prev.toFixed(2), realizadaAteBimestre: deTes("TES_CONTRIBUICOES").real.toFixed(2) };
  const despTesTotal = linhaDespesa("TESOURO", "TES_TOTAL", "TOTAL DAS DESPESAS (BENEFÍCIOS MANTIDOS PELO TESOURO) (XVIII)", 0, ["APOSENTADORIAS", "PENSOES", "DEMAIS"]);
  const tesouro = {
    receitas: [{ ...recTes, chave: "TES_CONTRIBUICOES", rotulo: "Contribuições dos Servidores", nivel: 1 as const }, recTes],
    despesas: [
      linhaDespesa("TESOURO", "APOSENTADORIAS", "Aposentadorias", 1, ["APOSENTADORIAS"]),
      linhaDespesa("TESOURO", "PENSOES", "Pensões", 1, ["PENSOES"]),
      linhaDespesa("TESOURO", "OUTRAS", "Outras Despesas Previdenciárias", 1, ["DEMAIS"]),
      despTesTotal,
    ],
    resultado: resultadoDe(recTes, despTesTotal),
  };

  notas.push(
    "Os aportes e os bens e direitos são o saldo das contas no fim do período. O caixa em conta que serve a mais de um plano (1.1.1.1.3), que o mapeamento parte pela fonte, não entra.",
    "A despesa da administração paga com fonte que não é do RPPS não é lida aqui."
  );
  return { exercicio: p.exercicio, bimestre: p.bimestre, capitalizacao, reparticao, administracao, tesouro, notas };
}
