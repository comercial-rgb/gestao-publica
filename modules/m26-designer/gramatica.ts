import { Decimal } from "decimal.js";

/**
 * M26 — A GRAMÁTICA DOS CAMPOS CALCULADOS.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE, EM VEZ DE UM `eval` ═══
 * O prompt do lote pede "campos calculados por gramática segura: funções permitidas,
 * limite de execução, Decimal, sem eval e sem SQL livre do usuário".
 *
 * A tentação, sempre, é `new Function("linha", "return " + expressao)`. Ela funciona no
 * primeiro dia e entrega o processo inteiro no segundo: a expressão do usuário passa a
 * poder ler `process.env`, abrir arquivos, fazer requisições e derrubar o servidor com
 * um laço. Nenhuma lista de proibições em cima de `eval` fecha isso — a linguagem é
 * grande demais para ser cercada por fora.
 *
 * Aqui a linguagem é PEQUENA POR CONSTRUÇÃO. Ela tem números, textos, os quatro
 * operadores, comparações, e as funções desta lista. Não tem acesso a variável global,
 * não tem laço, não tem propriedade de objeto, não tem `import`. O que ela não sabe
 * fazer, ela não faz — e não porque alguém a proibiu.
 *
 * ═══ ⚠️ E ELA TEM LIMITE DE EXECUÇÃO ═══
 * Mesmo sem laço, uma expressão profunda o bastante (`1+1+1+...`) custa tempo. O
 * avaliador conta passos e ESTOURA no limite. Um relatório que roda para sempre é uma
 * negação de serviço escrita pelo próprio usuário, sem má intenção nenhuma.
 *
 * ═══ ⚠️ ARITMÉTICA EM DECIMAL ═══
 * `0.1 + 0.2` em float é `0.30000000000000004`, e um relatório financeiro que some assim
 * fecha errado por centavos que ninguém encontra. É a mesma regra do núcleo.
 */

// ═══════════════════════════════════════════════════════════════════════════
// OS TOKENS
// ═══════════════════════════════════════════════════════════════════════════

type Token =
  | { readonly t: "num"; readonly v: string }
  | { readonly t: "txt"; readonly v: string }
  | { readonly t: "id"; readonly v: string }
  | { readonly t: "op"; readonly v: string }
  | { readonly t: "(" | ")" | "," }
  | { readonly t: "fim" };

const OPERADORES = ["<>", "<=", ">=", "=", "<", ">", "+", "-", "*", "/", "&"];

export class ErroDeGramatica extends Error {
  constructor(mensagem: string, readonly posicao: number) {
    super(`${mensagem} (posição ${posicao + 1})`);
    this.name = "ErroDeGramatica";
  }
}

function tokenizar(fonte: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < fonte.length) {
    const c = fonte[i]!;

    if (/\s/.test(c)) {
      i += 1;
      continue;
    }

    if (c === "(" || c === ")" || c === ",") {
      tokens.push({ t: c });
      i += 1;
      continue;
    }

    if (c === '"') {
      // ⚠️ O TEXTO TERMINA NA ASPA, e uma aspa não fechada é ERRO — não "até o fim da
      // linha". Fechar sozinho faria a expressão significar uma coisa para quem a
      // escreveu e outra para quem a lê.
      let j = i + 1;
      let valor = "";
      while (j < fonte.length && fonte[j] !== '"') {
        valor += fonte[j];
        j += 1;
      }
      if (j >= fonte.length) {
        throw new ErroDeGramatica("Texto sem aspa de fechamento", i);
      }
      tokens.push({ t: "txt", v: valor });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < fonte.length && /[0-9.]/.test(fonte[j]!)) j += 1;
      const bruto = fonte.slice(i, j);
      if ((bruto.match(/\./g) ?? []).length > 1) {
        throw new ErroDeGramatica(`Número inválido: "${bruto}"`, i);
      }
      tokens.push({ t: "num", v: bruto });
      i = j;
      continue;
    }

    if (/[A-Za-zÀ-ÿ_]/.test(c)) {
      let j = i;
      while (j < fonte.length && /[A-Za-zÀ-ÿ0-9_]/.test(fonte[j]!)) j += 1;
      tokens.push({ t: "id", v: fonte.slice(i, j) });
      i = j;
      continue;
    }

    const op = OPERADORES.find((o) => fonte.startsWith(o, i));
    if (op !== undefined) {
      tokens.push({ t: "op", v: op });
      i += op.length;
      continue;
    }

    // ⚠️ CARACTERE DESCONHECIDO É ERRO, e não é ignorado. Ignorar faria
    // `total; DROP TABLE x` virar `total` em silêncio — a expressão passaria a
    // significar outra coisa sem que ninguém fosse avisado.
    throw new ErroDeGramatica(`Caractere não permitido: "${c}"`, i);
  }

  tokens.push({ t: "fim" });
  return tokens;
}

