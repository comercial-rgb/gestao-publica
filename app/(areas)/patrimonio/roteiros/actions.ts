"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { ROTEIROS_PATRIMONIAIS } from "../../../../lib/portas/recursos/roteiros";
import {
  acaoDoRoteiroPatrimonial,
  criarRoteiroPatrimonial,
} from "../../../../lib/portas/recursos/roteiros-dados";

/**
 * A Server Action do roteiro contábil — despacho FAIL-CLOSED.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Conta inexistente, conta sintética, par que não forma
 * lançamento patrimonial, tipo de estorno e substituição não pedida são decididos dentro da
 * transação do domínio, e a recusa sobe COMO VEIO — inclusive a que diz QUAL par já está
 * vigente, que é a informação de que quem digitou precisa para decidir o passo seguinte.
 */
export async function acaoDeRoteirosPatrimoniaisAction(
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
      await criarRoteiroPatrimonial(campos);
    } else {
      // ⚠️ O `__id` AQUI É O PRÓPRIO TIPO do evento — ver a nota da porta. Sem ele não há
      // sujeito, e a recusa do domínio falaria de um enum vazio em vez de dizer a quem usa
      // a tela o que fazer em seguida.
      if (id === "") return { erro: "Evento não identificado. Nada foi gravado." };
      await acaoDoRoteiroPatrimonial(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(ROTEIROS_PATRIMONIAIS.rota);
  if (id !== "") revalidatePath(`${ROTEIROS_PATRIMONIAIS.rota}/${id}`);
  return {
    sucesso:
      acao === "criar"
        ? "Roteiro parametrizado. O evento já pode ser registrado."
        : "Contas trocadas. Vale para os movimentos futuros deste evento.",
  };
}
