import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { TipoMovimentoDotacao } from "./dominio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";

/**
 * O MOVIMENTO DE DOTAÇÃO E A SUA PERNA NO RAZÃO — UM FATO, UMA TRANSAÇÃO.
 *
 * ═══ O FURO QUE ISTO CURA (nomeado em 46dfd5d) ═══
 * Até aqui o razão só conhecia DUAS pernas da dotação: o EMPENHO (D crédito disponível /
 * C crédito empenhado) e o estorno dele. A **LOA**, os **créditos adicionais** e as
 * **reservas** viviam só no `MovimentoDotacao` — nunca tocaram o razão.
 *
 * Consequência, que a MSC expôs ao ser calculada à mão: o CRÉDITO DISPONÍVEL era
 * **debitado** pelo empenho e **nunca creditado** pela dotação. Uma conta CREDORA com
 * saldo DEVEDOR, permanente. O subsistema orçamentário do razão simplesmente NÃO
 * refletia o orçamento — e é exatamente ele que o SICONFI espera povoado.
 *
 * O balancete FECHAVA (todo lançamento é balanceado, um a um), e foi por isso que
 * nenhuma amarração existente pegou. Só uma leitura que compara o RAZÃO com os
 * MOVIMENTOS enxerga um buraco desses — e ela nasce neste bloco (`conferirDotacaoContraRazao`).
 *
 * ═══ FATO PERMUTATIVO DE CONTROLE: as duas pernas são indivisíveis ═══
 * Mesma lição da retenção no `pagar()` (M07) e da operação composta do M04↔M10: quem é
 * dono do fato grava as DUAS pernas, na MESMA transação. Ou as duas, ou nenhuma.
 */

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ RECORD EXAUSTIVO — quem lança PELO ROTEIRO desta tabela, e quem NÃO.
 *
 * Um tipo novo de movimento de dotação **não compila** até alguém dizer se ele tem perna
 * no razão. Sem isto, o valor novo entraria na ficha e sumiria do razão em silêncio — que
 * é *exatamente* como o furo de 46dfd5d nasceu.
 *
 * O EMPENHO e o EMPENHO_ANULADO respondem `false`, e isso NÃO é "não lançam": eles JÁ
 * lançam, pelo roteiro que o CHAMADOR passa ao `empenhar()`. Um roteiro paralelo aqui os
 * lançaria DUAS VEZES — é a lição da ENTRADA do almoxarifado, que não tem roteiro próprio
 * justamente porque a liquidação já debitou o estoque.
 */
export const LANCA_PELO_ROTEIRO_ORCAMENTARIO: Record<TipoMovimentoDotacao, boolean> = {
  DOTACAO_INICIAL: true,
  CREDITO_ADICIONAL: true,
  ANULACAO_CREDITO: true,
  RESERVA: true,
  RESERVA_LIBERADA: true,
  /** JÁ lançado pelo `empenhar()` — o roteiro vem do chamador. */
  EMPENHO: false,
  /** JÁ lançado pelo estorno do empenho. */
  EMPENHO_ANULADO: false,
};

export interface MovimentoDotacaoParams {
  readonly fichaId: string;
  readonly tipo: TipoMovimentoDotacao;
  /** SEMPRE positivo — quem dá o sinal é o tipo (`SINAIS`, no domínio). */
  readonly valor: string;
  readonly origemTipo: string;
  readonly origemId?: string | null | undefined;
  readonly estornoDeId?: string | null | undefined;
  readonly criadoPor: string;
  /**
   * A data do FATO — a COMPETÊNCIA. É ela que corta a MSC, o balancete e, desde
   * o ADR de 2026-09-10, o SALDO POR DATA.
   *
   * ⚠️ ATÉ 2026-09-10 ESTE CAMPO CHEGAVA AO RAZÃO E ERA DESCARTADO NO MOVIMENTO.
   * `movimentoDotacao.create` gravava só `criadoEm`, e por isso "qual era o saldo em
   * 30/06?" respondia pelo instante da DIGITAÇÃO. No banco de desenvolvimento havia
   * doze empenhos de 10/04 gravados em 09/09 — cinco meses de erro, em silêncio.
   * Ver `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`.
   *
   * ⚠️ NÃO INFORMAR TEM PREÇO, E O PREÇO FICA NO DADO. Sem `data`, a competência
   * vira o instante da gravação e a linha nasce com `competenciaDerivada = true`.
   * Isso não é um erro — é o caso honesto da reserva, que não tem data própria — mas
   * é rastreável, e é para ser rastreável que a marca existe.
   */
  readonly data?: Date | undefined;
  readonly historico?: string | undefined;
}

