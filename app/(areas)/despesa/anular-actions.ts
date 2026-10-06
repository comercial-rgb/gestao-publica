"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../lib/portas/comando";
import { anularExecucao, type TipoAnulavel } from "../../../lib/portas/anulacao";
import { desmascararValor } from "../../../lib/format/mascaras";
import { meioDiaCivil } from "../../../packages/datas/index";

import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
export interface EstadoAnulacao {
  readonly erro?: string;
  readonly sucesso?: string;
  /** V33 — depois de gravada: o lançamento da anulação e o documento original, para abrir os dois. */
  readonly lancamentoId?: string;
  readonly originalHref?: string;
}

const TIPOS: readonly TipoAnulavel[] = ["empenho", "liquidacao", "pagamento"];
const ehTipo = (v: string): v is TipoAnulavel => (TIPOS as readonly string[]).includes(v);

const CAMINHO: Record<TipoAnulavel, string> = {
  empenho: "/despesa/empenhos",
  liquidacao: "/despesa/liquidacoes",
  pagamento: "/despesa/pagamentos",
};

/**
 * Server Action — anula um empenho/liquidação/pagamento e revalida a lista.
 *
 * ⚠️ NENHUM GUARD DE NEGÓCIO AQUI. A decisão total×parcial é mecânica (o valor esgota o saldo E o
 * nível de baixo está vazio); TUDO o mais — saldo anulável, retenção que proíbe parcial, cascatas —
 * é do domínio, e a mensagem dele sobe como veio. Os campos ocultos `estornavel`/`anulavelSaldo`
 * SÓ escolhem o serviço; o domínio revalida cada um, então uma escolha velha é reprovada lá, não
 * aceita aqui.
 */
export async function anularDespesaAction(
  _prev: EstadoAnulacao,
  formData: FormData
): Promise<EstadoAnulacao> {
  // V4 (§10): esta action mora fora de `actions.ts` e ficou SEM o comando do formulário na
  // unidade 1 — o percurso da cadeia da despesa acusou "COMANDO SEM CHAVE" ao anular. O guard
  // `test/ui/chave-de-comando.test.ts` passou a varrer todo arquivo `"use server"` de `app/`.
  return comComandoDoFormulario(formData, () => anularDespesa(formData));
}

async function anularDespesa(formData: FormData): Promise<EstadoAnulacao> {
  const tipoBruto = String(formData.get("tipo") ?? "");
  if (!ehTipo(tipoBruto)) return { erro: "Tipo de anulação inválido." };
  const tipo = tipoBruto;

  const id = String(formData.get("id") ?? "").trim();
  const numero = String(formData.get("numero") ?? "").trim();
  const motivo = String(formData.get("motivo") ?? "").trim();
  const dataBruta = String(formData.get("data") ?? "").trim();
  const valorCru = desmascararValor(String(formData.get("valor") ?? ""));
  const anulavelSaldo = desmascararValor(String(formData.get("anulavelSaldo") ?? ""));
  const estornavel = String(formData.get("estornavel") ?? "") === "1";

  if (numero === "") return { erro: "O número do documento de anulação é obrigatório." };
  if (dataBruta === "") return { erro: "A data da anulação é obrigatória." };

  // Total (estorno) quando o valor esgota o saldo anulável E o fato é estornável. Senão, parcial.
  const total = estornavel && valorCru === anulavelSaldo;

  try {
    const r = await anularExecucao({
      tipo,
      id,
      numero,
      valor: valorCru,
      motivo,
      // `T12:00:00Z` — a data do fato é um DIA (mesma âncora do empenho); o fuso não a empurra atrás.
      data: meioDiaCivil(dataBruta),
      total,
    });
    revalidatePath(CAMINHO[tipo]);
    revalidatePath("/despesa/anulacoes");
    return {
      sucesso: `Anulação ${numero} registrada${total ? " (integral)" : " (parcial)"}.`,
      lancamentoId: r.lancamentoId,
      originalHref: tipo === "empenho" ? `/despesa/empenhos/${id}` : `/despesa/documento/${tipo === "liquidacao" ? "LIQUIDACAO" : "PAGAMENTO"}/${id}`,
    };
  } catch (e) {
    return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível registrar a anulação." };
  }
}
