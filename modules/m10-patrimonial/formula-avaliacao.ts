import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * ═══ A FÓRMULA DE AVALIAÇÃO PATRIMONIAL (TR 5.19.42) ═══
 *
 * > "Permitir realizar avaliações patrimoniais a partir de fórmulas previamente
 * > cadastradas, podendo ser **editadas pelo próprio usuário**."
 *
 * ═══ ⚠️⚠️ FÓRMULA EDITÁVEL PELO USUÁRIO É CÓDIGO ESCRITO PELO USUÁRIO ═══
 *
 * A implementação óbvia desta cláusula é `eval(formula)` ou `new Function(formula)`, e as
 * duas entregam a quem puder editar o cadastro a capacidade de executar QUALQUER COISA no
 * processo do servidor: ler `process.env` (onde está a URL do banco com a senha), abrir
 * conexão de rede, apagar tabela. O usuário que edita a fórmula é um servidor do
 * patrimônio — não é ele o adversário; o adversário é quem obtiver a senha dele.
 *
 * ⚠️ E A "SANITIZAÇÃO" NÃO RESOLVE. Bloquear `require`, `process` e `import` por lista
 * negra é a forma clássica de perder: `this.constructor.constructor("...")()` alcança o
 * `Function` global sem escrever nenhuma das palavras proibidas.
 *
 * ═══ POR ISSO ESTE ARQUIVO É UM INTERPRETADOR, E NÃO UM FILTRO ═══
 * Ele tokeniza, faz a análise sintática e AVALIA — sobre um universo FECHADO:
 *
 *   · quatro operações: `+`, `-`, `*`, `/`;
 *   · parênteses;
 *   · números literais (com ponto decimal);
 *   · e um rol FECHADO de grandezas do bem, abaixo.
 *
 * Não existe identificador global, chamada de função, acesso a propriedade nem literal de
 * string na gramática. O que não está na gramática não é "bloqueado": é INEXPRIMÍVEL.
 *
 * ⚠️ E TUDO É `Decimal`. A avaliação produz DINHEIRO, e dinheiro neste projeto nunca
 * passa por `number` — a divisão por 3 em ponto flutuante já custaria centavos no primeiro
 * bem reavaliado.
 */

/**
 * AS GRANDEZAS QUE A FÓRMULA ENXERGA — e nada além disto existe para ela.
 *
 * ⚠️ O ROL É FECHADO E CRESCE POR DECISÃO. Acrescentar aqui é dar ao usuário acesso a um
 * dado novo; e é uma linha de código com revisão, não uma configuração.
 */
export interface GrandezasDoBem {
  /** Σ dos movimentos que aumentam o valor bruto (aquisição, custo subsequente…). */
  readonly valorBruto: Money;
  /** Σ da depreciação/amortização/exaustão acumulada, positiva. */
  readonly acumulada: Money;
  /** valorBruto − acumulada. */
  readonly valorContabil: Money;
  /** Idade do bem em meses civis, da aquisição até a data da avaliação. */
  readonly idadeMeses: Money;
  /** Vida útil parametrizada da classe, em meses. */
  readonly vidaUtilMeses: Money;
  /** Fração residual parametrizada da classe (0 a 1). */
  readonly percentualResidual: Money;
}

export const NOMES_DAS_GRANDEZAS: readonly (keyof GrandezasDoBem)[] = [
  "valorBruto",
  "acumulada",
  "valorContabil",
  "idadeMeses",
  "vidaUtilMeses",
  "percentualResidual",
];

type Token =
  | { readonly t: "numero"; readonly v: Decimal }
  | { readonly t: "grandeza"; readonly v: keyof GrandezasDoBem }
  | { readonly t: "op"; readonly v: "+" | "-" | "*" | "/" }
  | { readonly t: "abre" }
  | { readonly t: "fecha" };

const NOMES = new Set<string>(NOMES_DAS_GRANDEZAS as readonly string[]);

/**
 * ⚠️ O TOKENIZADOR RECUSA O CARACTERE DESCONHECIDO, em vez de ignorá-lo.
 *
 * Ignorar seria a porta: `valorBruto; drop()` viraria `valorBruto` silenciosamente, e a
 * pessoa que escreveu a fórmula acharia que ela faz o que ela leu. Uma fórmula que o
 * sistema entende PELA METADE é pior que uma recusada — ela produz um número plausível.
 */
export function tokenizar(expressao: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < expressao.length) {
    const c = expressao[i] as string;

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ t: "abre" });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ t: "fecha" });
      i += 1;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    if (c >= "0" && c <= "9") {
      let j = i;
      while (j < expressao.length) {
        const d = expressao[j] as string;
        if ((d >= "0" && d <= "9") || d === ".") j += 1;
        else break;
      }
      const cru = expressao.slice(i, j);
      // `new Decimal` recusa "1.2.3" sozinho — e recusar é o que se quer.
      let numero: Decimal;
      try {
        numero = new Decimal(cru);
      } catch {
        throw new Error(
          `Número inválido "${cru}" na posição ${i} da fórmula. Use ponto como separador ` +
            `decimal, uma vez só.`
        );
      }
      tokens.push({ t: "numero", v: numero });
      i = j;
      continue;
    }
    if ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z")) {
      let j = i;
      while (j < expressao.length) {
        const d = expressao[j] as string;
        if ((d >= "a" && d <= "z") || (d >= "A" && d <= "Z")) j += 1;
        else break;
      }
      const nome = expressao.slice(i, j);
      if (!NOMES.has(nome)) {
        throw new Error(
          `"${nome}" não é uma grandeza do bem. A fórmula só enxerga: ` +
            `${NOMES_DAS_GRANDEZAS.join(", ")}. Nada mais existe para ela — não há ` +
            `função, variável global nem propriedade nesta gramática.`
        );
      }
      tokens.push({ t: "grandeza", v: nome as keyof GrandezasDoBem });
      i = j;
      continue;
    }

    throw new Error(
      `Caractere "${c}" (posição ${i}) não pertence à linguagem de fórmulas. Ela tem ` +
        `apenas números, as grandezas do bem, os operadores + - * / e parênteses. ` +
        `Recusar é deliberado: uma fórmula entendida pela metade produz um número ` +
        `plausível e errado.`
    );
  }

  if (tokens.length === 0) {
    throw new Error("Fórmula vazia — não há o que avaliar.");
  }
  return tokens;
}

