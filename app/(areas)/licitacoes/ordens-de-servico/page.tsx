import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { ordensDeServicoDaSessao } from "../../../../lib/portas/contrato-acompanhado";
import { ROTULO_DA_SITUACAO_DA_ORDEM, rotuloDaSituacaoDaOrdem } from "../situacao-da-ordem";
import { exigirSessao } from "../../../../lib/portas/sessao";
import type { SituacaoDaOrdem } from "../../../../modules/m11-licitacoes/execucao-do-contrato";
import { ORDENS_POR_PAGINA } from "../../../../modules/m11-licitacoes/ordens-de-servico-da-sessao";

/**
 * AS ORDENS DE SERVIÇO (V38, AUD-122) — antes só se achavam dentro do contrato. A lista alcança os mesmos contratos que
 * a tela do contrato mostra à sessão (designação vigente, administrador da fiscalização ou visão financeira); cada
 * ordem leva à sua tela, onde estão a medição, o recebimento e a liquidação.
 *
 * V39-050 — busca, ano, situação e páginas, tudo no servidor: o total é o do conjunto filtrado inteiro, e a ordem de
 * número 301 em diante se alcança pela página seguinte (antes: "as 300 mais recentes; para as anteriores, abra o
 * contrato").
 */
export const dynamic = "force-dynamic";

const SITUACOES = Object.keys(ROTULO_DA_SITUACAO_DA_ORDEM) as SituacaoDaOrdem[];
const umValor = (v: string | string[] | undefined): string => (typeof v === "string" ? v : "");

