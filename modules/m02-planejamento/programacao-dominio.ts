import { Decimal } from "decimal.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M02 — A ARITMÉTICA PURA da programação financeira (CMD/MBA). TR 4.18.
 *
 * ═══ ⚠️ A DISTRIBUIÇÃO TEM DE FECHAR AO CENTAVO — E É AQUI QUE ISSO SE PROVA ═══
 * "CMD com base nos valores da LOA" (4.18) é: pegue a previsão da fonte e divida em 12 meses.
 * Mas 100.000 / 12 = 8.333,3333... — e doze parcelas de 8.333,33 somam 99.999,96, QUATRO
 * centavos a menos que a LOA. Um cronograma que não fecha com a lei é um cronograma que o TCE
 * devolve.
 *
 * A regra é a do arredondamento honesto: cada parcela leva o valor truncado a 2 casas, e o
 * ÚLTIMO período absorve a diferença acumulada. Σ das parcelas == total, SEMPRE, exato. É pura
 * (Decimal, sem I/O), então o t1 a exercita com a conta na mão.
 */

/**
 * Distribui `total` em `n` parcelas iguais, com o RESTO no último período.
 *
 * ⚠️ NÃO é `total/n` arredondado n vezes (isso perde ou ganha centavos). É: as (n−1) primeiras
 * parcelas levam `floor2(total/n)`, e a última leva `total − Σ das anteriores`. Assim a soma é
 * IDÊNTICA ao total, ao centavo — a diferença mora toda na última, visível e explicável.
 */
export function distribuirEmParcelas(
  total: Money,
  n: number
): readonly Money[] {
  if (n <= 0) {
    throw new Error(`Número de parcelas tem de ser > 0 (recebido ${n}).`);
  }
  if (total.lessThan(0)) {
    throw new Error(
      `Distribuição de valor NEGATIVO (${total.toFixed(2)}): a previsão de uma fonte pode ser ` +
        `zero, mas não negativa. Uma fonte com dedução líquida negativa não gera cronograma de ` +
        `desembolso — ela não tem o que desembolsar.`
    );
  }

  // floor a 2 casas: trunca para baixo, sem arredondar (senão a última parcela poderia ficar
  // NEGATIVA quando o resto fosse pequeno e o arredondamento subisse as anteriores).
  //
  // ⚠️ A DIVISÃO CRUA vai direto ao `truncar2` — NÃO passa por `toMoney` antes, que
  // arredondaria (HALF_EVEN) 16.666,6667 para 16.666,67 e desfaria o truncamento.
  const base = truncar2(total.dividedBy(n) as Money);

  const parcelas: Money[] = [];
  let acumulado = toMoney("0.00");
  for (let i = 0; i < n - 1; i++) {
    parcelas.push(base);
    acumulado = toMoney(acumulado.plus(base));
  }
  // ⚠️ A ÚLTIMA ABSORVE O RESTO — é ela que faz Σ == total, exato.
  parcelas.push(toMoney(total.minus(acumulado)));
  return parcelas;
}

/**
 * Trunca a 2 casas SEM arredondar (ROUND_DOWN) — ver o cabeçalho de `distribuirEmParcelas`.
 *
 * ⚠️ NÃO É `toFixed(2)` — esse ARREDONDA (16.666,6667 → 16.666,67), e o arredondamento para
 * CIMA nas parcelas base faria a última parcela ficar MENOR (às vezes negativa). O truncamento
 * para baixo garante que a última seja sempre >= as outras, absorvendo o resto POSITIVO.
 */
function truncar2(v: Money): Money {
  // valores aqui são sempre >= 0 (guardado em `distribuirEmParcelas`), então DOWN == FLOOR.
  return toMoney(v.toDecimalPlaces(2, Decimal.ROUND_DOWN));
}

/**
 * A proposta de CMD: 12 cotas por fonte (uma por mês), Σ == previsão da fonte.
 *
 * Recebe o `Map<fonteId, previsão>` que `previsaoPorFonte` (d62ae98) já produz — o gerador NÃO
 * relê a LOA, ele DISTRIBUI o que a leitura da LOA deu. É o 4.18 "com base nos valores da LOA".
 */
