import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ugDasUnidadesOrcamentarias } from "../m01-core-contabil/unidade-gestora.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ O LIMITE DO REPASSE AO LEGISLATIVO — CF art. 29-A (V35, onda C3) ═══
 *
 * O total da despesa do Legislativo municipal (exceto inativos e pensionistas) não pode passar de um percentual da
 * receita tributária e das transferências do art. 153 § 5º e dos arts. 158 e 159, EFETIVAMENTE REALIZADAS NO EXERCÍCIO
 * ANTERIOR. O percentual depende da população (incisos I a VI, redação da EC 58/2009) — norma constitucional fixa, que
 * mora aqui com a citação. O repasse é crime de responsabilidade do Prefeito se passar do limite, se não for feito
 * até o dia 20 de cada mês ou se for menor que a proporção fixada na LOA (§ 2º, I a III).
 *
 * ⚠️ A BASE É BRUTA: a parcela retida para o FUNDEB integra a base (STF, interpretação do art. 29-A); o FUNDEB
 * RECEBIDO não é receita tributária nem transferência do art. 158/159 e não entra. A base vem do próprio sistema quando
 * o exercício anterior foi escriturado nele; senão, é DECLARADA com o documento (para Esperança, a receita de 2025 dos
 * dados abertos do TCE-PB: docs/oficial/tce-pb/esperanca-078/receitas-2025-DERIVADO.csv).
 */

/** CF art. 29-A, I a VI (EC 58/2009): até `ate` habitantes, o percentual. */
export const FAIXAS_DO_ART_29A: readonly { readonly ate: number; readonly percentual: string; readonly inciso: string }[] = [
  { ate: 100_000, percentual: "7.0", inciso: "I" },
  { ate: 300_000, percentual: "6.0", inciso: "II" },
  { ate: 500_000, percentual: "5.0", inciso: "III" },
  { ate: 3_000_000, percentual: "4.5", inciso: "IV" },
  { ate: 8_000_000, percentual: "4.0", inciso: "V" },
  { ate: Number.MAX_SAFE_INTEGER, percentual: "3.5", inciso: "VI" },
];

export function faixaDaPopulacao(populacao: number): { readonly percentual: string; readonly inciso: string } {
  return FAIXAS_DO_ART_29A.find((f) => populacao <= f.ate)!;
}

/**
 * As naturezas da base, pelos agregadores do ementário 2026: toda a receita tributária (1.1 — impostos, taxas e
 * contribuições de melhoria, em todos os tipos) e as cotas-partes dos arts. 158 e 159 e do art. 153 § 5º.
 */
export const PREFIXOS_DA_BASE: readonly { readonly prefixo: string; readonly rotulo: string }[] = [
  { prefixo: "11", rotulo: "Receita tributária (impostos, taxas e contribuições de melhoria)" },
  { prefixo: "171151", rotulo: "Cota-parte do FPM (art. 159, I, b, d, e)" },
  { prefixo: "1711520", rotulo: "Cota-parte do ITR (art. 158, II)" },
  { prefixo: "1711550", rotulo: "Cota-parte do IOF-ouro (art. 153, § 5º, II)" },
  { prefixo: "1721500", rotulo: "Cota-parte do ICMS (art. 158, IV)" },
  { prefixo: "1721510", rotulo: "Cota-parte do IPVA (art. 158, III)" },
  { prefixo: "1721520", rotulo: "Cota-parte do IPI-exportação (art. 159, § 3º)" },
  { prefixo: "1721530", rotulo: "Cota-parte da CIDE (art. 159, § 4º)" },
];

export function componenteDaBase(natureza: string): string | null {
  return PREFIXOS_DA_BASE.find((p) => natureza.startsWith(p.prefixo))?.rotulo ?? null;
}

const zDeclarar = z.object({
  exercicio: z.number().int().min(2000).max(2999),
  populacao: z.number().int().positive("A população é um número inteiro positivo."),
  fontePopulacao: z.string().trim().min(10, "Cite a fonte da população (ex.: IBGE, estimativa do ano, tabela)."),
  baseDeclarada: z.string().trim().regex(/^\d+\.\d{2}$/, "A base é um valor com duas casas decimais.").nullable(),
  documentoDaBase: z.string().trim().min(10).nullable(),
  criadoPor: z.string().min(1),
});

