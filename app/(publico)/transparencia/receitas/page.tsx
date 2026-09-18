import Link from "next/link";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { identidadePublica } from "../../../../lib/portas/identidade";
import {
  listarReceitasPublicas,
  PADRAO_POR_PAGINA_RECEITA,
  PortaSemBancoError,
  type PaginaDeReceitasPublicas,
} from "../../../../lib/portas/receitas-publicas";

/**
 * CONSULTA PÚBLICA DE RECEITAS (V11 V4).
 *
 * ⚠️⚠️ CONSTITUIÇÃO E ARRECADAÇÃO NÃO SE SOMAM, e é por isso que elas estão em painéis
 * SEPARADOS, com a explicação entre os dois. O crédito constituído é o IPTU lançado; a
 * arrecadação é o dinheiro que entrou e BAIXA aquele crédito. São o mesmo dinheiro em dois
 * momentos. Um portal que os empilhasse num "total de receitas" dobraria a arrecadação do
 * município — o mesmo erro que, na despesa, faz empenhado + liquidado + pago virar três despesas.
 *
 * ⚠️ UMA LINHA POR GUIA, com arrecadado, anulado e líquido. Publicar só o líquido esconderia que
 * houve anulação; só o bruto mostraria dinheiro que foi desfeito.
 *
 * ⚠️ A PREVISÃO VAI EM TRÊS NÚMEROS — inicial, ajustes e atualizada. Publicar só a atualizada
 * esconderia que a previsão mudou no meio do exercício, que é notícia própria.
 */
export const dynamic = "force-dynamic";

