"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { SOLICITACOES_DE_COMPRA } from "../../../../lib/portas/recursos/compras";
import { acaoDaSolicitacao, criarSolicitacao, formarOrdemDaSolicitacao } from "../../../../lib/portas/recursos/compras-dados";

export interface EstadoDaSolicitacao {
  readonly erro?: string;
  readonly sucesso?: string;
  /** A ordem gerada por "formar ordem" — o resultado aponta para o registro criado. */
  readonly ordemId?: string;
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

/**
 * FORMAR UMA ORDEM A PARTIR DA SOLICITAÇÃO (V6 P1.1) — a ilha manda o cabeçalho da ordem e as linhas
 * `itens.N.*` (incluir, itemDeSolicitacaoId, materialId, quantidade, valorUnitario); a origem vai na
 * MESMA transação da ordem, e a recusa (excesso, pendente, incompatível) sobe como veio.
 */
export async function formarOrdemAction(_prev: EstadoDaSolicitacao, formData: FormData): Promise<EstadoDaSolicitacao> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const solicitacaoId = campos["solicitacaoId"] ?? "";
    if (solicitacaoId === "") return { erro: "Solicitação não identificada. Nada foi gravado." };
    const linhas = linhasDoFormulario(formData, "itens", ["incluir", "itemDeSolicitacaoId", "materialId", "quantidade", "valorUnitario"])
      .filter((l) => l["incluir"] === "on" || l["incluir"] === "1")
      .map((l) => ({ itemDeSolicitacaoId: l["itemDeSolicitacaoId"] ?? "", materialId: l["materialId"] ?? "", quantidade: l["quantidade"] ?? "", valorUnitario: l["valorUnitario"] ?? "" }));
    if (linhas.length === 0) return { erro: "Escolha ao menos um item pendente para formar a ordem. Nada foi gravado." };
    try {
      const r = await formarOrdemDaSolicitacao(campos, linhas);
      revalidatePath(SOLICITACOES_DE_COMPRA.rota);
      revalidatePath(`${SOLICITACOES_DE_COMPRA.rota}/${solicitacaoId}`);
      revalidatePath("/licitacoes/ordens-de-compra");
      return { sucesso: `Ordem ${campos["numero"] ?? ""} formada com ${r.itens} item(ns) desta solicitação. Abra em /licitacoes/ordens-de-compra/${r.ordemId}.`, ordemId: r.ordemId };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível formar a ordem. Nada foi gravado.") };
    }
  });
}
