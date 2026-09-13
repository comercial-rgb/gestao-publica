"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { CARGOS } from "../../../../lib/portas/recursos/pessoal";
import { criarCargo } from "../../../../lib/portas/recursos/pessoal-dados";

/**
 * A SERVER ACTION de cargos — criar.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function cargosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    let mensagem = "";
    try {
      if (acao === "criar") {
        const novoId = await criarCargo(campos);
        mensagem = `Registro criado. Abra em CARGOS.rota/${novoId}.`.replace("CARGOS.rota", CARGOS.rota);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(CARGOS.rota);
    if (id !== "") revalidatePath(`${CARGOS.rota}/${id}`);
    revalidatePath("/pessoal/servidores");
    return { sucesso: mensagem };
  });
}
