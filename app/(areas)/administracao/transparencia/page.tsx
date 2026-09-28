import { HubLanding, type ItemHub } from "../../../../components/ui/HubLanding";
import { AREAS } from "../../../../lib/navegacao";

/**
 * Landing da TRANSPARÊNCIA — a publicação ativa (LC 131) e a prestação de contas ao TCE. Aponta para
 * o que já está publicado hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Política de publicação de pessoal", descricao: "Ato que autoriza a publicação de nome, cargo e remuneração de cada servidor no portal. Sem política aprovada, o portal exibe apenas os totais por unidade.", href: "/administracao/transparencia/politica-de-pessoal", onde: "Interno" },
  { titulo: "Demonstrativo público de pessoal", descricao: "Totais por unidade e regime, e os dados individuais autorizados pela política vigente.", href: "/transparencia/pessoal", onde: "Público" },
  { titulo: "Demonstrativos fiscais publicados", descricao: "Demonstrativos RREO e RGF em PDF e CSV, com acesso livre ao cidadão (LC 131/2009).", href: "/transparencia/demonstrativos", onde: "Público" },
  { titulo: "Prestação de contas ao TCE", descricao: "SAGRES (TXT e Captura 2.0), Banco do Brasil e consulta à API do TCE-PB, na Central de Integrações.", href: "/integracoes", onde: "Integrações" },
  { titulo: "Exportações federais (MSC e MANAD)", descricao: "Matriz de Saldos Contábeis e arquivo MANAD, gerados a partir da mesma escrituração contábil." },
];

export default function TransparenciaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "transparencia")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
