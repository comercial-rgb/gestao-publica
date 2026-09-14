import Link from "next/link";
import { identidadePublica } from "../../lib/portas/identidade";
import { lerCartaPublica, PortaSemBancoError } from "../../lib/portas/carta-de-servicos";

/**
 * A CARTA DE SERVIÇOS — PÚBLICA (V6.2 P3). Mora fora de `(areas)`, como `/consulta` e a transparência:
 * a carta é o que o ente oferece a quem ainda não tem conta. Pedir exige entrar; LER não exige.
 *
 * ⚠️ SÓ O QUE ESTÁ PUBLICADO. Rascunho não aparece, e a carta não inventa prazo, custo nem etapa: o que
 * não foi declarado na versão publicada aparece como não declarado.
 */
export const dynamic = "force-dynamic";

const PUBLICOS = [
  { valor: "", rotulo: "Todos" },
  { valor: "CIDADAO", rotulo: "Cidadão" },
  { valor: "FORNECEDOR", rotulo: "Fornecedor" },
  { valor: "SERVIDOR", rotulo: "Servidor" },
] as const;

export default async function CartaDeServicosPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const publico = typeof sp["publico"] === "string" ? sp["publico"] : "";
  const id = await identidadePublica();
  let servicos: Awaited<ReturnType<typeof lerCartaPublica>> = [];
  let semBanco = false;
  try {
    servicos = await lerCartaPublica(publico === "" ? {} : { publico });
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }
  const categorias = [...new Set(servicos.map((s) => s.categoria))];
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Carta de serviços</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]" data-ente-publico>
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · o que você pode pedir pela internet, com requisitos, documentos e prazo. Ler não exige
          cadastro; pedir exige entrar com a sua conta.
        </p>
      </header>

      <nav aria-label="Filtrar por público" className="mb-4 flex flex-wrap gap-2 text-xs">
        {PUBLICOS.map((p) => (
          <Link
            key={p.valor}
            href={p.valor === "" ? "/servicos" : `/servicos?publico=${p.valor}`}
            aria-current={publico === p.valor ? "page" : undefined}
            className={`rounded-[var(--radius-md)] border px-2 py-1 ${publico === p.valor ? "border-[color:var(--color-primary)] font-semibold text-[color:var(--color-primary)]" : "border-[color:var(--color-border-strong)] text-[color:var(--color-ink-2)]"}`}
          >
            {p.rotulo}
          </Link>
        ))}
      </nav>

      {semBanco ? (
        <p role="alert" className="text-sm text-[color:var(--color-ink-2)]">A carta está indisponível agora (banco de dados fora do ar). Nada foi omitido de propósito.</p>
      ) : servicos.length === 0 ? (
        <p className="text-sm text-[color:var(--color-ink-2)]" data-carta-vazia>Nenhum serviço publicado{publico === "" ? "" : " para este público"} até agora.</p>
      ) : (
        categorias.map((c) => (
          <section key={c} className="mb-6" aria-labelledby={`cat-${c}`}>
            <h2 id={`cat-${c}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">{c}</h2>
            <ul className="space-y-3">
              {servicos.filter((s) => s.categoria === c).map((s) => (
                <li key={s.slug} data-servico={s.slug} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
                  <Link href={`/servicos/${s.slug}`} className="text-sm font-medium text-[color:var(--color-primary)] hover:underline">{s.titulo}</Link>
                  <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">{s.resumo}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">{s.publico} · {s.tipo} · prazo: {s.prazo ?? "não declarado"}</p>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <footer className="mt-6 border-t border-[color:var(--color-border)] pt-3 text-xs text-[color:var(--color-ink-3)]">
        Já pediu? <Link href="/meus-servicos" className="text-[color:var(--color-primary)] hover:underline">Acompanhe as suas solicitações</Link> ou{" "}
        <Link href="/consulta" className="text-[color:var(--color-primary)] hover:underline">consulte pelo número e código verificador</Link>.
      </footer>
    </main>
  );
}
