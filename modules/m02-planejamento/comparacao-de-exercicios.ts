import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { SINAL_PREVISAO } from "./dominio.js";
import { basesDasFichas, basesDasReceitas } from "./proposta-orcamentaria.js";

/**
 * A COMPARAÇÃO DE EXERCÍCIOS (V31, M02) — dois orçamentos lado a lado, agrupados como o contador
 * pergunta: por unidade, função, programa, ação, natureza ou fonte; a receita por natureza ou fonte.
 *
 * ⚠️ OS VALORES SÃO OS MESMOS DA PROPOSTA ORÇAMENTÁRIA, POR CONSTRUÇÃO: a dotação autorizada e a
 * empenhada vêm de `basesDasFichas` (Σ dos movimentos de dotação, pela aritmética do M05 — não das
 * colunas de cache), e a previsão atualizada de `basesDasReceitas` (previsão + reprevisões do mesmo
 * grão). Uma segunda soma aqui seria a segunda verdade sobre "quanto 2026 autorizou", e a tela de
 * comparação discordaria da proposta que diz ter partido desse número.
 *
 * ⚠️ A RECEITA É LÍQUIDA: a dedução entra com o sinal de `SINAL_PREVISAO`, como nos relatórios.
 * ⚠️ SÓ LEITURA. Comparar não copia fato, não transporta saldo e não cria nada no exercício novo.
 */

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type AgrupamentoDaDespesa = "unidade" | "funcao" | "programa" | "acao" | "natureza" | "fonte";
export type AgrupamentoDaReceita = "natureza" | "fonte";

export const ROTULO_AGRUPAMENTO_DESPESA: Readonly<Record<AgrupamentoDaDespesa, string>> = {
  unidade: "Unidade orçamentária",
  funcao: "Função",
  programa: "Programa",
  acao: "Ação",
  natureza: "Natureza da despesa",
  fonte: "Fonte de recurso",
};
export const ROTULO_AGRUPAMENTO_RECEITA: Readonly<Record<AgrupamentoDaReceita, string>> = {
  natureza: "Natureza da receita",
  fonte: "Fonte de recurso",
};

/** Os valores de um lado da comparação, numa linha. */
export interface ValoresDoExercicio {
  /** Despesa: dotação inicial; receita: previsão inicial. */
  readonly inicial: string;
  /** Despesa: dotação autorizada; receita: previsão atualizada. */
  readonly atualizado: string;
  /** Despesa: empenhado. Receita: não se aplica (null). */
  readonly executado: string | null;
}

export interface LinhaDaComparacao {
  readonly chave: string;
  readonly rotulo: string;
  readonly a: ValoresDoExercicio;
  readonly b: ValoresDoExercicio;
  /** b.atualizado − a.atualizado. */
  readonly diferenca: string;
  /** A variação percentual sobre a.atualizado, uma casa; null quando a.atualizado é zero. */
  readonly variacao: string | null;
}

export interface ComparacaoDeExercicios {
  readonly exercicioA: number;
  readonly exercicioB: number;
  readonly lado: "despesa" | "receita";
  readonly agrupamento: string;
  readonly linhas: readonly LinhaDaComparacao[];
  readonly total: LinhaDaComparacao;
}

/** Uma linha de origem já classificada — a entrada da agregação pura. */
export interface ItemComparavel {
  readonly chave: string;
  readonly rotulo: string;
  readonly inicial: Money;
  readonly atualizado: Money;
  readonly executado: Money | null;
}

const ZERO = (): Money => toMoney("0");

function somar(itens: readonly ItemComparavel[]): Map<string, ItemComparavel> {
  const m = new Map<string, ItemComparavel>();
  for (const i of itens) {
    const x = m.get(i.chave);
    m.set(
      i.chave,
      x === undefined
        ? i
        : {
            chave: i.chave,
            rotulo: x.rotulo,
            inicial: toMoney(x.inicial.plus(i.inicial)),
            atualizado: toMoney(x.atualizado.plus(i.atualizado)),
            executado: x.executado === null || i.executado === null ? null : toMoney(x.executado.plus(i.executado)),
          }
    );
  }
  return m;
}

function valores(i: ItemComparavel | undefined, comExecucao: boolean): ValoresDoExercicio {
  return {
    inicial: (i?.inicial ?? ZERO()).toFixed(2),
    atualizado: (i?.atualizado ?? ZERO()).toFixed(2),
    executado: comExecucao ? (i?.executado ?? ZERO()).toFixed(2) : null,
  };
}

function linha(chave: string, rotulo: string, a: ValoresDoExercicio, b: ValoresDoExercicio): LinhaDaComparacao {
  const va = toMoney(a.atualizado);
  const vb = toMoney(b.atualizado);
  return {
    chave,
    rotulo,
    a,
    b,
    diferenca: vb.minus(va).toFixed(2),
    variacao: va.isZero() ? null : vb.dividedBy(va).minus(1).times(100).toDecimalPlaces(1).toFixed(1),
  };
}

/**
 * A AGREGAÇÃO — PURA. A linha que só existe de um lado aparece com zero do outro (nunca some): é
 * justamente a ação nova ou a extinta que o contador procura numa comparação.
 */
