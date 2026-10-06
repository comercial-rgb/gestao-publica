import { describe, expect, it } from "vitest";
import { documentoDoDiario, documentoDoRazao } from "../../lib/pdf/livros";
import type { LancamentoDoDiario, RazaoAnalitico } from "../../lib/portas/livros";

/**
 * V36 — OS LIVROS EM PDF COM TERMOS. Montagem pura.
 *  · Diário N=2: dois lançamentos, totais de débito e crédito somados à mão (1.000,00 + 250,40 = 1.250,40), e o
 *    termo de encerramento com a contagem, o primeiro e o último número;
 *  · cadastro incompleto: o termo diz "não cadastrado" em vez de imprimir um nome inventado ou um campo vazio;
 *  · Razão: saldo anterior, totais e saldo final no termo.
 */
const completo = { cnpj: "08993909000108", nomeContador: "Contadora de Teste", crcContador: "PB-012345/O", nomeOrdenador: "Prefeito de Teste" };
const vazio = { cnpj: null, nomeContador: null, crcContador: null, nomeOrdenador: null };
const lanc = (numero: string, valor: string, dia: string): LancamentoDoDiario =>
  ({
    id: numero,
    numeroControle: numero,
    data: new Date(`${dia}T15:00:00Z`),
    historico: `histórico ${numero}`,
    origemTipo: "TESTE",
    origemId: null,
    estornoDeId: null,
    partidas: [
      { conta: "conta-d", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
      { conta: "conta-c", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
    ],
  }) as unknown as LancamentoDoDiario;

const texto = (doc: { secoes: readonly { titulo?: string; linhas: readonly (readonly string[])[] }[] }, titulo: string, campo: string): string =>
  doc.secoes.find((s) => s.titulo === titulo)?.linhas.find((l) => l[0] === campo)?.[1] ?? "";

describe("livros em PDF com termos de abertura e encerramento", () => {
  it("Diário N=2: lançamentos, totais à mão e o termo de encerramento com contagem e números", () => {
    const doc = documentoDoDiario({
      ente: "Prefeitura de Teste",
      responsaveis: completo,
      desde: "2026-01-01",
      ate: "2026-03-31",
      lancamentos: [lanc("L-1", "1000.00", "2026-01-10"), lanc("L-2", "250.40", "2026-02-20")],
    });
    expect(doc.periodo).toBe("01/01/2026 a 31/03/2026");
    expect(doc.secoes.map((s) => s.titulo)).toEqual(["Termo de abertura", "Lançamentos", "Termo de encerramento"]);
    const linhas = doc.secoes[1]?.linhas ?? [];
    expect(linhas).toHaveLength(5);
    expect(linhas[4]).toEqual(["", "", "Totais do período", "", "1.250,40", "1.250,40"]);
    const enc = texto(doc, "Termo de encerramento", "Texto");
    expect(enc).toMatch(/2 lançamento\(s\), do nº L-1 ao nº L-2/);
    expect(enc).toMatch(/débitos de R\$ 1\.250,40 e créditos de R\$ 1\.250,40, iguais/);
    expect(texto(doc, "Termo de abertura", "CNPJ")).toBe("08.993.909/0001-08");
    expect(texto(doc, "Termo de abertura", "Responsável pela contabilidade")).toBe("Contadora de Teste — CRC PB-012345/O");
  });

  it("cadastro do ente incompleto: os termos dizem o que não está cadastrado", () => {
    const doc = documentoDoDiario({ ente: "Prefeitura de Teste", responsaveis: vazio, desde: "2026-01-01", ate: "2026-01-31", lancamentos: [lanc("L-1", "10.00", "2026-01-10")] });
    expect(texto(doc, "Termo de abertura", "CNPJ")).toMatch(/não cadastrado/);
    expect(texto(doc, "Termo de encerramento", "Responsável pela contabilidade")).toMatch(/Contador não cadastrado/);
    expect(texto(doc, "Termo de encerramento", "Titular / ordenador")).toMatch(/Ordenador não cadastrado/);
  });

  it("Razão: saldo anterior, totais e saldo final no termo de encerramento", () => {
    const razao: RazaoAnalitico = {
      conta: "conta-banco",
      saldoAnterior: "100.00",
      linhas: [
        { lancamentoId: "a", data: new Date("2026-01-10T15:00:00Z"), numeroControle: "L-1", historico: "entrada", debito: "1000.00", credito: "0.00", saldoCorrente: "1100.00" },
        { lancamentoId: "b", data: new Date("2026-02-20T15:00:00Z"), numeroControle: "L-2", historico: "saída", debito: "0.00", credito: "250.40", saldoCorrente: "849.60" },
      ],
      saldoFinal: "849.60",
    };
    const doc = documentoDoRazao({ ente: "Prefeitura de Teste", responsaveis: completo, desde: "2026-01-01", ate: "2026-03-31", razao, contaTitulo: "Bancos" });
    expect(doc.titulo).toBe("Razão — conta conta-banco");
    const mov = doc.secoes.find((s) => s.titulo === "Movimentos")?.linhas ?? [];
    expect(mov[0]).toEqual(["", "", "Saldo anterior", "", "", "100,00"]);
    expect(mov[3]).toEqual(["", "", "Totais e saldo final", "1.000,00", "250,40", "849,60"]);
    expect(texto(doc, "Termo de encerramento", "Texto")).toMatch(/2 movimento\(s\) da conta conta-banco: saldo anterior R\$ 100,00, débitos R\$ 1\.000,00, créditos R\$ 250,40, saldo final R\$ 849,60/);
  });
});
