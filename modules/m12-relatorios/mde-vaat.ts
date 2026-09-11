import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
// ═══ A MEDIÇÃO TEM UM DONO: a regra bimestral é do bloco 1. ═══
import { anexo8, medirDespesa, type DespesaFundeb } from "./rreo-anexo8.js";
import type { Bimestre } from "./rreo-anexo1.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import { janelaCivilDeMeses, janelaCivilDoAno } from "../../packages/datas/index.js";

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/**
 * MDE — BLOCO 2: VAAT, ÁREAS DE ATUAÇÃO e RP × LASTRO. Lei 14.113/2020, arts. 27 e 28.
 *
 * ═══ O QUE O VAAT É, E POR QUE TEM REGRA PRÓPRIA ═══
 * A complementação-VAAT é dinheiro que a União põe onde o valor por aluno ficou abaixo
 * do mínimo. Por ser socorro, ela vem com destino: **≥15% em despesas de capital**
 * (art. 27) e uma fatia em **educação infantil** (art. 28). Gastá-la em custeio corrente
 * é usar o socorro para pagar a conta de sempre.
 */

const PERC_MINIMO_CAPITAL = toMoney("15");
/** Categoria econômica 4 = DESPESAS DE CAPITAL (`NaturezaDespesa.codCategoria`). */
const CATEGORIA_CAPITAL = "4";
/** Subfunção 365 — Educação Infantil (rol oficial da Portaria 42/1999). */
const SUBFUNCAO_INFANTIL = "365";

/** Dinheiro em `string`, sempre 2 casas — a regra de ouro atravessa a borda. */
type Cifra = string;

// ═══════════════════════════════════════════════════════════════════════════
// F1/F2 — OS DOIS INDICADORES DO VAAT
// ═══════════════════════════════════════════════════════════════════════════

export interface IndicadorVaat {
  /** A base: o recebido da complementação-VAAT (linha 6.3 do bloco 1). */
  readonly base: Cifra;
  readonly aplicado: Cifra;
  /** `null` quando a base é ZERO — ver `SEM-VAAT-NO-EXERCICIO`. */
  readonly percentual: Cifra | null;
  /** O mínimo exigido. `null` no indicador de educação infantil sem IEI. */
  readonly minimo: Cifra | null;
  /** `null` quando não há como comparar (base zero, ou mínimo ausente). */
  readonly atingiu: boolean | null;
  /** O interruptor que explica o `null`, quando há um. */
  readonly interruptor: string | null;
}

export interface AreaDeAtuacao {
  readonly chave: string;
  readonly subfuncao: string;
  readonly rotulo: string;
  readonly despesa: Cifra;
}

export interface RpDaFonte {
  readonly fonte: string;
  readonly classe: string;
  /** (b) + (d) do Anexo 5 — o RP inscrito daquela fonte. */
  readonly restosAPagar: Cifra;
  /** (a) do Anexo 5 — o caixa que os lastreia. */
  readonly caixaBruto: Cifra;
  /** max(0, RP − caixa). Acima de zero: RP que a conta vinculada não cobre. */
  readonly semLastro: Cifra;
}

export interface Bloco2Mde {
  readonly exercicio: number;
  readonly bimestre: Bimestre;

  readonly vaatCapital: IndicadorVaat;
  readonly vaatEducacaoInfantil: IndicadorVaat;

  readonly areas: readonly AreaDeAtuacao[];
  /**
   * ⚠️ A despesa de educação que NENHUMA área identifica. Coluna PRÓPRIA, nunca
   * dividida — ver `MATRICULAS-POR-AREA`.
   */
  readonly naoRateado: Cifra;

  readonly rpPorFonte: readonly RpDaFonte[];
  /** Σ do RP sem lastro. Acima de zero, é glosa. */
  readonly rpSemLastroTotal: Cifra;

  readonly notas: readonly string[];
}

/**
 * ⚠️ TABELA-PARÂMETRO VAZIA NOMEADA — `IEI-MUNICIPIO`.
 *
 * O art. 28 manda 50% da complementação-VAAT **global** à educação infantil. Esses 50%
 * são da DISTRIBUIÇÃO NACIONAL, não da obrigação de cada ente: o percentual do município
 * é o seu **IEI** (Indicador de Educação Infantil), publicado até 31/12 pelo Executivo
 * Federal (art. 28, § único, c/c art. 16, VII).
 *
 * Comparar o município contra 50% seria inventar uma obrigação que a lei não lhe deu — e
 * reprovar um ente que cumpriu o IEI dele. Sem o número publicado, este motor mostra o
 * APURADO e diz que falta o parâmetro. Nunca compara.
 */
