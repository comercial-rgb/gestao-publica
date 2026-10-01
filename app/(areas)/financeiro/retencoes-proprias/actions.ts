"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { registrarClassificacaoDaRetencaoPropria, regularizarRetencaoAntiga } from "../../../../lib/portas/retencoes-proprias";
import { FATOS_DA_RETENCAO_PROPRIA, type FatoDaRetencaoPropria } from "../../../../lib/portas/retencoes-proprias";

/**
 * V26 — A AÇÃO DA CLASSIFICAÇÃO DO IR E DO ISS PRÓPRIOS. Nenhuma regra aqui: natureza do principal, contas
 * analíticas da família e o histórico append-only são conferidos dentro da transação, e a recusa sobe inteira.
 */

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function classificarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const fato = t(f, "fato");
    if (!(FATOS_DA_RETENCAO_PROPRIA as readonly string[]).includes(fato)) return { erro: "Escolha o imposto retido." };
    for (const [campo, msg] of [
      ["tipoConsignacaoCodigo", "Escolha a consignação em que este imposto era retido."],
      ["naturezaReceitaCodigo", "Escolha a natureza de receita."],
      ["fonteCodigo", "Escolha a destinação (fonte) da receita."],
      ["contaCreditoCodigo", "Escolha a conta do crédito tributário."],
      ["contaVpaCodigo", "Escolha a conta da variação patrimonial do imposto."],
      ["vigenteDesde", "Informe a data a partir da qual vale."],
      ["fundamento", "Informe de onde vem a decisão."],
    ] as const) {
      if (t(f, campo) === "") return { erro: msg };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t(f, "vigenteDesde"))) return { erro: "A data deve estar no formato dia/mês/ano." };
    try {
      const sucesso = await registrarClassificacaoDaRetencaoPropria({
        fato: fato as FatoDaRetencaoPropria,
        tipoConsignacaoCodigo: t(f, "tipoConsignacaoCodigo"),
        naturezaReceitaCodigo: t(f, "naturezaReceitaCodigo"),
        fonteCodigo: t(f, "fonteCodigo"),
        contaCreditoCodigo: t(f, "contaCreditoCodigo"),
        contaVpaCodigo: t(f, "contaVpaCodigo"),
        entidadeTitularId: t(f, "entidadeTitularId") === "" ? null : t(f, "entidadeTitularId"),
        vigenteDesde: new Date(`${t(f, "vigenteDesde")}T00:00:00.000Z`),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/financeiro/retencoes-proprias");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a decisão. Nada foi gravado.") };
    }
  });
}

export async function regularizarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "ingressoId") === "") return { erro: "Escolha a retenção a regularizar." };
    if (t(f, "motivo").length < 10) return { erro: "Diga por que a retenção está sendo regularizada, com pelo menos 10 caracteres." };
    try {
      const sucesso = await regularizarRetencaoAntiga({
        ingressoId: t(f, "ingressoId"),
        motivo: t(f, "motivo"),
        reconhecimentoId: t(f, "reconhecimentoId") === "" ? null : t(f, "reconhecimentoId"),
      });
      revalidatePath("/financeiro/retencoes-proprias");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível regularizar. Nada foi gravado.") };
    }
  });
}
