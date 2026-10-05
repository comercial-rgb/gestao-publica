"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { DEMONSTRACOES_DA_NOTA, redigirNota, retirarNota, SECOES_DAS_NOTAS, type DemonstracaoDaNota, type SecaoDaNota } from "../../../../../lib/portas/notas-explicativas";

export interface EstadoDaNota {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const ROTA = "/relatorios/demonstracoes/notas-explicativas";

export async function redigirNotaAction(_p: EstadoDaNota, f: FormData): Promise<EstadoDaNota> {
  return comComandoDoFormulario(f, async () => {
    try {
      const secao = t(f, "secao");
      const demonstracao = t(f, "demonstracao");
      if (!(SECOES_DAS_NOTAS as readonly string[]).includes(secao)) return { erro: "Escolha a seção da nota. Nada foi gravado." };
      if (!(DEMONSTRACOES_DA_NOTA as readonly string[]).includes(demonstracao)) return { erro: "Escolha a demonstração a que a nota se refere. Nada foi gravado." };
      const chave = t(f, "chave");
      const sucesso = await redigirNota({
        exercicio: Number(t(f, "exercicio")),
        ...(chave !== "" ? { chave } : {}),
        secao: secao as SecaoDaNota,
        demonstracao: demonstracao as DemonstracaoDaNota,
        ordem: Number(t(f, "ordem") || "0"),
        titulo: t(f, "titulo"),
        texto: String(f.get("texto") ?? ""),
      });
      revalidatePath(ROTA);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a nota. Nada foi gravado.") };
    }
  });
}

export async function retirarNotaAction(_p: EstadoDaNota, f: FormData): Promise<EstadoDaNota> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await retirarNota({ exercicio: Number(t(f, "exercicio")), chave: t(f, "chave") });
      revalidatePath(ROTA);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível retirar a nota. Nada foi gravado.") };
    }
  });
}
