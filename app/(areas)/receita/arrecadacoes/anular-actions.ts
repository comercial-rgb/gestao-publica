"use server";

import { revalidatePath } from "next/cache";
import { anularReceita } from "../../../../lib/portas/anulacao";
import { meioDiaCivil } from "../../../../packages/datas/index";

export interface EstadoAnulacaoReceita {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — anula uma arrecadação (TR 4.61) e revalida a lista.
 *
 * ⚠️ TOTAL apenas — o serviço do M04 não tem parcial. O `numero` é o da GUIA DE ANULAÇÃO (um
 * documento próprio, não o da guia original). A cascata (dívida ativa, operação de crédito) é do
 * domínio; a mensagem dele sobe como veio.
 */
export async function anularReceitaAction(
  _prev: EstadoAnulacaoReceita,
  formData: FormData
): Promise<EstadoAnulacaoReceita> {
  const receitaId = String(formData.get("receitaId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();

  if (numero === "") return { erro: "O número da guia de anulação é obrigatório." };
  if (dataBruta === "") return { erro: "A data da anulação é obrigatória." };

  try {
    await anularReceita({
      receitaId,
      numeroReceita: numero,
      data: meioDiaCivil(dataBruta),
    });
    revalidatePath("/receita/arrecadacoes");
    return { sucesso: `Anulação ${numero} registrada.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível anular a arrecadação." };
  }
}
