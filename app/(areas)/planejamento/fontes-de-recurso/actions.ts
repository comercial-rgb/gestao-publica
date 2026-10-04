"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { carregarTabelaOficialDeFontes } from "../../../../lib/portas/fontes-de-recurso";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDaCarga {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** A carga da tabela oficial. A recusa do domínio sobe inteira: ela diz o que falta (permissão, arquivo). */
export async function carregarTabelaAction(_p: EstadoDaCarga, f: FormData): Promise<EstadoDaCarga> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await carregarTabelaOficialDeFontes();
      revalidatePath("/planejamento/fontes-de-recurso");
      revalidatePath("/contabilidade/natureza-das-fontes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível carregar a tabela de fontes. Nada foi gravado.") };
    }
  });
}
