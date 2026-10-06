"use server";

import { revalidatePath } from "next/cache";
import { registrarGuia } from "../../../../lib/portas/arrecadacao";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoArrecadacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — registra a guia e revalida a lista.
 *
 * ⚠️ O EXERCÍCIO VEM DO CAMPO OCULTO (o recorte da página), e a data vem do usuário. O
 * `zRegistrarArrecadacaoInput` exige que o ANO da `dataArrecadacao` case com o
 * `exercicio` — e essa conferência é do domínio, com a mensagem dele. Derivar o
 * exercício da data aqui faria a guia de janeiro/2027 entrar calada no exercício 2027
 * enquanto o usuário olhava para a tela de 2026.
 */
export async function arrecadarAction(
  _prev: EstadoArrecadacao,
  formData: FormData
): Promise<EstadoArrecadacao> {
  return comComandoDoFormulario(formData, async () => {
    const exBruto = Number.parseInt(String(formData.get("exercicio") ?? ""), 10);
    const naturezaReceita = String(formData.get("natureza") ?? "").trim();
    const fonte = String(formData.get("fonte") ?? "").trim();
    const co = String(formData.get("co") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    const numeroReceita = String(formData.get("numeroReceita") ?? "").trim();
    const dataBruta = String(formData.get("data") ?? "").trim();
    const exercicioFonte = String(formData.get("exercicioFonte") ?? "1") === "2" ? 2 : 1;
    const contaBancaria = String(formData.get("contaBancaria") ?? "").trim();
    const reconhecimentoId = String(formData.get("reconhecimentoId") ?? "").trim();
    const dividaAtivaId = String(formData.get("dividaAtivaId") ?? "").trim();
    const dividaFundadaId = String(formData.get("dividaFundadaId") ?? "").trim();

    if (!Number.isInteger(exBruto)) return { erro: "Exercício inválido." };
    if (dataBruta === "") return { erro: "A data de arrecadação é obrigatória." };
    if (contaBancaria === "") return { erro: "Informe a conta bancária que recebeu o dinheiro. Nada foi gravado." };

    try {
      await registrarGuia({
        exercicio: exBruto,
        naturezaReceita,
        fonte,
        ...(co !== "" ? { co } : {}),
        exercicioFonte,
        valor,
        dataArrecadacao: meioDiaCivil(dataBruta),
        numeroReceita,
        contaBancaria,
        ...(reconhecimentoId !== "" ? { reconhecimentoId } : {}),
        ...(dividaAtivaId !== "" ? { dividaAtivaId } : {}),
        ...(dividaFundadaId !== "" ? { dividaFundadaId } : {}),
      });
      revalidatePath("/divida/ativa");
      revalidatePath("/divida/fundada");
      revalidatePath("/receita/arrecadacoes");
      return {
        sucesso:
          reconhecimentoId !== "" ? `Guia ${numeroReceita} registrada, quitando o crédito lançado escolhido.`
          : dividaAtivaId !== "" ? `Guia ${numeroReceita} registrada, recebendo a dívida ativa escolhida.`
          : dividaFundadaId !== "" ? `Guia ${numeroReceita} registrada como ingresso da operação de crédito escolhida.`
          : `Guia ${numeroReceita} registrada.`,
      };
    } catch (e) {
      return {
        erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar a guia.",
      };
    }
  });
}
