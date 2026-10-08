"use server";

import { lerExtrasDoEmpenhoParaLiquidar, type ExtrasDoEmpenhoParaLiquidar } from "../../../../lib/portas/liquidar-empenho";

/**
 * AS LEITURAS DO FORMULÁRIO DA LIQUIDAÇÃO, em arquivo próprio: nenhuma grava, então nenhuma passa pelo envelope de
 * escrita autenticada (a chave de comando). Quem autoriza é a porta (leitura da despesa na unidade do empenho); se a
 * consulta falhar, a tela DIZ que não consultou ("indisponivel") — silêncio pareceria "sem débito".
 */

/** V37 — o aviso de débito do credor e os subempenhos do empenho escolhido. */
export async function extrasDoEmpenhoAction(empenhoId: string): Promise<ExtrasDoEmpenhoParaLiquidar | "indisponivel" | null> {
  try {
    return await lerExtrasDoEmpenhoParaLiquidar(empenhoId);
  } catch {
    return "indisponivel";
  }
}
