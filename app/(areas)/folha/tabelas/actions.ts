"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { TABELAS_DA_FOLHA } from "../../../../lib/portas/recursos/folha";
import { criarTabela } from "../../../../lib/portas/recursos/folha-dados";

export interface EstadoDaTabela {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A SERVER ACTION DA TABELA DO ENTE — a ilha manda o cabeçalho e as faixas (`faixas.N.*`).
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI: a recusa do domínio (faixa fora de ordem, vigência ambígua,
 * redutor incompleto) sobe COMO VEIO.
 */
export async function criarTabelaAction(_prev: EstadoDaTabela, formData: FormData): Promise<EstadoDaTabela> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    const faixas = linhasDoFormulario(formData, "faixas", ["ate", "aliquota", "parcelaADeduzir"], ["aliquota"]);
    try {
      await criarTabela(campos, faixas);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar a tabela. Nada foi gravado.") };
    }
    revalidatePath(TABELAS_DA_FOLHA.rota);
    return { sucesso: `Tabela cadastrada, vigente desde ${campos["competenciaInicio"] ?? ""}${faixas.length > 0 ? ` com ${faixas.length} faixa(s)` : ""}.` };
  });
}
