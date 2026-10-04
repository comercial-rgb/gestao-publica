import Link from "next/link";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { listarDespesasPublicas, PADRAO_POR_PAGINA_DESPESA, PortaSemBancoError, type PaginaDeDespesasPublicas } from "../../../../lib/portas/despesas-publicas";

/**
 * CONSULTA PÚBLICA DE DESPESAS (V9 N2).
 *
 * ⚠️ UMA LINHA POR EMPENHO, com os estágios em COLUNAS. Empenho, liquidação e pagamento são
 * estágios da MESMA despesa; a tela que os lista lado a lado convida o leitor a somar, e o total
 * fica até três vezes maior que a despesa real. É o erro mais comum em portal de transparência, e
 * é por isso que esta tela não tem uma coluna "total".
 *
 * ⚠️ E O ANULADO APARECE. Publicar só o valor vigente esconderia que houve anulação; publicar só
 * o original mostraria despesa desfeita. Vão os dois, com a diferença ao lado.
 */
export const dynamic = "force-dynamic";

const FASES = [
  { valor: "", rotulo: "Todas" },
  { valor: "Empenhada", rotulo: "Empenhada" },
  { valor: "Liquidada", rotulo: "Liquidada" },
  { valor: "Paga", rotulo: "Paga" },
  { valor: "Anulada", rotulo: "Anulada" },
] as const;

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

function comParametro(sp: Record<string, string | string[] | undefined>, chave: string, valor: string): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== chave) q.set(k, v);
  if (valor !== "") q.set(chave, valor);
  if (chave !== "pagina") q.delete("pagina");
  const s = q.toString();
  return s === "" ? "/transparencia/despesas" : `/transparencia/despesas?${s}`;
}

