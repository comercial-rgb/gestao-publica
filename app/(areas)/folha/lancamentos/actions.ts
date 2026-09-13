"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { LANCAMENTOS_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { criarLancamento } from "../../../../lib/portas/recursos/folha-dados";

/**
 * A SERVER ACTION DOS LANÇAMENTOS — só criar; encerrar um fixo é outro lançamento, nunca UPDATE.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function lancamentosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
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
        const novoId = await criarLancamento(campos);
        mensagem = `Lançamento registrado. Abra em ${LANCAMENTOS_DA_FOLHA.rota}/${novoId}.`;
      } else {
        return { erro: "Este cadastro não tem ações no detalhe. Nada foi gravado." };
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(LANCAMENTOS_DA_FOLHA.rota);
    if (id !== "") revalidatePath(`${LANCAMENTOS_DA_FOLHA.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
