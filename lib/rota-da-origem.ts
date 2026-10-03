/**
 * DE ONDE VEIO ESTE LANÇAMENTO — o mapa `origemTipo → tela`, movido da página de lançamentos (V31) para
 * servir também ao detalhe do lançamento. Um mapa só: duas cópias divergiriam no primeiro tipo novo.
 */
/**
 * O MAPA `origemTipo → rota` — o drill até o DOCUMENTO que gerou o lançamento.
 *
 * ⚠️ PARCIAL DE PROPÓSITO. Só entra aqui a espécie cuja tela EXISTE. O que não está mapeado
 * aparece como texto (tipo + id), sem link: uma origem sem destino é informação honesta; um link
 * quebrado é uma promessa falsa a quem está auditando.
 *
 * ⚠️ AS VARIANTES DO MESMO DOCUMENTO APONTAM PARA A MESMA TELA. "EMPENHO", "EMPENHO_ANULADO" e
 * "ANULACAO_PARCIAL_EMPENHO" são atos DIFERENTES sobre o MESMO empenho — e o `origemId` de todos
 * é o id do empenho. Levar os três para `/despesa/empenhos` é o comportamento certo: o auditor
 * quer a NE, não o ato.
 */
/** A Nota de Empenho do empenho de `origemId`, no exercício do recorte da tela. */
export function neDoEmpenho(origemId: string, exercicio: number): string {
  return `/despesa/empenhos/ne?id=${encodeURIComponent(origemId)}&exercicio=${exercicio}`;
}

export interface DestinoDoDrill {
  readonly rota: string;
  readonly documento: string;
  /**
   * O DOCUMENTO EM SI, quando ele existe como emissão própria — recebe o `origemId` e o exercício
   * e devolve a URL da rota que o imprime. Quando presente, o drill leva ao PAPEL; quando ausente,
   * leva à lista onde o documento pode ser localizado.
   */
  readonly emissao?: (origemId: string, exercicio: number) => string;
}

export const ROTA_DA_ORIGEM: Readonly<Record<string, DestinoDoDrill>> = {
  // ── Despesa: a NOTA DE EMPENHO e sua cadeia (o caminho do roteiro de demonstração). ──
  // ⚠️ AQUI O DRILL CHEGA AO DOCUMENTO, não à lista: `/despesa/empenhos/ne?id=` já emite a Nota de
  // Empenho em PDF, e o `origemId` destas cinco espécies É o id do empenho. Um auditor que sai do
  // lançamento quer a NE na mão — mandá-lo à lista para procurar a linha certa seria devolver-lhe
  // o trabalho que o sistema pode fazer. O exercício vai junto porque a rota o exige no recorte.
  EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  EMPENHO_DE_RESERVA: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  EMPENHO_ANULADO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  ANULACAO_PARCIAL_EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  ESTORNO_ANULACAO_PARCIAL_EMPENHO: { rota: "/despesa/empenhos", documento: "Nota de Empenho", emissao: neDoEmpenho },
  LIQUIDACAO: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  LIQUIDACAO_ANULADA: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  ANULACAO_PARCIAL_LIQUIDACAO: { rota: "/despesa/liquidacoes", documento: "Liquidação" },
  PAGAMENTO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  PAGAMENTO_ANULADO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  ANULACAO_PARCIAL_PAGAMENTO: { rota: "/despesa/pagamentos", documento: "Ordem de Pagamento" },
  // ── Receita ──
  ARRECADACAO: { rota: "/receita/arrecadacoes", documento: "Arrecadação" },
  ANULACAO_RECEITA: { rota: "/receita/arrecadacoes", documento: "Arrecadação" },
  // ── Planejamento / créditos ──
  CREDITO_ADICIONAL: { rota: "/planejamento/creditos-adicionais", documento: "Decreto de crédito" },
  CREDITO_ANULADO: { rota: "/planejamento/creditos-adicionais", documento: "Decreto de crédito" },
  LOA: { rota: "/planejamento/qdd", documento: "Dotação inicial (LOA)" },
};
