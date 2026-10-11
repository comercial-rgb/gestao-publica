"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { conferirReferenciaPelaTela, registrarReferenciaPelaTela } from "../../../../../lib/portas/referencia-externa";

/** V39-R3 (R3-017) — declarar e conferir a referência externa do empenho. Nenhuma regra aqui. */
export interface EstadoDaReferencia {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campos = (f: FormData): Record<string, string> => {
  const c: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (typeof v === "string") c[k] = v;
  return c;
};

async function ato(f: FormData, corpo: (c: Record<string, string>) => Promise<string>, padrao: string): Promise<EstadoDaReferencia> {
  return comComandoDoFormulario(f, async () => {
    const c = campos(f);
    try {
      const sucesso = await corpo(c);
      revalidatePath(`/despesa/empenhos/${(c["empenhoId"] ?? "").trim()}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, padrao) };
    }
  });
}

export async function registrarReferenciaAction(_p: EstadoDaReferencia, f: FormData): Promise<EstadoDaReferencia> {
  return ato(f, registrarReferenciaPelaTela, "Não foi possível registrar a referência. Nada foi gravado.");
}

export async function conferirReferenciaAction(_p: EstadoDaReferencia, f: FormData): Promise<EstadoDaReferencia> {
  return ato(f, conferirReferenciaPelaTela, "Não foi possível registrar a conferência. Nada foi gravado.");
}
