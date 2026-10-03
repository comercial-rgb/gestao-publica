import Link from "next/link";

/**
 * V33 — A COMPOSIÇÃO DE UMA LINHA DE DEMONSTRAÇÃO, NAVEGÁVEL. Cada conta que soma na linha abre o próprio razão no
 * MESMO período da demonstração, e mostra o saldo com que entrou — é o caminho do número do balanço até os
 * lançamentos (razão → lançamento → documento, já ligados).
 */
export function ContasDaLinha({
  contas,
  desde,
  ate,
}: {
  readonly contas: readonly { readonly codigo: string; readonly saldo: string }[];
  readonly desde: string;
  readonly ate: string;
}): React.ReactElement | null {
  if (contas.length === 0) return null;
  return (
    <span className="flex flex-col gap-0.5" data-composicao-da-linha>
      {contas.map((c) => (
        <Link
          key={c.codigo}
          className="font-mono text-[color:var(--color-primary)] underline"
          href={`/relatorios/livros/razao?conta=${encodeURIComponent(c.codigo)}&desde=${desde}&ate=${ate}&exercicio=${desde.slice(0, 4)}`}
          title="Abrir o razão desta conta no período da demonstração"
        >
          {c.codigo}{" "}
          <span className="text-[color:var(--color-ink-3)]">
            ({Number(c.saldo).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </span>
        </Link>
      ))}
    </span>
  );
}

/** O balancete do mesmo período, para conferir a demonstração contra o livro. */
export function LinkDoBalancete({ desde, ate }: { readonly desde: string; readonly ate: string }): React.ReactElement {
  return (
    <Link
      data-chrome
      className="text-xs text-[color:var(--color-primary)] underline"
      href={`/relatorios/livros/balancete?desde=${desde}&ate=${ate}&exercicio=${desde.slice(0, 4)}`}
    >
      Abrir o balancete deste período
    </Link>
  );
}
