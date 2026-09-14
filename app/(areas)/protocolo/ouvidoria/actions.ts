"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { responderNaTela, triarNaTela } from "../../../../lib/portas/ouvidoria";

/**
 * AS AÇÕES DA OUVIDORIA — triagem e resposta. ⚠️ Nenhuma regra aqui: ação, lotação no setor, triagem
 * prévia, resposta conclusiva e processo fechado são recusas do domínio.
 */
export interface EstadoDaOuvidoria {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function triarAction(_prev: EstadoDaOuvidoria, formData: FormData): Promise<EstadoDaOuvidoria> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await triarNaTela({ manifestacaoId: texto(formData, "__id"), tipoConfirmado: texto(formData, "tipoConfirmado"), anotacaoInterna: texto(formData, "anotacaoInterna") });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a triagem. Nada foi gravado.") };
    }
    revalidatePath("/protocolo/ouvidoria");
    return { sucesso: "Triagem registrada. A anotação é interna e não vai ao manifestante." };
  });
}

export async function responderAction(_prev: EstadoDaOuvidoria, formData: FormData): Promise<EstadoDaOuvidoria> {
  return comComandoDoFormulario(formData, async () => {
    const conclusiva = texto(formData, "conclusiva") === "sim";
    try {
      await responderNaTela({ manifestacaoId: texto(formData, "__id"), texto: texto(formData, "texto"), conclusiva });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a resposta. Nada foi gravado.") };
    }
    revalidatePath("/protocolo/ouvidoria");
    return { sucesso: conclusiva ? "Resposta conclusiva registrada; o processo foi encerrado. O manifestante a lê pelo código." : "Resposta registrada. O manifestante a lê pelo código." };
  });
}
