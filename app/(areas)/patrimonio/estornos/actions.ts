"use server";

import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { ehEixo, estornarPorAnalise } from "../../../../lib/portas/recursos/estorno-dados";

/**
 * ⚠️ SEM `revalidatePath` AQUI, de propósito: revalidar dentro da action faz o Next re-renderizar a
 * rota, e a página passa a NÃO montar mais este formulário (a prévia deixa de estar PRONTA) — a
 * resposta some junto com ele. A tela seguinte lê o banco ao ser aberta (`force-dynamic`).
 */
export interface EstadoDoEstorno {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ESTORNAR — a única escrita da tela de análise. O serviço do eixo refaz a análise dentro
 * da transação e recusa pelos mesmos bloqueios que a tela mostrou; a recusa sobe como veio.
 * Eixo desconhecido ESTOURA em vez de cair num caminho feliz.
 */
export async function estornarAction(_prev: EstadoDoEstorno, formData: FormData): Promise<EstadoDoEstorno> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const eixo = campos["eixo"] ?? "";
    if (!ehEixo(eixo)) return { erro: `Tipo de movimento "${eixo}" não reconhecido. Nada foi gravado.` };
    try {
      const r = await estornarPorAnalise(eixo, campos);
      return {
        sucesso:
          r.movimentos === 1
            ? "Estorno registrado. O movimento foi anulado por novo lançamento, e o original permanece no histórico."
            : `Estorno registrado. ${r.movimentos} movimentos da operação foram anulados em conjunto, e os originais permanecem no histórico.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao estornar. Nada foi gravado." };
    }
  });
}
