"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { TIPOS_DE_INCORPORACAO } from "../../../../lib/portas/recursos/gestao-do-bem";
import { criarTipoDeIncorporacao } from "../../../../lib/portas/recursos/gestao-do-bem-dados";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * A Server Action deste cadastro. Ver o cabeçalho de `localizacoes/actions.ts`: despacho
 * fail-closed, e a recusa do domínio sobe inteira.
 */
export async function acaoDeTiposDeIncorporacaoAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";

    try {
      if (acao !== "criar") {
        return { erro: `Ação "${acao}" não existe neste cadastro. Nada foi gravado.` };
      }
      await criarTipoDeIncorporacao(campos);
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Falha ao gravar. Nada foi gravado." };
    }

    revalidatePath(TIPOS_DE_INCORPORACAO.rota);
    return { sucesso: "Tipo de incorporação cadastrado." };
  });
}
