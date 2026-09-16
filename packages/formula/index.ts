import { Decimal } from "../contracts/index.js";

/**
 * ═══ A FÓRMULA EDITÁVEL PELO ENTE, NUM UNIVERSO FECHADO (V7 B1) ═══
 *
 * O cálculo de um tributo é norma do município: a alíquota, o fator e a própria conta saem de TABELA, não de código
 * (é a regra "nenhum código no código" do repositório). Para isso, o ente escreve uma expressão — e é aqui que ela é
 * interpretada.
 *
 * ⚠️ NUNCA `eval`, `new Function` NEM LISTA NEGRA. `this.constructor.constructor("...")()` atravessa qualquer lista de
 * palavras proibidas, e uma fórmula digitada na tela é entrada de usuário. Este interpretador tem UNIVERSO FECHADO:
 *   · números decimais (ponto decimal) e nomes de VARIÁVEIS declaradas por quem chama;
 *   · + − × ÷ com precedência, parênteses e o sinal unário;
 *   · as funções `min`, `max`, `arredondar(x, casas)`, `teto`, `piso` e `se(condicao, entao, senao)`;
 *   · comparações `<`, `<=`, `>`, `>=`, `=`, `<>` (só dentro de `se`).
 * Qualquer outro caractere, nome ou função é RECUSADO com o motivo e a posição. Não há acesso a objeto, propriedade,
 * cadeia de protótipo, chamada dinâmica ou I/O: o avaliador só vê números.
 *
 * ⚠️ DINHEIRO É `Decimal`. Toda conta roda em Decimal (sem `number`), e quem chama decide o arredondamento final.
 * Divisão por zero é recusa nomeada, não `Infinity`.
 */

export class FormulaInvalidaError extends Error {
  constructor(
    message: string,
    readonly posicao: number
  ) {
    super(message);
    this.name = "FormulaInvalidaError";
  }
}

type Tipo = "numero" | "nome" | "operador" | "abre" | "fecha" | "virgula";
interface Token {
  readonly tipo: Tipo;
  readonly texto: string;
  readonly posicao: number;
}

const OPERADORES = ["+", "-", "*", "/", "<=", ">=", "<>", "<", ">", "="] as const;
const FUNCOES: Readonly<Record<string, number>> = { min: 2, max: 2, arredondar: 2, teto: 1, piso: 1, se: 3 };
const PRECEDENCIA: Readonly<Record<string, number>> = { "<": 1, "<=": 1, ">": 1, ">=": 1, "=": 1, "<>": 1, "+": 2, "-": 2, "*": 3, "/": 3 };

/** O nome de variável ou função: letras (com acento), números, `_` e `.`, começando por letra. */
const NOME = /^[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_.]*/;

export function tokenizar(formula: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < formula.length) {
    const c = formula[i]!;
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (c === "(") {
      tokens.push({ tipo: "abre", texto: c, posicao: i });
      i += 1;
      continue;
    }
    if (c === ")") {
      tokens.push({ tipo: "fecha", texto: c, posicao: i });
      i += 1;
      continue;
    }
    if (c === ",") {
      tokens.push({ tipo: "virgula", texto: c, posicao: i });
      i += 1;
      continue;
    }
    const op = OPERADORES.find((o) => formula.startsWith(o, i));
    if (op !== undefined) {
      tokens.push({ tipo: "operador", texto: op, posicao: i });
      i += op.length;
      continue;
    }
    const numero = /^\d+(\.\d+)?/.exec(formula.slice(i));
    if (numero !== null) {
      tokens.push({ tipo: "numero", texto: numero[0], posicao: i });
      i += numero[0].length;
      continue;
    }
    const nome = NOME.exec(formula.slice(i));
    if (nome !== null) {
      tokens.push({ tipo: "nome", texto: nome[0], posicao: i });
      i += nome[0].length;
      continue;
    }
    throw new FormulaInvalidaError(`CARACTERE-NAO-PERMITIDO: "${c}" na posição ${i + 1}. A fórmula usa números, nomes de variáveis, + − * / , ( ) e as funções ${Object.keys(FUNCOES).join(", ")}.`, i);
  }
  return tokens;
}

