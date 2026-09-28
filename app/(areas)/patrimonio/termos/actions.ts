"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { TERMOS_PATRIMONIAIS } from "../../../../lib/portas/recursos/termos";
import { criarTermo } from "../../../../lib/portas/recursos/termos-dados";

/**
 * A Server Action dos termos — só "criar" (o termo é imutável). A resolução dos tombamentos
 * e a recusa do domínio sobem COMO VIERAM; `__acao` desconhecida ESTOURA.
 */
export async function acaoDeTermosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    if (acao !== "criar") return { erro: `Ação "${acao}" não existe neste cadastro. Nada foi gravado.` };
    try {
      await criarTermo(campos);
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao emitir o termo. Nada foi gravado." };
    }
    revalidatePath(TERMOS_PATRIMONIAIS.rota);
    revalidatePath("/patrimonio/bens-patrimoniais");
    return { sucesso: "Termo emitido. A movimentação de cada bem foi registrada, e o PDF está disponível no detalhe do termo." };
  });
}
