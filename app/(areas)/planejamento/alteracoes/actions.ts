"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import {
  acrescentarItemAoAto,
  registrarAtoDeAlteracao,
} from "../../../../lib/portas/alteracoes-do-planejamento";

/**
 * SERVER ACTIONS da alteração da peça (V18/C13).
 *
 * ⚠️ O ALVO E A GRANDEZA VÊM NUMA CHAVE SÓ (`alvo::alvoId::grandeza`), montada pelo servidor na
 * lista de opções. Dois campos separados deixariam o operador escolher um par impossível ("ação do
 * PPA com grandeza receita primária") — que o Zod recusa, mas só depois de ele preencher o resto do
 * formulário. Uma opção por par existente não tem como estar errada.
 *
 * ⚠️ E A CHAVE NÃO É CONFIANÇA: o serviço confere o alvo contra a peça DENTRO da transação (a linha
 * pertence a este plano?), porque campo de formulário não confere nada — o `CLAUDE.md` diz isso no
 * invariante 7.
 */

export interface EstadoDaAlteracao {
  readonly erro?: string;
  readonly sucesso?: string;
}

type Peca = "PPA" | "LDO";
type Alvo = "PREVISAO_RECEITA_PPA" | "PROGRAMA_PPA" | "ACAO_PPA" | "META_ANUAL_LDO";
const ALVOS: readonly Alvo[] = [
  "PREVISAO_RECEITA_PPA",
  "PROGRAMA_PPA",
  "ACAO_PPA",
  "META_ANUAL_LDO",
];

/** Desmonta `alvo::alvoId::grandeza`. Devolve `null` quando a chave não tem essa forma. */
function lerChaveDoAlvo(
  bruto: string
): { readonly alvo: Alvo; readonly alvoId: string; readonly grandeza: string } | null {
  const partes = bruto.split("::");
  if (partes.length !== 3) return null;
  const [alvo, alvoId, grandeza] = partes as [string, string, string];
  if (!(ALVOS as readonly string[]).includes(alvo)) return null;
  if (alvoId === "" || grandeza === "") return null;
  return { alvo: alvo as Alvo, alvoId, grandeza };
}

/**
 * ⚠️ A DATA VEM DE UM `input[type=date]`, que entrega "2027-06-10" — sem hora. Interpretá-la com
 * `new Date("2027-06-10")` produziria meia-noite UTC, que no fuso do ente é o DIA ANTERIOR: um ato
 * de 10 de junho gravado como 9 de junho mudaria de lado em qualquer corte por data. Por isso o
 * meio-dia: a hora não é dado aqui, e o meio-dia é o único instante que não troca de dia em nenhum
 * fuso brasileiro.
 */
function dataCivilDoFormulario(bruto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null;
  return new Date(`${bruto}T12:00:00.000-03:00`);
}

export async function registrarAtoAction(
  _prev: EstadoDaAlteracao,
  formData: FormData
): Promise<EstadoDaAlteracao> {
  return comComandoDoFormulario(formData, async () => {
    const peca = String(formData.get("peca") ?? "PPA") as Peca;
    const pecaId = String(formData.get("pecaId") ?? "").trim();
    const numero = String(formData.get("numero") ?? "").trim();
    const anoBruto = Number.parseInt(String(formData.get("ano") ?? ""), 10);
    const data = dataCivilDoFormulario(String(formData.get("data") ?? ""));
    const dataPublicacao = dataCivilDoFormulario(String(formData.get("dataPublicacao") ?? ""));
    const fundamento = String(formData.get("fundamento") ?? "").trim();
    const chave = lerChaveDoAlvo(String(formData.get("alvo") ?? ""));
    const valorAjuste = String(formData.get("ajuste") ?? "").trim();
    const justificativa = String(formData.get("justificativa") ?? "").trim();

    if (chave === null) return { erro: "Escolha a linha e a grandeza que o ato altera." };
    if (data === null || dataPublicacao === null) {
      return { erro: "Informe a data do ato e a data de publicação." };
    }
    if (Number.isNaN(anoBruto)) return { erro: "Informe o ano da numeração do ato." };

    try {
      await registrarAtoDeAlteracao({
        peca,
        pecaId,
        numero,
        ano: anoBruto,
        data,
        dataPublicacao,
        fundamento,
        itens: [
          {
            alvo: chave.alvo,
            alvoId: chave.alvoId,
            grandeza: chave.grandeza,
            valorAjuste,
            ...(justificativa === "" ? {} : { justificativa }),
          },
        ],
      });
      revalidatePath("/planejamento/alteracoes");
      return { sucesso: "Ato registrado, e o comparativo já reflete o valor vigente." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível registrar o ato." };
    }
  });
}

export async function acrescentarItemAction(
  _prev: EstadoDaAlteracao,
  formData: FormData
): Promise<EstadoDaAlteracao> {
  return comComandoDoFormulario(formData, async () => {
    const atoId = String(formData.get("atoId") ?? "").trim();
    const chave = lerChaveDoAlvo(String(formData.get("alvo") ?? ""));
    const valorAjuste = String(formData.get("ajuste") ?? "").trim();
    const justificativa = String(formData.get("justificativa") ?? "").trim();

    if (atoId === "") return { erro: "Escolha o ato a que o valor pertence." };
    if (chave === null) return { erro: "Escolha a linha e a grandeza que o ato altera." };

    try {
      await acrescentarItemAoAto({
        atoId,
        item: {
          alvo: chave.alvo,
          alvoId: chave.alvoId,
          grandeza: chave.grandeza,
          valorAjuste,
          ...(justificativa === "" ? {} : { justificativa }),
        },
      });
      revalidatePath("/planejamento/alteracoes");
      return { sucesso: "Valor acrescentado ao ato." };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível acrescentar o valor." };
    }
  });
}
