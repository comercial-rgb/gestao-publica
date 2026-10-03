"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { conferirBalancete, implantarNaTela, type PreviaDaImplantacao } from "../../../../lib/portas/implantacao-de-saldos";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/** A implantação dos saldos (V32): "conferir" só lê; "implantar" grava, e a recusa do domínio sobe inteira. */

export interface EstadoDaImplantacao {
  readonly erro?: string;
  readonly sucesso?: string;
  readonly previa?: PreviaDaImplantacao;
}

export async function implantacaoAction(_p: EstadoDaImplantacao, f: FormData): Promise<EstadoDaImplantacao> {
  const texto = String(f.get("balancete") ?? "");
  const dia = String(f.get("dia") ?? "").trim();
  const etapa = String(f.get("etapa") ?? "conferir");
  if (texto.trim() === "") return { erro: "Cole o balancete ou carregue o arquivo." };
  if (etapa === "conferir") {
    try {
      return { previa: await conferirBalancete(texto) };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível conferir o balancete.") };
    }
  }
  return comComandoDoFormulario(f, async () => {
    if (dia === "") return { erro: "Informe a data da implantação." };
    try {
      const sucesso = await implantarNaTela(texto, dia);
      revalidatePath("/contabilidade/implantacao-de-saldos");
      revalidatePath("/contabilidade/lancamentos");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível implantar os saldos. Nada foi gravado.") };
    }
  });
}
