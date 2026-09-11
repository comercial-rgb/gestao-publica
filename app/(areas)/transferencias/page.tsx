import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS, TRANSFERENCIAS } from "../../../lib/navegacao";

/**
 * Landing das TRANSFERÊNCIAS — convênios e consórcios.
 *
 * ⚠️ A ÁREA EXISTE PORQUE A PERGUNTA DO OPERADOR É UMA. "Quanto o ente transferiu e quanto
 * ainda deve transferir" atravessa dois módulos (M28 e M30) e dois instrumentos jurídicos
 * diferentes, mas é a mesma pergunta — e a navegação segue a cabeça de quem usa, não a árvore
 * dos módulos.
 */
const ITENS: readonly ItemHub[] = TRANSFERENCIAS.map((r) => ({
  titulo: r.rotulo,
  descricao: r.descricao,
  href: r.href,
}));

export default function TransferenciasPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "transferencias")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
