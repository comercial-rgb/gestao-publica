"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { SERVIDORES } from "../../../../lib/portas/recursos/pessoal";
import { criarServidor, acaoDoServidor } from "../../../../lib/portas/recursos/pessoal-dados";

/**
 * A SERVER ACTION de servidores — criar e as ações do detalhe.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function servidoresAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
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
        const novoId = await criarServidor(campos);
        mensagem = `Registro criado. Abra em SERVIDORES.rota/${novoId}.`.replace("SERVIDORES.rota", SERVIDORES.rota);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        mensagem = await acaoDoServidor(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(SERVIDORES.rota);
    if (id !== "") revalidatePath(`${SERVIDORES.rota}/${id}`);
    revalidatePath("/pessoal/cargos");
    revalidatePath("/pessoal/lotacoes");
    return { sucesso: mensagem };
  });
}
