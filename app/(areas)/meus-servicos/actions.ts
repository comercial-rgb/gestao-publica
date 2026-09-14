"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../lib/portas/comando";
import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
import { anexarNaSolicitacaoNaTela, protocolarNaTela, responderExigenciaNaTela } from "../../../lib/portas/carta-de-servicos";

/**
 * AS AÇÕES DO REQUERENTE — protocolar, responder exigência e enviar documento.
 *
 * ⚠️ NENHUM GUARD DE NEGÓCIO AQUI. O titular é resolvido e conferido na transação (a conta ou a
 * representação vigente); formulário incompleto, exigência inexistente e solicitação encerrada são
 * recusas do domínio, e sobem como vieram. Esta camada só traduz `FormData`.
 *
 * ⚠️ O TITULAR NÃO É UM CPF DIGITADO: o campo `titular` carrega "" (a própria pessoa) ou o id de uma
 * pessoa que a sessão representa — e mesmo esse id é conferido de novo contra a representação vigente.
 */
export interface EstadoDoRequerente {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly solicitacaoId?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function protocolarAction(_prev: EstadoDoRequerente, formData: FormData): Promise<EstadoDoRequerente> {
  return comComandoDoFormulario(formData, async () => {
    const slug = texto(formData, "__servico");
    const titular = texto(formData, "titular");
    const respostas: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (k.startsWith("resposta.") && typeof v === "string") respostas[k.slice("resposta.".length)] = v;
    try {
      const r = await protocolarNaTela({ slug, ...(titular !== "" ? { representadaId: titular } : {}), respostas, aceitouTermo: texto(formData, "aceitouTermo") === "sim" });
      revalidatePath("/meus-servicos");
      return {
        solicitacaoId: r.solicitacaoId,
        sucesso: `Solicitação protocolada sob o número ${r.protocolo}, em nome de ${r.titular}${r.viaRepresentacao ? " (por representação)" : ""}. Guarde o número — com o código verificador que aparece no acompanhamento, ele também serve na consulta pública.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível protocolar. Nada foi protocolado.") };
    }
  });
}

export async function responderExigenciaAction(_prev: EstadoDoRequerente, formData: FormData): Promise<EstadoDoRequerente> {
  return comComandoDoFormulario(formData, async () => {
    const solicitacaoId = texto(formData, "__id");
    try {
      await responderExigenciaNaTela({ solicitacaoId, texto: texto(formData, "texto") });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível enviar a resposta. Nada foi gravado.") };
    }
    revalidatePath(`/meus-servicos/${solicitacaoId}`);
    return { sucesso: "Resposta enviada. A solicitação volta para análise do setor." };
  });
}

export async function anexarDoRequerenteAction(_prev: EstadoDoRequerente, formData: FormData): Promise<EstadoDoRequerente> {
  return comComandoDoFormulario(formData, async () => {
    const solicitacaoId = texto(formData, "__id");
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha um arquivo para enviar." };
    try {
      await anexarNaSolicitacaoNaTela({ solicitacaoId, arquivo });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível enviar o documento. Nada foi gravado.") };
    }
    revalidatePath(`/meus-servicos/${solicitacaoId}`);
    return { sucesso: `Documento "${arquivo.name}" enviado e ligado à sua solicitação.` };
  });
}
