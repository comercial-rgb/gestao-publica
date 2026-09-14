import { ELEGIVEL, naoAplicavel, preCondicao, type Elegibilidade } from "../../packages/contracts/index.js";

/**
 * ═══ M11 — QUAIS ATOS CABEM NO DOCUMENTO FISCAL E NA ORDEM, AGORA (V6.2 U0) ═══
 *
 * Predicados PUROS. O caso de uso monta o retrato dentro da transação e chama `exigirElegivel`; a
 * porta monta o mesmo retrato para a tela e projeta a barra. Ver `packages/contracts/elegibilidade.ts`.
 *
 * ⚠️ AS FRASES QUE OS TESTES JÁ PRENDIAM CONTINUAM NA MENSAGEM — "já lastreia", "o material JÁ
 * ENTROU", "já está ESTORNADA". Mudar o predicado de lugar não pode mudar o que o operador lê.
 */

// ═══ DOCUMENTO FISCAL ═══════════════════════════════════════════════════════════

export interface EstadoDoDocumentoParaAtos {
  readonly rotulo: string; // "123/1"
  readonly movimentos: readonly ("CONFERENCIA" | "CANCELAMENTO" | "SUBSTITUICAO" | string)[];
  /** Emitente coincide com o fornecedor da ordem (ou não há ordem). */
  readonly emitenteConfereComOrdem: boolean;
  readonly ordemNumero: string | null;
  readonly recebimentos: number;
  readonly liquidacoesVivas: number;
}

const encerrado = (e: EstadoDoDocumentoParaAtos): boolean => e.movimentos.some((m) => m === "CANCELAMENTO" || m === "SUBSTITUICAO");

export function elegibilidadeParaConferirDocumento(e: EstadoDoDocumentoParaAtos): Elegibilidade {
  if (encerrado(e)) return naoAplicavel("DOCUMENTO-ENCERRADO", `Documento ${e.rotulo} cancelado ou substituído não se confere.`);
  if (e.movimentos.includes("CONFERENCIA")) return naoAplicavel("DOCUMENTO-JA-CONFERIDO", `Documento ${e.rotulo} já foi conferido.`);
  if (!e.emitenteConfereComOrdem) {
    return preCondicao("EMITENTE-DIFERENTE-DO-FORNECEDOR", `O emitente deixou de coincidir com o fornecedor da ordem ${e.ordemNumero ?? ""}.`, "Corrija o vínculo do documento ou registre o documento certo.");
  }
  return ELEGIVEL;
}

export function elegibilidadeParaCancelarDocumento(e: EstadoDoDocumentoParaAtos): Elegibilidade {
  if (encerrado(e)) return naoAplicavel("DOCUMENTO-ENCERRADO", `Documento ${e.rotulo} já foi cancelado ou substituído.`);
  if (e.recebimentos > 0) {
    return preCondicao("DOCUMENTO-COM-RECEBIMENTO", `O documento ${e.rotulo} já lastreia ${e.recebimentos} recebimento(s).`, "Estorne os recebimentos primeiro.");
  }
  if (e.liquidacoesVivas > 0) {
    return preCondicao("DOCUMENTO-COM-LIQUIDACAO", `A parcela do documento ${e.rotulo} já foi utilizada em ${e.liquidacoesVivas} liquidação(ões).`, "Anule a liquidação primeiro.");
  }
  return ELEGIVEL;
}

// ═══ ORDEM DE COMPRA ════════════════════════════════════════════════════════════

export interface EstadoDaOrdemParaAtos {
  readonly numero: string;
  readonly estornada: boolean;
  readonly recebimentos: number;
  readonly empenhosVivos: readonly string[];
  /** Itens com saldo a receber. Nulo quando não se leu. */
  readonly itensPendentes: number | null;
}

export function elegibilidadeParaEstornarOrdem(e: EstadoDaOrdemParaAtos): Elegibilidade {
  if (e.estornada) return naoAplicavel("ORDEM-JA-ESTORNADA", `A ordem ${e.numero} já está ESTORNADA.`);
  if (e.recebimentos > 0) {
    return preCondicao(
      "ORDEM-COM-RECEBIMENTO",
      `A ordem ${e.numero} tem ${e.recebimentos} recebimento(s) — o material JÁ ENTROU; desfazê-la deixaria a prateleira com material que documento nenhum explica.`,
      "Estorne os recebimentos primeiro."
    );
  }
  if (e.empenhosVivos.length > 0) {
    return preCondicao("ORDEM-EMPENHADA", `A ordem ${e.numero} está empenhada (${e.empenhosVivos.join(", ")}); ordem empenhada só se estorna pelo estorno do empenho.`, "Estorne o empenho.");
  }
  return ELEGIVEL;
}

export function elegibilidadeParaReceberOrdem(e: EstadoDaOrdemParaAtos): Elegibilidade {
  if (e.estornada) return naoAplicavel("ORDEM-ESTORNADA", `A ordem ${e.numero} está ESTORNADA: não há o que receber por ela.`);
  if (e.itensPendentes === 0) return naoAplicavel("ORDEM-SEM-PENDENCIA", `Nada pendente de recebimento na ordem ${e.numero}.`);
  return ELEGIVEL;
}

export function elegibilidadeParaEmpenharOrdem(e: EstadoDaOrdemParaAtos): Elegibilidade {
  if (e.estornada) return naoAplicavel("ORDEM-ESTORNADA", `A ordem ${e.numero} está ESTORNADA: compra desfeita não se empenha.`);
  return ELEGIVEL;
}
