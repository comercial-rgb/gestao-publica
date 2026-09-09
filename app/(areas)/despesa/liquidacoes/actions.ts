"use server";

import { revalidatePath } from "next/cache";
import { registrarLiquidacao } from "../../../../lib/portas/liquidacao";

export interface EstadoLiquidacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — liquida e revalida a lista.
 *
 * ⚠️ O ERRO DO DOMÍNIO SOBE INTEIRO. Se o empenho é de um elemento sem regra de roteiro
 * (fora de {30, 39, 71}), a mensagem que aparece é a do M01 — nomeando o elemento e a
 * pendência MAPA-ELEMENTO-CONTA. A tela NÃO esconde nem contorna: "não foi possível
 * liquidar" mandaria o usuário abrir um chamado para descobrir o que o sistema já sabe.
 *
 * ⚠️ A DATA VEM DO FORM: é a data do FATO (o recebimento atestado), e é ela que ordena
 * a fila do art. 141. Um `now()` implícito reordenaria a fila.
 */
export async function liquidarAction(
  _prev: EstadoLiquidacao,
  formData: FormData
): Promise<EstadoLiquidacao> {
  const empenhoId = String(formData.get("empenhoId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const valor = String(formData.get("valor") ?? "").trim();
  const responsavelAtesto = String(formData.get("atesto") ?? "").trim();
  const historico = String(formData.get("historico") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();

  if (empenhoId === "") return { erro: "Escolha o empenho a liquidar." };
  if (dataBruta === "") return { erro: "A data da liquidação é obrigatória." };

  try {
    await registrarLiquidacao({
      empenhoId,
      numero,
      valor,
      data: new Date(`${dataBruta}T12:00:00Z`),
      responsavelAtesto,
      historico,
    });
    revalidatePath("/despesa/liquidacoes");
    // A fila do art. 141 nasce da liquidação — a tela dela também muda.
    revalidatePath("/despesa/pagamentos");
    revalidatePath("/despesa/empenhos");
    return { sucesso: `Liquidação ${numero} registrada.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível liquidar." };
  }
}
