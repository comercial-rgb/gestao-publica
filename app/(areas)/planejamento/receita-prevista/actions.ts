"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { detalharLinhaPrevista } from "../../../../lib/portas/receita-prevista";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function detalharAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const d = t(f, "tipoDeducaoSagres");
    try {
      const sucesso = await detalharLinhaPrevista({
        receitaPrevistaId: t(f, "receitaPrevistaId"),
        tipoDeducaoSagres: d === "3" || d === "4" || d === "5" ? d : null,
        codigoNoDocumento: t(f, "codigoNoDocumento") === "" ? null : t(f, "codigoNoDocumento"),
        documento: t(f, "documento"),
      });
      revalidatePath("/planejamento/receita-prevista");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o detalhe. Nada foi gravado.") };
    }
  });
}
