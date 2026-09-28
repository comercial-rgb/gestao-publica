import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  GRANDEZAS_DO_ALVO,
  MODELO_DO_ALVO,
  valorVigente,
  type AlvoDaAlteracao,
} from "./alteracao.js";

/**
 * M02b — O COMPARATIVO DA PEÇA E O VALOR VIGENTE (V18/C13).
 *
 * ═══ ⚠️ ESTE ARQUIVO É O DONO DA DERIVAÇÃO, E ISSO É A METADE MENOS ÓBVIA DE C13 ═══
 * Se o ajuste ficasse só na tela nova, o sistema passaria a ter DUAS VERDADES sobre a mesma
 * meta: o comparativo mostrando a alterada e o Anexo de Metas Fiscais em PDF imprimindo a
 * original. Havia dois leitores da `MetaAnualLdo` quando esta unidade começou —
 * `lib/portas/anexos-ldo.ts` (o anexo) e `metaFiscalDoExercicio` (a meta que o **RREO Anexo
 * 6** confronta com o resultado apurado) — e os dois passam por `metasAnuaisVigentes`.
 *
 * Com zero atos o número é IDÊNTICO ao de antes, e é essa igualdade que a suíte existente
 * prova: nenhuma expectativa dos testes dos anexos mudou. Deixar o RREO 6 confrontando uma
 * meta que a lei já alterou seria publicar cumprimento de meta revogada.
 *
 * ⚠️ NENHUM TOTAL QUE SOME COISAS DIFERENTES. Não há "total do comparativo" nem "total do
 * ato": um ato que mexe na previsão de receita e na dívida consolidada não tem soma — somar
 * receita com estoque de dívida produziria um número que nenhum demonstrativo reconhece. O
 * total existe POR GRANDEZA, que é o único agrupamento em que as parcelas são da mesma coisa.
 * É a mesma doutrina que já governa os anexos da LDO ("prioridades: sem total — meta física de
 * unidades diferentes não soma").
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

export type PecaDoPlanejamento = "PPA" | "LDO";

/** Um ajuste, com o ato que o trouxe. */
export interface AjusteDoComparativo {
  readonly atoId: string;
  readonly numeroDoAto: string;
  readonly anoDoAto: number;
  readonly data: Date;
  readonly dataPublicacao: Date;
  readonly fundamento: string;
  readonly valorAjuste: Money;
  readonly justificativa: string | null;
  readonly criadoPor: string;
}

/** Uma linha planejada que foi alterada: o original, a soma e o vigente. */
export interface LinhaDoComparativo {
  readonly alvo: AlvoDaAlteracao;
  readonly alvoId: string;
  /** Como a linha se chama na peça — natureza e fonte, código do programa, ano da meta. */
  readonly rotulo: string;
  readonly grandeza: string;
  /** A grandeza em português, para a tela. */
  readonly rotuloDaGrandeza: string;
  readonly original: Money;
  readonly ajuste: Money;
  readonly atual: Money;
  readonly ajustes: readonly AjusteDoComparativo[];
}

/** O total de uma grandeza — o único agrupamento que soma parcelas da mesma coisa. */
export interface TotalDaGrandeza {
  readonly alvo: AlvoDaAlteracao;
  readonly grandeza: string;
  readonly rotuloDaGrandeza: string;
  readonly linhas: number;
  readonly original: Money;
  readonly ajuste: Money;
  readonly atual: Money;
}

/** Um ato, na ordem cronológica — sem total em dinheiro, ver o docblock do arquivo. */
export interface AtoDoComparativo {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly dataPublicacao: Date;
  readonly fundamento: string;
  readonly itens: number;
  readonly criadoPor: string;
}

export interface ComparativoDaPeca {
  readonly peca: PecaDoPlanejamento;
  readonly pecaId: string;
  readonly rotuloDaPeca: string;
  /** O corte: o comparativo mostra o estado da peça ATÉ esta data. `null` = tudo. */
  readonly ate: Date | null;
  readonly atos: readonly AtoDoComparativo[];
  readonly linhas: readonly LinhaDoComparativo[];
  readonly totais: readonly TotalDaGrandeza[];
}

