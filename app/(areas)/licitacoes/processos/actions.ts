"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PROCESSOS_LICITATORIOS } from "../../../../lib/portas/recursos/contratacao";
import { criarProcesso, acaoDoProcesso } from "../../../../lib/portas/recursos/contratacao-dados";

/**
 * A SERVER ACTION DO PROCESSO — criar e as ações do detalhe (homologar, reservar, liberar reserva, contratar).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function processoslicitatoriosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarProcesso(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDoProcesso(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(PROCESSOS_LICITATORIOS.rota);
    if (id !== "") revalidatePath(`${PROCESSOS_LICITATORIOS.rota}/${id}`);
    revalidatePath("/licitacoes/contratos");
    revalidatePath("/despesa/empenhos");
    return { sucesso: acao === "criar" ? "Processo cadastrado." : "Registrado no processo." };
  });
}
