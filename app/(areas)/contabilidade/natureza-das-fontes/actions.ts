"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { declararNatureza } from "../../../../lib/portas/natureza-das-fontes";

/**
 * A AÇÃO DA NATUREZA DA FONTE (V11 V9.3).
 *
 * ⚠️ A RECUSA DO DOMÍNIO SOBE INTEIRA, como na tela irmã dos roteiros: é ela que diz que a
 * fonte não está no cadastro, ou que a natureza já é essa. Resumi-la deixaria a pessoa com
 * "não foi possível" diante de uma guia que continua sendo recusada.
 */

export interface EstadoDaNatureza {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararNaturezaAction(
  _p: EstadoDaNatureza,
  f: FormData
): Promise<EstadoDaNatureza> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "fonteCodigo") === "") return { erro: "Fonte não informada." };
    if (t(f, "natureza") === "") return { erro: "Escolha a natureza do recurso." };
    if (t(f, "fundamento") === "") {
      return { erro: "Informe o fundamento da natureza declarada para esta fonte." };
    }
    try {
      const sucesso = await declararNatureza({
        fonteCodigo: t(f, "fonteCodigo"),
        natureza: t(f, "natureza"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/natureza-das-fontes");
      revalidatePath("/receita/arrecadacoes");
      return { sucesso };
    } catch (e) {
      return {
        erro: mensagemDoErro(
          e,
          "Não foi possível declarar a natureza da fonte. Nada foi gravado."
        ),
      };
    }
  });
}
