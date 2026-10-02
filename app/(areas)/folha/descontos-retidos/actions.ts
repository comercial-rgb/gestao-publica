"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { declararConsignacaoDaRubricaNaTela } from "../../../../lib/portas/descontos-da-folha";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDoDesconto {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function declararDescontoAction(_p: EstadoDoDesconto, f: FormData): Promise<EstadoDoDesconto> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "rubricaId") === "") return { erro: "Rubrica não informada." };
    if (t(f, "tipoConsignacaoId") === "") return { erro: "Escolha o tipo de consignação que retém este desconto." };
    if (t(f, "credorConsignatario") === "") return { erro: "Informe a quem o valor retido é devido." };
    if (t(f, "fundamento") === "") return { erro: "Informe o fundamento do desconto." };
    try {
      const sucesso = await declararConsignacaoDaRubricaNaTela({
        rubricaId: t(f, "rubricaId"),
        tipoConsignacaoId: t(f, "tipoConsignacaoId"),
        credorConsignatario: t(f, "credorConsignatario"),
        fundamento: t(f, "fundamento"),
      });
      revalidatePath("/folha/descontos-retidos");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a declaração. Nada foi gravado.") };
    }
  });
}
