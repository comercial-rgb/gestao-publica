"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { gerarCodigosReduzidosPelaTela } from "../../../../../lib/portas/codigos-reduzidos";

export interface EstadoDosCodigos {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 — atribui código reduzido às ações do plano que ainda não têm, e nomeia as que não puderam receber. */
export async function gerarCodigosAction(_p: EstadoDosCodigos, f: FormData): Promise<EstadoDosCodigos> {
  return comComandoDoFormulario(f, async () => {
    const planoId = String(f.get("planoId") ?? "").trim();
    if (planoId === "") return { erro: "Escolha o plano." };
    try {
      const r = await gerarCodigosReduzidosPelaTela(planoId);
      revalidatePath("/planejamento/ppa/codigos-reduzidos");
      const base = r.atribuidos === 0 ? "Nenhum código novo: todas as ações classificadas já tinham o seu." : `${String(r.atribuidos)} código(s) atribuído(s).`;
      const faltam = r.semClassificacao.length === 0 ? "" : `\nSem código por falta de classificação (complete a ação no PPA):\n- ${r.semClassificacao.join("\n- ")}`;
      return { sucesso: `${base}${faltam}` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gerar os códigos. Nada foi gravado.") };
    }
  });
}
