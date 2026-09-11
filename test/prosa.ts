/**
 * ═══ PROSA NÃO É CÓDIGO — e num repositório que documenta o que NÃO tem, isso morde ═══
 *
 * ⚠️ O QUE ACONTECEU. O ENT03c criou dois guards que perguntam "o código alcança este
 * conceito?": `censo-de-ausencias.test.ts` (o conceito CONTINUA ausente?) e
 * `modelo-sem-caso-de-uso.test.ts` (todo modelo do schema é usado?). Os dois ficaram
 * verdes sozinhos e VERMELHOS na suíte completa — e o que os acusava era o próprio
 * `scripts/marcar-catalogo.ts`, onde a EVIDÊNCIA de cada cláusula explica, em português,
 * que `ParecerContrato` é tabela sem caso de uso e que não existe comissão de licitação.
 *
 * O guard estava certo na letra e errado na intenção: um nome citado dentro de uma string
 * é DOCUMENTAÇÃO, exatamente como dentro de um comentário. Código que usa um modelo
 * escreve `tx.parecerContrato` ou `Prisma.ParecerContrato` — nunca `"ParecerContrato"`.
 *
 * ⚠️ E ISTO **NÃO** SERVE AO `data-civil.test.ts`. Lá o padrão mora DENTRO do literal de
 * propósito: a quinta forma do eixo de data é `new Date(\`${dia}T23:59:59.999Z\`)`, e
 * apagar o conteúdo do template literal apagaria justamente o que se procura. São
 * perguntas diferentes: um guard pergunta "este NOME é usado", o outro "esta EXPRESSÃO
 * foi escrita". Por isso são duas funções, e não uma com bandeira.
 */

/** Remove só comentários. O que sobra ainda tem os literais. */
export function semComentarios(fonte: string): string {
  return fonte
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, ""))
    .join("\n");
}

/**
 * Remove comentários E o CONTEÚDO dos literais de texto — aspas simples, duplas e template.
 *
 * ⚠️ É UM VARREDOR DE CARACTERES, E NÃO EXPRESSÃO REGULAR, porque com regex isto ESTAVA
 * ERRADO: um backtick dentro de uma string comum (`"crase: \`"`) fazia o padrão de template
 * literal engolir centenas de linhas até o próximo backtick do arquivo, e vinte modelos
 * legítimos apareceram como órfãos. Delimitador aninhado é gramática, não padrão.
 *
 * ⚠️ A INTERPOLAÇÃO DE TEMPLATE SOBREVIVE: `${algumaCoisa}` é código de verdade dentro do
 * literal, e apagá-la esconderia um uso real.
 */
export function somenteCodigo(fonte: string): string {
  const src = semComentarios(fonte);
  let saida = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] ?? "";
    if (c === '"' || c === "'") {
      saida += c;
      i += 1;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i += 1;
        i += 1;
      }
      saida += c;
      i += 1;
      continue;
    }
    if (c === "`") {
      saida += "`";
      i += 1;
      let profundidade = 0;
      while (i < src.length && !(src[i] === "`" && profundidade === 0)) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        // `${` abre um trecho de CÓDIGO dentro do literal: ele é copiado inteiro.
        if (src[i] === "$" && src[i + 1] === "{") {
          profundidade += 1;
          saida += "${";
          i += 2;
          continue;
        }
        if (profundidade > 0) {
          if (src[i] === "{") profundidade += 1;
          if (src[i] === "}") profundidade -= 1;
          saida += src[i];
        }
        i += 1;
      }
      saida += "`";
      i += 1;
      continue;
    }
    saida += c;
    i += 1;
  }
  return saida;
}
