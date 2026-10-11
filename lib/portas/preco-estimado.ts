import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";
import { acoesPermitidas } from "./molde";
import { diaCivilBr, instanteCivilBr } from "../../packages/datas/index";
import { fixarPrecoEstimado, regraVigente } from "../../modules/m11-licitacoes/preco-estimado";

/**
 * V39-R3 (R3-020) — A TELA DO PREÇO ESTIMADO, no detalhe da pesquisa: cada item com os preços (de onde vieram, de que dia,
 * que documento), o preço fixado que vale (método, valor, quem e quando) e o formulário para fixar. Leitura sob
 * CONSULTAR_LICITACOES; fixar cobra REGISTRAR_PESQUISA_DE_PRECOS no serviço.
 */

export const ROTULO_DO_PARAMETRO: Readonly<Record<string, string>> = {
  PAINEL_DE_PRECOS: "Painel de preços ou banco de preços em saúde",
  CONTRATACOES_SIMILARES: "Contratação similar da Administração",
  MIDIA_TABELAS_E_SITIOS: "Mídia especializada, tabela oficial ou sítio eletrônico",
  FORNECEDORES: "Pesquisa direta com fornecedor",
  NOTAS_FISCAIS: "Nota fiscal eletrônica",
};
export const ROTULO_DO_METODO: Readonly<Record<string, string>> = { MEDIA: "média", MEDIANA: "mediana", MENOR: "menor dos valores" };

/** Preço unitário na tela: milhar com ponto, vírgula decimal, ao menos 2 casas e até as 6 guardadas (sem truncar). */
export function precoBr(v: string): string {
  const [int = "0", dec = ""] = v.replace(/^-/, "").split(".");
  const casas = (dec.replace(/0+$/, "") + "00").slice(0, Math.max(2, dec.replace(/0+$/, "").length));
  return `${v.startsWith("-") ? "-" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${casas}`;
}

export interface ItemParaFixar {
  readonly id: string;
  readonly material: string;
  readonly quantidade: string;
  readonly precos: readonly { readonly id: string; readonly fornecedor: string; readonly valor: string; readonly parametro: string | null; readonly dataDoPreco: string | null; readonly documento: string | null }[];
  readonly fixado: { readonly metodo: string; readonly valor: string; readonly precosUsados: number; readonly descartes: number; readonly por: string; readonly em: string; readonly justificativa: string | null } | null;
}

export async function lerPrecosDaPesquisa(pesquisaId: string): Promise<{ readonly itens: readonly ItemParaFixar[]; readonly podeFixar: boolean; readonly minimo: number | null }> {
  await exigirLeituraDoEnte("CONSULTAR_LICITACOES");
  const db = cliente();
  const pesquisa = await db.pesquisaDePrecos.findUnique({ where: { id: pesquisaId }, select: { data: true } });
  const [itens, permitidas, regra] = await Promise.all([
    db.itemDePesquisaDePrecos.findMany({
      where: { pesquisaId },
      orderBy: { criadoEm: "asc" },
      select: {
        id: true, quantidade: true, material: { select: { codigo: true, descricaoSucinta: true } },
        cotacoes: { orderBy: { criadoEm: "asc" }, select: { id: true, valorUnitario: true, parametro: true, dataDoPreco: true, documento: true, fornecedor: { select: { documento: true, versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } } } },
        precosEstimados: { orderBy: [{ criadoEm: "desc" }, { id: "desc" }], take: 1, select: { metodo: true, valorEstimado: true, precosUsados: true, descartes: true, criadoPor: true, criadoEm: true, justificativaMenosPrecos: true } },
      },
    }),
    acoesPermitidas(["REGISTRAR_PESQUISA_DE_PRECOS"]),
    pesquisa === null ? Promise.resolve(null) : regraVigente(db, pesquisa.data).catch(() => null),
  ]);
  return {
    podeFixar: permitidas.has("REGISTRAR_PESQUISA_DE_PRECOS"),
    minimo: regra?.minimoDePrecos ?? null,
    itens: itens.map((i) => {
      const f = i.precosEstimados[0];
      return {
        id: i.id, material: `${i.material.codigo} — ${i.material.descricaoSucinta}`, quantidade: i.quantidade.toString(),
        precos: i.cotacoes.map((c) => ({ id: c.id, fornecedor: c.fornecedor.versoes[0]?.nome ?? "fornecedor sem nome cadastrado", valor: precoBr(c.valorUnitario.toFixed(6)), parametro: c.parametro, dataDoPreco: c.dataDoPreco === null ? null : diaCivilBr(c.dataDoPreco), documento: c.documento })),
        fixado: f === undefined ? null : { metodo: f.metodo, valor: precoBr(f.valorEstimado.toFixed(6)), precosUsados: f.precosUsados, descartes: Array.isArray(f.descartes) ? f.descartes.length : 0, por: f.criadoPor, em: instanteCivilBr(f.criadoEm), justificativa: f.justificativaMenosPrecos },
      };
    }),
  };
}

export async function fixarPrecoPelaTela(input: { readonly itemId: string; readonly metodo: "MEDIA" | "MEDIANA" | "MENOR"; readonly descartes: readonly { readonly cotacaoId: string; readonly motivo: string }[]; readonly justificativaMenosPrecos?: string | undefined }): Promise<string> {
  const r = await comEscritaAutenticada("REGISTRAR_PESQUISA_DE_PRECOS", (criadoPor) => fixarPrecoEstimado(cliente(), { ...input, descartes: [...input.descartes], criadoPor }));
  return `Preço estimado fixado pela ${ROTULO_DO_METODO[input.metodo] ?? input.metodo} de ${String(r.precosUsados)} preço(s): R$ ${precoBr(r.valorEstimado)}.`;
}