export function proporCotasDaLoa(
  previsaoPorFonte: ReadonlyMap<string, Money>
): ReadonlyMap<string, readonly Money[]> {
  const out = new Map<string, readonly Money[]>();
  for (const [fonteId, previsao] of previsaoPorFonte) {
    // Fonte com previsão líquida <= 0 não entra no cronograma (nada a desembolsar).
    if (previsao.lessThanOrEqualTo(0)) continue;
    out.set(fonteId, distribuirEmParcelas(previsao, 12));
  }
  return out;
}

/** A proposta de MBA: 6 metas por fonte (uma por bimestre), Σ == previsão da fonte. */
export function proporMetasDaLoa(
  previsaoPorFonte: ReadonlyMap<string, Money>
): ReadonlyMap<string, readonly Money[]> {
  const out = new Map<string, readonly Money[]>();
  for (const [fonteId, previsao] of previsaoPorFonte) {
    if (previsao.lessThanOrEqualTo(0)) continue;
    out.set(fonteId, distribuirEmParcelas(previsao, 6));
  }
  return out;
}

/** O bimestre (1-6) de um mês (1-12). Jan/fev = 1, mar/abr = 2, ... */
export function bimestreDoMes(mes: number): number {
  if (mes < 1 || mes > 12) {
    throw new Error(`Mês fora de 1..12: ${mes}.`);
  }
  return Math.ceil(mes / 2);
}

// ═══════════════════════════════════════════════════════════════════════════
// O MODELO DE DECRETO — função PURA de texto (TR 4.19/4.24)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ OS PLACEHOLDERS SÃO NOMEADOS, E FALTAR UM É ERRO — não um `{ato}` cru no papel.
 *
 * Um template de decreto que deixasse `{ato}` literal no texto publicado seria pior do que não
 * ter template: o decreto sairia com um buraco visível. Então o gerador FALHA se o template
 * pedir um placeholder que os dados não têm, e FALHA se sobrar um `{...}` não substituído.
 */
export function gerarTextoDecreto(
  template: string,
  dados: Readonly<Record<string, string>>
): string {
  let texto = template;
  for (const [chave, valor] of Object.entries(dados)) {
    texto = texto.split(`{${chave}}`).join(valor);
  }

  // ⚠️ FAIL-CLOSED: sobrou algum `{placeholder}` sem dado? O decreto não sai com buraco.
  const faltantes = [...texto.matchAll(/\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]);
  if (faltantes.length > 0) {
    throw new Error(
      `TEMPLATE DE DECRETO COM PLACEHOLDER SEM DADO: {${[...new Set(faltantes)].join("}, {")}}. ` +
        `Um decreto publicado com "{ato}" no lugar do número é um decreto com buraco — pior do ` +
        `que não ter template. Forneça todos os dados, ou tire o placeholder do template.`
    );
  }
  return texto;
}

/**
 * O TEMPLATE DEFAULT do decreto de CMD (TR 4.19). Sai daqui quando o ente não cadastrou o seu
 * (`TemplateDecreto`) — a mesma anatomia do roteiro default: o código dá um, o ente troca.
 */
export const TEMPLATE_CMD_DEFAULT =
  "DECRETO Nº {ato}\n\n" +
  "Dispõe sobre o Cronograma Mensal de Desembolso do exercício de {exercicio}, " +
  "nos termos do art. 8º da Lei Complementar nº 101/2000.\n\n" +
  "O PREFEITO MUNICIPAL, no uso de suas atribuições, DECRETA:\n\n" +
  "Art. 1º Fica aprovado o Cronograma Mensal de Desembolso do exercício de {exercicio}, " +
  "na forma do anexo, com base nos valores fixados na Lei Orçamentária Anual.\n\n" +
  "{corpo}\n\n" +
  "Art. 2º Este decreto entra em vigor na data de sua publicação, com efeitos a partir de " +
  "{data}.";

export const TEMPLATE_MBA_DEFAULT =
  "DECRETO Nº {ato}\n\n" +
  "Dispõe sobre as Metas Bimestrais de Arrecadação do exercício de {exercicio}, " +
  "nos termos do art. 13 da Lei Complementar nº 101/2000.\n\n" +
  "O PREFEITO MUNICIPAL, no uso de suas atribuições, DECRETA:\n\n" +
  "Art. 1º Ficam aprovadas as Metas Bimestrais de Arrecadação do exercício de {exercicio}, " +
  "desdobrando a receita prevista na Lei Orçamentária Anual.\n\n" +
  "{corpo}\n\n" +
  "Art. 2º Este decreto entra em vigor na data de sua publicação, com efeitos a partir de " +
  "{data}.";
