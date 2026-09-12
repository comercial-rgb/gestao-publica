"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { ROTEIROS_DE_RESULTADO } from "../../../../lib/portas/recursos/roteiros";
import {
  acaoDoRoteiroDeResultado,
  criarRoteiroDeResultado,
} from "../../../../lib/portas/recursos/roteiros-dados";

/**
 * A Server Action do roteiro do resultado da alienação — despacho FAIL-CLOSED.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: as recusas do domínio sobem como vieram.
 */
export async function acaoDeRoteirosDeResultadoAction(
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
      await criarRoteiroDeResultado(campos);
    } else {
      if (id === "") return { erro: "Resultado não identificado. Nada foi gravado." };
      await acaoDoRoteiroDeResultado(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(ROTEIROS_DE_RESULTADO.rota);
  if (id !== "") revalidatePath(`${ROTEIROS_DE_RESULTADO.rota}/${id}`);
  return {
    sucesso:
      acao === "criar"
        ? "Roteiro parametrizado. A alienação já pode apurar este resultado."
        : "Contas trocadas. Vale para as alienações futuras.",
  };
}
