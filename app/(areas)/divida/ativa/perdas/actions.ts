"use server";

import { revalidatePath } from "next/cache";
import { apurar, declararPercentual, type OrigemDaDividaAtiva } from "../../../../../lib/portas/ajuste-de-perdas";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";

export interface EstadoDoAjuste {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const origem = (f: FormData): OrigemDaDividaAtiva => (t(f, "origem") === "NAO_TRIBUTARIA" ? "NAO_TRIBUTARIA" : "TRIBUTARIA");

export async function declararPercentualAction(_p: EstadoDoAjuste, f: FormData): Promise<EstadoDoAjuste> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await declararPercentual({ exercicio: Number(t(f, "exercicio")), origem: origem(f), percentual: t(f, "percentual").replace(",", "."), metodologia: t(f, "metodologia") });
      revalidatePath("/divida/ativa/perdas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar o percentual. Nada foi gravado.") };
    }
  });
}

export async function apurarAction(_p: EstadoDoAjuste, f: FormData): Promise<EstadoDoAjuste> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await apurar({ origem: origem(f), corte: t(f, "corte") });
      revalidatePath("/divida/ativa/perdas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível apurar o ajuste. Nada foi gravado.") };
    }
  });
}
