import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS, DIVIDA } from "../../../lib/navegacao";

/**
 * Landing da DÍVIDA E PRECATÓRIOS.
 *
 * ⚠️ A DÍVIDA FUNDADA (M10) CONTINUA EM PATRIMÔNIO, e isso é pendência nomeada, não esquecimento:
 * o modelo e as regras dela existem desde o ENT01, e o que falta é a TELA. Trazer o link para cá
 * antes de a tela existir seria oferecer um caminho que não chega a lugar nenhum.
 */
const ITENS: readonly ItemHub[] = DIVIDA.map((r) => ({
  titulo: r.rotulo,
  descricao: r.descricao,
  href: r.href,
}));

export default function DividaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "divida")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
