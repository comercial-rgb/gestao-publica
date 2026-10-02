"use server";

import { revalidatePath } from "next/cache";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { cadastrarFarmaciaPelaTela, informarEstoquePelaTela, publicarVersaoDaFarmaciaPelaTela } from "../../../../lib/portas/frota";

export interface EstadoDaFarmacia {
  readonly erro?: string;
  readonly sucesso?: string;
}

const t = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();
/** Tamanho máximo do arquivo de estoque aceito pela tela (texto). */
const LIMITE_DO_ARQUIVO = 2 * 1024 * 1024;

async function ato(corpo: () => Promise<string>, padrao: string): Promise<EstadoDaFarmacia> {
  try {
    const sucesso = await corpo();
    revalidatePath("/patrimonio/farmacias");
    return { sucesso };
  } catch (e) {
    return { erro: mensagemDoErro(e, padrao) };
  }
}

const dados = (f: FormData) => ({
  descricao: t(f, "descricao"),
  endereco: t(f, "endereco"),
  nomeResponsavel: t(f, "nomeResponsavel"),
  cpfResponsavel: t(f, "cpfResponsavel"),
  crfResponsavel: t(f, "crfResponsavel"),
  vigenteDesde: t(f, "vigenteDesde"),
  fundamento: t(f, "fundamento"),
});

export async function cadastrarFarmaciaAction(_p: EstadoDaFarmacia, f: FormData): Promise<EstadoDaFarmacia> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a farmácia funciona sob a unidade gestora." };
    return ato(() => cadastrarFarmaciaPelaTela({ ugId: t(f, "ugId"), codigo: t(f, "codigo"), ...dados(f) }), "Não foi possível cadastrar a farmácia. Nada foi gravado.");
  });
}

export async function publicarVersaoDaFarmaciaAction(_p: EstadoDaFarmacia, f: FormData): Promise<EstadoDaFarmacia> {
  return comComandoDoFormulario(f, async () => {
    if (t(f, "vigenteDesde") === "") return { erro: "Informe desde quando a mudança vale." };
    return ato(() => publicarVersaoDaFarmaciaPelaTela({ farmaciaId: t(f, "farmaciaId"), ativa: t(f, "encerrar") !== "sim", ...dados(f) }), "Não foi possível publicar a versão. Nada foi gravado.");
  });
}

export async function informarEstoqueAction(_p: EstadoDaFarmacia, f: FormData): Promise<EstadoDaFarmacia> {
  return comComandoDoFormulario(f, async () => {
    const mes = t(f, "mes");
    if (!/^\d{4}-\d{2}$/.test(mes)) return { erro: "Informe o mês do estoque." };
    const arquivo = f.get("arquivo");
    const comArquivo = arquivo instanceof File && arquivo.size > 0;
    if (comArquivo && arquivo.size > LIMITE_DO_ARQUIVO) return { erro: "O arquivo passa de 2 MB. Divida a posição ou confira se é o arquivo certo." };
    const base = { farmaciaId: t(f, "farmaciaId"), ano: Number(mes.slice(0, 4)), mes: Number(mes.slice(5, 7)), fundamento: t(f, "fundamento") };
    if (comArquivo) return ato(async () => informarEstoquePelaTela({ ...base, arquivo: await arquivo.text() }), "Não foi possível informar o estoque. Nada foi gravado.");
    const item = { codigoProduto: t(f, "codigoProduto"), descricao: t(f, "descricaoProduto"), unidadeMedida: t(f, "unidadeMedida"), quantidade: t(f, "quantidade") };
    if (item.codigoProduto === "") return { erro: "Escolha o arquivo do estoque ou digite um produto." };
    return ato(() => informarEstoquePelaTela({ ...base, itens: [item] }), "Não foi possível informar o estoque. Nada foi gravado.");
  });
}
