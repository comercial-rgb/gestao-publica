"use server";

import { revalidatePath } from "next/cache";
import {
  arquivarNaTela,
  desarquivarNaTela,
  editarRascunhoNaTela,
  encaminharNaTela,
  enviarNaTela,
  etiquetarNaTela,
  favoritarNaTela,
  marcarLeituraNaTela,
  rascunharNaTela,
  responderNaTela,
} from "../../../../lib/portas/comunicacao";

/**
 * AS AÇÕES DA COMUNICAÇÃO INTERNA.
 *
 * ⚠️ NENHUM GUARD AQUI. Circular não aceitar resposta, resposta alcançar só quem já
 * estava, assinatura exigida pelo tipo, rascunho editável só antes do envio — tudo do
 * caso de uso, dentro da transação. É por isso que uma requisição direta encontra
 * exatamente a mesma recusa que a tela.
 */

export interface EstadoDoComunicado {
  readonly erro?: string;
  readonly sucesso?: string;
}

function revalidar(comunicadoId?: string): void {
  revalidatePath("/comunicacao/comunicados");
  if (comunicadoId !== undefined) revalidatePath(`/comunicacao/comunicados/${comunicadoId}`);
}

function comoErro(e: unknown): EstadoDoComunicado {
  return { erro: e instanceof Error ? e.message : String(e) };
}

const texto = (f: FormData, campo: string): string => String(f.get(campo) ?? "").trim();

export async function rascunharAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const exercicio = Number.parseInt(texto(formData, "exercicio"), 10);
  const tipoId = texto(formData, "tipoId");
  const setorRemetenteId = texto(formData, "setorRemetenteId");

  if (!Number.isInteger(exercicio)) return { erro: "Escolha o exercício." };
  if (tipoId === "") return { erro: "Escolha o tipo do comunicado." };
  if (setorRemetenteId === "") return { erro: "Escolha o setor remetente." };

  try {
    const r = await rascunharNaTela({
      exercicio,
      tipoId,
      setorRemetenteId,
      assunto: texto(formData, "assunto"),
      corpo: texto(formData, "corpo"),
    });
    revalidar();
    return {
      sucesso:
        `Rascunho ${r.numero} criado. Ele já nasce numerado — e só sai da sua caixa de ` +
        `rascunhos quando você o enviar.`,
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function editarRascunhoAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  try {
    await editarRascunhoNaTela({
      comunicadoId,
      assunto: texto(formData, "assunto"),
      corpo: texto(formData, "corpo"),
    });
    revalidar(comunicadoId);
    return { sucesso: "Rascunho atualizado." };
  } catch (e) {
    return comoErro(e);
  }
}

/**
 * ENVIAR — com um ou mais setores de destino.
 *
 * ⚠️ OS DESTINATÁRIOS VÊM COMO CAMPOS REPETIDOS (`destino`), e o A/C é opcional e
 * global ao envio. Um par por linha exigiria JavaScript para montar; assim o formulário
 * funciona com HTML puro, que é o que um smoke de navegador exercita de verdade.
 */
export async function enviarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  const setores = formData
    .getAll("destino")
    .map((v) => String(v).trim())
    .filter((v) => v !== "");
  if (setores.length === 0) {
    return { erro: "Escolha ao menos um setor de destino." };
  }
  const ac = texto(formData, "aosCuidadosDe");
  const modo = texto(formData, "modoDeAssinatura");

  try {
    const r = await enviarNaTela({
      comunicadoId,
      destinatarios: setores.map((setorId) => ({
        setorId,
        aosCuidadosDe: ac !== "" ? ac : undefined,
      })),
      modoDeAssinatura:
        modo === "SIMPLES" || modo === "AVANCADA" || modo === "QUALIFICADA"
          ? modo
          : undefined,
    });
    revalidar(comunicadoId);
    return { sucesso: `Enviado a ${r.destinatarios} setor(es).` };
  } catch (e) {
    return comoErro(e);
  }
}

export async function responderAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  const setorRemetenteId = texto(formData, "setorRemetenteId");
  if (setorRemetenteId === "") return { erro: "Escolha por qual setor você responde." };

  try {
    const r = await responderNaTela({
      comunicadoId,
      setorRemetenteId,
      assunto: texto(formData, "assunto"),
      corpo: texto(formData, "corpo"),
    });
    revalidar(comunicadoId);
    return {
      sucesso: `Resposta ${r.numero} enviada aos setores que já estavam na conversa.`,
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function encaminharAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  const setorDestinoId = texto(formData, "setorDestinoId");
  if (setorDestinoId === "") return { erro: "Escolha o setor a incluir." };
  const ac = texto(formData, "aosCuidadosDe");

  try {
    await encaminharNaTela({
      comunicadoId,
      setorDestinoId,
      aosCuidadosDe: ac !== "" ? ac : undefined,
    });
    revalidar(comunicadoId);
    return {
      sucesso:
        "Encaminhado. O setor incluído passa a poder responder — e o encaminhamento " +
        "fica registrado como tal.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function marcarLeituraAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  try {
    const r = await marcarLeituraNaTela(comunicadoId);
    revalidar(comunicadoId);
    return {
      sucesso: r.jaLida
        ? "Você já havia registrado ciência deste comunicado — a primeira leitura é a que vale."
        : "Ciência registrada, com o instante e a origem.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function arquivarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  try {
    await arquivarNaTela(comunicadoId);
    revalidar(comunicadoId);
    return { sucesso: "Arquivado na SUA caixa — para os outros nada mudou." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function desarquivarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  try {
    await desarquivarNaTela(comunicadoId);
    revalidar(comunicadoId);
    return { sucesso: "Desarquivado." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function favoritarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  try {
    await favoritarNaTela(comunicadoId);
    revalidar(comunicadoId);
    return { sucesso: "Marcado como favorito." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function etiquetarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  const comunicadoId = texto(formData, "comunicadoId");
  const tag = texto(formData, "tag");
  if (tag === "") return { erro: "Escreva a etiqueta." };
  try {
    await etiquetarNaTela({ comunicadoId, tag });
    revalidar(comunicadoId);
    return { sucesso: `Etiqueta "${tag}" aplicada — e ela é visível a todos os envolvidos.` };
  } catch (e) {
    return comoErro(e);
  }
}