/**
 * Grava o movimento E a perna no razão, na MESMA transação.
 *
 * FAIL-CLOSED: tipo que deve lançar e não tem roteiro = a operação INTEIRA cai. Um
 * movimento de dotação sem perna no razão é a volta do furo — e um roteiro que "quase"
 * existe é pior do que nenhum, porque ele grava metade.
 */
export async function registrarMovimentoDotacao(
  tx: Tx,
  p: MovimentoDotacaoParams
): Promise<{ readonly movimentoId: string }> {
  // ⚠️ A COMPETÊNCIA É DECIDIDA UMA VEZ, AQUI, e a MESMA vai para o movimento e para a
  // perna do razão. Calcular `new Date()` duas vezes daria ao movimento e ao lançamento
  // instantes diferentes por alguns milissegundos — e uma consulta cortada exatamente
  // nessa fronteira veria um sem o outro.
  const competencia = p.data ?? new Date();

  // ⚠️ PERÍODO ABERTO, CONFERIDO PELA COMPETÊNCIA — e é um guard NOVO, não uma cópia do
  // que já havia. `exigirExercicioDaFichaAberto` olha o exercício da FICHA; este olha o
  // do FATO. Só os dois juntos fecham a antedatação para exercício encerrado.
  await exigirCompetenciaEmExercicioAberto(
    tx,
    competencia,
    `movimento de dotação ${p.tipo}`
  );

  const mov = await tx.movimentoDotacao.create({
    data: {
      fichaId: p.fichaId,
      tipo: p.tipo,
      valor: p.valor,
      origemTipo: p.origemTipo,
      origemId: p.origemId ?? null,
      estornoDeId: p.estornoDeId ?? null,
      criadoPor: p.criadoPor,
      competencia,
      // Quem não informou a data do fato não tem data do fato: a linha diz isso.
      competenciaDerivada: p.data === undefined,
    },
    select: { id: true },
  });

  if (!LANCA_PELO_ROTEIRO_ORCAMENTARIO[p.tipo]) {
    return { movimentoId: mov.id };
  }

  const roteiro = await tx.roteiroOrcamentario.findUnique({
    where: { tipo: p.tipo },
    select: {
      contaDebito: { select: { id: true, codigo: true, analitica: true } },
      contaCredito: { select: { id: true, codigo: true, analitica: true } },
    },
  });

  if (roteiro === null) {
    throw new Error(
      `ROTEIRO ORÇAMENTÁRIO NÃO PARAMETRIZADO para ${p.tipo}. O movimento de dotação ` +
        `TEM perna no razão — sem ela, o subsistema orçamentário volta a não refletir o ` +
        `orçamento (o furo de 46dfd5d: o crédito disponível debitado pelo empenho e ` +
        `nunca creditado pela LOA). Cadastre o RoteiroOrcamentario deste tipo. Nada foi ` +
        `gravado.`
    );
  }

  for (const c of [roteiro.contaDebito, roteiro.contaCredito]) {
    if (!c.analitica) {
      throw new Error(
        `Conta SINTÉTICA ${c.codigo} no roteiro orçamentário de ${p.tipo} — conta ` +
          `sintética não recebe partida.`
      );
    }
  }

  // ⚠️ AS DUAS PERNAS, NO SUBSISTEMA ORÇAMENTÁRIO. O motor do M01 valida ΣD == ΣC por
  // subsistema — um lançamento torto não chega ao banco.
  await lancarNoRazao(tx, {
    id: randomUUID(),
    numeroControle: `DOT-${p.tipo}-${mov.id}`,
    // A MESMA competência do movimento — ver acima.
    dataTransacao: competencia,
    historico: p.historico ?? `${p.tipo} na ficha ${p.fichaId}`,
    origemTipo: p.origemTipo,
    origemId: mov.id,
    // NORMAL: a dotação é um fato do exercício, não uma transferência de encerramento.
    natureza: "NORMAL",
    criadoPor: p.criadoPor,
    partidas: [
      {
        contaId: roteiro.contaDebito.id,
        tipo: "DEBITO",
        subsistema: "ORCAMENTARIO",
        valor: p.valor,
        // ⚠️ A FICHA VAI NA PARTIDA. É a dimensão orçamentária dela — e é ela que o
        // resolver do M14 usa para dizer a fonte, a natureza e a funcional desta linha.
        fichaId: p.fichaId,
      },
      {
        contaId: roteiro.contaCredito.id,
        tipo: "CREDITO",
        subsistema: "ORCAMENTARIO",
        valor: p.valor,
        fichaId: p.fichaId,
      },
    ],
  });

  return { movimentoId: mov.id };
}
