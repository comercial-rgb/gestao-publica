"use server";

import { revalidatePath } from "next/cache";
import { ehHipotese, registrarPagamento } from "../../../../lib/portas/pagamento";
import { desmascararValor } from "../../../../lib/format/mascaras";

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

  const retencoes = lerRetencoes(formData);
  if (typeof retencoes === "string") return { erro: retencoes };

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
      // Lista vazia vira AUSENTE na porta — o caminho sem retenção continua sendo o de
      // sempre, partida por partida.
      ...(retencoes.length > 0 ? { retencoes } : {}),
    });
    revalidatePath("/despesa/pagamentos");
    revalidatePath("/despesa/liquidacoes");
    revalidatePath("/despesa/empenhos");
    return { sucesso: `Pagamento ${numero} registrado.` };
  } catch (e) {
    return { erro: e instanceof Error ? e.message : "Não foi possível pagar." };
  }
}

/**
 * AS LINHAS DE RETENÇÃO, do formulário para a porta. Devolve a mensagem de erro (string)
 * quando o preenchimento está incoerente.
 *
 * ⚠️ TRÊS LISTAS PARALELAS, E A CORRESPONDÊNCIA É POSICIONAL. `getAll` devolve os valores
 * na ordem do DOM; a linha `i` é `(tipo[i], credor[i], valor[i])`. Se os três tamanhos
 * divergirem, alguma coisa chegou pela metade — e casar posições de listas de tamanhos
 * diferentes silenciosamente retiraria dinheiro a favor do consignatário errado. Por isso
 * a recusa é explícita, ANTES da transação.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. Retenção maior que o pagamento, duplicada para o
 * mesmo (tipo, credor), valor não positivo — tudo isso é do domínio (M07), dentro da
 * transação, e a mensagem dele sobe como veio. O que se faz aqui é só ler o formulário.
 */
function lerRetencoes(
  formData: FormData
): readonly {
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly valor: string;
}[] | string {
  const tipos = formData.getAll("retencaoTipo").map((v) => String(v).trim());
  const credores = formData.getAll("retencaoCredor").map((v) => String(v).trim());
  const valores = formData
    .getAll("retencaoValor")
    .map((v) => desmascararValor(String(v)));

  if (tipos.length !== credores.length || tipos.length !== valores.length) {
    return (
      "As retenções chegaram incompletas ao servidor (tipo, consignatário e valor não " +
      "vieram em igual número). Refaça a linha de retenção. Nada foi gravado."
    );
  }

  const linhas: {
    readonly tipoConsignacaoId: string;
    readonly credorConsignatario: string;
    readonly valor: string;
  }[] = [];

  for (const [i, tipo] of tipos.entries()) {
    const credor = credores[i] ?? "";
    const valor = valores[i] ?? "";
    // Linha inteiramente vazia = o usuário abriu e não usou. Ignorar é o certo.
    if (tipo === "" && credor === "" && (valor === "" || valor === "0")) continue;
    if (tipo === "" || credor === "" || valor === "") {
      return (
        `A ${i + 1}ª retenção está pela metade: escolha a consignação, diga a favor de ` +
        "quem e informe o valor. Nada foi gravado."
      );
    }
    linhas.push({ tipoConsignacaoId: tipo, credorConsignatario: credor, valor });
  }

  return linhas;
}
