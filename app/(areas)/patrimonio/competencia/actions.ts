"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { processarCompetencia } from "../../../../lib/portas/recursos/competencia-dados";
import { rotuloDoTipoPatrimonial } from "../../../../lib/portas/recursos/roteiros";

export interface EstadoDaCompetencia {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * PROCESSAR A COMPETÊNCIA — a única escrita desta tela. A prévia é GET; isto é POST, com a
 * chave de comando (replay idempotente) e o crachá `ATUALIZAR_COMPETENCIA_PATRIMONIAL`
 * cobrado na porta. A recusa do domínio sobe como veio.
 */
export async function processarCompetenciaAction(
  _prev: EstadoDaCompetencia,
  formData: FormData
): Promise<EstadoDaCompetencia> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    try {
      const r = await processarCompetencia(campos);
      revalidatePath("/patrimonio/competencia");
      return {
        sucesso:
          `Competência ${campos["competencia"] ?? ""} processada: ${rotuloDoTipoPatrimonial(r.tipo)} de ` +
          `${r.valorDaParcela.toFixed(2)} lançada no razão. A memória de cálculo ficou gravada com o movimento.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao processar. Nada foi gravado." };
    }
  });
}
