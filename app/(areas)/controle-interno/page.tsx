import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS, CONTROLE_INTERNO } from "../../../lib/navegacao";

/**
 * Landing do CONTROLE INTERNO (CF art. 74).
 *
 * ⚠️ ELE NÃO MOVE O RAZÃO, e a área diz isso em vez de escondê-lo entre as de execução: o
 * controle interno produz JUÍZO sobre o que os outros fizeram, e o produto dele é documento
 * assinado — não lançamento.
 */
const ITENS: readonly ItemHub[] = CONTROLE_INTERNO.map((r) => ({
  titulo: r.rotulo,
  descricao: r.descricao,
  href: r.href,
}));

export default function ControleInternoPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "controle-interno")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
