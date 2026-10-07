"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { publicarOuRetirarObra } from "../../../../../lib/portas/obras-no-portal";

export interface EstadoDaPublicacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 (TR 5.10.1.54) — publica a obra no portal ou a retira, com o motivo. Só traduz o formulário. */
export async function publicarObraAction(_p: EstadoDaPublicacao, f: FormData): Promise<EstadoDaPublicacao> {
  return comComandoDoFormulario(f, async () => {
    const obraId = String(f.get("obraId") ?? "").trim();
    const publicar = String(f.get("publicar") ?? "") === "sim";
    const motivo = String(f.get("motivo") ?? "").trim();
    try {
      const sucesso = await publicarOuRetirarObra({ obraId, publicar, motivo });
      revalidatePath(`/licitacoes/obras/${obraId}`);
      revalidatePath("/transparencia/obras");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível mudar a publicação da obra. Nada foi gravado.") };
    }
  });
}
