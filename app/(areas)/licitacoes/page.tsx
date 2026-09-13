import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing de LICITAÇÕES E CONTRATOS — processos, contratos, aditivos e obras. Aponta para onde o
 * dado da contratação já repercute hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Processos licitatórios", descricao: "O processo de contratação: número, modalidade, objeto e valor licitado; homologar, reservar a dotação e cadastrar o contrato ficam no detalhe. A situação é derivada da homologação.", href: "/licitacoes/processos" },
  { titulo: "Contratos e aditivos", descricao: "Valor atualizado e fim da vigência derivados dos aditivos (acréscimo, supressão, prorrogação); estornar um aditivo é outro movimento. Os empenhos que informaram o contrato aparecem no histórico.", href: "/licitacoes/contratos" },
  { titulo: "Solicitações de compra", descricao: "A requisição ao Compras: setor, justificativa, solicitante e os itens. Autorizar e anular são fatos com data, motivo e autor.", href: "/licitacoes/solicitacoes" },
  { titulo: "Pesquisas de preços", descricao: "Itens com quantidade e cotações por fornecedor; média, mínimo e máximo são derivados das cotações a cada leitura.", href: "/licitacoes/pesquisas-de-precos" },
  { titulo: "Ordens de compra", descricao: "Ordinária, global ou estimativa ao fornecedor, por processo ou dispensa, com itens e ficha; o recebimento é por item e o saldo a receber é derivado.", href: "/licitacoes/ordens-de-compra" },
  { titulo: "Empenhos e modalidade", descricao: "Cada empenho carrega a modalidade de licitação e o processo de origem — a ponte da contratação com a despesa.", href: "/despesa/empenhos", onde: "Despesa" },
  { titulo: "Parcerias público-privadas", descricao: "Contratos de PPP e o teto de 5% da RCL (RREO Anexo 13).", href: "/relatorios/rreo/anexo13", onde: "Relatórios" },
  // ⚠️ A LINHA ABAIXO DEIXOU DE SER SÓ TEXTO no ENT03c: a obra ganhou cadastro próprio,
  // com as medições que autorizam a liquidação. O item sem `href` descrevia o que o
  // sistema fazia sem oferecer onde fazê-lo.
  { titulo: "Obras e medições", descricao: "Cadastro de obras da IN/INSS/DC 100/2003 e as medições que autorizam liquidar — quem mede não aprova, e o período de uma não se sobrepõe ao da outra.", href: "/licitacoes/obras" },
];

export default function LicitacoesPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "licitacoes")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
