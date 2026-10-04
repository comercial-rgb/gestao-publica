import Link from "next/link";
import { redirect } from "next/navigation";
import { Marca } from "../../components/ui/Marca";
import { MotivoDaMarca } from "../../components/ui/MotivoDaMarca";
import { identidadePublica, paraATela } from "../../lib/portas/identidade";
import { sessaoAtual } from "../../lib/portas/sessao";
import { FormLogin } from "./FormLogin";

/**
 * /LOGIN — fora do grupo `(areas)`, então SEM shell (sidebar/header). Se já houver sessão, entra
 * direto. Força-dinâmica (lê cookie/sessão a cada request).
 *
 * ═══ A ENTRADA (V6 P0.1/P0.2) ═══
 * Três coisas separadas na tela: o PRODUTO (Gestão Pública), a INSTITUIÇÃO (do cadastro, pela
 * porta de identidade — nunca escrita aqui) e o AMBIENTE (do build). Sem ente configurado, a
 * identidade é a neutra de desenvolvimento, e a pendência vai para o administrador — não para
 * o público. Os CANAIS aparecem só quando existem e estão ativados; o portal público não recebe
 * a lista de módulos privados.
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
  const id = await identidadePublica();
  const tela = paraATela(id);
  const canaisPublicos = id.canais.filter((c) => c.id !== "gestao-interna");

  return (
    <div className="flex min-h-screen flex-col bg-[color:var(--color-cinza-claro)]" data-tema={tela.tema}>
      <main className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="grid w-full max-w-3xl overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow-[var(--shadow-card)] md:grid-cols-[1.1fr_1fr]">
          {/* a instituição e o produto */}
          <section aria-label="Identificação" data-superficie="grafite" className="relative flex min-w-0 flex-col gap-5 overflow-hidden border-b-4 border-[color:var(--color-engine)] bg-[color:var(--color-surface)] p-6 md:border-b-0 md:border-l-4">
            <MotivoDaMarca />
            <div className="relative">
              <Marca identidade={tela} tamanho="lg" />
            </div>
            <div className="relative space-y-1">
              <p className="text-sm text-[color:var(--color-ink-2)]">{id.produto.descricao}.</p>
              {id.ente !== null && id.ente.orgao !== null ? (
                <p className="text-xs text-[color:var(--color-ink-3)]">{id.ente.orgao}</p>
              ) : null}
              {id.rotuloDoAmbiente !== null ? (
                <p className="inline-block rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-status-alerta-fg)]" data-ambiente>
                  {id.rotuloDoAmbiente}
                </p>
              ) : null}
            </div>
            {canaisPublicos.length > 0 ? (
              <nav aria-label="Canais públicos" className="relative mt-auto">
                <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Acesso público</h2>
                <ul className="space-y-1">
                  {canaisPublicos.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} className="text-sm font-medium text-[color:var(--color-primary)] hover:underline" data-canal={c.id}>
                        {c.rotulo}
                      </Link>
                      <span className="block text-xs text-[color:var(--color-ink-3)]">{c.descricao}</span>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {id.ente !== null && (id.ente.contatoEmail !== null || id.ente.contatoTelefone !== null || id.ente.horarioDeAtendimento !== null) ? (
              <dl className="relative text-xs text-[color:var(--color-ink-3)]">
                {id.ente.contatoEmail !== null ? <div><dt className="inline">E-mail: </dt><dd className="inline">{id.ente.contatoEmail}</dd></div> : null}
                {id.ente.contatoTelefone !== null ? <div><dt className="inline">Telefone: </dt><dd className="inline">{id.ente.contatoTelefone}</dd></div> : null}
                {id.ente.horarioDeAtendimento !== null ? <div><dt className="inline">Atendimento: </dt><dd className="inline">{id.ente.horarioDeAtendimento}</dd></div> : null}
              </dl>
            ) : null}
            {/* V22: a assinatura da Engine na entrada — ativo oficial, versão para fundo escuro. */}
            <img src="/marca/engine-horizontal-fundo-escuro.svg" alt="Engine Sistemas" className="relative mt-auto h-8 w-auto self-start pt-2" />
          </section>

          {/* o acesso */}
          <section aria-label="Acesso à gestão interna" className="min-w-0 p-6">
            <h1 className="mb-1 text-lg font-semibold text-[color:var(--color-ink)]">Acesso à gestão interna</h1>
            <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">Informe seu usuário e sua senha para acessar o sistema.</p>
            <FormLogin retorno={retorno} />
          </section>
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pb-4 text-center text-[11px] leading-tight text-[color:var(--color-ink-2)]">
        <span>{id.assinaturaDoFornecedor !== null ? `${id.produto.nome} · ${id.assinaturaDoFornecedor}` : id.produto.nome}</span>
        {id.versao !== null ? <span className="tabular" data-rodape-versao>versão {id.versao}</span> : null}
      </footer>
    </div>
  );
}
