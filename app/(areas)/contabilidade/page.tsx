import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS, CONTABILIDADE } from "../../../lib/navegacao";

/**
 * Landing da CONTABILIDADE — o plano que classifica e o razão que registra.
 *
 * ⚠️ POR QUE ÁREA PRÓPRIA, E NÃO UM ITEM DE "RELATÓRIOS". Diário, Razão e Balancete são a SAÍDA
 * formatada, exigida por lei, e moram em Relatórios porque é lá que o ente vai buscar documento
 * para entregar. Estas duas telas são a BASE dessa saída: o plano de contas é a régua que
 * classifica, e os lançamentos são o fato bruto com as partidas dobradas. Quem AUDITA entra por
 * aqui — parte da conta, chega ao lançamento, e do lançamento ao documento que o originou.
 * Enfiá-las em Relatórios misturaria o que se entrega com o que se confere.
 *
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

export default function ContabilidadePage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "contabilidade")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CONTABILIDADE.map((rel) => (
          <CardNavegacao key={rel.href} href={rel.href} rotulo={rel.numero} titulo={rel.rotulo} descricao={rel.descricao} />
        ))}
        <CardNavegacao
          href="/relatorios/livros/balancete"
          rotulo="Balancete"
          titulo="Balancete de Verificação"
          descricao="A prova de que a soma dos débitos é igual à dos créditos — a mesma base destas duas telas, formatada para entrega."
        />
      </div>
      <p className="text-sm leading-relaxed text-[color:var(--color-ink-2)]">
        As partidas dobradas são <strong>automáticas</strong>: os eventos contábeis já vêm prontos e o
        usuário não parametriza roteiro. Diário, Razão e Balancete saem desta mesma base única, em{" "}
        <a href="/relatorios" className="text-[color:var(--color-primary)] hover:underline">Relatórios</a>.
      </p>
    </div>
  );
}
