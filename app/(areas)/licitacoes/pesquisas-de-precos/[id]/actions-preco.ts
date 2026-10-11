"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { fixarPrecoPelaTela } from "../../../../../lib/portas/preco-estimado";

/** V39-R3 (R3-020) — fixar o preço estimado. Nenhuma regra aqui: o serviço confere origem, mínimo e motivo. */
export interface EstadoDoPreco {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function fixarPrecoAction(_p: EstadoDoPreco, f: FormData): Promise<EstadoDoPreco> {
  return comComandoDoFormulario(f, async () => {
    const metodo = String(f.get("metodo") ?? "");
    if (metodo !== "MEDIA" && metodo !== "MEDIANA" && metodo !== "MENOR") return { erro: "Escolha o método. Nada foi gravado." };
    const descartes = f.getAll("descartar").map((v) => String(v)).map((cotacaoId) => ({ cotacaoId, motivo: String(f.get(`motivo.${cotacaoId}`) ?? "").trim() }));
    const justificativa = String(f.get("justificativaMenosPrecos") ?? "").trim();
    try {
      const sucesso = await fixarPrecoPelaTela({ itemId: String(f.get("itemId") ?? ""), metodo, descartes, ...(justificativa === "" ? {} : { justificativaMenosPrecos: justificativa }) });
      revalidatePath("/licitacoes/pesquisas-de-precos");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível fixar o preço estimado. Nada foi gravado.") };
    }
  });
}
