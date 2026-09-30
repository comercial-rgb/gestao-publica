"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { importarPlanoDoTribunalPelaTela } from "../../../../lib/portas/sagres";

/**
 * V23 — IMPORTAR O PLANO DE CONTAS DO TRIBUNAL para o exercício. A planilha é a que o Tribunal publica
 * (colunas de exigência por conta); a escolha de QUAL ano da tabela vale para o exercício vem com
 * fundamento, porque a publicação do Tribunal nem sempre traz o ano da remessa.
 */
export interface EstadoDoPlano {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function importarPlanoAction(_prev: EstadoDoPlano, formData: FormData): Promise<EstadoDoPlano> {
  return comComandoDoFormulario(formData, async () => {
    const f = formData.get("arquivo");
    if (!(f instanceof File) || f.size === 0) return { erro: "Escolha a planilha do plano de contas do Tribunal." };
    const exercicio = Number(String(formData.get("exercicio") ?? ""));
    const anoDaTabela = Number(String(formData.get("anoDaTabela") ?? ""));
    if (!Number.isInteger(exercicio) || !Number.isInteger(anoDaTabela)) return { erro: "Informe o exercício e o ano da tabela." };
    const fundamento = String(formData.get("fundamento") ?? "").trim();
    try {
      const msg = await importarPlanoDoTribunalPelaTela({
        exercicio,
        anoDaTabela,
        arquivoNome: f.name,
        conteudo: Buffer.from(await f.arrayBuffer()),
        fundamento,
      });
      revalidatePath("/integracoes/sagres");
      return { sucesso: msg };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível importar a planilha.") };
    }
  });
}
