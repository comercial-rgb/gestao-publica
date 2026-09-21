"use server";

import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
import {
  agendarPublico,
  cancelarPublico,
  consultarPorSegredo,
  remarcarPublico,
  type ReservaParaOCidadao,
} from "../../../lib/portas/guiche-publico";

/**
 * AS AÇÕES PÚBLICAS DO AGENDAMENTO (V11 V8.1) — sem sessão.
 *
 * ⚠️ NENHUM GUARD DE NEGÓCIO AQUI: serviço aberto ao portal, capacidade, dia fechado, quota e
 * limite por documento são conferidos na transação. Esta camada só traduz `FormData`.
 *
 * ⚠️ O SEGREDO NÃO É LOGADO, não vai para a URL e só volta no estado da ilha que o pediu.
 */

export interface EstadoDoAgendamento {
  readonly erro?: string;
  readonly codigo?: string;
  readonly segredo?: string;
}

export interface EstadoDaConsulta {
  readonly erro?: string;
  readonly reserva?: ReservaParaOCidadao;
  readonly naoEncontrada?: boolean;
}

export interface EstadoDoCancelamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * NA TELA PÚBLICA SÓ SOBE A RECUSA DO DOMÍNIO (código em maiúsculas) ou a do formulário. Erro de
 * infraestrutura vira a mensagem padrão: o público não lê nome de tabela nem pilha.
 */
function mensagemPublica(e: unknown, padrao: string): string {
  const m = mensagemDoErro(e, padrao);
  return e instanceof Error && !/^[A-Z][A-Z0-9-]+: /.test(e.message) && e.name !== "ZodError" ? padrao : m;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function agendarAction(_p: EstadoDoAgendamento, f: FormData): Promise<EstadoDoAgendamento> {
  if (t(f, "guicheId") === "" || t(f, "servicoId") === "") return { erro: "Escolha o serviço." };
  if (t(f, "nome") === "") return { erro: "Informe o seu nome completo." };
  if (t(f, "documento") === "") return { erro: "Informe o seu CPF ou CNPJ." };
  if (t(f, "dia") === "") return { erro: "Escolha o dia." };
  if (t(f, "horaInicio") === "") return { erro: "Escolha o horário." };
  try {
    const r = await agendarPublico({
      guicheId: t(f, "guicheId"),
      servicoId: t(f, "servicoId"),
      nome: t(f, "nome"),
      documento: t(f, "documento"),
      dia: t(f, "dia"),
      horaInicio: t(f, "horaInicio"),
    });
    return { codigo: r.codigo, segredo: r.segredo };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível marcar o atendimento. Nada foi reservado.") };
  }
}

export async function consultarAction(_p: EstadoDaConsulta, f: FormData): Promise<EstadoDaConsulta> {
  const segredo = t(f, "segredo");
  if (segredo === "") return { erro: "Informe o código de acompanhamento que você recebeu." };
  try {
    const r = await consultarPorSegredo(segredo);
    // ⚠️ NÃO ENCONTRADA É UMA RESPOSTA SÓ, para código errado e para código inexistente.
    return r === null ? { naoEncontrada: true } : { reserva: r };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível consultar agora. Tente mais tarde.") };
  }
}

export interface EstadoDaRemarcacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

export async function remarcarPublicoAction(_p: EstadoDaRemarcacao, f: FormData): Promise<EstadoDaRemarcacao> {
  if (t(f, "segredo") === "") return { erro: "Informe o código de acompanhamento." };
  if (t(f, "dia") === "" || t(f, "horaInicio") === "") return { erro: "Informe o novo dia e o novo horário." };
  try {
    return { sucesso: await remarcarPublico({ segredo: t(f, "segredo"), dia: t(f, "dia"), horaInicio: t(f, "horaInicio") }) };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível remarcar. A sua marcação continua como estava.") };
  }
}

export async function cancelarPublicoAction(_p: EstadoDoCancelamento, f: FormData): Promise<EstadoDoCancelamento> {
  if (t(f, "segredo") === "") return { erro: "Informe o código de acompanhamento." };
  if (t(f, "motivo") === "") return { erro: "Diga por que está cancelando — ajuda o ente a organizar o atendimento." };
  try {
    return { sucesso: await cancelarPublico({ segredo: t(f, "segredo"), motivo: t(f, "motivo") }) };
  } catch (e) {
    return { erro: mensagemPublica(e, "Não foi possível cancelar. Nada foi alterado.") };
  }
}
