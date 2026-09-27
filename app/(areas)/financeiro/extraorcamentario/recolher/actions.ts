"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { registrarRecolhimento } from "../../../../../lib/portas/extraorcamentario";

/**
 * O RECOLHIMENTO COM A SUA COMPOSIÇÃO (C34).
 *
 * ⚠️ AS PARCELAS CHEGAM EM LISTAS PARALELAS, e a correspondência é POSICIONAL: `getAll` devolve os
 * valores na ordem do DOM, então a retenção `i` casa com o valor `i`. Se os dois tamanhos
 * divergirem, a composição sai trocada — e uma guia que quita a retenção errada fecha o saldo
 * agregado igual. Por isso a conferência de tamanho é a primeira coisa aqui.
 *
 * ⚠️ E A RECUSA DO DOMÍNIO SOBE INTEIRA: é ela que diz quanto cada retenção ainda tem a recolher,
 * e é esse número que o operador precisa para corrigir.
 */

export interface EstadoDoRecolhimento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function recolherAction(
  _p: EstadoDoRecolhimento,
  f: FormData
): Promise<EstadoDoRecolhimento> {
  return comComandoDoFormulario(f, async () => {
    const ingressos = f.getAll("ingressoId").map((x) => String(x));
    const valores = f.getAll("parcela").map((x) => String(x).trim());
    if (ingressos.length !== valores.length) {
      return {
        erro:
          "A composição chegou incompleta ao servidor e nada foi gravado. Recarregue a página e " +
          "informe as parcelas de novo.",
      };
    }
    if (t(f, "tipo") === "") return { erro: "Escolha a consignação." };
    if (t(f, "credor") === "") return { erro: "Informe o consignatário." };
    if (t(f, "contaBancaria") === "") return { erro: "Escolha a conta bancária." };
    if (t(f, "data") === "") return { erro: "Informe a data do recolhimento." };
    if (t(f, "historico") === "") return { erro: "Informe o histórico." };

    const parcelas = ingressos
      .map((ingressoId, i) => ({ ingressoId, valor: valores[i] ?? "" }))
      .filter((p) => p.valor !== "");
    if (parcelas.length === 0) {
      return {
        erro:
          "Informe o valor de ao menos uma retenção. Um recolhimento sem composição não pode ser " +
          "conciliado por origem. Nada foi gravado.",
      };
    }

    try {
      const sucesso = await registrarRecolhimento({
        tipoConsignacaoCodigo: t(f, "tipo"),
        credorConsignatario: t(f, "credor"),
        contaBancaria: t(f, "contaBancaria"),
        data: t(f, "data"),
        historico: t(f, "historico"),
        parcelas,
      });
      revalidatePath("/financeiro/extraorcamentario");
      revalidatePath("/financeiro/extraorcamentario/recolher");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o recolhimento. Nada foi gravado.") };
    }
  });
}
