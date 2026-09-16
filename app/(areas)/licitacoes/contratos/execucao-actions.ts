"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import {
  aditivoNaTela, cancelarSaldoNaTela, decidirNaTela, definitivoNaTela, descartarNaTela, emitirNaTela, estornarAditivoNaTela, estornarMedicaoNaTela, estornarRecebimentoNaTela, liquidarParcelaNaTela, medirOrdemNaTela, medirPelaPlanilhaNaTela, movimentarNaTela, previaDoAditivoNaTela, provisorioNaTela, rascunhoNaTela,
} from "../../../../lib/portas/execucao-do-contrato";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * AS AÇÕES DA EXECUÇÃO DO CONTRATO (V7 M2 U4). ⚠️ Nenhuma regra aqui: ação, designação vigente, saldo, elegível,
 * vigência e segregação são recusas do domínio, e sobem como vieram. `__id` é o contrato (para recarregar a página);
 * a ordem, a medição e o recebimento vêm nos campos do ato e são conferidos no servidor.
 */
export interface EstadoDaExecucao {
  readonly erro?: string;
  readonly sucesso?: string;
  /** O ato que produziu o estado — a prévia do aditivo não limpa o formulário. */
  readonly acao?: string;
}

const ATOS: Readonly<Record<string, (contratoId: string, c: Record<string, string>, arquivos: readonly File[]) => Promise<string>>> = {
  rascunho: (id, c) => rascunhoNaTela(id, c),
  emitir: (_id, c) => emitirNaTela(c),
  descartar: (_id, c) => descartarNaTela(c),
  cancelarSaldo: (_id, c) => cancelarSaldoNaTela(c),
  movimentar: (_id, c) => movimentarNaTela(c),
  medir: (_id, c) => medirOrdemNaTela(c),
  medirPelaPlanilha: (_id, c, arquivos) => medirPelaPlanilhaNaTela(c, arquivos),
  estornarMedicao: (_id, c) => estornarMedicaoNaTela(c),
  estornarRecebimento: (_id, c) => estornarRecebimentoNaTela(c),
  provisorio: (_id, c) => provisorioNaTela(c),
  decidir: (_id, c) => decidirNaTela(c),
  definitivo: (_id, c) => definitivoNaTela(c),
  liquidar: (_id, c) => liquidarParcelaNaTela(c),
  preverAditivo: (id, c) => previaDoAditivoNaTela(id, c),
  aditivo: (id, c) => aditivoNaTela(id, c),
  estornarAditivo: (_id, c) => estornarAditivoNaTela(c),
};

export async function execucaoAction(_prev: EstadoDaExecucao, formData: FormData): Promise<EstadoDaExecucao> {
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
    const ato = ATOS[acao];
    if (ato === undefined) return { erro: `Ação desconhecida: ${acao}. Nada foi gravado.` };
    let sucesso = "";
    try {
      sucesso = await ato(id, campos, arquivos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado."), acao };
    }
    if (acao !== "preverAditivo") revalidatePath(`/licitacoes/contratos/${id}`, "layout");
    return { sucesso, acao };
  });
}
