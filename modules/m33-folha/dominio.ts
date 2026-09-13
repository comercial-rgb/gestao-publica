import { createHash } from "node:crypto";
import { z } from "zod";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, meioDiaCivil } from "../../packages/datas/index.js";
import { idadeEm } from "../m32-pessoal/dominio.js";

/**
 * ═══ M33 — FOLHA DE PAGAMENTO: O DOMÍNIO PURO (V6 P2.3, RH bloco 2) ═══
 *
 * Tudo aqui é função pura sobre Decimal: recebe as TABELAS DO ENTE (contribuição, IRRF,
 * salário-família), as rubricas, os lançamentos e a vida funcional do vínculo (M32), e devolve o
 * contracheque com a MEMÓRIA de cálculo e o sha256 dela. Nenhum acesso a banco; nenhum número
 * normativo embutido — alíquota, faixa, teto, dedução, desconto simplificado, redutor e valor do
 * salário-família vêm das tabelas, ou a função recusa nomeando o que falta.
 *
 * ⚠️ CONCILIADO DO MOTOR DOADOR `folha-engine` (saas-municipal, packages/folha-engine): o
 * algoritmo faixa a faixa, os três cenários do IRRF (deduções legais, deduções com redutor,
 * desconto simplificado — vence o menor), o teto agregado entre vínculos da mesma pessoa, o mês
 * fiscal de 30 dias e a memória canônica com hash vieram de lá COMO IDEIA. O código é deste
 * repositório: o doador calculava em `number` (float) e lia tabelas semeadas no código; aqui é
 * Decimal (`packages/contracts`) e tabela do ente, fail-closed. Nada é importado de lá.
 *
 * ⚠️ ARREDONDAMENTO: `toMoney` (half-even, 2 casas), o mesmo do razão — por faixa e por linha,
 * como a Receita Federal detalha. Se o ente exigir half-up numa conferência, é decisão a tomar
 * (pendência `ARREDONDAMENTO-DA-FOLHA` no MODULO), não um número a trocar aqui.
 */

export const VERSAO_DO_MOTOR = "m33-folha-1.0.0";
export const DIAS_DO_MES_FISCAL = 30;

export type RegimePrevidenciario = "RGPS" | "RPPS" | "ISENTO";
export type TipoDeRubrica = "PROVENTO" | "DESCONTO";
export type NaturezaDaRubrica =
  | "VENCIMENTO_BASE"
  | "GRATIFICACOES_DO_VINCULO"
  | "VALOR_INFORMADO"
  | "PERCENTUAL_DO_VENCIMENTO"
  | "CONTRIBUICAO_PREVIDENCIARIA"
  | "IMPOSTO_DE_RENDA"
  | "SALARIO_FAMILIA";

/** As naturezas que existem UMA vez: o serviço recusa a segunda rubrica com a mesma. */
export const NATUREZAS_SISTEMICAS: readonly NaturezaDaRubrica[] = [
  "VENCIMENTO_BASE",
  "GRATIFICACOES_DO_VINCULO",
  "CONTRIBUICAO_PREVIDENCIARIA",
  "IMPOSTO_DE_RENDA",
  "SALARIO_FAMILIA",
];

// ═══════════════════════════════════════════════════════════════════════════════
// ERROS NOMEADOS — cada um diz o que falta, não só que faltou
// ═══════════════════════════════════════════════════════════════════════════════

export class FaixasInvalidasError extends Error {
  constructor(tabela: string, motivo: string) {
    super(`FAIXAS-INVALIDAS: a tabela ${tabela} não serve para calcular — ${motivo}. Corrija a tabela antes de calcular.`);
    this.name = "FaixasInvalidasError";
  }
}

export class TabelaAusenteError extends Error {
  constructor(tipo: "CONTRIBUICAO" | "IRRF" | "SALARIO_FAMILIA", competencia: string, detalhe?: string) {
    super(
      `TABELA-AUSENTE: não há tabela de ${tipo === "CONTRIBUICAO" ? "contribuição previdenciária" : tipo === "IRRF" ? "IRRF" : "salário-família"} ` +
        `vigente na competência ${competencia}${detalhe !== undefined ? ` (${detalhe})` : ""}. Cadastre-a com a fundamentação legal antes de calcular. Nada foi calculado.`
    );
    this.name = "TabelaAusenteError";
  }
}

export class VinculoSemRegimeError extends Error {
  constructor(matricula: string) {
    super(`VINCULO-SEM-REGIME-PREVIDENCIARIO: a matrícula ${matricula} não declara regime (RGPS, RPPS ou ISENTO); sem ele não há tabela a aplicar. Informe o regime no vínculo antes de calcular. Nada foi calculado.`);
    this.name = "VinculoSemRegimeError";
  }
}

export class VencimentoAusenteError extends Error {
  constructor(matricula: string, competencia: string) {
    super(`VENCIMENTO-BASE-AUSENTE: a matrícula ${matricula} não tem vencimento-base vigente em ${competencia} (nenhum evento com salário até o fim do mês). Nada foi calculado.`);
    this.name = "VencimentoAusenteError";
  }
}

