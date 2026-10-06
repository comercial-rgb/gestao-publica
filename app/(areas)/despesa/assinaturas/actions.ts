"use server";

import { revalidatePath } from "next/cache";
import { assinar, enviarParaAssinatura } from "../../../../lib/portas/assinatura-despesa";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoAssinatura {
  readonly erro?: string;
  readonly sucesso?: string;
}

const TIPOS = ["EMPENHO", "LIQUIDACAO", "ORDEM"] as const;
type Tipo = (typeof TIPOS)[number];
const ehTipo = (v: string): v is Tipo => (TIPOS as readonly string[]).includes(v);

/**
 * ⚠️ NENHUMA REGRA AQUI. Modo indisponível, signatário repetido, documento já gerado —
 * tudo é recusado pelo domínio, ANTES de gravar qualquer coisa (`exigirFilaViavel`), e a
 * mensagem volta como veio.
 */
export async function enviarParaAssinaturaAction(
  _prev: EstadoAssinatura,
  formData: FormData
): Promise<EstadoAssinatura> {
  return comComandoDoFormulario(formData, async () => {
    const tipoBruto = String(formData.get("tipo") ?? "");
    const registroId = String(formData.get("registroId") ?? "").trim();
    const signatarios = formData
      .getAll("signatarios")
      .map((v) => String(v).trim())
      .filter((v) => v !== "");

    if (!ehTipo(tipoBruto)) return { erro: "Tipo de documento inválido." };
    if (signatarios.length === 0) {
      return {
        erro:
          "Escolha ao menos um signatário.",
      };
    }

    try {
      await enviarParaAssinatura(tipoBruto, registroId, signatarios);
      revalidatePath("/despesa/assinaturas");
      return { sucesso: "Documento gerado e enviado à fila de assinaturas." };
    } catch (e) {
      return {
        erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível enviar para assinatura.",
      };
    }
  });
}

export async function assinarAction(
  _prev: EstadoAssinatura,
  formData: FormData
): Promise<EstadoAssinatura> {
  return comComandoDoFormulario(formData, async () => {
    const filaId = String(formData.get("filaId") ?? "").trim();
    if (filaId === "") return { erro: "Fila não informada." };

    try {
      const concluida = await assinar(filaId);
      revalidatePath("/despesa/assinaturas");
      return {
        sucesso: concluida
          ? "Documento assinado. Todas as assinaturas foram registradas."
          : "Documento assinado. Ainda há assinaturas pendentes.",
      };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível assinar." };
    }
  });
}