const IEI_MUNICIPIO: Money | null = null;

/**
 * ⚠️ TABELA-PARÂMETRO VAZIA NOMEADA — `MATRICULAS-POR-AREA`.
 *
 * A nota 6 do MDF admite ratear a despesa de educação que não se identifica com uma área
 * (a administração da secretaria, por exemplo) **proporcionalmente às matrículas**. Sem
 * o censo de matrículas, o rateio seria uma divisão por chute — e o chute cairia
 * exatamente na conta que decide se o ente cumpriu um mínimo constitucional.
 *
 * Enquanto vazia, a despesa não identificável fica em `naoRateado`: uma coluna própria,
 * visível, que ninguém confunde com aplicação em área nenhuma.
 *
 * ⚠️ QUANDO ELA CHEGAR: rateio com `ROUND_DOWN` e o resto na última área (a doutrina de
 * divisão do repo) — senão a soma das partes não fecha com o todo.
 */
const MATRICULAS_POR_AREA: ReadonlyMap<string, number> = new Map();

/** As áreas de atuação da educação, por subfunção. Chaves estáveis; rótulo é apresentação. */
const AREAS: readonly { readonly chave: string; readonly subfuncao: string; readonly rotulo: string }[] = [
  { chave: "INFANTIL", subfuncao: SUBFUNCAO_INFANTIL, rotulo: "Educação Infantil" },
  { chave: "FUNDAMENTAL", subfuncao: "361", rotulo: "Ensino Fundamental" },
  { chave: "MEDIO", subfuncao: "362", rotulo: "Ensino Médio" },
  { chave: "PROFISSIONAL", subfuncao: "363", rotulo: "Ensino Profissional" },
  { chave: "SUPERIOR", subfuncao: "364", rotulo: "Ensino Superior" },
  { chave: "EJA", subfuncao: "366", rotulo: "Educação de Jovens e Adultos" },
  { chave: "ESPECIAL", subfuncao: "367", rotulo: "Educação Especial" },
];

/**
 * ⚠️ CRECHE × PRÉ-ESCOLA NÃO SE DISTINGUEM — e não é limitação da tela.
 *
 * A subfunção 365 é UMA: "Educação Infantil". O rol oficial (Portaria 42/1999) não a
 * desdobra, e o sistema não tem outro campo que o faça. Um quadro que separasse as duas
 * estaria inventando um dado — pendência `DESDOBRAMENTO-CRECHE-PRE-ESCOLA`.
 */
export const NOTA_CRECHE_PRE_ESCOLA =
  "A subfunção 365 (Educação Infantil) é nível único no rol oficial — creche e pré-escola " +
  "não se distinguem no sistema. Pendência DESDOBRAMENTO-CRECHE-PRE-ESCOLA.";

export async function bloco2Mde(
  prisma: Tx,
  p: { readonly exercicio: number; readonly bimestre: Bimestre }
): Promise<Bloco2Mde> {
  const notas: string[] = [NOTA_CRECHE_PRE_ESCOLA];
  const base: "liquidada" | "empenhada" = p.bimestre === 6 ? "empenhada" : "liquidada";
  const fim = fimDoBimestre(p.exercicio, p.bimestre);

  // A BASE do VAAT vem do bloco 1 — a linha 6.3, por PAPEL de receita.
  const a8 = await anexo8(prisma, { exercicio: p.exercicio, bimestre: p.bimestre });
  const recebidoVaat = toMoney(
    a8.receitasFundeb.find((r) => r.papel === "VAAT")?.valor ?? "0.00"
  );

  // As fichas de educação (função 12) da classe VAAT.
  const classeDaFonte = new Map<string, string>();
  for (const d of await prisma.deParaFonteClasseEducacao.findMany({
    select: { fonteCodigo: true, classe: true },
  })) {
    classeDaFonte.set(d.fonteCodigo, d.classe);
  }

  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: p.exercicio, funcao: { codigo: "12" } },
    select: {
      id: true,
      fonte: { select: { codigo: true } },
      subfuncao: { select: { codigo: true } },
      naturezaDespesa: { select: { codCategoria: true } },
    },
  });

  const fichasVaat: string[] = [];
  const vaatCapitalIds = new Set<string>();
  const vaatInfantilIds = new Set<string>();
  for (const f of fichas) {
    // O fail-closed da classe é do bloco 1 (`anexo8` já derrubou acima se faltasse).
    if (classeDaFonte.get(f.fonte.codigo) !== "VAAT") continue;
    fichasVaat.push(f.id);
    if (f.naturezaDespesa.codCategoria === CATEGORIA_CAPITAL) vaatCapitalIds.add(f.id);
    if (f.subfuncao.codigo === SUBFUNCAO_INFANTIL) vaatInfantilIds.add(f.id);
  }

  const capital = await medirDespesa(prisma, fichasVaat, vaatCapitalIds, p.exercicio, fim, base, "VAAT — capital");
  const infantil = await medirDespesa(prisma, fichasVaat, vaatInfantilIds, p.exercicio, fim, base, "VAAT — educação infantil");

  return {
    exercicio: p.exercicio,
    bimestre: p.bimestre,
    vaatCapital: indicador(recebidoVaat, capital, PERC_MINIMO_CAPITAL, notas),
    vaatEducacaoInfantil: indicadorInfantil(recebidoVaat, infantil, notas),
    ...(await areasDeAtuacao(prisma, p.exercicio, fim, base)),
    ...(await rpComLastro(prisma, p.exercicio, classeDaFonte, notas)),
    notas,
  };
}

