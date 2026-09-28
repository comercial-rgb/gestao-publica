"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { REPRESENTACOES } from "../../../../lib/portas/recursos/representacoes";
import { acaoDaRepresentacao, criarRepresentacao } from "../../../../lib/portas/recursos/representacoes-dados";

/**
 * AS AÇÕES DAS REPRESENTAÇÕES — registrar (molde) e revogar (barra).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: conta sem pessoa, representante que não é pessoa física,
 * representação de si mesmo e revogação repetida são recusas do domínio, e sobem como vieram.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
  return campos;
}

export async function representacoesAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    let mensagem = "";
    try {
      if (acao === "criar") {
        const novo = await criarRepresentacao(campos);
        mensagem = `Representação registrada. A partir do início da vigência, o representante poderá solicitar e acompanhar serviços em nome da pessoa representada. Registro disponível em ${REPRESENTACOES.rota}/${novo}.`;
      } else {
        if (id === "") return { erro: "Registro não identificado. Nenhuma alteração foi gravada." };
        mensagem = await acaoDaRepresentacao(acao, id, campos);
      }
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar. Nenhuma alteração foi gravada.") };
    }
    revalidatePath(REPRESENTACOES.rota);
    if (id !== "") revalidatePath(`${REPRESENTACOES.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
