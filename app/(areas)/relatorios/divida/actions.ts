"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { informarParcelasPelaTela, substituirParcelaPelaTela } from "../../../../lib/portas/relatorio-da-divida";

export interface EstadoDaParcela {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function informarParcelasAction(_p: EstadoDaParcela, f: FormData): Promise<EstadoDaParcela> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await informarParcelasPelaTela({ dividaId: String(f.get("dividaId") ?? ""), texto: String(f.get("cronograma") ?? "") });
      revalidatePath("/relatorios/divida");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível informar as parcelas. Nada foi gravado.") };
    }
  });
}

export async function corrigirParcelaAction(_p: EstadoDaParcela, f: FormData): Promise<EstadoDaParcela> {
  return comComandoDoFormulario(f, async () => {
    const campo = (n: string): string => String(f.get(n) ?? "").trim();
    try {
      const sucesso = await substituirParcelaPelaTela({
        parcelaId: campo("parcelaId"),
        linha: `${campo("vencimento")};${campo("principal")};${campo("encargos")}`,
        motivo: campo("motivo"),
      });
      revalidatePath("/relatorios/divida");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível corrigir a parcela. Nada foi gravado.") };
    }
  });
}
