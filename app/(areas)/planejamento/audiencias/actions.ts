"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { AUDIENCIAS_PUBLICAS } from "../../../../lib/portas/recursos/audiencias";
import { acaoDaAudiencia, criarAudiencia } from "../../../../lib/portas/recursos/audiencias-dados";

/**
 * V36 — A SERVER ACTION DAS AUDIÊNCIAS PÚBLICAS: registrar a audiência, a solicitação e a situação dela.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function audienciasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarAudiencia(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDaAudiencia(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(AUDIENCIAS_PUBLICAS.rota);
    if (id !== "") revalidatePath(`${AUDIENCIAS_PUBLICAS.rota}/${id}`);
    return { sucesso: acao === "criar" ? "Audiência pública registrada." : "Registrado na audiência." };
  });
}
