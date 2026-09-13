"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { SOLICITACOES_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { acaoDaSolicitacao, criarSolicitacao } from "../../../../lib/portas/recursos/compras-dados";

export interface EstadoDaSolicitacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * AS SERVER ACTIONS DA SOLICITAÇÃO DE COMPRA — a ilha cria (cabeçalho + itens `itens.N.*`); o molde autoriza/anula.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  return campos;
}

export async function criarSolicitacaoAction(_prev: EstadoDaSolicitacao, formData: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const itens = linhasDoFormulario(formData, "itens", ["materialId", "quantidade"]).map((l) => ({ materialId: l["materialId"] ?? "", quantidade: l["quantidade"] ?? "" }));
    try {
      await criarSolicitacao(campos, itens);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a solicitação. Nada foi gravado.") };
    }
    revalidatePath(SOLICITACOES_DE_COMPRA.rota);
    return { sucesso: `Solicitação ${campos["numero"] ?? ""} registrada com ${itens.length} item(ns).` };
  });
}

/** A Server Action do MOLDE — só as ações do detalhe; a criação é da ilha (itens). */
export async function solicitacoesdecompraAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
    try {
      await acaoDaSolicitacao(acao, id, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(SOLICITACOES_DE_COMPRA.rota);
    revalidatePath(`${SOLICITACOES_DE_COMPRA.rota}/${id}`);
    return { sucesso: "Movimento registrado na solicitação." };
  });
}
