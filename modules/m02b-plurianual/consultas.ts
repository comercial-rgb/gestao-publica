import { type Money } from "../../packages/contracts/index.js";
import { resultadoPrimario } from "./dominio.js";
import { metasAnuaisVigentes } from "./comparativo.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * M02b — LEITURAS do planejamento plurianual.
 *
 * ⚠️ ESTE ARQUIVO NASCEU PARA PAGAR UMA DÍVIDA NOMEADA. `rreo-anexo6.ts` tinha
 * `META_FISCAL_LDO = null` com um docblock afirmando que *"não existe entidade de meta
 * fiscal neste repositório"*. Deixou de ser verdade quando `MetaAnualLdo` nasceu — e
 * documentação que afirma uma ausência já preenchida é pior que documentação nenhuma:
 * ela faz quem lê parar de procurar.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * A META FISCAL DE UM EXERCÍCIO.
 *
 * ⚠️ O TIPO É ESTRUTURAL DE PROPÓSITO — ele NÃO importa `MetaFiscalLdo` do M12. Importá-lo
 * criaria M02b → M12, e o M12 já importa o M02 (`m12/dominio.ts:60-63`,
 * `m12/adapter-m03.ts:11`). Seriam as duas direções, e um ciclo de módulos é a coisa que
 * nenhum dos dois `MODULO.md` conseguiria explicar depois.
 *
 * Tipagem estrutural resolve: o objeto devolvido aqui É um `MetaFiscalLdo` para o
 * TypeScript, sem que este arquivo saiba que aquele tipo existe.
 */
export interface MetaFiscalDoExercicio {
  readonly resultadoPrimario: Money;
  readonly resultadoNominal: Money;
}

export interface LeituraDaMetaFiscal {
  /** `null` quando não há meta declarada, ou quando há AMBIGUIDADE — ver o docblock. */
  readonly meta: MetaFiscalDoExercicio | null;
  /** O que impediu a leitura, quando impediu. Vai para as pendências do anexo. */
  readonly pendencia: string | null;
}

/**
 * A META FISCAL DECLARADA PARA O EXERCÍCIO — ou `null`, nomeando o porquê.
 *
 * ═══ ⚠️ TRÊS SAÍDAS, E A DO MEIO É A QUE IMPORTA ═══
 *
 * · UMA meta para o ano → devolve.
 * · NENHUMA → `null` sem pendência: o ente pode simplesmente não ter LDO cadastrada, e
 *   isso não é defeito do anexo.
 * · MAIS DE UMA → **`null` COM pendência**, e é aqui que a decisão está.
 *
 * A LDO projeta o exercício corrente e os DOIS seguintes (LRF art. 4º §1º). Então a LDO de
 * 2025 declara uma meta para 2026, e a LDO de 2026 declara OUTRA para o mesmo 2026 — as
 * duas legítimas, aprovadas em momentos diferentes.
 *
 * ⚠️ E O REPOSITÓRIO NÃO SABE QUAL VALE. O schema registra que a LDO de N orienta a LOA de
 * N+1 *"ou de N, conforme a lei orgânica do ente"* — a ambiguidade é do ordenamento, não
 * do código. Escolher "a mais recente" seria uma regra inventada aqui, e o RREO 6 é peça
 * de prestação de contas: confrontar o apurado contra a meta ERRADA é pior do que não
 * confrontar.
 *
 * Fica `null` e a pendência NOMEIA o conflito — a mesma doutrina que já governa este
 * anexo: *"sem meta, o anexo MOSTRA O RESULTADO E CALA; publicar 'meta: 0,00' faria
 * qualquer resultado positivo parecer cumprimento."*
 */
export async function metaFiscalDoExercicio(
  tx: Tx,
  exercicio: number
): Promise<LeituraDaMetaFiscal> {
  // ⚠️ PELO DONO DA DERIVAÇÃO (V18/C13), e não por `findMany` direto: quando uma lei altera a
  // meta fiscal, o ajuste fica ao lado da linha e o vigente é `original + soma dos ajustes`.
  // Ler a linha crua aqui faria o RREO Anexo 6 confrontar o resultado apurado contra a meta
  // REVOGADA — e publicar cumprimento de meta revogada é pior do que não confrontar. Com zero
  // atos o número é idêntico ao de antes, e é isso que a suíte deste arquivo prova.
  const candidatas = await metasAnuaisVigentes(tx, { ano: exercicio });

  if (candidatas.length === 0) return { meta: null, pendencia: null };

  if (candidatas.length > 1) {
    const quais = candidatas
      .map((c) => `LDO ${c.ldoExercicio}`)
      .sort()
      .join(", ");
    return {
      meta: null,
      pendencia:
        `META-FISCAL-AMBIGUA: ${candidatas.length} metas declaradas para o exercício ` +
        `${exercicio} (${quais}). A LDO projeta o ano corrente e os dois seguintes, então ` +
        `mais de uma pode falar do mesmo ano — e qual delas vale depende da lei orgânica ` +
        `do ente, que este repositório não modela. O confronto foi OMITIDO: comparar o ` +
        `apurado contra a meta errada é pior do que não comparar.`,
    };
  }

  const c = candidatas[0]!;
  return {
    meta: {
      // ⚠️ DERIVADO pela função do domínio — `resultadoPrimario` não é coluna, e a mesma
      // função alimenta o anexo da LDO e o exportador SIGA.
      resultadoPrimario: resultadoPrimario(c.vigente.receitaPrimaria, c.vigente.despesaPrimaria),
      resultadoNominal: c.vigente.resultadoNominal,
    },
    pendencia: null,
  };
}
