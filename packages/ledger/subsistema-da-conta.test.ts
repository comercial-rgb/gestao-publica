import { describe, expect, it } from "vitest";
import { subsistemaDaConta, validarLancamento } from "./index.js";
import { toMoney } from "../contracts/index.js";

/**
 * O SUBSISTEMA DA CONTA (V22 rodada 7) — exposto para a tela do lançamento manual não perguntar ao
 * operador o que é consequência do código. A prova de que é a MESMA tabela do motor: uma partida
 * montada com `subsistemaDaConta` passa em `validarLancamento`, e a trocada é recusada.
 */
describe("subsistemaDaConta", () => {
  it("a classe decide: 1 a 4 patrimonial, 5 e 6 orçamentário, 7 e 8 controle", () => {
    expect(["1.1.1.1.1.19.00", "2.1.3.1.1.01.01", "3.3.2.1.1.01.00", "4.1.1.2.1.01.00"].map(subsistemaDaConta)).toEqual(["PATRIMONIAL", "PATRIMONIAL", "PATRIMONIAL", "PATRIMONIAL"]);
    expect(["5.2.2.1.1.01.00", "6.2.2.1.1.00.00"].map(subsistemaDaConta)).toEqual(["ORCAMENTARIO", "ORCAMENTARIO"]);
    expect(["7.2.1.1.1.00.00", "8.2.1.1.1.00.00"].map(subsistemaDaConta)).toEqual(["CONTROLE", "CONTROLE"]);
  });

  it("classe fora do PCASP é recusada nomeando a conta — não se escolhe subsistema no chute", () => {
    expect(() => subsistemaDaConta("9.1.1.1.1.00.00")).toThrow(/A conta 9\.1\.1\.1\.1\.00\.00 não começa por uma classe do PCASP/);
    expect(() => subsistemaDaConta("")).toThrow(/não começa por uma classe do PCASP/);
  });

  it("é a mesma tabela do motor: montada por ela passa; com o subsistema trocado, o motor recusa", () => {
    const partida = (conta: string, tipo: "DEBITO" | "CREDITO", subsistema = subsistemaDaConta(conta)) => ({ conta, tipo, subsistema, valor: toMoney("70.00") });
    expect(() => validarLancamento([partida("1.1.1.1.1.19.00", "DEBITO"), partida("4.1.1.2.1.01.00", "CREDITO")])).not.toThrow();
    expect(() => validarLancamento([partida("1.1.1.1.1.19.00", "DEBITO", "ORCAMENTARIO"), partida("4.1.1.2.1.01.00", "CREDITO", "ORCAMENTARIO")])).toThrow();
  });
});
