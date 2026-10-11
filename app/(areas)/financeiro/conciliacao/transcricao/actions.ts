"use server";

import { revalidatePath } from "next/cache";
import { desmascararValor } from "../../../../../lib/format/mascaras";
import { comComandoDoFormulario } from "../../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { revisarPelaTela, transcreverPelaTela } from "../../../../../lib/portas/transcricao-de-extrato";

/** V39-R3 (R3-015) — transcrever linhas de extrato e revisar a transcrição. Nenhuma regra aqui: o serviço decide. */
export interface EstadoDaTranscricao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export async function transcreverAction(_p: EstadoDaTranscricao, f: FormData): Promise<EstadoDaTranscricao> {
  return comComandoDoFormulario(f, async () => {
    const contaBancariaId = texto(f, "contaBancariaId");
    // Linhas em listas paralelas, na ordem do formulário (o mesmo desenho das retenções do pagamento).
    const lista = (k: string): string[] => f.getAll(k).map((v) => String(v).trim());
    const datas = lista("linhaData");
    const naturezas = lista("linhaNatureza");
    const valores = lista("linhaValor");
    const historicos = lista("linhaHistorico");
    const documentos = lista("linhaDocumento");
    const linhas = datas
      .map((data, i) => ({ data, natureza: naturezas[i] ?? "", valor: desmascararValor(valores[i] ?? ""), historico: historicos[i] ?? "", documento: documentos[i] ?? "" }))
      // Linha toda em branco é linha que não se usou; meio preenchida segue e o serviço recusa nomeando.
      .filter((l) => l.data !== "" || l.valor !== "" || l.historico !== "");
    if (contaBancariaId === "") return { erro: "Escolha a conta bancária. Nada foi gravado." };
    if (linhas.length === 0) return { erro: "Preencha ao menos uma linha. Nada foi gravado." };
    for (const [i, l] of linhas.entries()) {
      if (l.natureza !== "CREDITO" && l.natureza !== "DEBITO") return { erro: `Linha ${String(i + 1)}: escolha se é entrada ou saída. Nada foi gravado.` };
    }
    try {
      const sucesso = await transcreverPelaTela({
        contaBancariaId,
        linhas: linhas.map((l) => ({ data: l.data, natureza: l.natureza as "CREDITO" | "DEBITO", valor: l.valor, historico: l.historico, documento: l.documento === "" ? undefined : l.documento })),
        documentoDeSuporte: texto(f, "documentoDeSuporte"),
        observacao: texto(f, "observacao") === "" ? undefined : texto(f, "observacao"),
        confirmoLinhasRepetidas: f.get("confirmoLinhasRepetidas") === "on",
      });
      revalidatePath("/financeiro/conciliacao/transcricao");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível transcrever. Nada foi gravado.") };
    }
  });
}

export async function revisarAction(_p: EstadoDaTranscricao, f: FormData): Promise<EstadoDaTranscricao> {
  return comComandoDoFormulario(f, async () => {
    const resultado = texto(f, "resultado");
    if (resultado !== "CONFIRMADA" && resultado !== "DIVERGENTE") return { erro: "Escolha o resultado da revisão. Nada foi gravado." };
    try {
      const sucesso = await revisarPelaTela({ transcricaoId: texto(f, "transcricaoId"), resultado, meio: texto(f, "meio"), observacao: texto(f, "observacao") === "" ? undefined : texto(f, "observacao") });
      revalidatePath("/financeiro/conciliacao/transcricao");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar a revisão. Nada foi gravado.") };
    }
  });
}
