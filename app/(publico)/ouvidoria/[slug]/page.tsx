import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { lerServicoPublicado } from "../../../../lib/portas/carta-de-servicos";
import { OPCOES_DE_TIPO_DE_MANIFESTACAO } from "../../../../lib/portas/ouvidoria";
import { FormManifestacao } from "../FormulariosDaOuvidoria";

/**
 * REGISTRAR MANIFESTAÇÃO — PÚBLICO (V7 M1 U4). Só serviço publicado da natureza sem conta; qualquer
 * outro endereço responde 404 (e o servidor recusa de novo no ato).
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Registrar manifestação", referrer: "no-referrer" };

export default async function ManifestacaoPage({ params }: { readonly params: Promise<{ readonly slug: string }> }): Promise<React.ReactElement> {
  const { slug } = await params;
  const [s, id] = await Promise.all([lerServicoPublicado(slug), identidadePublica()]);
  if (s === null || s.exigeAutenticacao) notFound();
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs"><Link href="/ouvidoria" className="text-[color:var(--color-primary)] hover:underline">Ouvidoria</Link> / {s.titulo}</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">{s.titulo}</h1>
        <p className="mt-1 whitespace-pre-line text-sm text-[color:var(--color-ink-2)]">{s.descricao}</p>
        <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
          Sem conta e sem identificação. A manifestação é sigilosa: só a ouvidoria a lê. Prazo: {s.prazo ?? "não declarado nesta versão"}.
        </p>
      </header>
      <FormManifestacao slug={s.slug} campos={s.campos as never} tipos={OPCOES_DE_TIPO_DE_MANIFESTACAO} termoDeAceite={s.termoDeAceite} />
    </main>
  );
}
