"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  bloquearLinhaPelaTela,
  cadastrarEmendaDoPlanejamentoPelaTela,
  liberarLinhaPelaTela,
  sancionarEmendaDoPlanejamentoPelaTela,
} from "../../../../lib/portas/emendas-do-planejamento";

export interface EstadoDaEmendaDoPlano {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campo = (f: FormData, n: string): string => String(f.get(n) ?? "").trim();
const CAMINHO = "/planejamento/emendas-do-plano";

export async function cadastrarEmendaDoPlanoAction(_p: EstadoDaEmendaDoPlano, f: FormData): Promise<EstadoDaEmendaDoPlano> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await cadastrarEmendaDoPlanejamentoPelaTela({
        peca: campo(f, "peca"), data: campo(f, "data"), objetivo: campo(f, "objetivo"), justificativa: campo(f, "justificativa"),
        vereador: campo(f, "vereador"), textoJuridico: campo(f, "textoJuridico"),
        linhas: f.getAll("linha").map((v) => String(v).trim()), valores: f.getAll("valor").map((v) => String(v).trim()),
      });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a emenda. Nada foi gravado.") };
    }
  });
}

export async function bloquearLinhaAction(_p: EstadoDaEmendaDoPlano, f: FormData): Promise<EstadoDaEmendaDoPlano> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await bloquearLinhaPelaTela({ linha: campo(f, "linha"), motivo: campo(f, "motivo") });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível bloquear a linha. Nada foi gravado.") };
    }
  });
}

export async function liberarLinhaAction(_p: EstadoDaEmendaDoPlano, f: FormData): Promise<EstadoDaEmendaDoPlano> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await liberarLinhaPelaTela({ bloqueioId: campo(f, "bloqueioId"), motivo: campo(f, "motivo") });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível liberar a linha. Nada foi gravado.") };
    }
  });
}

export async function sancionarEmendaDoPlanoAction(_p: EstadoDaEmendaDoPlano, f: FormData): Promise<EstadoDaEmendaDoPlano> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await sancionarEmendaDoPlanejamentoPelaTela({
        emendaId: campo(f, "emendaId"), resultado: campo(f, "resultado"), itensAprovados: f.getAll("itemAprovado").map((v) => String(v)),
        leiNumero: campo(f, "leiNumero"), leiAno: campo(f, "leiAno"), data: campo(f, "data"), dataPublicacao: campo(f, "dataPublicacao"),
      });
      revalidatePath(CAMINHO);
      revalidatePath("/planejamento/alteracoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a sanção. Nada foi gravado.") };
    }
  });
}
