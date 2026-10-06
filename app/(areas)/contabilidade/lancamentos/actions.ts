"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { estornarLancamentoManual, registrarLancamentoManual, type PartidaDaTela } from "../../../../lib/portas/lancamento-manual";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoDoLancamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * O LANÇAMENTO MANUAL (V22 rodada 7). ⚠️ NENHUMA REGRA AQUI: partida dobrada por subsistema, conta
 * analítica, período aberto e autorização são do domínio; a mensagem volta como veio. Esta action só
 * lê as linhas do formulário (as vazias são ignoradas — o formulário oferece linhas a mais).
 */
export async function registrarLancamentoAction(_prev: EstadoDoLancamento, formData: FormData): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    const dia = String(formData.get("dia") ?? "").trim();
    const numeroControle = String(formData.get("numeroControle") ?? "").trim();
    const historico = String(formData.get("historico") ?? "").trim();
    if (dia === "") return { erro: "Informe a data do fato." };
    if (numeroControle === "") return { erro: "Informe o número de controle do lançamento." };
    if (historico === "") return { erro: "Informe o histórico." };
    const partidas: PartidaDaTela[] = [];
    for (let i = 0; formData.has(`partidas.${i}.conta`); i++) {
      const conta = String(formData.get(`partidas.${i}.conta`) ?? "").trim();
      const tipo = String(formData.get(`partidas.${i}.tipo`) ?? "");
      const valor = String(formData.get(`partidas.${i}.valor`) ?? "").trim();
      if (conta === "" && valor === "") continue;
      if (conta === "" || valor === "") return { erro: `Partida ${i + 1}: informe a conta e o valor.` };
      if (tipo !== "DEBITO" && tipo !== "CREDITO") return { erro: `Partida ${i + 1}: escolha débito ou crédito.` };
      partidas.push({ conta, tipo, valor });
    }
    if (partidas.length < 2) return { erro: "O lançamento precisa de ao menos um débito e um crédito." };
    try {
      await registrarLancamentoManual({ numeroControle, dia, historico, partidas });
      revalidatePath("/contabilidade/lancamentos");
      return { sucesso: `Lançamento ${numeroControle} registrado no razão.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar o lançamento." };
    }
  });
}

export async function estornarLancamentoAction(_prev: EstadoDoLancamento, formData: FormData): Promise<EstadoDoLancamento> {
  return comComandoDoFormulario(formData, async () => {
    const lancamentoId = String(formData.get("lancamentoId") ?? "").trim();
    const numeroControle = String(formData.get("numeroControle") ?? "").trim();
    const dia = String(formData.get("dia") ?? "").trim();
    if (lancamentoId === "") return { erro: "Escolha o lançamento a estornar." };
    if (numeroControle === "" || dia === "") return { erro: "Informe o número e a data do estorno." };
    try {
      await estornarLancamentoManual({ lancamentoId, numeroControle, dia });
      revalidatePath("/contabilidade/lancamentos");
      return { sucesso: `Estorno ${numeroControle} registrado. O lançamento original continua no razão, com o estorno ligado a ele.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível estornar o lançamento." };
    }
  });
}
