"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  classificarConta,
  encerrarControlesDoAno,
  estornarEncerramentoDeControles,
} from "../../../../lib/portas/virada-dos-controles";

/**
 * SERVER ACTIONS DA VIRADA DOS CONTROLES (V20).
 *
 * ⚠️ A CONFIRMAÇÃO DIGITADA DO ANO É CONFERIDA AQUI, no servidor, e não só no formulário — a mesma
 * regra do encerramento do exercício: campo de formulário não confere nada. Quem chame a ação direto
 * encontra a mesma exigência.
 */

export interface EstadoDaVirada {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function classificarContaAction(
  _prev: EstadoDaVirada,
  formData: FormData
): Promise<EstadoDaVirada> {
  return comComandoDoFormulario(formData, async () => {
    const contaCodigo = String(formData.get("contaCodigo") ?? "").trim();
    const destinoBruto = String(formData.get("destino") ?? "").trim();
    const justificativa = String(formData.get("justificativa") ?? "").trim();

    if (contaCodigo === "") return { erro: "Escolha a conta de controle a classificar." };
    if (destinoBruto !== "ENCERRA" && destinoBruto !== "TRANSFERE") {
      return {
        erro:
          "Escolha o destino da conta na virada: ENCERRA (o saldo morre em 31 de dezembro) ou " +
          "TRANSFERE (o saldo atravessa para o exercício seguinte).",
      };
    }

    try {
      const r = await classificarConta({
        contaCodigo,
        destino: destinoBruto,
        justificativa,
      });
      revalidatePath("/contabilidade/virada-dos-controles");
      return {
        sucesso:
          `Conta ${r.codigo} ${r.reclassificada ? "reclassificada" : "classificada"} como ` +
          `${destinoBruto === "ENCERRA" ? "ENCERRA" : "TRANSFERE"}. ` +
          (r.reclassificada
            ? "A troca vale para a próxima virada: um encerramento já feito não muda por causa dela — para desfazê-lo, estorne-o."
            : "A decisão fica gravada com a justificativa e o autor."),
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível classificar a conta.") };
    }
  });
}

export async function encerrarControlesAction(
  _prev: EstadoDaVirada,
  formData: FormData
): Promise<EstadoDaVirada> {
  return comComandoDoFormulario(formData, async () => {
    const ano = Number.parseInt(String(formData.get("ano") ?? ""), 10);
    const confirmacao = String(formData.get("confirmacao") ?? "").trim();
    if (Number.isNaN(ano)) return { erro: "Exercício inválido." };
    if (confirmacao !== String(ano)) {
      return {
        erro:
          `A confirmação não corresponde ao exercício. Para encerrar os controles de ` +
          `${String(ano)}, digite ${String(ano)} no campo de confirmação. Nada foi gravado.`,
      };
    }

    try {
      const msg = await encerrarControlesDoAno({ ano });
      revalidatePath("/contabilidade/virada-dos-controles");
      return { sucesso: msg };
    } catch (e) {
      return {
        erro: mensagemDoErro(e, "Não foi possível encerrar os controles orçamentários."),
      };
    }
  });
}

export async function estornarEncerramentoAction(
  _prev: EstadoDaVirada,
  formData: FormData
): Promise<EstadoDaVirada> {
  return comComandoDoFormulario(formData, async () => {
    const operacaoId = String(formData.get("operacaoId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (operacaoId === "") return { erro: "Encerramento inválido." };

    try {
      const msg = await estornarEncerramentoDeControles({ operacaoId, motivo });
      revalidatePath("/contabilidade/virada-dos-controles");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível estornar o encerramento.") };
    }
  });
}