const SITUACOES = [
  { valor: "", rotulo: "Todas" },
  { valor: "Arrecadada", rotulo: "Arrecadada" },
  { valor: "Parcialmente anulada", rotulo: "Parcialmente anulada" },
  { valor: "Anulada", rotulo: "Anulada" },
] as const;

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const filtros = {
    q: texto(sp["q"]),
    exercicio: texto(sp["exercicio"]),
    fonte: texto(sp["fonte"]),
    natureza: texto(sp["natureza"]),
    situacao: texto(sp["situacao"]),
    de: texto(sp["de"]),
    ate: texto(sp["ate"]),
    ordem: (["data", "valor", "numero"] as const).find((o) => o === texto(sp["ordem"])) ?? ("data" as const),
    direcao: texto(sp["direcao"]) === "asc" ? ("asc" as const) : ("desc" as const),
    pagina: Math.max(1, Number(texto(sp["pagina"])) || 1),
    porPagina: PADRAO_POR_PAGINA_RECEITA,
  };

  const id = await identidadePublica();

  let pagina: PaginaDeReceitasPublicas | null = null;
  let semBanco = false;
  try {
    pagina = await listarReceitasPublicas(filtros);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }

  const linhas = pagina?.linhas ?? [];

  const csv = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== "pagina") q.set(k, v);
    const s = q.toString();
    return s === "" ? "/transparencia/receitas/csv" : `/transparencia/receitas/csv?${s}`;
  })();

  const paginaAtual = pagina?.pagina ?? 1;
  const linkDePagina = (n: number): string => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== "pagina") q.set(k, v);
    q.set("pagina", String(n));
    return `/transparencia/receitas?${q.toString()}`;
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> / Receitas
      </p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Receitas</h1>
        <p className="mt-1 max-w-3xl text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro.{" "}
          <strong>Cada linha é uma guia de arrecadação</strong>, com o valor arrecadado, o que foi
          anulado e o líquido.
        </p>
      </header>

      {semBanco ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4 text-sm">
          A consulta está indisponível agora: o banco de dados não respondeu. Tente novamente em alguns minutos.
        </p>
      ) : null}

      <form method="get" action="/transparencia/receitas" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-[color:var(--color-ink-2)]">Número da guia, código ou descrição da natureza</span>
          <input type="search" name="q" defaultValue={filtros.q} placeholder="ex.: GUIA-2026-1 ou IPTU" className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Exercício</span>
          <select name="exercicio" defaultValue={filtros.exercicio} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {(pagina?.exerciciosDisponiveis ?? []).map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Fonte de recurso</span>
          <select name="fonte" defaultValue={filtros.fonte} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {(pagina?.fontesDisponiveis ?? []).map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Natureza da receita (código ou início dele)</span>
          <input name="natureza" defaultValue={filtros.natureza} placeholder="ex.: 1112" className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Situação da guia</span>
          <select name="situacao" defaultValue={filtros.situacao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            {SITUACOES.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">De</span>
          <input type="date" name="de" defaultValue={filtros.de} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Até</span>
          <input type="date" name="ate" defaultValue={filtros.ate} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm" />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className="rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 py-1.5 text-sm text-[color:var(--color-on-primary)]">Consultar</button>
          <a href={csv} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-sm">Baixar CSV deste recorte</a>
        </div>
      </form>

      {pagina !== null ? (
        <>
          <section className="mb-4 grid gap-3 sm:grid-cols-3" data-papel="totais-da-arrecadacao">
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
              <p className="text-xs text-[color:var(--color-ink-2)]">Arrecadado no recorte</p>
              <p className="text-lg font-semibold tabular-nums">R$ {formatarMoeda(pagina.totais.arrecadado).texto}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
              <p className="text-xs text-[color:var(--color-ink-2)]">Anulado</p>
              <p className="text-lg font-semibold tabular-nums">R$ {formatarMoeda(pagina.totais.anulado).texto}</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
              <p className="text-xs text-[color:var(--color-ink-2)]">Arrecadação líquida</p>
              <p className="text-lg font-semibold tabular-nums" data-papel="total-liquido">R$ {formatarMoeda(pagina.totais.liquido).texto}</p>
            </div>
          </section>

          {pagina.previsao !== null ? (
            <section className="mb-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-papel="previsao-do-exercicio">
              <h2 className="mb-2 text-sm font-semibold">Previsão e execução em {pagina.previsao.exercicio}</h2>
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-[color:var(--color-ink-2)]">Previsão inicial (LOA)</dt><dd className="tabular-nums">R$ {formatarMoeda(pagina.previsao.inicial).texto}</dd></div>
                <div><dt className="text-xs text-[color:var(--color-ink-2)]">Reprevisões (com sinal)</dt><dd className="tabular-nums">R$ {formatarMoeda(pagina.previsao.ajustes).texto}</dd></div>
                <div><dt className="text-xs text-[color:var(--color-ink-2)]">Previsão atualizada</dt><dd className="tabular-nums">R$ {formatarMoeda(pagina.previsao.atualizada).texto}</dd></div>
                <div><dt className="text-xs text-[color:var(--color-ink-2)]">Arrecadado / atualizada</dt><dd className="tabular-nums">{pagina.previsao.execucao === null ? "—" : `${pagina.previsao.execucao}%`}</dd></div>
              </dl>
            </section>
          ) : null}

          {pagina.constituido !== null ? (
            <section className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-papel="credito-constituido">
              <h2 className="mb-1 text-sm font-semibold">Crédito constituído no exercício</h2>
              <p className="tabular-nums text-lg font-semibold">R$ {formatarMoeda(pagina.constituido).texto}</p>
              {/* ⚠️ O AVISO VEM COLADO NO NÚMERO, e não num rodapé que ninguém lê. */}
              <p className="mt-1 max-w-3xl text-xs text-[color:var(--color-ink-2)]">
                Este valor <strong>não se soma</strong> à arrecadação acima. Ele é o crédito que
                nasceu — o tributo lançado, o serviço prestado —, e a arrecadação é o dinheiro que
                entrou e <strong>baixa</strong> esse crédito. São o mesmo dinheiro em dois momentos;
                somá-los contaria a receita do município duas vezes. Vai agregado por exercício, sem
                identificação de contribuinte.
              </p>
            </section>
          ) : null}

          {linhas.length === 0 ? (
            <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4 text-sm">
              Nenhuma guia encontrada com estes filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-papel="tabela-de-receitas">
                <caption className="sr-only">Guias de arrecadação: número, data, natureza, fonte, arrecadado, anulado e líquido</caption>
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                    <th scope="col" className="px-3 py-2">Guia</th>
                    <th scope="col" className="px-3 py-2">Data</th>
                    <th scope="col" className="px-3 py-2">Natureza</th>
                    <th scope="col" className="px-3 py-2">Fonte</th>
                    <th scope="col" className="px-3 py-2 text-right">Arrecadado</th>
                    <th scope="col" className="px-3 py-2 text-right">Anulado</th>
                    <th scope="col" className="px-3 py-2 text-right">Líquido</th>
                    <th scope="col" className="px-3 py-2">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <tr key={l.id} className="border-b border-[color:var(--color-border)]" data-guia={l.numero}>
                      <td className="px-3 py-2">{l.numero}</td>
                      <td className="px-3 py-2">{l.data}</td>
                      <td className="px-3 py-2 text-xs">{l.natureza}</td>
                      <td className="px-3 py-2 text-xs">{l.fonte}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.arrecadado).texto}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(l.anulado).texto}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold" data-liquido>{formatarMoeda(l.liquido).texto}</td>
                      <td className="px-3 py-2 text-xs">{l.situacao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <nav className="mt-4 flex items-center gap-3 text-sm" aria-label="Paginação">
            {paginaAtual > 1 ? <a href={linkDePagina(paginaAtual - 1)} className="text-[color:var(--color-primary)] hover:underline">Anterior</a> : null}
            <span className="text-xs text-[color:var(--color-ink-2)]">
              Página {paginaAtual} de {pagina.paginas} · {pagina.total} guia(s) no recorte
            </span>
            {paginaAtual < pagina.paginas ? <a href={linkDePagina(paginaAtual + 1)} className="text-[color:var(--color-primary)] hover:underline">Próxima</a> : null}
          </nav>

          <p className="mt-4 text-xs text-[color:var(--color-ink-3)]">
            Dados atualizados em {pagina.atualizadoEm}. Os totais acima são do recorte inteiro, não
            apenas desta página.
          </p>
        </>
      ) : null}
    </main>
  );
}
