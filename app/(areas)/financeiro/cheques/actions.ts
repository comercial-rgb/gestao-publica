"use server";

import { revalidatePath } from "next/cache";
import { cancelarChequeAvulsoPelaTela, registrarChequeAvulsoPelaTela } from "../../../../lib/portas/cheques";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDoCheque {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 — registra o cheque avulso. Nenhuma regra aqui: número único, data e valor são do domínio, na transação. */
export async function registrarChequeAvulsoAction(_prev: EstadoDoCheque, formData: FormData): Promise<EstadoDoCheque> {
  return comComandoDoFormulario(formData, async () => {
    const t = (k: string): string => String(formData.get(k) ?? "").trim();
    if (t("conta") === "") return { erro: "Escolha a conta bancária do cheque." };
    if (t("dia") === "") return { erro: "A data do cheque é obrigatória." };
    if (t("valor") === "") return { erro: "Informe o valor do cheque." };
    try {
      await registrarChequeAvulsoPelaTela({ contaBancariaId: t("conta"), numero: t("numero"), dia: t("dia"), valor: t("valor"), favorecido: t("favorecido"), finalidade: t("finalidade") });
      revalidatePath("/financeiro/cheques");
      return { sucesso: `Cheque ${t("numero")} registrado.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar o cheque." };
    }
  });
}

export async function cancelarChequeAvulsoAction(_prev: EstadoDoCheque, formData: FormData): Promise<EstadoDoCheque> {
  return comComandoDoFormulario(formData, async () => {
    const t = (k: string): string => String(formData.get(k) ?? "").trim();
    if (t("chequeId") === "") return { erro: "Cheque não informado." };
    if (t("dia") === "") return { erro: "A data do cancelamento é obrigatória." };
    try {
      await cancelarChequeAvulsoPelaTela({ chequeId: t("chequeId"), dia: t("dia"), motivo: t("motivo") });
      revalidatePath("/financeiro/cheques");
      return { sucesso: "Cheque cancelado." };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível cancelar o cheque." };
    }
  });
}
