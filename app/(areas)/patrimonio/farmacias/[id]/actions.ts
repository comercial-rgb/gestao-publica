"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { ajustarPelaTela, corrigirPelaTela, dispensarPelaTela, trocarDepositoPelaTela, vincularDepositoPelaTela } from "../../../../../lib/portas/farmacia-operacao";

/**
 * V39-R2 (R2-030, R2-031) — os atos da operação da farmácia. Nenhuma regra aqui: a recusa do domínio sobe como veio.
 */
export interface EstadoDaOperacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const campos = (f: FormData): Record<string, string> => {
  const c: Record<string, string> = {};
  for (const [k, v] of f.entries()) if (typeof v === "string") c[k] = v;
  return c;
};

async function ato(f: FormData, corpo: (farmaciaId: string, c: Record<string, string>) => Promise<string>, padrao: string): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    const c = campos(f);
    const farmaciaId = (c["farmaciaId"] ?? "").trim();
    if (farmaciaId === "") return { erro: "Farmácia não identificada. Nada foi gravado." };
    try {
      const sucesso = await corpo(farmaciaId, c);
      revalidatePath(`/patrimonio/farmacias/${farmaciaId}`);
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, padrao) };
    }
  });
}

export async function vincularDepositoAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return ato(f, vincularDepositoPelaTela, "Não foi possível vincular o depósito. Nada foi gravado.");
}

export async function dispensarAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return ato(f, (id, c) => {
    const itens: { loteId: string; quantidade: string }[] = [];
    for (let k = 1; k <= 5; k += 1) {
      const loteId = (c[`lote_${String(k)}`] ?? "").trim();
      const quantidade = (c[`quantidade_${String(k)}`] ?? "").trim();
      if (loteId === "" && quantidade === "") continue;
      if (loteId === "" || quantidade === "") throw new Error(`Item ${String(k)}: escolha o lote e informe a quantidade. Nada foi gravado.`);
      itens.push({ loteId, quantidade });
    }
    if (itens.length === 0) throw new Error("Informe ao menos um medicamento. Nada foi gravado.");
    return dispensarPelaTela(id, c, itens);
  }, "Não foi possível registrar a dispensação. Nada foi gravado.");
}

export async function ajustarAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return ato(f, ajustarPelaTela, "Não foi possível registrar o ajuste. Nada foi gravado.");
}

/** V39-R3 (R3-009) — corrigir a dispensação. Na devolução, cada item vem como `condicao_<id do item>`. */
export async function corrigirAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return ato(f, (id, c) => {
    const itens: { itemId: string; condicao: "APTO_AO_REUSO" | "INAPTO" }[] = [];
    for (const [k, v] of Object.entries(c)) {
      if (!k.startsWith("condicao_")) continue;
      const condicao = v.trim();
      if (condicao === "APTO_AO_REUSO" || condicao === "INAPTO") itens.push({ itemId: k.slice("condicao_".length), condicao });
    }
    return corrigirPelaTela(id, c, itens);
  }, "Não foi possível corrigir a dispensação. Nada foi gravado.");
}

/** V39-R3 (R3-010) — trocar o depósito da farmácia com vigência. */
export async function trocarDepositoAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return ato(f, trocarDepositoPelaTela, "Não foi possível trocar o depósito. Nada foi gravado.");
}
