import { ZodError } from "zod";

/**
 * A MENSAGEM DE UM ERRO PARA A TELA.
 *
 * ⚠️ `ZodError.message` É UM JSON — o percurso do PPA (V4 §8) mostrou ao operador um array com
 * `code`, `path` e `message` em vez de "anoFim: DURAÇÃO INVÁLIDA…". A recusa do domínio continua
 * subindo COMO VEIO; o que muda é a FORMA: uma linha por campo recusado, o nome do campo na
 * frente. Erro que não é do Zod passa intacto. Não é regra de negócio: é leitura.
 */
export function mensagemDoErro(e: unknown, padrao: string): string {
  if (e instanceof ZodError) {
    return e.issues.map((i) => (i.path.length > 0 ? `${i.path.join(".")}: ${i.message}` : i.message)).join("\n");
  }
  return e instanceof Error ? e.message : padrao;
}