/** O indicador do art. 27 — mínimo 15% em capital. */
function indicador(
  base: Money,
  despesa: DespesaFundeb,
  minimo: Money,
  notas: string[]
): IndicadorVaat {
  const aplicado = toMoney(despesa.acompanhamento);

  // ⚠️ BASE ZERO NÃO É 0%. Sem complementação-VAAT no exercício não há o que exigir —
  // exibir "0,00%" diria que o ente descumpriu um mínimo que não lhe foi imposto, e
  // dividir por zero é o bug que produz esse "0,00%".
  if (base.isZero()) {
    notas.push(
      "SEM-VAAT-NO-EXERCICIO: não houve complementação-VAAT — o mínimo de 15% em capital " +
        "(art. 27) não se aplica. A linha mostra o aplicado, não um percentual."
    );
    return {
      base: "0.00",
      aplicado: aplicado.toFixed(2),
      percentual: null,
      minimo: minimo.toFixed(2),
      atingiu: null,
      interruptor: "SEM-VAAT-NO-EXERCICIO",
    };
  }

  const percentual = toMoney(aplicado.times(100).div(base));
  return {
    base: base.toFixed(2),
    aplicado: aplicado.toFixed(2),
    percentual: percentual.toFixed(2),
    minimo: minimo.toFixed(2),
    atingiu: percentual.greaterThanOrEqualTo(minimo),
    interruptor: null,
  };
}

/** O indicador do art. 28 — a fatia em educação infantil, que depende do IEI. */
function indicadorInfantil(
  base: Money,
  despesa: DespesaFundeb,
  notas: string[]
): IndicadorVaat {
  const bruto = indicador(base, despesa, toMoney("0"), notas);

  // ⚠️ SEM IEI, NÃO SE COMPARA — ver `IEI_MUNICIPIO`. Os 50% do art. 28 são da
  // distribuição GLOBAL; a obrigação do município é o IEI dele.
  if (IEI_MUNICIPIO === null) {
    notas.push(
      "IEI-MUNICIPIO: o percentual do município em educação infantil é o seu IEI, publicado " +
        "até 31/12 pelo Executivo Federal (art. 28, § único, c/c art. 16, VII). Os 50% do " +
        "art. 28 são da distribuição GLOBAL da complementação — não são a obrigação do ente. " +
        "Sem o IEI publicado, a linha mostra o APURADO e não compara com nada."
    );
    return { ...bruto, minimo: null, atingiu: null, interruptor: "IEI-MUNICIPIO" };
  }

  const iei: Money = IEI_MUNICIPIO;
  return {
    ...bruto,
    minimo: iei.toFixed(2),
    atingiu: bruto.percentual === null ? null : toMoney(bruto.percentual).greaterThanOrEqualTo(iei),
  };
}

