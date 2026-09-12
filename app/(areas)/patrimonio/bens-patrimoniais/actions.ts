"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { BENS_PATRIMONIAIS } from "../../../../lib/portas/recursos/acervo";
import { criarBem } from "../../../../lib/portas/recursos/acervo-dados";

/**
 * A Server Action deste cadastro — despacho FAIL-CLOSED.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Classe inexistente ou desativada, tipo de incorporação
 * inexistente e tombamento repetido são decididos dentro da transação do domínio, e a recusa
 * sobe COMO VEIO — inclusive a que diz QUAL tombamento já existe, que é a informação de que
 * quem digitou precisa para seguir.
 */
export async function acaoDeBensPatrimoniaisAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  const acao = campos["__acao"] ?? "";

  try {
    if (acao !== "criar") {
      return { erro: `Ação "${acao}" não existe neste cadastro. Nada foi gravado.` };
    }
    await criarBem(campos);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(BENS_PATRIMONIAIS.rota);
  return { sucesso: "Bem cadastrado no acervo." };
}
