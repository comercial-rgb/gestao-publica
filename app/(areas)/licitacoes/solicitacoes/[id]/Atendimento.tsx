import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import type { ItemDoAtendimentoLido } from "../../../../../lib/portas/recursos/compras-dados";

const ROTULO_DA_PARCELA: Record<ItemDoAtendimentoLido["parcelas"][number]["situacao"], { readonly texto: string; readonly tom: "ok" | "neutro" | "erro" }> = {
  VIVA: { texto: "viva", tom: "ok" },
  DESFEITA: { texto: "desfeita", tom: "neutro" },
  ORDEM_ESTORNADA: { texto: "ordem estornada", tom: "erro" },
};

/**
 * O ATENDIMENTO DA SOLICITAÇÃO (V6 P1.1) — por item: solicitado, ordenado, recebido, cancelado e
 * pendente, TODOS derivados; embaixo de cada item, as parcelas com a ordem que as atende. Ordenado
 * não é atendido: só o recebido é.
 */
export function Atendimento({ itens }: { readonly itens: readonly ItemDoAtendimentoLido[] }): React.ReactElement {
  return (
    <section aria-label="Atendimento da solicitação" data-atendimento className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Atendimento por item</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">Ordenado = parcelas vivas em ordens vivas; recebido = entregas atribuídas a elas; cancelado = parcelas desfeitas ou de ordens estornadas; pendente = solicitado − ordenado.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
              <th className="py-1 pr-3">Item</th>
              <th className="py-1 pr-3 text-right">Solicitado</th>
              <th className="py-1 pr-3 text-right">Ordenado</th>
              <th className="py-1 pr-3 text-right">Recebido</th>
              <th className="py-1 pr-3 text-right">Cancelado</th>
              <th className="py-1 text-right">Pendente</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.itemDeSolicitacaoId} className="border-t border-[color:var(--color-border)] align-top" data-item-atendimento={i.itemDeSolicitacaoId}>
                <td className="py-2 pr-3">
                  <div className="text-[color:var(--color-ink)]">{i.rotulo}</div>
                  {i.parcelas.length > 0 ? (
                    <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--color-ink-2)]">
                      {i.parcelas.map((p) => (
                        <li key={p.alocacaoId} className="flex flex-wrap items-center gap-2" data-parcela={p.situacao}>
                          <Link href={`/licitacoes/ordens-de-compra/${p.ordemId}`} className="font-medium text-[color:var(--color-primary)] hover:underline">Ordem {p.ordemNumero}</Link>
                          <span className="tabular">{p.quantidade} ordenado · {p.recebido} recebido</span>
                          <Badge status={ROTULO_DA_PARCELA[p.situacao].tom}>{ROTULO_DA_PARCELA[p.situacao].texto}</Badge>
                          {p.motivo !== null ? <span className="text-[color:var(--color-ink-3)]">{p.motivo}</span> : null}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">Nenhuma ordem atende este item ainda.</p>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular">{i.solicitado}</td>
                <td className="py-2 pr-3 text-right tabular" data-ordenado>{i.ordenado}</td>
                <td className="py-2 pr-3 text-right tabular" data-recebido>{i.recebido}</td>
                <td className="py-2 pr-3 text-right tabular" data-cancelado>{i.cancelado}</td>
                <td className="py-2 text-right tabular font-medium" data-pendente>{i.pendente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
