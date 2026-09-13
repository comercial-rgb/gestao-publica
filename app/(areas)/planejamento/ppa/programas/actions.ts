"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { PROGRAMAS_DO_PPA } from "../../../../../lib/portas/recursos/plurianual";
import { acaoDoProgramaDoPpa } from "../../../../../lib/portas/recursos/plurianual-dados";

/**
 * A SERVER ACTION DO PROGRAMA NO PLANO — só as ações do detalhe (indicador, ação do plano); não há criar aqui.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function programasdoppaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDoProgramaDoPpa(acao, id, campos);
      }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(PROGRAMAS_DO_PPA.rota);
    if (id !== "") revalidatePath(`${PROGRAMAS_DO_PPA.rota}/${id}`);
    return { sucesso: acao === "criar" ? "" : "Registrado no programa." };
  });
}
