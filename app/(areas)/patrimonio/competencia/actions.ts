"use server";

import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { processarCompetencia } from "../../../../lib/portas/recursos/competencia-dados";
import { rotuloDoTipoPatrimonial } from "../../../../lib/portas/recursos/roteiros";

/**
 * ⚠️ SEM `revalidatePath` AQUI, de propósito: revalidar dentro da action faz o Next re-renderizar a
 * rota, e a página passa a NÃO montar mais este formulário (a prévia deixa de estar PRONTA) — a
 * resposta some junto com ele. A tela seguinte lê o banco ao ser aberta (`force-dynamic`).
 */
export interface EstadoDaCompetencia {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * PROCESSAR A COMPETÊNCIA — a única escrita desta tela. A prévia é GET; isto é POST, com a
 * chave de comando (replay idempotente) e o crachá `ATUALIZAR_COMPETENCIA_PATRIMONIAL`
 * cobrado na porta. A recusa do domínio sobe como veio.
 */
export async function processarCompetenciaAction(
  _prev: EstadoDaCompetencia,
  formData: FormData
): Promise<EstadoDaCompetencia> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    try {
      const r = await processarCompetencia(campos);
      return {
        sucesso:
          `Competência ${campos["competencia"] ?? ""} processada: ${rotuloDoTipoPatrimonial(r.tipo)} de ` +
          `${r.valorDaParcela.toFixed(2)} lançada na contabilidade, em ${r.itens.length} item(ns) ` +
          `(${r.escopo === "BEM" ? "um bem" : "toda a classe"}). A memória de cálculo foi registrada para cada item.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Falha ao processar. Nada foi gravado." };
    }
  });
}
