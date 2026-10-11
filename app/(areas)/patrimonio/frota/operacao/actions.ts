"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { atoDaOperacaoDaFrota } from "../../../../../lib/portas/frota-operacao";

/** V39-R2 (R2-025 a R2-028) — os atos da operação da frota. Nenhuma regra aqui: a recusa do domínio sobe como veio. */
export interface EstadoDaOperacaoDaFrota {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function operacaoDaFrotaAction(_p: EstadoDaOperacaoDaFrota, f: FormData): Promise<EstadoDaOperacaoDaFrota> {
  return comComandoDoFormulario(f, async () => {
    const c: Record<string, string> = {};
    for (const [k, v] of f.entries()) {
      if (typeof v !== "string") continue;
      // As caixas de marcar repetem o nome: viram uma lista separada por vírgula.
      c[k] = c[k] === undefined ? v : `${c[k]},${v}`;
    }
    try {
      const sucesso = await atoDaOperacaoDaFrota(c["__ato"] ?? "", c);
      revalidatePath("/patrimonio/frota/operacao");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar. Nada foi gravado.") };
    }
  });
}
