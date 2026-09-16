import Link from "next/link";

/**
 * O RODAPÉ DO FORNECEDOR — "Desenvolvido por Engine Sistemas" (V9 N1).
 *
 * ⚠️ DUAS ASSINATURAS, E ELAS NÃO SE MISTURAM. Quem PUBLICA o ato é o ente: o nome e o brasão
 * dele estão no cabeçalho, e é a autoridade dele que o documento carrega. Quem DESENVOLVE o
 * sistema é a Engine, e isso se diz no rodapé, uma vez, sem competir com a instituição.
 *
 * ⚠️ E A VARIANTE DO LOGO SE ESCOLHE PELO FUNDO, não pelo gosto. No kit, "dark" e "white"
 * nomeiam a cor do TEXTO — `logo-horizontal-dark` é o de texto grafite, que vai em fundo CLARO.
 * Os nomes em `public/marca/` foram trocados para dizer onde se aplicam; ver `ORIGEM.md`.
 *
 * A largura fica em `auto` de propósito: o lockup é 1920×597 e distorcê-lo é a forma mais fácil
 * de violar um manual de marca sem perceber.
 */
export function RodapeEngine({
  fundo = "claro",
  className = "",
}: {
  readonly fundo?: "claro" | "escuro";
  readonly className?: string;
}): React.ReactElement {
  const src = fundo === "escuro" ? "/marca/engine-horizontal-fundo-escuro.svg" : "/marca/engine-horizontal-fundo-claro.svg";
  return (
    <footer
      className={`mt-10 border-t border-[color:var(--color-border)] px-4 py-6 text-xs sm:px-6 ${className}`}
      data-rodape-engine
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {/* `next/image` exigiria largura e altura fixas; aqui a altura manda e a largura segue,
              que é o que o manual pede. `alt` vazio porque o texto ao lado já nomeia a marca —
              repetir faria o leitor de tela dizer "Engine Sistemas Engine Sistemas". */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" aria-hidden className="h-6 w-auto" />
          <span className={fundo === "escuro" ? "text-[color:var(--color-surface)]" : "text-[color:var(--color-ink-2)]"}>
            Desenvolvido por{" "}
            <Link
              href="https://enginesistemas.com.br"
              target="_blank"
              // `noopener` fecha o acesso do site aberto à janela que o abriu; `noreferrer` não
              // conta de onde o clique veio. Link externo em produto de governo leva os dois.
              rel="noopener noreferrer"
              className="font-semibold underline decoration-[color:var(--color-engine)] underline-offset-2 hover:text-[color:var(--color-engine-forte)]"
            >
              Engine Sistemas
            </Link>
          </span>
        </div>
        <p className={fundo === "escuro" ? "text-[color:var(--color-ink-3)]" : "text-[color:var(--color-ink-3)]"}>
          Gestão Pública — sistema integrado de gestão municipal.
        </p>
      </div>
    </footer>
  );
}
