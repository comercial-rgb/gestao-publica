"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { SOLICITACOES_DA_MESA } from "../../../../lib/portas/recursos/solicitacoes-da-mesa";
import { acaoDaSolicitacao, disponibilizarRespostaNaTela } from "../../../../lib/portas/recursos/solicitacoes-da-mesa-dados";

/**
 * AS AÇÕES DA MESA — exigência e decisão (barra do molde) e o documento de resposta (ilha: arquivo).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: exigência pendente, lotação, autodecisão e cadastro alterado desde
 * a proposta são recusas do domínio, e sobem como vieram.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
  return campos;
}

export async function mesaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const id = campos["__id"] ?? "";
    if (id === "") return { erro: "Solicitação não identificada. Nada foi gravado." };
    let mensagem = "";
    try {
      mensagem = await acaoDaSolicitacao(campos["__acao"] ?? "", id, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(SOLICITACOES_DA_MESA.rota);
    revalidatePath(`${SOLICITACOES_DA_MESA.rota}/${id}`);
    return { sucesso: mensagem };
  });
}

export async function respostaDaMesaAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const id = String(formData.get("__id") ?? "");
    const arquivo = formData.get("arquivo");
    if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo da resposta." };
    try {
      await disponibilizarRespostaNaTela({ solicitacaoId: id, arquivo });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível liberar o documento. Nada foi gravado.") };
    }
    revalidatePath(`${SOLICITACOES_DA_MESA.rota}/${id}`);
    return { sucesso: `Documento "${arquivo.name}" disponibilizado ao requerente, que foi notificado pelo sistema.` };
  });
}