/** DECLARA a população (e, se for o caso, a base) do exercício. Versão nova a cada declaração; a anterior fica. */
export async function declararParametroDoLimiteDoLegislativo(prisma: PrismaClient, input: z.input<typeof zDeclarar>): Promise<{ readonly versao: number }> {
  const d = zDeclarar.parse(input);
  if ((d.baseDeclarada === null) !== (d.documentoDaBase === null)) {
    throw new Error("A base declarada e o documento dela vêm juntos: sem o documento, a base não se confere. Nada foi gravado.");
  }
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararParametroDoLimiteDoLegislativo, "ENTE");
    const ultima = await tx.parametroDoLimiteDoLegislativo.aggregate({ where: { exercicio: d.exercicio }, _max: { versao: true } });
    const versao = (ultima._max.versao ?? 0) + 1;
    await tx.parametroDoLimiteDoLegislativo.create({
      data: { exercicio: d.exercicio, versao, populacao: d.populacao, fontePopulacao: d.fontePopulacao, baseDeclarada: d.baseDeclarada, documentoDaBase: d.documentoDaBase, criadoPor: d.criadoPor },
    });
    return { versao };
  });
}

export interface MesDoRepasse {
  readonly mes: number;
  readonly devido: string;
  readonly repassadoAteDia20: string;
  readonly repassadoNoMes: string;
  readonly emDia: boolean;
}

export interface ApuracaoDoLimite {
  readonly exercicio: number;
  readonly populacao: number;
  readonly fontePopulacao: string;
  readonly inciso: string;
  readonly percentual: string;
  readonly origemDaBase: "SISTEMA" | "DECLARADA";
  readonly documentoDaBase: string | null;
  readonly componentes: readonly { readonly rotulo: string; readonly valor: string }[];
  readonly base: string;
  readonly limiteAnual: string;
  readonly dotacaoDaCamaraNaLoa: string;
  /** O que o Executivo deve repassar no ano: a LOA, contida no limite constitucional. */
  readonly devidoNoAno: string;
  readonly duodecimo: string;
  readonly meses: readonly MesDoRepasse[];
  readonly repassadoNoAno: string;
  readonly alertas: readonly string[];
}

const soma = (a: Money, b: Money): Money => toMoney(a.plus(b));
const zero = (): Money => toMoney("0.00");

