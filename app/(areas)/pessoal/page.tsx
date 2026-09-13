import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing de PESSOAL (M32, RH bloco 1 — TR 5.12). Servidor sobre a pessoa do cadastro único; cargo,
 * lotação, salário e situação derivados dos eventos. A folha (bloco 2) ainda não existe — e a landing
 * não a promete. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */
const ITENS: readonly ItemHub[] = [
  { titulo: "Servidores", descricao: "A ficha do servidor: pessoa do cadastro único, dados civis, vínculos (matrículas) e o histórico funcional — admissão, movimentação, remuneração, afastamento, desligamento, dependentes, portarias e anotações.", href: "/pessoal/servidores" },
  { titulo: "Cargos", descricao: "O quadro de pessoal: vagas fixadas em lei e vagas ocupadas contadas a cada leitura. Criar a vaga e ocupá-la são ações distintas.", href: "/pessoal/cargos" },
  { titulo: "Lotações", descricao: "A árvore de lotações, com a unidade orçamentária quando houver; os lotados são contados pelos vínculos vivos.", href: "/pessoal/lotacoes" },
  { titulo: "Pessoas do cadastro único", descricao: "O servidor nasce de uma pessoa física já cadastrada — CPF, nome, endereço e contatos vivem lá, versionados.", href: "/cadastros/pessoas", onde: "Cadastros" },
];

export default function PessoalPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "pessoal")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
