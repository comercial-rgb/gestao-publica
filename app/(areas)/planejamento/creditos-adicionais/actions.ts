"use server";

import { revalidatePath } from "next/cache";
import {
  criarDecretoCredito,
  criarLeiCredito,
  encerrarDecretoCredito,
  lancarMovimentosCredito,
} from "../../../../lib/portas/creditos";
import { ehOrigem, errosDoRascunho, type MovimentoRascunho } from "./rascunho";
import { meioDiaCivil } from "../../../../packages/datas/index";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoEncerrar {
  readonly erro?: string;
  readonly sucesso?: boolean;
}

/** Server Action: encerra um decreto (escrita autenticada) e revalida a lista. O domínio recusa
 * encerrar duas vezes / decreto inexistente — o erro sobe nomeado. */
export async function encerrarDecretoAction(_prev: EstadoEncerrar, formData: FormData): Promise<EstadoEncerrar> {
  return comComandoDoFormulario(formData, async () => {
    const decretoId = String(formData.get("decretoId") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (decretoId === "" || motivo === "") return { erro: "Informe o motivo do encerramento." };
    try {
      await encerrarDecretoCredito({ decretoId, motivo, data: new Date() });
      revalidatePath("/planejamento/creditos-adicionais");
      return { sucesso: true };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível encerrar o decreto." };
    }
  });
}

export interface EstadoDecreto {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * Server Action — CADASTRA o decreto e LANÇA os movimentos, pelas portas de escrita do M03.
 *
 * ═══ ⚠️ DUAS CHAMADAS, E ISSO NÃO É UM ATO PARTIDO AO MEIO ═══
 * `criarDecreto` e `executarCredito` são operações SEPARADAS do domínio, e de propósito: o
 * comentário do `criarDecreto` diz que "o decreto NASCE VAZIO — os itens (e as fichas, e as
 * unidades) entram no `executarCredito`". Se as pernas forem recusadas (teto da lei, saldo da
 * ficha, TR 5.111, fonte divergente), o que fica no banco é um decreto SEM ITENS — um estado que
 * o modelo prevê, que a lista exibe com totais zerados, e que não altera dotação nenhuma. O que
 * NÃO pode partir ao meio são os itens entre si, e esses vão todos numa transação só, dentro do
 * `executarCredito` (é a razão de a operação do port ser "grossa").
 *
 * ⚠️ A MENSAGEM DIZ O QUE SOBROU. Se os movimentos caem, o usuário precisa saber que o decreto
 * FOI criado — senão ele tenta de novo com o mesmo número e colide na unique `[ano, numero]`,
 * levando um erro de banco no lugar do erro de verdade.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A action só reconstrói o rascunho, roda a validação de FORMA
 * (`errosDoRascunho`, a MESMA da ilha client — um usuário sem JS não escapa dela) e traduz
 * `FormData` nos tipos da porta. Os erros do domínio sobem como ele os escreveu.
 */
