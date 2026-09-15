"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { confirmarNaTela, previaNaTela, revogarVinculoNaTela, vincularNaTela } from "../../../../lib/portas/planilha-da-obra";

/**
 * AS AÇÕES DA PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U6). Nenhuma regra aqui: formato, cabeçalho, erros, divergências,
 * vigência e vínculo são do domínio. `__id` é a obra (para recarregar a página); o arquivo vai como veio.
 */
export interface EstadoDaPlanilha {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly acao?: string;
  /** A prévia recém-gerada, para o link. */
  readonly previaId?: string;
}

export async function planilhaAction(_prev: EstadoDaPlanilha, formData: FormData): Promise<EstadoDaPlanilha> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
    const obraId = campos["__id"] ?? "";
    const acao = campos["__acao"] ?? "";
    if (obraId === "") return { erro: "Obra não identificada. Nada foi gravado.", acao };
    try {
      if (acao === "previa") {
        const arquivo = formData.get("arquivo");
        if (!(arquivo instanceof File)) return { erro: "Escolha o arquivo da planilha (.xlsx ou .xls). Nada foi gravado.", acao };
        const r = await previaNaTela(obraId, arquivo, campos);
        revalidatePath(`/licitacoes/obras/${obraId}/planilha`);
        return { sucesso: r.mensagem, acao, previaId: r.previaId };
      }
      const ATOS: Readonly<Record<string, (c: Record<string, string>) => Promise<string>>> = { confirmar: confirmarNaTela, vincular: vincularNaTela, revogarVinculo: revogarVinculoNaTela };
      const ato = ATOS[acao];
      if (ato === undefined) return { erro: `Ação desconhecida: ${acao}. Nada foi gravado.`, acao };
      const sucesso = await ato(campos);
      revalidatePath(`/licitacoes/obras/${obraId}/planilha`, "layout");
      return { sucesso, acao };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado."), acao };
    }
  });
}
