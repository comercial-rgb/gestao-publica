import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing de LICITAÇÕES E CONTRATOS — processos, contratos, aditivos e obras. Aponta para onde o
 * dado da contratação já repercute hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Empenhos e modalidade", descricao: "Cada empenho carrega a modalidade de licitação e o processo de origem — a ponte da contratação com a despesa.", href: "/despesa/empenhos", onde: "Despesa" },
  { titulo: "Parcerias público-privadas", descricao: "Contratos de PPP e o teto de 5% da RCL (RREO Anexo 13).", href: "/relatorios/rreo/anexo13", onde: "Relatórios" },
  { titulo: "Contratos, aditivos e obras", descricao: "O ciclo de contratação alimenta o empenho e a execução; o cadastro dos instrumentos é registrado nos módulos de origem." },
];

export default function LicitacoesPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "licitacoes")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
