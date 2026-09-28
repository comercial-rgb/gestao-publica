import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing do PLANEJAMENTO — a LOA e a sua conferência. As telas apontadas existem; nada é prometido.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "PPA — Plano Plurianual", descricao: "Plano do quadriênio e sua lei: programas, indicadores, ações, receita prevista e série histórica.", href: "/planejamento/ppa" },
  { titulo: "LDO — Lei de Diretrizes Orçamentárias", descricao: "Tramitação, prioridades e anexos da LRF (metas e riscos fiscais, renúncia de receita, alienação de ativos, RPPS, dívida e margem de expansão), emitidos em PDF.", href: "/planejamento/ldo" },
  { titulo: "QDD — Quadro de Detalhamento da Despesa", descricao: "Dotação inicial, créditos adicionais e dotação atualizada de cada ficha, limite para o empenho.", href: "/planejamento/qdd" },
  { titulo: "Programação financeira — CMD/MBA", descricao: "Cronograma mensal de desembolso por fonte e metas bimestrais de arrecadação, com o decreto correspondente (LRF arts. 8º e 13).", href: "/planejamento/cmd-mba" },
  { titulo: "Créditos adicionais", descricao: "Leis e decretos de suplementação e anulação, com o valor autorizado e a dotação atualizada de cada ficha.", href: "/planejamento/creditos-adicionais" },
  { titulo: "Atualizações orçamentárias", descricao: "Movimentações de crédito do exercício, com filtro por ficha, decreto, fonte e UG.", href: "/relatorios/atualizacoes-orcamentarias", onde: "Relatórios" },
  { titulo: "Reprevisão da receita", descricao: "Revisão da previsão de arrecadação ao longo do exercício (LRF art. 12).", href: "/planejamento/reprevisao" },
  { titulo: "Consistência da LOA", descricao: "Conferência da consistência entre os demonstrativos antes do envio ao TCE.", href: "/relatorios/consistencia", onde: "Relatórios" },
  { titulo: "Balancete de verificação", descricao: "Saldo e movimento por conta, com a conferência entre débitos e créditos.", href: "/relatorios/livros/balancete", onde: "Relatórios" },
  { titulo: "Fichas e créditos adicionais", descricao: "Execução da despesa sobre a dotação de cada ficha.", href: "/despesa/empenhos", onde: "Despesa" },
];

export default function PlanejamentoPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "planejamento")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
