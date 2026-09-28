"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { publicarRoteiroDeRestos } from "../../../../lib/portas/roteiro-restos";

/**
 * A AÇÃO DAS CONTAS DAS OPERAÇÕES DE RESTOS A PAGAR (V15).
 *
 * ⚠️ A RECUSA DO DOMÍNIO SOBE INTEIRA. É ela que LISTA as analíticas sob uma conta sintética, que
 * diz por que um par pela metade não fecha, e que explica por que o pagamento não recebe contas
 * patrimoniais aqui. Resumir tiraria de quem configura exatamente o que ele precisa para decidir.
 */

export interface EstadoDoRoteiroDeRestos {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const ou = (f: FormData, k: string): string | null => (t(f, k) === "" ? null : t(f, k));

export async function publicarRoteiroDeRestosAction(
  _p: EstadoDoRoteiroDeRestos,
  f: FormData
): Promise<EstadoDoRoteiroDeRestos> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "evento") === "") return { erro: "Operação não informada." };
    if (t(f, "fundamento") === "") {
      return { erro: "Informe o fundamento da parametrização: plano de contas do ente, norma ou orientação do tribunal." };
    }
    try {
      const sucesso = await publicarRoteiroDeRestos({
        evento: t(f, "evento"),
        contaDebitoCodigo: ou(f, "contaDebitoCodigo"),
        contaCreditoCodigo: ou(f, "contaCreditoCodigo"),
        contaControleDebitoCodigo: ou(f, "contaControleDebitoCodigo"),
        contaControleCreditoCodigo: ou(f, "contaControleCreditoCodigo"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/contabilidade/roteiros-de-restos-a-pagar");
      revalidatePath("/despesa/restos-a-pagar");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível publicar as contas. Nada foi gravado.") };
    }
  });
}
