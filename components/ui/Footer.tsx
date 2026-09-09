/**
 * RODAPÉ — ente + versão real. O commit vem de `NEXT_PUBLIC_BUILD_COMMIT` (injetado no build): é o
 * que amarra a tela ao código que a gerou — quando alguém do TCE aponta um número, sabe-se de qual
 * versão ele saiu. Fora de um build versionado, o rodapé se anuncia como "ambiente de demonstração"
 * em vez de "build dev" — honesto sobre o que é, sem parecer inacabado.
 */

const ENTE = "Prefeitura Municipal de Campina Grande — SEFIN";

/** O rótulo de versão: `versão <commit>` num build versionado; senão, "ambiente de demonstração". */
export function rotuloDeVersao(): string {
  const commit = process.env.NEXT_PUBLIC_BUILD_COMMIT;
  return commit !== undefined && commit !== "" && commit !== "dev" ? `versão ${commit}` : "ambiente de demonstração";
}

export function Footer(): React.ReactElement {
  return (
    <footer
      data-chrome
      className="flex shrink-0 items-center justify-between gap-4 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-2 text-xs text-[color:var(--color-ink-3)]"
    >
      <span>{ENTE}</span>
      <span className="flex items-center gap-3">
        <span>SIAFIC · Sistema de Informações de Administração Financeira, Orçamentária e Contábil</span>
        <span className="tabular">{rotuloDeVersao()}</span>
      </span>
    </footer>
  );
}
