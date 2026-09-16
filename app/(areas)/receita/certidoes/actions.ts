"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  configurarCertidaoNaTela,
  decidirCertidaoNaTela,
  solicitarCertidaoNaTela,
} from "../../../../lib/portas/lancamento-tributario";

/**
 * AS AÇÕES DA CERTIDÃO (V10 T2 · N5).
 *
 * ⚠️ NENHUMA REGRA AQUI. A negativa sem cobertura, a falta de configuração de validade, a
 * solicitação já decidida e o indeferimento sem fundamento são recusas do DOMÍNIO — e as
 * mensagens delas sobem como vieram, porque é nelas que está a providência.
 */
export interface EstadoDaCertidao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campos = (formData: FormData): Record<string, string> =>
  Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;

export async function solicitarCertidaoAction(
  _prev: EstadoDaCertidao,
  formData: FormData
): Promise<EstadoDaCertidao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await solicitarCertidaoNaTela(campos(formData));
      revalidatePath("/receita/certidoes");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o pedido. Nada foi gravado.") };
    }
  });
}

export async function decidirCertidaoAction(
  _prev: EstadoDaCertidao,
  formData: FormData
): Promise<EstadoDaCertidao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await decidirCertidaoNaTela(campos(formData));
      revalidatePath("/receita/certidoes");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível decidir a solicitação. Nada foi gravado.") };
    }
  });
}

export async function configurarCertidaoAction(
  _prev: EstadoDaCertidao,
  formData: FormData
): Promise<EstadoDaCertidao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      const msg = await configurarCertidaoNaTela(campos(formData));
      revalidatePath("/receita/certidoes");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar a configuração. Nada foi gravado.") };
    }
  });
}
