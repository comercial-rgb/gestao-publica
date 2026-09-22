"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  publicarEixoDaDotacao,
  publicarRoteiro,
  publicarRoteiroPorFonte,
} from "../../../../lib/portas/roteiro-orcamentario";

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

/**
 * O EIXO DA DOTAÇÃO ADICIONAL (V11 V8.9) — por tipo de crédito ou por fonte, nunca os dois.
 *
 * ⚠️ A RECUSA DO DOMÍNIO SOBE INTEIRA, como na ação do roteiro: é ela que explica por que o
 * mesmo eixo não se republica, e é ela que a pessoa precisa ler.
 */
export async function publicarEixoAction(_p: EstadoDoRoteiro, f: FormData): Promise<EstadoDoRoteiro> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "eixo") === "") return { erro: "Escolha o eixo." };
    if (t(f, "fundamento") === "") return { erro: "Diga por que este eixo." };
    try {
      const sucesso = await publicarEixoDaDotacao({ eixo: t(f, "eixo"), fundamento: t(f, "fundamento") });
      revalidatePath("/contabilidade/roteiros-orcamentarios");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar o eixo. Nada foi gravado.") };
    }
  });
}

export async function publicarPorFonteAction(_p: EstadoDoRoteiro, f: FormData): Promise<EstadoDoRoteiro> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "origem") === "") return { erro: "Origem não informada." };
    if (t(f, "contaDebitoCodigo") === "") return { erro: "Escolha a conta de DÉBITO." };
    if (t(f, "contaCreditoCodigo") === "") return { erro: "Escolha a conta de CRÉDITO." };
    if (t(f, "fundamento") === "") return { erro: "Diga por que estas contas." };
    try {
      const sucesso = await publicarRoteiroPorFonte({
        origem: t(f, "origem"),
        contaDebitoCodigo: t(f, "contaDebitoCodigo"),
        contaCreditoCodigo: t(f, "contaCreditoCodigo"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/roteiros-orcamentarios");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar o roteiro por fonte. Nada foi gravado.") };
    }
  });
}
