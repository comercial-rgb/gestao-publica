import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LAYOUTS_2026V11 } from "./layout-2026v11.js";

/**
 * V25 — TODO LEIAUTE GERADO TEM AS POSIÇÕES DO HTML OFICIAL DO TCE-PB.
 *
 * O leitor do HTML é deste teste, não do gerador: um leiaute escrito à mão conferido contra ele mesmo
 * passaria com qualquer posição errada. A seção é achada pelo nome da entidade ("4.N. Entidade"), e a
 * tabela de campos é comparada campo a campo — nome, início e fim.
 *
 * ⚠️ AS DIFERENÇAS DE NOME declaradas abaixo são as únicas, e nenhuma é de posição: o HTML repete
 * "reservado" duas vezes na Dotação (o código precisa de nomes distintos) e, na MovimentacaoEntreContas,
 * escreve a descrição na coluna do nome.
 */

const HTML = readFileSync(resolve(import.meta.dirname, "../../../../docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-12122025.html"), "utf8");
const limpa = (s: string): string => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

const NOME_NO_HTML: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  Dotacao: { reservado2: "reservado" },
  AtualizacaoOrcamentaria: { reservado2: "reservado" },
  // O HTML escreve o nome do campo com acento.
  TransfRecebida: { dataTransferencia: "dataTransferência" },
  TransfConcedida: { dataTransferencia: "dataTransferência" },
  MovimentacaoEntreContasBancarias: {
    valorTransferencia: "Valor da Transferência",
    dataMovimentacao: "Data da Movimentação",
    codigoMovimentacao: "Código da Movimentação",
  },
};

/**
 * V26 — as linhas que o leitor do HTML não lê porque a posição está escrita errada lá: na NormasOrcamentarias, o
 * "tipo" tem a posição inicial "2/8" (é 28). Saem da comparação NOMEADAS; a posição certa está no leiaute, com o motivo.
 */
const LINHA_ILEGIVEL_NO_HTML: Readonly<Record<string, readonly string[]>> = {
  NormasOrcamentarias: ["tipo 28-28"],
};

function camposDoHtml(entidade: string): string[] | null {
  // V26 — o título pode trazer espaço inseparável antes do fechamento (a ReceitaPrevista traz).
  const m = new RegExp(`<strong>4\\.\\d+\\. ${entidade}[\\s\\u00a0]*</strong>`).exec(HTML);
  if (m === null) return null;
  // V26 — a seção termina no próximo <h4 OU no título da seção seguinte: a §4.18 não tem <h4 antes da §4.19, e o
  // corte só pelo <h4 lia os campos da ReceitaExtra como se fossem dela.
  const fimPorH4 = HTML.indexOf("<h4", m.index + 10);
  const proximoTitulo = /<strong>4\.\d+\.\s/.exec(HTML.slice(m.index + 10));
  const fimPorTitulo = proximoTitulo === null ? -1 : m.index + 10 + proximoTitulo.index;
  const fins = [fimPorH4, fimPorTitulo].filter((x) => x >= 0);
  const bloco = HTML.slice(m.index, fins.length === 0 ? undefined : Math.min(...fins));
  const campos: string[] = [];
  for (const tr of bloco.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const c = [...(tr[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => limpa(x[1] ?? ""));
    if (c.length >= 5 && /^\d+$/.test(c[3] ?? "") && /^\d+$/.test(c[4] ?? "")) campos.push(`${c[0] ?? ""} ${c[3] ?? ""}-${c[4] ?? ""}`);
  }
  return campos;
}

describe("V25 — os leiautes do SAGRES contra o HTML oficial", () => {
  it.each(LAYOUTS_2026V11.map((l) => [l.entidade, l] as const))("%s", (entidade, layout) => {
    const html = camposDoHtml(entidade);
    expect(html, `a seção de ${entidade} existe no HTML`).not.toBeNull();
    const renomeio = NOME_NO_HTML[entidade] ?? {};
    const ilegivel = LINHA_ILEGIVEL_NO_HTML[entidade] ?? [];
    const nosso = layout.campos.map((c) => `${renomeio[c.nome] ?? c.nome} ${String(c.posInicial)}-${String(c.posFinal)}`).filter((x) => !ilegivel.includes(x));
    expect(nosso).toEqual(html);
  });
});
