"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { definirAdministradorNaTela, revogarAdministradorNaTela } from "../../../../lib/portas/contrato-acompanhado";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/** A DEFINIÇÃO DO ADMINISTRADOR DA FISCALIZAÇÃO (V7 M2 U0.1). Nenhuma regra aqui: ação, pessoa e vigência são do domínio. */
export interface EstadoDaAdministracao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function administracaoDaFiscalizacaoAction(_prev: EstadoDaAdministracao, formData: FormData): Promise<EstadoDaAdministracao> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
    let sucesso = "";
    try {
      if (campos["__acao"] === "definir") sucesso = await definirAdministradorNaTela(campos);
      else if (campos["__acao"] === "revogar") sucesso = await revogarAdministradorNaTela(campos);
      else throw new Error(`Ação desconhecida: ${campos["__acao"] ?? ""}`);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath("/licitacoes/fiscalizacao");
    return { sucesso };
  });
}
