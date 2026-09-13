"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { GRUPOS_DE_EMPENHO_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { criarGrupoDeEmpenho } from "../../../../lib/portas/recursos/folha-dados";

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
    if (rubricas.length === 0) return { erro: "Marque ao menos uma rubrica de provento: um grupo sem rubrica não empenharia nada. Nada foi gravado." };
    try {
      await criarGrupoDeEmpenho(campos, rubricas);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar o grupo. Nada foi gravado.") };
    }
    revalidatePath(GRUPOS_DE_EMPENHO_DA_FOLHA.rota);
    return { sucesso: `Grupo ${campos["codigo"] ?? ""} cadastrado com ${rubricas.length} rubrica(s).` };
  });
}
