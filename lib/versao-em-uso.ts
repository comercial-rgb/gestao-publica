/**
 * V38 — A VERSÃO EM USO × A VERSÃO NO AR. Pura.
 *
 * ⚠️ O QUE ISTO EVITA. Uma contadora preencheu o empenho enquanto o sistema era publicado; ao gravar, recebeu um erro
 * sem explicação ("Failed to find Server Action", no log do dia 08/10/2026). A tela carregada antes da publicação
 * aponta para ações que a versão nova não tem mais. O vigia pergunta a `/release` de tempos em tempos; quando o commit
 * no ar não é o da tela, avisa para recarregar antes de gravar.
 *
 * Fora de um build versionado (`versao` nula, no desenvolvimento) nunca pede recarga: não há o que comparar.
 */
export function precisaRecarregar(versaoEmUso: string | null, commitNoAr: string | null | undefined): boolean {
  if (versaoEmUso === null || versaoEmUso === "") return false;
  if (commitNoAr === null || commitNoAr === undefined || commitNoAr === "") return false;
  return commitNoAr.slice(0, 7) !== versaoEmUso.slice(0, 7);
}
