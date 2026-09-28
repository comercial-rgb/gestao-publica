import Link from "next/link";
import { listarBensPublicos, PADRAO_POR_PAGINA, PortaSemBancoError, type PaginaDeBensPublicos } from "../../../../lib/portas/bens-publicos";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { formatarMoeda } from "../../../../lib/format/moeda";

/**
 * CONSULTA PÚBLICA DE BENS (V9 N2, família Patrimônio).
 *
 * ⚠️ OS FILTROS MORAM NO ENDEREÇO, e isso não é detalhe de implementação. Uma consulta pública
 * que guarda o filtro em estado de componente não pode ser enviada por e-mail, citada num
 * processo nem aberta de novo amanhã no mesmo ponto — e é exatamente isso que um órgão de
 * controle faz com ela. Com a consulta na URL, o botão "voltar" do navegador devolve a lista
 * como estava, e o CSV baixa O MESMO recorte porque recebe os mesmos parâmetros.
 *
 * ⚠️ A PAGINAÇÃO É NO SERVIDOR. `LIMIT/OFFSET` no banco, `COUNT(*)` separado. Trazer o acervo
 * inteiro e cortar no cliente é o defeito que só aparece no município com trinta mil bens — e
 * aparece como página que não carrega.
 *
 * ⚠️ E O QUE NÃO É PÚBLICO NÃO CHEGA AQUI. Quem decide isso é `lib/portas/bens-publicos.ts`,
 * pelo contrato de campos: o responsável pelo bem (nome e documento de servidor) não existe
 * nesta projeção, e a localização só aparece quando o ente a marcou como divulgável.
 */
export const dynamic = "force-dynamic";

const ORDENS = [
  { valor: "tombamento", rotulo: "Tombamento" },
  { valor: "aquisicao", rotulo: "Aquisição" },
  { valor: "descricao", rotulo: "Descrição" },
] as const;

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** Reconstrói o endereço com um parâmetro trocado — a paginação e a ordenação preservam o filtro. */
function comParametro(sp: Record<string, string | string[] | undefined>, chave: string, valor: string): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== chave) q.set(k, v);
  if (valor !== "") q.set(chave, valor);
  // Trocar filtro volta para a primeira página: manter a página 7 depois de filtrar mostra
  // "nenhum resultado" para uma consulta que tem resultado.
  if (chave !== "pagina") q.delete("pagina");
  const s = q.toString();
  return s === "" ? "/transparencia/bens" : `/transparencia/bens?${s}`;
}

