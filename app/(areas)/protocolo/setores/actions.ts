"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { SETORES } from "../../../../lib/portas/recursos/setores";
import { cadastrarSetorDoMolde } from "../../../../lib/portas/recursos/setores-dados";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * V37 — A Server Action do cadastro de setores. Só cria: o despacho é fail-closed, e um `__acao` desconhecido é
 * recusado em vez de cair num caminho que diria "salvo". A mensagem do domínio sobe como veio.
 */
export async function acaoDeSetoresAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    if ((campos["__acao"] ?? "") !== "criar") return { erro: "Ação inexistente neste cadastro. Nada foi gravado." };
    try {
      await cadastrarSetorDoMolde(campos);
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(SETORES.rota);
    return { sucesso: "Setor cadastrado." };
  });
}
