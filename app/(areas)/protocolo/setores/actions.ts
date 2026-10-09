"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { SETORES } from "../../../../lib/portas/recursos/setores";
import { acaoDoSetor, cadastrarSetorDoMolde } from "../../../../lib/portas/recursos/setores-dados";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * V37 — A Server Action do cadastro de setores: criar, desativar, reativar e lotar usuário. O despacho é fail-closed: um `__acao`
 * desconhecido é recusado em vez de cair num caminho que diria "salvo". A mensagem do domínio sobe como veio.
 */
export async function acaoDeSetoresAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") await cadastrarSetorDoMolde(campos);
      else if (id === "") return { erro: "Setor não identificado. Nada foi gravado." };
      else await acaoDoSetor(acao, id, campos);
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(SETORES.rota);
    if (id !== "") revalidatePath(`${SETORES.rota}/${id}`);
    return { sucesso: acao === "criar" ? "Setor cadastrado." : acao === "desativar" ? "Setor desativado." : acao === "lotar" ? "Usuário lotado no setor." : "Setor reativado." };
  });
}
