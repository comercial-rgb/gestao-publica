import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS } from "../../../lib/navegacao";

/**
 * Landing da FOLHA (M33, RH bloco 2 — TR 5.12.50 em diante). A folha calcula a partir das TABELAS
 * DO ENTE e das rubricas; o cálculo é um fato numerado com memória por servidor.
 *
 * ⚠️ A LANDING NÃO PROMETE O QUE NÃO EXISTE: 13º, férias, rescisão e o empenho automático da folha
 * ainda não foram construídos (pendências nomeadas no MODULO do M33) — e por isso não têm card.
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */
const ITENS: readonly ItemHub[] = [
  { titulo: "Folhas de pagamento", descricao: "Abrir a competência, calcular, conferir contracheque a contracheque com a memória do cálculo, cancelar um cálculo e fechar. Recalcular é o número seguinte; nada é reescrito.", href: "/folha/folhas" },
  { titulo: "Rubricas", descricao: "Proventos e descontos: de onde o valor vem, se compõe a base da contribuição e do IRRF, e se é proporcional aos dias trabalhados.", href: "/folha/rubricas" },
  { titulo: "Lançamentos", descricao: "Valores informados por matrícula: fixos por vigência (insalubridade, mensalidade) e variáveis por competência (horas extras, adicional noturno).", href: "/folha/lancamentos" },
  { titulo: "Tabelas do ente", descricao: "Contribuição por regime, IRRF e salário-família, vigentes por competência e com a fundamentação legal. Sem tabela vigente, a folha recusa calcular e diz qual falta.", href: "/folha/tabelas" },
  { titulo: "Servidores e vínculos", descricao: "A folha lê o vencimento, as gratificações, a lotação e a situação de cada matrícula do cadastro de pessoal — inclusive o regime previdenciário, que decide a tabela.", href: "/pessoal/servidores", onde: "Pessoal" },
];

export default function FolhaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "folha")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
