"use server";

import { revalidatePath } from "next/cache";
import {
  abrirPeriodo,
  atribuirContaDaArrecadacao,
  encerrarPeriodo,
  incluirPendenciaManual,
  justificar,
} from "../../../../../lib/portas/tesouraria";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";

export interface EstadoConciliacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Período aberto, encadeamento com a anterior,
 * amarração que precisa fechar antes do encerramento — tudo é decidido pelo domínio,
 * dentro da transação, e a mensagem volta COMO VEIO.
 *
 * ⚠️ E AS DATAS SÃO DIAS CIVIS (`YYYY-MM-DD`), repassados como texto. Montar um `Date`
 * aqui traria de volta o defeito que o ADR da data civil fechou: `new Date("2026-06-01")`
 * é meia-noite UTC, que no horário do ente ainda é 31/05 às 21:00.
 */
export async function abrirPeriodoAction(
  _prev: EstadoConciliacao,
  formData: FormData
): Promise<EstadoConciliacao> {
  return comComandoDoFormulario(formData, async () => {
    const conta = String(formData.get("conta") ?? "").trim();
    const inicio = String(formData.get("inicio") ?? "").trim();
    const fim = String(formData.get("fim") ?? "").trim();

    if (conta === "") return { erro: "Escolha a conta bancária." };
    if (inicio === "" || fim === "") return { erro: "Informe o período." };

    try {
      await abrirPeriodo(conta, inicio, fim);
      revalidatePath("/financeiro/conciliacao/periodo");
      return { sucesso: `Conciliação de ${inicio} a ${fim} aberta.` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível abrir o período." };
    }
  });
}

export async function encerrarPeriodoAction(
  _prev: EstadoConciliacao,
  formData: FormData
): Promise<EstadoConciliacao> {
  return comComandoDoFormulario(formData, async () => {
    const id = String(formData.get("conciliacaoId") ?? "").trim();
    if (id === "") return { erro: "Conciliação não informada." };

    try {
      const rotulo = await encerrarPeriodo(id);
      revalidatePath("/financeiro/conciliacao/periodo");
      return { sucesso: `Conciliação de ${rotulo} ENCERRADA.` };
    } catch (e) {
      return {
        erro: e instanceof Error ? e.message : "Não foi possível encerrar o período.",
      };
    }
  });
}

export async function pendenciaManualAction(
  _prev: EstadoConciliacao,
  formData: FormData
): Promise<EstadoConciliacao> {
  return comComandoDoFormulario(formData, async () => {
    const conciliacaoId = String(formData.get("conciliacaoId") ?? "").trim();
    const descricao = String(formData.get("descricao") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    const natureza = String(formData.get("natureza") ?? "");

    if (natureza !== "CREDITO" && natureza !== "DEBITO") {
      return { erro: "Escolha a natureza da pendência." };
    }

    try {
      await incluirPendenciaManual({
        conciliacaoId,
        descricao,
        motivo,
        valor,
        natureza,
      });
      revalidatePath("/financeiro/conciliacao/periodo");
      return { sucesso: "Pendência registrada." };
    } catch (e) {
      return {
        erro: e instanceof Error ? e.message : "Não foi possível registrar a pendência.",
      };
    }
  });
}

export async function justificarAction(
  _prev: EstadoConciliacao,
  formData: FormData
): Promise<EstadoConciliacao> {
  return comComandoDoFormulario(formData, async () => {
    const conciliacaoId = String(formData.get("conciliacaoId") ?? "").trim();
    const lado = String(formData.get("lado") ?? "").trim();
    const referencia = String(formData.get("referencia") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();

    try {
      await justificar({ conciliacaoId, lado, referencia, motivo });
      revalidatePath("/financeiro/conciliacao/periodo");
      return { sucesso: "Justificativa registrada." };
    } catch (e) {
      return {
        erro: e instanceof Error ? e.message : "Não foi possível justificar a pendência.",
      };
    }
  });
}

/**
 * V6 P1.2 — ATRIBUIR A CONTA BANCÁRIA a uma arrecadação do legado. O domínio confere fonte e a
 * perna de disponibilidade do razão contra a conta contábil da conta; a recusa sobe como veio.
 */
export async function atribuirContaAction(
  _prev: EstadoConciliacao,
  formData: FormData
): Promise<EstadoConciliacao> {
  return comComandoDoFormulario(formData, async () => {
    const receitaArrecadadaId = String(formData.get("receitaArrecadadaId") ?? "").trim();
    const contaBancariaId = String(formData.get("contaBancariaId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (receitaArrecadadaId === "" || contaBancariaId === "") return { erro: "Guia ou conta não identificada. Nada foi gravado." };
    try {
      await atribuirContaDaArrecadacao({ receitaArrecadadaId, contaBancariaId, motivo });
      revalidatePath("/financeiro/conciliacao/periodo");
      return { sucesso: "Conta atribuída: a guia passa a contar no lado interno desta conta. Vincule-a à linha do extrato para fechar." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível atribuir a conta." };
    }
  });
}
