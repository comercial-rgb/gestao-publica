import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { pernasDoPagamento } from "./manad/gerador.js";

/**
 * O PAGAMENTO COM RETENÇÃO NO L150 (V22) — um registro por perna patrimonial. As partidas são
 * escritas à mão como o razão as grava (D fornecedor bruto; C banco líquido; C consignação
 * retido), e os esperados também — nada aqui é produzido pelo gerador para conferir o gerador.
 */
const FORNECEDOR = "2.1.3.1.1.01.00";
const BANCO = "1.1.1.1.1.19.00";
const CONSIGNACAO = "2.1.8.8.1.02.00";
const ORCAMENTARIA = "6.2.2.1.3.03.00";

const perna = (tipo: "DEBITO" | "CREDITO", conta: string, valor: string, subsistema = "PATRIMONIAL") => ({
  tipo,
  subsistema,
  valor: toMoney(valor),
  conta: { codigo: conta },
});

const plano = (r: readonly { debito: string; credito: string; valor: { toFixed(n: number): string } }[]) =>
  r.map((x) => [x.debito, x.credito, x.valor.toFixed(2)]);

describe("MANAD L150 — pagamento com retenção", () => {
  it("sem retenção: um registro só, com o valor do pagamento (o comportamento de antes)", () => {
    const r = pernasDoPagamento("p1", toMoney("1000.00"), [
      perna("DEBITO", FORNECEDOR, "1000.00"),
      perna("CREDITO", BANCO, "1000.00"),
      perna("DEBITO", ORCAMENTARIA, "1000.00", "ORCAMENTARIO"),
    ]);
    expect(plano(r)).toEqual([["213110100", "111111900", "1000.00"]]);
  });

  it("com retenção (N=2 créditos): um registro por conta credora, e a soma é o pagamento", () => {
    const r = pernasDoPagamento("p2", toMoney("1000.00"), [
      perna("DEBITO", FORNECEDOR, "1000.00"),
      perna("CREDITO", BANCO, "850.00"),
      perna("CREDITO", CONSIGNACAO, "150.00"),
      perna("CREDITO", ORCAMENTARIA, "1000.00", "ORCAMENTARIO"),
    ]);
    expect(plano(r)).toEqual([
      ["213110100", "111111900", "850.00"],
      ["213110100", "218810200", "150.00"],
    ]);
  });

  it("o estorno é o espelho: um registro por conta devedora", () => {
    const r = pernasDoPagamento("p3", toMoney("1000.00"), [
      perna("CREDITO", FORNECEDOR, "1000.00"),
      perna("DEBITO", BANCO, "850.00"),
      perna("DEBITO", CONSIGNACAO, "150.00"),
    ]);
    expect(plano(r)).toEqual([
      ["111111900", "213110100", "850.00"],
      ["218810200", "213110100", "150.00"],
    ]);
  });

  it("NEGATIVO: pernas que não somam o pagamento são recusadas, nomeando os dois valores", () => {
    expect(() =>
      pernasDoPagamento("p4", toMoney("1000.00"), [
        perna("DEBITO", FORNECEDOR, "1000.00"),
        perna("CREDITO", BANCO, "800.00"),
        perna("CREDITO", CONSIGNACAO, "150.00"),
      ])
    ).toThrow(/pagamento p4 tem pernas patrimoniais que somam 950\.00, e o valor do pagamento é 1000\.00/);
  });

  it("NEGATIVO: mais de uma conta dos DOIS lados continua recusado — não há pareamento sem inventar", () => {
    expect(() =>
      pernasDoPagamento("p5", toMoney("1000.00"), [
        perna("DEBITO", FORNECEDOR, "600.00"),
        perna("DEBITO", "2.1.3.1.1.02.00", "400.00"),
        perna("CREDITO", BANCO, "850.00"),
        perna("CREDITO", CONSIGNACAO, "150.00"),
      ])
    ).toThrow(/pagamento p5 tem 2 conta\(s\) PATRIMONIAIS a DÉBITO/);
  });
});
