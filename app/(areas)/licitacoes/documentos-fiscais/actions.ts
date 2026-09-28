"use server";

import { revalidatePath } from "next/cache";
import type { EstadoDoMolde } from "../../../../components/molde/FormularioDeRecurso";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { linhasDoFormulario } from "../../../../lib/portas/linhas-do-formulario";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { DOCUMENTOS_FISCAIS } from "../../../../lib/portas/recursos/documentos-fiscais";
import {
  acaoDoDocumentoFiscal,
  criarDocumentoFiscal,
  importarDocumentoFiscal,
} from "../../../../lib/portas/recursos/documentos-fiscais-dados";

export interface EstadoDoDocumentoFiscal {
  readonly erro?: string;
  readonly sucesso?: string;
}

function camposDe(formData: FormData): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (typeof v === "string") campos[k] = v;
  }
  return campos;
}

export async function registrarDocumentoFiscalAction(
  _prev: EstadoDoDocumentoFiscal,
  formData: FormData
): Promise<EstadoDoDocumentoFiscal> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const itens = linhasDoFormulario(formData, "itens", [
      "descricao",
      "unidade",
      "quantidade",
      "valorUnitario",
      "valorTotal",
      "desconto",
      "acrescimo",
    ]).map((l) => ({
      descricao: l["descricao"] ?? "",
      unidade: l["unidade"] ?? "",
      quantidade: l["quantidade"] ?? "",
      valorUnitario: l["valorUnitario"] ?? "",
      valorTotal: l["valorTotal"] ?? "",
      ...(l["desconto"] !== "" ? { desconto: l["desconto"] } : {}),
      ...(l["acrescimo"] !== "" ? { acrescimo: l["acrescimo"] } : {}),
    }));
    try {
      await criarDocumentoFiscal(campos, itens);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível registrar o documento. Nada foi gravado.") };
    }
    revalidatePath(DOCUMENTOS_FISCAIS.rota);
    return {
      sucesso: `Nota ${campos["numero"] ?? ""}/${campos["serie"] ?? ""} registrada, aguardando conferência. O registro não produz entrada em estoque nem liquidação.`,
    };
  });
}

export async function importarDocumentoFiscalAction(
  _prev: EstadoDoDocumentoFiscal,
  formData: FormData
): Promise<EstadoDoDocumentoFiscal> {
  return comComandoDoFormulario(formData, async () => {
    const arquivo = formData.get("xml");
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      return { erro: "Escolha o arquivo XML da nota. Nada foi gravado." };
    }
    if (arquivo.size > 1_048_576) {
      return { erro: "O XML excede 1 MB. Nada foi gravado." };
    }
    const xml = await arquivo.text();
    const campos = camposDe(formData);
    try {
      await importarDocumentoFiscal(xml, arquivo.name, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível importar o XML. Nada foi gravado.") };
    }
    revalidatePath(DOCUMENTOS_FISCAIS.rota);
    return {
      sucesso: `XML "${arquivo.name}" importado, aguardando conferência. A importação verifica a estrutura do arquivo e não confirma a autorização na SEFAZ.`,
    };
  });
}

export async function documentosfiscaisAction(
  _prev: EstadoDoMolde,
  formData: FormData
): Promise<EstadoDoMolde> {
  return comComandoDoFormulario(formData, async () => {
    const campos = camposDe(formData);
    const acao = campos["__acao"] ?? "";
    const id = campos["__id"] ?? "";
    if (id === "") return { erro: "Registro não identificado. Nada foi gravado." };
    try {
      await acaoDoDocumentoFiscal(acao, id, campos);
    } catch (e) {
      return { erro: mensagemDoErro(e, "Falha ao gravar. Nada foi gravado.") };
    }
    revalidatePath(DOCUMENTOS_FISCAIS.rota);
    revalidatePath(`${DOCUMENTOS_FISCAIS.rota}/${id}`);
    if (acao === "conferir") {
      return { sucesso: `Documento conferido com a origem.` };
    }
    return { sucesso: "Documento cancelado. O registro original permanece no histórico." };
  });
}
