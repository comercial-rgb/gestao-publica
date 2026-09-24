import { HubLanding, type ItemHub } from "../../../components/ui/HubLanding";
import { AREAS, FOLHA } from "../../../lib/navegacao";

/**
 * Landing da FOLHA (M33, RH bloco 2 — TR 5.12.50 em diante). A folha calcula a partir das TABELAS
 * DO ENTE e das rubricas; o cálculo é um fato numerado com memória por servidor.
 *
 * ⚠️ OS CARDS VÊM DE `lib/navegacao.ts`, E ISSO É O CONSERTO DE UM DEFEITO REAL (V11 V9.1).
 * `navegacao.ts` já se declarava "fonte única da landing e do submenu", e esta tela mantinha uma
 * SEGUNDA lista escrita à mão. As duas divergiram: o submenu levava a encargos, grupos de empenho,
 * designações e eSocial, e a landing — que é por onde o servidor municipal entra — não tinha card
 * para nenhum dos quatro. Quatro telas prontas, invisíveis por um ano de commits.
 *
 * ⚠️ E O COMENTÁRIO QUE ESTAVA AQUI DIZIA O CONTRÁRIO DO QUE A TELA FAZIA: "A LANDING NÃO PROMETE
 * O QUE NÃO EXISTE". A intenção era boa e o efeito era o inverso — ela ESCONDIA o que existia. Uma
 * lista derivada não pode divergir; uma lista copiada sempre diverge.
 *
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */
const ITENS: readonly ItemHub[] = [
  ...FOLHA.map((r): ItemHub => ({ titulo: r.rotulo, descricao: r.descricao, href: r.href })),
  // O único card que NÃO é da área: o cadastro de onde a folha lê vencimento, gratificações,
  // lotação e regime. Ele mora em Pessoal, e o selo diz isso.
  {
    titulo: "Servidores e vínculos",
    descricao:
      "A folha lê o vencimento, as gratificações, a lotação e a situação de cada matrícula do cadastro de pessoal — " +
      "inclusive o regime previdenciário, que decide a tabela.",
    href: "/pessoal/servidores",
    onde: "Pessoal",
  },
];

export default function FolhaPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "folha")!;
  return <HubLanding titulo={area.rotulo} subtitulo={area.descricao} itens={ITENS} />;
}