/**
 * O NOME DE CADA GRANDEZA EM PORTUGUÊS.
 *
 * ⚠️ O rol de chaves é o mesmo de `GRANDEZAS_DO_ALVO`, e um teste confere que nenhuma grandeza
 * ficou sem rótulo: sem ele, a tela mostraria o nome da coluna do banco ("dividaConsolidadaLiquida")
 * a um servidor municipal.
 */
export const ROTULO_DA_GRANDEZA: Readonly<Record<string, string>> = {
  valor: "Previsão de receita",
  valorPrevisto: "Valor previsto do programa",
  metaFinanceira: "Meta financeira da ação",
  receitaTotal: "Receita total",
  receitaPrimaria: "Receita primária",
  despesaTotal: "Despesa total",
  despesaPrimaria: "Despesa primária",
  resultadoNominal: "Resultado nominal",
  dividaPublicaConsolidada: "Dívida pública consolidada",
  dividaConsolidadaLiquida: "Dívida consolidada líquida",
  receitaPrimariaPpp: "Receita primária de parcerias",
  despesaPrimariaPpp: "Despesa primária de parcerias",
  impactoSaldoPpp: "Impacto no saldo das parcerias",
};

function rotuloDaGrandeza(g: string): string {
  return ROTULO_DA_GRANDEZA[g] ?? g;
}

/** Qual coluna de ligação está preenchida — o alvo da linha gravada. */
function alvoDoItem(item: {
  readonly previsaoReceitaPpaId: string | null;
  readonly programaPpaId: string | null;
  readonly acaoPpaId: string | null;
  readonly metaAnualLdoId: string | null;
}): { readonly alvo: AlvoDaAlteracao; readonly alvoId: string } | null {
  if (item.previsaoReceitaPpaId !== null)
    return { alvo: "PREVISAO_RECEITA_PPA", alvoId: item.previsaoReceitaPpaId };
  if (item.programaPpaId !== null) return { alvo: "PROGRAMA_PPA", alvoId: item.programaPpaId };
  if (item.acaoPpaId !== null) return { alvo: "ACAO_PPA", alvoId: item.acaoPpaId };
  if (item.metaAnualLdoId !== null)
    return { alvo: "META_ANUAL_LDO", alvoId: item.metaAnualLdoId };
  // ⚠️ Inalcançável pelo CHECK `ck_alteracao_valor_alvo_e_grandeza`, que exige exatamente um.
  // O `null` existe para não inventar um alvo se alguém desligar a constraint no banco.
  return null;
}

/** Os valores ORIGINAIS das linhas tocadas, e o rótulo de cada uma. */
async function originaisDasLinhas(
  tx: Tx,
  alvo: AlvoDaAlteracao,
  ids: readonly string[]
): Promise<ReadonlyMap<string, { readonly rotulo: string; readonly valores: Record<string, Money> }>> {
  const saida = new Map<string, { rotulo: string; valores: Record<string, Money> }>();
  if (ids.length === 0) return saida;

  switch (alvo) {
    case "PREVISAO_RECEITA_PPA": {
      const linhas = await tx.previsaoReceitaPpa.findMany({
        where: { id: { in: [...ids] } },
        select: {
          id: true,
          ano: true,
          valor: true,
          naturezaReceita: { select: { codigo: true } },
          fonte: { select: { codigo: true } },
        },
      });
      for (const l of linhas) {
        saida.set(l.id, {
          rotulo: `${l.naturezaReceita.codigo} · fonte ${l.fonte.codigo} · ${l.ano}`,
          valores: { valor: toMoney(l.valor.toFixed(2)) },
        });
      }
      return saida;
    }
    case "PROGRAMA_PPA": {
      const linhas = await tx.programaPpa.findMany({
        where: { id: { in: [...ids] } },
        select: {
          id: true,
          valorPrevisto: true,
          programa: { select: { codigo: true, descricao: true } },
        },
      });
      for (const l of linhas) {
        saida.set(l.id, {
          rotulo: `${l.programa.codigo} · ${l.programa.descricao}`,
          valores: { valorPrevisto: toMoney(l.valorPrevisto.toFixed(2)) },
        });
      }
      return saida;
    }
    case "ACAO_PPA": {
      const linhas = await tx.acaoPpa.findMany({
        where: { id: { in: [...ids] } },
        select: {
          id: true,
          metaFinanceira: true,
          acao: { select: { codigo: true, descricao: true } },
        },
      });
      for (const l of linhas) {
        saida.set(l.id, {
          rotulo: `${l.acao.codigo} · ${l.acao.descricao}`,
          valores: { metaFinanceira: toMoney(l.metaFinanceira.toFixed(2)) },
        });
      }
      return saida;
    }
    case "META_ANUAL_LDO": {
      const linhas = await tx.metaAnualLdo.findMany({ where: { id: { in: [...ids] } } });
      for (const l of linhas) {
        const valores: Record<string, Money> = {};
        for (const g of GRANDEZAS_DO_ALVO.META_ANUAL_LDO) {
          const bruto = (l as unknown as Record<string, { toFixed: (n: number) => string }>)[g];
          valores[g] = toMoney(bruto!.toFixed(2));
        }
        saida.set(l.id, { rotulo: `metas fiscais de ${l.ano}`, valores });
      }
      return saida;
    }
  }
}

