"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { FICHAS } from "../../../../lib/portas/recursos/fichas";
import { criarFichaPelaTela } from "../../../../lib/portas/recursos/fichas-dados";

/**
 * A SERVER ACTION da ficha — criar, e só criar.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do M02 sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function fichasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    try {
      if (acao !== "criar") throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
      await criarFichaPelaTela(campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(FICHAS.rota);
    revalidatePath("/planejamento/qdd");
    return { sucesso: `Ficha ${campos["numero"] ?? ""}/${campos["exercicio"] ?? ""} criada, ainda sem dotação. A dotação é incluída por crédito adicional.` };
  });
}
