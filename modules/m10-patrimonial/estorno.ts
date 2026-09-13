import type { Tx } from "../m16-travamento/autorizacao.js";
import {
  EH_ATUALIZACAO_ACUMULADA,
  SINAL_MOVIMENTO_PATRIMONIAL,
  type TipoMovimentoPatrimonial,
} from "./dominio.js";
import type { TipoMovimentoDeGestao } from "./gestao-do-bem-dominio.js";

/**
 * M10 — A ANÁLISE DE DEPENDÊNCIAS DO ESTORNO (orquestração V3, pacote 2, unidade 4).
 *
 * ═══ A PERGUNTA ═══
 * Estornar é lançamento novo que anula o original (append-only). Mas o original pode ter
 * SUSTENTADO outros fatos: a parcela de depreciação de abril foi calculada sobre uma base
 * que incluía a avaliação inicial; a baixa de um bem foi conferida contra um teto que
 * incluía aquela reavaliação. Anular o original em silêncio deixaria esses fatos apoiados
 * em nada — corretos quando nasceram, inválidos depois, e ninguém saberia.
 *
 * ═══ A REGRA: DEPENDE QUEM FICARIA INVÁLIDO ═══
 * Um movimento VIVO posterior (registrado depois, não estornado) D depende de M quando:
 *   (a) D é uma ATUALIZAÇÃO POR COMPETÊNCIA e M compõe a BASE (M não é atualização
 *       acumulada): a parcela de D foi calculada sobre um bruto que incluía M;
 *   (b) D é uma REDUÇÃO (baixa, doação realizada, impairment, reavaliação para menos) e M
 *       é um AUMENTO: o teto de D (classe e bem) incluía M — sem M, D pode passar do que
 *       a classe vale;
 *   (c) D é a BAIXA DA ACUMULADA de uma alienação e M é uma atualização acumulada: D foi
 *       conferida contra uma acumulada que incluía M.
 * Nesses casos o estorno é RECUSADO nomeando os dependentes: estorne primeiro, do mais
 * recente ao mais antigo. Movimentos posteriores do MESMO BEM que não caem em (a)–(c) são
 * listados como INFORMAÇÃO — o operador vê a cadeia, e nada o impede.
 *
 * ⚠️ POR QUE `criadoEm`, E NÃO A DATA DO FATO: as conferências (base, teto) usaram o que
 * EXISTIA no instante do registro. Um movimento de março lançado em maio foi conferido
 * contra o acervo de maio.
 *
 * ⚠️ A OPERAÇÃO ANDA JUNTA. Os irmãos de `operacaoId` (a alienação: bruto + acumulada) não
 * são dependentes — são ARRASTADOS: `estornarMovimentoPatrimonial` os desfaz no mesmo ato,
 * com o lançamento de resultado. A análise os nomeia para que a tela diga o que o ato faz.
 *
 * O EIXO DE GESTÃO (localização, responsável, estado, situação) não tem teto nem base: a
 * derivação lê o último movimento vivo de cada eixo. A análise mostra o par da
 * transferência (arrastado) e os posteriores do mesmo eixo (informação); nada bloqueia.
 */

export type PorqueDepende = "COMPETENCIA_POSTERIOR" | "REDUCAO_POSTERIOR" | "BAIXA_DA_ACUMULADA_POSTERIOR";

