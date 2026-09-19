"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import {
  decidirRecursoNaTela,
  distribuirNaTela,
  interporNaTela,
  prorrogarNaTela,
  protocolarNaTela,
  receberNaTela,
  responderNaTela,
} from "../../../../../lib/portas/pedido-de-acesso";

/**
 * OS ATOS DO RITO DO ACESSO À INFORMAÇÃO (V11 V5.3).
 *
 * ⚠️ NENHUMA REGRA AQUI. Prazo, prorrogação cabível, prévia que não é resposta, recurso fora de
 * instância — tudo é do domínio do M21. A recusa sobe COMO VEIO, com o código na frente, porque é
 * o código que diz ao servidor o que corrigir. Reescrevê-la em "não foi possível" apagaria a
 * diferença entre "acabaram as prorrogações" e "já foi respondido".
 */
export interface EstadoDoAto {
  readonly erro?: string;
  readonly sucesso?: string;
}

type Executor = (campos: Record<string, string>) => Promise<string>;

/**
 * O corpo comum — ler os campos, chamar a porta, revalidar, e devolver a recusa COMO VEIO.
 *
 * ⚠️ ELE NÃO ABRE A RESERVA DE COMANDO, e isso é de propósito. Cada ação abaixo chama
 * `comComandoDoFormulario` ELA MESMA, à vista de quem lê. Esconder o funil dentro deste helper
 * economizaria sete linhas e cegaria o guard que confere se toda Server Action passa por ele —
 * e o dia em que alguém escrevesse a oitava ação sem o funil, ninguém seria avisado.
 */
async function executar(formData: FormData, quem: Executor, aoFalhar: string): Promise<EstadoDoAto> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") campos[k] = v;
  try {
    const mensagem = await quem(campos);
    revalidatePath("/protocolo/acesso-a-informacao/pedidos");
    if (campos["pedidoId"] !== undefined) {
      revalidatePath(`/protocolo/acesso-a-informacao/pedidos/${campos["pedidoId"]}`);
    }
    return { sucesso: mensagem };
  } catch (e) {
    return { erro: mensagemDoErro(e, aoFalhar) };
  }
}

export async function protocolarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, protocolarNaTela, "Não foi possível protocolar o pedido. Nada foi gravado."));
}
export async function distribuirAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, distribuirNaTela, "Não foi possível encaminhar o pedido. Nada foi gravado."));
}
export async function receberAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, receberNaTela, "Não foi possível receber o pedido. Nada foi gravado."));
}
export async function prorrogarAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, prorrogarNaTela, "Não foi possível prorrogar o prazo. Nada foi gravado."));
}
export async function responderAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, responderNaTela, "Não foi possível registrar a resposta. Nada foi gravado."));
}
export async function interporAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, interporNaTela, "Não foi possível registrar o recurso. Nada foi gravado."));
}
export async function decidirRecursoAction(_p: EstadoDoAto, f: FormData): Promise<EstadoDoAto> {
  return comComandoDoFormulario(f, async () => executar(f, decidirRecursoNaTela, "Não foi possível decidir o recurso. Nada foi gravado."));
}
