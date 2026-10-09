"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { ROTEIROS_DO_ALMOXARIFADO } from "../../../../../lib/portas/recursos/roteiros";
import { criarRoteiroDoAlmoxarifado } from "../../../../../lib/portas/recursos/roteiros-dados";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";

/**
 * V37 — A Server Action do roteiro do almoxarifado. Só cria: o despacho é fail-closed, e as recusas do domínio
 * (movimento sem roteiro próprio, roteiro já existente, conta sintética, mesma conta, motor) sobem como vieram.
 */
export async function acaoDeRoteirosDoAlmoxarifadoAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    if ((campos["__acao"] ?? "") !== "criar") return { erro: "Ação inexistente neste cadastro. Nada foi gravado." };
    try {
      await criarRoteiroDoAlmoxarifado(campos);
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(ROTEIROS_DO_ALMOXARIFADO.rota);
    return { sucesso: "Roteiro contábil cadastrado. O movimento já pode ser registrado no almoxarifado." };
  });
}
