"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { PARAMETROS_DO_DECIMO_TERCEIRO } from "../../../../lib/portas/recursos/folha";
import { criarParametroDoDecimoTerceiro } from "../../../../lib/portas/recursos/folha-dados";

export interface EstadoDoParametroDo13 {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * A SERVER ACTION DO PARÂMETRO DO 13º (V11 V9.1).
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. As recusas do domínio — ato sem número, ano do futuro pela
 * data civil do ente, rubrica de valor informado na base, rubrica de abatimento com natureza
 * errada — sobem COMO VIERAM, porque é a mensagem delas que diz ao operador o que corrigir.
 *
 * ⚠️ E AS RUBRICAS DA BASE SÃO MÚLTIPLAS: `getAll`, não `get`. Com `get` a base gravaria só a
 * primeira marcada, o 13º sairia menor, e a folha FECHARIA — ninguém veria.
 */
export async function criarParametroDo13Action(
  _prev: EstadoDoParametroDo13,
  formData: FormData
): Promise<EstadoDoParametroDo13> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string" && k !== "rubricasDaBase") campos[k] = v;
    }
    const rubricasDaBase = formData.getAll("rubricasDaBase").filter((v): v is string => typeof v === "string");
    let versao = "";
    try {
      versao = (await criarParametroDoDecimoTerceiro(campos, rubricasDaBase)).split("|")[1] ?? "";
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cadastrar o parâmetro do 13º. Nada foi gravado.") };
    }
    revalidatePath(PARAMETROS_DO_DECIMO_TERCEIRO.rota);
    return {
      sucesso:
        `Parâmetro do 13º de ${campos["exercicio"] ?? ""} gravado na versão ${versao}, com ${rubricasDaBase.length} ` +
        `rubrica(s) na base. A versão anterior permanece no histórico e continua referenciada pelas folhas já calculadas.`,
    };
  });
}
