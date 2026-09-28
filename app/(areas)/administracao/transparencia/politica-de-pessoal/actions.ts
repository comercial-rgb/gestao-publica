"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { aprovarPoliticaNaTela, cadastrarPoliticaNaTela, revogarPoliticaNaTela } from "../../../../../lib/portas/politica-de-pessoal";

/**
 * A POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2).
 *
 * ⚠️ NENHUMA REGRA AQUI. Universo fechado de colunas, vigência, segregação entre quem redige e
 * quem aprova, e o fechamento da política anterior são do domínio e do serviço do M13. A recusa
 * sobe COMO VEIO: reescrevê-la apagaria o motivo, que é o que o servidor precisa ler.
 */
export interface EstadoDaPolitica {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function politicaDePessoalAction(_prev: EstadoDaPolitica, formData: FormData): Promise<EstadoDaPolitica> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    const colunas: string[] = [];
    for (const [k, v] of formData.entries()) {
      if (typeof v !== "string") continue;
      if (k === "coluna") colunas.push(v);
      else campos[k] = v;
    }
    try {
      const acao = campos["__acao"] ?? "";
      let mensagem: string;
      if (acao === "cadastrar") mensagem = await cadastrarPoliticaNaTela(campos, colunas);
      else if (acao === "aprovar") mensagem = await aprovarPoliticaNaTela(campos);
      else if (acao === "revogar") mensagem = await revogarPoliticaNaTela(campos);
      // ⚠️ AÇÃO DESCONHECIDA ESTOURA, não vira silêncio verde.
      else return { erro: `Operação "${acao}" não reconhecida. Nenhuma alteração foi gravada.` };

      revalidatePath("/administracao/transparencia/politica-de-pessoal");
      // ⚠️ O PORTAL PÚBLICO TAMBÉM: aprovar ou revogar muda o que o cidadão vê AGORA.
      revalidatePath("/transparencia/pessoal");
      return { sucesso: mensagem };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a política. Nenhuma alteração foi gravada.") };
    }
  });
}
