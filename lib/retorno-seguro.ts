/**
 * O CAMINHO DE VOLTA de um atalho entre telas (V37): só caminho interno — começa com "/", não com "//"
 * nem "/\", sem caractere de controle — para o parâmetro não virar redirecionamento aberto. Fora disso, o
 * destino padrão de quem chamou.
 *
 * ⚠️ CONTROLE, NÃO SÓ QUEBRA DE LINHA: o navegador APAGA tabulação e quebra de linha ao ler o endereço, então
 * "/<TAB>/golpe.example" passaria pela regra de "//" e chegaria ao navegador como "//golpe.example".
 */
export function retornoSeguro(bruto: string | undefined, padrao: string): string {
  const r = (bruto ?? "").trim();
  return r.startsWith("/") && !r.startsWith("//") && !r.startsWith("/\\") && !/[\u0000-\u001f\u007f]/.test(r) ? r : padrao;
}
