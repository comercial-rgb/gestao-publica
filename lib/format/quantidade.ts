/**
 * A QUANTIDADE PARA A TELA — "5.0000" → "5"; "2.5000" → "2,5". Sem unidade: quem mostra diz a unidade ao lado, e
 * quantidades de unidades diferentes nunca se somam aqui.
 */
export const qtdBr = (v: string): string => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(".", ",");

/**
 * CONTAGEM PARA A TELA — 12345 → "12.345". Para número de linhas, contas, lançamentos: nunca dinheiro
 * (dinheiro é `formatarMoeda`, sobre string decimal). `Intl.NumberFormat` com o idioma fixo, em vez
 * de `toLocaleString`, que a guarda de data civil não distingue de uma data impressa pelo relógio da
 * máquina.
 */
const INTEIRO_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
export const inteiroBr = (n: number): string => INTEIRO_BR.format(n);

const UMA_CASA_BR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** Tamanho de arquivo e outras medidas com uma casa: 1536 / 1024 → "1,5". */
export const umaCasaBr = (n: number): string => UMA_CASA_BR.format(n);
