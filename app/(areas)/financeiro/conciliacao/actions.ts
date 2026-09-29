"use server";

import { revalidatePath } from "next/cache";
import { desfazerVinculoDaConciliacao, vincularNaConciliacao } from "../../../../lib/portas/conciliacao";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

export interface EstadoDoVinculo {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * O VÍNCULO ENTRE A LINHA DO EXTRATO E O REGISTRO DO SISTEMA (V22 rodada 7).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Natureza compatível (entrada com crédito, saída com débito), a
 * mesma conta e fonte, o valor que ainda cabe dos dois lados, a permissão — tudo é do domínio
 * (`vincular`, M09), dentro da transação, e a mensagem volta como veio.
 */
export async function vincularAction(_prev: EstadoDoVinculo, formData: FormData): Promise<EstadoDoVinculo> {
  return comComandoDoFormulario(formData, async () => {
    const lancamentoExtratoId = String(formData.get("linhaDoExtrato") ?? "").trim();
    const interno = String(formData.get("registroDoSistema") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    if (lancamentoExtratoId === "") return { erro: "Escolha a linha do extrato." };
    if (interno === "") return { erro: "Escolha o registro do sistema." };
    if (valor === "") return { erro: "Informe o valor a conciliar." };
    try {
      await vincularNaConciliacao({ lancamentoExtratoId, interno, valor });
      revalidatePath("/financeiro/conciliacao");
      return { sucesso: "Vínculo registrado. A linha e o registro saíram das pendências no valor conciliado." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível registrar o vínculo." };
    }
  });
}

export async function desfazerVinculoAction(_prev: EstadoDoVinculo, formData: FormData): Promise<EstadoDoVinculo> {
  return comComandoDoFormulario(formData, async () => {
    const vinculoId = String(formData.get("vinculoId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (vinculoId === "") return { erro: "Vínculo não informado." };
    try {
      await desfazerVinculoDaConciliacao({ vinculoId, motivo });
      revalidatePath("/financeiro/conciliacao");
      return { sucesso: "Vínculo desfeito. O original continua registrado, com o motivo." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível desfazer o vínculo." };
    }
  });
}
