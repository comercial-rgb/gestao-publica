import { HubLanding, type ItemHub } from "../../../../components/ui/HubLanding";
import { AREAS } from "../../../../lib/navegacao";

/**
 * Landing da TRANSPARÊNCIA — a publicação ativa (LC 131) e a prestação de contas ao TCE. Aponta para
 * o que já está publicado hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Política de publicação de pessoal", descricao: "O ato do ente que autoriza — ou não — publicar nome, cargo e remuneração por servidor no portal aberto. Sem política aprovada, o portal mostra só os totais por unidade.", href: "/administracao/transparencia/politica-de-pessoal", onde: "Interno" },
  { titulo: "Demonstrativo público de pessoal", descricao: "O que o cidadão vê hoje: totais por unidade e regime, e as linhas por servidor que a política vigente autorizar.", href: "/transparencia/pessoal", onde: "Público" },
  { titulo: "Demonstrativos fiscais publicados", descricao: "A área pública dos demonstrativos (RREO/RGF) em PDF e CSV, aberta sem login (LC 131/2009).", href: "/transparencia/demonstrativos", onde: "Público" },
  { titulo: "Prestação de contas ao TCE", descricao: "SAGRES (TXT e Captura 2.0), Banco do Brasil e a consulta à API do TCE-PB, na Central de Integrações.", href: "/integracoes", onde: "Integrações" },
  { titulo: "Exports federais (MSC, MANAD)", descricao: "A Matriz de Saldos Contábeis e o arquivo MANAD partem do mesmo razão; a publicação é registrada nos módulos de origem." },
];

export default function TransparenciaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "transparencia")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
