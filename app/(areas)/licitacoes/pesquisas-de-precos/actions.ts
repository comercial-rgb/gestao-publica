"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PESQUISAS_DE_PRECOS } from "../../../../lib/portas/recursos/compras";
import { criarPesquisa } from "../../../../lib/portas/recursos/compras-dados";

export interface EstadoDaPesquisa {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A SERVER ACTION DA PESQUISA DE PREÇOS — a ilha cria (cabeçalho, itens `itens.N.*` e cotações `itens.N.cotacoes.M.*`).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio sobe COMO VEIO; `__acao` desconhecida ESTOURA.
 */
function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  return campos;
}

export async function criarPesquisaAction(_prev: EstadoDaPesquisa, formData: FormData): Promise<EstadoDaPesquisa> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const indices = new Set<number>();
    for (const k of formData.keys()) {
      const m = /^itens\.(\d+)\./.exec(k);
      if (m !== null) indices.add(Number(m[1]));
    }
    const itens = [...indices].sort((a, b) => a - b).flatMap((i) => {
      const materialId = String(formData.get(`itens.${i}.materialId`) ?? "").trim();
      const quantidade = String(formData.get(`itens.${i}.quantidade`) ?? "").trim();
      if (materialId === "" && quantidade === "") return [];
      const cotacoes = linhasDoFormulario(formData, `itens.${i}.cotacoes`, ["fornecedorId", "valorUnitario", "origem"], ["fornecedorId", "valorUnitario"]).map((q) => ({
        fornecedorId: q["fornecedorId"] ?? "",
        valorUnitario: q["valorUnitario"] ?? "",
        origem: q["origem"] ?? "",
      }));
      return [{ materialId, quantidade, cotacoes }];
    });
    try {
      await criarPesquisa(campos, itens);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a pesquisa. Nada foi gravado.") };
    }
    revalidatePath(PESQUISAS_DE_PRECOS.rota);
    return { sucesso: `Pesquisa ${campos["numero"] ?? ""} registrada com ${itens.length} item(ns).` };
  });
}
