"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { preverTransferenciaPelaTela } from "../../../../../lib/portas/transferencias-ppa";

export interface EstadoDaTransferencia {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 — grava a previsão (ou a correção, com motivo) da transferência financeira de uma entidade num ano do PPA. */
export async function preverTransferenciaAction(_p: EstadoDaTransferencia, f: FormData): Promise<EstadoDaTransferencia> {
  return comComandoDoFormulario(f, async () => {
    const t = (k: string): string => String(f.get(k) ?? "").trim();
    const ano = Number(t("ano"));
    if (t("entidadeId") === "") return { erro: "Escolha a entidade de destino." };
    if (!Number.isInteger(ano)) return { erro: "Escolha o ano." };
    if (t("valor") === "") return { erro: "Informe o valor previsto." };
    try {
      const r = await preverTransferenciaPelaTela({ planoId: t("planoId"), entidadeId: t("entidadeId"), ano, valor: t("valor"), finalidade: t("finalidade"), motivo: t("motivo") });
      revalidatePath("/planejamento/ppa/transferencias");
      return { sucesso: r.anterior === null ? `Previsão de ${String(ano)} registrada.` : `Previsão de ${String(ano)} corrigida (versão ${String(r.versao)}; antes, ${formatarMoeda(r.anterior).texto}).` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a previsão. Nada foi gravado.") };
    }
  });
}
