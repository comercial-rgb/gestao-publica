import { toMoney, type Money } from "../contracts/index.js";

/**
 * A SOMA LÍQUIDA DE REGISTROS APPEND-ONLY — a aritmética ÚNICA do repositório.
 *
 * ═══ POR QUE ELA VIROU UM PACOTE ═══
 * Ela nascera no M08 (`somaLiquidaEstornaveis`) e o M06 tinha uma CÓPIA dela
 * (`pagoLiquido`), porque `m06 → m08` seria um ciclo. Duas cópias da mesma soma é o
 * bug 345af7d esperando: basta uma delas aprender um caso novo. A anulação PARCIAL
 * (TR 5.35) é exatamente esse caso novo — e ela obrigaria a ensinar as duas.
 *
 * Agora a soma é UMA, e mora abaixo de todos.
 *
 * ═══ AS DUAS FORMAS DE DESFAZER UM FATO, E POR QUE ELAS SÃO DIFERENTES ═══
 * · ANULAÇÃO TOTAL (`estornoDeId`): o fato inteiro deixa de valer. O original SAI da
 *   soma, e a anulação também (ela não é um fato novo — é a negação de um).
 * · ANULAÇÃO PARCIAL (`anulacaoParcialDeId`): o fato CONTINUA valendo, por MENOS. O
 *   original FICA na soma, e a parcial é SUBTRAÍDA dele.
 *
 * ⚠️ TRATAR A PARCIAL COMO ESTORNO ZERARIA O FATO INTEIRO. Um pagamento de 2.500 com
 * anulação parcial de 1.000 vale 1.500 — e não zero, que é o que a leitura antiga
 * responderia se a parcial usasse `estornoDeId`. Foi este o motivo de a parcial ter
 * uma coluna PRÓPRIA: sem ela, a fila do art. 141, o saldo do contrato, o superávit
 * por fonte e o relatório de restos passariam TODOS a mentir, cada um do seu jeito.
 *
 * ⚠️ E A PARCIAL TAMBÉM SE ESTORNA: um `estornoDeId` apontando para a parcial a
 * neutraliza — ela deixa de estar viva e volta a não subtrair nada. É por isso que a
 * regra abaixo é "parciais VIVAS", e não "todas as parciais".
 */
export interface LinhaEstornavel {
  readonly id: string;
  readonly valor: Money;
  /** Anulação TOTAL: este registro NEGA o que ele aponta. */
  readonly estornoDeId: string | null;
  /** Anulação PARCIAL (TR 5.35): este registro REDUZ o que ele aponta. */
  readonly anulacaoParcialDeId?: string | null | undefined;
}

/**
 * Σ dos originais VIVOS, cada um já descontado das suas parciais VIVAS.
 *
 * "Vivo" = não é anulação (nem total, nem parcial) e não foi anulado TOTALMENTE.
 */
export function somaLiquidaEstornaveis(
  linhas: readonly LinhaEstornavel[]
): Money {
  const estornados = new Set(
    linhas.filter((l) => l.estornoDeId !== null).map((l) => l.estornoDeId!)
  );

  const ehParcial = (l: LinhaEstornavel): boolean =>
    (l.anulacaoParcialDeId ?? null) !== null;
  const estaViva = (l: LinhaEstornavel): boolean =>
    l.estornoDeId === null && !estornados.has(l.id);

  // As parciais VIVAS, agrupadas pelo fato que elas reduzem.
  const reducoes = new Map<string, Money>();
  for (const l of linhas) {
    if (!ehParcial(l) || !estaViva(l)) continue;
    const alvo = l.anulacaoParcialDeId!;
    reducoes.set(alvo, toMoney((reducoes.get(alvo) ?? toMoney("0.00")).plus(l.valor)));
  }

  let total = toMoney("0.00");
  for (const l of linhas) {
    if (ehParcial(l)) continue; // a parcial não soma: ela SUBTRAI (acima)
    if (!estaViva(l)) continue; // anulação total, ou original anulado
    const liquido = toMoney(l.valor.minus(reducoes.get(l.id) ?? toMoney("0.00")));
    total = toMoney(total.plus(liquido));
  }
  return total;
}

/**
 * O LÍQUIDO DE UM ÚNICO FATO — o mesmo cálculo, recortado.
 *
 * Devolve 0,00 se o fato foi anulado TOTALMENTE (ou se ele próprio é uma anulação).
 */
export function liquidoDoFato(
  fatoId: string,
  linhas: readonly LinhaEstornavel[]
): Money {
  const alvo = linhas.find((l) => l.id === fatoId);
  if (alvo === undefined) return toMoney("0.00");
  return somaLiquidaEstornaveis(
    linhas.filter((l) => l.id === fatoId || l.anulacaoParcialDeId === fatoId)
  );
}
