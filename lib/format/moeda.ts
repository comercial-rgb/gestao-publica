/**
 * FORMATAÇÃO MONETÁRIA — CASCA FINA. A implementação vive em `packages/contracts/moeda.ts`.
 *
 * ⚠️ ELA MUDOU DE CASA, E O MOTIVO É QUE O APP NÃO ERA O ÚNICO A APRESENTAR DINHEIRO.
 *
 * Esta função serve 64 telas por `ValorMonetario`, e continua servindo — o import daqui não
 * mudou para ninguém. O que mudou é que o M33 também precisava dela: ele escreve MEMÓRIA DE
 * CÁLCULO e MENSAGENS DE RECUSA em prosa, grava as duas no banco e as hasheia, e `modules/` não
 * importa de `lib/`. Duplicar a formatação teria dado duas implementações que divergem com os
 * dois testes verdes — o mesmo defeito que este repositório já pagou em aritmética.
 *
 * Reexporta, não reimplementa.
 */
export { formatarMoeda } from "../../packages/contracts/index.js";
export type { MoedaFormatada } from "../../packages/contracts/index.js";

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

/**
 * O VALOR COMO A PESSOA DIGITA (`1.234,56`, `1234,56` ou `1234.56`) EM STRING DECIMAL (`1234.56`),
 * para entrar em `somarValoresDigitados`. Vazio vira "0"; o que não se lê como valor vira "" —
 * e `somarValoresDigitados` ignora o "", sem estourar no meio da digitação.
 *
 * ⚠️ TEXTUAL, sem `Number`: os dois formulários de parcelas somavam em ponto flutuante e
 * imprimiam a soma por `toLocaleString`, e a conferência "igual ao total" dependia de
 * `0.1 + 0.2` dar exatamente `0.3`.
 */
export function valorDigitadoEmDecimal(bruto: string): string {
  const t = bruto.trim();
  if (t === "") return "0";
  const decimal = t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t;
  return /^-?\d+(\.\d+)?$/.test(decimal) ? decimal : "";
}

/** A diferença `a - b` entre duas strings decimais, pela mesma soma em centavos inteiros. */
export function subtrairValores(a: string, b: string): string {
  const negado = b.startsWith("-") ? b.slice(1) : `-${b}`;
  return somarValoresDigitados([a, negado]);
}
