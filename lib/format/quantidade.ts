/**
 * A QUANTIDADE PARA A TELA — "5.0000" → "5"; "2.5000" → "2,5". Sem unidade: quem mostra diz a unidade ao lado, e
 * quantidades de unidades diferentes nunca se somam aqui.
 */
export const qtdBr = (v: string): string => v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "").replace(".", ",");
