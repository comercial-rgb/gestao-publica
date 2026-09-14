import Link from "next/link";
import { notFound } from "next/navigation";
import { identidadePublica } from "../../../lib/portas/identidade";
import { lerServicoPublicado } from "../../../lib/portas/carta-de-servicos";

/**
 * UM SERVIÇO DA CARTA — PÚBLICO (V6.2 P3): a última versão PUBLICADA, com as etapas copiadas do roteiro
 * real do protocolo. Rascunho e serviço sem publicação respondem 404, igual a um endereço que não existe.
 */
export const dynamic = "force-dynamic";

function Bloco({ titulo, children, dado }: { readonly titulo: string; readonly children: React.ReactNode; readonly dado: string }): React.ReactElement {
  return (
    <section className="mb-4" data-bloco={dado}>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h2>
      <div className="text-sm text-[color:var(--color-ink-2)]">{children}</div>
    </section>
  );
}

export default async function ServicoPublicoPage({ params }: { readonly params: Promise<{ readonly slug: string }> }): Promise<React.ReactElement> {
  const { slug } = await params;
  const [s, id] = await Promise.all([lerServicoPublicado(slug), identidadePublica()]);
  if (s === null) notFound();
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6" data-tema={id.ente?.tema ?? "PADRAO"}>
      <p className="mb-2 text-xs"><Link href="/servicos" className="text-[color:var(--color-primary)] hover:underline">Carta de serviços</Link> / {s.categoria}</p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">{s.titulo}</h1>
        <p className="mt-1 text-xs text-[color:var(--color-ink-3)]" data-versao-publicada={s.versao}>
          {s.publico} · {s.tipo} · versão {s.versao}, publicada em {s.publicadaEm}
        </p>
      </header>
      <Bloco titulo="O que é" dado="descricao"><p className="whitespace-pre-line">{s.descricao}</p></Bloco>
      <Bloco titulo="Quem pode pedir e o que é preciso" dado="requisitos">
        <p className="whitespace-pre-line">{s.requisitos}</p>
        {s.representacaoObrigatoria ? <p className="mt-1">Este serviço é pedido em nome da empresa, por quem tem representação registrada e vigente dela.</p> : null}
      </Bloco>
      <Bloco titulo="Documentos" dado="documentos">
        {s.documentos.length === 0 ? <p>Nenhum documento exigido nesta versão.</p> : <ul className="list-disc pl-5">{s.documentos.map((d) => <li key={d}>{d}</li>)}</ul>}
      </Bloco>
      <Bloco titulo="Prazo" dado="prazo">
        <p>{s.prazo === null ? "Não declarado nesta versão." : `${s.prazo} — ${s.fundamentoDoPrazo ?? ""}`}</p>
      </Bloco>
      <Bloco titulo="Custo" dado="custo"><p>{s.custo ?? "Não declarado nesta versão."}</p></Bloco>
      <Bloco titulo="Onde e como" dado="canais"><p className="whitespace-pre-line">{s.canais}</p></Bloco>
      <Bloco titulo="Por onde o pedido passa" dado="etapas">
        {s.etapas.length === 0 ? (
          <p>O assunto que executa este serviço não tem etapas definidas: o pedido fica no setor de entrada até a decisão.</p>
        ) : (
          <ol className="list-decimal pl-5">
            {s.etapas.map((e) => <li key={e.ordem}>{e.setor}{e.descricao === null ? "" : ` — ${e.descricao}`}{e.prazoDias === null ? "" : ` (${e.prazoDias} dias)`}</li>)}
          </ol>
        )}
      </Bloco>
      <Bloco titulo="O que o formulário pergunta" dado="campos">
        <ul className="list-disc pl-5">{s.campos.map((c) => <li key={c.nome}>{c.rotulo}{c.obrigatorio ? " (obrigatório)" : ""}</li>)}</ul>
      </Bloco>
      <p className="mt-6">
        <Link href={`/meus-servicos/solicitar/${s.slug}`} data-pedir className="inline-block rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-5 py-3 text-sm font-semibold text-[color:var(--color-primary-fg)]">
          Pedir este serviço
        </Link>
        <span className="ml-3 text-xs text-[color:var(--color-ink-3)]">É preciso entrar com a sua conta.</span>
      </p>
    </main>
  );
}
