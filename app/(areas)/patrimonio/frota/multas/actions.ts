"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { baixarMultaPelaTela, registrarMultaPelaTela } from "../../../../../lib/portas/multas-de-transito";

export interface EstadoDaMulta {
  readonly erro?: string;
  readonly sucesso?: string;
}

/** V36 — registra a multa de trânsito de um veículo da frota (e o lançamento de controle). */
export async function registrarMultaAction(_p: EstadoDaMulta, f: FormData): Promise<EstadoDaMulta> {
  return comComandoDoFormulario(f, async () => {
    const t = (k: string): string => String(f.get(k) ?? "").trim();
    if (t("veiculoId") === "") return { erro: "Escolha o veículo." };
    if (t("valor") === "") return { erro: "Informe o valor da multa." };
    try {
      await registrarMultaPelaTela({
        veiculoId: t("veiculoId"), orgaoAutuador: t("orgaoAutuador"), numeroDoAuto: t("numeroDoAuto"),
        diaDaInfracao: t("diaDaInfracao"), diaDaNotificacao: t("diaDaNotificacao"), diaDoVencimento: t("diaDoVencimento"),
        local: t("local"), infracao: t("infracao"), valor: t("valor"), infratorDocumento: t("infratorDocumento"),
      });
      revalidatePath("/patrimonio/frota/multas");
      return { sucesso: `Multa do auto ${t("numeroDoAuto")} registrada no valor de R$ ${formatarMoeda(t("valor")).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a multa. Nada foi gravado.") };
    }
  });
}

/** V36 — baixa a multa (paga, ressarcida, cancelada ou registro indevido). */
export async function baixarMultaAction(_p: EstadoDaMulta, f: FormData): Promise<EstadoDaMulta> {
  return comComandoDoFormulario(f, async () => {
    const t = (k: string): string => String(f.get(k) ?? "").trim();
    if (t("multaId") === "") return { erro: "Escolha a multa." };
    try {
      await baixarMultaPelaTela({ multaId: t("multaId"), tipo: t("tipo"), dia: t("dia"), observacao: t("observacao") });
      revalidatePath("/patrimonio/frota/multas");
      return { sucesso: "Multa baixada." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível baixar a multa. Nada foi gravado.") };
    }
  });
}
