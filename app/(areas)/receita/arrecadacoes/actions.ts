"use server";

import { revalidatePath } from "next/cache";
import { registrarGuia } from "../../../../lib/portas/arrecadacao";
import { meioDiaCivil } from "../../../../packages/datas/index";

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
  const exBruto = Number.parseInt(String(formData.get("exercicio") ?? ""), 10);
  const naturezaReceita = String(formData.get("natureza") ?? "").trim();
  const fonte = String(formData.get("fonte") ?? "").trim();
  const co = String(formData.get("co") ?? "").trim();
  const valor = String(formData.get("valor") ?? "").trim();
  const numeroReceita = String(formData.get("numeroReceita") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();
  const exercicioFonte = String(formData.get("exercicioFonte") ?? "1") === "2" ? 2 : 1;

  if (!Number.isInteger(exBruto)) return { erro: "Exercício inválido." };
  if (dataBruta === "") return { erro: "A data de arrecadação é obrigatória." };

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
    });
    revalidatePath("/receita/arrecadacoes");
    return { sucesso: `Guia ${numeroReceita} registrada.` };
  } catch (e) {
    return {
      erro: e instanceof Error ? e.message : "Não foi possível registrar a guia.",
    };
  }
}
