"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { estornarDeducao, registrarDeducao, registrarLoteDeDeducoes } from "../../../../lib/portas/deducoes-da-receita";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDaDeducao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function registrarDeducaoAction(_p: EstadoDaDeducao, f: FormData): Promise<EstadoDaDeducao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await registrarDeducao({
        naturezaReceita: t(f, "naturezaReceita"),
        fonte: t(f, "fonte"),
        valor: t(f, "valor").replace(/\./g, "").replace(",", "."),
        dia: t(f, "dia"),
        contaBancaria: t(f, "contaBancaria"),
        documento: t(f, "documento"),
      });
      revalidatePath("/receita/deducoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a dedução. Nada foi gravado.") };
    }
  });
}

export async function estornarDeducaoAction(_p: EstadoDaDeducao, f: FormData): Promise<EstadoDaDeducao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await estornarDeducao({ deducaoId: t(f, "deducaoId"), dia: t(f, "dia"), motivo: t(f, "motivo") });
      revalidatePath("/receita/deducoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível estornar a dedução. Nada foi gravado.") };
    }
  });
}

/**
 * V36 (TR 5.10.2.11) — o lote de deduções. As linhas chegam como campos repetidos; a linha inteiramente em branco é
 * ignorada (sobra de formulário), qualquer outra vai ao domínio, que recusa o lote inteiro nomeando a linha.
 */
export async function registrarLoteDeDeducoesAction(_p: EstadoDaDeducao, f: FormData): Promise<EstadoDaDeducao> {
  return comComandoDoFormulario(f, async () => {
    const naturezas = f.getAll("naturezaReceita").map(String);
    const fontes = f.getAll("fonte").map(String);
    const valores = f.getAll("valor").map(String);
    const itens = naturezas
      .map((naturezaReceita, i) => ({ naturezaReceita: naturezaReceita.trim(), fonte: (fontes[i] ?? "").trim(), valor: (valores[i] ?? "").trim() }))
      .filter((l) => l.naturezaReceita !== "" || l.fonte !== "" || l.valor !== "")
      .map((l) => ({ ...l, valor: l.valor.replace(/\./g, "").replace(",", ".") }));
    try {
      const sucesso = await registrarLoteDeDeducoes({ dia: t(f, "dia"), contaBancaria: t(f, "contaBancaria"), documento: t(f, "documento"), itens });
      revalidatePath("/receita/deducoes");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o lote de deduções. Nada foi gravado.") };
    }
  });
}
