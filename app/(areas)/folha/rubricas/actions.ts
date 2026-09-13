"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { RUBRICAS } from "../../../../lib/portas/recursos/folha";
import { criarRubrica } from "../../../../lib/portas/recursos/folha-dados";

/**
 * A SERVER ACTION DAS RUBRICAS — só criar; a rubrica não se altera (a folha calculada aponta para ela).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function rubricasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    let mensagem = "";
    try {
      if (acao === "criar") {
        const novoId = await criarRubrica(campos);
        mensagem = `Rubrica cadastrada. Abra em ${RUBRICAS.rota}/${novoId}.`;
      } else {
        return { erro: "Este cadastro não tem ações no detalhe. Nada foi gravado." };
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(RUBRICAS.rota);
    if (id !== "") revalidatePath(`${RUBRICAS.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
