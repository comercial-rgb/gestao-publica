"use server";

import { revalidatePath } from "next/cache";
import { desmascararValor } from "../../../../../../lib/format/mascaras";
import { comComandoDoFormulario } from "../../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
import { registrarPreviaPelaTela } from "../../../../../../lib/portas/previa-da-retencao";
import { lerOperacaoFiscal } from "../../../pagamentos/operacao-fiscal";

/** V39-R3 (R3-014) — guardar a prévia das retenções na liquidação. Nenhuma regra aqui: o serviço calcula e cobra LIQUIDAR. */
export interface EstadoDaPreviaGuardada {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function guardarPreviaAction(_p: EstadoDaPreviaGuardada, f: FormData): Promise<EstadoDaPreviaGuardada> {
  return comComandoDoFormulario(f, async () => {
    const liquidacaoId = texto(f, "liquidacaoId");
    const valor = desmascararValor(texto(f, "valor"));
    const data = texto(f, "data");
    if (liquidacaoId === "" || valor === "" || data === "") return { erro: "Informe o valor e a data previstos do pagamento. Nada foi gravado." };
    const operacao = lerOperacaoFiscal(f, valor);
    if (typeof operacao === "string") return { erro: `${operacao} Nada foi gravado.` };
    try {
      const sucesso = await registrarPreviaPelaTela({ liquidacaoId, valorPrevisto: valor, dataPrevista: data, operacao });
      revalidatePath(`/despesa/liquidacoes/${liquidacaoId}/retencoes`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível guardar a prévia. Nada foi gravado.") };
    }
  });
}