/** APURA o limite, o duodécimo e a situação de cada mês até `ate`. Leitura pura. Recusa sem a população declarada. */
export async function apurarLimiteDoLegislativo(prisma: PrismaClient, p: { readonly exercicio: number; readonly ate: Date }): Promise<ApuracaoDoLimite> {
  const parametro = await prisma.parametroDoLimiteDoLegislativo.findFirst({ where: { exercicio: p.exercicio }, orderBy: { versao: "desc" } });
  if (parametro === null) {
    throw new Error(`A população de ${String(p.exercicio)} não foi declarada: sem ela não há faixa do art. 29-A. Declare-a em Relatórios › Limite do Legislativo.`);
  }
  const { percentual, inciso } = faixaDaPopulacao(parametro.populacao);

  // ── a base: do sistema (exercício anterior escriturado) ou declarada ──
  const anterior = p.exercicio - 1;
  const arrecadado = await arrecadadoPorNaturezaFonte(prisma, { desde: inicioDoDiaCivil(`${String(anterior)}-01-01`), ate: fimDoDiaCivil(`${String(anterior)}-12-31`) });
  const porComponente = new Map<string, Money>();
  for (const a of arrecadado) {
    const c = componenteDaBase(a.naturezaCodigo);
    if (c !== null) porComponente.set(c, soma(porComponente.get(c) ?? zero(), a.arrecadado));
  }
  const doSistema = [...porComponente.values()].reduce(soma, zero());
  let origemDaBase: "SISTEMA" | "DECLARADA";
  let base: Money;
  if (parametro.baseDeclarada !== null) {
    origemDaBase = "DECLARADA";
    base = toMoney(parametro.baseDeclarada.toFixed(2));
  } else if (!doSistema.isZero()) {
    origemDaBase = "SISTEMA";
    base = doSistema;
  } else {
    throw new Error(`O exercício de ${String(anterior)} não tem receita escriturada neste sistema e a base não foi declarada. Declare a base realizada em ${String(anterior)} com o documento de onde ela vem.`);
  }
  const limiteAnual = toMoney(base.times(percentual).dividedBy(100));

  // ── a LOA da Câmara: as fichas das unidades da UG do Legislativo em 1º de janeiro ──
  const camaras = await prisma.unidadeGestora.findMany({ where: { naturezaJuridica: "CAMARA_MUNICIPAL" }, select: { id: true, codigoTce: true } });
  if (camaras.length !== 1) throw new Error(`O cálculo do repasse pede exatamente uma UG de Câmara Municipal; há ${String(camaras.length)}.`);
  const camara = camaras[0]!;
  const ugPorUo = await ugDasUnidadesOrcamentarias(prisma, inicioDoDiaCivil(`${String(p.exercicio)}-01-01`));
  const uosDaCamara = [...ugPorUo.entries()].filter(([, ug]) => ug === camara.codigoTce).map(([uo]) => uo);
  const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: p.exercicio, unidadeOrc: { codigo: { in: uosDaCamara } } }, select: { valorDotado: true } });
  const dotacao = fichas.reduce((s, f) => soma(s, toMoney(f.valorDotado.toFixed(2))), zero());
  const devidoNoAno = dotacao.lessThan(limiteAnual) ? dotacao : limiteAnual;
  const duodecimo = toMoney(devidoNoAno.dividedBy(12));

  // ── os repasses (transferências DUODECIMO à UG da Câmara) e o dia 20 ──
  const repasses = await prisma.transferenciaEntreUgs.findMany({
    where: { tipo: "DUODECIMO", ugDestinoId: camara.id, data: { gte: inicioDoDiaCivil(`${String(p.exercicio)}-01-01`), lte: p.ate } },
    select: { valor: true, data: true, estornoDeId: true },
  });
  const ultimoMes = Number(diaCivil(p.ate).slice(5, 7));
  const anoAte = Number(diaCivil(p.ate).slice(0, 4));
  const meses: MesDoRepasse[] = [];
  let repassadoNoAno = zero();
  for (let m = 1; m <= (anoAte > p.exercicio ? 12 : ultimoMes); m++) {
    const mm = String(m).padStart(2, "0");
    let ate20 = zero();
    let noMes = zero();
    for (const r of repasses) {
      const dia = diaCivil(r.data);
      if (dia.slice(5, 7) !== mm) continue;
      const v = r.estornoDeId === null ? toMoney(r.valor.toFixed(2)) : toMoney(r.valor.negated().toFixed(2));
      noMes = soma(noMes, v);
      if (Number(dia.slice(8, 10)) <= 20) ate20 = soma(ate20, v);
    }
    repassadoNoAno = soma(repassadoNoAno, noMes);
    meses.push({ mes: m, devido: duodecimo.toFixed(2), repassadoAteDia20: ate20.toFixed(2), repassadoNoMes: noMes.toFixed(2), emDia: !ate20.lessThan(duodecimo) });
  }

  const alertas: string[] = [];
  if (repassadoNoAno.greaterThan(limiteAnual)) alertas.push(`O repassado no ano (${repassadoNoAno.toFixed(2)}) passa do limite constitucional (${limiteAnual.toFixed(2)}): CF art. 29-A, § 2º, I.`);
  for (const m of meses) if (!m.emDia) alertas.push(`Mês ${String(m.mes).padStart(2, "0")}: até o dia 20 foram repassados ${m.repassadoAteDia20} de ${m.devido} devidos (CF art. 29-A, § 2º, II e III).`);
  if (dotacao.greaterThan(limiteAnual)) alertas.push(`A LOA fixou ${dotacao.toFixed(2)} para a Câmara, acima do limite de ${limiteAnual.toFixed(2)}: o repasse fica contido no limite.`);

  return {
    exercicio: p.exercicio, populacao: parametro.populacao, fontePopulacao: parametro.fontePopulacao, inciso, percentual,
    origemDaBase, documentoDaBase: parametro.documentoDaBase,
    componentes: origemDaBase === "SISTEMA" ? [...porComponente.entries()].map(([rotulo, v]) => ({ rotulo, valor: v.toFixed(2) })) : [],
    base: base.toFixed(2), limiteAnual: limiteAnual.toFixed(2), dotacaoDaCamaraNaLoa: dotacao.toFixed(2), devidoNoAno: devidoNoAno.toFixed(2),
    duodecimo: duodecimo.toFixed(2), meses, repassadoNoAno: repassadoNoAno.toFixed(2), alertas,
  };
}
