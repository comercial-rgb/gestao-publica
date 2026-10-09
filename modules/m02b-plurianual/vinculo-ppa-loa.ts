import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * V37 — O VÍNCULO PPA → LOA (fecha a pendência `VINCULO-PPA-LOA`): que fichas da LOA executam cada ação do plano.
 *
 * ═══ A DECISÃO DO GRÃO: DERIVADO, SEM TABELA NOVA ═══
 * A `AcaoPpa` já reusa a `Acao` do M02 ("REUSADA, nunca redeclarada") e o `ProgramaPpa` reusa o `Programa` — os mesmos
 * classificadores que a ficha da LOA carrega. O vínculo é, então, a coincidência deles, e não um cadastro paralelo que
 * alguém teria de manter em dia: uma ficha executa a ação do plano quando
 *   - o exercício da ficha está entre o ano inicial e o final do plano;
 *   - o programa da ficha é o do programa do plano, e a ação da ficha é a da ação do plano;
 *   - e, quando a ação do plano declara unidade executora, função ou subfunção, a ficha tem as mesmas.
 * Uma tabela de vínculo poderia divergir dos classificadores da ficha; o derivado não diverge.
 *
 * ═══ O QUE ESTE LEITOR NÃO AFIRMA ═══
 * A meta financeira da ação vale para o PLANO INTEIRO (não há divisão por ano no modelo). Por isso a tela mostra os
 * fatos lado a lado — meta vigente do plano, dotação do exercício e dotação somada nos exercícios do plano — e não
 * declara "compatível" ou "incompatível": essa regra é do ente e da lei dele, e não se inventa aqui.
 * A ficha sem ação correspondente no plano é listada à parte, com o motivo, nunca descartada em silêncio.
 */

type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export interface FichaDoVinculo {
  readonly id: string;
  readonly exercicio: number;
  readonly numero: number;
  readonly unidade: string;
  readonly natureza: string;
  readonly valorDotado: string;
}

export interface AcaoDoPpaNaLoa {
  readonly acaoPpaId: string;
  readonly programa: string;
  readonly acao: string;
  readonly produto: string;
  /** A classificação que a ação do plano declara, quando declara. */
  readonly recorte: string | null;
  /** metaFinanceira + os ajustes dos atos de alteração (o vigente, como no comparativo). */
  readonly metaFinanceiraVigente: string;
  readonly dotacaoNoExercicio: string;
  readonly dotacaoNoPlano: string;
  /** As fichas DO EXERCÍCIO pedido. */
  readonly fichas: readonly FichaDoVinculo[];
}

export interface FichaSemAcaoDoPpa extends FichaDoVinculo {
  readonly programa: string;
  readonly acao: string;
  readonly motivo: string;
}

export interface VinculoPpaLoa {
  readonly exercicio: number;
  readonly plano: { readonly id: string; readonly anoInicio: number; readonly anoFim: number; readonly leiRef: string } | null;
  readonly acoes: readonly AcaoDoPpaNaLoa[];
  readonly fichasSemAcao: readonly FichaSemAcaoDoPpa[];
  readonly totalDotadoNoExercicio: string;
  readonly totalDotadoComAcao: string;
}

const zero = (): Money => toMoney("0.00");
const soma = (a: Money, b: Money): Money => toMoney(a.plus(b));

