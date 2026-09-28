"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { CAMPANHAS_PUBLICITARIAS } from "../../../../lib/portas/recursos/campanhas-publicitarias";
import { criarCampanhaPublicitaria, semAcaoNasCampanhas } from "../../../../lib/portas/recursos/campanhas-publicitarias-dados";

/**
 * A Server Action das campanhas publicitárias — só "criar".
 *
 * ⚠️ NENHUMA REGRA AQUI: o período, a duplicata e a autorização são do serviço do
 * M05, e a mensagem dele sobe como veio. O despacho é fail-closed: `__acao` desconhecido recusa.
 */
export async function acaoDasCampanhasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";

    let cadastrada: string;
    try {
      if (acao !== "criar") {
        await semAcaoNasCampanhas(acao);
        return { erro: "Ação não reconhecida. Nada foi gravado." };
      }
      cadastrada = await criarCampanhaPublicitaria(campos);
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }

    revalidatePath(CAMPANHAS_PUBLICITARIAS.rota);
    return { sucesso: `Campanha publicitária cadastrada: ${cadastrada}.` };
  });
}
