import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormSenha } from "./FormSenha";

/** ADMINISTRAÇÃO · Trocar a própria senha. */
export const dynamic = "force-dynamic";

export default function SenhaPage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <PageHeader titulo="Trocar senha" subtitulo="Após a troca, será necessário entrar novamente com a nova senha." />
      <div className="max-w-sm rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Por segurança, a troca de senha encerra todas as sessões abertas, inclusive a atual.
      </div>
      <FormSenha />
    </div>
  );
}
