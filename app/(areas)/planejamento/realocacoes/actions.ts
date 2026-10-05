"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { anularAtoDeRealocacao, registrarAtoDeRealocacao } from "../../../../lib/portas/realocacao";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { ehEspecie, errosDoRascunho, type PernaRascunho } from "./rascunho";

/**
 * SERVER ACTIONS DA REALOCAÇÃO DE DOTAÇÃO (V21).
 *
 * A forma é conferida aqui DE NOVO (quem chama a action direto não passa pelo formulário); as regras
 * — fechar no total e por fonte, saldo para ceder, lei prévia, exercício aberto, permissão — são do
 * caso de uso, no servidor.
 */

export interface EstadoDaRealocacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const ROTA = "/planejamento/realocacoes";

export async function registrarRealocacaoAction(
  _prev: EstadoDaRealocacao,
  formData: FormData
): Promise<EstadoDaRealocacao> {
  return comComandoDoFormulario(formData, async () => {
    const especie = String(formData.get("especie") ?? "").trim();
    const numero = String(formData.get("numero") ?? "").trim();
    const data = String(formData.get("data") ?? "").trim();
    const leiNumero = String(formData.get("leiNumero") ?? "").trim();
    const leiData = String(formData.get("leiData") ?? "").trim();
    const justificativa = String(formData.get("justificativa") ?? "").trim();
    const autorizacao = String(formData.get("autorizacaoDaLoaId") ?? "").trim();

    let pernas: readonly PernaRascunho[];
    try {
      const cru: unknown = JSON.parse(String(formData.get("pernas") ?? "[]"));
      if (!Array.isArray(cru)) throw new Error("lista esperada");
      pernas = cru.map((p: Record<string, unknown>) => ({
        fichaId: String(p["fichaId"] ?? ""),
        papel: p["papel"] === "ACRESCIMO" ? "ACRESCIMO" : "REDUCAO",
        valor: String(p["valor"] ?? ""),
        fonteId: String(p["fonteId"] ?? ""),
        fonteCodigo: String(p["fonteCodigo"] ?? ""),
      }));
    } catch {
      return { erro: "Não foi possível ler as fichas do ato. Refaça o preenchimento." };
    }

    const erros = errosDoRascunho({ especie, numero, data, leiNumero, leiData, justificativa, pernas });
    if (erros.length > 0 || !ehEspecie(especie)) return { erro: erros.join("\n") };

    try {
      const r = await registrarAtoDeRealocacao({
        especie,
        numero,
        // O fato é um DIA: ancorado no meio-dia civil, o fuso não o empurra para o dia anterior.
        data: meioDiaCivil(data),
        leiNumero,
        leiDataPublicacao: meioDiaCivil(leiData),
        autorizacaoDaLoaId: autorizacao === "" ? null : autorizacao,
        justificativa,
        pernas: pernas.map((p) => ({
          fichaId: p.fichaId,
          tipo: p.papel,
          valor: p.valor.trim(),
          // A fonte vem da FICHA escolhida; o caso de uso recusa se divergir.
          fonteId: p.fonteId,
        })),
      });
      revalidatePath(ROTA);
      revalidatePath("/planejamento/qdd");
      return {
        sucesso:
          `Ato ${numero}/${String(r.ano)} registrado: ${String(pernas.length)} ficha(s), ` +
          `total movido ${formatarMoeda(r.total).texto}. A dotação atualizada das fichas já reflete o ato.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o ato.") };
    }
  });
}

export async function anularRealocacaoAction(
  _prev: EstadoDaRealocacao,
  formData: FormData
): Promise<EstadoDaRealocacao> {
  return comComandoDoFormulario(formData, async () => {
    const atoId = String(formData.get("atoId") ?? "").trim();
    const data = String(formData.get("data") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (atoId === "") return { erro: "Escolha o ato a desfazer." };
    if (data === "") return { erro: "Informe a data da anulação." };

    try {
      const r = await anularAtoDeRealocacao({ atoId, data: meioDiaCivil(data), motivo });
      revalidatePath(ROTA);
      revalidatePath("/planejamento/qdd");
      return {
        sucesso:
          `Ato ${r.numero}/${String(r.ano)} anulado: ${String(r.pernasEstornadas)} ficha(s) voltaram à ` +
          `dotação de antes. O ato original continua registrado, com a anulação ao lado.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível anular o ato.") };
    }
  });
}
