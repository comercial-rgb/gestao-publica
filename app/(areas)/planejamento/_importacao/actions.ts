"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { confirmarImportacaoPelaTela } from "../../../../lib/portas/importacao-do-planejamento";

/**
 * V39-R2 (R2-021, R2-022) — A CONFIRMAÇÃO DA IMPORTAÇÃO (LDO para rascunho; PPA seguinte). Nenhuma regra aqui: o
 * serviço recalcula a prévia, confere a versão e cobra as ações; a recusa sobe como veio.
 */
export interface EstadoDaImportacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campo = (f: FormData, n: string): string => String(f.get(n) ?? "").trim();

export async function confirmarImportacaoAction(_p: EstadoDaImportacao, f: FormData): Promise<EstadoDaImportacao> {
  return comComandoDoFormulario(f, async () => {
    const peca = campo(f, "peca");
    if (peca !== "LDO" && peca !== "PPA") return { erro: "Peça não identificada. Nada foi gravado." };
    const destinoId = campo(f, "destinoId");
    try {
      const sucesso = await confirmarImportacaoPelaTela({
        peca, origemId: campo(f, "origemId"), destinoId, blocos: f.getAll("bloco").map(String), anos: String(f.get("anos") ?? ""), versaoDaPrevia: campo(f, "versaoDaPrevia"),
      });
      revalidatePath(peca === "LDO" ? `/planejamento/ldo/${destinoId}` : `/planejamento/ppa/${destinoId}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível importar. Nada foi gravado.") };
    }
  });
}
