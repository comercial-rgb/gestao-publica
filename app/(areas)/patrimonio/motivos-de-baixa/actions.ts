"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { MOTIVOS_DE_BAIXA } from "../../../../lib/portas/recursos/gestao-do-bem";
import { criarMotivoDeBaixa } from "../../../../lib/portas/recursos/gestao-do-bem-dados";

/**
 * A Server Action deste cadastro. Ver o cabeçalho de `localizacoes/actions.ts`: despacho
 * fail-closed, e a recusa do domínio sobe inteira.
 */
export async function acaoDeMotivosDeBaixaAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  const acao = campos["__acao"] ?? "";

  try {
    if (acao !== "criar") {
      return { erro: `Ação "${acao}" não existe neste cadastro. Nada foi gravado.` };
    }
    await criarMotivoDeBaixa(campos);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(MOTIVOS_DE_BAIXA.rota);
  return { sucesso: "Motivo de baixa cadastrado." };
}
