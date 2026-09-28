"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import {
  configurarLimitacaoDeEmpenho,
  liberarCotaDaProgramacao,
  proporProgramacaoDaLoa,
} from "../../../../lib/portas/programacao";

/**
 * SERVER ACTIONS DA PROGRAMAÇÃO FINANCEIRA (V19).
 *
 * ⚠️ TRÊS ATOS, E CADA UM TEM DE CITAR O ATO QUE O AUTORIZA. O `atoRef` é obrigatório nos três
 * serviços do domínio, e é isso que impede esta tela de publicar cronograma sem lastro legal — a
 * reserva que a porta de leitura tinha registrado. A minuta do decreto sai da mesma tela; o
 * caminho é propor, imprimir a minuta, assinar, e então registrar citando o ato.
 *
 * ⚠️ E A DATA VEM AO MEIO-DIA DO FUSO DO ENTE. `new Date("2026-03-01")` é meia-noite UTC, que aqui
 * é o dia 29 de fevereiro: a vigência do decreto mudaria de dia, e a vigência é o que decide qual
 * versão o guard do empenho vai honrar.
 */

export interface EstadoDaProgramacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

function dataCivilDoFormulario(bruto: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return null;
  return new Date(`${bruto}T12:00:00.000-03:00`);
}

function exercicioDoFormulario(formData: FormData): number {
  const n = Number.parseInt(String(formData.get("exercicio") ?? ""), 10);
  return Number.isNaN(n) ? new Date().getFullYear() : n;
}

/** PROPÕE a versão 1 do cronograma (CMD) ou das metas (MBA) a partir da previsão da LOA. */
export async function proporDaLoaAction(
  _prev: EstadoDaProgramacao,
  formData: FormData
): Promise<EstadoDaProgramacao> {
  return comComandoDoFormulario(formData, async () => {
    const peca = String(formData.get("peca") ?? "CMD") === "MBA" ? "MBA" : "CMD";
    const atoRef = String(formData.get("atoRef") ?? "").trim();
    const vigenteDesde = dataCivilDoFormulario(String(formData.get("vigenteDesde") ?? ""));
    if (atoRef === "") return { erro: "Informe o ato que autoriza o cronograma." };
    if (vigenteDesde === null) return { erro: "Informe a data em que o ato passa a viger." };

    try {
      const r = await proporProgramacaoDaLoa({
        peca,
        exercicio: exercicioDoFormulario(formData),
        atoRef,
        vigenteDesde,
      });
      revalidatePath("/planejamento/cmd-mba");
      return {
        sucesso:
          peca === "CMD"
            ? `Cronograma proposto a partir da previsão da lei orçamentária: ${String(r.parcelas)} cota(s) mensais.`
            : `Metas propostas a partir da previsão da lei orçamentária: ${String(r.parcelas)} meta(s) bimestrais.`,
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível propor a programação.") };
    }
  });
}

/**
 * LIGA ou DESLIGA a limitação de empenho no exercício.
 *
 * ⚠️ É O ATO QUE FAZ O CRONOGRAMA VALER CONTRA O EMPENHO. Desligado, o cronograma é planejamento;
 * ligado, empenhar em fonte e mês sem cota passa a ser recusado no servidor.
 */
export async function configurarLimitacaoAction(
  _prev: EstadoDaProgramacao,
  formData: FormData
): Promise<EstadoDaProgramacao> {
  return comComandoDoFormulario(formData, async () => {
    const ativo = String(formData.get("ativo") ?? "") === "ligar";
    const atoRef = String(formData.get("atoRef") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (atoRef === "") return { erro: "Informe o ato que determina a medida." };

    try {
      const r = await configurarLimitacaoDeEmpenho({
        exercicio: exercicioDoFormulario(formData),
        ativo,
        atoRef,
        motivo,
      });
      revalidatePath("/planejamento/cmd-mba");
      return {
        sucesso: r.ativo
          ? "Limitação de empenho LIGADA: a partir de agora o empenho é julgado também contra a cota do mês."
          : "Limitação de empenho DESLIGADA: o empenho volta a responder apenas à dotação.",
      };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a medida.") };
    }
  });
}

/** LIBERA saldo de um mês contingenciado — aumenta o teto daquele mês, por ato. */
export async function liberarCotaAction(
  _prev: EstadoDaProgramacao,
  formData: FormData
): Promise<EstadoDaProgramacao> {
  return comComandoDoFormulario(formData, async () => {
    const fonteId = String(formData.get("fonteId") ?? "").trim();
    const mes = Number.parseInt(String(formData.get("mes") ?? ""), 10);
    const valor = String(formData.get("valor") ?? "").trim();
    const atoRef = String(formData.get("atoRef") ?? "").trim();
    const motivo = String(formData.get("motivo") ?? "").trim();
    if (fonteId === "") return { erro: "Escolha a fonte de recurso." };
    if (Number.isNaN(mes) || mes < 1 || mes > 12) return { erro: "Escolha o mês." };

    try {
      await liberarCotaDaProgramacao({
        exercicio: exercicioDoFormulario(formData),
        fonteId,
        mes,
        valor,
        atoRef,
        motivo,
      });
      revalidatePath("/planejamento/cmd-mba");
      return { sucesso: "Liberação registrada: o teto daquele mês subiu pelo valor informado." };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a liberação.") };
    }
  });
}
