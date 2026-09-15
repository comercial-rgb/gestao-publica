"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { designarNaTela, itemNaTela, medirNaTela, ocorrenciaNaTela, programarNaTela, resolverNaTela, revogarNaTela } from "../../../../lib/portas/contrato-acompanhado";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * AS AÇÕES DO CONTRATO ACOMPANHADO (V7 M2.1). ⚠️ Nenhuma regra aqui: ação, designação vigente, vigência do
 * contrato, teto por item e segregação são recusas do domínio, e sobem como vieram.
 */
export interface EstadoDoAcompanhamento {
  readonly erro?: string;
  readonly sucesso?: string;
}

const ATOS = {
  designar: (id: string, c: Record<string, string>) => designarNaTela(id, c),
  revogar: (_id: string, c: Record<string, string>) => revogarNaTela(c),
  item: (id: string, c: Record<string, string>) => itemNaTela(id, c),
  programar: (id: string, c: Record<string, string>) => programarNaTela(id, c),
  resolver: (_id: string, c: Record<string, string>) => resolverNaTela(c),
  medir: (id: string, c: Record<string, string>) => medirNaTela(id, c),
} as const;

export async function acompanhamentoAction(_prev: EstadoDoAcompanhamento, formData: FormData): Promise<EstadoDoAcompanhamento> {
  return comComandoDoFormulario(formData, async () => {
    const campos: Record<string, string> = {};
    const arquivos: File[] = [];
    for (const [k, v] of formData.entries()) {
      if (typeof v === "string") campos[k] = v;
      else if (k === "evidencias") arquivos.push(v);
    }
    const id = campos["__id"] ?? "";
    const acao = campos["__acao"] ?? "";
    if (id === "") return { erro: "Contrato não identificado. Nada foi gravado." };
    let sucesso = "";
    try {
      if (acao === "ocorrencia") sucesso = await ocorrenciaNaTela(id, campos, arquivos);
      else if (acao in ATOS) sucesso = await ATOS[acao as keyof typeof ATOS](id, campos);
      else throw new Error(`Ação desconhecida: ${acao}`);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(`/licitacoes/contratos/${id}`);
    return { sucesso };
  });
}
