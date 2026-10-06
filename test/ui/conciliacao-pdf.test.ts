import { describe, expect, it } from "vitest";
import { documentoDaConciliacao } from "../../lib/pdf/conciliacao";
import type { ConciliacaoDoPeriodo } from "../../lib/portas/tesouraria";

/**
 * V36 — O PDF DA CONCILIAÇÃO DO PERÍODO. N=2 de cada lado: uma linha justificada e outra não (a justificativa tem de
 * ir na linha certa, e a do lado do sistema é chaveada pelo tipo do registro, como na tela); as seções de herdadas
 * e declaradas só aparecem quando há o que mostrar.
 */
const d = (dia: string): Date => new Date(`${dia}T15:00:00Z`);
const base = (x: Partial<ConciliacaoDoPeriodo> = {}): ConciliacaoDoPeriodo =>
  ({
    id: "c1",
    contaBancariaId: "cb",
    periodoInicio: d("2026-03-01"),
    periodoFim: d("2026-03-31"),
    rotulo: "março/2026",
    estado: "ABERTA",
    encerradaPor: null,
    encerradaEm: null,
    relatorio: {
      relatorio: "CONCILIAÇÃO BANCÁRIA",
      contaBancaria: { id: "cb", codigo: "CC-1", contaContabil: "conta-banco" },
      corte: d("2026-03-31"),
      saldoExtrato: "1000.00",
      saldoContabil: "850.00",
      diferenca: "150.00",
      noExtratoSemVinculo: [
        { id: "x1", data: d("2026-03-10"), descricao: "Tarifa", residual: "-50.00" },
        { id: "x2", data: d("2026-03-20"), descricao: "Crédito sem registro", residual: "250.00" },
      ],
      internoSemVinculo: [
        { id: "i1", data: d("2026-03-12"), descricao: "Pagamento NP-9", residual: "30.00", tipoInterno: "PAGAMENTO" },
        { id: "i2", data: d("2026-03-25"), descricao: "Arrecadação 77", residual: "20.00", tipoInterno: "ARRECADACAO" },
      ],
      arrecadacoesSemConta: [],
      lancamentosSemContaBancaria: [],
      conhecimento: d("2026-04-01"),
    },
    herdadasDaAnterior: [],
    pendenciasManuais: [],
    justificativas: [
      { lado: "EXTRATO", referencia: "x1", motivo: "tarifa do mês, registro no próximo período" },
      { lado: "PAGAMENTO", referencia: "i1", motivo: "cheque não compensado" },
    ],
    ...x,
  }) as unknown as ConciliacaoDoPeriodo;

const secao = (doc: ReturnType<typeof documentoDaConciliacao>, titulo: string) => doc.secoes.find((s) => s.titulo === titulo);

describe("PDF da conciliação do período", () => {
  it("saldos, diferença e as pendências dos dois lados com a justificativa na linha certa", () => {
    const doc = documentoDaConciliacao({ ente: "E", conciliacao: base() });
    expect(doc.subtitulo).toBe("Conta CC-1 · março/2026");
    expect(secao(doc, "Saldos no corte")?.linhas).toEqual([
      ["Saldo do extrato bancário", "1.000,00"],
      ["Saldo contábil (conta conta-banco)", "850,00"],
      ["Diferença a explicar", "150,00"],
    ]);
    expect(secao(doc, "No extrato e não no sistema")?.linhas.map((l) => [l[1], l[3]])).toEqual([
      ["Tarifa", "tarifa do mês, registro no próximo período"],
      ["Crédito sem registro", "—"],
    ]);
    expect(secao(doc, "No sistema e não no extrato")?.linhas.map((l) => [l[1], l[3]])).toEqual([
      ["[PAGAMENTO] Pagamento NP-9", "cheque não compensado"],
      ["[ARRECADACAO] Arrecadação 77", "—"],
    ]);
    expect(doc.secoes.map((s) => s.titulo)).toEqual(["Saldos no corte", "No extrato e não no sistema", "No sistema e não no extrato"]);
    expect(doc.notas?.[0]).toMatch(/em aberto/);
  });

  it("encerrada, com herdadas e declaradas: as duas seções aparecem e a nota diz quem encerrou", () => {
    const doc = documentoDaConciliacao({
      ente: "E",
      conciliacao: base({
        estado: "ENCERRADA",
        encerradaPor: "tesouraria@ente",
        encerradaEm: d("2026-04-02"),
        herdadasDaAnterior: [{ lado: "EXTRATO", referencia: "h1", descricao: "Depósito de fevereiro", residual: "10.00", justificativa: null }],
        pendenciasManuais: [{ id: "m1", descricao: "Bloqueio judicial", motivo: "aguardando ofício", valor: "5.00", natureza: "DEBITO", resolvida: false }],
      }),
    });
    expect(secao(doc, "Pendências herdadas do período anterior")?.linhas).toEqual([["EXTRATO", "Depósito de fevereiro", "10,00", "—"]]);
    expect(secao(doc, "Pendências declaradas")?.linhas).toEqual([["Bloqueio judicial", "débito", "5,00", "aguardando ofício", "aberta"]]);
    expect(doc.notas?.[0]).toBe("Período encerrado por tesouraria@ente em 02/04/2026; o que ficou aberto passou ao período seguinte.");
  });
});
