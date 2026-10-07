"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PARCERIAS_PUBLICO_PRIVADAS } from "../../../../lib/portas/recursos/ppp";
import { acaoDaPpp, criarPpp } from "../../../../lib/portas/recursos/ppp-dados";

/**
 * V36 — A SERVER ACTION DAS PARCERIAS PÚBLICO-PRIVADAS: cadastrar, mudar a situação e informar as parcelas.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function pppAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarPpp(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDaPpp(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(PARCERIAS_PUBLICO_PRIVADAS.rota);
    if (id !== "") revalidatePath(`${PARCERIAS_PUBLICO_PRIVADAS.rota}/${id}`);
    return { sucesso: acao === "criar" ? "Parceria cadastrada." : "Registrado na parceria." };
  });
}