export function compararItens(
  itensA: readonly ItemComparavel[],
  itensB: readonly ItemComparavel[],
  comExecucao: boolean
): { readonly linhas: readonly LinhaDaComparacao[]; readonly total: LinhaDaComparacao } {
  const ma = somar(itensA);
  const mb = somar(itensB);
  const chaves = [...new Set([...ma.keys(), ...mb.keys()])].sort((x, y) => x.localeCompare(y));
  const linhas = chaves.map((k) => linha(k, (mb.get(k) ?? ma.get(k))!.rotulo, valores(ma.get(k), comExecucao), valores(mb.get(k), comExecucao)));
  const tot = (xs: readonly ItemComparavel[]): ItemComparavel => ({
    chave: "",
    rotulo: "",
    inicial: xs.reduce((s, i) => toMoney(s.plus(i.inicial)), ZERO()),
    atualizado: xs.reduce((s, i) => toMoney(s.plus(i.atualizado)), ZERO()),
    executado: comExecucao ? xs.reduce((s, i) => toMoney(s.plus(i.executado ?? ZERO())), ZERO()) : null,
  });
  return { linhas, total: linha("TOTAL", "Total", valores(tot(itensA), comExecucao), valores(tot(itensB), comExecucao)) };
}

/** As fichas de um exercício classificadas pelo agrupamento pedido, com inicial, autorizado e empenhado. */
export async function itensDaDespesa(tx: Tx, exercicio: number, por: AgrupamentoDaDespesa): Promise<readonly ItemComparavel[]> {
  const [autorizado, empenhado, fichas] = await Promise.all([
    basesDasFichas(tx, exercicio, "DOTACAO_AUTORIZADA", true),
    basesDasFichas(tx, exercicio, "EMPENHADO", true),
    tx.fichaOrcamentaria.findMany({
      where: { exercicio },
      select: {
        id: true,
        unidadeOrc: { select: { codigo: true, descricao: true } },
        funcao: { select: { codigo: true, nome: true } },
        programa: { select: { codigo: true, descricao: true } },
        acao: { select: { codigo: true, descricao: true } },
        naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
        fonte: { select: { codigo: true, descricao: true } },
      },
    }),
  ]);
  const aut = new Map(autorizado.fichas.map((f) => [f.fichaId, f]));
  const emp = new Map(empenhado.fichas.map((f) => [f.fichaId, f.valor]));
  return fichas.map((f) => {
    const [chave, rotulo] =
      por === "unidade" ? [f.unidadeOrc.codigo, f.unidadeOrc.descricao]
      : por === "funcao" ? [f.funcao.codigo, f.funcao.nome]
      : por === "programa" ? [f.programa.codigo, f.programa.descricao]
      : por === "acao" ? [f.acao.codigo, f.acao.descricao]
      : por === "natureza" ? [f.naturezaDespesa.codigoCompleto, f.naturezaDespesa.descricao]
      : [f.fonte.codigo, f.fonte.descricao];
    const a = aut.get(f.id);
    return {
      chave,
      rotulo,
      inicial: a?.valorNaLei ?? ZERO(),
      atualizado: a?.valor ?? ZERO(),
      executado: emp.get(f.id) ?? ZERO(),
    };
  });
}

/** As previsões de um exercício, líquidas das deduções, com inicial e atualizada. */
export async function itensDaReceita(tx: Tx, exercicio: number, por: AgrupamentoDaReceita): Promise<readonly ItemComparavel[]> {
  const [bases, receitas] = await Promise.all([
    basesDasReceitas(tx, exercicio, "PREVISAO_ATUALIZADA"),
    tx.receitaPrevista.findMany({
      where: { exercicio },
      select: {
        id: true,
        tipoReceita: true,
        naturezaReceita: { select: { codigo: true, descricao: true } },
        fonte: { select: { codigo: true, descricao: true } },
      },
    }),
  ]);
  const porId = new Map(bases.map((b) => [b.receitaId, b]));
  return receitas.map((r) => {
    const b = porId.get(r.id);
    const sinal = SINAL_PREVISAO[r.tipoReceita];
    const comSinal = (v: Money | undefined): Money => toMoney((v ?? ZERO()).times(sinal));
    const [chave, rotulo] = por === "natureza" ? [r.naturezaReceita.codigo, r.naturezaReceita.descricao] : [r.fonte.codigo, r.fonte.descricao];
    return { chave, rotulo, inicial: comSinal(b?.valorNaLei), atualizado: comSinal(b?.valor), executado: null };
  });
}

export async function compararExercicios(
  tx: Tx,
  pedido: {
    readonly exercicioA: number;
    readonly exercicioB: number;
    readonly lado: "despesa" | "receita";
    readonly agrupamento: AgrupamentoDaDespesa | AgrupamentoDaReceita;
  }
): Promise<ComparacaoDeExercicios> {
  const { exercicioA, exercicioB, lado } = pedido;
  if (lado === "despesa") {
    const por = pedido.agrupamento as AgrupamentoDaDespesa;
    const [a, b] = await Promise.all([itensDaDespesa(tx, exercicioA, por), itensDaDespesa(tx, exercicioB, por)]);
    return { exercicioA, exercicioB, lado, agrupamento: ROTULO_AGRUPAMENTO_DESPESA[por], ...compararItens(a, b, true) };
  }
  const por = pedido.agrupamento as AgrupamentoDaReceita;
  const [a, b] = await Promise.all([itensDaReceita(tx, exercicioA, por), itensDaReceita(tx, exercicioB, por)]);
  return { exercicioA, exercicioB, lado, agrupamento: ROTULO_AGRUPAMENTO_RECEITA[por], ...compararItens(a, b, false) };
}
