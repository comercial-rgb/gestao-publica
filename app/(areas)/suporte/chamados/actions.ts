"use server";

import { revalidatePath } from "next/cache";
import {
  abrirChamadoNaTela,
  avaliarChamadoNaTela,
  encerrarChamadoNaTela,
  reabrirChamadoNaTela,
  responderChamadoNaTela,
} from "../../../../lib/portas/suporte";

export interface EstadoDoChamado {
  readonly erro?: string;
  readonly sucesso?: string;
}

function revalidar(chamadoId?: string): void {
  revalidatePath("/suporte/chamados");
  if (chamadoId !== undefined) revalidatePath(`/suporte/chamados/${chamadoId}`);
}

function comoErro(e: unknown): EstadoDoChamado {
  return { erro: e instanceof Error ? e.message : String(e) };
}

const texto = (f: FormData, campo: string): string => String(f.get(campo) ?? "").trim();

export async function abrirChamadoAction(
  _prev: EstadoDoChamado,
  formData: FormData
): Promise<EstadoDoChamado> {
  const unidadeOrcId = texto(formData, "unidadeOrcId");
  const severidadeId = texto(formData, "severidadeId");
  if (unidadeOrcId === "") return { erro: "Escolha a unidade gestora." };
  if (severidadeId === "") return { erro: "Escolha a severidade." };

  try {
    const r = await abrirChamadoNaTela({
      unidadeOrcId,
      severidadeId,
      titulo: texto(formData, "titulo"),
      descricao: texto(formData, "descricao"),
      rota: texto(formData, "rota") || undefined,
    });
    revalidar();
    return { sucesso: `Chamado ${r.numero} aberto.` };
  } catch (e) {
    return comoErro(e);
  }
}

export async function responderChamadoAction(
  _prev: EstadoDoChamado,
  formData: FormData
): Promise<EstadoDoChamado> {
  const chamadoId = texto(formData, "chamadoId");
  try {
    await responderChamadoNaTela({ chamadoId, texto: texto(formData, "texto") });
    revalidar(chamadoId);
    return {
      sucesso:
        "Resposta registrada — e ela NÃO encerra o chamado. Quem abriu é quem sabe se o " +
        "problema acabou.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function encerrarChamadoAction(
  _prev: EstadoDoChamado,
  formData: FormData
): Promise<EstadoDoChamado> {
  const chamadoId = texto(formData, "chamadoId");
  try {
    await encerrarChamadoNaTela({ chamadoId, texto: texto(formData, "texto") });
    revalidar(chamadoId);
    return { sucesso: "Chamado encerrado. Quem o abriu foi convidado a avaliar." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function reabrirChamadoAction(
  _prev: EstadoDoChamado,
  formData: FormData
): Promise<EstadoDoChamado> {
  const chamadoId = texto(formData, "chamadoId");
  try {
    await reabrirChamadoNaTela({ chamadoId, texto: texto(formData, "texto") });
    revalidar(chamadoId);
    return { sucesso: "Chamado reaberto." };
  } catch (e) {
    return comoErro(e);
  }
}

export async function avaliarChamadoAction(
  _prev: EstadoDoChamado,
  formData: FormData
): Promise<EstadoDoChamado> {
  const chamadoId = texto(formData, "chamadoId");
  const nota = Number.parseInt(texto(formData, "nota"), 10);
  if (!Number.isInteger(nota)) return { erro: "Escolha uma nota de 1 a 5." };

  try {
    await avaliarChamadoNaTela({
      chamadoId,
      nota,
      comentario: texto(formData, "comentario") || undefined,
    });
    revalidar(chamadoId);
    return {
      sucesso:
        "Avaliação gravada. Ela não se altera — uma nota que muda depois de o suporte " +
        "ver o resultado não é pesquisa, é negociação.",
    };
  } catch (e) {
    return comoErro(e);
  }
}
