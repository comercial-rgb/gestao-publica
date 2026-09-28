"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { encerrarExercicioComRestosAPagar } from "../../../../lib/portas/restos-a-pagar";

/**
 * SERVER ACTION DO ENCERRAMENTO DO EXERCÍCIO (V19).
 *
 * ⚠️ A CONFIRMAÇÃO DIGITADA É CONFERIDA AQUI, no servidor, e não só no formulário: campo de
 * formulário não confere nada — o `CLAUDE.md` diz isso no invariante 7, e vale para a confirmação
 * como vale para a autorização. Alguém que chame a ação direto, sem passar pela tela, encontra a
 * mesma exigência.
 */

export interface EstadoDoEncerramento {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function encerrarExercicioAction(
  _prev: EstadoDoEncerramento,
  formData: FormData
): Promise<EstadoDoEncerramento> {
  return comComandoDoFormulario(formData, async () => {
    const ano = Number.parseInt(String(formData.get("ano") ?? ""), 10);
    const confirmacao = String(formData.get("confirmacao") ?? "").trim();
    if (Number.isNaN(ano)) return { erro: "Exercício inválido." };
    if (confirmacao !== String(ano)) {
      return {
        erro:
          `A confirmação não corresponde ao exercício. Para encerrar ${String(ano)}, digite ` +
          `${String(ano)} no campo de confirmação. Nada foi gravado.`,
      };
    }

    try {
      const msg = await encerrarExercicioComRestosAPagar({ ano });
      revalidatePath("/despesa/restos-a-pagar");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível encerrar o exercício.") };
    }
  });
}
