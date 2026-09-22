"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { publicarRoteiro } from "../../../../lib/portas/roteiro-orcamentario";

/**
 * A AÇÃO DO ROTEIRO ORÇAMENTÁRIO (V11 V8.4).
 *
 * ⚠️ A RECUSA DO DOMÍNIO SOBE INTEIRA — é ela que LISTA as analíticas sob uma conta sintética.
 * Resumi-la tiraria da pessoa exatamente a informação de que ela precisa para escolher, que foi o
 * que manteve estas pendências abertas por vários lotes.
 */

export interface EstadoDoRoteiro {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function publicarRoteiroAction(_p: EstadoDoRoteiro, f: FormData): Promise<EstadoDoRoteiro> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "tipo") === "") return { erro: "Movimento não informado." };
    if (t(f, "contaDebitoCodigo") === "") return { erro: "Escolha a conta de DÉBITO." };
    if (t(f, "contaCreditoCodigo") === "") return { erro: "Escolha a conta de CRÉDITO." };
    if (t(f, "fundamento") === "") return { erro: "Diga por que estas contas." };
    try {
      const sucesso = await publicarRoteiro({
        tipo: t(f, "tipo"),
        tipoCredito: t(f, "tipoCredito") === "" ? null : t(f, "tipoCredito"),
        abertura: t(f, "abertura") === "" ? null : t(f, "abertura"),
        contaDebitoCodigo: t(f, "contaDebitoCodigo"),
        contaCreditoCodigo: t(f, "contaCreditoCodigo"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/roteiros-orcamentarios");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar o roteiro. Nada foi gravado.") };
    }
  });
}
