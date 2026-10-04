import Link from "next/link";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { identidadePublica } from "../../../../lib/portas/identidade";
import { demonstrativoDePessoal, PortaSemBancoError, type DemonstrativoDePessoal } from "../../../../lib/portas/pessoal-publico";

/**
 * O DEMONSTRATIVO PÚBLICO DE PESSOAL (V11 V4.2).
 *
 * ⚠️ DOIS NÍVEIS, COM REGRAS DIFERENTES. Os totais por unidade e regime não contêm dado pessoal e
 * saem sempre. As linhas por servidor só existem se o ente tiver aprovado uma política que as
 * autorize — e a tela DIZ quando não há, em vez de mostrar um vazio sem explicação.
 *
 * ⚠️ NÃO É O CONTRACHEQUE. Não há rubrica a rubrica, não há dependente, não há pensão, plano de
 * saúde, contribuição ou imposto individual. O detalhamento descreveria a vida privada de cada
 * servidor, e nenhuma política pode ligá-lo: esses campos não existem nesta projeção.
 */
export const dynamic = "force-dynamic";

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function Pagina({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const competenciaPedida = texto(sp["competencia"]);
  const id = await identidadePublica();

  let d: DemonstrativoDePessoal | null = null;
  let semBanco = false;
  try {
    d = await demonstrativoDePessoal(competenciaPedida);
  } catch (e) {
    if (!(e instanceof PortaSemBancoError)) throw e;
    semBanco = true;
  }

  const csv = d === null ? "#" : `/transparencia/pessoal/csv?competencia=${encodeURIComponent(d.competencia)}`;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <p className="mb-2 text-xs">
        <Link href="/transparencia" className="text-[color:var(--color-primary)] hover:underline">Transparência</Link> / Pessoal
      </p>
      <header className="mb-4 border-b border-[color:var(--color-border)] pb-3">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">Pessoal</h1>
        <p className="mt-1 max-w-3xl text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · acesso público, sem cadastro. São
          publicadas apenas <strong>folhas fechadas</strong>, sem detalhamento por rubrica, dependentes,
          plano de saúde, pensão ou imposto individual.
        </p>
      </header>

      {semBanco ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4 text-sm">
          A consulta está temporariamente indisponível. Tente novamente mais tarde.
        </p>
      ) : null}

      {d !== null ? (
        <>
          <form method="get" action="/transparencia/pessoal" className="mb-5 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-[color:var(--color-ink-2)]">Competência</span>
              <select name="competencia" defaultValue={d.competencia} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-1.5 text-sm">
                {d.competenciasDisponiveis.length === 0 ? <option value="">nenhuma folha fechada</option> : null}
                {d.competenciasDisponiveis.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 py-1.5 text-sm text-[color:var(--color-acao-tinta)]">Consultar</button>
            {d.temFolhaFechada ? <a href={csv} className="rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 py-1.5 text-sm">Baixar CSV</a> : null}
          </form>

          {d.pendencia !== null ? (
            <p role="status" data-papel="pendencia" className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4 text-sm text-[color:var(--color-ink)]">
              {d.pendencia}
            </p>
          ) : null}

          {d.temFolhaFechada ? (
            <section className="mb-6" data-papel="agregado-de-pessoal">
              <h2 className="mb-2 text-sm font-semibold">Totais por unidade e regime — competência {d.competencia}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Vínculos, bruto, descontos e líquido por lotação e regime</caption>
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                      <th scope="col" className="px-3 py-2">Lotação</th>
                      <th scope="col" className="px-3 py-2">Regime</th>
                      <th scope="col" className="px-3 py-2 text-right">Vínculos</th>
                      <th scope="col" className="px-3 py-2 text-right">Bruto</th>
                      <th scope="col" className="px-3 py-2 text-right">Descontos</th>
                      <th scope="col" className="px-3 py-2 text-right">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.agregado.map((g) => (
                      <tr key={`${g.regime}-${g.lotacao}`} className="border-b border-[color:var(--color-border)]">
                        <td className="px-3 py-2">{g.lotacao}</td>
                        <td className="px-3 py-2">{g.regime}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{g.vinculos}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(g.bruto).texto}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(g.descontos).texto}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(g.liquido).texto}</td>
                      </tr>
                    ))}
                    {d.total !== null ? (
                      <tr className="font-semibold" data-papel="total-de-pessoal">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-right tabular-nums">{d.total.vinculos}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.total.bruto).texto}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.total.descontos).texto}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(d.total.liquido).texto}</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {d.politica !== null ? (
            <section data-papel="individual-de-pessoal">
              <h2 className="mb-1 text-sm font-semibold">Por servidor — competência {d.competencia}</h2>
              {/* ⚠️ A REGRA APARECE AO LADO DO DADO. Quem lê precisa saber sob que ato aquilo foi
                  publicado, e o que ficou de fora — senão a ausência de uma coluna parece falha. */}
              <p className="mb-2 max-w-3xl text-xs text-[color:var(--color-ink-2)]">
                Divulgação conforme a política {d.politica.versao}, vigente {d.politica.vigencia}.
                Fundamento: {d.politica.fundamentacaoLegal}. São exibidas apenas as informações
                autorizadas por esse ato.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-papel="tabela-de-pessoal">
                  <caption className="sr-only">Demonstrativo por servidor, com as informações autorizadas pela política vigente</caption>
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                      {d.cabecalho.map((h) => <th scope="col" key={h} className="px-3 py-2">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {d.linhas.map((l, i) => (
                      <tr key={l.celulas.map((c) => c.valor).join("|") + String(i)} className="border-b border-[color:var(--color-border)]">
                        {l.celulas.map((c) => (
                          <td key={c.coluna} className={c.coluna === "PROVENTOS" || c.coluna === "DESCONTOS" || c.coluna === "LIQUIDO" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2"}>
                            {c.coluna === "PROVENTOS" || c.coluna === "DESCONTOS" || c.coluna === "LIQUIDO" ? formatarMoeda(c.valor).texto : c.valor}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <p className="mt-4 text-xs text-[color:var(--color-ink-3)]">Dados atualizados em {d.atualizadoEm}.</p>
        </>
      ) : null}
    </main>
  );
}