export default async function OrdensDeServico({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sessao = await exigirSessao();
  const sp = await searchParams;
  const busca = umValor(sp["busca"]).trim().slice(0, 120);
  const anoTexto = umValor(sp["ano"]);
  const ano = /^\d{4}$/.test(anoTexto) ? Number(anoTexto) : undefined;
  const situacaoTexto = umValor(sp["situacao"]);
  const situacao = (SITUACOES as string[]).includes(situacaoTexto) ? (situacaoTexto as SituacaoDaOrdem) : undefined;
  const paginaPedida = /^\d{1,6}$/.test(umValor(sp["pagina"])) ? Number(umValor(sp["pagina"])) : 1;

  const { ordens, total, pagina, paginas, todos } = await ordensDeServicoDaSessao(sessao, {
    ...(busca === "" ? {} : { busca }),
    ...(ano === undefined ? {} : { ano }),
    ...(situacao === undefined ? {} : { situacao }),
    pagina: paginaPedida,
  });
  const filtrado = busca !== "" || ano !== undefined || situacao !== undefined;
  const hrefDaPagina = (n: number): string => {
    const q = new URLSearchParams();
    if (busca !== "") q.set("busca", busca);
    if (ano !== undefined) q.set("ano", String(ano));
    if (situacao !== undefined) q.set("situacao", situacao);
    q.set("pagina", String(n));
    return `/licitacoes/ordens-de-servico?${q.toString()}`;
  };
  const primeira = total === 0 ? 0 : (pagina - 1) * ORDENS_POR_PAGINA + 1;
  const ultima = (pagina - 1) * ORDENS_POR_PAGINA + ordens.length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Ordens de serviço</h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          {todos ? "As ordens de serviço de todos os contratos." : "As ordens de serviço dos contratos em que você tem designação vigente."} A
          ordem se emite, mede e recebe na tela do contrato; a liquidação usa o que foi recebido.
        </p>
        <p className="mt-2 text-sm">
          <Link href="/licitacoes/contratos" className="text-[color:var(--color-primary)] underline underline-offset-2">Contratos</Link>
          {" · "}
          <Link href="/licitacoes/fiscalizacao" className="text-[color:var(--color-primary)] underline underline-offset-2">Fiscalização</Link>
        </p>
      </header>
      <Card>
        <form method="get" data-filtro-das-ordens className="mb-3 flex flex-wrap items-end gap-3 text-sm">
          <label>
            <span className="block text-xs font-semibold text-[color:var(--color-ink-2)]">Buscar</span>
            <input name="busca" defaultValue={busca} placeholder="número, contrato, contratado ou finalidade" className="mt-1 w-72 max-w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1" />
          </label>
          <label>
            <span className="block text-xs font-semibold text-[color:var(--color-ink-2)]">Ano</span>
            <input name="ano" inputMode="numeric" pattern="\d{4}" defaultValue={ano === undefined ? "" : String(ano)} className="mt-1 w-20 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1" />
          </label>
          <label>
            <span className="block text-xs font-semibold text-[color:var(--color-ink-2)]">Situação</span>
            <select name="situacao" defaultValue={situacao ?? ""} className="mt-1 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1">
              <option value="">todas</option>
              {SITUACOES.map((s) => (
                <option key={s} value={s}>{ROTULO_DA_SITUACAO_DA_ORDEM[s].texto}</option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1 font-semibold">Filtrar</button>
          {filtrado ? <Link href="/licitacoes/ordens-de-servico" className="text-[color:var(--color-primary)] underline underline-offset-2">Limpar</Link> : null}
        </form>
        {ordens.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-2)]" data-sem-ordens>
            {filtrado
              ? "Nenhuma ordem de serviço com esse filtro nos contratos que você alcança."
              : todos
                ? "Nenhuma ordem de serviço cadastrada."
                : "Nenhuma ordem de serviço nos contratos que você acompanha. A ordem aparece aqui para quem está designado no contrato, para o administrador da fiscalização e para quem empenha, liquida ou paga."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-[color:var(--color-ink-2)]" data-total-de-ordens={String(total)}>
              {`Ordens ${String(primeira)} a ${String(ultima)} de ${String(total)}${filtrado ? " com o filtro" : ""}, da mais recente para a mais antiga.`}
            </p>
            <table className="w-full min-w-[44rem] text-left text-sm" data-ordens-de-servico={String(ordens.length)}>
              <caption className="sr-only">Ordens de serviço</caption>
              <thead>
                <tr className="text-xs text-[color:var(--color-ink-2)]">
                  <th className="py-1 pr-2">Ordem</th>
                  <th className="py-1 pr-2">Contrato</th>
                  <th className="py-1 pr-2">Finalidade</th>
                  <th className="py-1 pr-2">Previsto</th>
                  <th className="py-1 pr-2">Situação</th>
                  <th className="py-1">Empenho</th>
                </tr>
              </thead>
              <tbody>
                {ordens.map((o) => {
                  const s = rotuloDaSituacaoDaOrdem(o.situacao);
                  return (
                    <tr key={o.id} data-ordem={o.id} className="border-t border-[color:var(--color-border)]">
                      <td className="py-2 pr-2">
                        <Link href={`/licitacoes/contratos/${o.contratoId}/ordens/${o.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">
                          {String(o.numero)}/{String(o.ano)}
                        </Link>
                      </td>
                      <td className="py-2 pr-2">
                        <Link href={`/licitacoes/contratos/${o.contratoId}`} className="text-[color:var(--color-primary)] underline underline-offset-2">{o.contrato}</Link>
                        <span className="block text-xs text-[color:var(--color-ink-2)]">{o.contratado}</span>
                      </td>
                      <td className="py-2 pr-2 [overflow-wrap:anywhere]">{o.finalidade}</td>
                      <td className="py-2 pr-2">{o.previsto}</td>
                      <td className="py-2 pr-2">
                        <Badge status={s.tom}>{s.texto}</Badge>
                        {o.emitidaEm === null ? null : <span className="block text-xs text-[color:var(--color-ink-2)]">emitida em {o.emitidaEm}</span>}
                      </td>
                      <td className="py-2">{o.empenho ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {paginas > 1 ? (
              <nav aria-label="Páginas das ordens de serviço" className="mt-3 flex items-center gap-3 text-sm" data-paginas={String(paginas)}>
                {pagina > 1 ? <Link href={hrefDaPagina(pagina - 1)} className="text-[color:var(--color-primary)] underline underline-offset-2">Anteriores</Link> : null}
                <span className="text-[color:var(--color-ink-2)]">{`Página ${String(pagina)} de ${String(paginas)}`}</span>
                {pagina < paginas ? <Link href={hrefDaPagina(pagina + 1)} className="text-[color:var(--color-primary)] underline underline-offset-2" data-pagina-seguinte>Seguintes</Link> : null}
              </nav>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  );
}
