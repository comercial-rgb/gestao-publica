/**
 * EXPORTAR PARA EXCEL (V22) — um link para a rota `.xlsx` do mesmo recorte da tela. É link, e não
 * botão com script, porque o arquivo vem do servidor já autorizado: a tela só aponta para ele.
 */
export function BotaoExcel({ href, rotulo = "Exportar Excel" }: { readonly href: string; readonly rotulo?: string }): React.ReactElement {
  return (
    <a
      href={href}
      download
      data-chrome
      className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
    >
      {rotulo}
    </a>
  );
}
