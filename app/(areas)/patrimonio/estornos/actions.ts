"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { ehEixo, estornarPorAnalise } from "../../../../lib/portas/recursos/estorno-dados";

export interface EstadoDoEstorno {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ESTORNAR — a única escrita da tela de análise. O serviço do eixo refaz a análise dentro
 * da transação e recusa pelos mesmos bloqueios que a tela mostrou; a recusa sobe como veio.
 * Eixo desconhecido ESTOURA em vez de cair num caminho feliz.
 */
export async function estornarAction(_prev: EstadoDoEstorno, formData: FormData): Promise<EstadoDoEstorno> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const eixo = campos["eixo"] ?? "";
    if (!ehEixo(eixo)) return { erro: `Eixo "${eixo}" não existe. Nada foi gravado.` };
    try {
      const r = await estornarPorAnalise(eixo, campos);
      revalidatePath("/patrimonio/bens-patrimoniais");
      revalidatePath("/patrimonio/competencia");
      revalidatePath(`/patrimonio/estornos/${eixo}/${campos["movimentoId"] ?? ""}`);
      return {
        sucesso:
          r.movimentos === 1
            ? "Estorno registrado: o movimento foi anulado por lançamento novo; o original continua no histórico."
            : `Estorno registrado: ${r.movimentos} movimentos da operação foram anulados juntos; os originais continuam no histórico.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao estornar. Nada foi gravado." };
    }
  });
}
