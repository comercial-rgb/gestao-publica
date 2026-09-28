"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { LEIS_ORCAMENTARIAS } from "../../../../lib/portas/recursos/leis-orcamentarias";
import { criarLeiOrcamentaria, registrarAprovacaoDaLei } from "../../../../lib/portas/recursos/leis-orcamentarias-dados";

/**
 * A Server Action da Lei Orçamentária Anual — "criar" (o projeto) e "registrar-aprovacao" (a lei).
 *
 * ⚠️ NENHUMA REGRA AQUI: exercício repetido, ordem das datas, aprovação única e autorização são do
 * serviço do M02b, e a mensagem dele sobe como veio. O despacho é fail-closed: `__acao`
 * desconhecido recusa, em vez de dizer "salvo" sem gravar.
 */
export async function acaoDasLeisOrcamentariasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";

    let sucesso: string;
    try {
      if (acao === "criar") {
        const exercicio = await criarLeiOrcamentaria(campos);
        sucesso = `Projeto da LOA ${exercicio} cadastrado.`;
      } else if (acao === "registrar-aprovacao") {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await registrarAprovacaoDaLei(id, campos);
        sucesso = "Lei aprovada registrada.";
      } else {
        return { erro: "Ação não reconhecida. Nada foi gravado." };
      }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }

    revalidatePath(LEIS_ORCAMENTARIAS.rota);
    if (id !== "") revalidatePath(`${LEIS_ORCAMENTARIAS.rota}/${id}`);
    return { sucesso };
  });
}
