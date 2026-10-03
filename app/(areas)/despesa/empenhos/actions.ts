"use server";

import { revalidatePath } from "next/cache";
import { registrarEmpenho } from "../../../../lib/portas/empenho";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { formatarMoeda } from "../../../../lib/format/moeda";

export interface EstadoEmpenho {
  readonly erro?: string;
  readonly sucesso?: string;
}

const TIPOS = ["ORDINARIO", "GLOBAL", "ESTIMATIVO"] as const;
const CATEGORIAS = [
  "FORNECIMENTO_BENS",
  "LOCACAO",
  "PRESTACAO_SERVICOS",
  "REALIZACAO_OBRAS",
] as const;

type Tipo = (typeof TIPOS)[number];
type Categoria = (typeof CATEGORIAS)[number];

const ehTipo = (v: string): v is Tipo => (TIPOS as readonly string[]).includes(v);
const ehCategoria = (v: string): v is Categoria =>
  (CATEGORIAS as readonly string[]).includes(v);

/**
 * Server Action — emite o empenho e revalida a lista.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A action só traduz `FormData` (tudo string) nos
 * tipos da porta e devolve o erro do domínio COMO ELE VEIO. Saldo da dotação, categoria
 * obrigatória, vínculo de obra — o domínio decide, dentro da transação, e escreveu
 * mensagens melhores do que qualquer paráfrase que eu inventasse aqui.
 *
 * ⚠️ A DATA VEM DO FORM, nunca de `new Date()`: é a data do FATO (a emissão da nota),
 * e ela pode não ser hoje. Um `now()` implícito faria a nota de ontem entrar como de
 * hoje — e o corte por competência de todo relatório passa por ela.
 */
export async function empenharAction(
  _prev: EstadoEmpenho,
  formData: FormData
): Promise<EstadoEmpenho> {
  return comComandoDoFormulario(formData, async () => {
    const fichaId = String(formData.get("fichaId") ?? "").trim();
    const numero = String(formData.get("numero") ?? "").trim();
    const valor = String(formData.get("valor") ?? "").trim();
    const credorCpfCnpj = String(formData.get("credor") ?? "").trim();
    const historico = String(formData.get("historico") ?? "").trim();
    const dataBruta = String(formData.get("data") ?? "").trim();
    const tipoBruto = String(formData.get("tipo") ?? "");
    const categoriaBruta = String(formData.get("categoria") ?? "");
    // V4 (§8): os vínculos da contratação — opcionais; quem os valida é o M05 com o M11 ligado.
    const contratoId = String(formData.get("contratoId") ?? "").trim();
    const reservaId = String(formData.get("reservaId") ?? "").trim();
    const ordemDeCompraId = String(formData.get("ordemDeCompraId") ?? "").trim();
    // V22: os vínculos de convênio, obra e dívida, e a solicitação autorizada de origem.
    const convenioId = String(formData.get("convenioId") ?? "").trim();
    const obraId = String(formData.get("obraId") ?? "").trim();
    const dividaId = String(formData.get("dividaId") ?? "").trim();
    const campanhaPublicitariaId = String(formData.get("campanhaPublicitariaId") ?? "").trim();
    const precatorioId = String(formData.get("precatorioId") ?? "").trim();
    const solicitacaoDeEmpenhoId = String(formData.get("solicitacaoDeEmpenhoId") ?? "").trim();

    if (!ehTipo(tipoBruto)) return { erro: "Tipo de empenho inválido." };
    // ⚠️ SEM DEFAULT: o `zEmpenharInput` recusa empenho sem contrato e sem categoria,
    // e é por isso que o select nasce vazio. Um default aqui traria de volta exatamente
    // o que o domínio proíbe — a fila de obras se misturando com a de bens em silêncio.
    if (!ehCategoria(categoriaBruta)) {
      return { erro: "Escolha a categoria da ordem cronológica (art. 141)." };
    }
    if (dataBruta === "") return { erro: "A data do empenho é obrigatória." };

    try {
      await registrarEmpenho({
        fichaId,
        numero,
        tipo: tipoBruto,
        valor,
        // ⚠️ MEIO-DIA CIVIL — ver `meioDiaCivil` em packages/datas. Era `T12:00:00Z`, que é
        // meio-dia em Greenwich: o dia civil saía certo, mas por uma régua diferente da do
        // resto do sistema. A justificativa antiga citava `getUTCFullYear` nos guards de
        // exercício, e esses guards já leem o calendário do ente desde o ENT03b.
        data: meioDiaCivil(dataBruta),
        credorCpfCnpj,
        historico,
        categoriaOrdemCronologica: categoriaBruta,
        ...(contratoId !== "" ? { contratoId } : {}),
        ...(reservaId !== "" ? { reservaId } : {}),
        ...(ordemDeCompraId !== "" ? { ordemDeCompraId } : {}),
        ...(convenioId !== "" ? { convenioId } : {}),
        ...(obraId !== "" ? { obraId } : {}),
        ...(dividaId !== "" ? { dividaId } : {}),
        ...(campanhaPublicitariaId !== "" ? { campanhaPublicitariaId } : {}),
        ...(precatorioId !== "" ? { precatorioId } : {}),
        ...(solicitacaoDeEmpenhoId !== "" ? { solicitacaoDeEmpenhoId } : {}),
      });
      revalidatePath("/despesa/empenhos");
      if (ordemDeCompraId !== "") revalidatePath("/licitacoes/ordens-de-compra");
      if (solicitacaoDeEmpenhoId !== "") revalidatePath("/despesa/solicitacoes-de-empenho");
      return { sucesso: `Empenho ${numero} emitido. Valor: R$ ${formatarMoeda(valor).texto}.` };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível emitir o empenho." };
    }
  });
}
