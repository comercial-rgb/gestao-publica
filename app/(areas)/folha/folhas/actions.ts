"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { FOLHAS } from "../../../../lib/portas/recursos/folha";
import { criarFolha, acaoDaFolha } from "../../../../lib/portas/recursos/folha-dados";

/**
 * AS SERVER ACTIONS DA FOLHA — abrir e as ações do detalhe (calcular, cancelar o cálculo, fechar).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function folhasAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
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
        const novoId = await criarFolha(campos);
        mensagem = `Folha aberta. Abra em ${FOLHAS.rota}/${novoId}.`;
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        mensagem = await acaoDaFolha(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(FOLHAS.rota);
    if (id !== "") revalidatePath(`${FOLHAS.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
