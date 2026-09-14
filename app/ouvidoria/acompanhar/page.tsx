import type { Metadata } from "next";
import Link from "next/link";
import { identidadePublica } from "../../../lib/portas/identidade";
import { FormAcompanhar } from "../FormulariosDaOuvidoria";

/**
 * ACOMPANHAR MANIFESTAÇÃO — PÚBLICO (V7 M1 U4).
 *
 * ⚠️ O CÓDIGO NUNCA ENTRA NA URL: a consulta é um POST da ilha (Server Action), sem `searchParams`.
 * Assim ele não fica no histórico, no log de acesso nem no `Referer` de um link da página.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acompanhar manifestação", referrer: "no-referrer" };

export default async function AcompanharPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs"><Link href="/ouvidoria" className="text-[color:var(--color-primary)] hover:underline">Ouvidoria</Link> / Acompanhar</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Acompanhar manifestação</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">Informe o protocolo e o código recebidos no registro. Você vê a situação e as respostas liberadas pela ouvidoria.</p>
      </header>
      <FormAcompanhar />
    </main>
  );
}
