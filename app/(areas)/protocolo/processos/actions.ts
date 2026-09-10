"use server";

import { revalidatePath } from "next/cache";
import {
  abrirProcessoNaTela,
  apensarNaTela,
  arquivarNaTela,
  atenderReadequacaoNaTela,
  complementarNaTela,
  desapensarNaTela,
  encerrarNaTela,
  preencherCamposNaTela,
  reabrirNaTela,
  receberNaTela,
  responderParecerNaTela,
  solicitarParecerNaTela,
  solicitarReadequacaoNaTela,
  tornarSemEfeitoNaTela,
  tramitarNaTela,
} from "../../../../lib/portas/protocolo";

/**
 * AS AÇÕES DO PROCESSO DIGITAL.
 *
 * ═══ ⚠️ NENHUM GUARD DE NEGÓCIO AQUI ═══
 * Situação fechada, taxa em aberto, lotação, sigilo, ordem do parecer: tudo do domínio,
 * dentro da transação. Uma conferência nesta camada estaria olhando um estado que já
 * envelheceu quando a gravação acontece — e, pior, criaria uma segunda regra que
 * divergiria da primeira no dia em que alguém corrigisse só uma delas.
 *
 * O que ESTA camada faz é traduzir `FormData` em entrada tipada e o erro do domínio em
 * mensagem de tela. Nada mais.
 */

export interface EstadoDoProcesso {
  readonly erro?: string;
  readonly sucesso?: string;
}

function revalidar(processoId?: string): void {
  revalidatePath("/protocolo/processos");
  if (processoId !== undefined) revalidatePath(`/protocolo/processos/${processoId}`);
}

/** A mensagem do domínio, inteira. Ela já foi escrita para quem lê. */
function comoErro(e: unknown): EstadoDoProcesso {
  return { erro: e instanceof Error ? e.message : String(e) };
}

const texto = (f: FormData, campo: string): string =>
  String(f.get(campo) ?? "").trim();

