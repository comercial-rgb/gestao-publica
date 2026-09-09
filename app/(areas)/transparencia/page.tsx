import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing da TRANSPARÊNCIA — a publicação ativa (LC 131) e a prestação de contas ao TCE. Aponta para
 * o que já está publicado hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Demonstrativos fiscais publicados", descricao: "A área pública dos demonstrativos (RREO/RGF) em PDF e CSV, aberta sem login (LC 131/2009).", href: "/transparencia/demonstrativos", onde: "Público" },
  { titulo: "Prestação de contas ao TCE", descricao: "SAGRES (TXT e Captura 2.0), Banco do Brasil e a consulta à API do TCE-PB, na Central de Integrações.", href: "/integracoes", onde: "Integrações" },
  { titulo: "Exports federais (MSC, MANAD)", descricao: "A Matriz de Saldos Contábeis e o arquivo MANAD partem do mesmo razão; a publicação é registrada nos módulos de origem." },
];

export default function TransparenciaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "transparencia")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
