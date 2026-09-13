import type { Tx } from "../m16-travamento/autorizacao.js";
import { janelaCivilDoMes, competenciaCivil } from "../../packages/datas/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import {
  atualizacaoAcumulada,
  EH_ATUALIZACAO_ACUMULADA,
  SINAL_MOVIMENTO_PATRIMONIAL,
  valorContabil,
  type TipoMovimentoPatrimonial,
} from "./dominio.js";
import type { TipoMovimentoDeGestao } from "./gestao-do-bem-dominio.js";

/**
 * M10 — A ANÁLISE DE DEPENDÊNCIAS DO ESTORNO (V3 pacote 2, unidade 4; revista na sessão
 * noturna V4, §4.3 — achado A07).
 *
 * ═══ A PERGUNTA ═══
 * Estornar é lançamento novo que anula o original (append-only). Mas o original pode ter
 * SUSTENTADO outros fatos: a parcela de depreciação de abril foi calculada sobre uma base
 * que incluía a avaliação inicial; a baixa de um bem foi conferida contra um teto que
 * incluía aquela reavaliação. Anular o original em silêncio deixaria esses fatos apoiados
 * em nada — corretos quando nasceram, inválidos depois, e ninguém saberia.
 *
 * ═══ O QUE MUDOU NA V4: IMPACTO VERIFICADO, NÃO TIPO COMBINADO ═══
 * A regra anterior combinava TIPOS ("redução posterior depende de aumento anterior") e era
 * conservadora sem dizer: uma redução do bem B era declarada dependente da entrada do bem A.
 * Agora cada posterior vivo D é REFEITO sem M, sobre o conjunto que a conferência de D usou:
 *
 *   (a) D é uma ATUALIZAÇÃO POR COMPETÊNCIA: depende de M se M compunha a base de D — mesmo
 *       ALVO (o bem de D; o acervo sem individualização; ou, para a atualização antiga da
 *       classe inteira, qualquer alvo), M não é atualização acumulada, e a data de negócio de
 *       M está dentro do CORTE de D (movimento datado depois do corte não entrou na base);
 *   (b) D é uma REDUÇÃO (baixa, doação realizada, impairment, reavaliação para menos): depende
 *       de M se, retirado M, o valor contábil do ALVO de D (o bem, quando D tem bem; e a classe,
 *       sempre) no instante do registro de D ficaria ABAIXO do valor de D — o ativo negativo;
 *   (c) D é a BAIXA DA ACUMULADA de uma alienação: depende de M se, retirado M, a acumulada
 *       da classe no registro de D não cobriria D.
 * O que não fica inválido não bloqueia. Posteriores do MESMO BEM que não bloqueiam são
 * listados como INFORMAÇÃO — o operador vê a cadeia, e nada o impede.
 *
 * ⚠️ A ORDEM É A DE REGISTRO, com DESEMPATE ESTÁVEL: `sequencia` (atribuída pelo banco). Dois
 * movimentos no mesmo milissegundo não mudam de lugar entre duas leituras. As conferências
 * (base, teto) usaram o que EXISTIA no instante do registro — por isso a ordem de registro, e
 * não a data do fato: um movimento de março lançado em maio foi conferido contra o acervo de maio.
 *
 * ⚠️ A OPERAÇÃO ANDA JUNTA. Os irmãos de `operacaoId` (a alienação: bruto + acumulada; a
 * EXECUÇÃO de uma competência: todos os itens, que compartilham UM lançamento) não são
 * dependentes — são ARRASTADOS: `estornarMovimentoPatrimonial` os desfaz no mesmo ato. A análise
 * os nomeia para que a tela diga o que o ato faz — e diz que é a execução DESTA classe, não a
 * virada inteira.
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
  readonly sequencia: number;
}

export interface DependenteDoEstorno extends MovimentoDaAnalise {
  readonly porque: PorqueDepende;
  /** O impacto verificado, em palavras: o que ficaria abaixo de quê. */
  readonly impacto: string;
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
  /** A execução mensal a que o movimento pertence (um item dela), quando é o caso. */
  readonly execucao: { readonly id: string; readonly competencia: string; readonly escopo: string; readonly itens: number } | null;
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
    (t) => SINAL_MOVIMENTO_PATRIMONIAL[t] === -1 && !t.startsWith("ESTORNO_") && !EH_ATUALIZACAO_ACUMULADA[t]
  )
);

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
  sequencia: true,
  operacaoId: true,
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
  readonly sequencia: number;
  readonly operacaoId: string | null;
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
    sequencia: m.sequencia,
  };
}

const money = (l: LinhaCrua): { tipo: TipoMovimentoPatrimonial; valor: Money } => ({ tipo: l.tipo as TipoMovimentoPatrimonial, valor: toMoney(l.valor.toFixed(2)) });

/** O conjunto que a conferência de D usou: os vivos registrados ANTES de D, no alvo pedido, sem M. */
function conjuntoSemM(vivos: readonly LinhaCrua[], d: LinhaCrua, m: LinhaCrua, alvo: "BEM" | "CLASSE"): readonly LinhaCrua[] {
  return vivos.filter((x) => x.sequencia < d.sequencia && x.id !== m.id && (alvo === "CLASSE" || x.bemId === d.bemId));
}

/**
 * Por que D depende de M — ou `null`. `vivos` são todos os movimentos vivos da classe, em
 * ordem de sequência; a conferência de D é refeita sobre eles sem M.
 */
