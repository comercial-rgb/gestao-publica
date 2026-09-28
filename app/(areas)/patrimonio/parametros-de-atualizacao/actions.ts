"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { PARAMETROS_DE_ATUALIZACAO } from "../../../../lib/portas/recursos/parametros";
import { acaoDoParametro, criarParametro } from "../../../../lib/portas/recursos/parametros-dados";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

/**
 * A Server Action dos parâmetros de atualização — despacho FAIL-CLOSED.
 *
 * NENHUMA REGRA DE NEGÓCIO AQUI: vida útil, residual, classe inativa, versão idêntica e
 * concorrência são decididos dentro da transação do domínio, e a recusa sobe COMO VEIO.
 */
export async function acaoDeParametrosAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    try {
      if (acao === "criar") {
        await criarParametro(campos);
      } else {
        if (id === "") return { erro: "Classe não identificada. Nada foi gravado." };
        await acaoDoParametro(acao, id, campos);
      }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
    }
    revalidatePath(PARAMETROS_DE_ATUALIZACAO.rota);
    if (id !== "") revalidatePath(`${PARAMETROS_DE_ATUALIZACAO.rota}/${id}`);
    revalidatePath("/patrimonio/competencia");
    return {
      sucesso:
        acao === "encerrar"
          ? "Atualização encerrada para esta classe. A classe não será mais incluída no processamento por competência."
          : "Nova versão do parâmetro registrada. Aplica-se às competências processadas a partir de agora.",
    };
  });
}
