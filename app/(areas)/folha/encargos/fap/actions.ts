"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { aprovarFap, registrarEstabelecimento, registrarFap } from "../../../../../lib/portas/fap";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
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
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível cadastrar o FAP." };
    }
  });
}

/** V25 — o estabelecimento (CNPJ) de uma lotação, a partir de uma competência. */
export async function registrarEstabelecimentoAction(_prev: EstadoDoFap, f: FormData): Promise<EstadoDoFap> {
  return comComandoDoFormulario(f, async () => {
    const competenciaInicio = String(f.get("competenciaInicio") ?? "").trim();
    try {
      await registrarEstabelecimento({
        lotacaoId: String(f.get("lotacaoId") ?? ""),
        cnpj: String(f.get("cnpj") ?? "").replace(/\D/g, ""),
        competenciaInicio,
        fundamento: String(f.get("fundamento") ?? ""),
      });
      revalidatePath("/folha/encargos/fap");
      return { sucesso: "Estabelecimento registrado. As apurações a partir dessa competência usam o FAP deste CNPJ para quem está na lotação e nas lotações abaixo dela." };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar o estabelecimento." };
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
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível aprovar o FAP." };
    }
  });
}
