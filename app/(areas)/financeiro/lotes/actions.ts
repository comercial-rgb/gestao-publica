"use server";

import { revalidatePath } from "next/cache";
import {
  criarLote,
  fechar,
  gerarBorderoDoLote,
  incluirOrdemNoLote,
  registrarRetorno,
} from "../../../../lib/portas/tesouraria";

export interface EstadoLote {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ⚠️ NENHUMA REGRA AQUI. Ordem cronológica na inclusão, lote vazio que não fecha, borderô
 * que exige assinatura, retorno que não baixa item de outro borderô — tudo é do domínio,
 * dentro da transação. A action traduz `FormData` e devolve a mensagem COMO VEIO.
 */
export async function criarLoteAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  const conta = String(formData.get("conta") ?? "").trim();
  const dia = String(formData.get("vencimento") ?? "").trim();
  const descricao = String(formData.get("descricao") ?? "").trim();
  const exercicio = Number(String(formData.get("exercicio") ?? ""));

  if (conta === "") return { erro: "Escolha a conta bancária do lote." };
  if (dia === "") return { erro: "Informe o vencimento." };
  if (!Number.isInteger(exercicio)) return { erro: "Exercício inválido." };

  try {
    const numero = await criarLote({
      exercicio,
      contaBancariaId: conta,
      diaVencimento: dia,
      descricao,
    });
    revalidatePath("/financeiro/lotes");
    return { sucesso: `Lote ${numero} criado.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível criar o lote." };
  }
}

export async function incluirAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  const loteId = String(formData.get("loteId") ?? "").trim();
  const ordemId = String(formData.get("ordemId") ?? "").trim();
  if (ordemId === "") return { erro: "Escolha a ordem a incluir." };

  try {
    await incluirOrdemNoLote(loteId, ordemId);
    revalidatePath("/financeiro/lotes");
    return { sucesso: "Ordem incluída no lote." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível incluir a ordem." };
  }
}

export async function fecharAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  const loteId = String(formData.get("loteId") ?? "").trim();
  try {
    await fechar(loteId);
    revalidatePath("/financeiro/lotes");
    return { sucesso: "Lote fechado." };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível fechar o lote." };
  }
}

export async function gerarBorderoAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  const loteId = String(formData.get("loteId") ?? "").trim();
  const signatarios = formData
    .getAll("signatarios")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");

  if (signatarios.length === 0) {
    return {
      erro:
        "Escolha ao menos um signatário. Fila vazia passaria por 'todas as assinaturas colhidas' — e o borderô seria transmitido sem ninguém ter assinado.",
    };
  }

  try {
    const r = await gerarBorderoDoLote(loteId, signatarios);
    revalidatePath("/financeiro/lotes");
    return { sucesso: `Borderô gerado. Hash ${r.hash.slice(0, 12)}…` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível gerar o borderô." };
  }
}

export async function retornoAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  const borderoId = String(formData.get("borderoId") ?? "").trim();
  const dia = String(formData.get("pagoEm") ?? "").trim();
  const itens = formData.getAll("itens").map((v) => String(v).trim()).filter((v) => v !== "");

  if (dia === "") return { erro: "Informe a data de liquidação no banco." };
  if (itens.length === 0) return { erro: "Marque ao menos um item baixado pelo banco." };

  try {
    const baixados = await registrarRetorno(
      borderoId,
      itens.map((itemId, i) => ({
        itemId,
        pagoEm: dia,
        // O identificador que o banco devolve. Sem canal real, a tela pede um por item —
        // e ele é o que torna a baixa rastreável até o extrato.
        identificadorBanco: String(formData.get(`identificador-${itemId}`) ?? `RET-${i + 1}`),
      }))
    );
    revalidatePath("/financeiro/lotes");
    return { sucesso: `${baixados} item(ns) baixado(s) pelo retorno.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível processar o retorno." };
  }
}
