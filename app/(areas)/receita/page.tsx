import Link from "next/link";
import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS, EXECUCAO_RECEITA } from "../../../lib/navegacao";

/**
 * Landing da RECEITA.
 *
 * ⚠️ Imports RELATIVOS: o repo usa import relativo na UI (o alias @/ conflita com o webpack do
 * Next neste setup). Ver components/ui/MODULO-UI.md.
 */
export default function ReceitaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "receita")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {EXECUCAO_RECEITA.map((item) => (
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
        A <strong>previsão</strong> e a <strong>reprevisão</strong> da receita (LRF art. 12) ficam
        em <Link href="/planejamento/reprevisao" className="underline">Planejamento</Link> — é lá
        que a LOA é decidida. Aqui fica o que <em>efetivamente entrou</em>: as guias arrecadadas do
        exercício e a receita realizada líquida. A anulação de uma arrecadação é ato próprio,
        registrado com identidade e histórico.
      </p>
    </div>
  );
}
