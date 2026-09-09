"use server";

import { revalidatePath } from "next/cache";
import { ehHipotese, registrarPagamento } from "../../../../lib/portas/pagamento";

export interface EstadoPagamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — paga (com ou sem quebra da ordem) e revalida a fila.
 *
 * ═══ ⚠️ A ACTION NÃO DECIDE SE A QUEBRA É LEGÍTIMA ═══
 * Ela monta `justificativaQuebraOrdem` quando o usuário a preencheu, e passa adiante.
 * Quem confere a POSIÇÃO na fila é o `pagar()` do M05, chamando o M06 DENTRO da
 * transação: se o pagamento é da cabeça da fila, a justificativa é ignorada; se não é e
 * ela falta, o art. 141 §2º recusa, fail-closed.
 *
 * Uma checagem aqui ("é posição 1? então não peça justificativa") seria um guard que não
 * é guard: entre o render da página e o submit, outro pagamento anda a fila, e a posição
 * que o usuário viu já não é a de agora. A tela SUGERE pelo que leu; o domínio DECIDE
 * pelo que é.
 *
 * ⚠️ E o `hipotese` do `<select>` é `string` até `ehHipotese` estreitá-lo: o rol do §1º é
 * TAXATIVO, e um cast aqui deixaria "VI_OUTROS" compilar.
 */
export async function pagarAction(
  _prev: EstadoPagamento,
  formData: FormData
): Promise<EstadoPagamento> {
  const liquidacaoId = String(formData.get("liquidacaoId") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const valor = String(formData.get("valor") ?? "").trim();
  const contaBancaria = String(formData.get("contaBancaria") ?? "").trim();
  const fonteId = String(formData.get("fonteId") ?? "").trim();
  const historico = String(formData.get("historico") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();

  const hipoteseBruta = String(formData.get("hipotese") ?? "").trim();
  const justificativa = String(formData.get("justificativa") ?? "").trim();
  const autorizadoPor = String(formData.get("autorizadoPor") ?? "").trim();

  if (liquidacaoId === "") return { erro: "Escolha a liquidação a pagar." };
  if (dataBruta === "") return { erro: "A data do pagamento é obrigatória." };
  if (contaBancaria === "" || fonteId === "") {
    return { erro: "Escolha a conta bancária de onde o dinheiro sai." };
  }

  // A justificativa é OPCIONAL: ausente = pagamento da cabeça da fila. Se veio pela
  // metade, é erro de digitação — e vale dizer isso antes de gastar a transação.
  const querJustificar =
    hipoteseBruta !== "" || justificativa !== "" || autorizadoPor !== "";
  if (querJustificar && (hipoteseBruta === "" || justificativa === "" || autorizadoPor === "")) {
    return {
      erro:
        "A justificativa da quebra de ordem precisa das TRÊS coisas: hipótese do §1º, " +
        "o texto e quem autorizou. Preencha as três, ou deixe as três em branco para " +
        "pagar a cabeça da fila.",
    };
  }
  if (querJustificar && !ehHipotese(hipoteseBruta)) {
    return { erro: "Hipótese fora do rol taxativo do art. 141, §1º." };
  }

  try {
    await registrarPagamento({
      liquidacaoId,
      numero,
      valor,
      data: new Date(`${dataBruta}T12:00:00Z`),
      contaBancaria,
      fonteId,
      historico,
      ...(querJustificar && ehHipotese(hipoteseBruta)
        ? {
            justificativaQuebraOrdem: {
              hipotese: hipoteseBruta,
              justificativa,
              autorizadoPor,
            },
          }
        : {}),
    });
    revalidatePath("/despesa/pagamentos");
    revalidatePath("/despesa/liquidacoes");
    revalidatePath("/despesa/empenhos");
    return { sucesso: `Pagamento ${numero} registrado.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível pagar." };
  }
}
