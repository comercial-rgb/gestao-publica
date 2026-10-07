import { formatarMoeda } from "../../lib/format/moeda";

/**
 * V36 (TR 5.10.1.38) — o aviso de que o credor deve ao município (dívida ativa com saldo). É AVISO, não bloqueio: reter
 * ou compensar é decisão do ente. Sem débito, não mostra nada.
 */
export function AvisoDeDebitoDoCredor({ debito }: { readonly debito: { readonly inscricoes: number; readonly saldo: string } | "indisponivel" | undefined }): React.ReactElement | null {
  if (debito === undefined) return null;
  if (debito === "indisponivel") {
    return (
      <p role="status" data-debito-do-credor="indisponivel" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
        Não foi possível consultar a dívida ativa deste credor agora. Confira na Dívida Ativa antes de prosseguir.
      </p>
    );
  }
  return (
    <p role="status" data-debito-do-credor={debito.saldo} className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
      Este credor tem {debito.inscricoes} inscrição(ões) em dívida ativa com saldo de R$ {formatarMoeda(debito.saldo).texto}. Confira
      na Dívida Ativa antes de prosseguir.
    </p>
  );
}
