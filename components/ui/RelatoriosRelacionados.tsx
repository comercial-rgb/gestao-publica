import Link from "next/link";
import type { RelacaoRelatorio } from "../../lib/navegacao";

/**
 * "VER TAMBÉM" — a seção de rodapé que faz as páginas de relatório CONVERSAREM. Cada relação
 * carrega o POR QUÊ (a identidade que os testes provam): não é "veja também" solto, é "estes dois
 * números têm de bater, e aqui está o outro". Zero domínio — recebe as relações já resolvidas.
 *
 * ⚠️ Sobrevive à impressão? Não: é navegação (`data-chrome`), some no papel — o demonstrativo
 * impresso é só o demonstrativo.
 */
export function RelatoriosRelacionados({
  relacoes,
}: {
  readonly relacoes: readonly RelacaoRelatorio[];
}): React.ReactElement | null {
  if (relacoes.length === 0) return null;
  return (
    <section data-chrome className="mt-2">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
        Ver também
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {relacoes.map((r) => (
          <li key={r.href}>
            <Link
              href={r.href}
              className="group block rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 transition-colors hover:border-[color:var(--color-primary)]"
            >
              <span className="text-sm font-medium text-[color:var(--color-ink)] group-hover:text-[color:var(--color-primary)]">
                {r.rotulo}
              </span>
              <span className="mt-0.5 block text-xs text-[color:var(--color-ink-3)]">{r.motivo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
