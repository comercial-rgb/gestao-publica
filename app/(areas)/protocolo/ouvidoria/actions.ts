"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { encaminharManifestacaoNaTela, receberManifestacaoNaTela, responderNaTela, triarNaTela } from "../../../../lib/portas/ouvidoria";

/**
 * AS AÇÕES DA OUVIDORIA — triagem, resposta, encaminhamento e recebimento. ⚠️ Nenhuma regra aqui:
 * ação, lotação no setor, triagem prévia, resposta conclusiva, processo fechado e "quem envia não
 * recebe" são recusas do DOMÍNIO. Esta camada só traduz o formulário e o erro.
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

export async function encaminharAction(_prev: EstadoDaOuvidoria, formData: FormData): Promise<EstadoDaOuvidoria> {
  return comComandoDoFormulario(formData, async () => {
    const destino = texto(formData, "setorDestinoId");
    try {
      await encaminharManifestacaoNaTela({
        processoId: texto(formData, "__processo"),
        setorDestinoId: destino,
        usuarioDestino: texto(formData, "usuarioDestino"),
        motivo: texto(formData, "motivo"),
      });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível encaminhar a manifestação. Nada foi gravado.") };
    }
    revalidatePath("/protocolo/ouvidoria");
    return {
      sucesso:
        "Encaminhada. O setor de destino foi notificado e precisa RECEBER a manifestação — " +
        "é o recebimento que inicia a contagem do prazo, não o envio.",
    };
  });
}

export async function receberAction(_prev: EstadoDaOuvidoria, formData: FormData): Promise<EstadoDaOuvidoria> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await receberManifestacaoNaTela(texto(formData, "__processo"));
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível receber a manifestação. Nada foi gravado.") };
    }
    revalidatePath("/protocolo/ouvidoria");
    return { sucesso: "Recebida neste setor. O prazo da etapa passa a contar a partir de agora." };
  });
}