export async function vinculoPpaLoa(leitor: Leitor, p: { readonly exercicio: number }): Promise<VinculoPpaLoa> {
  const planos = await leitor.planoPlurianual.findMany({
    where: { anoInicio: { lte: p.exercicio }, anoFim: { gte: p.exercicio } },
    select: { id: true, anoInicio: true, anoFim: true, leiRef: true },
  });
  if (planos.length > 1) {
    throw new Error(
      `Há ${String(planos.length)} planos plurianuais cobrindo ${String(p.exercicio)} (${planos.map((x) => `${String(x.anoInicio)}-${String(x.anoFim)}`).join(", ")}). ` +
        `O vínculo com a LOA não escolhe um deles por conta própria; corrija a vigência dos planos.`
    );
  }
  const plano = planos[0] ?? null;

  const selFicha = {
    id: true, exercicio: true, numero: true, valorDotado: true, programaId: true, acaoId: true, unidadeOrcId: true, funcaoId: true, subfuncaoId: true,
    unidadeOrc: { select: { codigo: true } }, naturezaDespesa: { select: { codigoCompleto: true } },
    programa: { select: { codigo: true } }, acao: { select: { codigo: true } },
  } as const;
  const fichasDoPlano = await leitor.fichaOrcamentaria.findMany({
    where: plano === null ? { exercicio: p.exercicio } : { exercicio: { gte: plano.anoInicio, lte: plano.anoFim } },
    orderBy: [{ exercicio: "asc" }, { numero: "asc" }],
    select: selFicha,
  });
  type Ficha = (typeof fichasDoPlano)[number];
  const doExercicio = fichasDoPlano.filter((f) => f.exercicio === p.exercicio);
  const paraTela = (f: Ficha): FichaDoVinculo => ({
    id: f.id, exercicio: f.exercicio, numero: f.numero, unidade: f.unidadeOrc.codigo, natureza: f.naturezaDespesa.codigoCompleto, valorDotado: f.valorDotado.toFixed(2),
  });
  const totalDotadoNoExercicio = doExercicio.reduce((a, f) => soma(a, toMoney(f.valorDotado.toFixed(2))), zero());

  if (plano === null) {
    return {
      exercicio: p.exercicio, plano: null, acoes: [],
      fichasSemAcao: doExercicio.map((f) => ({ ...paraTela(f), programa: f.programa.codigo, acao: f.acao.codigo, motivo: `Nenhum plano plurianual cobre ${String(p.exercicio)}.` })),
      totalDotadoNoExercicio: totalDotadoNoExercicio.toFixed(2), totalDotadoComAcao: "0.00",
    };
  }

  const acoesPpa = await leitor.acaoPpa.findMany({
    where: { programaPpa: { planoId: plano.id } },
    select: {
      id: true, acaoId: true, unidadeExecutoraId: true, funcaoId: true, subfuncaoId: true, produto: true, metaFinanceira: true,
      acao: { select: { codigo: true, descricao: true } },
      unidadeExecutora: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } },
      programaPpa: { select: { programaId: true, programa: { select: { codigo: true, descricao: true } } } },
      alteracoes: { where: { grandeza: "metaFinanceira" }, select: { valorAjuste: true } },
    },
  });
  type AcaoLida = (typeof acoesPpa)[number];
  const casa = (f: Ficha, a: AcaoLida): boolean =>
    f.programaId === a.programaPpa.programaId && f.acaoId === a.acaoId &&
    (a.unidadeExecutoraId === null || a.unidadeExecutoraId === f.unidadeOrcId) &&
    (a.funcaoId === null || a.funcaoId === f.funcaoId) &&
    (a.subfuncaoId === null || a.subfuncaoId === f.subfuncaoId);

  const acoes: AcaoDoPpaNaLoa[] = acoesPpa
    .map((a) => {
      const noPlano = fichasDoPlano.filter((f) => casa(f, a));
      const noExercicio = noPlano.filter((f) => f.exercicio === p.exercicio);
      const recorte = [
        a.unidadeExecutora === null ? null : `unidade ${a.unidadeExecutora.codigo}`,
        a.funcao === null ? null : `função ${a.funcao.codigo}`,
        a.subfuncao === null ? null : `subfunção ${a.subfuncao.codigo}`,
      ].filter((x): x is string => x !== null);
      return {
        acaoPpaId: a.id,
        programa: `${a.programaPpa.programa.codigo} — ${a.programaPpa.programa.descricao}`,
        acao: `${a.acao.codigo} — ${a.acao.descricao}`,
        produto: a.produto,
        recorte: recorte.length === 0 ? null : recorte.join(", "),
        metaFinanceiraVigente: a.alteracoes.reduce((s, x) => soma(s, toMoney(x.valorAjuste.toFixed(2))), toMoney(a.metaFinanceira.toFixed(2))).toFixed(2),
        dotacaoNoExercicio: noExercicio.reduce((s, f) => soma(s, toMoney(f.valorDotado.toFixed(2))), zero()).toFixed(2),
        dotacaoNoPlano: noPlano.reduce((s, f) => soma(s, toMoney(f.valorDotado.toFixed(2))), zero()).toFixed(2),
        fichas: noExercicio.map(paraTela),
      };
    })
    .sort((x, y) => x.programa.localeCompare(y.programa, "pt-BR", { numeric: true }) || x.acao.localeCompare(y.acao, "pt-BR", { numeric: true }));

  const fichasSemAcao: FichaSemAcaoDoPpa[] = [];
  let totalDotadoComAcao = zero();
  for (const f of doExercicio) {
    if (acoesPpa.some((a) => casa(f, a))) {
      totalDotadoComAcao = soma(totalDotadoComAcao, toMoney(f.valorDotado.toFixed(2)));
      continue;
    }
    const mesmaAcao = acoesPpa.filter((a) => f.programaId === a.programaPpa.programaId && f.acaoId === a.acaoId);
    fichasSemAcao.push({
      ...paraTela(f), programa: f.programa.codigo, acao: f.acao.codigo,
      motivo: mesmaAcao.length === 0
        ? `O programa ${f.programa.codigo} com a ação ${f.acao.codigo} não está no plano ${plano.leiRef}.`
        : `A ação ${f.acao.codigo} do programa ${f.programa.codigo} está no plano com outra unidade executora, função ou subfunção.`,
    });
  }
  return {
    exercicio: p.exercicio, plano, acoes, fichasSemAcao,
    totalDotadoNoExercicio: totalDotadoNoExercicio.toFixed(2), totalDotadoComAcao: totalDotadoComAcao.toFixed(2),
  };
}