export async function cadastrarDecretoAction(
  _prev: EstadoDecreto,
  formData: FormData
): Promise<EstadoDecreto> {
  return comComandoDoFormulario(formData, async () => {
    const leiId = String(formData.get("leiId") ?? "").trim();
    const numero = String(formData.get("numero") ?? "").trim();
    const dataBruta = String(formData.get("data") ?? "").trim();
    const origemBruta = String(formData.get("origemRecurso") ?? "").trim();
    const anoBruto = Number.parseInt(String(formData.get("ano") ?? ""), 10);

    let movimentos: readonly MovimentoRascunho[];
    try {
      // O form serializa as pernas num único campo: elas são uma LISTA de tamanho variável, e
      // `movimentos[0][valor]` reinventaria mal o que o JSON já resolve. O parse é defensivo —
      // um payload adulterado vira erro nomeado, não exceção crua.
      const cru: unknown = JSON.parse(String(formData.get("movimentos") ?? "[]"));
      if (!Array.isArray(cru)) throw new Error("lista esperada");
      movimentos = cru.map((m: Record<string, unknown>) => ({
        fichaId: String(m["fichaId"] ?? ""),
        tipo: m["tipo"] === "ANULACAO" ? "ANULACAO" : "SUPLEMENTACAO",
        valor: String(m["valor"] ?? ""),
        fonteId: String(m["fonteId"] ?? ""),
        fonteCodigo: String(m["fonteCodigo"] ?? ""),
      }));
    } catch {
      return { erro: "Não foi possível ler os movimentos do decreto. Refaça o lançamento." };
    }

    const erros = errosDoRascunho({ leiId, numero, data: dataBruta, origemRecurso: origemBruta, movimentos });
    if (erros.length > 0) return { erro: erros.join("\n") };
    if (!ehOrigem(origemBruta)) return { erro: "Escolha a origem do recurso." };
    if (!Number.isInteger(anoBruto)) return { erro: "Exercício do decreto inválido." };

    let decretoId: string;
    try {
      decretoId = await criarDecretoCredito({
        leiId,
        numero,
        ano: anoBruto,
        // `T12:00:00Z` — meio-dia UTC: a data do fato é um DIA, e ancorar no meio-dia impede que o
        // fuso empurre o decreto para o dia (ou o exercício) anterior. Mesma escolha do empenho.
        data: meioDiaCivil(dataBruta),
        origemRecurso: origemBruta,
      });
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível criar o decreto." };
    }

    try {
      await lancarMovimentosCredito({
        decretoId,
        itens: movimentos.map((m) => ({
          fichaId: m.fichaId,
          tipo: m.tipo,
          valor: m.valor.trim(),
          // ⚠️ A fonte vem da FICHA (o form a derivou), nunca de um campo próprio — o adapter do
          // M03 recusa item cuja fonte divirja da fonte da ficha, e com razão: o balanceamento
          // "por fonte" da TR 5.111 checaria uma ficção se as duas pudessem discordar.
          fonteId: m.fonteId,
        })),
      });
    } catch (e) {
      const motivo = e instanceof Error ? mensagemDoErro(e, "") : "erro desconhecido";
      return {
        erro:
          `O decreto ${numero}/${anoBruto} foi criado, mas os movimentos foram recusados e a dotação ` +
          `não foi alterada. Corrija os movimentos e lance-os novamente neste decreto.\n\n${motivo}`,
      };
    }

    revalidatePath("/planejamento/creditos-adicionais");
    revalidatePath("/planejamento/qdd");
    return { sucesso: `Decreto ${numero}/${anoBruto} criado com ${movimentos.length} movimento(s).` };
  });
}

export interface EstadoLei {
  readonly erro?: string;
  readonly sucesso?: string;
}

const TIPOS_DE_CREDITO = ["SUPLEMENTAR", "ESPECIAL", "EXTRAORDINARIO"] as const;
type TipoDeCredito = (typeof TIPOS_DE_CREDITO)[number];
const ehTipoDeCredito = (v: string): v is TipoDeCredito =>
  (TIPOS_DE_CREDITO as readonly string[]).includes(v);

/**
 * Server Action — CADASTRA a lei autorizadora (TR 4.30), pela porta de escrita do M03.
 *
 * ⚠️ NENHUMA REGRA DE NEGÓCIO AQUI. A action confere FORMA (campo em branco, tipo fora da lista,
 * ano que não é inteiro) e traduz o `FormData` nos tipos da porta. Teto, duplicidade de
 * `[ano, numero]` e valor não-positivo são do domínio, e a mensagem dele sobe inteira.
 *
 * ⚠️ A DATA ANCORA NO MEIO-DIA, como a do decreto e a do empenho: a publicação é um DIA, e sem a
 * âncora o fuso empurra a lei para o dia — e às vezes para o exercício — anterior.
 */
export async function cadastrarLeiAction(
  _prev: EstadoLei,
  formData: FormData
): Promise<EstadoLei> {
  return comComandoDoFormulario(formData, async () => {
    const numero = String(formData.get("numero") ?? "").trim();
    const tipoBruto = String(formData.get("tipoCredito") ?? "").trim();
    const valorAutorizado = String(formData.get("valorAutorizado") ?? "").trim();
    const publicacao = String(formData.get("dataPublicacao") ?? "").trim();
    const ano = Number.parseInt(String(formData.get("ano") ?? ""), 10);

    if (numero === "") return { erro: "Informe o número da lei." };
    if (!ehTipoDeCredito(tipoBruto)) return { erro: "Escolha o tipo de crédito autorizado." };
    if (valorAutorizado === "") return { erro: "Informe o valor autorizado pela lei." };
    if (publicacao === "") return { erro: "Informe a data de publicação da lei." };
    if (!Number.isInteger(ano)) return { erro: "Exercício da lei inválido." };

    try {
      await criarLeiCredito({
        numero,
        ano,
        tipoCredito: tipoBruto,
        valorAutorizado,
        dataPublicacao: meioDiaCivil(publicacao),
      });
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível cadastrar a lei." };
    }

    revalidatePath("/planejamento/creditos-adicionais");
    return { sucesso: `Lei ${numero}/${ano} cadastrada.` };
  });
}
