import Link from "next/link";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { obrasPublicas, PortaSemBancoError } from "../../../../lib/portas/obras-no-portal";

/**
 * V36 (TR 5.10.1.54) — OBRAS — ÁREA PÚBLICA. Só as obras publicadas por ato do município; o detalhe traz o cadastro, os
 * valores, as medições aprovadas e os documentos.
 */
export const dynamic = "force-dynamic";

const reais = (v: string | null): string => (v === null ? "—" : `R$ ${formatarMoeda(v).texto}`);

export default async function ObrasPublicasPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  let obras: Awaited<ReturnType<typeof obrasPublicas>> = [];
  let semBanco = false;
  try {
    obras = await obrasPublicas();
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }
  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs"><Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> / Obras</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Obras</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro.</p>
      </header>
      {semBanco ? <p role="alert" className="text-sm">A consulta está temporariamente indisponível. Tente novamente mais tarde.</p> : obras.length === 0 ? <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma obra publicada.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm" data-obras-publicas>
            <thead>
              <tr className="text-xs text-[color:var(--color-ink-2)]">
                <th className="py-1 pr-3">Obra</th>
                <th className="py-1 pr-3">Descrição</th>
                <th className="py-1 pr-3 text-right">Valor da obra</th>
                <th className="py-1 pr-3 text-right">Contratado</th>
                <th className="py-1 pr-3 text-right">Empenhado</th>
                <th className="py-1 text-right">Executado</th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.id} className="border-t border-[color:var(--color-border)] align-top">
                  <td className="py-2 pr-3"><Link href={`/transparencia/obras/${o.id}`} className="text-[color:var(--color-primary)] underline">{o.identificador}</Link></td>
                  <td className="py-2 pr-3">{o.descricao}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{reais(o.valorDaObra)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{reais(o.valorContratado)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{reais(o.valorEmpenhado)}</td>
                  <td className="py-2 text-right tabular-nums">{o.percentualExecutado === null ? "—" : `${o.percentualExecutado.replace(".", ",")}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
