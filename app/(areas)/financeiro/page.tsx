import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing do FINANCEIRO — tesouraria, conciliação e ordem cronológica. Aponta para onde cada número
 * já pode ser lido hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Extraorçamentário", descricao: "Consignações e retenções na fonte: o dinheiro de terceiros no caixa, com saldo por consignatário e recolhimentos.", href: "/financeiro/extraorcamentario" },
  { titulo: "Fila de pagamentos", descricao: "Ordem cronológica por fonte e categoria — a fila da Lei 14.133/2021, art. 141.", href: "/despesa/pagamentos", onde: "Despesa" },
  // ⚠️ ANTES este item apontava para /integracoes, e o card do BB de lá não tinha ação: dois links
  // que se apontavam e nenhum que chegava ao número. Aponta direto para a tela que responde a
  // pergunta ("o banco e o razão contam a mesma história?"); a Central continua sendo o lugar da
  // IMPORTAÇÃO, e é para lá que a tela de conciliação manda quando não há extrato.
  { titulo: "Conciliação bancária", descricao: "O extrato do Banco do Brasil confrontado com o razão: correspondências pagamento × extrato, pendências dos dois lados e a diferença toda nomeada.", href: "/financeiro/conciliacao" },
  { titulo: "Disponibilidade de caixa e RP", descricao: "O que sobra em cada fonte e se o ente pode inscrever restos a pagar (RGF Anexo 5).", href: "/relatorios/rgf/anexo5", onde: "Relatórios" },
];

export default function FinanceiroPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "financeiro")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
