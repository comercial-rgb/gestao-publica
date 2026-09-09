/**
 * IMPRIMIR PDF — âncora para uma rota de emissão (server-side, autenticada). Abre o PDF em nova aba
 * (`target="_blank"`). Não é ilha client: é só um link para a rota que gera o documento — o mesmo
 * motor da publicação (7.15). O rótulo default é "Imprimir PDF".
 */
export function BotaoPdf({ href, rotulo = "Imprimir PDF" }: { readonly href: string; readonly rotulo?: string }): React.ReactElement {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-chrome
      className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
    >
      {rotulo}
    </a>
  );
}
