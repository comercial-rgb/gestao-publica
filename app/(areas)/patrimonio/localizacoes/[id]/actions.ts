"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { definirDivulgacaoNaTela } from "../../../../../lib/portas/recursos/gestao-do-bem-dados";

/**
 * A POLÍTICA DE DIVULGAÇÃO DE UMA LOCALIZAÇÃO (V10 T3 · N2).
 *
 * ⚠️ NENHUMA REGRA AQUI. Ação própria, motivo obrigatório, repetição recusada e histórico
 * append-only são do DOMÍNIO (`modules/m10-patrimonial/gestao-do-bem.ts`).
 */
export interface EstadoDaDivulgacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function definirDivulgacaoAction(
  _prev: EstadoDaDivulgacao,
  formData: FormData
): Promise<EstadoDaDivulgacao> {
  return comComandoDoFormulario(formData, async () => {
    const campos = Object.fromEntries(
      [...formData.entries()].filter(([, v]) => typeof v === "string")
    ) as Record<string, string>;
    try {
      const msg = await definirDivulgacaoNaTela(campos);
      revalidatePath(`/patrimonio/localizacoes/${campos["__localizacao"] ?? ""}`);
      revalidatePath("/patrimonio/localizacoes");
      // ⚠️ O PORTAL PÚBLICO TAMBÉM: a consulta de bens mostra o lugar, e uma decisão que não
      // chegasse lá deixaria a tela interna dizendo uma coisa e o portal outra.
      revalidatePath("/transparencia/bens");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível alterar a divulgação. Nada foi gravado.") };
    }
  });
}