/** F3 — a despesa de educação por ÁREA, e o que nenhuma área identifica. */
async function areasDeAtuacao(
  prisma: Tx,
  exercicio: number,
  fim: Date,
  base: "liquidada" | "empenhada"
): Promise<{ areas: readonly AreaDeAtuacao[]; naoRateado: Cifra }> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio, funcao: { codigo: "12" } },
    select: { id: true, subfuncao: { select: { codigo: true } } },
  });

  const porSubfuncao = new Map<string, string[]>();
  for (const f of fichas) {
    const atual = porSubfuncao.get(f.subfuncao.codigo) ?? [];
    atual.push(f.id);
    porSubfuncao.set(f.subfuncao.codigo, atual);
  }

  const areas: AreaDeAtuacao[] = [];
  for (const a of AREAS) {
    const ids = porSubfuncao.get(a.subfuncao) ?? [];
    const d = await medirDespesa(prisma, ids, null, exercicio, fim, base, a.rotulo);
    areas.push({ chave: a.chave, subfuncao: a.subfuncao, rotulo: a.rotulo, despesa: d.acompanhamento });
  }

  // ⚠️ O QUE SOBRA: função 12 numa subfunção que não é área de ensino (a administração
  // da secretaria, tipicamente). A nota 6 admite ratear por MATRÍCULAS — e `MATRICULAS_
  // POR_AREA` está vazia. Então isto NÃO é dividido: fica numa coluna própria.
  const daArea = new Set(AREAS.map((a) => a.subfuncao));
  const idsSobra = fichas.filter((f) => !daArea.has(f.subfuncao.codigo)).map((f) => f.id);
  const sobra = await medirDespesa(prisma, idsSobra, null, exercicio, fim, base, "Não rateado");

  void MATRICULAS_POR_AREA; // o rateio nasce quando ela deixar de estar vazia

  return { areas, naoRateado: sobra.acompanhamento };
}

/**
 * F4 — OS RESTOS A PAGAR DA EDUCAÇÃO × O LASTRO DA CONTA VINCULADA.
 *
 * ═══ A REGRA ═══
 * O art. 25, §3º *in fine* manda que, ao fim do exercício, as disponibilidades —
 * **inclusive as destinadas à cobertura de restos a pagar** — permaneçam em conta
 * vinculada. A consequência é dura: inscrever RP de educação sem deixar o dinheiro na
 * conta é contar como aplicado um gasto que o ente não pode honrar. O mínimo teria sido
 * cumprido no papel e não no caixa.
 *
 * Aqui o confronto é por FONTE: o RP inscrito ((b)+(d) do Anexo 5) contra o caixa bruto
 * ((a)). O que excede é `semLastro` — e é glosa.
 *
 * ⚠️ POR FONTE, NUNCA PELO TOTAL: o dinheiro da educação é carimbado. Um superávit na
 * fonte livre não lastreia o RP do FUNDEB — é a mesma razão pela qual o Anexo 5 é por
 * vinculação.
 */
async function rpComLastro(
  prisma: Tx,
  exercicio: number,
  classeDaFonte: ReadonlyMap<string, string>,
  notas: string[]
): Promise<{ rpPorFonte: readonly RpDaFonte[]; rpSemLastroTotal: Cifra }> {
  const a5 = await rgfAnexo5(prisma, {
    exercicio,
    corte: janelaCivilDoAno(exercicio).fim,
  });

  const zero = toMoney("0.00");
  const rpPorFonte: RpDaFonte[] = [];
  let total = zero;

  for (const linha of a5.linhas) {
    const classe = classeDaFonte.get(linha.fonte);
    if (classe === undefined) continue; // não é fonte de educação

    const rp = toMoney(
      toMoney(linha.rpLiquidadosAnteriores).plus(toMoney(linha.rpNaoLiquidadosAnteriores))
    );
    const caixa = toMoney(linha.disponibilidadeBruta);
    const semLastro = rp.greaterThan(caixa) ? toMoney(rp.minus(caixa)) : zero;

    total = toMoney(total.plus(semLastro));
    rpPorFonte.push({
      fonte: linha.fonte,
      classe,
      restosAPagar: rp.toFixed(2),
      caixaBruto: caixa.toFixed(2),
      semLastro: semLastro.toFixed(2),
    });
  }

  if (total.greaterThan(0)) {
    notas.push(
      `RP SEM LASTRO: ${total.toFixed(2)} de restos a pagar da educação excedem o caixa da ` +
        `própria fonte. O art. 25, §3º manda as disponibilidades — inclusive as que cobrem ` +
        `RP — permanecerem em conta vinculada: o que não tem lastro não pode contar como ` +
        `aplicação do mínimo.`
    );
  }

  return { rpPorFonte, rpSemLastroTotal: total.toFixed(2) };
}

/** O último instante do bimestre — o mesmo corte do bloco 1. */
function fimDoBimestre(exercicio: number, bimestre: Bimestre): Date {
  return janelaCivilDeMeses(exercicio, (bimestre - 1) * 2 + 1, 2).fim;
}
