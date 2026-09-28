"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { registrarGuiaDistribuida } from "../../../../../lib/portas/arrecadacao";
import { meioDiaCivil } from "../../../../../packages/datas/index";

/**
 * A GUIA REPARTIDA ENTRE FONTES (C30).
 *
 * ⚠️ AS PARCELAS CHEGAM EM LISTAS PARALELAS, e a correspondência é POSICIONAL: `getAll` devolve os
 * valores na ordem do DOM, então a fonte `i` casa com o exercício `i` e com o valor `i`. Se os
 * tamanhos divergirem, a repartição sai trocada — e uma guia que carimba a fonte errada fecha o
 * total igual, que é o que torna esse erro invisível. Por isso a conferência de tamanho é a
 * primeira coisa aqui. (A lição é da guia de recolhimento, onde o mesmo risco existe.)
 *
 * ⚠️ E O TOTAL NÃO É CONFERIDO AQUI. Quem compara o total com a soma das parcelas é o domínio, e a
 * recusa dele diz os dois números e a diferença. Repetir a conta nesta camada criaria a segunda
 * verdade que, no dia em que as duas divergissem, ninguém saberia qual acreditar.
 */

export interface EstadoDaGuiaDistribuida {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function distribuirAction(
  _p: EstadoDaGuiaDistribuida,
  f: FormData
): Promise<EstadoDaGuiaDistribuida> {
  return comComandoDoFormulario(f, async () => {
    const exercicio = Number.parseInt(t(f, "exercicio"), 10);
    if (!Number.isInteger(exercicio)) return { erro: "Exercício inválido." };

    const fontes = f.getAll("fonte").map((x) => String(x));
    const exercicios = f.getAll("exercicioFonte").map((x) => String(x));
    const valores = f.getAll("parcela").map((x) => String(x).trim());
    if (fontes.length !== valores.length || fontes.length !== exercicios.length) {
      return {
        erro:
          "A repartição chegou incompleta ao servidor e nada foi gravado. Recarregue a página e " +
          "informe os valores de novo.",
      };
    }

    if (t(f, "contaBancaria") === "") {
      return { erro: "Informe a conta bancária que recebeu o dinheiro. Nada foi gravado." };
    }
    if (t(f, "data") === "") return { erro: "A data de arrecadação é obrigatória." };
    if (t(f, "numeroReceita") === "") return { erro: "Informe o número da guia." };
    if (t(f, "valor") === "") return { erro: "Informe o total do depósito." };

    const parcelas = fontes
      .map((fonte, i) => ({
        fonte,
        exercicioFonte: exercicios[i] === "2" ? (2 as const) : (1 as const),
        valor: valores[i] ?? "",
      }))
      .filter((p) => p.valor !== "");

    // ⚠️ A FORMA DO VALOR, CONFERIDA AQUI PARA A RECUSA SER LEGÍVEL. A máscara do formulário
    // (`CampoValor`) já submete o valor CRU; esta guarda existe para quem não passa por ela — e
    // para que um valor torto produza uma frase em vez de "[DecimalError] Invalid argument:
    // 60.000,00", que é verdade, é ilegível e vaza o nome de uma biblioteca para o operador.
    // ⚠️ E ELA NÃO CONVERTE NADA: converter aqui seria um segundo normalizador de dinheiro, e a
    // interface já tem um só.
    const tortas = parcelas.filter((p) => !/^\d+(\.\d{1,2})?$/.test(p.valor));
    if (tortas.length > 0) {
      return {
        erro:
          `O valor informado para a(s) fonte(s) ${tortas.map((p) => p.fonte).join(", ")} é inválido. ` +
          `Informe no formato 60.000,00. Nada foi gravado.`,
      };
    }

    // A linha da fonte que a LOA não previu — só entra quando a pessoa a escolheu E deu valor.
    const outraFonte = t(f, "outraFonte");
    const outroValor = t(f, "outroValor");
    const outroFundamento = t(f, "outroFundamento");
    if (outraFonte !== "" && outroValor === "") {
      return {
        erro: `Informe o valor da fonte ${outraFonte}. Nada foi gravado.`,
      };
    }
    if (outraFonte === "" && outroValor !== "") {
      return { erro: "Informe qual é a fonte do valor da última linha. Nada foi gravado." };
    }
    if (outraFonte !== "" && !/^\d+(\.\d{1,2})?$/.test(outroValor)) {
      return {
        erro: `O valor informado para a fonte ${outraFonte} é inválido. Informe no formato 60.000,00. Nada foi gravado.`,
      };
    }
    if (outraFonte !== "") {
      parcelas.push({
        fonte: outraFonte,
        exercicioFonte: 1 as const,
        valor: outroValor,
        ...(outroFundamento !== "" ? { fundamento: outroFundamento } : {}),
      } as (typeof parcelas)[number]);
    }

    if (parcelas.length === 0) {
      return {
        erro:
          "Informe o valor de ao menos uma fonte. Nada foi gravado.",
      };
    }

    try {
      await registrarGuiaDistribuida({
        exercicio,
        naturezaReceita: t(f, "natureza"),
        ...(t(f, "co") !== "" ? { co: t(f, "co") } : {}),
        valor: t(f, "valor"),
        dataArrecadacao: meioDiaCivil(t(f, "data")),
        numeroReceita: t(f, "numeroReceita"),
        contaBancaria: t(f, "contaBancaria"),
        parcelas,
      });
      revalidatePath("/receita/arrecadacoes");
      revalidatePath("/receita/arrecadacoes/distribuir");
      return {
        sucesso: `Guia ${t(f, "numeroReceita")} registrada, repartida entre ${String(parcelas.length)} fonte(s).`,
      };
    } catch (e) {
      return {
        erro: mensagemDoErro(e, "Não foi possível registrar a guia. Nada foi gravado."),
      };
    }
  });
}
