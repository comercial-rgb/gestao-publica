"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PARAMETROS_DO_ADIANTAMENTO_SALARIAL } from "../../../../lib/portas/recursos/folha";
import { criarParametroDoAdiantamentoSalarial } from "../../../../lib/portas/recursos/folha-dados";

export interface EstadoDoParametroDoAdiantamentoSalarial {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A SERVER ACTION DO PARÂMETRO DO ADIANTAMENTO SALARIAL (V13).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. As recusas do domínio — ato sem número, ano do futuro pela
 * data civil do ente, rubrica de abatimento com a natureza do 13º em vez da do vale, critério
 * PAGO sem empenho por servidor — sobem COMO VIERAM, porque é a mensagem delas que diz ao
 * operador o que corrigir.
 */
export async function criarParametroDoAdiantamentoSalarialAction(
  _prev: EstadoDoParametroDoAdiantamentoSalarial,
  formData: FormData
): Promise<EstadoDoParametroDoAdiantamentoSalarial> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
    }
    let versao = "";
    try {
      versao = (await criarParametroDoAdiantamentoSalarial(campos)).split("|")[1] ?? "";
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar o parâmetro do adiantamento salarial. Nada foi gravado.") };
    }
    revalidatePath(PARAMETROS_DO_ADIANTAMENTO_SALARIAL.rota);
    return {
      sucesso:
        `Parâmetro do adiantamento salarial de ${campos["competencia"] ?? ""} gravado na versão ${versao}. ` +
        `A versão anterior permanece no histórico, e a folha mensal de cada competência utiliza, para o abatimento, ` +
        `a versão que apurou o adiantamento.`,
    };
  });
}
