/**
 * A TÉCNICA DE MARCAR UMA CAIXA DE SELEÇÃO — extraída para poder ser MEDIDA (V11 V8.7).
 *
 * ═══ ⚠️ POR QUE ISTO SAIU DE DENTRO DO `page.evaluate` ═══
 * A pendência `MARCAR-EM-CAMPO-CONTROLADO` dizia: "quando aparecer um checkbox controlado que não
 * recebe a marca, mede-se ali e corrige-se com a prova junto". O problema é que ela nunca ia
 * aparecer sozinha — a técnica vivia dentro de um `page.evaluate`, onde nenhum teste a alcança, e
 * a única forma de descobrir o defeito seria um percurso morrendo em silêncio.
 *
 * Aqui ela é uma função comum: o helper dos percursos a serializa para o navegador, e um teste de
 * `happy-dom` a aplica num checkbox REALMENTE controlado pelo React. A medição deixou de depender
 * de alguém tropeçar no caso.
 *
 * ═══ ⚠️ O DEFEITO, MEDIDO ═══
 * `el.checked = x` grava por cima do setter que o React instala no elemento. O DOM passa a mostrar
 * a marca, o evento `change` dispara, e o React compara o valor interno DELE (inalterado) com o
 * que ele acha que deveria estar — conclui que nada mudou e NÃO chama o `onChange`. O estado
 * continua como estava, o formulário continua inválido, e o percurso lê "silêncio" sem nome de
 * campo. É o mesmo mecanismo do `value` que custou um defeito na V11 V7.2.
 *
 * ═══ ⚠️ A CURA NÃO É A MESMA DO `value`, E A MEDIÇÃO MOSTROU ISSO ═══
 * A primeira correção escrita aqui foi o setter do PROTÓTIPO — a cura que funcionou para o
 * `value` na V11 V7.2. **Ela não chega ao React num checkbox**: o teste desta técnica a derrubou
 * na primeira execução (`test/ui/marca-em-caixa-controlada.test.tsx` t2), e é exatamente por isso
 * que a extração valeu a pena. Sem a medição, a correção teria entrado com a mesma confiança e o
 * defeito continuaria, agora com um comentário dizendo que estava resolvido.
 *
 * O que chega é o CLIQUE: ele aciona a ativação padrão do navegador, que inverte `checked` e
 * dispara os eventos pelo caminho que o React escuta.
 *
 * ⚠️ E O RISCO QUE SEGUROU ESTA CORREÇÃO POR VÁRIOS LOTES ERA REAL: clicar num checkbox que já
 * está como se quer o INVERTE — marcar o marcado o desmarcaria em silêncio, e o percurso passaria
 * a fazer o contrário do que pediu. A guarda é uma linha: só clica se o estado atual for
 * diferente do desejado. Com ela, `aplicarMarca` é IDEMPOTENTE, que é o que quem chama espera.
 */
export function aplicarMarca(el: HTMLInputElement, marcar: boolean): void {
  if (el.checked === marcar) return;
  el.click();
}

/**
 * A TÉCNICA ANTIGA, preservada SÓ para o teste poder provar que ela falha.
 *
 * ⚠️ NÃO A USE. Ela existe para que a prova por mutação tenha o "antes" contra o qual comparar —
 * sem isso, o teste da correção passaria igual com ou sem ela, e não provaria nada.
 */
export function aplicarMarcaIngenua(el: HTMLInputElement, marcar: boolean): void {
  el.checked = marcar;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
