import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing de LICITAÇÕES E CONTRATOS — processos, contratos, aditivos e obras. Aponta para onde o
 * dado da contratação já repercute hoje. ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

const ITENS: readonly ItemHub[] = [
  { titulo: "Processos licitatórios", descricao: "Cadastro do processo de contratação, com número, modalidade, objeto e valor licitado. No detalhe, homologação, reserva de dotação e cadastro do contrato.", href: "/licitacoes/processos" },
  { titulo: "Contratos e aditivos", descricao: "Valor atualizado e fim da vigência conforme os aditivos de acréscimo, supressão e prorrogação, com os empenhos vinculados ao contrato.", href: "/licitacoes/contratos" },
  { titulo: "Solicitações de compra", descricao: "Requisições ao setor de compras, com setor, justificativa, solicitante e itens. Autorização e anulação registram data, motivo e responsável.", href: "/licitacoes/solicitacoes" },
  { titulo: "Pesquisas de preços", descricao: "Cotações por fornecedor para cada item, com preço médio, mínimo e máximo.", href: "/licitacoes/pesquisas-de-precos" },
  { titulo: "Ordens de compra", descricao: "Ordens ordinárias, globais ou por estimativa, vinculadas a processo ou dispensa, com recebimento por item e saldo a receber.", href: "/licitacoes/ordens-de-compra" },
  { titulo: "Documentos fiscais recebidos", descricao: "Notas fiscais dos fornecedores, com itens, conferência e importação de XML. O registro não gera entrada em estoque nem liquidação.", href: "/licitacoes/documentos-fiscais" },
  { titulo: "Empenhos e modalidade", descricao: "Cada empenho informa a modalidade de licitação e o processo de origem da contratação.", href: "/despesa/empenhos", onde: "Despesa" },
  { titulo: "Parcerias público-privadas", descricao: "Contratos de PPP e o teto de 5% da RCL (RREO Anexo 13).", href: "/relatorios/rreo/anexo13", onde: "Relatórios" },
  // ⚠️ A LINHA ABAIXO DEIXOU DE SER SÓ TEXTO no ENT03c: a obra ganhou cadastro próprio,
  // com as medições que autorizam a liquidação. O item sem `href` descrevia o que o
  // sistema fazia sem oferecer onde fazê-lo.
  { titulo: "Obras e medições", descricao: "Cadastro de obras (IN/INSS/DC 100/2003) e medições que autorizam a liquidação. Quem mede não aprova, e os períodos de medição não se sobrepõem.", href: "/licitacoes/obras" },
  { titulo: "Parcerias público-privadas", descricao: "Contratos de PPP (Lei 11.079/2004): tipo, empresa parceira, situação, parcelas por exercício, documentos e os empenhos vinculados.", href: "/licitacoes/ppp" },
];

export default function LicitacoesPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "licitacoes")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
