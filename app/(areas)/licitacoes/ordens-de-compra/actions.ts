"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { ORDENS_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { acaoDaOrdem, criarOrdem, receberOrdem } from "../../../../lib/portas/recursos/compras-dados";

export interface EstadoDaOrdem {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * AS SERVER ACTIONS DA ORDEM DE COMPRA — a ilha emite (cabeçalho + itens), outra ilha recebe (por item), o molde estorna.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  return campos;
}

export async function emitirOrdemAction(_prev: EstadoDaOrdem, formData: FormData): Promise<EstadoDaOrdem> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const itens = linhasDoFormulario(formData, "itens", ["materialId", "quantidade", "valorUnitario"]).map((l) => ({ materialId: l["materialId"] ?? "", quantidade: l["quantidade"] ?? "", valorUnitario: l["valorUnitario"] ?? "" }));
    try {
      await criarOrdem(campos, itens);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível emitir a ordem. Nada foi gravado.") };
    }
    revalidatePath(ORDENS_DE_COMPRA.rota);
    return { sucesso: `Ordem ${campos["numero"] ?? ""} emitida com ${itens.length} item(ns).` };
  });
}

export async function receberOrdemAction(_prev: EstadoDaOrdem, formData: FormData): Promise<EstadoDaOrdem> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const ordemId = campos["ordemId"] ?? "";
    if (ordemId === "") return { erro: "Ordem não identificada. Nada foi gravado." };
    const itens = linhasDoFormulario(formData, "itens", ["itemDeOrdemId", "quantidade"]).map((l) => ({ itemDeOrdemId: l["itemDeOrdemId"] ?? "", quantidade: l["quantidade"] ?? "" }));
    try {
      await receberOrdem(ordemId, campos, itens);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o recebimento. Nada foi gravado.") };
    }
    revalidatePath(ORDENS_DE_COMPRA.rota);
    revalidatePath(`${ORDENS_DE_COMPRA.rota}/${ordemId}`);
    return { sucesso: `Recebimento registrado com ${itens.length} item(ns).` };
  });
}

/** A Server Action do MOLDE — só as ações do detalhe; a criação é da ilha (itens). */
export async function ordensdecompraAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
    try {
      await acaoDaOrdem(acao, id, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(ORDENS_DE_COMPRA.rota);
    revalidatePath(`${ORDENS_DE_COMPRA.rota}/${id}`);
    return { sucesso: "Ordem estornada." };
  });
}
