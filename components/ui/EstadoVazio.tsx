/** ESTADO VAZIO — quando uma consulta não tem linhas. Honesto: diz que está vazio, não quebra. */
export interface EstadoVazioProps {
  readonly titulo: string;
  readonly descricao?: string;
  readonly acao?: React.ReactNode;
}

export function EstadoVazio({
  titulo,
  descricao,
  acao,
}: EstadoVazioProps): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] px-6 py-12 text-center">
      <p className="text-sm font-medium text-[color:var(--color-ink)]">{titulo}</p>
      {descricao !== undefined ? (
        <p className="max-w-md text-sm text-[color:var(--color-ink-2)]">{descricao}</p>
      ) : null}
      {acao !== undefined ? <div className="mt-2">{acao}</div> : null}
    </div>
  );
}