export async function abrirProcessoAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const assuntoId = texto(formData, "assuntoId");
  const setorAberturaId = texto(formData, "setorAberturaId");
  const requerenteId = texto(formData, "requerenteId");
  const contatoAnonimo = texto(formData, "contatoAnonimo");
  const textoAbertura = texto(formData, "textoAbertura");
  const exercicio = Number.parseInt(texto(formData, "exercicio"), 10);

  if (assuntoId === "") return { erro: "Escolha o assunto do processo." };
  if (setorAberturaId === "") return { erro: "Escolha o setor de abertura." };
  if (!Number.isInteger(exercicio)) return { erro: "Escolha o exercício." };

  try {
    const r = await abrirProcessoNaTela({
      exercicio,
      assuntoId,
      subassuntoId: texto(formData, "subassuntoId") || undefined,
      requerenteId: requerenteId !== "" ? requerenteId : undefined,
      contatoAnonimo: contatoAnonimo !== "" ? contatoAnonimo : undefined,
      finalidade:
        texto(formData, "finalidade") === "INTERNO" ? "INTERNO" : "ATENDIMENTO_AO_PUBLICO",
      prioridade:
        (["NORMAL", "ALTA", "URGENTE"] as const).find(
          (p) => p === texto(formData, "prioridade")
        ) ?? "NORMAL",
      sigiloso: formData.get("sigiloso") !== null,
      documentacaoFisica: formData.get("documentacaoFisica") !== null,
      textoAbertura,
      setorAberturaId,
      aceitouTermo: formData.get("aceitouTermo") !== null,
    });
    revalidar();
    return {
      sucesso:
        `Processo ${r.numero}/${r.ano} aberto. Código verificador: ${r.codigoVerificador} ` +
        `— é ele que o requerente usa para acompanhar sem senha.`,
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function tramitarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  const setorDestinoId = texto(formData, "setorDestinoId");
  if (setorDestinoId === "") return { erro: "Escolha o setor de destino." };

  try {
    const r = await tramitarNaTela({
      processoId,
      setorDestinoId,
      usuarioDestino: texto(formData, "usuarioDestino") || undefined,
      texto: texto(formData, "texto"),
    });
    revalidar(processoId);
    return {
      sucesso:
        r.alvos > 1
          ? `Tramitado — e os ${r.alvos - 1} apenso(s) foram junto, na mesma transação.`
          : "Tramitado.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function receberAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await receberNaTela(processoId);
    revalidar(processoId);
    return { sucesso: "Recebido. O prazo da etapa começa a contar agora." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function complementarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await complementarNaTela({ processoId, texto: texto(formData, "texto") });
    revalidar(processoId);
    return { sucesso: "Complemento registrado." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function solicitarParecerAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  const setorDestinoId = texto(formData, "setorDestinoId");
  if (setorDestinoId === "") return { erro: "Escolha a quem pedir o parecer." };
  try {
    await solicitarParecerNaTela({
      processoId,
      setorDestinoId,
      texto: texto(formData, "texto"),
    });
    revalidar(processoId);
    return { sucesso: "Parecer solicitado. O setor de destino foi notificado." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function responderParecerAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await responderParecerNaTela({
      processoId,
      solicitacaoId: texto(formData, "solicitacaoId"),
      texto: texto(formData, "texto"),
    });
    revalidar(processoId);
    return { sucesso: "Parecer respondido." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function solicitarReadequacaoAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await solicitarReadequacaoNaTela({ processoId, texto: texto(formData, "texto") });
    revalidar(processoId);
    return { sucesso: "Readequação solicitada ao requerente." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function atenderReadequacaoAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await atenderReadequacaoNaTela({
      processoId,
      solicitacaoId: texto(formData, "solicitacaoId"),
      texto: texto(formData, "texto"),
    });
    revalidar(processoId);
    return { sucesso: "Readequação atendida." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function encerrarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await encerrarNaTela({ processoId, texto: texto(formData, "texto") });
    revalidar(processoId);
    return { sucesso: "Processo encerrado." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function arquivarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await arquivarNaTela({ processoId, texto: texto(formData, "texto") });
    revalidar(processoId);
    return { sucesso: "Processo arquivado." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function reabrirAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await reabrirNaTela({ processoId, texto: texto(formData, "texto") });
    revalidar(processoId);
    return { sucesso: "Processo reaberto." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function apensarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoPrincipalId = texto(formData, "processoId");
  const processoApensoId = texto(formData, "processoApensoId");
  if (processoApensoId === "") return { erro: "Escolha o processo a apensar." };
  try {
    await apensarNaTela({
      processoPrincipalId,
      processoApensoId,
      motivo: texto(formData, "motivo"),
    });
    revalidar(processoPrincipalId);
    return { sucesso: "Apensado. A partir de agora os dois andam juntos." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function desapensarAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoPrincipalId = texto(formData, "processoId");
  try {
    await desapensarNaTela({
      processoPrincipalId,
      processoApensoId: texto(formData, "processoApensoId"),
      motivo: texto(formData, "motivo"),
    });
    revalidar(processoPrincipalId);
    return { sucesso: "Desapensado. Os processos voltam a andar separados." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function tornarSemEfeitoAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  try {
    await tornarSemEfeitoNaTela({
      processoId,
      movimentoId: texto(formData, "movimentoId"),
      motivo: texto(formData, "motivo"),
    });
    revalidar(processoId);
    return {
      sucesso:
        "Movimento tornado sem efeito. Ele continua no histórico, marcado — e com o " +
        "motivo e o autor de quem o desfez.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

/**
 * OS CAMPOS ADICIONAIS.
 *
 * ⚠️ SÓ OS CAMPOS QUE VIERAM NO FORMULÁRIO. Enviar todos, inclusive os intocados,
 * gravaria uma versão nova de cada um a cada salvamento — e o histórico, que é a
 * auditoria, encheria de linhas que não registram alteração nenhuma.
 */
export async function salvarCamposAction(
  _prev: EstadoDoProcesso,
  formData: FormData
): Promise<EstadoDoProcesso> {
  const processoId = texto(formData, "processoId");
  const valores: Record<string, string> = {};
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("campo:")) continue;
    valores[chave.slice("campo:".length)] = String(valor);
  }
  if (Object.keys(valores).length === 0) {
    return { erro: "Nenhum campo adicional para salvar." };
  }

  try {
    const r = await preencherCamposNaTela({ processoId, valores });
    revalidar(processoId);
    return {
      sucesso: `${r.gravados} campo(s) gravado(s)${r.apagados > 0 ? `, ${r.apagados} apagado(s)` : ""}.`,
    };
  } catch (e) {
    return comoErro(e);
  }
}