// ═══════════════════════════════════════════════════════════════════════════
// A ÁRVORE
// ═══════════════════════════════════════════════════════════════════════════

export type No =
  | { readonly tipo: "numero"; readonly valor: string }
  | { readonly tipo: "texto"; readonly valor: string }
  | { readonly tipo: "campo"; readonly nome: string }
  | { readonly tipo: "binario"; readonly op: string; readonly esq: No; readonly dir: No }
  | { readonly tipo: "negativo"; readonly de: No }
  | { readonly tipo: "chamada"; readonly nome: string; readonly args: readonly No[] };

/**
 * AS FUNÇÕES PERMITIDAS — a lista é a linguagem.
 *
 * ⚠️ ELA É FECHADA, E NÃO EXTENSÍVEL EM TEMPO DE EXECUÇÃO. Uma tabela de funções que
 * aceitasse registro dinâmico seria a porta de volta para tudo o que este arquivo
 * fecha: bastaria alguém registrar `EXEC`.
 */
export const FUNCOES: Readonly<Record<string, { readonly aridade: readonly number[]; readonly ajuda: string }>> = {
  SE: { aridade: [3], ajuda: "SE(condição; então; senão)" },
  ARRED: { aridade: [1, 2], ajuda: "ARRED(número[; casas])" },
  ABS: { aridade: [1], ajuda: "ABS(número)" },
  MAIUSC: { aridade: [1], ajuda: "MAIUSC(texto)" },
  MINUSC: { aridade: [1], ajuda: "MINUSC(texto)" },
  TAMANHO: { aridade: [1], ajuda: "TAMANHO(texto)" },
  CONCAT: { aridade: [2, 3, 4, 5], ajuda: "CONCAT(a; b[; c…])" },
  DIAS: { aridade: [2], ajuda: "DIAS(dataFinal; dataInicial) — diferença em dias" },
  VAZIO: { aridade: [1], ajuda: "VAZIO(valor) — verdadeiro se nulo ou texto vazio" },
};

/**
 * O ANALISADOR — descendente recursivo, com precedência explícita.
 *
 * Precedência, da menor para a maior: comparação < concatenação < soma < produto <
 * unário < primário. É a mesma de qualquer planilha, e é o que o usuário espera.
 */
