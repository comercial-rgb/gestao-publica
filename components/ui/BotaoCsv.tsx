"use client";

/**
 * BAIXAR CSV — ilha client mínima. Recebe o CSV JÁ PRONTO (montado no servidor, a partir dos MESMOS
 * dados da tabela) e só dispara o download. Nada de segunda consulta: o servidor já tem a tela.
 *
 * ⚠️ O tipo é `text/csv;charset=utf-8` e o conteúdo já traz o BOM — o Excel BR abre com acento certo.
 */
export function BotaoCsv({ csv, nomeArquivo }: { readonly csv: string; readonly nomeArquivo: string }): React.ReactElement {
  function baixar(): void {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <button
      type="button"
      onClick={baixar}
      data-chrome
      className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
    >
      Exportar CSV
    </button>
  );
}
