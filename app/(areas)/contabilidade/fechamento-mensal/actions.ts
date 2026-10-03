"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { fecharMesNaTela, reabrirMesNaTela } from "../../../../lib/portas/fechamento-mensal";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/** Fechar e reabrir o mês (V32). A conferência e a autorização são do domínio; a recusa sobe inteira. */

export interface EstadoDoFechamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function fecharMesAction(_p: EstadoDoFechamento, f: FormData): Promise<EstadoDoFechamento> {
  return comComandoDoFormulario(f, async () => {
    const competencia = t(f, "competencia");
    if (competencia === "") return { erro: "Escolha o mês a fechar." };
    try {
      const sucesso = await fecharMesNaTela(competencia);
      revalidatePath("/contabilidade/fechamento-mensal");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível fechar o mês. Nada foi gravado.") };
    }
  });
}

export async function reabrirMesAction(_p: EstadoDoFechamento, f: FormData): Promise<EstadoDoFechamento> {
  return comComandoDoFormulario(f, async () => {
    const competencia = t(f, "competencia");
    const motivo = t(f, "motivo");
    if (competencia === "") return { erro: "Escolha o mês a reabrir." };
    if (motivo.length < 10) return { erro: "Explique por que o mês precisa ser reaberto (ao menos 10 caracteres)." };
    try {
      const sucesso = await reabrirMesNaTela(competencia, motivo);
      revalidatePath("/contabilidade/fechamento-mensal");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível reabrir o mês. Nada foi gravado.") };
    }
  });
}
