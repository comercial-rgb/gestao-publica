import Link from "next/link";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { contratosPublicos, PortaSemBancoError } from "../../../../lib/portas/contrato-acompanhado";

/**
 * CONTRATOS — ÁREA PÚBLICA (V7 M2.1). Fora de `(areas)`: identificação, contratado e início; o detalhe traz a
 * projeção pública do contrato (vigência derivada, valores, aditivos, responsáveis e execução física aprovada).
 */
export const dynamic = "force-dynamic";

export default async function ContratosPublicosPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  let contratos: Awaited<ReturnType<typeof contratosPublicos>> = [];
  let semBanco = false;
  try {
    contratos = await contratosPublicos();
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }
  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs"><Link href="/transparencia/demonstrativos" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> / Contratos</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Contratos</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro.</p>
      </header>
      {semBanco ? <p role="alert" className="text-sm">A consulta está temporariamente indisponível. Tente novamente mais tarde.</p> : contratos.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhum contrato cadastrado.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm" data-contratos-publicos>
            <thead><tr className="text-xs text-[color:var(--color-ink-2)]"><th className="py-1 pr-3">Contrato</th><th className="py-1 pr-3">Objeto</th><th className="py-1 pr-3">Contratado</th><th className="py-1">Início</th></tr></thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="py-2 pr-3"><Link href={`/transparencia/contratos/${c.id}`} className="text-[color:var(--color-primary)] underline">{c.numero}</Link></td>
                  <td className="py-2 pr-3">{c.objeto ?? "—"}</td><td className="py-2 pr-3">{c.contratado}</td><td className="py-2">{c.inicio}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
