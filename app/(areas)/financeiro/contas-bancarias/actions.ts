"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { declararTitular } from "../../../../lib/portas/entidades-contabeis";
import type { TipoDeAtoDeclarado } from "../../../../modules/m01-core-contabil/ato-declarado";

export interface EstadoDoTitular {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function declararTitularAction(
  _prev: EstadoDoTitular,
  formData: FormData
): Promise<EstadoDoTitular> {
  return comComandoDoFormulario(formData, async () => {
    const contaBancariaId = String(formData.get("contaBancariaId") ?? "").trim();
    const entidadeId = String(formData.get("entidadeId") ?? "").trim();

    try {
      const versao = await declararTitular({
        contaBancariaId,
        entidadeId,
        ato: {
          atoTipo: String(formData.get("atoTipo") ?? "") as TipoDeAtoDeclarado,
          atoNumero: String(formData.get("atoNumero") ?? "").trim(),
          atoAno: Number.parseInt(String(formData.get("atoAno") ?? ""), 10),
          atoDispositivo: String(formData.get("atoDispositivo") ?? "").trim(),
          atoCitacao: String(formData.get("atoCitacao") ?? "").trim(),
        },
      });
      revalidatePath("/financeiro/contas-bancarias");
      return {
        sucesso:
          versao === 1
            ? "Titular declarado. As próximas guias que entrarem nesta conta nascem com esta entidade; as que já entraram continuam como estão."
            : `Titular alterado (versão ${String(versao)}). As guias já arrecadadas NÃO mudam de entidade — elas guardam quem era o titular no dia em que o dinheiro entrou.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível declarar o titular." };
    }
  });
}
