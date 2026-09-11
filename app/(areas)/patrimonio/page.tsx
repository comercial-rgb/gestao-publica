import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing do PATRIMÔNIO — bens, almoxarifado, dívida e provisões. Aponta para onde o dado já aparece.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Bens e posição patrimonial", descricao: "A posição por classe (5.86): saldo anterior, ingressos, atualizações e saldo final — avaliação, reavaliação e depreciação por SUM dos lançamentos.", href: "/patrimonio/bens" },
  { titulo: "Dívida consolidada", descricao: "O saldo da dívida por tipo (mobiliária/contratual), sobre a RCL e os limites do Senado (5.82–5.83; RGF Anexo 2).", href: "/patrimonio/bens" },
  { titulo: "Provisões", descricao: "O que o ente reconhece que vai dever antes de dever — provisão matemática previdenciária e riscos cíveis e trabalhistas (NBC TSP 03). Constituir é VPD, e não consome dotação.", href: "/patrimonio/provisoes" },
  { titulo: "Variações patrimoniais", descricao: "A movimentação patrimonial do exercício aparece também no razão analítico e no balancete.", href: "/relatorios/livros/razao", onde: "Relatórios" },
];

export default function PatrimonioPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "patrimonio")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
