"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { declararAcao, declararPrograma } from "../../../../lib/portas/programas-e-acoes";
import { meioDiaCivil } from "../../../../packages/datas/index";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararProgramaAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a declaração vale." };
    try {
      const sucesso = await declararPrograma({
        programaId: t(f, "programaId"),
        descricao: t(f, "descricao"),
        objetivo: t(f, "objetivo"),
        tipoObjetivoMilenio: t(f, "tipoObjetivoMilenio"),
        fundamento: t(f, "fundamento"),
        vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")),
      });
      revalidatePath("/planejamento/programas-e-acoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar o programa. Nada foi gravado.") };
    }
  });
}

export async function declararAcaoAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a declaração vale." };
    try {
      const sucesso = await declararAcao({
        acaoId: t(f, "acaoId"),
        descricao: t(f, "descricao"),
        descMeta: t(f, "descMeta"),
        unidadeMedida: t(f, "unidadeMedida"),
        fundamento: t(f, "fundamento"),
        vigenteDesde: meioDiaCivil(t(f, "vigenteDesde")),
      });
      revalidatePath("/planejamento/programas-e-acoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar a ação. Nada foi gravado.") };
    }
  });
}