export function porqueDepende(m: LinhaCrua, d: LinhaCrua, vivos: readonly LinhaCrua[]): { readonly porque: PorqueDepende; readonly impacto: string } | null {
  const tipoM = m.tipo as TipoMovimentoPatrimonial;
  const tipoD = d.tipo as TipoMovimentoPatrimonial;
  const valorD = toMoney(d.valor.toFixed(2));

  // (a) D é um item de atualização por competência.
  if (d.competencia !== null && EH_ATUALIZACAO_ACUMULADA[tipoD] && !tipoD.startsWith("ESTORNO_")) {
    if (EH_ATUALIZACAO_ACUMULADA[tipoM]) return null; // a acumulada não compõe a base
    const mesmoAlvo =
      d.bemId !== null
        ? m.bemId === d.bemId
        : d.operacaoId !== null
          ? m.bemId === null // o item do acervo sem individualização (V4) só soma o que não tem bem
          : true; // a atualização antiga da classe inteira somava tudo
    if (!mesmoAlvo) return null;
    const corte = janelaCivilDoMes(competenciaCivil(d.competencia)).fim;
    if (m.dataMovimento.getTime() > corte.getTime()) return null; // não entrou na base de D
    return {
      porque: "COMPETENCIA_POSTERIOR",
      impacto: `a parcela de ${competenciaCivil(d.competencia)} foi calculada sobre uma base que incluía ${m.valor.toFixed(2)} deste movimento`,
    };
  }

  // (b) D é uma redução: refaz o teto sem M — o bem de D (se houver) e a classe.
  if (REDUCOES.has(tipoD)) {
    const conferencias: { alvo: "BEM" | "CLASSE"; rotulo: string }[] = [{ alvo: "CLASSE", rotulo: "a classe" }];
    if (d.bemId !== null) conferencias.unshift({ alvo: "BEM", rotulo: `o bem ${d.bem?.numeroTombamento ?? d.bemId}` });
    for (const c of conferencias) {
      if (c.alvo === "BEM" && m.bemId !== d.bemId) continue;
      const sem = valorContabil(conjuntoSemM(vivos, d, m, c.alvo).map(money));
      if (sem.lessThan(valorD)) {
        return {
          porque: "REDUCAO_POSTERIOR",
          impacto: `sem este movimento, ${c.rotulo} valeria ${sem.toFixed(2)} no registro da redução de ${valorD.toFixed(2)} — o ativo ficaria negativo`,
        };
      }
    }
    return null;
  }

  // (c) D é a baixa da acumulada de uma alienação: refaz a acumulada da classe sem M.
  if (tipoD === "BAIXA_DE_ATUALIZACAO_ACUMULADA") {
    if (!EH_ATUALIZACAO_ACUMULADA[tipoM]) return null;
    const sem = atualizacaoAcumulada(conjuntoSemM(vivos, d, m, "CLASSE").map(money));
    if (sem.lessThan(valorD)) {
      return {
        porque: "BAIXA_DA_ACUMULADA_POSTERIOR",
        impacto: `sem este movimento, a acumulada da classe seria ${sem.toFixed(2)} no registro da baixa de ${valorD.toFixed(2)} — baixaria depreciação que não existiu`,
      };
    }
  }
  return null;
}

/** A análise — só lê. `estornarMovimentoPatrimonial` a chama dentro da transação e recusa pelos bloqueios. */
export async function analisarEstornoPatrimonial(tx: Tx, movimentoId: string): Promise<AnaliseDeEstornoPatrimonial> {
  const m = await tx.movimentoPatrimonial.findUnique({
    where: { id: movimentoId },
    select: {
      ...SELECAO,
      classeDeBensId: true,
      classeDeBens: { select: { codigo: true, descricao: true } },
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
          orderBy: { sequencia: "asc" },
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
  const execucaoCrua =
    m.operacaoId === null
      ? null
      : await tx.execucaoDeAtualizacao.findUnique({ where: { id: m.operacaoId }, select: { id: true, competencia: true, escopo: true, quantidadeDeItens: true } });
  const execucao =
    execucaoCrua === null
      ? null
      : { id: execucaoCrua.id, competencia: competenciaCivil(execucaoCrua.competencia), escopo: execucaoCrua.escopo, itens: execucaoCrua.quantidadeDeItens };
  const daOperacao = new Set([m.id, ...irmaos.map((i) => i.id)]);

  // TODOS os vivos da classe, em ordem de registro — a conferência de cada posterior é refeita sobre eles.
  const vivos = await tx.movimentoPatrimonial.findMany({
    where: { classeDeBensId: m.classeDeBensId, estornoDeId: null, estornos: { none: {} } },
    select: SELECAO,
    orderBy: { sequencia: "asc" },
  });
  const posteriores = vivos.filter((d) => d.sequencia > m.sequencia).sort((a, b) => b.sequencia - a.sequencia);
  const dependentes: DependenteDoEstorno[] = [];
  const posterioresDoBem: MovimentoDaAnalise[] = [];
  for (const d of posteriores) {
    if (daOperacao.has(d.id)) continue;
    const porque = porqueDepende(m, d, vivos);
    if (porque !== null) {
      dependentes.push({ ...lida(d), porque: porque.porque, impacto: porque.impacto });
    } else if (m.bemId !== null && d.bemId === m.bemId) {
      posterioresDoBem.push(lida(d));
    }
  }
  if (dependentes.length > 0) {
    bloqueios.push(
      `DEPENDENTES VIVOS: ${dependentes.length} movimento(s) posterior(es) se apoia(m) neste — ` +
        dependentes.map((d) => `${d.tipo} de ${d.valor} (${d.id}): ${d.impacto}`).join("; ") +
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
    execucao,
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
