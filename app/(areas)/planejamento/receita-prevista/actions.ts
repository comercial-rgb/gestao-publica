"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { detalharLinhaPrevista } from "../../../../lib/portas/receita-prevista";
import { preverReceitaPorRateioPelaTela } from "../../../../lib/portas/fontes-da-natureza";

export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function detalharAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const d = t(f, "tipoDeducaoSagres");
    try {
      const sucesso = await detalharLinhaPrevista({
        receitaPrevistaId: t(f, "receitaPrevistaId"),
        tipoDeducaoSagres: d === "3" || d === "4" || d === "5" ? d : null,
        codigoNoDocumento: t(f, "codigoNoDocumento") === "" ? null : t(f, "codigoNoDocumento"),
        documento: t(f, "documento"),
      });
      revalidatePath("/planejamento/receita-prevista");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o detalhe. Nada foi gravado.") };
    }
  });
}

/** V36 — a previsão da natureza por um valor só, rateado pelas fontes da composição (domínio: tudo ou nada). */
export async function preverPorRateioAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => {
    const exercicio = Number(t(f, "exercicio"));
    if (!Number.isInteger(exercicio)) return { erro: "Exercício inválido." };
    if (t(f, "natureza") === "") return { erro: "Escolha a natureza." };
    if (t(f, "valor") === "") return { erro: "Informe o valor a ratear." };
    try {
      const partes = await preverReceitaPorRateioPelaTela({ exercicio, naturezaReceita: t(f, "natureza"), valor: t(f, "valor") });
      revalidatePath("/planejamento/receita-prevista");
      return { sucesso: `Previsão gravada em ${String(partes.length)} fonte(s): ${partes.map((p) => `${p.fonte} R$ ${p.valor.replace(".", ",")}`).join("; ")}.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a previsão. Nada foi gravado.") };
    }
  });
}