export class RubricaSistemicaAusenteError extends Error {
  constructor(natureza: NaturezaDaRubrica, porQue: string) {
    super(`RUBRICA-AUSENTE: não há rubrica de natureza ${natureza} — ${porQue}. Cadastre a rubrica antes de calcular. Nada foi calculado.`);
    this.name = "RubricaSistemicaAusenteError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPETÊNCIA — "AAAA-MM", e o mês fiscal tem 30 dias
// ═══════════════════════════════════════════════════════════════════════════════

export const zCompetencia = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "competência no formato AAAA-MM");

/** O primeiro e o último dia civil da competência, ao meio-dia do fuso do ente. */
export function bordasDaCompetencia(competencia: string): { readonly inicio: Date; readonly fim: Date; readonly diasCivis: number } {
  const [ano, mes] = competencia.split("-").map(Number) as [number, number];
  // Calendário, não fuso: os dias do mês são os mesmos em qualquer lugar do mundo.
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diasCivis = mes === 2 ? (bissexto ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31;
  return {
    inicio: meioDiaCivil(`${competencia}-01`),
    fim: meioDiaCivil(`${competencia}-${String(diasCivis).padStart(2, "0")}`),
    diasCivis,
  };
}

/** Uma tabela vale na competência quando início ≤ competência ≤ fim (fim nulo = aberta). */
export function vigenteNaCompetencia(t: { readonly competenciaInicio: string; readonly competenciaFim: string | null }, competencia: string): boolean {
  return t.competenciaInicio <= competencia && (t.competenciaFim === null || t.competenciaFim >= competencia);
}

/**
 * ENTRE DUAS CANDIDATAS VIGENTES, VENCE A DE INÍCIO MAIS RECENTE; empate de início é ambiguidade
 * do cadastro e o cálculo recusa — duas tabelas com o mesmo início dizem duas verdades.
 */
export function escolherVigente<T extends { readonly competenciaInicio: string; readonly competenciaFim: string | null }>(
  candidatas: readonly T[],
  competencia: string,
  tipo: "CONTRIBUICAO" | "IRRF" | "SALARIO_FAMILIA"
): T {
  const vigentes = candidatas.filter((t) => vigenteNaCompetencia(t, competencia)).sort((a, b) => (a.competenciaInicio < b.competenciaInicio ? 1 : a.competenciaInicio > b.competenciaInicio ? -1 : 0));
  const primeira = vigentes[0];
  if (primeira === undefined) throw new TabelaAusenteError(tipo, competencia);
  if (vigentes[1] !== undefined && vigentes[1].competenciaInicio === primeira.competenciaInicio) {
    throw new TabelaAusenteError(tipo, competencia, `há ${vigentes.filter((t) => t.competenciaInicio === primeira.competenciaInicio).length} tabelas começando em ${primeira.competenciaInicio} — ambíguo`);
  }
  return primeira;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FAIXAS PROGRESSIVAS — o algoritmo compartilhado por contribuição e IRRF
// ═══════════════════════════════════════════════════════════════════════════════

export interface Faixa {
  readonly ordem: number;
  /** Limite superior INCLUSIVO. Nulo só na última. */
  readonly ate: Money | null;
  /** 0.0750 = 7,5%. */
  readonly aliquota: Decimal;
}

export interface FaixaPercorrida {
  readonly ordem: number;
  readonly de: Money;
  readonly ate: Money;
  readonly baseNaFaixa: Money;
  readonly aliquota: string;
  readonly valor: Money;
}

/** Confere a forma das faixas — ordenadas, limites crescentes, só a última sem limite. */
export function conferirFaixas(faixas: readonly Faixa[], tabela: string): readonly Faixa[] {
  const ordenadas = [...faixas].sort((a, b) => a.ordem - b.ordem);
  if (ordenadas.length === 0) throw new FaixasInvalidasError(tabela, "não tem faixa nenhuma");
  let anterior: Money | null = null;
  ordenadas.forEach((f, i) => {
    const ultima = i === ordenadas.length - 1;
    if (f.ate === null && !ultima) throw new FaixasInvalidasError(tabela, `a faixa ${f.ordem} não tem limite e não é a última`);
    if (f.ate !== null && anterior !== null && f.ate.lte(anterior)) throw new FaixasInvalidasError(tabela, `a faixa ${f.ordem} (até ${f.ate.toFixed(2)}) não sobe em relação à anterior (${anterior.toFixed(2)})`);
    if (f.aliquota.lt(0) || f.aliquota.gt(1)) throw new FaixasInvalidasError(tabela, `alíquota ${f.aliquota.toString()} fora de [0, 1] na faixa ${f.ordem}`);
    if (f.ate !== null) anterior = f.ate;
  });
  return ordenadas;
}

/**
 * APLICA AS FAIXAS À BASE, faixa a faixa, arredondando POR FAIXA — é como a memória se confere.
 * Cada faixa contribui só com a parcela da base entre o limite anterior e o seu.
 */
export function aplicarFaixas(base: Money, faixas: readonly Faixa[], tabela = "faixas"): { readonly valor: Money; readonly percorridas: readonly FaixaPercorrida[] } {
  const ordenadas = conferirFaixas(faixas, tabela);
  if (base.lte(0)) return { valor: toMoney(0), percorridas: [] };
  const percorridas: FaixaPercorrida[] = [];
  let anterior = toMoney(0);
  let total = toMoney(0);
  for (const f of ordenadas) {
    const limite = f.ate ?? base;
    const ateEfetivo = Decimal.min(base, limite);
    const baseNaFaixa = toMoney(Decimal.max(0, ateEfetivo.minus(anterior)));
    if (baseNaFaixa.gt(0)) {
      const valor = toMoney(baseNaFaixa.times(f.aliquota));
      total = total.plus(valor);
      percorridas.push({ ordem: f.ordem, de: anterior, ate: toMoney(ateEfetivo), baseNaFaixa, aliquota: f.aliquota.toFixed(4), valor });
    }
    anterior = toMoney(limite);
    if (f.ate === null || base.lte(f.ate)) break;
  }
  return { valor: toMoney(total), percorridas };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRIBUIÇÃO PREVIDENCIÁRIA — pela tabela do regime
// ═══════════════════════════════════════════════════════════════════════════════

export interface TabelaDeContribuicaoLida {
  readonly id: string;
  readonly regime: RegimePrevidenciario;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly teto: Money | null;
  readonly fundamentacaoLegal: string;
  readonly faixas: readonly Faixa[];
}

export interface ResultadoDaContribuicao {
  readonly regime: RegimePrevidenciario;
  /** A base após o teto. */
  readonly base: Money;
  readonly baseAntesDoTeto: Money;
  readonly tetoAplicado: boolean;
  readonly valor: Money;
  readonly faixas: readonly FaixaPercorrida[];
  readonly tabelaId: string | null;
  readonly fundamentacao: string;
}

export function calcularContribuicao(p: { readonly regime: RegimePrevidenciario; readonly base: Money; readonly tabela: TabelaDeContribuicaoLida | null }): ResultadoDaContribuicao {
  const base = toMoney(Decimal.max(0, p.base));
  if (p.regime === "ISENTO") {
    return { regime: "ISENTO", base: toMoney(0), baseAntesDoTeto: base, tetoAplicado: false, valor: toMoney(0), faixas: [], tabelaId: null, fundamentacao: "Regime ISENTO: não há contribuição previdenciária." };
  }
  if (p.tabela === null) throw new Error(`calcularContribuicao: regime ${p.regime} sem tabela — o chamador deveria ter recusado antes.`);
  if (p.tabela.regime !== p.regime) throw new Error(`calcularContribuicao: a tabela ${p.tabela.id} é do regime ${p.tabela.regime}, não ${p.regime}.`);
  const tetoAplicado = p.tabela.teto !== null && base.gt(p.tabela.teto);
  const baseEfetiva = tetoAplicado && p.tabela.teto !== null ? toMoney(p.tabela.teto) : base;
  const r = aplicarFaixas(baseEfetiva, p.tabela.faixas, `de contribuição ${p.tabela.id}`);
  return { regime: p.regime, base: baseEfetiva, baseAntesDoTeto: base, tetoAplicado, valor: r.valor, faixas: r.percorridas, tabelaId: p.tabela.id, fundamentacao: p.tabela.fundamentacaoLegal };
}

/** A contribuição máxima da tabela (a do teto). Nula quando a tabela não tem teto. */
export function contribuicaoMaxima(tabela: TabelaDeContribuicaoLida): Money | null {
  if (tabela.teto === null) return null;
  return aplicarFaixas(toMoney(tabela.teto), tabela.faixas, `de contribuição ${tabela.id}`).valor;
}

// ═══════════════════════════════════════════════════════════════════════════════
// IRRF — três cenários, vence o menor imposto; a aplicabilidade vem da TABELA
// ═══════════════════════════════════════════════════════════════════════════════

export interface TabelaIrrfLida {
  readonly id: string;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly deducaoPorDependente: Money;
  readonly descontoSimplificado: Money | null;
  readonly isencaoMaior65: Money | null;
  readonly redutorBase: Money | null;
  readonly redutorFator: Decimal | null;
  readonly redutorRendaMaxima: Money | null;
  readonly fundamentacaoLegal: string;
  readonly faixas: readonly Faixa[];
}

export type CenarioIrrf = "DEDUCOES_LEGAIS" | "DEDUCOES_LEGAIS_COM_REDUTOR" | "DESCONTO_SIMPLIFICADO";

export interface CenarioCalculado {
  readonly nome: CenarioIrrf;
  readonly aplicavel: boolean;
  readonly motivo?: string;
  readonly base: Money;
  readonly valor: Money;
  readonly deducoes: readonly { readonly tipo: string; readonly valor: Money }[];
  readonly faixas: readonly FaixaPercorrida[];
}

export interface ResultadoDoIrrf {
  readonly rendaTributavel: Money;
  readonly base: Money;
  readonly valor: Money;
  readonly cenario: CenarioIrrf;
  readonly cenarios: readonly CenarioCalculado[];
  readonly tabelaId: string;
  readonly fundamentacao: string;
}

export function calcularIrrf(p: {
  readonly rendaTributavel: Money;
  readonly contribuicao: Money;
  readonly dependentes: number;
  readonly pensaoAlimenticia: Money;
  readonly maior65: boolean;
  readonly tabela: TabelaIrrfLida;
}): ResultadoDoIrrf {
  const t = p.tabela;
  const renda = toMoney(Decimal.max(0, p.rendaTributavel));
  const isencaoIdoso = p.maior65 && t.isencaoMaior65 !== null ? t.isencaoMaior65 : toMoney(0);
  const deducaoDependentes = toMoney(t.deducaoPorDependente.times(p.dependentes));

  // A — deduções legais: contribuição, dependentes, pensão, parcela do idoso.
  const deducoesA = [
    { tipo: "CONTRIBUICAO_PREVIDENCIARIA", valor: p.contribuicao },
    ...(p.dependentes > 0 ? [{ tipo: `DEPENDENTES (${p.dependentes} × ${t.deducaoPorDependente.toFixed(2)})`, valor: deducaoDependentes }] : []),
    ...(p.pensaoAlimenticia.gt(0) ? [{ tipo: "PENSAO_ALIMENTICIA", valor: p.pensaoAlimenticia }] : []),
    ...(isencaoIdoso.gt(0) ? [{ tipo: "PARCELA_ISENTA_65_ANOS", valor: isencaoIdoso }] : []),
  ];
  const baseA = toMoney(Decimal.max(0, renda.minus(sumMoney(deducoesA.map((d) => d.valor)))));
  const rA = aplicarFaixas(baseA, t.faixas, `IRRF ${t.id}`);
  const cenarioA: CenarioCalculado = { nome: "DEDUCOES_LEGAIS", aplicavel: true, base: baseA, valor: rA.valor, deducoes: deducoesA, faixas: rA.percorridas };

  // B — as mesmas deduções, e o redutor da tabela (quando a tabela o traz).
  let cenarioB: CenarioCalculado;
  if (t.redutorBase !== null && t.redutorFator !== null && t.redutorRendaMaxima !== null) {
    const redutor = renda.gt(t.redutorRendaMaxima) ? toMoney(0) : toMoney(Decimal.max(0, t.redutorBase.minus(t.redutorFator.times(renda))));
    const valorB = toMoney(Decimal.max(0, rA.valor.minus(redutor)));
    cenarioB = { nome: "DEDUCOES_LEGAIS_COM_REDUTOR", aplicavel: true, base: baseA, valor: valorB, deducoes: [...deducoesA, { tipo: "REDUTOR", valor: redutor }], faixas: rA.percorridas };
  } else {
    cenarioB = { nome: "DEDUCOES_LEGAIS_COM_REDUTOR", aplicavel: false, motivo: "a tabela vigente não traz redutor", base: baseA, valor: toMoney(0), deducoes: [], faixas: [] };
  }

  // C — desconto simplificado no lugar das deduções (contribuição e parcela do idoso continuam).
  let cenarioC: CenarioCalculado;
  if (t.descontoSimplificado !== null) {
    const deducoesC = [
      { tipo: "CONTRIBUICAO_PREVIDENCIARIA", valor: p.contribuicao },
      { tipo: "DESCONTO_SIMPLIFICADO", valor: t.descontoSimplificado },
      ...(isencaoIdoso.gt(0) ? [{ tipo: "PARCELA_ISENTA_65_ANOS", valor: isencaoIdoso }] : []),
    ];
    const baseC = toMoney(Decimal.max(0, renda.minus(sumMoney(deducoesC.map((d) => d.valor)))));
    const rC = aplicarFaixas(baseC, t.faixas, `IRRF ${t.id}`);
    cenarioC = { nome: "DESCONTO_SIMPLIFICADO", aplicavel: true, base: baseC, valor: rC.valor, deducoes: deducoesC, faixas: rC.percorridas };
  } else {
    cenarioC = { nome: "DESCONTO_SIMPLIFICADO", aplicavel: false, motivo: "a tabela vigente não traz desconto simplificado", base: toMoney(0), valor: toMoney(0), deducoes: [], faixas: [] };
  }

  // Vence o MENOR imposto; empate fica com o primeiro na ordem A, B, C (determinístico).
  const cenarios = [cenarioA, cenarioB, cenarioC];
  const vencedor = cenarios.filter((c) => c.aplicavel).reduce((m, c) => (c.valor.lt(m.valor) ? c : m));
  return { rendaTributavel: renda, base: vencedor.base, valor: vencedor.valor, cenario: vencedor.nome, cenarios, tabelaId: t.id, fundamentacao: t.fundamentacaoLegal };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALÁRIO-FAMÍLIA — por dependente elegível, a quem ganha até a renda máxima
// ═══════════════════════════════════════════════════════════════════════════════

export interface TabelaSalarioFamiliaLida {
  readonly id: string;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly rendaMaxima: Money;
  readonly valorPorDependente: Money;
  readonly idadeLimite: number;
  readonly fundamentacaoLegal: string;
}

export interface DependenteParaSalarioFamilia {
  readonly id: string;
  readonly nome: string;
  readonly dataNascimento: Date;
  readonly invalidezPermanente: boolean;
  /** A finalidade SALARIO_FAMILIA está vigente na competência (M32: início ≤ mês e sem baixa antes dele). */
  readonly finalidadeVigente: boolean;
}

export interface ResultadoDoSalarioFamilia {
  readonly rendaBruta: Money;
  readonly rendaMaxima: Money;
  readonly valorPorDependente: Money;
  readonly elegiveis: number;
  readonly valor: Money;
  readonly considerados: readonly { readonly id: string; readonly nome: string; readonly idade: number; readonly elegivel: boolean; readonly motivo?: string }[];
  readonly tabelaId: string;
  readonly fundamentacao: string;
}

/** A idade se mede no PRIMEIRO dia da competência: quem completa o limite no meio do mês recebe o mês inteiro. */
export function calcularSalarioFamilia(p: { readonly rendaBruta: Money; readonly dependentes: readonly DependenteParaSalarioFamilia[]; readonly tabela: TabelaSalarioFamiliaLida; readonly competencia: string }): ResultadoDoSalarioFamilia {
  const t = p.tabela;
  const referencia = bordasDaCompetencia(p.competencia).inicio;
  const acimaDaRenda = p.rendaBruta.gt(t.rendaMaxima);
  const considerados = p.dependentes.map((d) => {
    const idade = idadeEm(d.dataNascimento, referencia);
    if (!d.finalidadeVigente) return { id: d.id, nome: d.nome, idade, elegivel: false, motivo: "finalidade salário-família não vigente na competência" };
    if (!d.invalidezPermanente && idade >= t.idadeLimite) return { id: d.id, nome: d.nome, idade, elegivel: false, motivo: `idade ${idade} ≥ limite ${t.idadeLimite} (sem invalidez permanente)` };
    if (acimaDaRenda) return { id: d.id, nome: d.nome, idade, elegivel: false, motivo: `renda bruta ${p.rendaBruta.toFixed(2)} acima da máxima ${t.rendaMaxima.toFixed(2)}` };
    return { id: d.id, nome: d.nome, idade, elegivel: true };
  });
  const elegiveis = considerados.filter((c) => c.elegivel).length;
  return {
    rendaBruta: p.rendaBruta,
    rendaMaxima: t.rendaMaxima,
    valorPorDependente: t.valorPorDependente,
    elegiveis,
    valor: toMoney(t.valorPorDependente.times(elegiveis)),
    considerados,
    tabelaId: t.id,
    fundamentacao: t.fundamentacaoLegal,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIAS — o mês fiscal tem 30 dias; admissão, desligamento e afastamentos reduzem
// ═══════════════════════════════════════════════════════════════════════════════

export interface VidaFuncionalNaCompetencia {
  readonly dataAdmissao: Date;
  /** Derivada do M32 (`dataDeDesligamento`). */
  readonly dataDesligamento: Date | null;
  /** Períodos de afastamento (AFASTAMENTO até o RETORNO seguinte; fim nulo = ainda afastado). */
  readonly afastamentos: readonly { readonly inicio: Date; readonly fim: Date | null }[];
}

export interface DiasComputados {
  readonly dias: number;
  readonly explicacao: string;
}

/** O dia do mês (1..30) de uma data civil DENTRO da competência; 31 conta como 30. */
function diaFiscal(d: Date): number {
  return Math.min(DIAS_DO_MES_FISCAL, Number(diaCivil(d).slice(8, 10)));
}

/**
 * OS DIAS COMPUTADOS NA COMPETÊNCIA. Admitido dia 12 → 19/30; desligado dia 10 → 10/30; afastado
 * do dia 5 ao 9 → −5. Dias sobrepostos contam UMA vez. Vínculo que não existia no mês → 0.
 */
export function diasComputados(v: VidaFuncionalNaCompetencia, competencia: string): DiasComputados {
  const { inicio, fim } = bordasDaCompetencia(competencia);
  const adm = diaCivil(v.dataAdmissao);
  const des = v.dataDesligamento === null ? null : diaCivil(v.dataDesligamento);
  const ini = diaCivil(inicio);
  const fimC = diaCivil(fim);
  if (adm > fimC) return { dias: 0, explicacao: `admissão em ${adm}, depois da competência` };
  if (des !== null && des < ini) return { dias: 0, explicacao: `desligado em ${des}, antes da competência` };
  const primeiro = adm >= ini ? diaFiscal(v.dataAdmissao) : 1;
  const ultimo = des !== null && des <= fimC ? diaFiscal(v.dataDesligamento as Date) : DIAS_DO_MES_FISCAL;
  const partes: string[] = [];
  if (primeiro > 1) partes.push(`admitido no dia ${primeiro}`);
  if (ultimo < DIAS_DO_MES_FISCAL) partes.push(`desligado no dia ${ultimo}`);
  const afastados = new Set<number>();
  for (const a of v.afastamentos) {
    const aIni = diaCivil(a.inicio);
    const aFim = a.fim === null ? null : diaCivil(a.fim);
    if (aIni > fimC || (aFim !== null && aFim < ini)) continue;
    const de = aIni >= ini ? diaFiscal(a.inicio) : 1;
    // O RETORNO é o primeiro dia trabalhado: o afastamento vai até a véspera.
    const ate = aFim === null || aFim > fimC ? DIAS_DO_MES_FISCAL : Math.max(0, diaFiscal(a.fim as Date) - 1);
    for (let d = de; d <= ate; d += 1) if (d >= primeiro && d <= ultimo) afastados.add(d);
  }
  if (afastados.size > 0) partes.push(`${afastados.size} dia(s) afastado`);
  const dias = Math.max(0, ultimo - primeiro + 1 - afastados.size);
  return { dias, explicacao: `${dias}/${DIAS_DO_MES_FISCAL} dias${partes.length > 0 ? ` (${partes.join("; ")})` : ""}` };
}

export function fatorDeDias(dias: number): Decimal {
  return new Decimal(dias).div(DIAS_DO_MES_FISCAL).toDecimalPlaces(6, Decimal.ROUND_HALF_EVEN);
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CONTRACHEQUE — linhas, totais, memória e sha256
// ═══════════════════════════════════════════════════════════════════════════════

export interface RubricaLida {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: TipoDeRubrica;
  readonly natureza: NaturezaDaRubrica;
  readonly percentual: Decimal | null;
  readonly incideContribuicao: boolean;
  readonly incideIrrf: boolean;
  readonly proporcionalAosDias: boolean;
  readonly ordem: number;
  readonly fundamentacaoLegal: string;
}

export interface LancamentoLido {
  readonly id: string;
  readonly rubricaId: string;
  readonly tipo: "FIXO" | "VARIAVEL";
  readonly valor: Money;
}

/** O que outro passo já decidiu por esta pessoa (teto agregado, IRRF agregado) e este contracheque só aplica. */
export interface ImposicoesDaPessoa {
  readonly contribuicao?: { readonly valor: Money; readonly explicacao: string };
  readonly irrf?: { readonly valor: Money; readonly explicacao: string };
}

export interface EntradaDoContracheque {
  readonly competencia: string;
  readonly vinculo: { readonly id: string; readonly matricula: string; readonly regime: RegimePrevidenciario; readonly dataNascimento: Date };
  readonly vencimentoBase: Money | null;
  readonly gratificacoes: readonly { readonly descricao: string; readonly valor: Money }[];
  readonly dias: DiasComputados;
  readonly lancamentos: readonly LancamentoLido[];
  readonly dependentesSalarioFamilia: readonly DependenteParaSalarioFamilia[];
  readonly dependentesIr: number;
  readonly pensaoAlimenticia: Money;
  readonly rubricas: readonly RubricaLida[];
  readonly tabelas: {
    readonly contribuicao: TabelaDeContribuicaoLida | null;
    readonly irrf: TabelaIrrfLida;
    readonly salarioFamilia: TabelaSalarioFamiliaLida | null;
  };
  readonly imposicoes?: ImposicoesDaPessoa;
}

export interface LinhaCalculada {
  readonly rubricaId: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: TipoDeRubrica;
  readonly natureza: NaturezaDaRubrica;
  readonly ordem: number;
  readonly valorBase: Money;
  readonly fator: Decimal;
  readonly valor: Money;
  readonly incideContribuicao: boolean;
  readonly incideIrrf: boolean;
  readonly memoria: string;
}

export interface ContrachequeCalculado {
  readonly vinculoId: string;
  readonly regime: RegimePrevidenciario;
  readonly diasComputados: number;
  readonly linhas: readonly LinhaCalculada[];
  readonly totais: {
    readonly proventos: Money;
    readonly descontos: Money;
    readonly liquido: Money;
    readonly baseContribuicao: Money;
    readonly contribuicao: Money;
    readonly baseIrrf: Money;
    readonly irrf: Money;
  };
  readonly contribuicao: ResultadoDaContribuicao;
  readonly irrf: ResultadoDoIrrf;
  readonly salarioFamilia: ResultadoDoSalarioFamilia | null;
  /** A memória canônica — o que vai para o banco e para o hash. */
  readonly memoria: Record<string, unknown>;
  readonly sha256: string;
}

const m = (v: Money | Decimal): string => (v instanceof Decimal ? v.toFixed(v.decimalPlaces() > 2 ? v.decimalPlaces() : 2) : String(v));

/** Serialização canônica: chaves ordenadas em todo nível, sem espaços — mesmo conteúdo, mesmo texto. */
export function canonico(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor);
  if (Array.isArray(valor)) return `[${valor.map(canonico).join(",")}]`;
  const o = valor as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonico(o[k])}`).join(",")}}`;
}

export function sha256Canonico(valor: unknown): string {
  return createHash("sha256").update(canonico(valor), "utf8").digest("hex");
}

function faixasParaMemoria(f: readonly FaixaPercorrida[]): readonly Record<string, string | number>[] {
  return f.map((x) => ({ ordem: x.ordem, de: m(x.de), ate: m(x.ate), baseNaFaixa: m(x.baseNaFaixa), aliquota: x.aliquota, valor: m(x.valor) }));
}

/**
 * CALCULA O CONTRACHEQUE DE UM VÍNCULO NUMA COMPETÊNCIA. Ordem:
 *   1. proventos por natureza (vencimento, gratificações, percentuais, informados), com o fator de
 *      dias nas rubricas proporcionais;
 *   2. bases (o que incide) e a contribuição pela tabela do regime;
 *   3. o IRRF pelos cenários da tabela (contribuição deduzida);
 *   4. o salário-família (não incide em nada);
 *   5. descontos informados; totais; memória; sha256.
 * As imposições (teto agregado / IRRF agregado por pessoa) substituem os passos 2 e 3, e a
 * memória diz que foram impostas e por quê.
 */
export function calcularContracheque(e: EntradaDoContracheque): ContrachequeCalculado {
  const rubricas = [...e.rubricas].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  const porNatureza = (n: NaturezaDaRubrica): RubricaLida | undefined => rubricas.find((r) => r.natureza === n);
  const rVenc = porNatureza("VENCIMENTO_BASE");
  const rContrib = porNatureza("CONTRIBUICAO_PREVIDENCIARIA");
  const rIrrf = porNatureza("IMPOSTO_DE_RENDA");
  if (rVenc === undefined) throw new RubricaSistemicaAusenteError("VENCIMENTO_BASE", "é ela que paga o vencimento");
  if (rContrib === undefined) throw new RubricaSistemicaAusenteError("CONTRIBUICAO_PREVIDENCIARIA", "é ela que desconta a contribuição");
  if (rIrrf === undefined) throw new RubricaSistemicaAusenteError("IMPOSTO_DE_RENDA", "é ela que retém o imposto");
  if (e.vencimentoBase === null) throw new VencimentoAusenteError(e.vinculo.matricula, e.competencia);
  const vencimento = e.vencimentoBase;
  const fator = fatorDeDias(e.dias.dias);
  const linhas: LinhaCalculada[] = [];
  const linha = (r: RubricaLida, valorBase: Money, memoria: string, proporcional = r.proporcionalAosDias): void => {
    const f = proporcional ? fator : new Decimal(1);
    const valor = toMoney(valorBase.times(f));
    linhas.push({ rubricaId: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, natureza: r.natureza, ordem: r.ordem, valorBase, fator: f, valor, incideContribuicao: r.incideContribuicao, incideIrrf: r.incideIrrf, memoria: proporcional ? `${memoria} × ${e.dias.explicacao}` : memoria });
  };

  // 1. proventos e descontos informados
  for (const r of rubricas) {
    switch (r.natureza) {
      case "VENCIMENTO_BASE":
        linha(r, vencimento, `vencimento-base vigente ${m(vencimento)}`);
        break;
      case "GRATIFICACOES_DO_VINCULO": {
        const total = sumMoney(e.gratificacoes.map((g) => g.valor));
        if (total.gt(0)) linha(r, total, `gratificações vigentes: ${e.gratificacoes.map((g) => `${g.descricao} ${m(g.valor)}`).join(" + ")}`);
        break;
      }
      case "PERCENTUAL_DO_VENCIMENTO": {
        const pct = r.percentual ?? new Decimal(0);
        linha(r, toMoney(vencimento.times(pct)), `${pct.times(100).toFixed(2)}% × vencimento-base ${m(vencimento)}`);
        break;
      }
      case "VALOR_INFORMADO": {
        const dos = e.lancamentos.filter((l) => l.rubricaId === r.id);
        if (dos.length === 0) break;
        const total = sumMoney(dos.map((l) => l.valor));
        linha(r, total, `lançamento(s) ${dos.map((l) => `${l.tipo.toLowerCase()} ${m(l.valor)}`).join(" + ")}`);
        break;
      }
      default:
        break; // contribuição, IRRF e salário-família entram abaixo, na ordem do cálculo
    }
  }

  // 2. bases e contribuição
  const proventosAteAqui = linhas.filter((l) => l.tipo === "PROVENTO");
  const baseContribuicao = sumMoney(proventosAteAqui.filter((l) => l.incideContribuicao).map((l) => l.valor));
  const rendaTributavel = sumMoney(proventosAteAqui.filter((l) => l.incideIrrf).map((l) => l.valor));
  const contribuicaoCalculada = calcularContribuicao({ regime: e.vinculo.regime, base: baseContribuicao, tabela: e.tabelas.contribuicao });
  const contribuicao = e.imposicoes?.contribuicao !== undefined ? e.imposicoes.contribuicao.valor : contribuicaoCalculada.valor;
  if (contribuicao.gt(0) || e.vinculo.regime !== "ISENTO") {
    linha(rContrib, contribuicao, e.imposicoes?.contribuicao !== undefined ? e.imposicoes.contribuicao.explicacao : `${contribuicaoCalculada.regime}: base ${m(contribuicaoCalculada.base)}${contribuicaoCalculada.tetoAplicado ? ` (teto sobre ${m(contribuicaoCalculada.baseAntesDoTeto)})` : ""} → faixas ${contribuicaoCalculada.faixas.map((f) => `${m(f.baseNaFaixa)}×${f.aliquota}`).join(" + ") || "—"} = ${m(contribuicao)}`, false);
  }

  // 3. IRRF
  const referencia = bordasDaCompetencia(e.competencia).inicio;
  const maior65 = idadeEm(e.vinculo.dataNascimento, referencia) >= 65;
  const irrfCalculado = calcularIrrf({ rendaTributavel, contribuicao, dependentes: e.dependentesIr, pensaoAlimenticia: e.pensaoAlimenticia, maior65, tabela: e.tabelas.irrf });
  const irrf = e.imposicoes?.irrf !== undefined ? e.imposicoes.irrf.valor : irrfCalculado.valor;
  if (irrf.gt(0)) {
    linha(rIrrf, irrf, e.imposicoes?.irrf !== undefined ? e.imposicoes.irrf.explicacao : `cenário ${irrfCalculado.cenario}: renda ${m(rendaTributavel)} − deduções → base ${m(irrfCalculado.base)} = ${m(irrf)}`, false);
  }

  // 4. salário-família
  let salarioFamilia: ResultadoDoSalarioFamilia | null = null;
  const rSf = porNatureza("SALARIO_FAMILIA");
  if (rSf !== undefined && e.tabelas.salarioFamilia !== null && e.dependentesSalarioFamilia.length > 0) {
    const rendaBruta = sumMoney(proventosAteAqui.map((l) => l.valor));
    salarioFamilia = calcularSalarioFamilia({ rendaBruta, dependentes: e.dependentesSalarioFamilia, tabela: e.tabelas.salarioFamilia, competencia: e.competencia });
    if (salarioFamilia.valor.gt(0)) linha(rSf, salarioFamilia.valor, `${salarioFamilia.elegiveis} dependente(s) elegível(is) × ${m(salarioFamilia.valorPorDependente)} (renda bruta ${m(rendaBruta)} ≤ ${m(salarioFamilia.rendaMaxima)})`, false);
  }

  // 5. totais
  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  const proventos = sumMoney(ordenadas.filter((l) => l.tipo === "PROVENTO").map((l) => l.valor));
  const descontos = sumMoney(ordenadas.filter((l) => l.tipo === "DESCONTO").map((l) => l.valor));
  const liquido = toMoney(proventos.minus(descontos));
  const totais = { proventos, descontos, liquido, baseContribuicao: contribuicaoCalculada.base, contribuicao, baseIrrf: irrfCalculado.base, irrf };

  const memoria: Record<string, unknown> = {
    motor: VERSAO_DO_MOTOR,
    competencia: e.competencia,
    vinculo: { id: e.vinculo.id, matricula: e.vinculo.matricula, regime: e.vinculo.regime },
    dias: e.dias,
    vencimentoBase: m(vencimento),
    linhas: ordenadas.map((l) => ({ codigo: l.codigo, descricao: l.descricao, tipo: l.tipo, natureza: l.natureza, valorBase: m(l.valorBase), fator: l.fator.toFixed(6), valor: m(l.valor), incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria, fundamentacao: rubricas.find((r) => r.id === l.rubricaId)?.fundamentacaoLegal ?? "" })),
    contribuicao: { regime: contribuicaoCalculada.regime, base: m(contribuicaoCalculada.base), baseAntesDoTeto: m(contribuicaoCalculada.baseAntesDoTeto), tetoAplicado: contribuicaoCalculada.tetoAplicado, calculada: m(contribuicaoCalculada.valor), aplicada: m(contribuicao), faixas: faixasParaMemoria(contribuicaoCalculada.faixas), tabela: contribuicaoCalculada.tabelaId, fundamentacao: contribuicaoCalculada.fundamentacao, ...(e.imposicoes?.contribuicao !== undefined ? { imposta: e.imposicoes.contribuicao.explicacao } : {}) },
    irrf: { rendaTributavel: m(rendaTributavel), base: m(irrfCalculado.base), calculado: m(irrfCalculado.valor), aplicado: m(irrf), cenario: irrfCalculado.cenario, maior65, dependentes: e.dependentesIr, cenarios: irrfCalculado.cenarios.map((c) => ({ nome: c.nome, aplicavel: c.aplicavel, ...(c.motivo !== undefined ? { motivo: c.motivo } : {}), base: m(c.base), valor: m(c.valor), deducoes: c.deducoes.map((d) => ({ tipo: d.tipo, valor: m(d.valor) })), faixas: faixasParaMemoria(c.faixas) })), tabela: irrfCalculado.tabelaId, fundamentacao: irrfCalculado.fundamentacao, ...(e.imposicoes?.irrf !== undefined ? { imposto: e.imposicoes.irrf.explicacao } : {}) },
    salarioFamilia: salarioFamilia === null ? null : { rendaBruta: m(salarioFamilia.rendaBruta), rendaMaxima: m(salarioFamilia.rendaMaxima), valorPorDependente: m(salarioFamilia.valorPorDependente), elegiveis: salarioFamilia.elegiveis, valor: m(salarioFamilia.valor), considerados: salarioFamilia.considerados, tabela: salarioFamilia.tabelaId, fundamentacao: salarioFamilia.fundamentacao },
    totais: { proventos: m(proventos), descontos: m(descontos), liquido: m(liquido), baseContribuicao: m(totais.baseContribuicao), contribuicao: m(contribuicao), baseIrrf: m(totais.baseIrrf), irrf: m(irrf) },
  };
  return { vinculoId: e.vinculo.id, regime: e.vinculo.regime, diasComputados: e.dias.dias, linhas: ordenadas, totais, contribuicao: contribuicaoCalculada, irrf: irrfCalculado, salarioFamilia, memoria, sha256: sha256Canonico(memoria) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A MESMA PESSOA COM DUAS MATRÍCULAS — enquadramento agregado (TR 5.12.79)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Para uma pessoa com mais de um vínculo no ente:
 *   • contribuição RGPS: as bases dos vínculos RGPS se SOMAM; a tabela se aplica à soma (com o
 *     teto); o resultado se rateia entre os vínculos na proporção das bases, e o centavo do
 *     arredondamento fica no último;
 *   • IRRF: o ente é UMA fonte pagadora — a renda tributável se soma, a contribuição deduzida é a
 *     soma das contribuições, dependentes e pensão contam uma vez; o imposto se rateia na
 *     proporção das rendas.
 * Vínculos RPPS e ISENTOS ficam fora da agregação da contribuição (regimes independentes).
 * Devolve as imposições por vínculo — vazio quando a pessoa tem um vínculo só.
 */
export function imposicoesDaPessoa(p: {
  readonly competencia: string;
  /** Cada vínculo com o que o passo 1 calculou SOZINHO: a base antes do teto, a contribuição e a renda tributável. */
  readonly vinculos: readonly { readonly id: string; readonly matricula: string; readonly regime: RegimePrevidenciario; readonly baseContribuicao: Money; readonly contribuicaoSozinho: Money; readonly rendaTributavel: Money }[];
  readonly dataNascimento: Date;
  readonly dependentesIr: number;
  readonly pensaoAlimenticia: Money;
  readonly tabelas: { readonly contribuicao: TabelaDeContribuicaoLida | null; readonly irrf: TabelaIrrfLida };
}): ReadonlyMap<string, ImposicoesDaPessoa> {
  const saida = new Map<string, ImposicoesDaPessoa>();
  if (p.vinculos.length < 2) return saida;
  const matriculas = p.vinculos.map((v) => v.matricula).join(", ");

  // contribuição agregada (RGPS)
  const contribPorVinculo = new Map<string, Money>();
  const rgps = p.vinculos.filter((v) => v.regime === "RGPS");
  if (rgps.length >= 2 && p.tabelas.contribuicao !== null) {
    const somaBases = sumMoney(rgps.map((v) => v.baseContribuicao));
    const total = calcularContribuicao({ regime: "RGPS", base: somaBases, tabela: p.tabelas.contribuicao });
    let acumulado = toMoney(0);
    rgps.forEach((v, i) => {
      const ultimo = i === rgps.length - 1;
      const parte = ultimo ? toMoney(total.valor.minus(acumulado)) : somaBases.isZero() ? toMoney(0) : toMoney(total.valor.times(v.baseContribuicao).div(somaBases));
      acumulado = acumulado.plus(parte);
      contribPorVinculo.set(v.id, parte);
      saida.set(v.id, { contribuicao: { valor: parte, explicacao: `RGPS agregado (${matriculas}): bases somadas ${m(somaBases)}${total.tetoAplicado ? ` → teto ${m(total.base)}` : ""} = ${m(total.valor)}; parte desta matrícula ${m(parte)} (proporcional à base ${m(v.baseContribuicao)})` } });
    });
  }

  // IRRF agregado (uma fonte pagadora)
  const contribuicoes = p.vinculos.map((v) => contribPorVinculo.get(v.id) ?? v.contribuicaoSozinho);
  const somaRenda = sumMoney(p.vinculos.map((v) => v.rendaTributavel));
  const referencia = bordasDaCompetencia(p.competencia).inicio;
  const total = calcularIrrf({ rendaTributavel: somaRenda, contribuicao: sumMoney(contribuicoes), dependentes: p.dependentesIr, pensaoAlimenticia: p.pensaoAlimenticia, maior65: idadeEm(p.dataNascimento, referencia) >= 65, tabela: p.tabelas.irrf });
  let acumulado = toMoney(0);
  p.vinculos.forEach((v, i) => {
    const ultimo = i === p.vinculos.length - 1;
    const parte = ultimo ? toMoney(total.valor.minus(acumulado)) : somaRenda.isZero() ? toMoney(0) : toMoney(total.valor.times(v.rendaTributavel).div(somaRenda));
    acumulado = acumulado.plus(parte);
    const anterior = saida.get(v.id) ?? {};
    saida.set(v.id, { ...anterior, irrf: { valor: parte, explicacao: `IRRF agregado (${matriculas}): rendas somadas ${m(somaRenda)}, cenário ${total.cenario}, base ${m(total.base)} = ${m(total.valor)}; parte desta matrícula ${m(parte)} (proporcional à renda ${m(v.rendaTributavel)})` } });
  });
  return saida;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD — o que entra pelas telas
// ═══════════════════════════════════════════════════════════════════════════════

const zDinheiro = z.union([z.string(), z.number(), z.instanceof(Decimal)]).transform((v) => toMoney(v));
const zAliquota = z.union([z.string(), z.number(), z.instanceof(Decimal)]).transform((v) => new Decimal(v)).refine((d) => d.gte(0) && d.lte(1), "alíquota entre 0 e 1 (0.075 = 7,5%)");
const zAutor = z.string().min(1);
const zFundamentacao = z.string().trim().min(5, "fundamentação legal com ao menos 5 caracteres");

export const zFaixaInput = z.object({
  ordem: z.number().int().positive(),
  ate: zDinheiro.nullable(),
  aliquota: zAliquota,
});

export const zCadastrarTabelaDeContribuicaoInput = z.object({
  regime: z.enum(["RGPS", "RPPS"]),
  competenciaInicio: zCompetencia,
  competenciaFim: zCompetencia.nullable().optional(),
  teto: zDinheiro.nullable().optional(),
  aliquotaPatronal: zAliquota.nullable().optional(),
  fundamentacaoLegal: zFundamentacao,
  faixas: z.array(zFaixaInput).min(1),
  criadoPor: zAutor,
});
export type CadastrarTabelaDeContribuicaoInput = z.input<typeof zCadastrarTabelaDeContribuicaoInput>;

export const zCadastrarTabelaIrrfInput = z.object({
  competenciaInicio: zCompetencia,
  competenciaFim: zCompetencia.nullable().optional(),
  deducaoPorDependente: zDinheiro,
  descontoSimplificado: zDinheiro.nullable().optional(),
  isencaoMaior65: zDinheiro.nullable().optional(),
  redutorBase: zDinheiro.nullable().optional(),
  redutorFator: z.union([z.string(), z.number(), z.instanceof(Decimal)]).transform((v) => new Decimal(v)).nullable().optional(),
  redutorRendaMaxima: zDinheiro.nullable().optional(),
  fundamentacaoLegal: zFundamentacao,
  faixas: z.array(zFaixaInput.extend({ parcelaADeduzir: zDinheiro.optional() })).min(1),
  criadoPor: zAutor,
});
export type CadastrarTabelaIrrfInput = z.input<typeof zCadastrarTabelaIrrfInput>;

export const zCadastrarTabelaSalarioFamiliaInput = z.object({
  competenciaInicio: zCompetencia,
  competenciaFim: zCompetencia.nullable().optional(),
  rendaMaxima: zDinheiro,
  valorPorDependente: zDinheiro,
  idadeLimite: z.number().int().positive(),
  fundamentacaoLegal: zFundamentacao,
  criadoPor: zAutor,
});
export type CadastrarTabelaSalarioFamiliaInput = z.input<typeof zCadastrarTabelaSalarioFamiliaInput>;

export const zCadastrarRubricaInput = z
  .object({
    codigo: z.string().trim().min(1).max(20),
    descricao: z.string().trim().min(3),
    tipo: z.enum(["PROVENTO", "DESCONTO"]),
    natureza: z.enum(["VENCIMENTO_BASE", "GRATIFICACOES_DO_VINCULO", "VALOR_INFORMADO", "PERCENTUAL_DO_VENCIMENTO", "CONTRIBUICAO_PREVIDENCIARIA", "IMPOSTO_DE_RENDA", "SALARIO_FAMILIA"]),
    percentual: zAliquota.nullable().optional(),
    incideContribuicao: z.boolean(),
    incideIrrf: z.boolean(),
    proporcionalAosDias: z.boolean(),
    ordem: z.number().int().positive(),
    fundamentacaoLegal: zFundamentacao,
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.natureza === "PERCENTUAL_DO_VENCIMENTO" && (v.percentual === null || v.percentual === undefined || v.percentual.lte(0))) {
      ctx.addIssue({ code: "custom", path: ["percentual"], message: "PERCENTUAL_DO_VENCIMENTO exige o percentual (0.20 = 20%)." });
    }
    if (v.natureza !== "PERCENTUAL_DO_VENCIMENTO" && v.percentual !== null && v.percentual !== undefined) {
      ctx.addIssue({ code: "custom", path: ["percentual"], message: "Só a natureza PERCENTUAL_DO_VENCIMENTO usa percentual." });
    }
    const desconto = v.natureza === "CONTRIBUICAO_PREVIDENCIARIA" || v.natureza === "IMPOSTO_DE_RENDA";
    if (desconto && v.tipo !== "DESCONTO") ctx.addIssue({ code: "custom", path: ["tipo"], message: `${v.natureza} é DESCONTO.` });
    const provento = v.natureza === "VENCIMENTO_BASE" || v.natureza === "GRATIFICACOES_DO_VINCULO" || v.natureza === "SALARIO_FAMILIA";
    if (provento && v.tipo !== "PROVENTO") ctx.addIssue({ code: "custom", path: ["tipo"], message: `${v.natureza} é PROVENTO.` });
    if ((desconto || v.natureza === "SALARIO_FAMILIA") && (v.incideContribuicao || v.incideIrrf)) {
      ctx.addIssue({ code: "custom", path: ["incideContribuicao"], message: `${v.natureza} não compõe base de contribuição nem de IRRF.` });
    }
  });
export type CadastrarRubricaInput = z.input<typeof zCadastrarRubricaInput>;

export const zLancarNaFolhaInput = z
  .object({
    vinculoId: z.string().min(1),
    rubricaId: z.string().min(1),
    tipo: z.enum(["FIXO", "VARIAVEL"]),
    competenciaInicio: zCompetencia,
    competenciaFim: zCompetencia.nullable().optional(),
    valor: zDinheiro.refine((v) => v.gt(0), "valor maior que zero"),
    observacao: z.string().trim().min(3).optional(),
    atoLegal: z.string().trim().min(3).optional(),
    criadoPor: zAutor,
  })
  .superRefine((v, ctx) => {
    if (v.competenciaFim !== null && v.competenciaFim !== undefined && v.competenciaFim < v.competenciaInicio) {
      ctx.addIssue({ code: "custom", path: ["competenciaFim"], message: "a competência final não pode ser anterior à inicial" });
    }
  });
export type LancarNaFolhaInput = z.input<typeof zLancarNaFolhaInput>;

export const zAbrirFolhaInput = z.object({
  competencia: zCompetencia,
  tipo: z.enum(["MENSAL"]).default("MENSAL"),
  criadoPor: zAutor,
});
export type AbrirFolhaInput = z.input<typeof zAbrirFolhaInput>;

export const zCalcularFolhaInput = z.object({
  folhaId: z.string().min(1),
  motivo: z.string().trim().min(3).optional(),
  criadoPor: zAutor,
});
export type CalcularFolhaInput = z.input<typeof zCalcularFolhaInput>;

export const zCancelarCalculoInput = z.object({
  calculoId: z.string().min(1),
  motivo: z.string().trim().min(5, "motivo com ao menos 5 caracteres"),
  criadoPor: zAutor,
});
export type CancelarCalculoInput = z.input<typeof zCancelarCalculoInput>;

export const zFecharFolhaInput = z.object({
  folhaId: z.string().min(1),
  criadoPor: zAutor,
});
export type FecharFolhaInput = z.input<typeof zFecharFolhaInput>;

/** A situação da folha, DERIVADA dos fatos. */
export type SituacaoDaFolha = "SEM_CALCULO" | "CALCULADA" | "FECHADA";
export function situacaoDaFolha(f: { readonly calculos: readonly { readonly cancelada: boolean }[]; readonly fechada: boolean }): SituacaoDaFolha {
  if (f.fechada) return "FECHADA";
  return f.calculos.some((c) => !c.cancelada) ? "CALCULADA" : "SEM_CALCULO";
}