export default async function DespesasPublicasPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const id = await identidadePublica();

  const filtros = {
    q: texto(sp["q"]),
    exercicio: texto(sp["exercicio"]),
    unidade: texto(sp["unidade"]),
    de: texto(sp["de"]),
    ate: texto(sp["ate"]),
    ordem: (["data", "valor", "numero"] as const).find((o) => o === texto(sp["ordem"])) ?? "data",
    direcao: texto(sp["direcao"]) === "asc" ? ("asc" as const) : ("desc" as const),
    pagina: Math.max(1, Number.parseInt(texto(sp["pagina"]), 10) || 1),
    porPagina: PADRAO_POR_PAGINA_DESPESA,
  };
  const faseEscolhida = texto(sp["fase"]);

  let pagina: PaginaDeDespesasPublicas | null = null;
  let semBanco = false;
  try {
    pagina = await listarDespesasPublicas(filtros);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }

  // ⚠️ O FILTRO DE FASE VIVE NO SERVIDOR (V10 T3). Ele era aplicado AQUI, sobre a página já
  // carregada — e então a contagem, o número de páginas e o CSV falavam de conjuntos diferentes
  // do que a tela mostrava. Agora a fase é derivada em SQL (`lib/portas/despesas-derivadas.ts`)
  // e o predicado vale para o recorte inteiro: o que se conta é o que se lista, o que se soma e
  // o que se exporta.
  const linhas = pagina?.linhas ?? [];

  const csv = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== "pagina") q.set(k, v);
    const s = q.toString();
    return s === "" ? "/transparencia/despesas/csv" : `/transparencia/despesas/csv?${s}`;
  })();

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> / Despesas
      </p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Despesas</h1>
        <p className="mt-1 max-w-3xl text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro.{" "}
          <strong>Cada linha corresponde a um empenho</strong>; os valores empenhado, liquidado e pago
          são etapas da mesma despesa e não devem ser somados.
        </p>
      </header>

      <form method="get" action="/transparencia/despesas" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-[color:var(--color-ink-2)]">Número, histórico ou documento do credor</span>
          <input type="search" name="q" defaultValue={filtros.q} placeholder="ex.: 2026NE000123 ou merenda" className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Exercício</span>
          <select name="exercicio" defaultValue={filtros.exercicio} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            <option value="">Todos</option>
            {(pagina?.exerciciosDisponiveis ?? []).map((a) => <option key={a} value={String(a)}>{a}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Unidade orçamentária</span>
          <select name="unidade" defaultValue={filtros.unidade} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            <option value="">Todas</option>
            {(pagina?.unidadesDisponiveis ?? []).map((u) => <option key={u.valor} value={u.valor}>{u.rotulo}</option>)}
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
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Fase alcançada</span>
          <select name="fase" defaultValue={faseEscolhida} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
            {FASES.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]">Consultar</button>
          <Link href="/transparencia/despesas" className="text-xs text-[color:var(--color-ink-2)] underline">Limpar filtros</Link>
        </div>
      </form>

      {semBanco ? (
        <p role="alert" className="text-sm text-[color:var(--color-ink-2)]">A consulta está temporariamente indisponível. Tente novamente mais tarde.</p>
      ) : pagina === null || pagina.total === 0 ? (
        <p data-despesas-vazio className="text-sm text-[color:var(--color-ink-2)]">Nenhum empenho encontrado com estes filtros.</p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-[color:var(--color-ink-2)]">
            <p data-despesas-total>{pagina.total} empenho(s){faseEscolhida === "" ? "" : ` na fase "${faseEscolhida}"`} · página {pagina.pagina} de {pagina.paginas}</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Ordenar por:</span>
              {([["data", "Data"], ["valor", "Valor"], ["numero", "Número"]] as const).map(([v, r]) => (
                <Link key={v} href={comParametro(sp, "ordem", v)} aria-current={filtros.ordem === v ? "true" : undefined} className={filtros.ordem === v ? "font-semibold text-[color:var(--color-primary)]" : "underline"}>{r}</Link>
              ))}
              <Link href={comParametro(sp, "direcao", filtros.direcao === "asc" ? "desc" : "asc")} className="underline">{filtros.direcao === "asc" ? "crescente" : "decrescente"}</Link>
              <Link href={csv} className="underline" data-exportar-csv>Baixar CSV</Link>
            </div>
          </div>

          {/* ⚠️ TRÊS NÚMEROS, NUNCA UM — e agora SEMPRE, sobre o recorte inteiro. O rodapé que
              desistia acima de dois mil empenhos dizia ao cidadão "estreite a busca", e o total
              do exercício é justamente o número que ele veio buscar (V10 T3). */}
          <div className="mb-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3 text-sm" data-totais-do-recorte>
            {(
              <dl className="grid gap-2 sm:grid-cols-3">
                {([["Total empenhado", pagina.totais.empenhado], ["Total liquidado", pagina.totais.liquidado], ["Total pago", pagina.totais.pago]] as const).map(([r, v]) => (
                  <div key={r}>
                    <dt className="text-xs text-[color:var(--color-ink-2)]">{r}</dt>
                    <dd className="tabular-nums font-semibold text-[color:var(--color-ink)]">R$ {formatarMoeda(v).texto}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <table className="w-full min-w-[56rem] text-left text-sm" data-despesas-publicas>
              <caption className="sr-only">Empenhos, com credor, histórico e valores empenhado, anulado, liquidado e pago</caption>
              <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-ink-2)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Empenho</th>
                  <th scope="col" className="px-3 py-2">Data</th>
                  <th scope="col" className="px-3 py-2">Credor</th>
                  <th scope="col" className="px-3 py-2">Unidade / natureza</th>
                  <th scope="col" className="px-3 py-2 text-right">Empenhado</th>
                  <th scope="col" className="px-3 py-2 text-right">Anulado</th>
                  <th scope="col" className="px-3 py-2 text-right">Liquidado</th>
                  <th scope="col" className="px-3 py-2 text-right">Pago</th>
                  <th scope="col" className="px-3 py-2">Fase</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((d) => (
                  <tr key={d.id} data-empenho={d.numero} className="border-t border-[color:var(--color-border)] align-top bg-[color:var(--color-surface)]">
                    <td className="px-3 py-2">
                      {d.numero}
                      {d.contrato !== null ? <span className="block text-xs text-[color:var(--color-ink-3)]">contrato {d.contrato}</span> : null}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{d.data}</td>
                    <td className="px-3 py-2">
                      {d.credorNome}
                      <span className="block text-xs text-[color:var(--color-ink-3)]" data-credor-documento>{d.credorDocumento}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
                      {d.unidade}
                      <span className="block">{d.naturezaDespesa}</span>
                      <span className="block">{d.historico}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.empenhado).texto}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.anulado).texto}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.liquidado).texto}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.pago).texto}</td>
                    <td className="px-3 py-2 text-xs">{d.fase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Paginação" className="mt-3 flex items-center gap-3 text-sm">
            {pagina.pagina > 1 ? <Link href={comParametro(sp, "pagina", String(pagina.pagina - 1))} className="text-[color:var(--color-primary)] underline">Página anterior</Link> : <span className="text-[color:var(--color-ink-3)]">Página anterior</span>}
            {pagina.pagina < pagina.paginas ? <Link href={comParametro(sp, "pagina", String(pagina.pagina + 1))} className="text-[color:var(--color-primary)] underline" data-proxima-pagina>Próxima página</Link> : <span className="text-[color:var(--color-ink-3)]">Próxima página</span>}
          </nav>

          <p className="mt-4 max-w-3xl text-xs text-[color:var(--color-ink-3)]">
            Os totais consideram todos os resultados da consulta, não apenas esta página. O CNPJ dos
            credores é exibido por completo; o CPF de pessoa física é parcialmente ocultado, e o número
            completo pode ser solicitado por meio de pedido de acesso à informação.
          </p>
        </>
      )}
    </main>
  );
}
