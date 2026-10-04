"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { declararLimite } from "../../../../lib/portas/limite-do-legislativo";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDoLimite {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararLimiteAction(_p: EstadoDoLimite, f: FormData): Promise<EstadoDoLimite> {
  return comComandoDoFormulario(f, async () => {
    try {
      const base = t(f, "baseDeclarada").replace(/\./g, "").replace(",", ".");
      const sucesso = await declararLimite({
        exercicio: Number(t(f, "exercicio")),
        populacao: Number(t(f, "populacao").replace(/\D/g, "")),
        fontePopulacao: t(f, "fontePopulacao"),
        baseDeclarada: base === "" ? null : base,
        documentoDaBase: t(f, "documentoDaBase") === "" ? null : t(f, "documentoDaBase"),
      });
      revalidatePath("/relatorios/limite-do-legislativo");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar os parâmetros. Nada foi gravado.") };
    }
  });
}
