"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { DESIGNACOES_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { acaoDaDesignacao, criarDesignacao } from "../../../../lib/portas/recursos/folha-dados";

/**
 * A SERVER ACTION DAS DESIGNAÇÕES — criar e revogar. NÃO há editar: alterar a vigência
 * reescreveria o passado, e os atestos praticados sob ela ficariam sem lastro.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function designacoesAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
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
        const novoId = await criarDesignacao(campos);
        mensagem =
          `Designação cadastrada. Ela NÃO concede poder sozinha: certificar exige também a ação CERTIFICAR_FOLHA no ` +
          `perfil desta conta. Abra em ${DESIGNACOES_DA_FOLHA.rota}/${novoId}.`;
      } else if (id !== "") {
        mensagem = await acaoDaDesignacao(acao, id, campos);
      } else {
        return { erro: "Ação sem registro de destino. Nada foi gravado." };
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(DESIGNACOES_DA_FOLHA.rota);
    if (id !== "") revalidatePath(`${DESIGNACOES_DA_FOLHA.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
