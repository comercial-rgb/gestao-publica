import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { metasAnuaisVigentes } from "../m02b-plurianual/comparativo.js";
import { valorVigente } from "../m02b-plurianual/alteracao.js";
import { SINAL_PREVISAO } from "./dominio.js";
import type { PropostaDetalhada } from "./proposta-orcamentaria.js";

/**
 * A CONFERÊNCIA DA PROPOSTA ANTES DA VOTAÇÃO (V31, M02) — o "checkup" que o contador roda antes de
 * mandar o projeto ao Legislativo e antes de gerar as fichas.
 *
 * ⚠️ ELA SÓ CONFRONTA FATOS GRAVADOS, e cada verificação diz de onde vem a exigência:
 *   · equilíbrio entre a receita LÍQUIDA (deduções com o sinal de `SINAL_PREVISAO`, o mesmo dos
 *     relatórios) e a despesa fixada;
 *   · a despesa de cada FONTE contra a receita da mesma fonte — a vinculação do recurso (LRF art. 8º,
 *     parágrafo único): fonte com mais despesa que receita é dotação sem lastro;
 *   · linhas negativas (a geração das fichas as RECUSA) e zeradas (não viram ficha);
 *   · as metas anuais de receita e despesa da LDO do mesmo exercício, no valor VIGENTE (com os atos
 *     de alteração — `metasAnuaisVigentes`, o dono dessa soma), e as ações prioritárias da LDO;
 *   · as ações da proposta contra o PPA que cobre o exercício;
 *   · deduções do exercício de destino ainda sem o tipo exigido na prestação de contas.
 *
 * ⚠️ NENHUMA REGRA MUNICIPAL INVENTADA. Não há percentual de reserva de contingência, teto de
 * suplementação nem limite por órgão aqui: esses números são da LDO e da lei de cada ente, e o
 * sistema não os tem como parâmetro. Pendência vazia é melhor que limite inventado.
 *
 * ⚠️ A CONFERÊNCIA NÃO TRAVA NADA. A geração das fichas continua com as próprias guardas (linha
 * negativa, destino já orçado, autorização por unidade). O que é "impede" aqui é exatamente o que a
 * geração recusaria — dito antes, com o motivo — e não uma segunda regra.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type SituacaoDaVerificacao = "CONFORME" | "ATENCAO" | "IMPEDE";

export interface VerificacaoDaProposta {
  readonly codigo: string;
  readonly titulo: string;
  readonly situacao: SituacaoDaVerificacao;
  /** Uma frase com o achado (ou com o que foi conferido, quando conforme). */
  readonly resumo: string;
  /** As linhas que motivaram o achado, já em texto do contador. */
  readonly itens: readonly string[];
  /** Onde se corrige, quando a correção mora noutra tela. */
  readonly ondeCorrigir?: { readonly href: string; readonly rotulo: string };
}

/** Uma ação do PPA confrontada com as fichas — "por que essa ação difere das fichas". */
export interface AcaoDoPpaNasFichas {
  readonly programaCodigo: string;
  readonly acaoCodigo: string;
  readonly acaoDescricao: string;
  /** A meta financeira do PLANO INTEIRO (quadrienal), no valor vigente. */
  readonly metaDoPlano: string;
  /** Alterações do PPA que mexeram nesta meta. */
  readonly alteracoesDaMeta: number;
  /** A dotação atualizada das fichas desta ação em cada exercício do plano anterior ao destino. */
  readonly anosAnteriores: readonly { readonly exercicio: number; readonly dotacaoAtualizada: string }[];
  /** O que a proposta põe nesta ação no exercício de destino. */
  readonly naProposta: string;
  /** Meta do plano − anos anteriores − proposta. Negativo: a ação passa da meta do plano. */
  readonly restanteDaMeta: string;
}

export interface ConferenciaDaProposta {
  readonly exercicio: number;
  readonly verificacoes: readonly VerificacaoDaProposta[];
  readonly acoesDoPpa: readonly AcaoDoPpaNasFichas[];
  readonly plano: { readonly anoInicio: number; readonly anoFim: number; readonly leiRef: string } | null;
}

