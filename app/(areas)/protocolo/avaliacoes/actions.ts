"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { cadastrarMetodologiaNaTela, removerAvaliacaoNaTela } from "../../../../lib/portas/ouvidoria";

/**
 * AS AÇÕES DA AVALIAÇÃO — nova versão da metodologia e remoção moderada. ⚠️ Escala coberta por rótulos,
 * permissão e motivo são conferidos no domínio.
 */
export interface EstadoDaAvaliacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function metodologiaAction(_prev: EstadoDaAvaliacao, formData: FormData): Promise<EstadoDaAvaliacao> {
  return comComandoDoFormulario(formData, async () => {
    const escalaMinima = Number.parseInt(texto(formData, "escalaMinima"), 10);
    const escalaMaxima = Number.parseInt(texto(formData, "escalaMaxima"), 10);
    // Um rótulo por linha, na ordem da escala: a linha 1 é a nota mínima.
    const linhas = texto(formData, "rotulos").split("\n").map((l) => l.trim()).filter((l) => l !== "");
    const rotulos = linhas.map((rotulo, i) => ({ nota: escalaMinima + i, rotulo }));
    try {
      const r = await cadastrarMetodologiaNaTela({ escalaMinima, escalaMaxima, rotulos, descricaoDoMetodo: texto(formData, "descricaoDoMetodo"), periodoMeses: Number.parseInt(texto(formData, "periodoMeses"), 10) });
      revalidatePath("/protocolo/avaliacoes");
      return { sucesso: `Metodologia versão ${r.versao} gravada e vigente. Avaliações anteriores continuam na versão em que foram feitas e saem da média nova.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a metodologia. Nada foi gravado.") };
    }
  });
}

export async function removerAction(_prev: EstadoDaAvaliacao, formData: FormData): Promise<EstadoDaAvaliacao> {
  return comComandoDoFormulario(formData, async () => {
    try {
      await removerAvaliacaoNaTela({ avaliacaoId: texto(formData, "__id"), motivo: texto(formData, "motivo"), justificativa: texto(formData, "justificativa") });
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível remover. Nada foi gravado.") };
    }
    revalidatePath("/protocolo/avaliacoes");
    return { sucesso: "Avaliação removida. O resultado público passa a informar a remoção." };
  });
}
