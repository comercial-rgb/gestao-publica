import { describe, expect, it } from "vitest";
import { documentoDosPagamentosEfetuados } from "../../lib/pdf/pagamentos-efetuados";
import type { FiltroDosPagamentos, PagamentoEfetuadoDaTela, PagamentosEfetuadosDaTela } from "../../lib/portas/pagamentos-efetuados";

/** V36 — o PDF dos pagamentos efetuados: sem grupo, uma seção com o total; agrupado, uma seção por grupo e o total geral. */
const linha = (numero: string, conta: string, pago: string, retido: string, liquido: string): PagamentoEfetuadoDaTela => ({
  id: numero, numero, data: new Date("2026-07-10T15:00:00Z"), origem: "EXERCICIO", exercicioDaDotacao: 2026, empenhoId: "e", empenhoNumero: "NE-1",
  liquidacaoNumero: "1", credorCpfCnpj: "12345678000195", credorNome: "Fornecedor", fonteCodigo: "500", contaBancaria: conta,
  pagoVivo: pago, retido, liquido, anulado: false,
});
const a = linha("P-1", "CC-1", "1000.00", "40.00", "960.00");
const b = linha("P-2", "CC-2", "300.00", "0.00", "300.00");
const dados = (agrupado: boolean): PagamentosEfetuadosDaTela => ({
  linhas: [a, b],
  grupos: agrupado
    ? [
        { chave: "CC-1", rotulo: "conta CC-1", linhas: [a], totais: { pagoVivo: "1000.00", retido: "40.00", liquido: "960.00" } },
        { chave: "CC-2", rotulo: "conta CC-2", linhas: [b], totais: { pagoVivo: "300.00", retido: "0.00", liquido: "300.00" } },
      ]
    : [],
  totais: { pagoVivo: "1300.00", retido: "40.00", liquido: "1260.00" },
  opcoes: { credores: [], fontes: [], contas: [] },
});
const filtro = (agrupar: FiltroDosPagamentos["agrupar"], comRetencoes = true): FiltroDosPagamentos => ({ desde: "2026-01-01", ate: "2026-12-31", credor: "", fonte: "", conta: "", agrupar, comRetencoes });

describe("PDF dos pagamentos efetuados", () => {
  it("sem grupo: uma seção, com a linha de total; sem retenções, as colunas somem", () => {
    const d = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro(""), dados: dados(false) });
    expect(d.secoes).toHaveLength(1);
    expect(d.secoes[0]?.linhas.at(-1)).toEqual(["", "", "", "", "Total", "", "", "1.300,00", "40,00", "1.260,00"]);
    const sem = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro("", false), dados: dados(false) });
    expect(sem.secoes[0]?.colunas.map((c) => c.rotulo)).not.toContain("Retido");
  });
  it("agrupado: uma seção por grupo com o subtotal, e o total geral", () => {
    const d = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro("conta"), dados: dados(true) });
    expect(d.secoes.map((s) => s.titulo)).toEqual(["conta CC-1", "conta CC-2", "Total geral"]);
    expect(d.secoes[0]?.linhas.at(-1)?.slice(7)).toEqual(["1.000,00", "40,00", "960,00"]);
    expect(d.secoes[2]?.linhas).toEqual([["", "", "", "", "Total", "", "", "1.300,00", "40,00", "1.260,00"]]);
    expect(d.filtros).toEqual(["Agrupado por conta bancária"]);
  });
});