/**
 * Avalia a expressão sobre as grandezas. Precedência: `*` e `/` antes de `+` e `-`;
 * parênteses mandam; `-` unário é aceito (`-valorBruto`, `2 * -1`).
 *
 * Descida recursiva, três níveis — a gramática inteira cabe em vinte linhas, e é isso que
 * torna a ausência de brechas VERIFICÁVEL por leitura.
 */
export function avaliarFormula(
  expressao: string,
  grandezas: GrandezasDoBem
): Money {
  const tokens = tokenizar(expressao);
  let pos = 0;

  const espiar = (): Token | undefined => tokens[pos];

  function expr(): Decimal {
    let valor = termo();
    for (;;) {
      const t = espiar();
      if (t === undefined || t.t !== "op" || (t.v !== "+" && t.v !== "-")) return valor;
      pos += 1;
      const direita = termo();
      valor = t.v === "+" ? valor.plus(direita) : valor.minus(direita);
    }
  }

  function termo(): Decimal {
    let valor = fator();
    for (;;) {
      const t = espiar();
      if (t === undefined || t.t !== "op" || (t.v !== "*" && t.v !== "/")) return valor;
      pos += 1;
      const direita = fator();
      if (t.v === "/") {
        // ⚠️ DIVISÃO POR ZERO RECUSA. `Decimal` lançaria sozinho, mas com uma mensagem
        // que não diz de qual fórmula se trata — e quem vai ler é quem digitou a fórmula.
        if (direita.isZero()) {
          throw new Error(
            `Divisão por zero na fórmula. Verifique a grandeza do denominador: um bem com ` +
              `vida útil zero, por exemplo, torna a divisão impossível.`
          );
        }
        // 6 casas na etapa intermediária: arredondar a 2 aqui empurraria o erro para a
        // multiplicação seguinte.
        valor = valor.dividedBy(direita).toDecimalPlaces(6);
      } else {
        valor = valor.times(direita);
      }
    }
  }

  function fator(): Decimal {
    const t = espiar();
    if (t === undefined) {
      throw new Error("Fórmula termina onde esperava um número, uma grandeza ou '('.");
    }
    if (t.t === "op" && t.v === "-") {
      pos += 1;
      return fator().negated();
    }
    if (t.t === "op" && t.v === "+") {
      pos += 1;
      return fator();
    }
    if (t.t === "numero") {
      pos += 1;
      return t.v;
    }
    if (t.t === "grandeza") {
      pos += 1;
      return toMoney(grandezas[t.v]);
    }
    if (t.t === "abre") {
      pos += 1;
      const dentro = expr();
      const fecha = espiar();
      if (fecha === undefined || fecha.t !== "fecha") {
        throw new Error("Parêntese aberto e não fechado na fórmula.");
      }
      pos += 1;
      return dentro;
    }
    if (t.t === "fecha") {
      throw new Error("Parêntese fechado sem abertura correspondente na fórmula.");
    }
    // ⚠️ A MENSAGEM NOMEIA O QUE ACHOU. A primeira versão dizia "parêntese fechado sem
    // abertura" para QUALQUER token inesperado — e um teste que escrevi errado (`1 // 2`,
    // que são duas divisões seguidas) caiu com essa mensagem e me mandou procurar
    // parêntese onde havia operador. Mensagem de erro que aponta o lugar errado custa mais
    // que a ausência dela.
    throw new Error(
      `Operador "${t.v}" onde a fórmula esperava um número, uma grandeza ou '(' — ` +
        `provavelmente há dois operadores seguidos.`
    );
  }

  const resultado = expr();
  if (pos !== tokens.length) {
    throw new Error(
      `Sobra na fórmula a partir da posição ${pos}: há conteúdo depois do fim da ` +
        `expressão. Provavelmente falta um operador.`
    );
  }
  // O resultado é DINHEIRO: duas casas, como todo valor deste projeto.
  return resultado.toDecimalPlaces(2);
}

/**
 * VALIDA A FÓRMULA NO CADASTRO, antes de ela ser salva.
 *
 * ⚠️ FAIL-CLOSED NA HORA DE GUARDAR, e não só na de usar: uma fórmula inválida salva
 * ficaria esperando o dia da avaliação para quebrar — e aí quem a digitou já esqueceu o
 * que quis dizer. As grandezas de prova são todas 1 para não dividir por zero à toa.
 */
export function validarFormula(expressao: string): void {
  avaliarFormula(expressao, {
    valorBruto: new Decimal(1),
    acumulada: new Decimal(1),
    valorContabil: new Decimal(1),
    idadeMeses: new Decimal(1),
    vidaUtilMeses: new Decimal(1),
    percentualResidual: new Decimal(1),
  });
}
