import { identidadeNeutra, type IdentidadeDaTela } from "../../lib/identidade/produto";

/**
 * RODAPÉ — ente, produto, fornecedor e VERSÃO LEGÍVEL (V6 P0.1). O commit curto amarra a
 * tela ao build; o SHA completo saiu do rodapé comum e mora na área técnica autorizada
 * (`/administracao/sistema`) e nas evidências. Fora de um build versionado não há versão —
 * e o AMBIENTE (desenvolvimento, demonstração) é dito no cabeçalho, não confundido com ela.
 */
export function Footer({ identidade = identidadeNeutra() }: { readonly identidade?: IdentidadeDaTela }): React.ReactElement {
  const ente = identidade.enteNome !== null
    ? `${identidade.enteNome}${identidade.enteOrgao !== null ? ` — ${identidade.enteOrgao}` : ""}`
    : "Ente não configurado";
  const produto = identidade.assinaturaDoFornecedor !== null
    ? `${identidade.produtoNome} · ${identidade.assinaturaDoFornecedor}`
    : `${identidade.produtoNome} · ${identidade.produtoDescricao}`;
  return (
    <footer
      data-chrome
      className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-2 text-xs text-[color:var(--color-ink-3)] md:px-8"
    >
      <span className="truncate" data-rodape-ente>{ente}</span>
      <span className="flex flex-wrap items-center gap-3">
        <span className="truncate">{produto}</span>
        {identidade.versao !== null ? <span className="tabular" data-rodape-versao>versão {identidade.versao}</span> : null}
      </span>
    </footer>
  );
}
