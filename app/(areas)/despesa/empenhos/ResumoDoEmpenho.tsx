import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import type { EmpenhoDaTela } from "../../../../lib/portas/empenho";
import { dataBr } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";
import { ROTULO_CATEGORIA_DO_EMPENHO, ROTULO_STATUS_DO_EMPENHO } from "./rotulos";

export function tomDoStatusDoEmpenho(status: string): StatusBadge {
  if (status === "ANULADO") return "erro";
  if (status === "PAGO") return "ok";
  if (status === "EMPENHADO") return "neutro";
  return "alerta";
}

const CLASSE_ACAO =
  "inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-xs font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)]";

// ⚠️ CLASSE PRÓPRIA, e não CLASSE_ACAO + fundo: duas utilitárias de fundo na mesma lista não têm
// vencedor garantido — o botão já saiu branco sobre branco assim.
const CLASSE_ACAO_PRINCIPAL =
  "inline-flex h-8 items-center rounded-[var(--radius-md)] bg-[color:var(--color-primary)] px-3 text-xs font-semibold text-[color:var(--color-primary-fg)] hover:bg-[color:var(--color-primary-hover)]";

/**
 * O EMPENHO NO MODAL (V22) — o resumo que a lista já tem, organizado para leitura, e o caminho
 * para o resto: o dossiê completo (liquidações, anulações, lançamentos), a Nota de Empenho em PDF e
 * a versão para impressão. Nada aqui é lido de novo nem calculado: são os campos da mesma linha,
 * já derivados pelo domínio.
 */
export function ResumoDoEmpenho({ e, queryRecorte }: { readonly e: EmpenhoDaTela; readonly queryRecorte: string }): React.ReactElement {
  const linha = (rotulo: string, valor: React.ReactNode): React.ReactElement => (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-[color:var(--color-ink)]">{valor}</dd>
    </div>
  );
  return (
    <div className="space-y-5" data-resumo-do-empenho={e.numero}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={tomDoStatusDoEmpenho(e.status)}>{ROTULO_STATUS_DO_EMPENHO[e.status] ?? e.status}</Badge>
        <Badge status="neutro">{ROTULO_CATEGORIA_DO_EMPENHO[e.categoria] ?? e.categoria}</Badge>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {linha("Data", dataBr(e.data))}
        {linha("Credor", e.credorNome !== null ? <>{e.credorNome}<span className="block text-xs text-[color:var(--color-ink-3)]">{formatarDocumento(e.credorCpfCnpj)}</span></> : formatarDocumento(e.credorCpfCnpj))}
        {linha("Unidade", `${e.unidadeCodigo} — ${e.unidadeNome}`)}
        {linha("Ficha", e.fichaNumero)}
        {linha("Fonte de recursos", e.fonteCodigo)}
        {linha("Natureza da despesa", e.naturezaCodigo)}
        {e.campanha !== null ? linha("Campanha publicitária", e.campanha) : null}
        {e.convenio !== null ? linha("Convênio", e.convenio) : null}
      </dl>

      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Histórico</h3>
        <p className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">{e.historico}</p>
      </div>

      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Valores (R$)</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 sm:grid-cols-3">
          {([
            ["Valor emitido", e.valor],
            ["Anulações", e.anulacoes],
            ["Empenhado líquido", e.empenhadoLiquido],
            ["Liquidado", e.liquidado],
            ["Pago", e.pago],
            ["A liquidar", e.saldoALiquidar],
            ["A pagar", e.saldoAPagar],
          ] as const).map(([r, v]) => (
            <div key={r} className="flex items-baseline justify-between gap-2">
              <dt className="text-xs text-[color:var(--color-ink-2)]">{r}</dt>
              <dd className="text-sm font-semibold"><ValorMonetario valor={v} /></dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[color:var(--color-border)] pt-4">
        <Link href={`/despesa/empenhos/${e.id}`} className={CLASSE_ACAO_PRINCIPAL}>
          Abrir o dossiê completo
        </Link>
        <a href={`/despesa/empenhos/ne?id=${e.id}&${queryRecorte}`} target="_blank" rel="noopener noreferrer" className={CLASSE_ACAO}>
          Nota de Empenho (PDF)
        </a>
        <a href={`/despesa/empenhos/${e.id}?imprimir=1`} target="_blank" rel="noopener noreferrer" className={CLASSE_ACAO}>
          Imprimir
        </a>
      </div>
    </div>
  );
}
