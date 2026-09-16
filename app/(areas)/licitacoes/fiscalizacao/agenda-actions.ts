"use server";

import { revalidatePath } from "next/cache";
import { cadastrarTipoNaTela, cancelarNaTela, mudarSituacaoDoTipoNaTela, publicarVersaoNaTela, reagendarNaTela, realizarNaTela } from "../../../../lib/portas/agenda-da-fiscalizacao";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * AS AÇÕES DA AGENDA E DOS TIPOS DE OCORRÊNCIA (V7 M2 U8). Nenhuma regra aqui: designação vigente, situação do
 * compromisso, vigência do formulário e formato das respostas são recusas do domínio, e sobem como vieram.
 */
export interface EstadoDaAgenda {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly acao?: string;
}

const ATOS: Readonly<Record<string, (c: Record<string, string>) => Promise<string>>> = {
  reagendar: reagendarNaTela,
  cancelar: cancelarNaTela,
  realizar: realizarNaTela,
  cadastrarTipo: cadastrarTipoNaTela,
  publicarVersao: publicarVersaoNaTela,
  mudarSituacao: mudarSituacaoDoTipoNaTela,
};

export async function agendaAction(_prev: EstadoDaAgenda, formData: FormData): Promise<EstadoDaAgenda> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
    const acao = campos["__acao"] ?? "";
    const ato = ATOS[acao];
    if (ato === undefined) return { erro: `Ação desconhecida: ${acao}. Nada foi gravado.`, acao };
    try {
      const sucesso = await ato(campos);
      revalidatePath("/licitacoes/fiscalizacao", "layout");
      if (campos["__contratoId"] !== undefined && campos["__contratoId"] !== "") revalidatePath(`/licitacoes/contratos/${campos["__contratoId"]}`, "layout");
      return { sucesso, acao };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado."), acao };
    }
  });
}
