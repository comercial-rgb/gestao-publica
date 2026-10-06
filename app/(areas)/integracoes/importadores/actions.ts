"use server";

import { revalidatePath } from "next/cache";
import { previewFolha, previewTributos, confirmarFolha, confirmarTributos, type PreviaImportacao, type LinhaFolha, type LinhaTributo } from "../../../../lib/portas/importadores";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
export interface EstadoImportacao {
  readonly erro?: string;
  readonly sucesso?: string;
  /** A prévia (nada foi gravado) — a confirmação é um segundo ato. */
  readonly previaFolha?: PreviaImportacao<LinhaFolha>;
  readonly previaTributos?: PreviaImportacao<LinhaTributo>;
  /** O conteúdo lido, devolvido à tela para a confirmação não reenviar o arquivo. */
  readonly conteudo?: string;
  readonly nomeArquivo?: string;
  readonly tipo?: "FOLHA" | "TRIBUTOS";
}

const EXERCICIO = 2026;

async function textoDoArquivo(formData: FormData): Promise<{ nome: string; texto: string } | null> {
  const f = formData.get("arquivo");
  if (!(f instanceof File) || f.size === 0) return null;
  return { nome: f.name, texto: await f.text() };
}

/** PRÉVIA — lê o arquivo, valida e devolve. NADA grava (a confirmação é outro ato). */
export async function previaAction(_prev: EstadoImportacao, formData: FormData): Promise<EstadoImportacao> {
  return comComandoDoFormulario(formData, async () => {
    const tipo = String(formData.get("tipo") ?? "FOLHA") === "TRIBUTOS" ? "TRIBUTOS" : "FOLHA";
    const arq = await textoDoArquivo(formData);
    if (arq === null) return { erro: "Escolha um arquivo CSV." };
    try {
      if (tipo === "FOLHA") {
        const previaFolha = await previewFolha(arq.nome, arq.texto);
        return { previaFolha, conteudo: arq.texto, nomeArquivo: arq.nome, tipo };
      }
      const previaTributos = await previewTributos(arq.nome, arq.texto);
      return { previaTributos, conteudo: arq.texto, nomeArquivo: arq.nome, tipo };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível ler o arquivo." };
    }
  });
}

/** CONFIRMAÇÃO — gera os fatos pelos serviços reais. Reimportar o mesmo arquivo é recusa nomeada. */
export async function confirmarAction(_prev: EstadoImportacao, formData: FormData): Promise<EstadoImportacao> {
  return comComandoDoFormulario(formData, async () => {
    const tipo = String(formData.get("tipo") ?? "FOLHA") === "TRIBUTOS" ? "TRIBUTOS" : "FOLHA";
    const conteudo = String(formData.get("conteudo") ?? "");
    const nomeArquivo = String(formData.get("nomeArquivo") ?? "");
    if (conteudo === "" || nomeArquivo === "") return { erro: "Faça a prévia antes de confirmar." };
    try {
      const r = tipo === "FOLHA"
        ? await confirmarFolha({ nomeArquivo, conteudo, exercicio: EXERCICIO, credorCpfCnpj: String(formData.get("credor") ?? "") })
        : await confirmarTributos({ nomeArquivo, conteudo, exercicio: EXERCICIO });
      revalidatePath("/integracoes/importadores");
      return { sucesso: `Importação confirmada: ${r.linhas} linha(s) e ${r.fatosGerados} registro(s) gerado(s). Identificador ${r.correlationId.slice(0, 8)}.` };
    } catch (e) {
      return { erro: e instanceof Error ? mensagemDoErro(e, "") : "Não foi possível confirmar a importação." };
    }
  });
}
