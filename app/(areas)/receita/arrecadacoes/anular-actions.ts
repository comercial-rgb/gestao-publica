"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { anularReceita } from "../../../../lib/portas/anulacao";
import { meioDiaCivil } from "../../../../packages/datas/index";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoAnulacaoReceita {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — anula uma arrecadação (TR 4.61) e revalida a lista.
 *
 * ⚠️ TOTAL apenas — o serviço do M04 não tem parcial. O `numero` é o da GUIA DE ANULAÇÃO (um
 * documento próprio, não o da guia original). A cascata (dívida ativa, operação de crédito) é do
 * domínio; a mensagem dele sobe como veio.
 */
export async function anularReceitaAction(
  _prev: EstadoAnulacaoReceita,
  formData: FormData
): Promise<EstadoAnulacaoReceita> {
  // V4 (§10): fora de `actions.ts`, ficou sem o comando do formulário na unidade 1 (o mesmo
  // defeito da anulação da despesa, achado pelo percurso). O guard varre `"use server"`.
  return comComandoDoFormulario(formData, () => anularArrecadacao(formData));
}

async function anularArrecadacao(formData: FormData): Promise<EstadoAnulacaoReceita> {
  const receitaId = String(formData.get("receitaId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();

  if (numero === "") return { erro: "O número da guia de anulação é obrigatório." };
  if (dataBruta === "") return { erro: "A data da anulação é obrigatória." };

  try {
    await anularReceita({
      receitaId,
      numeroReceita: numero,
      data: meioDiaCivil(dataBruta),
    });
    revalidatePath("/receita/arrecadacoes");
    return { sucesso: `Anulação ${numero} registrada.` };
  } catch (e) {
    return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível anular a arrecadação." };
  }
}
