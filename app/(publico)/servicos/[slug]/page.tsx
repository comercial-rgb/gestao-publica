import Link from "next/link";
import { notFound } from "next/navigation";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { lerServicoPublicado } from "../../../../lib/portas/carta-de-servicos";
import { escalaVigente, resultadoDoServicoPublico, type ResultadoParaTela } from "../../../../lib/portas/ouvidoria";
import { FormOpiniao } from "../../ouvidoria/FormulariosDaOuvidoria";

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

function Origem({ titulo, o }: { readonly titulo: string; readonly o: { readonly respostas: number; readonly satisfacao: string | null; readonly atendimento: string | null; readonly prazos: string | null } }): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">{titulo}</h3>
      {o.respostas === 0 ? (
        <p className="mt-1 text-sm">Ainda sem avaliações no período.</p>
      ) : (
        <dl className="mt-1 grid grid-cols-2 gap-x-3 text-sm">
          <dt>Respostas</dt><dd className="tabular-nums">{o.respostas}</dd>
          <dt>Satisfação</dt><dd className="tabular-nums">{o.satisfacao}</dd>
          <dt>Atendimento</dt><dd className="tabular-nums">{o.atendimento}</dd>
          <dt>Prazos</dt><dd className="tabular-nums">{o.prazos}</dd>
        </dl>
      )}
    </div>
  );
}

/** O RESULTADO PÚBLICO — por origem, com número de respostas, período, método e removidas. Sem autor nem descrição. */
function ResultadoDasAvaliacoes({ r }: { readonly r: ResultadoParaTela | null }): React.ReactElement | null {
  if (r === null) return null;
  if (r.resultado.situacao === "SEM-METODOLOGIA") {
    return <section className="mt-6" data-bloco="avaliacoes" data-avaliacoes="sem-metodologia"><h2 className="mb-1 text-sm font-semibold">Avaliações</h2><p className="text-sm text-[color:var(--color-ink-2)]">A avaliação dos serviços ainda não foi aberta pelo ente.</p></section>;
  }
  const x = r.resultado;
  return (
    <section className="mt-6" data-bloco="avaliacoes" data-avaliacoes="publicado">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Avaliações</h2>
      <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">Período {r.periodo} · escala de {x.metodologia.escalaMinima} a {x.metodologia.escalaMaxima} (metodologia versão {x.metodologia.versao})</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Origem titulo="De quem foi atendido" o={x.atendimentoComprovado} />
        <Origem titulo="Opinião geral, sem conta" o={x.opiniaoGeral} />
      </div>
      <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
        {x.metodologia.descricaoDoMetodo} {x.removidas > 0 ? `${x.removidas} avaliação(ões) removida(s) por abuso ou dado pessoal.` : "Nenhuma avaliação removida no período."}
        {x.deOutraMetodologia > 0 ? ` ${x.deOutraMetodologia} feita(s) em versão anterior da escala não entra(m) na média.` : ""}
      </p>
    </section>
  );
}

export default async function ServicoPublicoPage({ params }: { readonly params: Promise<{ readonly slug: string }> }): Promise<React.ReactElement> {
  const { slug } = await params;
  const [s, id, resultado, escala] = await Promise.all([lerServicoPublicado(slug), identidadePublica(), resultadoDoServicoPublico(slug), escalaVigente()]);
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
      <p className="mt-6 flex flex-wrap items-center gap-3">
        {s.exigeAutenticacao ? (
          <>
            <Link href={`/meus-servicos/solicitar/${s.slug}`} data-pedir className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-5 text-sm font-semibold text-[color:var(--color-primary-fg)]">
              Pedir este serviço
            </Link>
            <span className="text-xs text-[color:var(--color-ink-3)]">É preciso entrar com a sua conta.</span>
          </>
        ) : (
          <>
            <Link href={`/ouvidoria/${s.slug}`} data-manifestar className="inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-5 text-sm font-semibold text-[color:var(--color-primary-fg)]">
              Registrar manifestação
            </Link>
            <span className="text-xs text-[color:var(--color-ink-3)]">Não é preciso conta nem identificação.</span>
          </>
        )}
      </p>
      <ResultadoDasAvaliacoes r={resultado} />
      {escala !== null ? (
        <section className="mt-6" data-bloco="opiniao">
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Dê a sua opinião sobre este serviço</h2>
          <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
            Opinião geral, sem conta — contada à parte de quem avaliou um atendimento concluído. Enviar de novo pelo mesmo navegador revisa a
            anterior. Há limite de envios por hora a partir da mesma origem.
          </p>
          <FormOpiniao slug={s.slug} escala={escala} />
        </section>
      ) : null}
    </main>
  );
}
