/**
 * APRESENTAÇÃO DE DINHEIRO — o motor TEXTUAL, uma implementação só.
 *
 * ⚠️ POR QUE ISTO MORA EM `packages/contracts` E NÃO NO LADO DO APP.
 *
 * A função nasceu em `lib/format/moeda.ts`, servindo 64 telas por `ValorMonetario`. Mas o app não
 * é o único lugar que apresenta dinheiro a uma pessoa: o M33 escreve MEMÓRIA DE CÁLCULO e
 * MENSAGENS DE RECUSA em prosa, grava as duas no banco e as hasheia. `modules/` não importa de
 * `lib/` — e não deve —, então o motor de folha estava escrevendo `3000.00` no meio de uma frase
 * em português, que é como um servidor municipal lê "três mil" com um ponto no lugar errado.
 *
 * ⚠️ E A DIFERENÇA ENTRE OS DOIS CASOS É QUE UM CONGELA. Um CAMPO numérico da memória a tela
 * reformata na hora de exibir; uma FRASE já montada fica gravada como está, para sempre, e entra
 * no `sha256` do contracheque. Formatar na origem é a única chance que a frase tem.
 *
 * O parâmetro é `string` decimal em todos os casos, nunca `number`: é a mesma regra de ouro do
 * domínio, e converter para `number` aqui reintroduziria o float que a string existe para evitar.
 * O parse é textual — "12345678901234.56", acima do inteiro seguro do `number`, formata exato.
 */

export interface MoedaFormatada {
  /** O texto pt-BR: milhar com ".", decimal com ",", negativo entre parênteses. */
  readonly texto: string;
  /** `true` se o valor é < 0 — a UI pinta de vermelho (semântica contábil). */
  readonly negativo: boolean;
}

const DECIMAL_VALIDO = /^-?\d+(\.\d+)?$/;

function partes(valor: string, rotuloDoErro: string): { negativo: boolean; inteiro: string; decimal: string } {
  const bruto = valor.trim();
  if (!DECIMAL_VALIDO.test(bruto)) {
    throw new Error(
      `Valor monetário malformado: "${valor}". Esperado uma string decimal (ex.: "1234.50", ` +
        `"-1234.50", "0"). ${rotuloDoErro} recebe dinheiro como STRING do domínio — nunca number, ` +
        `nunca formatado.`
    );
  }
  const negativo = bruto.startsWith("-");
  const semSinal = negativo ? bruto.slice(1) : bruto;
  const [inteiro = "0", decimal = ""] = semSinal.split(".");
  return { negativo, inteiro, decimal };
}

/** Agrupa o milhar por 3, da direita para a esquerda. Textual — sem `number` em ponto nenhum. */
function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Formata uma string decimal em pt-BR CONTÁBIL — sempre 2 casas, negativo entre parênteses.
 *
 *   "1234567.89"  → { texto: "1.234.567,89", negativo: false }
 *   "-1234.50"    → { texto: "(1.234,50)",   negativo: true  }
 *   "0"           → { texto: "0,00",         negativo: false }
 *
 * ⚠️ NEGATIVO EM PARÊNTESES — a convenção CONTÁBIL. É como o balancete, o balanço e o RREO
 * apresentam um saldo desfavorável; a cor (vermelho) é redundância visual, mas o parêntese é o
 * que sobrevive à impressão em preto.
 */
export function formatarMoeda(valor: string): MoedaFormatada {
  const { negativo, inteiro, decimal } = partes(valor, "A UI");
  // sempre 2 casas (trunca/completa — o domínio já entrega 2, isto é defesa).
  const centavos = (decimal + "00").slice(0, 2);
  const corpo = `${agruparMilhar(inteiro)},${centavos}`;
  const texto = negativo ? `(${corpo})` : corpo;
  // ⚠️ "-0.00" não é negativo de verdade: zero não tem sinal contábil.
  const ehZero = inteiro.replace(/^0+/, "") === "" && centavos === "00";
  return { texto: ehZero ? corpo : texto, negativo: negativo && !ehZero };
}

/**
 * Formata uma string decimal para DENTRO DE UMA FRASE em português.
 *
 * Duas diferenças deliberadas em relação a `formatarMoeda`, e as duas têm motivo:
 *
 * ⚠️ 1. O NEGATIVO LEVA SINAL DE MENOS, NÃO PARÊNTESES. A frase já tem parênteses seus — "(teto
 * sobre 8.000,00)", "(base: VENC 3.000,00)" —, e um parêntese contábil dentro deles seria lido
 * como parte do texto, não como sinal. Em coluna de balancete o parêntese é a convenção; em
 * oração corrida ele é ambiguidade.
 *
 * ⚠️ 2. AS CASAS DECIMAIS SÃO PRESERVADAS (mínimo 2). A memória da fórmula do ente diz
 * "... = 1.234,5678, arredondado a 4 casa(s) half-even = 1.234,5678": forçar 2 casas apagaria
 * exatamente o número sobre o qual a frase está falando. Quem escolhe quantas casas é quem chama;
 * esta função só apresenta.
 */
export function emProsa(valor: string): string {
  const { negativo, inteiro, decimal } = partes(valor, "A memória de cálculo");
  const casas = decimal.length >= 2 ? decimal : (decimal + "00").slice(0, 2);
  const corpo = `${agruparMilhar(inteiro)},${casas}`;
  const ehZero = inteiro.replace(/^0+/, "") === "" && /^0*$/.test(casas);
  return negativo && !ehZero ? `-${corpo}` : corpo;
}