export function analisar(fonte: string): No {
  if (fonte.trim() === "") {
    throw new ErroDeGramatica("Expressão vazia", 0);
  }
  if (fonte.length > 500) {
    // ⚠️ TAMANHO É A PRIMEIRA DEFESA. Uma expressão de um megabyte custa memória na
    // análise, antes mesmo de o limite de passos da AVALIAÇÃO ter chance de agir.
    throw new ErroDeGramatica(
      `Expressão longa demais (${fonte.length} caracteres; o limite é 500)`,
      0
    );
  }

  const tokens = tokenizar(fonte);
  let pos = 0;

  const atual = (): Token => tokens[pos]!;
  const avancar = (): Token => tokens[pos++]!;
  const eOp = (...quais: string[]): boolean => {
    const t = atual();
    return t.t === "op" && quais.includes(t.v);
  };

  const comparacao = (): No => {
    let esq = concatenacao();
    while (eOp("=", "<>", "<", "<=", ">", ">=")) {
      const op = (avancar() as { v: string }).v;
      esq = { tipo: "binario", op, esq, dir: concatenacao() };
    }
    return esq;
  };

  const concatenacao = (): No => {
    let esq = soma();
    while (eOp("&")) {
      avancar();
      esq = { tipo: "binario", op: "&", esq, dir: soma() };
    }
    return esq;
  };

  const soma = (): No => {
    let esq = produto();
    while (eOp("+", "-")) {
      const op = (avancar() as { v: string }).v;
      esq = { tipo: "binario", op, esq, dir: produto() };
    }
    return esq;
  };

  const produto = (): No => {
    let esq = unario();
    while (eOp("*", "/")) {
      const op = (avancar() as { v: string }).v;
      esq = { tipo: "binario", op, esq, dir: unario() };
    }
    return esq;
  };

  const unario = (): No => {
    if (eOp("-")) {
      avancar();
      return { tipo: "negativo", de: unario() };
    }
    return primario();
  };

  const primario = (): No => {
    const t = avancar();

    if (t.t === "num") return { tipo: "numero", valor: t.v };
    if (t.t === "txt") return { tipo: "texto", valor: t.v };

    if (t.t === "(") {
      const dentro = comparacao();
      if (atual().t !== ")") throw new ErroDeGramatica("Falta o ')'", pos);
      avancar();
      return dentro;
    }

    if (t.t === "id") {
      if (atual().t === "(") {
        avancar();
        const nome = t.v.toUpperCase();
        if (!(nome in FUNCOES)) {
          throw new ErroDeGramatica(
            `Função não permitida: "${t.v}". As permitidas são ` +
              `${Object.keys(FUNCOES).join(", ")}`,
            pos
          );
        }
        const args: No[] = [];
        if (atual().t !== ")") {
          args.push(comparacao());
          while (atual().t === ",") {
            avancar();
            args.push(comparacao());
          }
        }
        if (atual().t !== ")") throw new ErroDeGramatica("Falta o ')'", pos);
        avancar();

        const esperada = FUNCOES[nome]!.aridade;
        if (!esperada.includes(args.length)) {
          throw new ErroDeGramatica(
            `${nome} recebeu ${args.length} argumento(s). Use ${FUNCOES[nome]!.ajuda}`,
            pos
          );
        }
        return { tipo: "chamada", nome, args };
      }
      return { tipo: "campo", nome: t.v };
    }

    throw new ErroDeGramatica("Expressão incompleta", pos);
  };

  const arvore = comparacao();
  if (atual().t !== "fim") {
    throw new ErroDeGramatica("Sobrou conteúdo depois do fim da expressão", pos);
  }
  return arvore;
}

/** Os campos que a expressão usa — para conferir contra a fonte ANTES de executar. */
export function camposUsados(no: No, achados: Set<string> = new Set()): ReadonlySet<string> {
  switch (no.tipo) {
    case "campo":
      achados.add(no.nome);
      break;
    case "binario":
      camposUsados(no.esq, achados);
      camposUsados(no.dir, achados);
      break;
    case "negativo":
      camposUsados(no.de, achados);
      break;
    case "chamada":
      for (const a of no.args) camposUsados(a, achados);
      break;
    default:
      break;
  }
  return achados;
}

// ═══════════════════════════════════════════════════════════════════════════
// A AVALIAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

export type Valor = Decimal | string | boolean | Date | null;

/** O LIMITE DE EXECUÇÃO, em passos. Ver o cabeçalho. */
export const LIMITE_DE_PASSOS = 10_000;

export class ErroDeExecucao extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDeExecucao";
  }
}

