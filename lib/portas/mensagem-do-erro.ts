import { ZodError } from "zod";

/**
 * A MENSAGEM DE UM ERRO PARA A TELA.
 *
 * ⚠️ `ZodError.message` É UM JSON — o percurso do PPA (V4 §8) mostrou ao operador um array com
 * `code`, `path` e `message` em vez de "anoFim: DURAÇÃO INVÁLIDA…". A recusa do domínio continua
 * subindo COMO VEIO; o que muda é a FORMA: uma linha por campo recusado, o nome do campo na
 * frente. Erro que não é do Zod passa intacto. Não é regra de negócio: é leitura.
 *
 * ═══ ⚠️ E AQUI SAI O VOCABULÁRIO DE DENTRO DA CASA (V19) ═══
 * As recusas do domínio nascem nomeadas — `DEFINICAO-JA-REVOGADA:`, `FOLHA-JA-FECHADA:`,
 * `ANO FORA DO QUADRIÊNIO:` — e o nome existe por um bom motivo: ele é o que se procura no log e o
 * que o teste de negação afirma. Só que a frase inteira chegava CRUA ao `<p role="alert">` do
 * formulário, e o servidor municipal lia "DEFINICAO-JA-REVOGADA" antes da explicação em português
 * que vem logo depois dos dois pontos.
 *
 * Esta camada tira DUAS coisas, e só elas:
 *   · o RÓTULO INICIAL em caixa alta seguido de dois pontos — o resto da frase já é a explicação;
 *   · o NOME DE CONSTRAINT do banco entre parênteses (`(ck_…)`, `(uq_…)`), que é referência de
 *     schema e não fala nada a quem opera.
 *
 * ⚠️ POR QUE AQUI, E NÃO NOS SERVIÇOS. São centenas de `throw` em todo módulo de escrita; reescrever
 * cada um perderia o rótulo que o log e os testes usam, e a próxima recusa escrita nasceria com o
 * rótulo de novo. A fronteira é UMA, e é ela que decide o que o humano vê. Mesma doutrina do
 * `ZodError` acima: a recusa sobe como veio, a FORMA é decidida na leitura.
 *
 * ⚠️ E ELA NÃO INVENTA MENSAGEM. Se, tirado o rótulo, não sobrar frase nenhuma (uma recusa que era
 * SÓ o rótulo), o rótulo volta inteiro — é melhor o operador ler um nome estranho do que ler o
 * vazio e não saber que houve recusa.
 */

/**
 * O rótulo inicial de uma recusa: caixa alta (com acento, dígito, hífen, espaço ou sublinhado),
 * terminado em dois pontos. `⚠️ ROTEIRO-SEM-X:` e `ANO FORA DO QUADRIÊNIO:` casam; "Plano
 * plurianual abc não existe." não casa, porque não há dois pontos nem caixa alta.
 *
 * ⚠️ O LIMITE DE 80 CARACTERES E O DE UM `:` SÃO DELIBERADOS: sem eles, uma frase inteira em caixa
 * alta (ou um texto com dois pontos no meio) seria tratada como rótulo e desapareceria.
 */
const ROTULO_DE_RECUSA = /^[\s⚠️]*([A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ0-9][A-ZÁÂÃÀÉÊÍÓÔÕÚÜÇ0-9 _-]{2,79}):\s*/u;

/** Nome de constraint do banco entre parênteses — referência de schema, não de operação. */
const CONSTRAINT_ENTRE_PARENTESES = /\s*\((?:ck|uq|fk|pk|idx)_[a-z0-9_]+\)/gu;

/**
 * A FRASE QUE O OPERADOR LÊ — sem o rótulo interno e sem nome de constraint.
 *
 * Exportada porque o censo de interface a usa para provar que a limpeza acontece, e porque a rota
 * de PDF e qualquer outra fronteira que exiba recusa deve passar pela MESMA função.
 */
export function paraLeituraHumana(texto: string): string {
  const semConstraint = texto.replace(CONSTRAINT_ENTRE_PARENTESES, "");
  const semRotulo = semConstraint.replace(ROTULO_DE_RECUSA, "");
  const limpo = semRotulo.trim();
  // ⚠️ Recusa que era SÓ o rótulo: devolve o original, nunca o vazio.
  return limpo === "" ? semConstraint.trim() : limpo;
}

export function mensagemDoErro(e: unknown, padrao: string): string {
  if (e instanceof ZodError) {
    return e.issues
      .map((i) =>
        i.path.length > 0
          ? `${i.path.join(".")}: ${paraLeituraHumana(i.message)}`
          : paraLeituraHumana(i.message)
      )
      .join("\n");
  }
  return e instanceof Error ? paraLeituraHumana(e.message) : padrao;
}
