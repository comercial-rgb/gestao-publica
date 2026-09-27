"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import {
  anularCancelamentoDeResto,
  anularPagamentoDeResto,
  cancelarResto,
  liquidarResto,
  pagarResto,
} from "../../../../../lib/portas/restos-a-pagar";

/**
 * AS OPERAÇÕES DE RESTOS A PAGAR, PELA TELA (V15).
 *
 * ⚠️ A RECUSA SOBE INTEIRA, e aqui ela é especialmente útil: quando falta configuração, a
 * mensagem diz QUAL operação não tem contas e ONDE informá-las; quando a liquidação de origem tem
 * mais de uma obrigação, ela LISTA as contas em disputa. Resumir deixaria o operador sem o que
 * precisa para resolver.
 *
 * ⚠️ NENHUMA DESTAS AÇÕES CRIA EMPENHO. A obrigação foi empenhada no exercício que fechou.
 */

export interface EstadoDaOperacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

function revalidar(inscricaoId: string): void {
  revalidatePath(`/despesa/restos-a-pagar/${inscricaoId}`);
  revalidatePath("/despesa/restos-a-pagar");
}

export async function liquidarAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "numero") === "") return { erro: "Informe o número da liquidação." };
    if (t(f, "valor") === "") return { erro: "Informe o valor." };
    if (t(f, "data") === "") return { erro: "Informe a data." };
    if (t(f, "responsavelAtesto") === "") return { erro: "Informe quem atestou." };
    if (t(f, "historico") === "") return { erro: "Informe o histórico." };
    try {
      const sucesso = await liquidarResto({
        empenhoId: t(f, "empenhoId"),
        numero: t(f, "numero"),
        valor: t(f, "valor"),
        data: t(f, "data"),
        responsavelAtesto: t(f, "responsavelAtesto"),
        historico: t(f, "historico"),
      });
      revalidar(t(f, "inscricaoId"));
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível liquidar. Nada foi gravado.") };
    }
  });
}

export async function pagarAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "liquidacaoId") === "") {
      return { erro: "Escolha a liquidação que originou a obrigação a pagar." };
    }
    if (t(f, "numero") === "") return { erro: "Informe o número do pagamento." };
    if (t(f, "valor") === "") return { erro: "Informe o valor." };
    if (t(f, "data") === "") return { erro: "Informe a data." };
    if (t(f, "contaBancaria") === "") return { erro: "Escolha a conta bancária." };
    if (t(f, "fonteId") === "") return { erro: "Informe a fonte de recursos." };
    if (t(f, "historico") === "") return { erro: "Informe o histórico." };
    try {
      const sucesso = await pagarResto({
        inscricaoId: t(f, "inscricaoId"),
        liquidacaoId: t(f, "liquidacaoId"),
        numero: t(f, "numero"),
        valor: t(f, "valor"),
        data: t(f, "data"),
        contaBancaria: t(f, "contaBancaria"),
        fonteId: t(f, "fonteId"),
        historico: t(f, "historico"),
      });
      revalidar(t(f, "inscricaoId"));
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível pagar. Nada foi gravado.") };
    }
  });
}

export async function cancelarAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "valor") === "") return { erro: "Informe o valor a cancelar." };
    if (t(f, "motivo") === "") return { erro: "Informe o motivo do cancelamento." };
    try {
      const sucesso = await cancelarResto({
        inscricaoId: t(f, "inscricaoId"),
        valor: t(f, "valor"),
        motivo: t(f, "motivo"),
      });
      revalidar(t(f, "inscricaoId"));
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível cancelar. Nada foi gravado.") };
    }
  });
}

export async function anularPagamentoAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "pagamentoId") === "") return { erro: "Escolha o pagamento a anular." };
    if (t(f, "motivo") === "") return { erro: "Informe o motivo da anulação." };
    try {
      const sucesso = await anularPagamentoDeResto({
        pagamentoId: t(f, "pagamentoId"),
        motivo: t(f, "motivo"),
      });
      revalidar(t(f, "inscricaoId"));
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível anular o pagamento. Nada foi gravado.") };
    }
  });
}

export async function anularCancelamentoAction(_p: EstadoDaOperacao, f: FormData): Promise<EstadoDaOperacao> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "movimentoId") === "") return { erro: "Escolha o cancelamento a anular." };
    if (t(f, "motivo") === "") return { erro: "Informe o motivo da anulação." };
    try {
      const sucesso = await anularCancelamentoDeResto({
        movimentoId: t(f, "movimentoId"),
        motivo: t(f, "motivo"),
      });
      revalidar(t(f, "inscricaoId"));
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível anular o cancelamento. Nada foi gravado.") };
    }
  });
}
