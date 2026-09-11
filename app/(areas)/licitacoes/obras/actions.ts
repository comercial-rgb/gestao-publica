"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { OBRAS } from "../../../../lib/portas/recursos/definicoes";
import { acaoDaObra, criarObra } from "../../../../lib/portas/recursos/dados";

/**
 * A SERVER ACTION DE OBRAS — uma só, e ela despacha pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO. Parafraseá-la
 * criaria uma segunda explicação para a mesma recusa, e as duas divergiriam no dia em que
 * o guard aprendesse um caso novo.
 *
 * ⚠️ O DESPACHO É FAIL-CLOSED: `__acao` desconhecido ESTOURA, em vez de cair num caminho
 * feliz que diria "salvo" sem ter gravado nada.
 */
export async function acaoDeObraAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  const acao = campos["__acao"] ?? "";
  const id = campos["__id"] ?? "";

  try {
    if (acao === "criar") {
      await criarObra(campos);
    } else {
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDaObra(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(OBRAS.rota);
  if (id !== "") revalidatePath(`${OBRAS.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Obra cadastrada." : "Registro gravado." };
}
