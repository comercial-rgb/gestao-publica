import { describe, expect, it } from "vitest";
import { totaisPorSubsistema, type LancamentoDoDiario, type PartidaDoDiario } from "./livros.js";

/**
 * OS TOTAIS DE UMA CONTA FILTRADA.
 *
 * O filtro por conta do Diário devolve o lançamento inteiro. A tela somava tudo, e cada
 * lançamento fecha por subsistema — a diferença dava zero sempre, qualquer que fosse a conta.
 * Fixture N=2: dois lançamentos tocam a conta do caixa, um a débito e outro a crédito, com
 * contrapartidas diferentes; a soma da conta tem de ser o movimento DELA, não o dos lançamentos.
 */
// Rótulos opacos: a função soma por igualdade de código, não lê o plano.
const CAIXA = "conta-caixa";

const p = (conta: string, tipo: PartidaDoDiario["tipo"], valor: string, subsistema: PartidaDoDiario["subsistema"] = "PATRIMONIAL"): PartidaDoDiario => ({
  conta,
  tipo,
  subsistema,
  valor,
});

let seq = 0;
const lancamento = (...partidas: readonly PartidaDoDiario[]): LancamentoDoDiario => {
  seq += 1;
  return {
    id: `l${seq}`,
    numeroControle: String(seq),
    data: new Date("2026-03-10T15:00:00Z"),
    historico: "teste",
    origemTipo: "TESTE",
    origemId: null,
    estornoDeId: null,
    partidas,
  } as unknown as LancamentoDoDiario;
};

const recorte = [
  // arrecadação: D caixa 1.000,00 / C VPA
  lancamento(p(CAIXA, "DEBITO", "1000.00"), p("conta-vpa", "CREDITO", "1000.00")),
  // pagamento: D fornecedor / C caixa 250,40 — e um controle no mesmo lançamento
  lancamento(
    p("conta-fornecedor", "DEBITO", "250.40"),
    p(CAIXA, "CREDITO", "250.40"),
    p("conta-controle-d", "DEBITO", "250.40", "CONTROLE"),
    p("conta-controle-c", "CREDITO", "250.40", "CONTROLE")
  ),
];

describe("totais por subsistema com filtro de conta", () => {
  it("sem conta: o recorte inteiro fecha por subsistema (diferença zero)", () => {
    const t = totaisPorSubsistema(recorte);
    expect(t).toEqual([
      { subsistema: "CONTROLE", debito: "250.40", credito: "250.40", diferenca: "0.00" },
      { subsistema: "PATRIMONIAL", debito: "1250.40", credito: "1250.40", diferenca: "0.00" },
    ]);
  });

  it("com conta: só as partidas dela — débito 1.000,00, crédito 250,40, movimento 749,60", () => {
    const t = totaisPorSubsistema(recorte, CAIXA);
    expect(t).toEqual([{ subsistema: "PATRIMONIAL", debito: "1000.00", credito: "250.40", diferenca: "749.60" }]);
  });

  it("conta sem partida no recorte: nenhum total (não um zero inventado)", () => {
    expect(totaisPorSubsistema(recorte, "conta-sem-movimento")).toEqual([]);
  });
});
