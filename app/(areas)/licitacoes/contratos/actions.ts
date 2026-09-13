"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { CONTRATOS } from "../../../../lib/portas/recursos/contratacao";
import { acaoDoContrato } from "../../../../lib/portas/recursos/contratacao-dados";

/**
 * A SERVER ACTION DO CONTRATO — só as ações do detalhe (aditivo, estorno); o contrato nasce pelo processo.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function contratosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDoContrato(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(CONTRATOS.rota);
    if (id !== "") revalidatePath(`${CONTRATOS.rota}/${id}`);
    revalidatePath("/licitacoes/processos");
    return { sucesso: acao === "criar" ? "" : "Registrado no contrato." };
  });
}
