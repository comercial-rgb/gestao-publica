"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { atribuirEntidade } from "../../../../lib/portas/arrecadacao";
import type { TipoDeAtoDeclarado } from "../../../../lib/portas/entidades-contabeis";

export interface EstadoDaAtribuicao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ATRIBUIR a entidade a uma guia do legado.
 *
 * ⚠️ ISTO NÃO REESCREVE A GUIA. A atribuição é um FATO NOVO, com autor, motivo e ato — e a
 * mensagem de sucesso diz isso, porque quem clica supõe o contrário.
 */
export async function atribuirEntidadeAction(
  _prev: EstadoDaAtribuicao,
  formData: FormData
): Promise<EstadoDaAtribuicao> {
  return comComandoDoFormulario(formData, async () => {
    const receitaArrecadadaId = String(formData.get("receitaArrecadadaId") ?? "").trim();
    const entidadeId = String(formData.get("entidadeId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();

    try {
      await atribuirEntidade({
        receitaArrecadadaId,
        entidadeId,
        motivo,
        ato: {
          atoTipo: String(formData.get("atoTipo") ?? "") as TipoDeAtoDeclarado,
          atoNumero: String(formData.get("atoNumero") ?? "").trim(),
          atoAno: Number.parseInt(String(formData.get("atoAno") ?? ""), 10),
          atoDispositivo: String(formData.get("atoDispositivo") ?? "").trim(),
          atoCitacao: String(formData.get("atoCitacao") ?? "").trim(),
        },
      });
      revalidatePath("/receita/por-entidade");
      return {
        sucesso:
          "Entidade atribuída. A guia foi mantida, e a atribuição ficou registrada com o responsável, o motivo e o ato.",
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível atribuir a entidade." };
    }
  });
}