export function avaliar(
  no: No,
  linha: Readonly<Record<string, Valor>>,
  limite = LIMITE_DE_PASSOS
): Valor {
  let passos = 0;

  const passo = (): void => {
    passos += 1;
    if (passos > limite) {
      throw new ErroDeExecucao(
        `A expressão excedeu o limite de ${limite} passos de execução. Um cálculo que ` +
          `não termina é uma negação de serviço escrita sem má intenção — simplifique a ` +
          `expressão ou divida-a em colunas.`
      );
    }
  };

  const num = (v: Valor, onde: string): Decimal => {
    if (v instanceof Decimal) return v;
    if (typeof v === "boolean") return new Decimal(v ? 1 : 0);
    if (v === null) return new Decimal(0);
    if (typeof v === "string" && v.trim() !== "") {
      try {
        return new Decimal(v.replace(",", "."));
      } catch {
        /* cai no erro abaixo */
      }
    }
    throw new ErroDeExecucao(`${onde} esperava número e recebeu "${texto(v)}".`);
  };

  const texto = (v: Valor): string => {
    if (v === null) return "";
    if (v instanceof Decimal) return v.toString();
    if (v instanceof Date) return v.toISOString().slice(0, 10).split("-").reverse().join("/");
    return String(v);
  };

  const verdade = (v: Valor): boolean => {
    if (typeof v === "boolean") return v;
    if (v instanceof Decimal) return !v.isZero();
    if (v === null) return false;
    return String(v) !== "";
  };

  const ir = (n: No): Valor => {
    passo();
    switch (n.tipo) {
      case "numero":
        return new Decimal(n.valor);
      case "texto":
        return n.valor;

      case "campo": {
        // ⚠️ CAMPO INEXISTENTE É ERRO, e não `null` silencioso. Um relatório que soma
        // uma coluna escrita errada devolveria zero — e zero parece um número válido.
        if (!(n.nome in linha)) {
          throw new ErroDeExecucao(
            `Campo "${n.nome}" não existe nesta fonte de dados. Os campos disponíveis ` +
              `são: ${Object.keys(linha).join(", ")}.`
          );
        }
        return linha[n.nome]!;
      }

      case "negativo":
        return num(ir(n.de), "O sinal negativo").neg();

      case "binario": {
        const e = ir(n.esq);
        const d = ir(n.dir);
        switch (n.op) {
          case "+":
            return num(e, "A soma").plus(num(d, "A soma"));
          case "-":
            return num(e, "A subtração").minus(num(d, "A subtração"));
          case "*":
            return num(e, "A multiplicação").times(num(d, "A multiplicação"));
          case "/": {
            const divisor = num(d, "A divisão");
            // ⚠️ DIVISÃO POR ZERO É ERRO NOMEADO. `Decimal` devolveria `Infinity`, e um
            // relatório com "Infinity" numa célula é pior que um relatório que falhou:
            // ele parece pronto.
            if (divisor.isZero()) {
              throw new ErroDeExecucao("Divisão por zero.");
            }
            return num(e, "A divisão").div(divisor);
          }
          case "&":
            return texto(e) + texto(d);
          case "=":
            return comparar(e, d) === 0;
          case "<>":
            return comparar(e, d) !== 0;
          case "<":
            return comparar(e, d) < 0;
          case "<=":
            return comparar(e, d) <= 0;
          case ">":
            return comparar(e, d) > 0;
          case ">=":
            return comparar(e, d) >= 0;
          default:
            throw new ErroDeExecucao(`Operador desconhecido: ${n.op}`);
        }
      }

      case "chamada": {
        switch (n.nome) {
          case "SE":
            // ⚠️ AVALIAÇÃO PREGUIÇOSA DOS RAMOS. `SE(divisor<>0; total/divisor; 0)` só
            // funciona se o ramo não escolhido NÃO for avaliado — avaliar os dois faria
            // a divisão por zero estourar mesmo com a guarda escrita corretamente.
            return verdade(ir(n.args[0]!)) ? ir(n.args[1]!) : ir(n.args[2]!);
          case "ARRED": {
            const casas =
              n.args.length === 2 ? num(ir(n.args[1]!), "ARRED").toNumber() : 0;
            if (casas < 0 || casas > 10) {
              throw new ErroDeExecucao("ARRED aceita de 0 a 10 casas decimais.");
            }
            return num(ir(n.args[0]!), "ARRED").toDecimalPlaces(casas);
          }
          case "ABS":
            return num(ir(n.args[0]!), "ABS").abs();
          case "MAIUSC":
            return texto(ir(n.args[0]!)).toUpperCase();
          case "MINUSC":
            return texto(ir(n.args[0]!)).toLowerCase();
          case "TAMANHO":
            return new Decimal(texto(ir(n.args[0]!)).length);
          case "CONCAT":
            return n.args.map((a) => texto(ir(a))).join("");
          case "DIAS": {
            const fim = ir(n.args[0]!);
            const inicio = ir(n.args[1]!);
            if (!(fim instanceof Date) || !(inicio instanceof Date)) {
              throw new ErroDeExecucao("DIAS espera duas datas.");
            }
            return new Decimal(
              Math.round((fim.getTime() - inicio.getTime()) / 86_400_000)
            );
          }
          case "VAZIO": {
            const v = ir(n.args[0]!);
            return v === null || (typeof v === "string" && v.trim() === "");
          }
          default:
            throw new ErroDeExecucao(`Função desconhecida: ${n.nome}`);
        }
      }
    }
  };

  const comparar = (a: Valor, b: Valor): number => {
    if (a instanceof Decimal || b instanceof Decimal) {
      const x = num(a, "A comparação");
      const y = num(b, "A comparação");
      return x.comparedTo(y);
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime();
    }
    const x = texto(a);
    const y = texto(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };

  return ir(no);
}

/**
 * O texto CRU de um valor calculado.
 *
 * ⚠️ ELE NÃO INVENTA PRECISÃO. `1000.50` em Decimal É `1000.5` — as duas casas do
 * dinheiro são uma decisão de APRESENTAÇÃO, e a gramática não sabe que aquela coluna é
 * dinheiro. Quem sabe é a COLUNA, que declara o seu tipo. Ver `formatarCelula`.
 *
 * O caminho errado seria acolchoar tudo para duas casas aqui: uma quantidade de dias
 * viraria "10.00" e uma matrícula viraria "12345.00".
 */
export function paraCelula(v: Valor): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (v instanceof Decimal) return v.toFixed(Math.min(v.decimalPlaces(), 6));
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10).split("-").reverse().join("/");
  }
  return v;
}

