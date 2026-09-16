import Link from "next/link";
import { notFound } from "next/navigation";
import { bemPublico, PortaSemBancoError } from "../../../../../lib/portas/bens-publicos";
import { identidadePublica } from "../../../../../lib/portas/identidade";
import { formatarMoeda } from "../../../../../lib/format/moeda";

/**
 * O DETALHE PÚBLICO DE UM BEM (V9 N2) — abas Geral, Localização e Movimentações.
 *
 * ⚠️ AS ABAS SÃO LINKS, NÃO JANELA. A aba escolhida fica no endereço (`?aba=localizacao`), então
 * ela entra no histórico do navegador, pode ser enviada como link e volta com o botão "voltar".
 * Uma aba em estado de componente perde tudo isso e ainda some para quem navega por teclado.
 *
 * ⚠️ E O RETORNO PRESERVA A CONSULTA. O link "voltar à consulta" carrega de volta os filtros que
 * trouxeram o leitor até aqui — sem isso, examinar cinco bens de uma lista filtrada significa
 * remontar o filtro cinco vezes.
 *
 * ⚠️ O VALOR CONTÁBIL VEM COM A DATA. Sem ela o número não é conferível: depreciação e
 * reavaliação o mudam, e quem baixa hoje e confere amanhã acharia divergência onde há apenas
 * passagem do tempo.
 */
export const dynamic = "force-dynamic";

const ABAS = [
  { chave: "geral", rotulo: "Geral" },
  { chave: "localizacao", rotulo: "Localização" },
  { chave: "movimentacoes", rotulo: "Movimentações" },
] as const;

type Aba = (typeof ABAS)[number]["chave"];

export default async function BemPublicoPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { id } = await params;
  const sp = await searchParams;
  const identidade = await identidadePublica();

  const aba: Aba = (ABAS.map((a) => a.chave) as readonly string[]).includes(String(sp["aba"]))
    ? (sp["aba"] as Aba)
    : "geral";
  const voltar = typeof sp["voltar"] === "string" && sp["voltar"].startsWith("/transparencia/bens") ? sp["voltar"] : "/transparencia/bens";

  let bem;
  try {
    bem = await bemPublico(id);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <p role="alert" className="text-sm">
          A consulta está indisponível agora: o banco de dados não respondeu.
        </p>
      </main>
    );
  }
  if (bem === null) notFound();

  const enderecoDaAba = (a: Aba): string => {
    const q = new URLSearchParams();
    q.set("aba", a);
    if (voltar !== "/transparencia/bens") q.set("voltar", voltar);
    return `/transparencia/bens/${id}?${q.toString()}`;
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">
          Transparência
        </Link>{" "}
        /{" "}
        <Link href={voltar} className="text-[color:var(--color-primary)] hover:underline" data-voltar-a-consulta>
          Bens patrimoniais
        </Link>{" "}
        / {bem.numeroTombamento}
      </p>

      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">{bem.descricao}</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Tombamento {bem.numeroTombamento} · {identidade.ente?.nomeDeExibicao ?? "Ente não configurado"}
        </p>
      </header>

      <nav aria-label="Seções do bem" className="mb-4 flex flex-wrap gap-1 border-b border-[color:var(--color-border)] text-sm">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={enderecoDaAba(a.chave)}
            aria-current={aba === a.chave ? "page" : undefined}
            data-aba={a.chave}
            className={`-mb-px border-b-2 px-3 py-2 ${
              aba === a.chave
                ? "border-[color:var(--color-primary)] font-semibold text-[color:var(--color-primary)]"
                : "border-transparent text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)]"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      {aba === "geral" ? (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2" data-painel="geral">
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Número de tombamento</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.numeroTombamento}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Classe</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">
              {bem.classeCodigo} — {bem.classeDescricao}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Espécie</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.especie ?? "não informada"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Data de aquisição</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.dataAquisicao}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Forma de incorporação</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.tipoDeIncorporacao ?? "não informada"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Situação</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.situacao ?? "sem registro"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Estado de conservação</dt>
            <dd className="text-sm text-[color:var(--color-ink)]">{bem.estado ?? "sem registro"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-[color:var(--color-ink-2)]">Valor contábil</dt>
            <dd className="text-sm text-[color:var(--color-ink)]" data-valor-contabil>
              {bem.valorContabil === null ? (
                "sem movimento registrado"
              ) : (
                <>
                  {formatarMoeda(bem.valorContabil).texto}{" "}
                  <span className="text-xs text-[color:var(--color-ink-3)]">
                    (posição em {bem.dataDeReferencia})
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
      ) : null}

      {aba === "localizacao" ? (
        <section data-painel="localizacao">
          {bem.localizacaoDivulgada ? (
            <>
              <p className="text-sm text-[color:var(--color-ink)]">{bem.localizacao}</p>
              <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
                Localização declarada divulgável pelo ente. É o último registro de movimentação de
                localização deste bem que não foi estornado.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-[color:var(--color-ink-2)]" data-localizacao-reservada>
                A localização deste bem não é divulgada.
              </p>
              <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
                O bem consta do acervo público; o lugar onde ele está só aparece quando o ente declara
                aquela localização divulgável. Locais de acesso restrito ficam de fora.
              </p>
            </>
          )}
          {/* ⚠️ NÃO HÁ "RESPONSÁVEL" NESTA ABA, e a ausência é deliberada: quem responde pelo bem é
              um servidor com nome e documento, e isso é dado pessoal — não vira coluna aberta
              porque outro portal a mostra. */}
        </section>
      ) : null}

      {aba === "movimentacoes" ? (
        <section data-painel="movimentacoes">
          {bem.movimentos.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">Nenhuma movimentação de valor registrada.</p>
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <caption className="sr-only">Movimentações de valor do bem</caption>
                <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-ink-2)]">
                  <tr>
                    <th scope="col" className="px-3 py-2">Data</th>
                    <th scope="col" className="px-3 py-2">Movimento</th>
                    <th scope="col" className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {bem.movimentos.map((m, i) => (
                    <tr key={`${m.data}-${i}`} className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]">
                      <td className="px-3 py-2">{m.data}</td>
                      <td className="px-3 py-2">{m.tipo}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(m.valor).texto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
            Movimento estornado e o estorno correspondente não aparecem: o par sai da conta, como no
            razão patrimonial.
          </p>
        </section>
      ) : null}
    </main>
  );
}
