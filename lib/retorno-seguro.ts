/**
 * O CAMINHO DE VOLTA de um atalho entre telas (V37): só caminho interno — começa com "/", não com "//"
 * nem "/\", sem quebra de linha — para o parâmetro não virar redirecionamento aberto. Fora disso, o
 * destino padrão de quem chamou.
 */
export function retornoSeguro(bruto: string | undefined, padrao: string): string {
  const r = (bruto ?? "").trim();
  return r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\") && !/[\r\n]/.test(r) ? r : padrao;
}
