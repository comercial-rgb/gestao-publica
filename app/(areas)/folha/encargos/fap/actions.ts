"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { aprovarFap, registrarFap } from "../../../../../lib/portas/fap";

/** V24 — cadastro e aprovação do FAP. Nenhuma regra aqui: o M33 recusa e a mensagem sobe como veio. */
export interface EstadoDoFap {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function registrarFapAction(_prev: EstadoDoFap, f: FormData): Promise<EstadoDoFap> {
  return comComandoDoFormulario(f, async () => {
    const ano = Number(String(f.get("ano") ?? "").trim());
    const fator = String(f.get("fator") ?? "").trim().replace(",", ".");
    try {
      await registrarFap({ cnpj: String(f.get("cnpj") ?? "").replace(/\D/g, ""), ano, fator, fonte: String(f.get("fonte") ?? "") });
      revalidatePath("/folha/encargos/fap");
      return { sucesso: `FAP de ${ano} cadastrado, aguardando a aprovação de outra pessoa. Até lá, não entra na apuração.` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível cadastrar o FAP." };
    }
  });
}

export async function aprovarFapAction(_prev: EstadoDoFap, f: FormData): Promise<EstadoDoFap> {
  return comComandoDoFormulario(f, async () => {
    try {
      await aprovarFap(String(f.get("fatorId") ?? ""));
      revalidatePath("/folha/encargos/fap");
      return { sucesso: "FAP aprovado. A próxima apuração dos encargos do ano já o usa." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível aprovar o FAP." };
    }
  });
}
