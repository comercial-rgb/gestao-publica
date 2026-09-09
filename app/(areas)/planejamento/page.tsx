import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing do PLANEJAMENTO — a LOA e a sua conferência. As telas apontadas existem; nada é prometido.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "QDD — Quadro de Detalhamento da Despesa", descricao: "A dotação de cada ficha: inicial, os créditos que a alteraram e a dotação atualizada — o teto contra o qual se empenha.", href: "/planejamento/qdd" },
  { titulo: "Programação financeira — CMD/MBA", descricao: "O cronograma mensal de desembolso (os duodécimos por fonte) e as metas bimestrais de arrecadação, com o decreto que as institui (LRF art. 8º e 13).", href: "/planejamento/cmd-mba" },
  { titulo: "Créditos adicionais", descricao: "Decretos de suplementação e anulação, com o teto da lei e a dotação atualizada de cada ficha.", href: "/planejamento/creditos-adicionais" },
  { titulo: "Atualizações orçamentárias", descricao: "Todo movimento de crédito do exercício, filtrável por ficha, decreto, fonte e UG.", href: "/relatorios/atualizacoes-orcamentarias", onde: "Relatórios" },
  { titulo: "Reprevisão da receita", descricao: "Revisão da previsão de arrecadação ao longo do exercício (LRF art. 12).", href: "/planejamento/reprevisao" },
  { titulo: "Consistência da LOA", descricao: "As identidades dos demonstrativos conferidas num lugar só — o diagnóstico antes do envio ao TCE.", href: "/relatorios/consistencia", onde: "Relatórios" },
  { titulo: "Balancete de verificação", descricao: "Saldo e movimento por conta, provando que débitos e créditos fecham.", href: "/relatorios/livros/balancete", onde: "Relatórios" },
  { titulo: "Fichas e créditos adicionais", descricao: "A dotação de cada ficha e os créditos que a alteram sustentam a execução da despesa e os demonstrativos orçamentários.", href: "/despesa/empenhos", onde: "Despesa" },
];

export default function PlanejamentoPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "planejamento")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
