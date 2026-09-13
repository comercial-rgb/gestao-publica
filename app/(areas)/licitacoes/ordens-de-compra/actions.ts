"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { ORDENS_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { acaoDaOrdem, criarOrdem, desfazerVinculo, receberOrdem, vincularNaOrdem } from "../../../../lib/portas/recursos/compras-dados";

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
      const r = await receberOrdem(ordemId, campos, itens);
      revalidatePath(ORDENS_DE_COMPRA.rota);
      revalidatePath(`${ORDENS_DE_COMPRA.rota}/${ordemId}`);
      revalidatePath("/licitacoes/documentos-fiscais");
      return {
        sucesso: `Recebimento registrado: ${r.itens} item(ns). Restam R$ ${r.pendenteValor} a receber nesta ordem.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o recebimento. Nada foi gravado.") };
    }
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

/** VINCULAR parcelas de solicitações a esta ordem (V6 P1.1) — linhas `linhas.N.*`; a recusa do domínio sobe como veio. */
export async function vincularSolicitacaoAction(_prev: EstadoDaOrdem, formData: FormData): Promise<EstadoDaOrdem> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const ordemId = campos["ordemId"] ?? "";
    if (ordemId === "") return { erro: "Ordem não identificada. Nada foi gravado." };
    const linhas = linhasDoFormulario(formData, "linhas", ["itemDeSolicitacaoId", "itemDeOrdemId", "quantidade"])
      .map((l) => ({ itemDeSolicitacaoId: l["itemDeSolicitacaoId"] ?? "", itemDeOrdemId: l["itemDeOrdemId"] ?? "", quantidade: (l["quantidade"] ?? "").trim() }))
      .filter((l) => l.quantidade !== "" && l.quantidade !== "0");
    if (linhas.length === 0) return { erro: "Informe a quantidade de ao menos uma parcela. Nada foi gravado." };
    try {
      const r = await vincularNaOrdem(ordemId, linhas);
      revalidatePath(ORDENS_DE_COMPRA.rota);
      revalidatePath(`${ORDENS_DE_COMPRA.rota}/${ordemId}`);
      revalidatePath("/licitacoes/solicitacoes");
      return { sucesso: `${r.parcelas} parcela(s) vinculada(s) a esta ordem, ${r.quantidade} no total. O atendimento da solicitação já reflete o ordenado — recebido só quando entregar.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível vincular. Nada foi gravado.") };
    }
  });
}

/** DESFAZER uma parcela (V6 P1.1) — linha nova de estorno com motivo; parcela com recebimento não se desfaz. */
export async function desfazerVinculoAction(_prev: EstadoDaOrdem, formData: FormData): Promise<EstadoDaOrdem> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const alocacaoId = campos["alocacaoId"] ?? "";
    const ordemId = campos["ordemId"] ?? "";
    if (alocacaoId === "") return { erro: "Parcela não identificada. Nada foi gravado." };
    try {
      await desfazerVinculo(alocacaoId, campos["motivo"] ?? "");
      revalidatePath(ORDENS_DE_COMPRA.rota);
      if (ordemId !== "") revalidatePath(`${ORDENS_DE_COMPRA.rota}/${ordemId}`);
      revalidatePath("/licitacoes/solicitacoes");
      return { sucesso: "Parcela desfeita: a quantidade voltou a pendente na solicitação. A linha original fica no histórico." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível desfazer. Nada foi gravado.") };
    }
  });
}
