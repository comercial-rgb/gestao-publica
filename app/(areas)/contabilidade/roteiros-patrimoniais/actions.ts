"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { declararRoteiroPatrimonialNaTela } from "../../../../lib/portas/roteiros-patrimoniais";

/** A AÇÃO DO ROTEIRO DE PRECATÓRIOS E CONVÊNIOS (V32). A recusa do domínio sobe inteira. */

export interface EstadoDoRoteiroPatrimonial {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararRoteiroPatrimonialAction(
  _p: EstadoDoRoteiroPatrimonial,
  f: FormData
): Promise<EstadoDoRoteiroPatrimonial> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "movimento") === "") return { erro: "Escolha o movimento." };
    if (t(f, "contaDebitoCodigo") === "" || t(f, "contaCreditoCodigo") === "") return { erro: "Escolha as duas contas." };
    if (t(f, "fundamento") === "") return { erro: "Informe o fundamento do roteiro." };
    try {
      const sucesso = await declararRoteiroPatrimonialNaTela({
        movimento: t(f, "movimento"),
        contaDebitoCodigo: t(f, "contaDebitoCodigo"),
        contaCreditoCodigo: t(f, "contaCreditoCodigo"),
        historicoPadrao: t(f, "historicoPadrao"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/roteiros-patrimoniais");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar o roteiro. Nada foi gravado.") };
    }
  });
}
