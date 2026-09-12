"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { CLASSES_DE_BENS } from "../../../../lib/portas/recursos/acervo";
import { criarClasseDeBens } from "../../../../lib/portas/recursos/acervo-dados";

/**
 * A Server Action deste cadastro — despacho FAIL-CLOSED: ação desconhecida é recusada
 * nomeando, em vez de cair num caminho feliz que diria "salvo" sem ter gravado nada.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A conferência da conta — analítica, e da classe do ativo —
 * é decidida dentro da transação do domínio, e a recusa sobe COMO VEIO. Parafrasear aqui
 * criaria uma segunda explicação para a mesma recusa, e as duas divergiriam no dia em que o
 * serviço aprendesse um caso novo.
 */
export async function acaoDeClassesDeBensAction(
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
    await criarClasseDeBens(campos);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(CLASSES_DE_BENS.rota);
  return { sucesso: "Classe de bens cadastrada." };
}
