"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { informarTramita } from "../../../../../lib/portas/tramita";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function informarTramitaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await informarTramita({
        processoId: t(f, "processoId"),
        numeroNoTramita: t(f, "numeroNoTramita"),
        codUnidadeGestora: t(f, "codUnidadeGestora"),
        modalidadeSagres: t(f, "modalidadeSagres"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath(`/licitacoes/processos/${t(f, "processoId")}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar. Nada foi gravado.") };
    }
  });
}
