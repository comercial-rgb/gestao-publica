/** CABEÇALHO DE PÁGINA — título + subtítulo opcional + ações à direita. */
export interface PageHeaderProps {
  readonly titulo: string;
  readonly subtitulo?: string;
  readonly acoes?: React.ReactNode;
}

export function PageHeader({
  titulo,
  subtitulo,
  acoes,
}: PageHeaderProps): React.ReactElement {
  return (
    <div className="mb-8 flex items-start justify-between gap-5 border-b border-[color:var(--color-border)] pb-5">
      <div className="max-w-4xl">
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">{titulo}</h1>
        {subtitulo !== undefined ? (
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{subtitulo}</p>
        ) : null}
      </div>
      {acoes !== undefined ? <div className="flex items-center gap-4">{acoes}</div> : null}
    </div>
  );
}
