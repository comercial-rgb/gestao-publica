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
const dispendio = (id: string, valor: string, estornado: string, vivo: string, fonte: string | null) => ({
  id, data: new Date("2026-07-12T15:00:00Z"), tipoCodigo: "INSS", consignatario: "INSS", fonteCodigo: fonte, contaBancaria: "CC-1",
  historico: "recolhimento", lancamentoId: "l", valor, estornado, vivo,
});
const comExtra: PagamentosEfetuadosDaTela["extra"] = {
  disponivel: true,
  linhas: [dispendio("d1", "200.00", "0.00", "200.00", "500"), dispendio("d2", "50.00", "50.00", "0.00", null)],
  total: "200.00",
};
const dados = (agrupado: boolean, extra: PagamentosEfetuadosDaTela["extra"] = comExtra): PagamentosEfetuadosDaTela => ({
  extra,
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
    expect(d.secoes).toHaveLength(2);
    expect(d.secoes[0]?.linhas.at(-1)).toEqual(["", "", "", "", "Total", "", "", "1.300,00", "40,00", "1.260,00"]);
    const sem = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro("", false), dados: dados(false) });
    expect(sem.secoes[0]?.colunas.map((c) => c.rotulo)).not.toContain("Retido");
  });
  it("agrupado: uma seção por grupo com o subtotal, e o total geral", () => {
    const d = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro("conta"), dados: dados(true) });
    expect(d.secoes.map((s) => s.titulo)).toEqual(["conta CC-1", "conta CC-2", "Total geral", "Dispêndios extraorçamentários"]);
    expect(d.secoes[0]?.linhas.at(-1)?.slice(7)).toEqual(["1.000,00", "40,00", "960,00"]);
    expect(d.secoes[2]?.linhas).toEqual([["", "", "", "", "Total", "", "", "1.300,00", "40,00", "1.260,00"]]);
    expect(d.filtros).toEqual(["Agrupado por conta bancária"]);
  });
  it("os dispêndios extraorçamentários: seção própria com o estornado e o total, fora do total dos pagamentos; sem acesso, o motivo", () => {
    const d = documentoDosPagamentosEfetuados({ ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro(""), dados: dados(false) });
    const extra = d.secoes.at(-1);
    expect(extra?.titulo).toBe("Dispêndios extraorçamentários");
    expect(extra?.linhas).toEqual([
      ["12/07/2026", "INSS", "INSS", "500", "CC-1", "200,00", "0,00", "200,00"],
      ["12/07/2026", "INSS", "INSS", "não declarada", "CC-1", "50,00", "50,00", "0,00"],
      ["", "", "Total", "", "", "", "", "200,00"],
    ]);
    // O total dos pagamentos não absorveu o extra.
    expect(d.secoes[0]?.linhas.at(-1)?.[7]).toBe("1.300,00");
    const sem = documentoDosPagamentosEfetuados({
      ente: "E", periodoDoRecorte: "Exercício 2026", filtro: filtro(""),
      dados: dados(false, { disponivel: false, motivo: "Os dispêndios extraorçamentários pedem a consulta do financeiro." }),
    });
    expect(sem.secoes.at(-1)?.linhas).toEqual([["Os dispêndios extraorçamentários pedem a consulta do financeiro."]]);
  });
});
