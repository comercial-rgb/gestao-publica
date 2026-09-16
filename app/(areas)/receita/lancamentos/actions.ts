"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  cancelarNaTela,
  constituirNaTela,
  prepararLoteNaTela,
  retificarNaTela,
} from "../../../../lib/portas/lancamento-tributario";

/**
 * AS AÇÕES DO LANÇAMENTO TRIBUTÁRIO (V10 T2 · N5).
 *
 * ⚠️ NENHUMA REGRA AQUI. Inconsistência da preparação, roteiro contábil ausente, crédito já
 * arrecadado ou inscrito e lançamento já corrigido são recusas do DOMÍNIO. Esta camada traduz
 * o formulário e a mensagem — e a mensagem do domínio sobe como veio, porque é ela que diz ao
 * servidor público qual é a providência e de quem ela é.
 */
export interface EstadoDoLancamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campos = (formData: FormData): Record<string, string> =>
  Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

function revalidar(loteId?: string): void {
  revalidatePath("/receita/lancamentos");
  if (loteId !== undefined && loteId !== "") revalidatePath(`/receita/lancamentos/${loteId}`);
}

export async function prepararLoteAction(
  _prev: EstadoDoLancamento,
  formData: FormData
): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await prepararLoteNaTela(campos(formData));
      revalidar();
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível preparar o lote. Nada foi gravado.") };
    }
  });
}

export async function constituirAction(
  _prev: EstadoDoLancamento,
  formData: FormData
): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await constituirNaTela(String(formData.get("__lancamento") ?? ""));
      revalidar(String(formData.get("__lote") ?? ""));
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível constituir o crédito. Nada foi gravado.") };
    }
  });
}

export async function retificarAction(
  _prev: EstadoDoLancamento,
  formData: FormData
): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await retificarNaTela(campos(formData));
      revalidar(String(formData.get("__lote") ?? ""));
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível retificar o lançamento. Nada foi gravado.") };
    }
  });
}

export async function cancelarAction(
  _prev: EstadoDoLancamento,
  formData: FormData
): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await cancelarNaTela(campos(formData));
      revalidar(String(formData.get("__lote") ?? ""));
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cancelar o lançamento. Nada foi gravado.") };
    }
  });
}
