/**
 * O NOME DE UM BANCO DESCARTÁVEL — a guarda, em UM lugar só.
 *
 * ═══ ⚠️ POR QUE ESTE ARQUIVO EXISTE ═══
 *
 * O padrão estava copiado em SETE arquivos (`banco-descartavel.ts`, `preparar-ponte-contratual.ts`,
 * `preparar-guiche.ts`, `preparar-acesso-a-informacao.ts`, `preparar-credito-adicional.ts`,
 * `smoke-medicao-pela-planilha.ts`, `smoke-planilha-da-obra.ts`), todos com a mesma expressão
 * escrita à mão. Uma segunda lista do mesmo censo envelhece sozinha, e foi exatamente o que a
 * medição da V12 mostrou: corrigido o padrão em `banco-descartavel.ts`, o clone foi criado com
 * sucesso e `preparar-ponte-contratual.ts` recusou o MESMO banco, porque a cópia dele continuava
 * na versão antiga. Sete cópias, seis divergentes, uma falha que não fala do assunto.
 *
 * ═══ ⚠️ O QUE A GUARDA PROTEGE, E O QUE NÃO FOI AFROUXADO ═══
 *
 * Ela é fail-closed: só um banco com NOME de descartável pode ser criado, clonado, removido ou
 * semeado por percurso. O banco de desenvolvimento, o de teste, os de percursos originais e os de
 * evidência preservada NÃO casam, e continuam não casando.
 *
 * O segmento de ORDEM era `v7m[12]` cravado, e por isso recusava todo descartável de qualquer
 * ordem posterior à V7 M1/M2 — na V12 ele barrou `gestao_publica_percursos_v12_r4` dizendo,
 * corretamente pela letra e erradamente pelo espírito, que o nome não era de descartável. A saída
 * que a pressa sugere é batizar o banco de `_v7m1_` e mentir sobre a ordem a que ele pertence; a
 * saída certa é o segmento aceitar `v<n>` e `v<n>m<n>`.
 *
 * Nada mais mudou: a FAMÍLIA do prefixo, o sufixo obrigatório e as recusas de `banco-descartavel.ts`
 * (banco nomeado no ambiente, origem igual a destino, servidor não local) seguem valendo.
 */
export const PADRAO_DE_BANCO_DESCARTAVEL =
  /^gestao_publica_(percursos|capturas|instalacao)_v\d{1,3}(m\d{1,2})?_[a-z0-9_]{1,40}$/;

/** `true` se o nome é de um banco que pode ser criado, clonado, removido ou semeado por percurso. */
export function ehBancoDescartavel(nome: string): boolean {
  return PADRAO_DE_BANCO_DESCARTAVEL.test(nome);
}
