import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import type { ItemDeOrigemLido } from "../../../../../lib/portas/recursos/compras-dados";
import { FormDesfazerVinculo } from "./FormDesfazerVinculo";

/**
 * A ORIGEM DA ORDEM (V6 P1.1) — por linha, de quais solicitações ela veio (com o recebido atribuído a
 * cada parcela) e quanto é "sem origem" (compra direta ou legado — identificado, nunca casado sozinho).
 * Quem estorna ordem pode desfazer uma parcela viva sem recebimento.
 */
export function Origem({ ordemId, itens, podeDesfazer, estornada }: { readonly ordemId: string; readonly itens: readonly ItemDeOrigemLido[]; readonly podeDesfazer: boolean; readonly estornada: boolean }): React.ReactElement {
  return (
    <section aria-label="Origem da ordem" data-origem className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Origem por linha</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">De quais solicitações cada linha veio. O que não tem origem é compra direta ou legado, e fica identificado assim — nunca é casado automaticamente.</p>
      <ul className="space-y-3">
        {itens.map((i) => (
          <li key={i.itemDeOrdemId} data-item-origem={i.itemDeOrdemId} className="border-t border-[color:var(--color-border)] pt-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[color:var(--color-ink)]">{i.rotulo}</span>
              <span className="tabular text-xs text-[color:var(--color-ink-3)]">{i.quantidade} na ordem</span>
              {i.semOrigem !== "0.0000" ? <Badge status="alerta">{i.semOrigem} sem origem</Badge> : null}
            </div>
            {i.parcelas.length === 0 ? (
              <p className="mt-1 text-xs text-[color:var(--color-ink-3)]" data-sem-origem>Sem solicitação vinculada (compra direta ou legado).</p>
            ) : (
              <ul className="mt-1 space-y-1 text-xs text-[color:var(--color-ink-2)]">
                {i.parcelas.map((p) => (
                  <li key={p.alocacaoId} data-parcela-origem={p.situacao}>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/licitacoes/solicitacoes/${p.solicitacaoId}`} className="font-medium text-[color:var(--color-primary)] hover:underline">Solicitação {p.solicitacaoNumero}</Link>
                      <span>{p.setor} · {p.solicitante}</span>
                      <span className="tabular">{p.quantidade} desta linha · {p.recebido} recebido</span>
                      <Badge status={p.situacao === "VIVA" ? (estornada ? "erro" : "ok") : "neutro"}>{p.situacao === "VIVA" ? (estornada ? "cancelada pelo estorno" : "viva") : "desfeita"}</Badge>
                    </div>
                    {podeDesfazer && !estornada ? <FormDesfazerVinculo ordemId={ordemId} alocacaoId={p.alocacaoId} podeDesfazer={p.situacao === "VIVA" && p.recebido === "0.0000"} /> : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
