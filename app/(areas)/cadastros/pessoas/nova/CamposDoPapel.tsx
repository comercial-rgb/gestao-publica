import { CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";

/** O papel a conceder e o caminho de volta, comuns aos dois formulários do atalho. */
export function CamposDoPapel({
  papel,
  rotuloDoPapel,
  retorno,
  hoje,
}: {
  readonly papel: string;
  readonly rotuloDoPapel: string;
  readonly retorno: string;
  readonly hoje: string;
}): React.ReactElement {
  return (
    <fieldset className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" data-papel-do-atalho={papel}>
      <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Papel no cadastro</legend>
      <input type="hidden" name="papel" value={papel} />
      <input type="hidden" name="retorno" value={retorno} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-[color:var(--color-ink)]">
          <input type="checkbox" name="conceder" defaultChecked />
          Conceder o papel de {rotuloDoPapel.toLowerCase()}
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vale a partir de</span>
          <input type="date" name="dataDoPapel" defaultValue={hoje} required className={CAMPO} />
        </label>
      </div>
    </fieldset>
  );
}
