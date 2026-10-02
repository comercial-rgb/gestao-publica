"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { declararContaDaLiquidacaoNaTela } from "../../../../lib/portas/contas-da-liquidacao";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * A AÇÃO DA CONTA DA LIQUIDAÇÃO POR ELEMENTO (V28). A recusa do domínio sobe inteira: é ela que
 * diz que a conta é sintética, que não é da classe do efeito ou que o elemento tem regra fixa.
 */

export interface EstadoDaContaDaLiquidacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararContaDaLiquidacaoAction(
  _p: EstadoDaContaDaLiquidacao,
  f: FormData
): Promise<EstadoDaContaDaLiquidacao> {
  return comComandoDoFormulario(f, async () => {
    if (!/^\d{2}$/.test(t(f, "elemento"))) return { erro: "Informe o elemento de despesa com 2 dígitos (ex.: 52)." };
    if (t(f, "efeito") === "") return { erro: "Escolha em que a despesa se transforma." };
    if (t(f, "contaCodigo") === "") return { erro: "Escolha a conta do plano." };
    if (t(f, "fundamento") === "") return { erro: "Informe o fundamento da declaração." };
    try {
      const sucesso = await declararContaDaLiquidacaoNaTela({
        elemento: t(f, "elemento"),
        efeito: t(f, "efeito"),
        contaCodigo: t(f, "contaCodigo"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/contas-da-liquidacao");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar a conta da liquidação. Nada foi gravado.") };
    }
  });
}
