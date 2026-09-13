import type { IdentidadeDaTela } from "../../lib/identidade/produto";

/**
 * A MARCA — imagem institucional quando há, senão as iniciais do produto; ao lado, o nome do
 * PRODUTO e, embaixo, o ENTE (ou o ambiente, quando não há ente configurado). Sem hook, sem
 * porta: serve ao servidor (login) e às ilhas client (sidebar) igualmente.
 *
 * ⚠️ A imagem vem da rota própria (`/identidade/imagem`), nunca de URL externa; `alt` é o
 * nome do ente — a marca é informação, não decoração.
 */
export function Marca({
  identidade,
  tamanho = "md",
  somenteSimbolo = false,
}: {
  readonly identidade: IdentidadeDaTela;
  readonly tamanho?: "md" | "lg";
  readonly somenteSimbolo?: boolean;
}): React.ReactElement {
  const lado = tamanho === "lg" ? "h-12 w-12 text-base" : "h-8 w-8 text-sm";
  const linha2 = identidade.enteNome ?? identidade.rotuloDoAmbiente ?? identidade.produtoDescricao;
  return (
    <div className="flex min-w-0 items-center gap-2.5" data-marca>
      {identidade.imagemHref !== null ? (
        // eslint-disable-next-line @next/next/no-img-element -- bytes servidos pela rota própria, sem otimizador externo
        <img
          src={identidade.imagemHref}
          alt={identidade.enteNome ?? identidade.produtoNome}
          className={`${lado} shrink-0 rounded-[var(--radius-md)] object-contain`}
        />
      ) : (
        <div
          aria-hidden
          className={`${lado} flex shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] font-bold text-[color:var(--color-primary-fg)]`}
        >
          {identidade.produtoSigla}
        </div>
      )}
      {somenteSimbolo ? null : (
        <div className="min-w-0">
          <div className={`truncate font-semibold leading-tight text-[color:var(--color-ink)] ${tamanho === "lg" ? "text-base" : "text-sm"}`} data-marca-produto>
            {identidade.produtoNome}
          </div>
          <div className="truncate text-xs leading-tight text-[color:var(--color-ink-3)]" data-marca-ente>
            {linha2}
          </div>
        </div>
      )}
    </div>
  );
}
