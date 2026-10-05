"use server";

import { revalidatePath } from "next/cache";
import { acertar13, apropriar, declararFerias } from "../../../../lib/portas/apropriacao-por-competencia";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

export interface EstadoDaApropriacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const CAMINHO = "/folha/apropriacao-por-competencia";

export async function declararFeriasAction(_p: EstadoDaApropriacao, f: FormData): Promise<EstadoDaApropriacao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await declararFerias({
        exercicio: Number(t(f, "exercicio")),
        mesesDoPeriodoAquisitivo: Number(t(f, "meses")),
        abonoNumerador: Number(t(f, "abonoNumerador")),
        abonoDenominador: Number(t(f, "abonoDenominador")),
        incluiRemuneracaoDoPeriodo: t(f, "incluiRemuneracao") === "sim",
        fundamento: t(f, "fundamento"),
      });
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível declarar o parâmetro das férias. Nada foi gravado.") };
    }
  });
}

export async function apropriarAction(_p: EstadoDaApropriacao, f: FormData): Promise<EstadoDaApropriacao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await apropriar(t(f, "competencia"));
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível apropriar a competência. Nada foi gravado.") };
    }
  });
}

export async function acertarAction(_p: EstadoDaApropriacao, f: FormData): Promise<EstadoDaApropriacao> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await acertar13(Number(t(f, "exercicio")));
      revalidatePath(CAMINHO);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível acertar o 13º. Nada foi gravado.") };
    }
  });
}
