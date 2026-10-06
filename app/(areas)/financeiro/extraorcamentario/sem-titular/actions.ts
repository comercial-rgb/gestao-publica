"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { atribuirEntidadeAoMovimento } from "../../../../../lib/portas/movimentos-sem-titular";
import type { TipoDeAtoDeclarado } from "../../../../../lib/portas/entidades-contabeis";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
export interface EstadoDaAtribuicao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** ATRIBUIR a entidade a um movimento extraorçamentário sem titular. Não reescreve o movimento: é fato novo. */
export async function atribuirEntidadeAoMovimentoAction(_prev: EstadoDaAtribuicao, formData: FormData): Promise<EstadoDaAtribuicao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await atribuirEntidadeAoMovimento({
        movimentoId: String(formData.get("movimentoId") ?? "").trim(),
        entidadeId: String(formData.get("entidadeId") ?? "").trim(),
        motivo: String(formData.get("motivo") ?? "").trim(),
        ato: {
          atoTipo: String(formData.get("atoTipo") ?? "") as TipoDeAtoDeclarado,
          atoNumero: String(formData.get("atoNumero") ?? "").trim(),
          atoAno: Number.parseInt(String(formData.get("atoAno") ?? ""), 10),
          atoDispositivo: String(formData.get("atoDispositivo") ?? "").trim(),
          atoCitacao: String(formData.get("atoCitacao") ?? "").trim(),
        },
      });
      revalidatePath("/financeiro/extraorcamentario/sem-titular");
      return { sucesso: "Entidade atribuída. O movimento foi mantido, e a atribuição ficou registrada com o responsável, o motivo e o ato." };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível atribuir a entidade." };
    }
  });
}
