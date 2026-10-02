"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { registrarAgrupamentoPelaTela } from "../../../../lib/portas/agrupamento-da-folha";

export interface EstadoDoAgrupamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function registrarAgrupamentoAction(_p: EstadoDoAgrupamento, f: FormData): Promise<EstadoDoAgrupamento> {
  return comComandoDoFormulario(f, async () => {
    const liquidacaoId = t(f, "liquidacaoId");
    const numero = t(f, "numeroDaLiquidacao");
    if (liquidacaoId === "" && numero === "") return { erro: "Escolha a liquidação da folha, ou informe o número da liquidação de uma folha de outro sistema." };
    if (liquidacaoId !== "" && numero !== "") return { erro: "Escolha a liquidação OU informe o número, não os dois." };
    const ano = Number(t(f, "ano"));
    try {
      const sucesso = await registrarAgrupamentoPelaTela({
        liquidacaoId: liquidacaoId || null,
        numeroDaLiquidacao: numero || null,
        ano,
        codigo: t(f, "codigo"),
        ugId: t(f, "ugId"),
        competencia: t(f, "competencia"),
        sistemaDeOrigem: t(f, "sistemaDeOrigem"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/folha/agrupamento-no-tribunal");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o código. Nada foi gravado.") };
    }
  });
}
