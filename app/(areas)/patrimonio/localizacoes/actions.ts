"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { LOCALIZACOES_FISICAS } from "../../../../lib/portas/recursos/gestao-do-bem";
import { criarLocalizacao } from "../../../../lib/portas/recursos/gestao-do-bem-dados";

/**
 * A Server Action deste cadastro, despachando pelo `__acao`.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI, e a mensagem do domínio sobe COMO VEIO — código
 * repetido, localização superior inexistente, ciclo na árvore: quem decide é o serviço.
 *
 * ⚠️ E O DESPACHO É FAIL-CLOSED. Este cadastro não declara ação de detalhe nenhuma; um
 * `__acao` diferente de "criar" ESTOURA em vez de cair num caminho feliz que diria "salvo"
 * sem ter gravado nada.
 */
export async function acaoDeLocalizacoesAction(
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
    await criarLocalizacao(campos);
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Falha ao gravar. Nada foi gravado." };
  }

  revalidatePath(LOCALIZACOES_FISICAS.rota);
  return { sucesso: "Localização física cadastrada." };
}
