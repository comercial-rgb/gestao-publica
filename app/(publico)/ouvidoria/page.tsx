import type { Metadata } from "next";
import Link from "next/link";
import { identidadePublica } from "../../../lib/portas/identidade";
import { lerOuvidoriasPublicadas, PortaSemBancoError } from "../../../lib/portas/ouvidoria";

/**
 * A OUVIDORIA — PÚBLICA (V7 M1 U4). Fora de `(areas)`: registrar e acompanhar manifestação não exige conta.
 * O que aparece aqui são os serviços da carta com a natureza de manifestação sem conta, publicados.
 */
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ouvidoria", referrer: "no-referrer" };

export default async function OuvidoriaPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  let servicos: Awaited<ReturnType<typeof lerOuvidoriasPublicadas>> = [];
  let semBanco = false;
  try {
    servicos = await lerOuvidoriasPublicadas();
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Ouvidoria</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · registre denúncias, reclamações, sugestões, dúvidas e elogios. Não é
          necessário cadastro nem identificação. Ao registrar, você receberá um protocolo e um código para acompanhar a resposta.
        </p>
      </header>
      {semBanco ? (
        <p role="alert" className="text-sm text-[color:var(--color-ink-2)]">A ouvidoria está temporariamente indisponível. Tente novamente mais tarde.</p>
      ) : servicos.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]" data-ouvidoria-vazia>No momento, não há canal de manifestação disponível pela internet.</p>
      ) : (
        <ul className="space-y-3" data-canais-da-ouvidoria>
          {servicos.map((s) => (
            <li key={s.slug} className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
              <h2 className="text-base font-semibold"><Link href={`/ouvidoria/${s.slug}`} className="text-[color:var(--color-primary)] hover:underline">{s.titulo}</Link></h2>
              <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{s.resumo}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-sm">
        Já registrou? <Link href="/ouvidoria/acompanhar" className="text-[color:var(--color-primary)] underline">Acompanhe com o protocolo e o código</Link>.
      </p>
      <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
        Por segurança, o número de envios por hora a partir de uma mesma conexão é limitado.
      </p>
    </main>
  );
}
