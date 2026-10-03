"use server";

import { revalidatePath } from "next/cache";
import { concederNaTela, decidirPrestacaoNaTela, registrarPrestacaoNaTela } from "../../../../lib/portas/adiantamentos";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/** Diárias e suprimento de fundos (V32). As recusas são do domínio e sobem inteiras. */

export interface EstadoDoAdiantamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const CAMINHO = "/despesa/adiantamentos";

export async function concederAction(_p: EstadoDoAdiantamento, f: FormData): Promise<EstadoDoAdiantamento> {
  return comComandoDoFormulario(f, async () => {
    const especie = t(f, "especie");
    if (especie !== "DIARIA" && especie !== "SUPRIMENTO_DE_FUNDOS") return { erro: "Escolha se é diária ou suprimento de fundos." };
    if (t(f, "empenhoId") === "") return { erro: "Escolha o empenho que paga a concessão." };
    try {
      const sucesso = await concederNaTela({
        especie,
        numero: t(f, "numero"),
        empenhoId: t(f, "empenhoId"),
        beneficiarioNome: t(f, "beneficiarioNome"),
        beneficiarioDocumento: t(f, "beneficiarioDocumento"),
        cargoOuFuncao: t(f, "cargoOuFuncao"),
        finalidade: t(f, "finalidade"),
        destino: t(f, "destino"),
        diaInicio: t(f, "diaInicio"),
        diaFim: t(f, "diaFim"),
        quantidadeDeDiarias: t(f, "quantidadeDeDiarias"),
        valorUnitario: t(f, "valorUnitario"),
        valor: t(f, "valor"),
        atoAutorizativo: t(f, "atoAutorizativo"),
        diaPrazoDePrestacao: t(f, "diaPrazoDePrestacao"),
        diaConcessao: t(f, "diaConcessao"),
      });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível conceder. Nada foi gravado.") };
    }
  });
}

export async function registrarPrestacaoAction(_p: EstadoDoAdiantamento, f: FormData): Promise<EstadoDoAdiantamento> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await registrarPrestacaoNaTela({
        concessaoId: t(f, "concessaoId"),
        valorComprovado: t(f, "valorComprovado"),
        valorDevolvido: t(f, "valorDevolvido") === "" ? "0.00" : t(f, "valorDevolvido"),
        relatorio: t(f, "relatorio"),
        diaApresentacao: t(f, "diaApresentacao"),
      });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a prestação. Nada foi gravado.") };
    }
  });
}

export async function decidirPrestacaoAction(_p: EstadoDoAdiantamento, f: FormData): Promise<EstadoDoAdiantamento> {
  return comComandoDoFormulario(f, async () => {
    const decisao = t(f, "decisao");
    if (decisao !== "aprovar" && decisao !== "rejeitar") return { erro: "Escolha aprovar ou rejeitar." };
    try {
      const sucesso = await decidirPrestacaoNaTela({
        prestacaoId: t(f, "prestacaoId"),
        aprovar: decisao === "aprovar",
        motivo: t(f, "motivo"),
        diaDecisao: t(f, "diaDecisao"),
      });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível decidir a prestação. Nada foi gravado.") };
    }
  });
}
