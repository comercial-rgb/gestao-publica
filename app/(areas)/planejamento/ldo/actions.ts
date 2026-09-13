"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { LEIS_DE_DIRETRIZES } from "../../../../lib/portas/recursos/plurianual";
import { criarLeiDeDiretrizes, acaoDaLdo } from "../../../../lib/portas/recursos/plurianual-dados";

/**
 * A SERVER ACTION DA LDO — criar a lei e as nove ações do detalhe (prioridade, metas, riscos, renúncia, alienação e aplicação, dívida, RPPS, margem).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function leisdediretrizesAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarLeiDeDiretrizes(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDaLdo(acao, id, campos);
      }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(LEIS_DE_DIRETRIZES.rota);
    if (id !== "") revalidatePath(`${LEIS_DE_DIRETRIZES.rota}/${id}`);
    return { sucesso: acao === "criar" ? "LDO cadastrada." : "Registrado na LDO." };
  });
}