/** O tipo declarado de uma coluna do modelo — é ele que decide a apresentação. */
export type TipoDeColuna = "TEXTO" | "NUMERO" | "MOEDA" | "DATA" | "BOOLEANO";

/**
 * O texto de saída de uma célula, JÁ SABENDO o tipo da coluna.
 *
 * ⚠️ MOEDA SEMPRE COM DUAS CASAS, e sem separador de milhar: a saída é CSV, e o ponto
 * de milhar num CSV que outra planilha vai reabrir transforma 1.234,56 em texto. A
 * apresentação bonita é da TELA, não do arquivo.
 */
export function formatarCelula(tipo: TipoDeColuna, v: Valor): string {
  if (v === null) return "";
  switch (tipo) {
    case "MOEDA": {
      if (v instanceof Decimal) return v.toFixed(2);
      try {
        return new Decimal(String(v)).toFixed(2);
      } catch {
        return paraCelula(v);
      }
    }
    case "NUMERO":
      return v instanceof Decimal ? v.toFixed(Math.min(v.decimalPlaces(), 6)) : paraCelula(v);
    case "BOOLEANO":
      return typeof v === "boolean" ? (v ? "Sim" : "Não") : paraCelula(v);
    case "DATA":
    case "TEXTO":
    default:
      return paraCelula(v);
  }
}
