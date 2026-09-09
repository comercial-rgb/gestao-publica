/**
 * FORMATAÇÃO MONETÁRIA — a função PURA, testável sem React.
 *
 * ⚠️ DINHEIRO ATRAVESSA A UI COMO **STRING** DECIMAL, NUNCA `number`. É a mesma regra de ouro
 * do domínio (`Decimal(18,2)`): um `number` de ponto flutuante corrompe centavos em silêncio, e
 * a UI é o último lugar onde isso não pode acontecer — o número que o cidadão lê no portal tem
 * de ser o número do razão, byte a byte. O tipo do parâmetro é `string`, e passar `number` é
 * erro de COMPILAÇÃO (provado no teste com `@ts-expect-error`).
 *
 * ⚠️ NEGATIVO EM PARÊNTESES — a convenção CONTÁBIL. `(1.234,50)`, não `-1.234,50`. É como o
 * balancete, o balanço e o RREO apresentam um saldo devedor/credor desfavorável; a cor
 * (vermelho) é redundância visual, mas o parêntese é o que sobrevive à impressão em preto.
 */

export interface MoedaFormatada {
  /** O texto pt-BR: milhar com ".", decimal com ",", negativo entre parênteses. */
  readonly texto: string;
  /** `true` se o valor é < 0 — a UI pinta de vermelho (semântica contábil). */
  readonly negativo: boolean;
}

/**
 * Formata uma string decimal em pt-BR contábil.
 *
 *   "1234567.89"  → { texto: "1.234.567,89", negativo: false }
 *   "-1234.50"    → { texto: "(1.234,50)",   negativo: true  }
 *   "0"           → { texto: "0,00",         negativo: false }
 *
 * ⚠️ NÃO usa `Number(valor)` para formatar — isso reintroduziria o ponto flutuante que a string
 * existe para evitar. O parse é textual: separa sinal, inteiro e centavos, e agrupa o milhar à
 * mão. Assim "12345678901234.56" (acima do seguro do `number`) formata exato.
 */
export function formatarMoeda(valor: string): MoedaFormatada {
  const bruto = valor.trim();
  if (!/^-?\d+(\.\d+)?$/.test(bruto)) {
    throw new Error(
      `Valor monetário malformado: "${valor}". Esperado uma string decimal (ex.: "1234.50", ` +
        `"-1234.50", "0"). A UI recebe dinheiro como STRING do domínio — nunca number, nunca ` +
        `formatado.`
    );
  }

  const negativo = bruto.startsWith("-");
  const semSinal = negativo ? bruto.slice(1) : bruto;

  const [inteiroRaw, decimalRaw = ""] = semSinal.split(".");
  // sempre 2 casas (trunca/completa — o domínio já entrega 2, isto é defesa).
  const centavos = (decimalRaw + "00").slice(0, 2);

  // agrupa o milhar por 3, da direita para a esquerda.
  const inteiro = (inteiroRaw ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const corpo = `${inteiro},${centavos}`;
  const texto = negativo ? `(${corpo})` : corpo;

  // ⚠️ "-0.00" não é negativo de verdade: zero não tem sinal contábil.
  const ehZero = inteiroRaw?.replace(/^0+/, "") === "" && centavos === "00";
  return { texto: ehZero ? corpo : texto, negativo: negativo && !ehZero };
}

/**
 * SOMA DE VALORES DIGITADOS NUM FORMULÁRIO — em CENTAVOS INTEIROS (`BigInt`), nunca `number`.
 *
 * ═══ ⚠️ POR QUE ISTO EXISTE, E POR QUE NÃO É UMA SEGUNDA ARITMÉTICA DE DOMÍNIO ═══
 * O domínio soma dinheiro com `Decimal` (`toMoney`/`sumMoney`), e essa continua sendo a ÚNICA
 * aritmética de dinheiro do sistema — nada gravado passa por aqui. Esta função soma o RASCUNHO
 * de um formulário: linhas que o usuário está digitando e que ainda não são fato nenhum. Serve a
 * um indicador de tela ("as pernas deste decreto fecham?"), para que o servidor público veja o
 * desequilíbrio ANTES de submeter — em vez de descobri-lo pelo erro do domínio.
 *
 * ⚠️ ELA NÃO DECIDE NADA. Quem julga o balanceamento (TR 5.111) é o `validarBalanceamento` do
 * M03, no domínio puro, antes de qualquer I/O. O que esta soma produz é um AVISO; a tela sugere,
 * o domínio decide (MODULO-UI.md).
 *
 * ⚠️ `BigInt`, NÃO `number`. Um `Number("0.1") + Number("0.2")` dá `0.30000000000000004`, e o
 * aviso diria "não fecha" num decreto que fecha. Centavos inteiros não têm esse erro, e o
 * resultado volta como STRING decimal — a regra de ouro intacta na volta.
 *
 * Valores malformados (o campo meio-digitado) são IGNORADOS, não lançam: um indicador que
 * explode enquanto se digita é pior do que um indicador que espera o valor ficar legível.
 */
export function somarValoresDigitados(valores: readonly string[]): string {
  let centavos = 0n;
  for (const v of valores) {
    const bruto = v.trim();
    if (!/^-?\d+(\.\d+)?$/.test(bruto)) continue; // meio-digitado: fora da soma, sem estourar.
    const negativo = bruto.startsWith("-");
    const [inteiro = "0", decimal = ""] = (negativo ? bruto.slice(1) : bruto).split(".");
    const parcela = BigInt(inteiro) * 100n + BigInt((decimal + "00").slice(0, 2));
    centavos += negativo ? -parcela : parcela;
  }
  const sinal = centavos < 0n ? "-" : "";
  const abs = centavos < 0n ? -centavos : centavos;
  return `${sinal}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
