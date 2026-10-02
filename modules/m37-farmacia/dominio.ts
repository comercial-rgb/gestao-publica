/**
 * V27 — M37 FARMÁCIA PÚBLICA, o domínio puro: o arquivo do estoque do mês (SAGRES §4.57) lido e conferido linha a
 * linha. Nada aqui toca o banco.
 *
 * Formato aceito (texto, separado por ponto e vírgula, com cabeçalho na primeira linha):
 *   codigoProduto;descricao;unidade;quantidade
 * - codigoProduto: até 14 dígitos (de preferência o GTIN);
 * - descricao: até 60 caracteres;
 * - unidade: a unidade de dispensação, até 10 caracteres;
 * - quantidade: zero ou positiva, com até 2 casas (vírgula ou ponto).
 */

export interface ItemDeEstoque {
  readonly codigoProduto: string;
  readonly descricao: string;
  readonly unidadeMedida: string;
  readonly quantidade: string;
}

export interface LeituraDoEstoque {
  readonly itens: readonly ItemDeEstoque[];
  readonly erros: readonly string[];
}

const CABECALHO = ["codigoproduto", "descricao", "unidade", "quantidade"];

/** Confere um item (do arquivo ou da tela). Devolve o motivo da recusa, ou nulo. */
export function motivoDoItemInvalido(i: { readonly codigoProduto: string; readonly descricao: string; readonly unidadeMedida: string; readonly quantidade: string }): string | null {
  if (!/^\d{1,14}$/.test(i.codigoProduto)) return `código do produto "${i.codigoProduto}" deve ter de 1 a 14 dígitos`;
  if (i.descricao.length < 2 || i.descricao.length > 60) return "a descrição deve ter de 2 a 60 caracteres";
  if (i.unidadeMedida.length < 1 || i.unidadeMedida.length > 10) return "a unidade deve ter de 1 a 10 caracteres";
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(i.quantidade)) return `quantidade "${i.quantidade}" deve ser zero ou positiva, com até 2 casas`;
  return null;
}

export function lerInformeDeEstoque(conteudo: string): LeituraDoEstoque {
  const linhas = conteudo.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim());
  const erros: string[] = [];
  const itens: ItemDeEstoque[] = [];
  const cab = (linhas[0] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(";").map((c) => c.trim());
  if (cab.join(";") !== CABECALHO.join(";")) {
    return { itens: [], erros: [`A primeira linha deve ser o cabeçalho "codigoProduto;descricao;unidade;quantidade".`] };
  }
  const vistos = new Map<string, number>();
  linhas.slice(1).forEach((l, k) => {
    const n = k + 2;
    if (l === "") return;
    const c = l.split(";").map((x) => x.trim());
    if (c.length !== 4) {
      erros.push(`Linha ${String(n)}: são 4 colunas separadas por ponto e vírgula.`);
      return;
    }
    // "1.234,50" (milhar com ponto e decimal com vírgula) ou "1234.50": vira "1234.50".
    const bruta = c[3] ?? "";
    const quantidade = bruta.includes(",") ? bruta.replace(/\./g, "").replace(",", ".") : bruta;
    const item = { codigoProduto: c[0] ?? "", descricao: c[1] ?? "", unidadeMedida: c[2] ?? "", quantidade };
    const motivo = motivoDoItemInvalido(item);
    if (motivo !== null) {
      erros.push(`Linha ${String(n)}: ${motivo}.`);
      return;
    }
    const antes = vistos.get(item.codigoProduto);
    if (antes !== undefined) {
      erros.push(`Linha ${String(n)}: o produto ${item.codigoProduto} já está na linha ${String(antes)}.`);
      return;
    }
    vistos.set(item.codigoProduto, n);
    itens.push(item);
  });
  if (erros.length === 0 && itens.length === 0) erros.push("O arquivo não tem nenhum produto.");
  return { itens, erros };
}
