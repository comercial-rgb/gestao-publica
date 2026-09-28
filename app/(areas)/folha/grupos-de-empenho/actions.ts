"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { GRUPOS_DE_EMPENHO_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { acaoDoGrupoDeEmpenho, criarGrupoDeEmpenho } from "../../../../lib/portas/recursos/folha-dados";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";

export interface EstadoDoGrupo {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A SERVER ACTION DO GRUPO DE EMPENHO — a ilha manda o cabeçalho e as rubricas marcadas.
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: rubrica de desconto, rubrica já em outro grupo e credor
 * faltando são recusas do domínio, e sobem COMO VIERAM.
 */
export async function criarGrupoAction(_prev: EstadoDoGrupo, formData: FormData): Promise<EstadoDoGrupo> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    // Só as caixas MARCADAS chegam no FormData — as linhas vazias somem sozinhas.
    const rubricas = linhasDoFormulario(formData, "rubricas", ["id"]).map((l) => l["id"] ?? "").filter((id) => id !== "");
    if (rubricas.length === 0) return { erro: "Marque ao menos uma rubrica de provento. Nada foi gravado." };
    try {
      await criarGrupoDeEmpenho(campos, rubricas);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar o grupo. Nada foi gravado.") };
    }
    revalidatePath(GRUPOS_DE_EMPENHO_DA_FOLHA.rota);
    return { sucesso: `Grupo ${campos["codigo"] ?? ""} cadastrado com ${rubricas.length} rubrica(s).` };
  });
}

/**
 * A SERVER ACTION DAS AÇÕES DO GRUPO — hoje uma só: definir as duas contas da liquidação.
 *
 * ⚠️ ELA EXISTE PORQUE AS COLUNAS NASCERAM NULLABLE. Sem este caminho, os grupos cadastrados
 * antes desta entrega ficariam sem as contas para sempre, e a liquidação recusaria nomeando o
 * grupo sem que houvesse o que fazer pela tela.
 */
export async function grupoDeEmpenhoAction(_prev: EstadoDoMolde, formData: FormData): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    if (id === "") return { erro: "Ação sem registro de destino. Nada foi gravado." };
    let mensagem = "";
    try {
      mensagem = await acaoDoGrupoDeEmpenho(acao, id, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(GRUPOS_DE_EMPENHO_DA_FOLHA.rota);
    revalidatePath(`${GRUPOS_DE_EMPENHO_DA_FOLHA.rota}/${id}`);
    return { sucesso: mensagem };
  });
}
