import { PageHeader } from "../../../../components/ui/PageHeader";
import { FormSenha } from "./FormSenha";

/** ADMINISTRAÇÃO · Trocar a própria senha. */
export const dynamic = "force-dynamic";

export default function SenhaPage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <PageHeader titulo="Trocar Senha" subtitulo="A troca derruba TODAS as suas sessões — você será deslogado e reentra com a nova senha" />
      <div className="max-w-sm rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Ao trocar a senha, todas as sessões abertas (inclusive esta) são revogadas — é a defesa do dia mau: se a senha vazou, quem a roubou perde o token que já tinha.
      </div>
      <FormSenha />
    </div>
  );
}