export default async function BensPublicosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const id = await identidadePublica();

  const filtros = {
    q: texto(sp["q"]),
    classe: texto(sp["classe"]),
    especie: texto(sp["especie"]),
    situacao: texto(sp["situacao"]),
    anoAquisicao: texto(sp["ano"]),
    ordem: (["tombamento", "aquisicao", "descricao"] as const).find((o) => o === texto(sp["ordem"])) ?? "tombamento",
    direcao: texto(sp["direcao"]) === "desc" ? ("desc" as const) : ("asc" as const),
    pagina: Math.max(1, Number.parseInt(texto(sp["pagina"]), 10) || 1),
    porPagina: PADRAO_POR_PAGINA,
  };

  let pagina: PaginaDeBensPublicos | null = null;
  let semBanco = false;
  try {
    pagina = await listarBensPublicos(filtros);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }

  /**
   * ⚠️ O ENDEREÇO DESTA CONSULTA, para o detalhe saber voltar ao ponto exato. Sem ele, examinar
   * cinco bens de uma lista filtrada obriga a remontar o filtro cinco vezes — e é a queixa mais
   * comum sobre consulta pública de patrimônio.
   */
  const daqui = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "") q.set(k, v);
    const s = q.toString();
    return s === "" ? "/transparencia/bens" : `/transparencia/bens?${s}`;
  })();

  const csv = (() => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "" && k !== "pagina") q.set(k, v);
    const s = q.toString();
    return s === "" ? "/transparencia/bens/csv" : `/transparencia/bens/csv?${s}`;
  })();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">
          Transparência
        </Link>{" "}
        / Bens patrimoniais
      </p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Bens patrimoniais</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro. Os resultados
          filtrados podem ser compartilhados copiando o endereço da página.
        </p>
      </header>

      {/* ⚠️ FORMULÁRIO `GET`, e por dois motivos: `GET` não produz transição de estado (regra do
          repositório), e é o `GET` que põe o filtro na URL. Todo campo tem rótulo — campo sem
          rótulo é caixa muda para leitor de tela. */}
      <form method="get" action="/transparencia/bens" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs sm:col-span-2">
          <span className="font-medium text-[color:var(--color-ink-2)]">Tombamento ou descrição</span>
          <input
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="ex.: 001234 ou computador"
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Ano de aquisição</span>
          <select
            name="ano"
            defaultValue={filtros.anoAquisicao}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm"
          >
            <option value="">Todos</option>
            {(pagina?.anosDisponiveis ?? []).map((a) => (
              <option key={a} value={String(a)}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Espécie</span>
          <select
            name="especie"
            defaultValue={filtros.especie}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {(pagina?.especiesDisponiveis ?? []).map((e) => (
              <option key={e.valor} value={e.valor}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Situação</span>
          <select
            name="situacao"
            defaultValue={filtros.situacao}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm"
          >
            <option value="">Todas</option>
            {(pagina?.situacoesDisponiveis ?? []).map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
            <option value="SEM_REGISTRO">Sem registro de situação</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium text-[color:var(--color-ink-2)]">Classe</span>
          <input
            type="text"
            name="classe"
            defaultValue={filtros.classe}
            placeholder="código ou descrição"
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm"
          />
        </label>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button
            type="submit"
            className="rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 py-1.5 text-sm font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]"
          >
            Consultar
          </button>
          <Link href="/transparencia/bens" className="text-xs text-[color:var(--color-ink-2)] underline">
            Limpar filtros
          </Link>
        </div>
      </form>

      {semBanco ? (
        <p role="alert" className="text-sm text-[color:var(--color-ink-2)]">
          A consulta está temporariamente indisponível. Tente novamente mais tarde.
        </p>
      ) : pagina === null || pagina.total === 0 ? (
        <p data-bens-vazio className="text-sm text-[color:var(--color-ink-2)]">
          Nenhum bem encontrado com estes filtros.
        </p>
      ) : (
        <>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-ink-2)]">
            <p data-bens-total>
              {pagina.total} {pagina.total === 1 ? "bem" : "bens"} · página {pagina.pagina} de {pagina.paginas}
            </p>
            {/* ⚠️ `flex-wrap` MEDIDO, não preventivo. Sem ele, a 390 px esta linha ficava 7 px
                mais larga que a tela e a PÁGINA inteira rolava de lado — e só com `direcao=desc`,
                porque "decrescente" tem duas letras a mais que "crescente". A tabela pode
                transbordar (ela tem o próprio `overflow-x-auto`); a página, não. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>Ordenar por:</span>
              {ORDENS.map((o) => (
                <Link
                  key={o.valor}
                  href={comParametro(sp, "ordem", o.valor)}
                  aria-current={filtros.ordem === o.valor ? "true" : undefined}
                  className={filtros.ordem === o.valor ? "font-semibold text-[color:var(--color-primary)]" : "underline"}
                >
                  {o.rotulo}
                </Link>
              ))}
              <Link href={comParametro(sp, "direcao", filtros.direcao === "asc" ? "desc" : "asc")} className="underline">
                {filtros.direcao === "asc" ? "crescente" : "decrescente"}
              </Link>
              <Link href={csv} className="underline" data-exportar-csv>
                Baixar CSV
              </Link>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <table className="w-full min-w-[44rem] text-left text-sm" data-bens-publicos>
              <caption className="sr-only">Bens patrimoniais, com tombamento, descrição, classe, aquisição, situação, valor contábil e localização</caption>
              <thead className="bg-[color:var(--color-surface-2)] text-xs text-[color:var(--color-ink-2)]">
                <tr>
                  <th scope="col" className="px-3 py-2">Tombamento</th>
                  <th scope="col" className="px-3 py-2">Descrição</th>
                  <th scope="col" className="px-3 py-2">Classe</th>
                  <th scope="col" className="px-3 py-2">Aquisição</th>
                  <th scope="col" className="px-3 py-2">Situação</th>
                  {/* ⚠️ O VALOR ENTROU NA LISTA (V10 T3). Sem ele, "quanto vale o patrimônio do
                      município?" só se responde abrindo bem por bem — que é o mesmo que não
                      publicar. A DATA de referência vai no rodapé, porque é a mesma para a
                      página inteira: um valor sem data não é conferível. */}
                  <th scope="col" className="px-3 py-2 text-right">Valor contábil</th>
                  <th scope="col" className="px-3 py-2">Localização</th>
                </tr>
              </thead>
              <tbody>
                {pagina.linhas.map((b) => (
                  <tr key={b.id} data-bem={b.numeroTombamento} className="border-t border-[color:var(--color-border)] align-top bg-[color:var(--color-surface)]">
                    <td className="px-3 py-2">
                      <Link
                        href={`/transparencia/bens/${b.id}?voltar=${encodeURIComponent(daqui)}`}
                        className="text-[color:var(--color-primary)] underline"
                      >
                        {b.numeroTombamento}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{b.descricao}</td>
                    <td className="px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
                      {b.classeCodigo} — {b.classeDescricao}
                    </td>
                    <td className="px-3 py-2">{b.dataAquisicao}</td>
                    <td className="px-3 py-2">{b.situacao ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums" data-valor-contabil>
                      {b.valorContabil === null ? (
                        <span className="text-xs text-[color:var(--color-ink-3)]">sem movimento registrado</span>
                      ) : (
                        `R$ ${formatarMoeda(b.valorContabil).texto}`
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {b.localizacaoDivulgada ? b.localizacao : <span className="text-[color:var(--color-ink-3)]">não divulgada</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <nav aria-label="Paginação" className="mt-3 flex items-center gap-3 text-sm">
            {pagina.pagina > 1 ? (
              <Link href={comParametro(sp, "pagina", String(pagina.pagina - 1))} className="text-[color:var(--color-primary)] underline">
                Página anterior
              </Link>
            ) : (
              <span className="text-[color:var(--color-ink-3)]">Página anterior</span>
            )}
            {pagina.pagina < pagina.paginas ? (
              <Link href={comParametro(sp, "pagina", String(pagina.pagina + 1))} className="text-[color:var(--color-primary)] underline" data-proxima-pagina>
                Próxima página
              </Link>
            ) : (
              <span className="text-[color:var(--color-ink-3)]">Próxima página</span>
            )}
          </nav>

          <p className="mt-3 text-xs text-[color:var(--color-ink-2)]" data-data-de-referencia>
            Valores contábeis apurados em {pagina.linhas[0]?.dataDeReferencia ?? "—"}, considerando
            aquisições, custos subsequentes, reavaliações, depreciações, reduções ao valor recuperável
            e baixas registradas até essa data. &quot;Sem movimento registrado&quot; indica bem
            cadastrado cujo valor ainda não foi lançado, e não valor zero.
          </p>

          <p className="mt-4 text-xs text-[color:var(--color-ink-3)]">
            A localização é exibida somente quando autorizada para divulgação. Bens em locais de acesso
            restrito são listados sem a localização.
          </p>
        </>
      )}
    </main>
  );
}
