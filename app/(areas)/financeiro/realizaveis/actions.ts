"use server";

import { revalidatePath } from "next/cache";
import { desmascararValor } from "../../../../lib/format/mascaras";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { anularPelaTela, cadastrarCategoriaPelaTela, decidirContaPelaTela, movimentarPelaTela } from "../../../../lib/portas/realizavel";

/** V39-R3 (R3-016) — os atos da tela dos realizáveis. Nenhuma regra aqui: o serviço decide e a mensagem sobe como veio. */
export interface EstadoDoRealizavel {
  readonly erro?: string;
  readonly sucesso?: string;
}

const texto = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

async function ato(f: FormData, corpo: () => Promise<string>, padrao: string): Promise<EstadoDoRealizavel> {
  return comComandoDoFormulario(f, async () => {
    try {
      const sucesso = await corpo();
      revalidatePath("/financeiro/realizaveis");
      return { sucesso };
    } catch (e) {
      return { erro: mensagemDoErro(e, padrao) };
    }
  });
}

export async function cadastrarCategoriaAction(_p: EstadoDoRealizavel, f: FormData): Promise<EstadoDoRealizavel> {
  return ato(f, () => cadastrarCategoriaPelaTela({ codigo: texto(f, "codigo"), descricao: texto(f, "descricao") }), "Não foi possível cadastrar a categoria. Nada foi gravado.");
}

export async function decidirContaAction(_p: EstadoDoRealizavel, f: FormData): Promise<EstadoDoRealizavel> {
  const situacao = texto(f, "situacao");
  if (situacao !== "ATIVA" && situacao !== "SUSPENSA") return { erro: "Escolha se a categoria fica ativa ou suspensa. Nada foi gravado." };
  // A busca mostra "código — nome"; o serviço recebe o código.
  const conta = texto(f, "contaAtivo").split(" — ")[0]?.trim() ?? "";
  return ato(f, () => decidirContaPelaTela({ categoriaId: texto(f, "categoriaId"), contaAtivoCodigo: conta === "" ? null : conta, ativa: situacao === "ATIVA", fundamento: texto(f, "fundamento") }), "Não foi possível registrar a decisão. Nada foi gravado.");
}

export async function movimentarAction(_p: EstadoDoRealizavel, f: FormData): Promise<EstadoDoRealizavel> {
  const tipo = texto(f, "tipo");
  if (tipo !== "CONSTITUICAO" && tipo !== "BAIXA") return { erro: "Escolha se o dinheiro sai (constituição) ou volta (baixa). Nada foi gravado." };
  return ato(
    f,
    () => {
      // "conta|fonte": a conta bancária e a fonte do rol dela, escolhidas juntas.
      const [contaBancariaId = "", fonteId = ""] = texto(f, "contaEFonte").split("|");
      return movimentarPelaTela({ tipo, categoriaId: texto(f, "categoriaId"), devedor: texto(f, "devedor"), valor: desmascararValor(texto(f, "valor")), data: texto(f, "data"), historico: texto(f, "historico"), documento: texto(f, "documento"), contaBancariaId, fonteId });
    },
    "Não foi possível registrar o movimento. Nada foi gravado.",
  );
}

export async function anularAction(_p: EstadoDoRealizavel, f: FormData): Promise<EstadoDoRealizavel> {
  return ato(f, () => anularPelaTela({ movimentoId: texto(f, "movimentoId"), motivo: texto(f, "motivo"), data: texto(f, "data") }), "Não foi possível anular o movimento. Nada foi gravado.");
}
