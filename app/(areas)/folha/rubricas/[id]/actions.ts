"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { aprovarVersaoNaTela, criarVersaoNaTela, revogarVersaoNaTela } from "../../../../../lib/portas/versoes-da-rubrica";

/**
 * AS VERSÕES DA RUBRICA (V11 V1.1).
 *
 * ⚠️ NENHUMA REGRA AQUI. Fórmula em universo fechado, grafo sem ciclo, vigência, regime
 * aplicável e a segregação entre quem escreve e quem aprova são do domínio. A recusa do domínio
 * sobe COMO VEIO — reescrevê-la aqui apagaria o motivo, que é o que o servidor precisa ler.
 */
export interface EstadoDaVersao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function versaoDaRubricaAction(_prev: EstadoDaVersao, formData: FormData): Promise<EstadoDaVersao> {
  return comComandoDoFormulario(formData, async () => {
    const campos = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
    const rubrica = campos["__rubrica"] ?? "";
    try {
      const acao = campos["__acao"] ?? "";
      let mensagem: string;
      if (acao === "criar") mensagem = await criarVersaoNaTela(campos);
      else if (acao === "aprovar") mensagem = await aprovarVersaoNaTela(campos);
      else if (acao === "revogar") mensagem = await revogarVersaoNaTela(campos);
      // ⚠️ AÇÃO DESCONHECIDA ESTOURA, não vira silêncio: um `__acao` escrito errado que caísse
      // num "nada a fazer" devolveria a tela verde sem ter gravado nada.
      else return { erro: `Ação "${acao}" não existe nesta tela. Nada foi gravado.` };

      revalidatePath("/folha/rubricas");
      if (rubrica !== "") revalidatePath(`/folha/rubricas/${rubrica}`);
      return { sucesso: mensagem };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a versão. Nada foi gravado.") };
    }
  });
}
