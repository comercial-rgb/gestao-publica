import { redirect } from "next/navigation";
import { sessaoAtual } from "../../lib/portas/sessao";
import { rotuloDeVersao } from "../../components/ui/Footer";
import { FormLogin } from "./FormLogin";

/**
 * /LOGIN — fora do grupo `(areas)`, então SEM shell (sidebar/header). Se já houver sessão, entra
 * direto. Força-dinâmica (lê cookie/sessão a cada request).
 */
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  // já autenticado? vai para o retorno (ou a home).
  if ((await sessaoAtual()) !== null) {
    const sp = await searchParams;
    const r = Array.isArray(sp["retorno"]) ? sp["retorno"][0] : sp["retorno"];
    redirect(r !== undefined && r.startsWith("/") && !r.startsWith("//") ? r : "/");
  }

  const sp = await searchParams;
  const retornoBruto = Array.isArray(sp["retorno"]) ? sp["retorno"][0] : sp["retorno"];
  const retorno = retornoBruto !== undefined && retornoBruto.startsWith("/") && !retornoBruto.startsWith("//") ? retornoBruto : "/";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[color:var(--color-surface-2)] p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] text-sm font-bold text-[color:var(--color-primary-fg)]">SF</div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-[color:var(--color-ink)]">SIAFIC</h1>
            <p className="text-xs leading-tight text-[color:var(--color-ink-3)]">Campina Grande/PB</p>
          </div>
        </div>
        <h2 className="mb-4 text-lg font-semibold text-[color:var(--color-ink)]">Entrar</h2>
        <FormLogin retorno={retorno} />
      </div>
      <footer className="max-w-sm text-center text-[11px] leading-tight text-[color:var(--color-ink-3)]">
        <p>Prefeitura Municipal de Campina Grande — SEFIN</p>
        <p className="mt-0.5 tabular">SIAFIC · {rotuloDeVersao()}</p>
      </footer>
    </div>
  );
}
