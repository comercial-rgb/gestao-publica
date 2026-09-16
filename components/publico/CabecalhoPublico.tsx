import Link from "next/link";
import type { IdentidadePublica } from "../../lib/portas/identidade";

/**
 * O CABEÇALHO COMUM DAS TELAS PÚBLICAS (V9 N1) — ente, Transparência, Serviços, Entrar.
 *
 * ⚠️ QUEM APARECE AQUI É O ENTE. Brasão (quando cadastrado) e nome de exibição vêm da porta de
 * identidade, que os lê do cadastro — nunca de literal no código. Sem apresentação configurada,
 * o cabeçalho diz isso em vez de inventar uma prefeitura.
 *
 * ⚠️ E OS DESTINOS SÃO OS QUE EXISTEM. Um cabeçalho que anuncia seis áreas e entrega três páginas
 * vazias é pior que um que anuncia três: quem clica aprende a não confiar no menu. Os canais
 * opcionais (transparência, consulta pública) só entram quando a apresentação do ente os declara
 * ativos — é a mesma lista que a porta já usa na entrada do sistema.
 */
export function CabecalhoPublico({
  identidade,
  atual,
}: {
  readonly identidade: IdentidadePublica;
  readonly atual?: "transparencia" | "servicos" | "portal" | "ouvidoria";
}): React.ReactElement {
  const ente = identidade.ente;
  const itens = [
    { chave: "portal" as const, href: "/", rotulo: "Início" },
    { chave: "transparencia" as const, href: "/transparencia", rotulo: "Transparência" },
    { chave: "servicos" as const, href: "/servicos", rotulo: "Serviços" },
    { chave: "ouvidoria" as const, href: "/ouvidoria", rotulo: "Ouvidoria" },
  ];

  return (
    <header className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]" data-cabecalho-publico>
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          {ente?.imagemHref !== null && ente?.imagemHref !== undefined ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ente.imagemHref} alt="" aria-hidden className="h-9 w-auto shrink-0" />
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[color:var(--color-ink)]" data-ente-publico>
              {ente?.nomeDeExibicao ?? "Ente não configurado"}
            </span>
            <span className="block truncate text-xs text-[color:var(--color-ink-3)]">
              {ente?.orgao ?? identidade.rotuloDoAmbiente ?? identidade.produto.descricao}
            </span>
          </span>
        </Link>

        <nav aria-label="Áreas públicas" className="order-last flex w-full flex-wrap gap-1 text-sm sm:order-none sm:ml-auto sm:w-auto">
          {itens.map((i) => (
            <Link
              key={i.chave}
              href={i.href}
              aria-current={atual === i.chave ? "page" : undefined}
              className={`rounded-[var(--radius-md)] px-2.5 py-1.5 ${
                atual === i.chave
                  ? "bg-[color:var(--color-primary-soft)] font-semibold text-[color:var(--color-primary)]"
                  : "text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)]"
              }`}
            >
              {i.rotulo}
            </Link>
          ))}
          <Link
            href="/login"
            className="rounded-[var(--radius-md)] border border-[color:var(--color-primary)] px-2.5 py-1.5 font-semibold text-[color:var(--color-primary)] hover:bg-[color:var(--color-primary-soft)]"
          >
            Entrar
          </Link>
        </nav>
      </div>

      {identidade.pendencia !== null ? (
        // ⚠️ A PENDÊNCIA É DO ADMINISTRADOR, e por isso é discreta e factual: o cidadão não tem o
        // que fazer com ela, e escondê-la faria a demonstração parecer configurada quando não está.
        <p className="border-t border-[color:var(--color-border)] bg-[color:var(--color-status-alerta-bg)] px-4 py-1.5 text-xs text-[color:var(--color-status-alerta-fg)] sm:px-6">
          {identidade.pendencia === "BANCO_INDISPONIVEL"
            ? "As consultas estão indisponíveis agora: o banco de dados não respondeu."
            : "A identidade da instituição ainda não foi configurada em Administração › Apresentação."}
        </p>
      ) : null}
    </header>
  );
}
