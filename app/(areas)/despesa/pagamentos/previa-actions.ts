"use server";

import { desmascararValor } from "../../../../lib/format/mascaras";
import { previaDasRetencoes, type LinhaDaPrevia } from "../../../../lib/portas/retencao-calculada";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { lerOperacaoFiscal } from "./operacao-fiscal";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * V24 — A PRÉVIA DAS RETENÇÕES CALCULADAS. Só LÊ: não grava, não consome chave de comando, e a porta
 * exige a leitura da despesa. O pagamento recalcula tudo no servidor; esta prévia não vale como valor.
 */
const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export interface EstadoDaPrevia {
  readonly erro?: string;
  readonly fornecedor?: string;
  readonly perfil?: string | null;
  readonly linhas?: readonly LinhaDaPrevia[];
}

/** A prévia do cálculo: lê os mesmos campos do pagamento e mostra o que ele fará. Nada grava. */
export async function previaRetencoesAction(_prev: EstadoDaPrevia, f: FormData): Promise<EstadoDaPrevia> {
  const liquidacaoId = texto(f, "liquidacaoId");
  const valor = desmascararValor(texto(f, "valor"));
  const data = texto(f, "data");
  if (liquidacaoId === "" || valor === "" || data === "") return { erro: "Para calcular, escolha a liquidação e informe o valor e a data do pagamento." };
  const op = lerOperacaoFiscal(f, valor);
  if (typeof op === "string") return { erro: op };
  try {
    const p = await previaDasRetencoes({ liquidacaoId, valorDoPagamento: valor, data: meioDiaCivil(data), operacao: op });
    return { fornecedor: p.fornecedor, perfil: p.perfil, linhas: p.linhas };
  } catch (e) {
    return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível calcular." };
  }
}
