"use server";

import { revalidatePath } from "next/cache";
import { registrarReprevisao } from "../../../../lib/portas/planejamento";

export interface EstadoReprevisao {
  readonly erro?: string;
  readonly sucesso?: boolean;
}

const TIPOS = ["ORCAMENTARIA", "INTRA_ORCAMENTARIA", "DEDUCAO"] as const;

/** Server Action: registra a reprevisão (escrita autenticada) e revalida a lista. */
export async function reprevisarAction(_prev: EstadoReprevisao, formData: FormData): Promise<EstadoReprevisao> {
  const naturezaReceita = String(formData.get("natureza") ?? "").trim();
  const fonte = String(formData.get("fonte") ?? "").trim();
  const tipoBruto = String(formData.get("tipo") ?? "ORCAMENTARIA");
  const tipoReceita = (TIPOS as readonly string[]).includes(tipoBruto) ? (tipoBruto as (typeof TIPOS)[number]) : "ORCAMENTARIA";
  const valorAjuste = String(formData.get("ajuste") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const exBruto = Number.parseInt(String(formData.get("exercicio") ?? "2026"), 10);
  const exercicio = Number.isNaN(exBruto) ? 2026 : exBruto;

  try {
    await registrarReprevisao({ exercicio, naturezaReceita, fonte, tipoReceita, valorAjuste, motivo, data: new Date() });
    revalidatePath("/planejamento/reprevisao");
    return { sucesso: true };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível registrar a reprevisão." };
  }
}
