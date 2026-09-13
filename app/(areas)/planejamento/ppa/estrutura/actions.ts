"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { ESTRUTURA_DO_PPA } from "../../../../../lib/portas/recursos/plurianual";
import { criarEstrutura } from "../../../../../lib/portas/recursos/plurianual-dados";

/**
 * A SERVER ACTION DA ESTRUTURA TEMÁTICA — só criar; o tipo do formulário escolhe a tabela.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function estruturadoppaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarEstrutura(campos);
      } else {
        return { erro: `Ação "${acao}" não existe neste cadastro. Nada foi gravado.` };
      }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(ESTRUTURA_DO_PPA.rota);
    if (id !== "") revalidatePath(`${ESTRUTURA_DO_PPA.rota}/${id}`);
    return { sucesso: acao === "criar" ? "Item da estrutura cadastrado." : "" };
  });
}
