"use server";

import { revalidatePath } from "next/cache";
import {
  copiarModeloNaTela,
  criarModeloNaTela,
  distribuirModeloNaTela,
  executarNaTela,
  retirarModeloNaTela,
} from "../../../../lib/portas/designer";

/**
 * AS AÇÕES DO DESIGNER.
 *
 * ⚠️ A EXPRESSÃO VAI COMO TEXTO, e é o DOMÍNIO que a analisa. Nenhuma validação de
 * gramática aqui: uma segunda gramática nesta camada divergiria da primeira no dia em
 * que alguém acrescentasse uma função a uma só delas — e a divergência interessante
 * seria sempre a mesma (aqui aceita, lá recusa, ou pior: aqui recusa, lá aceita).
 */

export interface EstadoDoDesigner {
  readonly erro?: string;
  readonly sucesso?: string;
}

function revalidar(): void {
  revalidatePath("/relatorios/designer");
}

function comoErro(e: unknown): EstadoDoDesigner {
  return { erro: e instanceof Error ? e.message : String(e) };
}

const texto = (f: FormData, campo: string): string => String(f.get(campo) ?? "").trim();

const TIPOS = ["TEXTO", "NUMERO", "MOEDA", "DATA", "BOOLEANO"] as const;
type TipoDeColuna = (typeof TIPOS)[number];

export async function criarModeloAction(
  _prev: EstadoDoDesigner,
  formData: FormData
): Promise<EstadoDoDesigner> {
  const unidadeOrcId = texto(formData, "unidadeOrcId");
  const fonteBruta = texto(formData, "fonte");
  const fonte = fonteBruta === "COMUNICADOS" ? "COMUNICADOS" : "PROCESSOS";

  // As colunas vêm em campos paralelos numerados — HTML puro, sem montagem por script.
  const rotulos = formData.getAll("colRotulo").map((v) => String(v).trim());
  const expressoes = formData.getAll("colExpressao").map((v) => String(v).trim());
  const tipos = formData.getAll("colTipo").map((v) => String(v).trim());

  const colunas = rotulos
    .map((rotulo, i) => ({
      ordem: i + 1,
      rotulo,
      expressao: expressoes[i] ?? "",
      tipo: (TIPOS.find((t) => t === tipos[i]) ?? "TEXTO") as TipoDeColuna,
    }))
    .filter((c) => c.rotulo !== "" && c.expressao !== "");

  if (unidadeOrcId === "") return { erro: "Escolha a unidade gestora." };
  if (colunas.length === 0) {
    return {
      erro:
        "Preencha ao menos uma coluna, com rótulo e expressão. Um relatório sem coluna " +
        "nenhuma não é relatório.",
    };
  }

  try {
    await criarModeloNaTela({
      unidadeOrcId,
      codigo: texto(formData, "codigo"),
      nome: texto(formData, "nome"),
      descricao: texto(formData, "descricao") || undefined,
      fonte,
      visibilidade: texto(formData, "visibilidade") === "PUBLICO" ? "PUBLICO" : "AUTOR",
      colunas,
    });
    revalidar();
    return {
      sucesso: `Modelo criado com ${colunas.length} coluna(s). As expressões foram analisadas agora — não na primeira execução.`,
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function copiarModeloAction(
  _prev: EstadoDoDesigner,
  formData: FormData
): Promise<EstadoDoDesigner> {
  try {
    await copiarModeloNaTela({
      modeloId: texto(formData, "modeloId"),
      novoCodigo: texto(formData, "novoCodigo"),
      novoNome: texto(formData, "novoNome"),
    });
    revalidar();
    return {
      sucesso:
        "Cópia criada — o original não foi tocado. E a cópia nasce RESTRITA ao autor, " +
        "mesmo tendo sido derivada de um modelo público.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function distribuirModeloAction(
  _prev: EstadoDoDesigner,
  formData: FormData
): Promise<EstadoDoDesigner> {
  const unidadeOrcId = texto(formData, "unidadeOrcId");
  if (unidadeOrcId === "") return { erro: "Escolha a unidade gestora de destino." };
  try {
    await distribuirModeloNaTela({
      modeloId: texto(formData, "modeloId"),
      unidadeOrcId,
    });
    revalidar();
    return {
      sucesso:
        "Distribuído. A outra unidade passa a EXECUTAR este modelo sobre os dados dela — " +
        "não recebeu uma cópia, que divergiria na primeira correção.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function retirarModeloAction(
  _prev: EstadoDoDesigner,
  formData: FormData
): Promise<EstadoDoDesigner> {
  try {
    await retirarModeloNaTela({
      modeloId: texto(formData, "modeloId"),
      motivo: texto(formData, "motivo"),
    });
    revalidar();
    return {
      sucesso:
        "Modelo retirado de vigência. Ele não produz relatório novo; as execuções " +
        "antigas continuam disponíveis.",
    };
  } catch (e) {
    return comoErro(e);
  }
}

export async function executarAction(
  _prev: EstadoDoDesigner,
  formData: FormData
): Promise<EstadoDoDesigner> {
  const unidadeOrcId = texto(formData, "unidadeOrcId");
  if (unidadeOrcId === "") return { erro: "Escolha a unidade gestora." };
  try {
    await executarNaTela({
      modeloId: texto(formData, "modeloId"),
      unidadeOrcId,
      filtros: texto(formData, "filtros") || undefined,
    });
    revalidar();
    return {
      sucesso:
        "Execução ENFILEIRADA. Ela roda em segundo plano e você será notificado ao " +
        "término — o relatório não é calculado dentro desta requisição.",
    };
  } catch (e) {
    return comoErro(e);
  }
}