type No =
  | { readonly tipo: "numero"; readonly valor: string }
  | { readonly tipo: "variavel"; readonly nome: string; readonly posicao: number }
  | { readonly tipo: "operacao"; readonly operador: string; readonly esquerda: No; readonly direita: No; readonly posicao: number }
  | { readonly tipo: "chamada"; readonly funcao: string; readonly argumentos: readonly No[]; readonly posicao: number };

/** Análise sintática descendente com precedência (Pratt simplificado) — a árvore é o único produto. */
export function analisar(formula: string): No {
  const tokens = tokenizar(formula);
  let pos = 0;
  const olhar = (): Token | undefined => tokens[pos];
  const consumir = (): Token => {
    const t = tokens[pos];
    if (t === undefined) throw new FormulaInvalidaError("FORMULA-INCOMPLETA: a expressão termina antes do fim.", formula.length);
    pos += 1;
    return t;
  };

  const primario = (): No => {
    const t = consumir();
    if (t.tipo === "numero") return { tipo: "numero", valor: t.texto };
    if (t.tipo === "operador" && (t.texto === "-" || t.texto === "+")) {
      const dentro = primario();
      return t.texto === "-" ? { tipo: "operacao", operador: "-", esquerda: { tipo: "numero", valor: "0" }, direita: dentro, posicao: t.posicao } : dentro;
    }
    if (t.tipo === "abre") {
      const dentro = expressao(0);
      const fecha = consumir();
      if (fecha.tipo !== "fecha") throw new FormulaInvalidaError(`PARENTESE-NAO-FECHADO: falta ")" na posição ${fecha.posicao + 1}.`, fecha.posicao);
      return dentro;
    }
    if (t.tipo === "nome") {
      const seguinte = olhar();
      if (seguinte?.tipo === "abre") {
        const aridade = FUNCOES[t.texto.toLowerCase()];
        if (aridade === undefined) {
          throw new FormulaInvalidaError(`FUNCAO-DESCONHECIDA: "${t.texto}" na posição ${t.posicao + 1}. As funções são ${Object.keys(FUNCOES).join(", ")}.`, t.posicao);
        }
        consumir();
        const argumentos: No[] = [];
        if (olhar()?.tipo !== "fecha") {
          argumentos.push(expressao(0));
          while (olhar()?.tipo === "virgula") {
            consumir();
            argumentos.push(expressao(0));
          }
        }
        const fecha = consumir();
        if (fecha.tipo !== "fecha") throw new FormulaInvalidaError(`PARENTESE-NAO-FECHADO: falta ")" ao fim de ${t.texto}.`, fecha.posicao);
        if (argumentos.length !== aridade) {
          throw new FormulaInvalidaError(`ARGUMENTOS-DA-FUNCAO: ${t.texto} recebe ${aridade} argumento(s) e recebeu ${argumentos.length}.`, t.posicao);
        }
        return { tipo: "chamada", funcao: t.texto.toLowerCase(), argumentos, posicao: t.posicao };
      }
      return { tipo: "variavel", nome: t.texto, posicao: t.posicao };
    }
    throw new FormulaInvalidaError(`EXPRESSAO-INESPERADA: "${t.texto}" na posição ${t.posicao + 1}.`, t.posicao);
  };

  const expressao = (minima: number): No => {
    let esquerda = primario();
    for (;;) {
      const t = olhar();
      if (t === undefined || t.tipo !== "operador") break;
      const prec = PRECEDENCIA[t.texto];
      if (prec === undefined || prec < minima) break;
      consumir();
      const direita = expressao(prec + 1);
      esquerda = { tipo: "operacao", operador: t.texto, esquerda, direita, posicao: t.posicao };
    }
    return esquerda;
  };

  const arvore = expressao(0);
  if (pos !== tokens.length) {
    const t = tokens[pos]!;
    throw new FormulaInvalidaError(`SOBRA-NA-FORMULA: "${t.texto}" na posição ${t.posicao + 1} não faz parte da expressão.`, t.posicao);
  }
  return arvore;
}

