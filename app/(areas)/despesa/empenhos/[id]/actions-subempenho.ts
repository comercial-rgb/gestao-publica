"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { anularSaldoDoSubempenhoPelaTela, emitirSubempenhoPelaTela } from "../../../../../lib/portas/subempenhos";
import { meioDiaCivil } from "../../../../../packages/datas/index";

export interface EstadoDoSubempenho {
  readonly erro?: string;
  readonly sucesso?: string;
}

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/** V36 — emite o subempenho sobre o empenho global ou estimativo. */
export async function emitirSubempenhoAction(_p: EstadoDoSubempenho, f: FormData): Promise<EstadoDoSubempenho> {
  return comComandoDoFormulario(f, async () => {
    const t = (k: string): string => String(f.get(k) ?? "").trim();
    if (t("valor") === "") return { erro: "Informe o valor do subempenho." };
    if (!DIA.test(t("data"))) return { erro: "Informe a data do subempenho." };
    try {
      const r = await emitirSubempenhoPelaTela({ empenhoId: t("empenhoId"), valor: t("valor"), data: meioDiaCivil(t("data")), historico: t("historico") });
      revalidatePath(`/despesa/empenhos/${t("empenhoId")}`);
      revalidatePath("/despesa/liquidacoes");
      return { sucesso: `Subempenho ${r.rotulo} emitido no valor de R$ ${formatarMoeda(t("valor")).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível emitir o subempenho. Nada foi gravado.") };
    }
  });
}

/** V36 — anula o saldo não liquidado (todo ou parte) de um subempenho. */
export async function anularSubempenhoAction(_p: EstadoDoSubempenho, f: FormData): Promise<EstadoDoSubempenho> {
  return comComandoDoFormulario(f, async () => {
    const t = (k: string): string => String(f.get(k) ?? "").trim();
    if (t("subempenhoId") === "") return { erro: "Escolha o subempenho." };
    if (t("valor") === "") return { erro: "Informe o valor a anular." };
    if (!DIA.test(t("data"))) return { erro: "Informe a data da anulação." };
    try {
      const r = await anularSaldoDoSubempenhoPelaTela({ subempenhoId: t("subempenhoId"), valor: t("valor"), data: meioDiaCivil(t("data")), motivo: t("motivo") });
      revalidatePath(`/despesa/empenhos/${t("empenhoId")}`);
      revalidatePath("/despesa/liquidacoes");
      return { sucesso: `Anulação registrada. Saldo do subempenho: R$ ${formatarMoeda(r.saldo).texto}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível anular o subempenho. Nada foi gravado.") };
    }
  });
}
