import type { StatusBadge } from "./Badge";

/**
 * ALERTA — a variante em BLOCO do mesmo vocabulário de status do `Badge`.
 *
 * ═══ ⚠️ POR QUE ELE NÃO TEM VOCABULÁRIO PRÓPRIO ═══
 * A proposta original pedia `info | sucesso | atencao | erro`. O `Badge` já define
 * `neutro | ok | alerta | erro` (Badge.tsx:2), com os tokens
 * `--color-status-{neutro,ok,alerta,erro}-{bg,fg}` já no `@theme`.
 *
 * São a MESMA semântica com nomes diferentes. Criar os dois daria ao sistema dois vocabulários de
 * status, e a pergunta "qual eu uso?" não teria resposta — até alguém usar `sucesso` numa tela e
 * `ok` na de baixo, com tons que ninguém garantiu iguais. Por isso este componente IMPORTA
 * `StatusBadge`: mesmos nomes, mesmos tokens, layout diferente.
 *
 * ⚠️ A COR NÃO INFORMA SOZINHA. Cerca de 8% dos homens tem alguma deficiência de visão de cores;
 * um alerta distinguido só por vermelho não existe para eles. Por isso o `titulo` é obrigatório —
 * a palavra carrega o significado, a cor reforça.
 */

const CLASSES: Record<StatusBadge, string> = {
  neutro:
    "border-[color:var(--color-border-strong)] bg-[color:var(--color-status-neutro-bg)] text-[color:var(--color-status-neutro-fg)]",
  ok: "border-[color:var(--color-status-ok-fg)] bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]",
  alerta:
    "border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]",
  erro: "border-[color:var(--color-status-erro-fg)] bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]",
};

export interface AlertaProps {
  readonly status?: StatusBadge;
  /** ⚠️ OBRIGATÓRIO — é a palavra que carrega o significado quando a cor não chega. */
  readonly titulo: string;
  readonly children?: React.ReactNode;
}

export function Alerta({ status = "neutro", titulo, children }: AlertaProps): React.ReactElement {
  return (
    <div
      // `role="alert"` só no ERRO: ele interrompe a leitura do usuário. Usá-lo em tudo faria o
      // leitor de tela cortar a navegação para anunciar um "salvo com sucesso" — e quem usa
      // leitor aprenderia a ignorar a região inteira.
      {...(status === "erro" ? { role: "alert" as const } : { role: "status" as const })}
      className={`rounded-[var(--radius-md)] border px-4 py-3 text-sm ${CLASSES[status]}`}
    >
      <p className="font-semibold">{titulo}</p>
      {children !== undefined ? <div className="mt-1 leading-relaxed">{children}</div> : null}
    </div>
  );
}
