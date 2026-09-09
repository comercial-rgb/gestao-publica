/** BADGE de status — tons sóbrios, do @theme. Nunca verde/vermelho de valor (esses são do sinal). */
export type StatusBadge = "neutro" | "ok" | "alerta" | "erro";

const CLASSES: Record<StatusBadge, string> = {
  neutro:
    "bg-[color:var(--color-status-neutro-bg)] text-[color:var(--color-status-neutro-fg)]",
  ok: "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]",
  alerta:
    "bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]",
  erro: "bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]",
};

export interface BadgeProps {
  readonly status?: StatusBadge;
  readonly children: React.ReactNode;
}

export function Badge({ status = "neutro", children }: BadgeProps): React.ReactElement {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold leading-none ${CLASSES[status]}`}
    >
      {children}
    </span>
  );
}
