"use server";

import { revalidatePath } from "next/cache";
import {
  autorizarOrdem,
  cancelarOrdem,
  prepararOrdem,
} from "../../../../lib/portas/ordem-pagamento";
import { desmascararValor } from "../../../../lib/format/mascaras";

export interface EstadoDaOrdem {
  readonly erro?: string;
  readonly sucesso?: string;
}

function revalidar(): void {
  revalidatePath("/despesa/ordens");
  revalidatePath("/despesa/pagamentos");
}

/**
 * ETAPA 1a — PREPARAR.
 *
 * ⚠️ NENHUM GUARD DE NEGÓCIO AQUI. Teto da liquidação, ordens já vivas, fonte da conta —
 * tudo do domínio, dentro da transação, contra o saldo real. Uma conferência nesta camada
 * estaria olhando um número que já envelheceu quando a gravação acontece.
 */
export async function prepararOrdemAction(
  _prev: EstadoDaOrdem,
  formData: FormData
): Promise<EstadoDaOrdem> {
  const liquidacaoId = String(formData.get("liquidacaoId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const valor = desmascararValor(String(formData.get("valor") ?? ""));
  const dataBruta = String(formData.get("dataPrevista") ?? "").trim();
  const contaBancaria = String(formData.get("contaBancaria") ?? "").trim();
  const fonteId = String(formData.get("fonteId") ?? "").trim();
  const historico = String(formData.get("historico") ?? "").trim();

  if (liquidacaoId === "") return { erro: "Escolha a liquidação a pagar." };
  if (dataBruta === "") return { erro: "A data prevista é obrigatória." };
  if (contaBancaria === "" || fonteId === "") {
    return { erro: "Escolha a conta bancária de onde o dinheiro deve sair." };
  }

  try {
    await prepararOrdem({
      liquidacaoId,
      numero,
      valor,
      // `T12:00:00Z` — a data é um DIA; o fuso não a empurra para trás.
      dataPrevista: new Date(`${dataBruta}T12:00:00Z`),
      contaBancaria,
      fonteId,
      historico,
    });
    revalidar();
    return { sucesso: `Ordem ${numero} preparada. Falta autorizar.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível preparar a ordem." };
  }
}

/** ETAPA 1b — AUTORIZAR. Quem preparou não autoriza: a recusa vem do domínio. */
export async function autorizarOrdemAction(
  _prev: EstadoDaOrdem,
  formData: FormData
): Promise<EstadoDaOrdem> {
  const ordemId = String(formData.get("ordemId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (ordemId === "") return { erro: "Ordem não identificada." };

  try {
    await autorizarOrdem({ ordemId, ...(motivo !== "" ? { motivo } : {}) });
    revalidar();
    return { sucesso: "Ordem autorizada." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível autorizar." };
  }
}

/** ETAPA 1c — CANCELAR. O domínio cobra 10 caracteres de motivo. */
export async function cancelarOrdemAction(
  _prev: EstadoDaOrdem,
  formData: FormData
): Promise<EstadoDaOrdem> {
  const ordemId = String(formData.get("ordemId") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (ordemId === "") return { erro: "Ordem não identificada." };

  try {
    await cancelarOrdem({ ordemId, motivo });
    revalidar();
    return { sucesso: "Ordem cancelada." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível cancelar." };
  }
}
