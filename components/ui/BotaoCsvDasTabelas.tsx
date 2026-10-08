"use client";

import { tabelasParaCsv } from "../../lib/csv/csv";

/**
 * V37 — EXPORTAR AS TABELAS DA TELA (os demonstrativos do RREO e do RGF que não tinham exportação). Lê os quadros
 * que a tela mostra, na ordem, com o título de cada um (a legenda da tabela ou o título de seção mais próximo antes
 * dela) e baixa um CSV só. Não consulta nada: o que vai para a planilha é exatamente o que está na tela. Células
 * mescladas viram células vazias à direita, para as colunas não se deslocarem.
 */
export function BotaoCsvDasTabelas({ nomeArquivo }: { readonly nomeArquivo: string }): React.ReactElement {
  function baixar(): void {
    const tabelas = [...document.querySelectorAll("main table")].filter((t) => t.closest("[data-chrome]") === null);
    const quadros = tabelas.map((t) => {
      let titulo = t.querySelector("caption")?.textContent?.trim() ?? "";
      if (titulo === "") {
        const secoes = [...document.querySelectorAll("main h1, main h2, main h3")].filter(
          (h) => (h.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        );
        titulo = secoes[secoes.length - 1]?.textContent?.trim() ?? "";
      }
      const linhas = [...t.querySelectorAll("tr")].map((tr) =>
        [...tr.querySelectorAll("th, td")].flatMap((c) => {
          const texto = ((c as HTMLElement).innerText || c.textContent || "").replace(/\s+/g, " ").trim();
          const span = Math.max(1, Number((c as HTMLTableCellElement).colSpan) || 1);
          return [texto, ...Array.from({ length: span - 1 }, () => "")];
        })
      );
      return { titulo, linhas };
    });
    const blob = new Blob([tabelasParaCsv(quadros)], { type: "text/csv;charset=utf-8" });
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
      data-exportar-tabelas
      title="Arquivo para planilha com os quadros desta tela, na ordem: colunas separadas por ponto e vírgula, valores como na tela."
      className="h-8 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]"
    >
      Exportar CSV
    </button>
  );
}
