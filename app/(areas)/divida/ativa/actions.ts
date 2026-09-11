"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { DIVIDA_ATIVA } from "../../../../lib/portas/recursos/definicoes";
import { acaoDaDividaAtiva, criarDividaAtiva } from "../../../../lib/portas/recursos/dados";

/**
 * A SERVER ACTION DE DÍVIDA ATIVA — uma só, e ela despacha pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO. Parafraseá-la
 * criaria uma segunda explicação para a mesma recusa, e as duas divergiriam no dia em que
 * o guard aprendesse um caso novo.
 *
 * ⚠️ O DESPACHO É FAIL-CLOSED: `__acao` desconhecido ESTOURA, em vez de cair num caminho
 * feliz que diria "salvo" sem ter gravado nada.
 */
export async function acaoDeDividaAtivaAction(
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
      await criarDividaAtiva(campos);
    } else {
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDaDividaAtiva(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(DIVIDA_ATIVA.rota);
  if (id !== "") revalidatePath(`${DIVIDA_ATIVA.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Dívida ativa cadastrada." : "Registro gravado." };
}
