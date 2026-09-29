"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { estornarMovimentoExtraorcamentario, registrarIngressoManual } from "../../../../lib/portas/extraorcamentario";

/**
 * SERVER ACTION DO ESTORNO EXTRAORÇAMENTÁRIO (V19).
 *
 * ⚠️ O ESTORNO É ATO NOVO, e a tela já dizia isso antes de existir o botão: *"aqui o estorno
 * aparece como coluna, não embutido: um recolhimento de 500,00 desfeito por um estorno de 500,00
 * mostra os dois, e não 'recolhido zero'"*. O que faltava era o caminho para produzir o fato.
 */

export interface EstadoDoEstornoExtra {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function estornarRecolhimentoAction(
  _prev: EstadoDoEstornoExtra,
  formData: FormData
): Promise<EstadoDoEstornoExtra> {
  return comComandoDoFormulario(formData, async () => {
    const movimentoId = String(formData.get("movimentoId") ?? "").trim();
    const data = String(formData.get("data") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (movimentoId === "") return { erro: "Escolha o recolhimento a estornar." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data do estorno." };

    try {
      const msg = await estornarMovimentoExtraorcamentario({ movimentoId, data, motivo });
      revalidatePath("/financeiro/extraorcamentario");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível estornar o recolhimento.") };
    }
  });
}

/**
 * V22 rodada 7 — O INGRESSO AVULSO (caução, depósito de terceiro). Nenhuma regra aqui: tipo ativo,
 * conta com passivo parametrizado, fonte no rol da conta e autorização são do domínio.
 */
export async function registrarIngressoAction(_prev: EstadoDoEstornoExtra, formData: FormData): Promise<EstadoDoEstornoExtra> {
  return comComandoDoFormulario(formData, async () => {
    const t = (n: string): string => String(formData.get(n) ?? "").trim();
    if (t("tipoConsignacao") === "") return { erro: "Escolha o tipo (caução, depósito, consignação)." };
    if (t("credorConsignatario") === "") return { erro: "Informe de quem é o valor (o terceiro)." };
    if (t("contaBancaria") === "") return { erro: "Escolha a conta bancária que recebeu." };
    if (t("valor") === "") return { erro: "Informe o valor." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t("data"))) return { erro: "Informe a data do ingresso." };
    if (t("historico") === "") return { erro: "Informe o histórico." };
    try {
      const msg = await registrarIngressoManual({
        tipoConsignacaoCodigo: t("tipoConsignacao"),
        credorConsignatario: t("credorConsignatario"),
        contaBancaria: t("contaBancaria"),
        valor: t("valor"),
        data: t("data"),
        historico: t("historico"),
      });
      revalidatePath("/financeiro/extraorcamentario");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o ingresso.") };
    }
  });
}
