"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { BENS_PATRIMONIAIS } from "../../../../lib/portas/recursos/acervo";
import { acaoDoBem, criarBem } from "../../../../lib/portas/recursos/acervo-dados";

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
  const id = campos["__id"] ?? "";

  try {
    if (acao === "criar") {
      await criarBem(campos);
    } else {
      // ⚠️ SEM `__id` NÃO SE MOVE NADA. Um movimento de gestão sem bem identificado não tem
      // sujeito — e `registrarMovimentoDeGestao` o recusaria, mas a recusa chegaria como erro
      // de domínio sobre um id vazio, que não diz a quem usa a tela o que fazer em seguida.
      if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
      await acaoDoBem(acao, id, campos);
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(BENS_PATRIMONIAIS.rota);
  if (id !== "") revalidatePath(`${BENS_PATRIMONIAIS.rota}/${id}`);
  return { sucesso: acao === "criar" ? "Bem cadastrado no acervo." : "Movimento registrado." };
}
