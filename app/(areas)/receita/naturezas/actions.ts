"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { EMENTARIO_DA_RECEITA } from "../../../../lib/portas/recursos/ementario-receita";
import { criarNaturezaDeReceita, semAcaoNoEmentario } from "../../../../lib/portas/recursos/ementario-receita-dados";

/**
 * A Server Action do ementário da receita — só "criar".
 *
 * ⚠️ NENHUMA REGRA AQUI: a estrutura do código, a duplicata e a autorização são do serviço do
 * M04, e a mensagem dele sobe como veio. O despacho é fail-closed: `__acao` desconhecido recusa.
 */
export async function acaoDoEmentarioAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";

    let cadastrada: string;
    try {
      if (acao !== "criar") {
        await semAcaoNoEmentario(acao);
        return { erro: "Ação não reconhecida. Nada foi gravado." };
      }
      cadastrada = await criarNaturezaDeReceita(campos);
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }

    revalidatePath(EMENTARIO_DA_RECEITA.rota);
    return { sucesso: `Natureza de receita cadastrada: ${cadastrada}.` };
  });
}
