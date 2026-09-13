"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { LOTACOES } from "../../../../lib/portas/recursos/pessoal";
import { criarLotacao } from "../../../../lib/portas/recursos/pessoal-dados";

/**
 * A SERVER ACTION de lotações — criar.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function lotacoesAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
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
        const novoId = await criarLotacao(campos);
        mensagem = `Registro criado. Abra em LOTACOES.rota/${novoId}.`.replace("LOTACOES.rota", LOTACOES.rota);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        throw new Error(`Ação "${acao}" não existe neste cadastro. Nada foi gravado.`);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(LOTACOES.rota);
    if (id !== "") revalidatePath(`${LOTACOES.rota}/${id}`);
    revalidatePath("/pessoal/servidores");
    return { sucesso: mensagem };
  });
}
