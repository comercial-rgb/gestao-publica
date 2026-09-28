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
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

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
  return comComandoDoFormulario(formData, async () => {
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
          `Rascunho ${r.numero} criado. Ele permanece na caixa de rascunhos até ser ` +
          `enviado.`,
      };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function editarRascunhoAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
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
  });
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
  return comComandoDoFormulario(formData, async () => {
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
  });
}

export async function responderAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    const setorRemetenteId = texto(formData, "setorRemetenteId");
    if (setorRemetenteId === "") return { erro: "Escolha o setor responsável pela resposta." };

    try {
      const r = await responderNaTela({
        comunicadoId,
        setorRemetenteId,
        assunto: texto(formData, "assunto"),
        corpo: texto(formData, "corpo"),
      });
      revalidar(comunicadoId);
      return {
        sucesso: `Resposta ${r.numero} enviada aos setores participantes do comunicado.`,
      };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function encaminharAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
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
          "Comunicado encaminhado. O setor incluído passa a poder responder, e o " +
          "encaminhamento fica registrado.",
      };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function marcarLeituraAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    try {
      const r = await marcarLeituraNaTela(comunicadoId);
      revalidar(comunicadoId);
      return {
        sucesso: r.jaLida
          ? "A ciência deste comunicado já havia sido registrada. Prevalece o primeiro registro."
          : "Ciência registrada, com data, hora e origem.",
      };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function arquivarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    try {
      await arquivarNaTela(comunicadoId);
      revalidar(comunicadoId);
      return { sucesso: "Comunicado arquivado na sua caixa. Para os demais destinatários, nada foi alterado." };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function desarquivarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    try {
      await desarquivarNaTela(comunicadoId);
      revalidar(comunicadoId);
      return { sucesso: "Comunicado desarquivado." };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function favoritarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    try {
      await favoritarNaTela(comunicadoId);
      revalidar(comunicadoId);
      return { sucesso: "Marcado como favorito." };
    } catch (e) {
      return comoErro(e);
    }
  });
}

export async function etiquetarAction(
  _prev: EstadoDoComunicado,
  formData: FormData
): Promise<EstadoDoComunicado> {
  return comComandoDoFormulario(formData, async () => {
    const comunicadoId = texto(formData, "comunicadoId");
    const tag = texto(formData, "tag");
    if (tag === "") return { erro: "Informe a etiqueta." };
    try {
      await etiquetarNaTela({ comunicadoId, tag });
      revalidar(comunicadoId);
      return { sucesso: `Etiqueta "${tag}" aplicada. Ela é visível a todos os participantes.` };
    } catch (e) {
      return comoErro(e);
    }
  });
}