/** Os fatos de fora da proposta que a conferência confronta — levantados por `levantarConferencia`. */
export interface FatosDoPlanejamento {
  readonly metaDaLdo:
    | { readonly ldoRegistrada: false }
    | { readonly ldoRegistrada: true; readonly meta: { readonly receitaTotal: Money; readonly despesaTotal: Money; readonly ajustes: number } | null };
  readonly prioridadesDaLdo: readonly { readonly acaoCodigo: string | null; readonly descricao: string }[];
  readonly plano: {
    readonly anoInicio: number;
    readonly anoFim: number;
    readonly leiRef: string;
    readonly acoes: readonly {
      readonly programaCodigo: string;
      readonly acaoCodigo: string;
      readonly acaoDescricao: string;
      readonly metaVigente: Money;
      readonly alteracoes: number;
      readonly dotacaoPorExercicio: readonly { readonly exercicio: number; readonly valor: Money }[];
    }[];
  } | null;
}

const reais = (v: Money | string): string =>
  `R$ ${Number(typeof v === "string" ? v : v.toFixed(2)).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A conferência em si — PURA: a proposta detalhada e os fatos do planejamento entram, o laudo sai. */
export function conferirProposta(p: PropostaDetalhada, f: FatosDoPlanejamento): ConferenciaDaProposta {
  const v: VerificacaoDaProposta[] = [];
  const zero = toMoney("0");
  const receitaLiquida = toMoney(p.totalDaReceita.vigente);
  const despesa = toMoney(p.totalDaDespesa.vigente);

  // 1. Linhas negativas e zeradas — o que a geração das fichas recusa ou pula.
  const negativas = [
    ...p.receitas.filter((r) => toMoney(r.valorVigente).isNegative()).map((r) => `Receita ${r.naturezaCodigo}, fonte ${r.fonteCodigo}: ${reais(r.valorVigente)}`),
    ...p.despesas.filter((d) => toMoney(d.valorVigente).isNegative()).map((d) => `Ficha ${d.numero} (${d.acaoCodigo} ${d.naturezaCodigo}): ${reais(d.valorVigente)}`),
  ];
  v.push({
    codigo: "LINHAS_NEGATIVAS",
    titulo: "Linhas com valor negativo",
    situacao: negativas.length > 0 ? "IMPEDE" : "CONFORME",
    resumo: negativas.length > 0
      ? `${negativas.length} linha(s) ficaram negativas depois dos ajustes. A geração das fichas recusa a proposta até que sejam corrigidas.`
      : "Nenhuma linha ficou negativa depois dos ajustes.",
    itens: negativas,
  });
  const zeradas = p.despesas.filter((d) => toMoney(d.valorVigente).isZero()).map((d) => `Ficha ${d.numero} (${d.acaoCodigo} ${d.naturezaCodigo}, fonte ${d.fonteCodigo})`);
  v.push({
    codigo: "FICHAS_ZERADAS",
    titulo: "Fichas sem valor",
    situacao: zeradas.length > 0 ? "ATENCAO" : "CONFORME",
    resumo: zeradas.length > 0
      ? `${zeradas.length} ficha(s) estão com valor zero e não serão criadas no exercício de ${p.exercicio}. Se a programação deve existir, informe o valor.`
      : "Todas as fichas da proposta têm valor.",
    itens: zeradas,
  });

  // 2. Equilíbrio.
  const diferenca = receitaLiquida.minus(despesa);
  v.push({
    codigo: "EQUILIBRIO",
    titulo: "Equilíbrio entre receita e despesa",
    situacao: diferenca.isZero() ? "CONFORME" : "ATENCAO",
    resumo: diferenca.isZero()
      ? `Receita líquida e despesa fixada somam ${reais(despesa)}.`
      : diferenca.isNegative()
        ? `A despesa fixada (${reais(despesa)}) supera a receita líquida prevista (${reais(receitaLiquida)}) em ${reais(diferenca.negated())}.`
        : `A receita líquida prevista (${reais(receitaLiquida)}) supera a despesa fixada (${reais(despesa)}) em ${reais(diferenca)}.`,
    itens: [],
  });

  // 3. Fonte a fonte.
  const porFonte = new Map<string, { receita: Money; despesa: Money }>();
  const daFonte = (c: string): { receita: Money; despesa: Money } => {
    const atual = porFonte.get(c) ?? { receita: zero, despesa: zero };
    porFonte.set(c, atual);
    return atual;
  };
  for (const r of p.receitas) {
    const x = daFonte(r.fonteCodigo);
    const sinal = SINAL_PREVISAO[r.tipoReceita as keyof typeof SINAL_PREVISAO] ?? 1;
    x.receita = toMoney(sinal === 1 ? x.receita.plus(r.valorVigente) : x.receita.minus(r.valorVigente));
  }
  for (const d of p.despesas) {
    const x = daFonte(d.fonteCodigo);
    x.despesa = toMoney(x.despesa.plus(d.valorVigente));
  }
  const fontesSemLastro = [...porFonte.entries()]
    .filter(([, x]) => x.despesa.greaterThan(x.receita))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([c, x]) => `Fonte ${c}: despesa ${reais(x.despesa)}, receita ${reais(x.receita)} — faltam ${reais(x.despesa.minus(x.receita))}`);
  v.push({
    codigo: "FONTES",
    titulo: "Despesa por fonte de recurso",
    situacao: fontesSemLastro.length > 0 ? "ATENCAO" : "CONFORME",
    resumo: fontesSemLastro.length > 0
      ? `${fontesSemLastro.length} fonte(s) têm mais despesa fixada que receita prevista. O recurso vinculado só atende o objeto da vinculação.`
      : `Em todas as ${porFonte.size} fontes a receita prevista cobre a despesa fixada.`,
    itens: fontesSemLastro,
  });

  // 4. LDO: metas anuais e prioridades.
  if (!f.metaDaLdo.ldoRegistrada) {
    v.push({
      codigo: "LDO",
      titulo: "Compatibilidade com a LDO",
      situacao: "ATENCAO",
      resumo: `Não há LDO registrada para ${p.exercicio}. Sem ela não se confere a proposta contra as metas fiscais e as prioridades.`,
      itens: [],
      ondeCorrigir: { href: "/planejamento/ldo", rotulo: "Registrar a LDO" },
    });
  } else if (f.metaDaLdo.meta === null) {
    v.push({
      codigo: "LDO",
      titulo: "Compatibilidade com a LDO",
      situacao: "ATENCAO",
      resumo: `A LDO de ${p.exercicio} está registrada, mas sem a meta anual de ${p.exercicio} no Anexo de Metas Fiscais.`,
      itens: [],
      ondeCorrigir: { href: "/planejamento/ldo", rotulo: "Completar as metas da LDO" },
    });
  } else {
    const m = f.metaDaLdo.meta;
    const itens: string[] = [];
    if (!m.receitaTotal.equals(receitaLiquida)) itens.push(`Receita: meta da LDO ${reais(m.receitaTotal)}, proposta ${reais(receitaLiquida)} (diferença ${reais(receitaLiquida.minus(m.receitaTotal))})`);
    if (!m.despesaTotal.equals(despesa)) itens.push(`Despesa: meta da LDO ${reais(m.despesaTotal)}, proposta ${reais(despesa)} (diferença ${reais(despesa.minus(m.despesaTotal))})`);
    v.push({
      codigo: "LDO",
      titulo: "Compatibilidade com as metas da LDO",
      situacao: itens.length > 0 ? "ATENCAO" : "CONFORME",
      resumo: itens.length > 0
        ? `A proposta difere das metas anuais de receita e despesa da LDO de ${p.exercicio}${m.ajustes > 0 ? ` (metas já com ${m.ajustes} alteração(ões) por lei)` : ""}.`
        : `Receita e despesa da proposta coincidem com as metas anuais da LDO de ${p.exercicio}.`,
      itens,
    });
  }
  const totalPorAcao = new Map<string, Money>();
  for (const d of p.despesas) totalPorAcao.set(d.acaoCodigo, toMoney((totalPorAcao.get(d.acaoCodigo) ?? zero).plus(d.valorVigente)));
  const prioridadesSemDotacao = f.prioridadesDaLdo
    .filter((pr) => pr.acaoCodigo !== null && !(totalPorAcao.get(pr.acaoCodigo) ?? zero).greaterThan(0))
    .map((pr) => `Ação ${pr.acaoCodigo} — ${pr.descricao}`);
  if (f.prioridadesDaLdo.length > 0) {
    v.push({
      codigo: "PRIORIDADES_DA_LDO",
      titulo: "Prioridades da LDO na proposta",
      situacao: prioridadesSemDotacao.length > 0 ? "ATENCAO" : "CONFORME",
      resumo: prioridadesSemDotacao.length > 0
        ? `${prioridadesSemDotacao.length} ação(ões) prioritária(s) da LDO estão sem valor na proposta.`
        : `As ${f.prioridadesDaLdo.length} prioridades da LDO têm valor na proposta.`,
      itens: prioridadesSemDotacao,
    });
  }

  // 5. PPA.
  if (f.plano === null) {
    v.push({
      codigo: "PPA",
      titulo: "Ações no PPA",
      situacao: "ATENCAO",
      resumo: `Nenhum PPA registrado cobre o exercício de ${p.exercicio}.`,
      itens: [],
      ondeCorrigir: { href: "/planejamento/ppa", rotulo: "Registrar o PPA" },
    });
  } else {
    const noPlano = new Set(f.plano.acoes.map((a) => `${a.programaCodigo}/${a.acaoCodigo}`));
    const fora = [...new Set(p.despesas.filter((d) => toMoney(d.valorVigente).greaterThan(0)).map((d) => `${d.programaCodigo}/${d.acaoCodigo}`))]
      .filter((k) => !noPlano.has(k))
      .sort()
      .map((k) => `Programa ${k.split("/")[0]}, ação ${k.split("/")[1]}`);
    v.push({
      codigo: "PPA",
      titulo: `Ações no PPA ${f.plano.anoInicio}–${f.plano.anoFim}`,
      situacao: fora.length > 0 ? "ATENCAO" : "CONFORME",
      resumo: fora.length > 0
        ? `${fora.length} ação(ões) da proposta não constam do PPA ${f.plano.anoInicio}–${f.plano.anoFim} no mesmo programa.`
        : `Todas as ações com valor na proposta constam do PPA ${f.plano.anoInicio}–${f.plano.anoFim}.`,
      itens: fora,
      ...(fora.length > 0 ? { ondeCorrigir: { href: "/planejamento/alteracoes", rotulo: "Alterações do PPA" } } : {}),
    });
  }

  // 6. Deduções sem tipo no destino.
  if (p.destino.deducoesSemTipo > 0) {
    v.push({
      codigo: "DEDUCOES_SEM_TIPO",
      titulo: "Tipo das deduções da receita",
      situacao: "ATENCAO",
      resumo: `${p.destino.deducoesSemTipo} dedução(ões) da receita de ${p.exercicio} estão sem o tipo da dedução, exigido na prestação de contas.`,
      itens: [],
      ondeCorrigir: { href: "/planejamento/receita-prevista", rotulo: "Informar o tipo das deduções" },
    });
  }

  // O quadro por ação do PPA.
  const porProgramaAcao = new Map<string, Money>();
  for (const d of p.despesas) {
    const k = `${d.programaCodigo}/${d.acaoCodigo}`;
    porProgramaAcao.set(k, toMoney((porProgramaAcao.get(k) ?? zero).plus(d.valorVigente)));
  }
  const acoesDoPpa: AcaoDoPpaNasFichas[] = (f.plano?.acoes ?? [])
    .map((a) => {
      const anteriores = a.dotacaoPorExercicio.filter((x) => x.exercicio < p.exercicio).sort((x, y) => x.exercicio - y.exercicio);
      const naProposta = porProgramaAcao.get(`${a.programaCodigo}/${a.acaoCodigo}`) ?? zero;
      const somaAnteriores = anteriores.reduce((acc, x) => toMoney(acc.plus(x.valor)), zero);
      return {
        programaCodigo: a.programaCodigo,
        acaoCodigo: a.acaoCodigo,
        acaoDescricao: a.acaoDescricao,
        metaDoPlano: a.metaVigente.toFixed(2),
        alteracoesDaMeta: a.alteracoes,
        anosAnteriores: anteriores.map((x) => ({ exercicio: x.exercicio, dotacaoAtualizada: x.valor.toFixed(2) })),
        naProposta: naProposta.toFixed(2),
        restanteDaMeta: a.metaVigente.minus(somaAnteriores).minus(naProposta).toFixed(2),
      };
    })
    .sort((x, y) => x.programaCodigo.localeCompare(y.programaCodigo) || x.acaoCodigo.localeCompare(y.acaoCodigo));

  return {
    exercicio: p.exercicio,
    verificacoes: v,
    acoesDoPpa,
    plano: f.plano === null ? null : { anoInicio: f.plano.anoInicio, anoFim: f.plano.anoFim, leiRef: f.plano.leiRef },
  };
}

/** Levanta, do banco, os fatos do planejamento que a conferência confronta para o exercício. */
export async function levantarFatosDoPlanejamento(tx: Tx, exercicio: number): Promise<FatosDoPlanejamento> {
  const ldo = await tx.leiDiretrizesOrcamentarias.findUnique({
    where: { exercicio },
    select: { id: true, prioridades: { select: { descricaoAcao: true, acao: { select: { codigo: true } } } } },
  });
  let metaDaLdo: FatosDoPlanejamento["metaDaLdo"] = { ldoRegistrada: false };
  if (ldo !== null) {
    const metas = await metasAnuaisVigentes(tx, { ldoId: ldo.id, ano: exercicio });
    const m = metas[0];
    metaDaLdo = { ldoRegistrada: true, meta: m === undefined ? null : { receitaTotal: m.vigente.receitaTotal, despesaTotal: m.vigente.despesaTotal, ajustes: m.ajustes } };
  }

  const plano = await tx.planoPlurianual.findFirst({
    where: { anoInicio: { lte: exercicio }, anoFim: { gte: exercicio } },
    orderBy: { anoInicio: "desc" },
    select: {
      anoInicio: true,
      anoFim: true,
      leiRef: true,
      programas: {
        select: {
          programaId: true,
          programa: { select: { codigo: true } },
          acoes: {
            select: {
              id: true,
              acaoId: true,
              metaFinanceira: true,
              acao: { select: { codigo: true, descricao: true } },
              alteracoes: { where: { grandeza: "metaFinanceira" }, select: { valorAjuste: true } },
            },
          },
        },
      },
    },
  });

  let fatosDoPlano: FatosDoPlanejamento["plano"] = null;
  if (plano !== null) {
    const pares = plano.programas.flatMap((pg) => pg.acoes.map((a) => ({ programaId: pg.programaId, acaoId: a.acaoId })));
    const fichas = pares.length === 0
      ? []
      : await tx.fichaOrcamentaria.findMany({
          where: { exercicio: { gte: plano.anoInicio, lt: exercicio }, OR: pares },
          select: { exercicio: true, programaId: true, acaoId: true, saldoAutorizado: true },
        });
    fatosDoPlano = {
      anoInicio: plano.anoInicio,
      anoFim: plano.anoFim,
      leiRef: plano.leiRef,
      acoes: plano.programas.flatMap((pg) =>
        pg.acoes.map((a) => {
          const porAno = new Map<number, Money>();
          for (const fi of fichas) {
            if (fi.programaId !== pg.programaId || fi.acaoId !== a.acaoId) continue;
            porAno.set(fi.exercicio, toMoney((porAno.get(fi.exercicio) ?? toMoney("0")).plus(fi.saldoAutorizado.toFixed(2))));
          }
          return {
            programaCodigo: pg.programa.codigo,
            acaoCodigo: a.acao.codigo,
            acaoDescricao: a.acao.descricao,
            metaVigente: valorVigente(toMoney(a.metaFinanceira.toFixed(2)), a.alteracoes.map((x) => toMoney(x.valorAjuste.toFixed(2)))),
            alteracoes: a.alteracoes.length,
            dotacaoPorExercicio: [...porAno.entries()].map(([ex, valor]) => ({ exercicio: ex, valor })),
          };
        })
      ),
    };
  }

  return {
    metaDaLdo,
    prioridadesDaLdo: (ldo?.prioridades ?? []).map((pr) => ({ acaoCodigo: pr.acao?.codigo ?? null, descricao: pr.descricaoAcao })),
    plano: fatosDoPlano,
  };
}
