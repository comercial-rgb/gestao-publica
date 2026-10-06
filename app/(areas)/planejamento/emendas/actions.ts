"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { bloquearDotacaoPelaTela, cadastrarEmendaPelaTela, liberarDotacaoPelaTela, sancionarEmendaPelaTela } from "../../../../lib/portas/emendas";

export interface EstadoDaEmenda {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campo = (f: FormData, n: string): string => String(f.get(n) ?? "").trim();

export async function cadastrarEmendaAction(_p: EstadoDaEmenda, f: FormData): Promise<EstadoDaEmenda> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await cadastrarEmendaPelaTela({
        propostaId: campo(f, "propostaId"), data: campo(f, "data"), objetivo: campo(f, "objetivo"), justificativa: campo(f, "justificativa"),
        vereador: campo(f, "vereador"), textoJuridico: campo(f, "textoJuridico"), itens: String(f.get("itens") ?? ""),
      });
      revalidatePath("/planejamento/emendas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a emenda. Nada foi gravado.") };
    }
  });
}

export async function bloquearDotacaoAction(_p: EstadoDaEmenda, f: FormData): Promise<EstadoDaEmenda> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await bloquearDotacaoPelaTela({ propostaId: campo(f, "propostaId"), ficha: campo(f, "ficha"), motivo: campo(f, "motivo") });
      revalidatePath("/planejamento/emendas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível bloquear a dotação. Nada foi gravado.") };
    }
  });
}

export async function liberarDotacaoAction(_p: EstadoDaEmenda, f: FormData): Promise<EstadoDaEmenda> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await liberarDotacaoPelaTela({ bloqueioId: campo(f, "bloqueioId"), motivo: campo(f, "motivo") });
      revalidatePath("/planejamento/emendas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível liberar a dotação. Nada foi gravado.") };
    }
  });
}

export async function sancionarEmendaAction(_p: EstadoDaEmenda, f: FormData): Promise<EstadoDaEmenda> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await sancionarEmendaPelaTela({
        emendaId: campo(f, "emendaId"), resultado: campo(f, "resultado"),
        itensAprovados: f.getAll("itemAprovado").map((v) => String(v)), data: campo(f, "data"), ato: campo(f, "ato"),
      });
      revalidatePath("/planejamento/emendas");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a sanção. Nada foi gravado.") };
    }
  });
}
