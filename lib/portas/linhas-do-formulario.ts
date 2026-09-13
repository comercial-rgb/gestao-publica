/**
 * AS LINHAS `prefixo.N.campo` DE UM FORMULÁRIO — o mesmo idioma das entradas da liquidação (V4 §6).
 *
 * Devolve uma linha por índice presente, na ordem dos índices, com os campos pedidos já aparados.
 * Linha em que TODOS os campos-chave estão vazios é ignorada: a ilha oferece uma linha a mais do
 * que o operador precisa, e a vazia não é erro. Quem valida o conteúdo é o domínio.
 */
export function linhasDoFormulario(
  formData: FormData,
  prefixo: string,
  campos: readonly string[],
  chaves: readonly string[] = campos
): readonly Readonly<Record<string, string>>[] {
  const indices = new Set<number>();
  const re = new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.(\\d+)\\.`);
  for (const k of formData.keys()) {
    const m = re.exec(k);
    if (m !== null) indices.add(Number(m[1]));
  }
  const saida: Record<string, string>[] = [];
  for (const i of [...indices].sort((a, b) => a - b)) {
    const linha: Record<string, string> = {};
    for (const c of campos) {
      const v = formData.get(`${prefixo}.${i}.${c}`);
      linha[c] = typeof v === "string" ? v.trim() : "";
    }
    if (chaves.every((c) => (linha[c] ?? "") === "")) continue;
    saida.push(linha);
  }
  return saida;
}
