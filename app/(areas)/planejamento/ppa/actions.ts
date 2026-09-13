"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PLANOS_PLURIANUAIS } from "../../../../lib/portas/recursos/plurianual";
import { criarPlano, acaoDoPlano } from "../../../../lib/portas/recursos/plurianual-dados";

/**
 * A SERVER ACTION DO PPA — criar o plano e as ações do detalhe (programa no plano, receita prevista, série histórica).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
export async function planosplurianuaisAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarPlano(campos);
      } else {
        if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
        await acaoDoPlano(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(PLANOS_PLURIANUAIS.rota);
    if (id !== "") revalidatePath(`${PLANOS_PLURIANUAIS.rota}/${id}`);
    revalidatePath("/planejamento/ppa/programas");
    return { sucesso: acao === "criar" ? "Plano plurianual cadastrado." : "Registrado no plano." };
  });
}
