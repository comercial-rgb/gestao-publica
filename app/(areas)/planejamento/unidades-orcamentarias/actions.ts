"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  declararDadosDaUnidadeOrcamentaria,
  type AtoDeNomeacao,
  type NaturezaJuridicaDaUnidade,
} from "../../../../lib/portas/unidades-orcamentarias";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { ATOS, NATUREZAS } from "./rotulos";

export interface EstadoDaDeclaracao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function declararDadosDaUnidadeAction(
  _prev: EstadoDaDeclaracao,
  formData: FormData
): Promise<EstadoDaDeclaracao> {
  return comComandoDoFormulario(formData, async () => {
    const unidadeOrcId = String(formData.get("unidadeOrcId") ?? "").trim();
    const natureza = String(formData.get("naturezaJuridica") ?? "").trim();
    const ato = String(formData.get("atoDeNomeacao") ?? "").trim();
    const nomeSecretario = String(formData.get("nomeSecretario") ?? "").trim();
    const cpfSecretario = String(formData.get("cpfSecretario") ?? "").trim();
    const vigenteDesde = String(formData.get("vigenteDesde") ?? "").trim();

    if (unidadeOrcId === "") return { erro: "Escolha a unidade orçamentária." };
    if (!NATUREZAS.some((n) => n.valor === natureza)) return { erro: "Escolha a natureza jurídica da unidade." };
    if (!ATOS.some((a) => a.valor === ato)) return { erro: "Escolha o ato que nomeou o secretário." };
    if (vigenteDesde === "") return { erro: "Informe desde quando esta declaração vale (a data da posse, em geral)." };

    try {
      const r = await declararDadosDaUnidadeOrcamentaria({
        unidadeOrcId,
        naturezaJuridica: natureza as NaturezaJuridicaDaUnidade,
        nomeSecretario,
        cpfSecretario,
        atoDeNomeacao: ato as AtoDeNomeacao,
        vigenteDesde: meioDiaCivil(vigenteDesde),
      });
      revalidatePath("/planejamento/unidades-orcamentarias");
      return {
        sucesso:
          `Dados da unidade ${r.unidadeCodigo} declarados, valendo desde ${r.vigenteDesde.split("-").reverse().join("/")}. ` +
          `A declaração anterior, se havia, continua registrada para os meses em que valeu.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar os dados da unidade.") };
    }
  });
}
