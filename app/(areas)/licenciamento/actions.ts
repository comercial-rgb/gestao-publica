"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../lib/portas/comando";
import { mensagemDoErro } from "../../../lib/portas/mensagem-do-erro";
import {
  encerrarContratoNaTela,
  habilitarModuloNaTela,
  programarVigenciaNaTela,
  reativarModuloNaTela,
  registrarContratoNaTela,
  suspenderModuloNaTela,
} from "../../../lib/portas/licenciamento-admin";

/**
 * AS AÇÕES DO CONTRATO COMERCIAL (V10 T1 · N6.1).
 *
 * ⚠️ NENHUMA REGRA AQUI: autorização, dependência entre módulos, vigência invertida,
 * idempotência e a recusa de suspender o que sustenta outro são recusas do DOMÍNIO
 * (`modules/m35-licenciamento`). Esta camada traduz o formulário e o erro.
 *
 * ⚠️ E A MENSAGEM DE "JÁ APLICADO" NÃO É ERRO. Repetir a mesma habilitação devolve
 * `novo: false` e a tela diz que nada foi gravado — um "sucesso" indistinguível esconderia de
 * quem clicou duas vezes que a segunda não fez nada; um "erro" mandaria abrir chamado por um
 * comportamento correto.
 */
export interface EstadoDoLicenciamento {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly semEfeito?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string): string | null => {
  const v = texto(f, k);
  return v === "" ? null : v;
};

function revalidar(): void {
  revalidatePath("/licenciamento");
  // ⚠️ O LAYOUT TAMBÉM: o menu deriva das situações dos módulos, e uma suspensão que não
  // atualizasse a barra lateral deixaria o link de uma área que já recusa cada ato.
  revalidatePath("/", "layout");
}

function traduzir(r: { readonly novo: boolean; readonly detalhe: string }): EstadoDoLicenciamento {
  revalidar();
  return r.novo ? { sucesso: r.detalhe } : { semEfeito: r.detalhe };
}

export async function registrarContratoAction(
  _prev: EstadoDoLicenciamento,
  formData: FormData
): Promise<EstadoDoLicenciamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      return traduzir(
        await registrarContratoNaTela({
          numero: texto(formData, "numero"),
          cliente: texto(formData, "cliente"),
          inicio: texto(formData, "inicio"),
          fim: opcional(formData, "fim"),
          observacao: opcional(formData, "observacao"),
          demonstracao: formData.get("demonstracao") === "on",
        })
      );
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o contrato. Nada foi gravado.") };
    }
  });
}

export async function encerrarContratoAction(
  _prev: EstadoDoLicenciamento,
  formData: FormData
): Promise<EstadoDoLicenciamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      return traduzir(
        await encerrarContratoNaTela({
          contratoId: texto(formData, "__contrato"),
          motivo: texto(formData, "motivo"),
        })
      );
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível encerrar o contrato. Nada foi gravado.") };
    }
  });
}

export async function habilitarModuloAction(
  _prev: EstadoDoLicenciamento,
  formData: FormData
): Promise<EstadoDoLicenciamento> {
  return comComandoDoFormulario(formData, async () => {
    const entrada = {
      contratoId: texto(formData, "__contrato"),
      modulo: texto(formData, "__modulo"),
      inicio: texto(formData, "inicio"),
      fim: opcional(formData, "fim"),
      motivo: texto(formData, "motivo"),
    };
    const jaContratado = formData.get("__contratado") === "sim";
    try {
      return traduzir(
        jaContratado ? await programarVigenciaNaTela(entrada) : await habilitarModuloNaTela(entrada)
      );
    } catch (e) {
      return {
        erro: mensagemDoErro(
          e,
          jaContratado
            ? "Não foi possível programar a vigência. Nada foi gravado."
            : "Não foi possível habilitar o módulo. Nada foi gravado."
        ),
      };
    }
  });
}

export async function suspenderModuloAction(
  _prev: EstadoDoLicenciamento,
  formData: FormData
): Promise<EstadoDoLicenciamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      return traduzir(
        await suspenderModuloNaTela({
          contratoId: texto(formData, "__contrato"),
          modulo: texto(formData, "__modulo"),
          motivo: texto(formData, "motivo"),
        })
      );
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível suspender o módulo. Nada foi gravado.") };
    }
  });
}

export async function reativarModuloAction(
  _prev: EstadoDoLicenciamento,
  formData: FormData
): Promise<EstadoDoLicenciamento> {
  return comComandoDoFormulario(formData, async () => {
    try {
      return traduzir(
        await reativarModuloNaTela({
          contratoId: texto(formData, "__contrato"),
          modulo: texto(formData, "__modulo"),
          motivo: texto(formData, "motivo"),
        })
      );
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível reativar o módulo. Nada foi gravado.") };
    }
  });
}
