import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS, EXECUCAO_DESPESA } from "../../../lib/navegacao";

/**
 * Landing da DESPESA — empenho → liquidação → pagamento, na ordem em que os fatos acontecem.
 *
 * ⚠️ Imports RELATIVOS: o repo usa import relativo na UI (o alias @/ conflita com o webpack do
 * Next neste setup). Ver components/ui/MODULO-UI.md.
 */
export default function DespesaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "despesa")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EXECUCAO_DESPESA.map((item) => (
          <CardNavegacao
            key={item.href}
            href={item.href}
            rotulo={item.numero}
            titulo={item.rotulo}
            descricao={item.descricao}
          />
        ))}
      </div>

      <p className="text-sm leading-relaxed text-[color:var(--color-ink-2)]">
        Estas telas são de <strong>consulta</strong>: acompanham cada empenho, liquidação e
        pagamento com seus saldos e a ordem cronológica por fonte. Os atos de execução são
        registrados pelo funil contábil do sistema, com identidade e histórico em cada lançamento.
      </p>
    </div>
  );
}
