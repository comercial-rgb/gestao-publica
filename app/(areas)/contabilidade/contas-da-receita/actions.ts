"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { declararContaDaReceitaNaTela } from "../../../../lib/portas/contas-da-receita";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDaContaDaReceita {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararContaDaReceitaAction(_p: EstadoDaContaDaReceita, f: FormData): Promise<EstadoDaContaDaReceita> {
  return comComandoDoFormulario(f, async () => {
    if (!/^\d{2,8}$/.test(t(f, "naturezaPrefixo"))) return { erro: "Informe o início da natureza de receita, de 2 a 8 dígitos (ex.: 1118 ou 11180111)." };
    if (t(f, "contaVpaCodigo") === "") return { erro: "Escolha a conta de variação patrimonial aumentativa." };
    if (t(f, "fundamento") === "") return { erro: "Informe o fundamento da declaração." };
    try {
      const sucesso = await declararContaDaReceitaNaTela({
        naturezaPrefixo: t(f, "naturezaPrefixo"),
        contaVpaCodigo: t(f, "contaVpaCodigo"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/contas-da-receita");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar a conta da receita. Nada foi gravado.") };
    }
  });
}
