"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { publicarConfiguracaoNaTela } from "../../../../lib/portas/acesso-a-informacao";

/**
 * A CONFIGURAÇÃO DO ACESSO À INFORMAÇÃO (V11 V5.1).
 *
 * ⚠️ NENHUMA REGRA AQUI. Versionamento, recusa de vigência retroativa e a exigência de citar a
 * norma são do serviço do M21. A recusa sobe COMO VEIO: reescrevê-la apagaria o motivo, que é o
 * que o servidor precisa ler para saber o que corrigir.
 */
export interface EstadoDaConfiguracao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function configuracaoDoAcessoAction(
  _prev: EstadoDaConfiguracao,
  formData: FormData,
): Promise<EstadoDaConfiguracao> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
    try {
      const mensagem = await publicarConfiguracaoNaTela(campos);
      revalidatePath("/protocolo/acesso-a-informacao");
      return { sucesso: mensagem };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar a configuração. Nada foi gravado.") };
    }
  });
}
