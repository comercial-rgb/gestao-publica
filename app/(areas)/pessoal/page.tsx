import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing de PESSOAL (M32, RH bloco 1 — TR 5.12). Servidor sobre a pessoa do cadastro único; cargo,
 * lotação, salário e situação derivados dos eventos. A folha (bloco 2) ainda não existe — e a landing
 * não a promete. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */
const ITENS: readonly ItemHub[] = [
  { titulo: "Servidores", descricao: "Ficha funcional do servidor: dados pessoais, matrículas e histórico de admissão, movimentação, remuneração, afastamentos, desligamento, dependentes, portarias e anotações.", href: "/pessoal/servidores" },
  { titulo: "Cargos", descricao: "Quadro de pessoal, com as vagas criadas em lei e as vagas ocupadas.", href: "/pessoal/cargos" },
  { titulo: "Funções", descricao: "Funções exercidas, distintas do cargo e sem ocupação de vaga, com os servidores designados.", href: "/pessoal/funcoes" },
  { titulo: "Lotações", descricao: "Estrutura de lotações, com a unidade orçamentária correspondente e os servidores lotados.", href: "/pessoal/lotacoes" },
  { titulo: "Pessoas", descricao: "Cadastro de pessoas físicas, com CPF, nome, endereço e contatos, a partir do qual o servidor é registrado.", href: "/cadastros/pessoas", onde: "Cadastros" },
];

export default function PessoalPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "pessoal")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