/** Os nomes de variável que a fórmula usa — para conferir, ANTES de calcular, se o cadastro os fornece. */
export function variaveisDaFormula(formula: string): readonly string[] {
  const vistos = new Set<string>();
  const andar = (n: No): void => {
    if (n.tipo === "variavel") vistos.add(n.nome);
    else if (n.tipo === "operacao") {
      andar(n.esquerda);
      andar(n.direita);
    } else if (n.tipo === "chamada") for (const a of n.argumentos) andar(a);
  };
  andar(analisar(formula));
  return [...vistos].sort();
}

export interface PassoDaMemoria {
  readonly expressao: string;
  readonly valor: string;
}

/**
 * Calcula a fórmula com as variáveis dadas. Devolve o valor e a MEMÓRIA: cada variável usada com o seu valor, para que
 * a conta seja conferível por quem lê. Variável que o cadastro não forneceu é recusa nomeada — nunca zero em silêncio.
 */
export function calcular(formula: string, variaveis: Readonly<Record<string, Decimal.Value>>): { readonly valor: Decimal; readonly memoria: readonly PassoDaMemoria[] } {
  const arvore = analisar(formula);
  const usadas = new Map<string, Decimal>();
  const bool = (b: boolean): Decimal => new Decimal(b ? 1 : 0);
  const avaliar = (n: No): Decimal => {
    if (n.tipo === "numero") return new Decimal(n.valor);
    if (n.tipo === "variavel") {
      const bruto = variaveis[n.nome];
      if (bruto === undefined) {
        throw new FormulaInvalidaError(`VARIAVEL-DESCONHECIDA: "${n.nome}" não é um dado do cadastro nem um parâmetro desta tabela. Disponíveis: ${Object.keys(variaveis).sort().join(", ") || "nenhuma"}.`, n.posicao);
      }
      const v = new Decimal(bruto);
      usadas.set(n.nome, v);
      return v;
    }
    if (n.tipo === "chamada") {
      if (n.funcao === "se") {
        const condicao = avaliar(n.argumentos[0]!);
        return condicao.isZero() ? avaliar(n.argumentos[2]!) : avaliar(n.argumentos[1]!);
      }
      const args = n.argumentos.map(avaliar);
      if (n.funcao === "min") return Decimal.min(args[0]!, args[1]!);
      if (n.funcao === "max") return Decimal.max(args[0]!, args[1]!);
      if (n.funcao === "teto") return args[0]!.ceil();
      if (n.funcao === "piso") return args[0]!.floor();
      const casas = args[1]!;
      if (!casas.isInteger() || casas.lt(0) || casas.gt(8)) throw new FormulaInvalidaError(`ARREDONDAMENTO-INVALIDO: as casas de arredondar são um inteiro de 0 a 8 (veio ${casas.toString()}).`, n.posicao);
      return args[0]!.toDecimalPlaces(casas.toNumber(), Decimal.ROUND_HALF_EVEN);
    }
    const a = avaliar(n.esquerda);
    const b = avaliar(n.direita);
    switch (n.operador) {
      case "+": return a.plus(b);
      case "-": return a.minus(b);
      case "*": return a.times(b);
      case "/":
        if (b.isZero()) throw new FormulaInvalidaError(`DIVISAO-POR-ZERO: a fórmula divide por zero na posição ${n.posicao + 1}.`, n.posicao);
        return a.dividedBy(b);
      case "<": return bool(a.lt(b));
      case "<=": return bool(a.lte(b));
      case ">": return bool(a.gt(b));
      case ">=": return bool(a.gte(b));
      case "=": return bool(a.eq(b));
      case "<>": return bool(!a.eq(b));
      default:
        throw new FormulaInvalidaError(`OPERADOR-DESCONHECIDO: "${n.operador}".`, n.posicao);
    }
  };
  const valor = avaliar(arvore);
  return { valor, memoria: [...usadas.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([expressao, v]) => ({ expressao, valor: v.toString() })) };
}
