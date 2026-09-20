import Link from "next/link";
import { Acompanhamento } from "./Acompanhamento";

/**
 * ACOMPANHAR A MARCAÇÃO (V11 V8.1) — sem conta, pelo código de acompanhamento.
 *
 * ⚠️ PÁGINA SÓ DE CASCA: ela não lê nada. Quem lê é a ilha, pelo código que a pessoa digita, e
 * nunca por parâmetro de URL — um código no endereço entraria no histórico do navegador e no
 * `Referer` de qualquer link clicado a partir daqui.
 */
export const dynamic = "force-dynamic";

export default function AcompanharPage(): React.ReactElement {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Acompanhar atendimento marcado</h1>
      <p className="text-sm text-[color:var(--color-ink-2)]">
        Consulte, confira o horário e cancele, se precisar.{" "}
        <Link href="/agendamento" className="underline">
          Marcar um novo atendimento
        </Link>
      </p>
      <Acompanhamento />
    </div>
  );
}
