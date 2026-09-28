"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import {
  cadastrarEntidade,
  publicarVersaoDaEntidade,
  type AtoDoFormulario,
} from "../../../../lib/portas/entidades-contabeis";
import type { TipoDeAtoDeclarado } from "../../../../modules/m01-core-contabil/ato-declarado";

export interface EstadoDaEntidade {
  readonly erro?: string;
  readonly sucesso?: string;
}

/**
 * ⚠️ O ATO SAI DO FORMULÁRIO EM CINCO CAMPOS, e não num textão. Um campo só ("fundamento")
 * receberia "Lei 1.234/2005" e nada mais — e nenhum servidor conseguiria, depois, achar o
 * dispositivo. Separado, o que falta fica visível enquanto se digita.
 *
 * ⚠️ E A VALIDAÇÃO DE VERDADE NÃO ESTÁ AQUI. Esta função só monta o objeto; quem confere ano,
 * número, dispositivo, citação e APLICABILIDADE é o domínio, dentro da transação. Conferir na
 * Server Action deixaria a mesma regra fora do caminho do teste de domínio e fora do caminho de
 * qualquer outro chamador.
 */
function atoDoFormulario(formData: FormData): AtoDoFormulario {
  return {
    atoTipo: String(formData.get("atoTipo") ?? "") as TipoDeAtoDeclarado,
    atoNumero: String(formData.get("atoNumero") ?? "").trim(),
    atoAno: Number.parseInt(String(formData.get("atoAno") ?? ""), 10),
    atoDispositivo: String(formData.get("atoDispositivo") ?? "").trim(),
    atoCitacao: String(formData.get("atoCitacao") ?? "").trim(),
  };
}

export async function cadastrarEntidadeAction(
  _prev: EstadoDaEntidade,
  formData: FormData
): Promise<EstadoDaEntidade> {
  return comComandoDoFormulario(formData, async () => {
    const codigo = String(formData.get("codigo") ?? "").trim();
    const nome = String(formData.get("nome") ?? "").trim();
    const cnpj = String(formData.get("cnpj") ?? "").replace(/\D+/gu, "");
    const tipoManad = String(formData.get("tipoManad") ?? "").trim();

    try {
      await cadastrarEntidade({
        codigo,
        nome,
        ...(cnpj !== "" ? { cnpj } : {}),
        tipoManad,
        ato: atoDoFormulario(formData),
      });
      revalidatePath("/contabilidade/entidades");
      return { sucesso: `Entidade ${codigo} — ${nome} cadastrada.` };
    } catch (e) {
      // A mensagem do domínio é a que nomeia o motivo e o que fazer. Reescrevê-la aqui apagaria
      // exatamente a orientação que ela carrega.
      return { erro: e instanceof Error ? e.message : "Não foi possível cadastrar a entidade." };
    }
  });
}

export async function publicarVersaoAction(
  _prev: EstadoDaEntidade,
  formData: FormData
): Promise<EstadoDaEntidade> {
  return comComandoDoFormulario(formData, async () => {
    const entidadeId = String(formData.get("entidadeId") ?? "").trim();
    const nome = String(formData.get("nome") ?? "").trim();
    const cnpj = String(formData.get("cnpj") ?? "").replace(/\D+/gu, "");
    const tipoManad = String(formData.get("tipoManad") ?? "").trim();

    try {
      const versao = await publicarVersaoDaEntidade({
        entidadeId,
        nome,
        ...(cnpj !== "" ? { cnpj } : {}),
        tipoManad,
        ato: atoDoFormulario(formData),
      });
      revalidatePath("/contabilidade/entidades");
      return {
        sucesso: `Versão ${String(versao)} publicada. A versão anterior permanece no histórico, e as guias já emitidas mantêm a entidade original.`,
      };
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível publicar a versão." };
    }
  });
}
