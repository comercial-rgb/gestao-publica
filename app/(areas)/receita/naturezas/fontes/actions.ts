"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { definirFontesDaNaturezaPelaTela } from "../../../../../lib/portas/fontes-da-natureza";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { LINHAS_DA_COMPOSICAO } from "./linhas";

export interface EstadoDaComposicao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 — publica as fontes da natureza com percentual. Soma, repetição e resíduo são conferidos no domínio. */
export async function definirFontesDaNaturezaAction(_prev: EstadoDaComposicao, formData: FormData): Promise<EstadoDaComposicao> {
  return comComandoDoFormulario(formData, async () => {
    const t = (k: string): string => String(formData.get(k) ?? "").trim();
    const itens: { fonte: string; percentual: string }[] = [];
    for (let i = 0; i < LINHAS_DA_COMPOSICAO; i++) {
      const fonte = t(`fonte${String(i)}`);
      const percentual = t(`percentual${String(i)}`);
      if (fonte === "" && percentual === "") continue;
      if (fonte === "" || percentual === "") return { erro: `Na linha ${String(i + 1)}, informe a fonte e o percentual.` };
      itens.push({ fonte, percentual });
    }
    if (t("natureza") === "") return { erro: "Informe a natureza da receita." };
    if (itens.length === 0) return { erro: "Informe ao menos uma fonte com percentual." };
    try {
      const r = await definirFontesDaNaturezaPelaTela({ naturezaReceita: t("natureza"), itens, fonteDoResiduo: t("residuo"), fundamento: t("fundamento") });
      revalidatePath("/receita/naturezas/fontes");
      return { sucesso: `Fontes da natureza ${t("natureza")} registradas (soma de ${r.soma}%).` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar as fontes da natureza." };
    }
  });
}