export interface MovimentoDaAnalise {
  readonly id: string;
  readonly tipo: TipoMovimentoPatrimonial;
  readonly valor: string;
  readonly dataMovimento: Date;
  readonly competencia: Date | null;
  readonly bemId: string | null;
  readonly numeroTombamento: string | null;
  readonly motivo: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface DependenteDoEstorno extends MovimentoDaAnalise {
  readonly porque: PorqueDepende;
}

export interface AnaliseDeEstornoPatrimonial {
  readonly movimento: MovimentoDaAnalise & {
    readonly classeDeBensId: string;
    readonly classe: string;
    readonly operacaoId: string | null;
    readonly ehEstorno: boolean;
    readonly jaEstornado: boolean;
    readonly temMemoria: boolean;
  };
  /** Os irmãos vivos da operação — desfeitos no MESMO ato. */
  readonly arrastados: readonly MovimentoDaAnalise[];
  /** Os lançamentos de resultado (ganho/perda) vivos da operação — estornados no mesmo ato. */
  readonly resultados: readonly { readonly lancamentoId: string; readonly origemTipo: string }[];
  /** Quem ficaria inválido — BLOQUEIA. Do mais recente ao mais antigo. */
  readonly dependentes: readonly DependenteDoEstorno[];
  /** Posteriores do mesmo bem que não bloqueiam — informação. */
  readonly posterioresDoBem: readonly MovimentoDaAnalise[];
  readonly bloqueios: readonly string[];
  readonly podeEstornar: boolean;
}

const REDUCOES: ReadonlySet<TipoMovimentoPatrimonial> = new Set(
  (Object.keys(SINAL_MOVIMENTO_PATRIMONIAL) as TipoMovimentoPatrimonial[]).filter(
    (t) => SINAL_MOVIMENTO_PATRIMONIAL[t] === -1 && !t.startsWith("ESTORNO_")
  )
);
const AUMENTOS: ReadonlySet<TipoMovimentoPatrimonial> = new Set(
  (Object.keys(SINAL_MOVIMENTO_PATRIMONIAL) as TipoMovimentoPatrimonial[]).filter(
    (t) => SINAL_MOVIMENTO_PATRIMONIAL[t] === 1 && !t.startsWith("ESTORNO_") && !EH_ATUALIZACAO_ACUMULADA[t]
  )
);

function porqueDepende(m: { readonly tipo: TipoMovimentoPatrimonial }, d: { readonly tipo: TipoMovimentoPatrimonial; readonly competencia: Date | null }): PorqueDepende | null {
  if (d.competencia !== null && !EH_ATUALIZACAO_ACUMULADA[m.tipo]) return "COMPETENCIA_POSTERIOR";
  if (d.tipo === "BAIXA_DE_ATUALIZACAO_ACUMULADA") {
    return EH_ATUALIZACAO_ACUMULADA[m.tipo] ? "BAIXA_DA_ACUMULADA_POSTERIOR" : null;
  }
  if (REDUCOES.has(d.tipo) && AUMENTOS.has(m.tipo)) return "REDUCAO_POSTERIOR";
  return null;
}

const SELECAO = {
  id: true,
  tipo: true,
  valor: true,
  dataMovimento: true,
  competencia: true,
  bemId: true,
  bem: { select: { numeroTombamento: true } },
  motivo: true,
  criadoEm: true,
  criadoPor: true,
} as const;

type LinhaCrua = {
  readonly id: string;
  readonly tipo: string;
  readonly valor: { toFixed(n: number): string };
  readonly dataMovimento: Date;
  readonly competencia: Date | null;
  readonly bemId: string | null;
  readonly bem: { readonly numeroTombamento: string } | null;
  readonly motivo: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
};

function lida(m: LinhaCrua): MovimentoDaAnalise {
  return {
    id: m.id,
    tipo: m.tipo as TipoMovimentoPatrimonial,
    valor: m.valor.toFixed(2),
    dataMovimento: m.dataMovimento,
    competencia: m.competencia,
    bemId: m.bemId,
    numeroTombamento: m.bem?.numeroTombamento ?? null,
    motivo: m.motivo,
    criadoEm: m.criadoEm,
    criadoPor: m.criadoPor,
  };
}

/** A análise — só lê. `estornarMovimentoPatrimonial` a chama dentro da transação e recusa pelos bloqueios. */
export async function analisarEstornoPatrimonial(tx: Tx, movimentoId: string): Promise<AnaliseDeEstornoPatrimonial> {
  const m = await tx.movimentoPatrimonial.findUnique({
    where: { id: movimentoId },
    select: {
      ...SELECAO,
      classeDeBensId: true,
      classeDeBens: { select: { codigo: true, descricao: true } },
      operacaoId: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      memoriaDeAtualizacao: { select: { id: true } },
    },
  });
  if (m === null) throw new Error(`Movimento patrimonial ${movimentoId} não encontrado.`);

  const bloqueios: string[] = [];
  const ehEstorno = m.estornoDeId !== null;
  const jaEstornado = m.estornos.length > 0;
  if (ehEstorno) bloqueios.push(`Movimento ${m.id} JÁ É um estorno — um estorno não se estorna. A correção de um estorno é um fato NOVO.`);
  if (jaEstornado) bloqueios.push(`Movimento ${m.id} já foi estornado. Estornar duas vezes devolveria o mesmo valor em dobro.`);

  // Os irmãos vivos da operação (arrastados) e os lançamentos de resultado.
  const irmaos =
    m.operacaoId === null
      ? []
      : await tx.movimentoPatrimonial.findMany({
          where: { operacaoId: m.operacaoId, id: { not: m.id }, estornoDeId: null, estornos: { none: {} } },
          select: SELECAO,
          orderBy: { criadoEm: "asc" },
        });
  const resultados =
    m.operacaoId === null
      ? []
      : await tx.lancamentoContabil.findMany({
          where: {
            origemId: m.operacaoId,
            origemTipo: { in: ["PATRIMONIAL_GANHO_ALIENACAO", "PATRIMONIAL_PERDA_ALIENACAO"] },
            estornos: { none: {} },
          },
          select: { id: true, origemTipo: true },
        });
  const daOperacao = new Set([m.id, ...irmaos.map((i) => i.id)]);

  // Os posteriores VIVOS da classe, do mais recente ao mais antigo.
  const posteriores = await tx.movimentoPatrimonial.findMany({
    where: { classeDeBensId: m.classeDeBensId, criadoEm: { gt: m.criadoEm }, estornoDeId: null, estornos: { none: {} } },
    select: SELECAO,
    orderBy: { criadoEm: "desc" },
  });
  const dependentes: DependenteDoEstorno[] = [];
  const posterioresDoBem: MovimentoDaAnalise[] = [];
  const tipoM = m.tipo as TipoMovimentoPatrimonial;
  for (const d of posteriores) {
    if (daOperacao.has(d.id)) continue;
    const porque = porqueDepende({ tipo: tipoM }, { tipo: d.tipo as TipoMovimentoPatrimonial, competencia: d.competencia });
    if (porque !== null) {
      dependentes.push({ ...lida(d), porque });
    } else if (m.bemId !== null && d.bemId === m.bemId) {
      posterioresDoBem.push(lida(d));
    }
  }
  if (dependentes.length > 0) {
    bloqueios.push(
      `DEPENDENTES VIVOS: ${dependentes.length} movimento(s) posterior(es) se apoia(m) neste — ` +
        dependentes.map((d) => `${d.tipo} de ${d.valor} (${d.id})`).join(", ") +
        `. Estorne primeiro, do mais recente ao mais antigo. Nada foi gravado.`
    );
  }

  return {
    movimento: {
      ...lida(m),
      classeDeBensId: m.classeDeBensId,
      classe: `${m.classeDeBens.codigo} — ${m.classeDeBens.descricao}`,
      operacaoId: m.operacaoId,
      ehEstorno,
      jaEstornado,
      temMemoria: m.memoriaDeAtualizacao !== null,
    },
    arrastados: irmaos.map(lida),
    resultados: resultados.map((r) => ({ lancamentoId: r.id, origemTipo: r.origemTipo })),
    dependentes,
    posterioresDoBem,
    bloqueios,
    podeEstornar: bloqueios.length === 0,
  };
}

export interface MovimentoDeGestaoDaAnalise {
  readonly id: string;
  readonly tipo: TipoMovimentoDeGestao;
  readonly dataMovimento: Date;
  readonly motivo: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

export interface AnaliseDeEstornoDeGestao {
  readonly movimento: MovimentoDeGestaoDaAnalise & {
    readonly bemId: string;
    readonly numeroTombamento: string;
    readonly operacaoId: string | null;
    readonly ehEstorno: boolean;
    readonly jaEstornado: boolean;
  };
  /** A outra perna da transferência — desfeita no mesmo ato. */
  readonly arrastados: readonly MovimentoDeGestaoDaAnalise[];
  /** Posteriores vivos do MESMO EIXO deste bem — informação: o estado atual é o mais recente. */
  readonly posterioresDoEixo: readonly MovimentoDeGestaoDaAnalise[];
  readonly bloqueios: readonly string[];
  readonly podeEstornar: boolean;
}

const SELECAO_GESTAO = { id: true, tipo: true, dataMovimento: true, motivo: true, criadoEm: true, criadoPor: true } as const;

export async function analisarEstornoDeGestao(tx: Tx, movimentoId: string): Promise<AnaliseDeEstornoDeGestao> {
  const m = await tx.movimentoDeGestaoDoBem.findUnique({
    where: { id: movimentoId },
    select: {
      ...SELECAO_GESTAO,
      bemId: true,
      bem: { select: { numeroTombamento: true } },
      operacaoId: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
    },
  });
  if (m === null) throw new Error(`Movimento de gestão ${movimentoId} não encontrado.`);
  const bloqueios: string[] = [];
  const ehEstorno = m.estornoDeId !== null || (m.tipo as string).startsWith("ESTORNO_");
  const jaEstornado = m.estornos.length > 0;
  if (ehEstorno) bloqueios.push(`${m.tipo} JÁ É um estorno. A correção de um estorno é um fato NOVO — a razão é append-only.`);
  if (jaEstornado) bloqueios.push(`O movimento ${m.id} já foi estornado. Estornar duas vezes desfaria o mesmo fato em dobro.`);
  const irmaos =
    m.operacaoId === null
      ? []
      : await tx.movimentoDeGestaoDoBem.findMany({
          where: { operacaoId: m.operacaoId, id: { not: m.id }, estornoDeId: null, estornos: { none: {} } },
          select: SELECAO_GESTAO,
          orderBy: { criadoEm: "asc" },
        });
  const posteriores = await tx.movimentoDeGestaoDoBem.findMany({
    where: { bemId: m.bemId, tipo: m.tipo, criadoEm: { gt: m.criadoEm }, estornoDeId: null, estornos: { none: {} } },
    select: SELECAO_GESTAO,
    orderBy: { criadoEm: "desc" },
  });
  const ler = (x: { id: string; tipo: string; dataMovimento: Date; motivo: string; criadoEm: Date; criadoPor: string }): MovimentoDeGestaoDaAnalise => ({
    id: x.id, tipo: x.tipo as TipoMovimentoDeGestao, dataMovimento: x.dataMovimento, motivo: x.motivo, criadoEm: x.criadoEm, criadoPor: x.criadoPor,
  });
  return {
    movimento: { ...ler(m), bemId: m.bemId, numeroTombamento: m.bem.numeroTombamento, operacaoId: m.operacaoId, ehEstorno, jaEstornado },
    arrastados: irmaos.map(ler),
    posterioresDoEixo: posteriores.map(ler),
    bloqueios,
    podeEstornar: bloqueios.length === 0,
  };
}
