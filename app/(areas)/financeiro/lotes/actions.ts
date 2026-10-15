"use server";

import { revalidatePath } from "next/cache";
import {
  criarLote,
  fechar,
  gerarBorderoDoLote,
  incluirOrdemNoLote,
  registrarRejeicao,
  registrarRetorno,
} from "../../../../lib/portas/tesouraria";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
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
  return comComandoDoFormulario(formData, async () => {
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
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível criar o lote." };
    }
  });
}

export async function incluirAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  return comComandoDoFormulario(formData, async () => {
    const loteId = String(formData.get("loteId") ?? "").trim();
    const ordemId = String(formData.get("ordemId") ?? "").trim();
    if (ordemId === "") return { erro: "Escolha a ordem a incluir." };

    try {
      await incluirOrdemNoLote(loteId, ordemId);
      revalidatePath("/financeiro/lotes");
      return { sucesso: "Ordem incluída no lote." };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível incluir a ordem." };
    }
  });
}

export async function fecharAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  return comComandoDoFormulario(formData, async () => {
    const loteId = String(formData.get("loteId") ?? "").trim();
    try {
      await fechar(loteId);
      revalidatePath("/financeiro/lotes");
      return { sucesso: "Lote fechado." };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível fechar o lote." };
    }
  });
}

export async function gerarBorderoAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  return comComandoDoFormulario(formData, async () => {
    const loteId = String(formData.get("loteId") ?? "").trim();
    const signatarios = formData
      .getAll("signatarios")
      .map((v) => String(v).trim())
      .filter((v) => v !== "");

    if (signatarios.length === 0) {
      return {
        erro:
          "Escolha ao menos um signatário.",
      };
    }

    try {
      const r = await gerarBorderoDoLote(loteId, signatarios);
      revalidatePath("/financeiro/lotes");
      return { sucesso: `Borderô gerado. Código de verificação ${r.hash.slice(0, 12)}…` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível gerar o borderô." };
    }
  });
}

export async function retornoAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  return comComandoDoFormulario(formData, async () => {
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
      return { sucesso: `${baixados} item(ns) baixado(s) pelo retorno do banco.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível processar o retorno." };
    }
  });
}

/** V39-R3 (R3-027) — o banco devolveu o crédito de um item: a rejeição, com o que o banco respondeu. */
export async function rejeicaoAction(
  _prev: EstadoLote,
  formData: FormData
): Promise<EstadoLote> {
  return comComandoDoFormulario(formData, async () => {
    const borderoId = String(formData.get("borderoId") ?? "").trim();
    const itemId = String(formData.get("itemId") ?? "").trim();
    const dia = String(formData.get("rejeitadoEm") ?? "").trim();
    const ocorrencia = String(formData.get("ocorrencia") ?? "").trim();

    if (itemId === "") return { erro: "Escolha o item que o banco rejeitou." };
    if (dia === "") return { erro: "Informe a data da rejeição no banco." };
    if (ocorrencia.length < 3) return { erro: "Diga o que o banco respondeu (o código e o texto da ocorrência)." };

    try {
      const r = await registrarRejeicao(borderoId, [{ itemId, dia, ocorrencia }]);
      revalidatePath("/financeiro/lotes");
      return {
        sucesso:
          r.rejeitados === 0
            ? "Esta rejeição já estava registrada."
            : `Rejeição registrada. A ordem do item foi cancelada; prepare outra ordem para o novo crédito.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar a rejeição." };
    }
  });
}
