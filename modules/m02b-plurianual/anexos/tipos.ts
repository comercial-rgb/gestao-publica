import { toMoney, type Money } from "../../../packages/contracts/index.js";

/**
 * OS ANEXOS DA LDO — a forma comum, e o que ela NÃO é.
 *
 * ═══ ⚠️ O GERADOR PRODUZ ESTRUTURA, NÃO TEXTO ═══
 * Ele devolve `Money` e números, não strings formatadas. A conversão para
 * `DocumentoPdf` (que já existe, com hash SHA-256 e o rodapé "não assinado") é uma
 * função fina, à parte.
 *
 * Isso não é purismo: é o que torna o FECHAMENTO testável. Um gerador que emitisse
 * `"1.234,56"` obrigaria o teste a reconverter para conferir se o total bate — e o
 * teste passaria a exercitar o parser, não a aritmética.
 *
 * ═══ ⚠️ LIMITE DE FONTE, DECLARADO ═══
 * O layout oficial destes anexos está no **Manual de Demonstrativos Fiscais (MDF)** da
 * STN, que **NÃO está transcrito neste repositório**. O que existe aqui segue o TR, a
 * Lei 4.320/64 e a LC 101/00: o CONTEÚDO é conferível, o LAYOUT não.
 *
 * Nenhuma função deste diretório declara conformidade com o MDF, e nenhuma deve. É a
 * mesma franqueza do adapter TCM-BA, que marca as specs como `manual-v44-2014` e nunca
 * as chama de homologadas.
 */

/** Uma coluna do anexo. `numerica` alinha à direita e entra nos totais. */
export interface ColunaAnexo {
  readonly chave: string;
  readonly rotulo: string;
  readonly numerica?: boolean;
}

/** Uma linha: valores por chave de coluna. `Money` onde é dinheiro. */
export type LinhaAnexo = Readonly<Record<string, string | number | Money | null>>;

/**
 * ⚠️ O FECHAMENTO SIGNIFICA COISAS DIFERENTES, e cada anexo diz qual.
 *
 * Onde há coluna somável (riscos, renúncias, alienações), fechamento é
 * `total == Σ linhas`. Onde a série é por EXERCÍCIO (metas anuais, RPPS, dívida,
 * margem), somar anos não significa nada — 2026 mais 2027 não é um total de coisa
 * alguma — e o fechamento é a DERIVAÇÃO da linha (resultado primário, dívida líquida,
 * margem).
 *
 * Um `totais` obrigatório forçaria o segundo grupo a inventar somas sem sentido, e
 * quem lesse o anexo veria um número que não existe em lugar nenhum da LRF.
 */
export interface AnexoLdo {
  readonly chave: string;
  readonly titulo: string;
  /** O artigo/inciso que obriga o anexo. Vai impresso. */
  readonly baseLegal: string;
  readonly exercicio: number;
  readonly colunas: readonly ColunaAnexo[];
  readonly linhas: readonly LinhaAnexo[];
  /** Somas por chave de coluna. VAZIO quando somar não significa nada — ver acima. */
  readonly totais: Readonly<Record<string, Money>>;
  /**
   * As notas impressas ao fim — inclusive a que declara o limite de fonte.
   *
   * ⚠️ ANEXO VAZIO NÃO É ERRO, e a nota é que faz a diferença: um anexo em branco sem
   * nota é lido como "o ente não tem riscos fiscais"; com a nota, lê-se "o ente não
   * PREENCHEU o anexo". São coisas opostas, e só a segunda é verdade.
   */
  readonly notas: readonly string[];
}

/** A nota que TODO anexo deste módulo carrega. Ver o docblock do arquivo. */
export const NOTA_LIMITE_DE_FONTE =
  "Layout NÃO conferido contra o Manual de Demonstrativos Fiscais (MDF) da STN, que não " +
  "está transcrito neste repositório. O conteúdo segue o TR, a Lei 4.320/64 e a LC 101/00; " +
  "a forma pode divergir do modelo oficial vigente.";

/** A nota do anexo sem dado. Ver `AnexoLdo.notas`. */
export function notaDeAnexoVazio(oQue: string, base: string): string {
  return (
    `⚠️ SEM DADO: nenhum registro de ${oQue} para este exercício. Isto NÃO significa que ` +
    `o ente não os tenha — significa que o anexo (${base}) não foi preenchido.`
  );
}

/**
 * SOMA UMA COLUNA — e ela é a ÚNICA agregação deste diretório.
 *
 * ⚠️ NÃO REUSA `somaLiquidaEstornaveis` (packages/estornaveis) de propósito: aquela
 * existe para fatos ESTORNÁVEIS, e decide o sinal por `estornoDeId`/`anulacaoParcialDeId`.
 * Anexo de LDO não tem estorno — a LDO é peça de planejamento, não razão. Usá-la aqui
 * pediria dois campos que nenhuma linha tem.
 *
 * ⚠️ E A SOMA É SOBRE `Money` (decimal.js), nunca `number`. Uma soma de dez linhas em
 * ponto flutuante já erra o centavo, e o centavo num anexo da LRF é o que o TCE aponta.
 */
export function somarColuna(
  linhas: readonly LinhaAnexo[],
  chave: string
): Money {
  let total = toMoney("0.00");
  for (const l of linhas) {
    const v = l[chave];
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number") {
      throw new Error(
        `COLUNA "${chave}" NÃO É DINHEIRO: a linha trouxe ${typeof v}. Somar coluna de ` +
          `texto ou contagem como valor produziria um total que não é de nada. Declare a ` +
          `coluna como \`Money\` ou não a inclua nos totais.`
      );
    }
    total = toMoney(total.plus(v));
  }
  return total;
}

/** Os totais de várias colunas de uma vez. */
export function totaisDe(
  linhas: readonly LinhaAnexo[],
  chaves: readonly string[]
): Readonly<Record<string, Money>> {
  const saida: Record<string, Money> = {};
  for (const c of chaves) saida[c] = somarColuna(linhas, c);
  return saida;
}
