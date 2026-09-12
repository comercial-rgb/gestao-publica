import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { ACERVO, ALMOXARIFADO, AREAS, GESTAO_DO_BEM } from "../../../lib/navegacao";

/**
 * Landing do PATRIMÔNIO — bens, almoxarifado, dívida e provisões. Aponta para onde o dado já aparece.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  // ⚠️ ENT06 — as telas do almoxarifado físico vêm da MESMA lista que alimenta a busca
  // global (`lib/navegacao.ts`). Repetir os itens aqui à mão criaria duas verdades sobre o
  // que existe nesta área, e a divergência apareceria como tela que a busca acha e o hub
  // não mostra.
  ...ALMOXARIFADO.map((r) => ({ titulo: r.rotulo, descricao: r.descricao, href: r.href })),
  ...GESTAO_DO_BEM.map((r) => ({ titulo: r.rotulo, descricao: r.descricao, href: r.href })),
  ...ACERVO.map((r) => ({ titulo: r.rotulo, descricao: r.descricao, href: r.href })),
  { titulo: "Bens e posição patrimonial", descricao: "A posição por classe (5.86): saldo anterior, ingressos, atualizações e saldo final — avaliação, reavaliação e depreciação por SUM dos lançamentos.", href: "/patrimonio/bens" },
  { titulo: "Dívida consolidada", descricao: "O saldo da dívida por tipo (mobiliária/contratual), sobre a RCL e os limites do Senado (5.82–5.83; RGF Anexo 2).", href: "/patrimonio/bens" },
  { titulo: "Provisões", descricao: "O que o ente reconhece que vai dever antes de dever — provisão matemática previdenciária e riscos cíveis e trabalhistas (NBC TSP 03). Constituir é VPD, e não consome dotação.", href: "/patrimonio/provisoes" },
  { titulo: "Variações patrimoniais", descricao: "A movimentação patrimonial do exercício aparece também no razão analítico e no balancete.", href: "/relatorios/livros/razao", onde: "Relatórios" },
];

export default function PatrimonioPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "patrimonio")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