/**
 * O COMPARATIVO DA PEÇA — original, atos e valores alterados, com corte por data.
 *
 * ⚠️ SÓ AS LINHAS QUE ALGUM ATO TOCOU. A peça inteira já tem suas telas; o comparativo
 * responde "o que mudou desde a aprovação", e uma lista com as 400 linhas intactas ao lado
 * das 3 alteradas esconderia exatamente o que ela existe para mostrar.
 *
 * ⚠️ O CORTE É O QUE FAZ "RELATÓRIO POR VERSÃO" (TR 5.9.1.18 / 5.9.2.10 / 5.9.1.30 /
 * 5.9.2.18): a versão da peça é o estado dela até uma data. Ele compara pela DATA DO ATO, não
 * pela de publicação, porque é a data do ato que a lei atribui ao efeito.
 */
export async function comparativoDaPeca(
  tx: Tx,
  filtro: {
    readonly peca: PecaDoPlanejamento;
    readonly pecaId: string;
    readonly ate?: Date | null;
  }
): Promise<ComparativoDaPeca> {
  const ate = filtro.ate ?? null;

  const rotuloDaPeca = await (async (): Promise<string> => {
    if (filtro.peca === "PPA") {
      const p = await tx.planoPlurianual.findUnique({
        where: { id: filtro.pecaId },
        select: { anoInicio: true, anoFim: true, leiRef: true },
      });
      if (p === null) throw new Error(`Plano plurianual ${filtro.pecaId} não existe.`);
      return `PPA ${p.anoInicio}-${p.anoFim} (${p.leiRef})`;
    }
    const l = await tx.leiDiretrizesOrcamentarias.findUnique({
      where: { id: filtro.pecaId },
      select: { exercicio: true },
    });
    if (l === null) throw new Error(`LDO ${filtro.pecaId} não existe.`);
    return `LDO ${l.exercicio}`;
  })();

  const atos = await tx.atoDeAlteracaoDoPlanejamento.findMany({
    where: {
      ...(filtro.peca === "PPA" ? { planoId: filtro.pecaId } : { ldoId: filtro.pecaId }),
      ...(ate === null ? {} : { data: { lte: ate } }),
    },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    include: { itens: { orderBy: { criadoEm: "asc" } } },
  });

  // ── agrupa os itens por (alvo, alvoId, grandeza) ──
  const porLinha = new Map<
    string,
    {
      alvo: AlvoDaAlteracao;
      alvoId: string;
      grandeza: string;
      ajustes: AjusteDoComparativo[];
    }
  >();
  for (const ato of atos) {
    for (const item of ato.itens) {
      const a = alvoDoItem(item);
      if (a === null) continue;
      const chave = `${a.alvo}::${a.alvoId}::${item.grandeza}`;
      const atual =
        porLinha.get(chave) ??
        { alvo: a.alvo, alvoId: a.alvoId, grandeza: item.grandeza, ajustes: [] };
      atual.ajustes.push({
        atoId: ato.id,
        numeroDoAto: ato.numero,
        anoDoAto: ato.ano,
        data: ato.data,
        dataPublicacao: ato.dataPublicacao,
        fundamento: ato.fundamento,
        valorAjuste: toMoney(item.valorAjuste.toFixed(2)),
        justificativa: item.justificativa,
        criadoPor: item.criadoPor,
      });
      porLinha.set(chave, atual);
    }
  }

  // ── lê os originais, um findMany por alvo ──
  const idsPorAlvo = new Map<AlvoDaAlteracao, Set<string>>();
  for (const l of porLinha.values()) {
    const s = idsPorAlvo.get(l.alvo) ?? new Set<string>();
    s.add(l.alvoId);
    idsPorAlvo.set(l.alvo, s);
  }
  const originais = new Map<
    AlvoDaAlteracao,
    ReadonlyMap<string, { readonly rotulo: string; readonly valores: Record<string, Money> }>
  >();
  for (const [alvo, ids] of idsPorAlvo) {
    originais.set(alvo, await originaisDasLinhas(tx, alvo, [...ids]));
  }

  const linhas: LinhaDoComparativo[] = [];
  for (const l of porLinha.values()) {
    const daLinha = originais.get(l.alvo)?.get(l.alvoId);
    if (daLinha === undefined) continue;
    const original = daLinha.valores[l.grandeza] ?? toMoney("0.00");
    const ajuste = l.ajustes.reduce((acc, a) => toMoney(acc.plus(a.valorAjuste)), toMoney("0.00"));
    linhas.push({
      alvo: l.alvo,
      alvoId: l.alvoId,
      rotulo: daLinha.rotulo,
      grandeza: l.grandeza,
      rotuloDaGrandeza: rotuloDaGrandeza(l.grandeza),
      original,
      ajuste,
      atual: valorVigente(original, l.ajustes.map((a) => a.valorAjuste)),
      ajustes: l.ajustes,
    });
  }
  linhas.sort(
    (a, b) =>
      a.alvo.localeCompare(b.alvo) ||
      a.grandeza.localeCompare(b.grandeza) ||
      a.rotulo.localeCompare(b.rotulo)
  );

  const totais = new Map<string, TotalDaGrandeza>();
  for (const l of linhas) {
    const chave = `${l.alvo}::${l.grandeza}`;
    const t = totais.get(chave);
    totais.set(chave, {
      alvo: l.alvo,
      grandeza: l.grandeza,
      rotuloDaGrandeza: l.rotuloDaGrandeza,
      linhas: (t?.linhas ?? 0) + 1,
      original: toMoney((t?.original ?? toMoney("0.00")).plus(l.original)),
      ajuste: toMoney((t?.ajuste ?? toMoney("0.00")).plus(l.ajuste)),
      atual: toMoney((t?.atual ?? toMoney("0.00")).plus(l.atual)),
    });
  }

  return {
    peca: filtro.peca,
    pecaId: filtro.pecaId,
    rotuloDaPeca,
    ate,
    atos: atos.map((a) => ({
      id: a.id,
      numero: a.numero,
      ano: a.ano,
      data: a.data,
      dataPublicacao: a.dataPublicacao,
      fundamento: a.fundamento,
      itens: a.itens.length,
      criadoPor: a.criadoPor,
    })),
    linhas,
    totais: [...totais.values()].sort(
      (a, b) => a.alvo.localeCompare(b.alvo) || a.grandeza.localeCompare(b.grandeza)
    ),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// O VALOR VIGENTE DA META ANUAL — o dono da derivação para os leitores existentes
// ═══════════════════════════════════════════════════════════════════════════

export interface ValoresDaMetaAnual {
  readonly receitaTotal: Money;
  readonly receitaPrimaria: Money;
  readonly despesaTotal: Money;
  readonly despesaPrimaria: Money;
  readonly resultadoNominal: Money;
  readonly dividaPublicaConsolidada: Money;
  readonly dividaConsolidadaLiquida: Money;
  readonly receitaPrimariaPpp: Money;
  readonly despesaPrimariaPpp: Money;
  readonly impactoSaldoPpp: Money;
}

export interface MetaAnualVigente {
  readonly id: string;
  readonly ldoId: string;
  readonly ldoExercicio: number;
  readonly ano: number;
  readonly original: ValoresDaMetaAnual;
  readonly vigente: ValoresDaMetaAnual;
  /** Quantos ajustes (itens de ato) alcançaram esta linha até o corte. Zero = intacta. */
  readonly ajustes: number;
}

function valoresDe(bruto: Readonly<Record<string, Money>>): ValoresDaMetaAnual {
  const v = (g: string): Money => bruto[g] ?? toMoney("0.00");
  return {
    receitaTotal: v("receitaTotal"),
    receitaPrimaria: v("receitaPrimaria"),
    despesaTotal: v("despesaTotal"),
    despesaPrimaria: v("despesaPrimaria"),
    resultadoNominal: v("resultadoNominal"),
    dividaPublicaConsolidada: v("dividaPublicaConsolidada"),
    dividaConsolidadaLiquida: v("dividaConsolidadaLiquida"),
    receitaPrimariaPpp: v("receitaPrimariaPpp"),
    despesaPrimariaPpp: v("despesaPrimariaPpp"),
    impactoSaldoPpp: v("impactoSaldoPpp"),
  };
}

/**
 * AS METAS ANUAIS COM AS ALTERAÇÕES JÁ APLICADAS — o ÚNICO lugar onde essa soma acontece.
 *
 * ⚠️ TODO LEITOR DA `MetaAnualLdo` PASSA POR AQUI. São dois hoje (o Anexo de Metas Fiscais em
 * PDF e a meta que o RREO Anexo 6 confronta), e um terceiro que somasse por conta própria
 * criaria a terceira verdade. A doutrina do repositório é a do M12: "a identidade tem um dono;
 * o diagnóstico visita, não reimplementa".
 *
 * ⚠️ COM ZERO ATOS, `vigente` É IGUAL A `original` — por construção, não por coincidência: a
 * soma de uma lista vazia é o próprio original. É isso que deixa esta função entrar debaixo de
 * relatório já publicado sem mudar nenhum número que já existia.
 */
export async function metasAnuaisVigentes(
  tx: Tx,
  filtro: {
    readonly ldoId?: string;
    readonly ano?: number;
    readonly ate?: Date | null;
  }
): Promise<readonly MetaAnualVigente[]> {
  const linhas = await tx.metaAnualLdo.findMany({
    where: {
      ...(filtro.ldoId === undefined ? {} : { ldoId: filtro.ldoId }),
      ...(filtro.ano === undefined ? {} : { ano: filtro.ano }),
    },
    orderBy: { ano: "asc" },
    include: { ldo: { select: { exercicio: true } } },
  });
  if (linhas.length === 0) return [];

  const ate = filtro.ate ?? null;
  const itens = await tx.alteracaoDeValorPlanejado.findMany({
    where: {
      metaAnualLdoId: { in: linhas.map((l) => l.id) },
      ...(ate === null ? {} : { ato: { data: { lte: ate } } }),
    },
    select: { metaAnualLdoId: true, grandeza: true, valorAjuste: true },
  });

  return linhas.map((l) => {
    const original: Record<string, Money> = {};
    for (const g of GRANDEZAS_DO_ALVO.META_ANUAL_LDO) {
      const bruto = (l as unknown as Record<string, { toFixed: (n: number) => string }>)[g];
      original[g] = toMoney(bruto!.toFixed(2));
    }
    const meus = itens.filter((i) => i.metaAnualLdoId === l.id);
    const vigente: Record<string, Money> = {};
    for (const g of GRANDEZAS_DO_ALVO.META_ANUAL_LDO) {
      vigente[g] = valorVigente(
        original[g]!,
        meus.filter((i) => i.grandeza === g).map((i) => toMoney(i.valorAjuste.toFixed(2)))
      );
    }
    return {
      id: l.id,
      ldoId: l.ldoId,
      ldoExercicio: l.ldo.exercicio,
      ano: l.ano,
      original: valoresDe(original),
      vigente: valoresDe(vigente),
      ajustes: meus.length,
    };
  });
}

/** Os atos de uma peça, em ordem cronológica — a consulta do histórico, com corte por data. */
export async function atosDaPeca(
  tx: Tx,
  filtro: {
    readonly peca: PecaDoPlanejamento;
    readonly pecaId: string;
    readonly ate?: Date | null;
  }
): Promise<readonly AtoDoComparativo[]> {
  const ate = filtro.ate ?? null;
  const atos = await tx.atoDeAlteracaoDoPlanejamento.findMany({
    where: {
      ...(filtro.peca === "PPA" ? { planoId: filtro.pecaId } : { ldoId: filtro.pecaId }),
      ...(ate === null ? {} : { data: { lte: ate } }),
    },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true,
      numero: true,
      ano: true,
      data: true,
      dataPublicacao: true,
      fundamento: true,
      criadoPor: true,
      _count: { select: { itens: true } },
    },
  });
  return atos.map((a) => ({
    id: a.id,
    numero: a.numero,
    ano: a.ano,
    data: a.data,
    dataPublicacao: a.dataPublicacao,
    fundamento: a.fundamento,
    itens: a._count.itens,
    criadoPor: a.criadoPor,
  }));
}

/** Uma linha que um ato PODE alterar, como o formulário precisa listá-la. */
export interface LinhaAlteravel {
  readonly alvo: AlvoDaAlteracao;
  readonly alvoId: string;
  readonly rotulo: string;
  readonly grandezas: readonly { readonly grandeza: string; readonly rotulo: string }[];
}

/**
 * AS LINHAS ALTERÁVEIS DE UMA PEÇA — o recorte que o formulário oferece.
 *
 * ⚠️ RECORTADO PELA PEÇA, e não "todas as previsões de receita do sistema". A regra da casa é
 * explícita: um `select` com 500 itens ordenados por código é um formulário bonito e inútil, e
 * o recorte é declarado por quem monta a tela. Aqui ele é o único recorte que faz sentido —
 * um ato só altera a peça que ele nomeia, então oferecer linha de outra peça seria oferecer o
 * que o serviço vai recusar.
 */
export async function linhasAlteraveisDaPeca(
  tx: Tx,
  filtro: { readonly peca: PecaDoPlanejamento; readonly pecaId: string }
): Promise<readonly LinhaAlteravel[]> {
  const grandezasDe = (alvo: AlvoDaAlteracao): readonly { grandeza: string; rotulo: string }[] =>
    GRANDEZAS_DO_ALVO[alvo].map((g) => ({ grandeza: g, rotulo: rotuloDaGrandeza(g) }));

  if (filtro.peca === "LDO") {
    const metas = await tx.metaAnualLdo.findMany({
      where: { ldoId: filtro.pecaId },
      orderBy: { ano: "asc" },
      select: { id: true, ano: true },
    });
    return metas.map((m) => ({
      alvo: "META_ANUAL_LDO" as const,
      alvoId: m.id,
      rotulo: `metas fiscais de ${m.ano}`,
      grandezas: grandezasDe("META_ANUAL_LDO"),
    }));
  }

  const [previsoes, programas, acoes] = await Promise.all([
    tx.previsaoReceitaPpa.findMany({
      where: { planoId: filtro.pecaId },
      orderBy: [{ ano: "asc" }],
      select: {
        id: true,
        ano: true,
        naturezaReceita: { select: { codigo: true } },
        fonte: { select: { codigo: true } },
      },
    }),
    tx.programaPpa.findMany({
      where: { planoId: filtro.pecaId },
      select: { id: true, programa: { select: { codigo: true, descricao: true } } },
    }),
    tx.acaoPpa.findMany({
      where: { programaPpa: { planoId: filtro.pecaId } },
      select: { id: true, acao: { select: { codigo: true, descricao: true } } },
    }),
  ]);

  return [
    ...previsoes.map((p) => ({
      alvo: "PREVISAO_RECEITA_PPA" as const,
      alvoId: p.id,
      rotulo: `${p.naturezaReceita.codigo} · fonte ${p.fonte.codigo} · ${p.ano}`,
      grandezas: grandezasDe("PREVISAO_RECEITA_PPA"),
    })),
    ...programas.map((p) => ({
      alvo: "PROGRAMA_PPA" as const,
      alvoId: p.id,
      rotulo: `${p.programa.codigo} · ${p.programa.descricao}`,
      grandezas: grandezasDe("PROGRAMA_PPA"),
    })),
    ...acoes.map((a) => ({
      alvo: "ACAO_PPA" as const,
      alvoId: a.id,
      rotulo: `${a.acao.codigo} · ${a.acao.descricao}`,
      grandezas: grandezasDe("ACAO_PPA"),
    })),
  ];
}
