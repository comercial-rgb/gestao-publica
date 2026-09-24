import { describe, expect, it } from "vitest";
import { totalDeDebitoDoLancamento, type LancamentoDoDiario, type PartidaDoDiario } from "./livros.js";
import { caixaDaLinhaDeDespesa, type LinhaDespesaAnexo6 } from "./rreo-anexo6.js";

/**
 * ═══ O FLOAT NO TOTAL DE UM LIVRO CONTÁBIL E DE UM DEMONSTRATIVO FEDERAL ═══
 *
 * Dois totais de relatório oficial estavam somando dinheiro em ponto flutuante — o invariante
 * nº 1 do `CLAUDE.md` violado na saída, que é onde ninguém procura:
 *
 *   · Livro Diário, total de débito do lançamento:
 *     `reduce((s, p) => s + Number(p.valor), 0).toFixed(2)`
 *   · RREO Anexo 6, o caixa (a)+(b)+(c):
 *     `Number.parseFloat(a) + Number.parseFloat(b) + Number.parseFloat(c)`
 *
 * Nos dois casos o módulo JÁ tinha a conta certa: `totaisPorSubsistema` soma em `BigInt` de
 * centavos (e o comentário dela avisa deste exato defeito), e `caixaDaDespesa` soma em `Decimal`.
 * A tela reimplementou as duas em float, longe o bastante para nenhum teste comparar.
 *
 * ═══ ⚠️ A FIXTURE ÓBVIA NÃO ACUSA, E ISSO PRECISA ESTAR ESCRITO ═══
 *
 * O exemplo clássico `0.1 + 0.2 = 0.30000000000000004` NÃO produz diferença aqui, porque o código
 * defeituoso termina em `.toFixed(2)`, que arredonda o ruído embora. Medido, e afirmado no
 * primeiro caso abaixo. Como a soma exata de valores de 2 casas tem 2 casas, o float só muda o
 * CENTAVO quando o erro acumulado passa de meio centavo — o que exige magnitude na casa de
 * 2,2 × 10¹³. Um teste escrito com `0.1 + 0.2` passaria com o código defeituoso e daria a
 * impressão de cobrir o defeito: é exatamente a forma de teste que este repositório já pagou caro.
 *
 * Por isso a afirmação aqui é de PROPRIEDADE — "a soma é exata em qualquer magnitude" —, e a
 * implementação independente contra a qual ela se mede é o próprio float, calculado no teste.
 */

const partida = (tipo: PartidaDoDiario["tipo"], valor: string): PartidaDoDiario => ({
  conta: "1.1.1.1.1.01.00",
  tipo,
  subsistema: "PATRIMONIAL",
  valor,
});

const lancamentoCom = (...partidas: readonly PartidaDoDiario[]): LancamentoDoDiario => ({
  id: "lanc-1",
  numeroControle: "2026/000001",
  data: new Date(Date.UTC(2026, 2, 15, 12, 0, 0)),
  historico: "Fixture do total sem float",
  origemTipo: "MANUAL",
  origemId: null,
  natureza: "NORMAL",
  estornoDeId: null,
  criadoPor: "contabilidade@cg.pb.gov.br",
  partidas,
});

const linhaCom = (paga: string, rpP: string, rpNP: string): LinhaDespesaAnexo6 => ({
  chave: "DESPESAS_CORRENTES",
  rotulo: "Despesas Correntes",
  nivel: "grupo",
  dotacaoAtualizada: "0.00",
  empenhada: "0.00",
  liquidada: "0.00",
  paga,
  rpProcessadosPagos: rpP,
  rpNaoProcessadosPagos: rpNP,
});

/** A implementação INDEPENDENTE: o float, exatamente como o código defeituoso fazia. */
const somaEmFloat = (valores: readonly string[]): string =>
  valores.reduce((s, v) => s + Number(v), 0).toFixed(2);

describe("o total de relatório oficial não passa por ponto flutuante", () => {
  it("⚠️ a fixture clássica 0,10 + 0,20 NÃO acusa — o `.toFixed(2)` esconde o ruído", () => {
    // Este caso não é decoração: ele é a razão de os casos seguintes existirem com os valores
    // que têm. Se algum dia alguém "simplificar" a fixture para 0.1 + 0.2, este teste continuará
    // verde com o defeito de volta — e esta linha explica por quê.
    expect(somaEmFloat(["0.10", "0.20"])).toBe("0.30");
    expect(caixaDaLinhaDeDespesa(linhaCom("0.10", "0.20", "0.00"))).toBe("0.30");
    expect(totalDeDebitoDoLancamento(lancamentoCom(partida("DEBITO", "0.10"), partida("DEBITO", "0.20")))).toBe("0.30");
  });

  it("no Anexo 6, o caixa (a)+(b)+(c) devolve o centavo EXATO onde o float perde um", () => {
    const a = "8422412220122.26";
    const b = "9376378550411.29";
    const c = "8609580346114.76";

    // O float, medido: 26408371116648.30. O exato: ...31.
    expect(somaEmFloat([a, b, c])).toBe("26408371116648.30");
    expect(caixaDaLinhaDeDespesa(linhaCom(a, b, c))).toBe("26408371116648.31");
    expect(caixaDaLinhaDeDespesa(linhaCom(a, b, c))).not.toBe(somaEmFloat([a, b, c]));
  });

  it("no Diário, o total de débito devolve o centavo EXATO onde o float perde um", () => {
    const vs = ["9973607562065.46", "9732639341997.13", "8518861738893.35"];
    const l = lancamentoCom(...vs.map((v) => partida("DEBITO", v)));

    expect(somaEmFloat(vs)).toBe("28225108642955.95");
    expect(totalDeDebitoDoLancamento(l)).toBe("28225108642955.94");
    expect(totalDeDebitoDoLancamento(l)).not.toBe(somaEmFloat(vs));
  });

  it("o total de débito ignora o CRÉDITO — senão o livro fecharia somando os dois lados", () => {
    const l = lancamentoCom(
      partida("DEBITO", "1000.00"),
      partida("CREDITO", "1000.00"),
      partida("DEBITO", "0.01")
    );
    expect(totalDeDebitoDoLancamento(l)).toBe("1000.01");
  });

  it("valor negativo continua legível — o estorno não vira string quebrada", () => {
    expect(totalDeDebitoDoLancamento(lancamentoCom(partida("DEBITO", "-0.05")))).toBe("-0.05");
    expect(totalDeDebitoDoLancamento(lancamentoCom())).toBe("0.00");
  });

  /**
   * ⚠️ O CONSERTO NÃO PODE MUDAR O NÚMERO QUE O ENTE JÁ PUBLICOU.
   *
   * Nas magnitudes de um município os dois caminhos coincidem — é por isso que o defeito estava
   * LATENTE e não tinha sintoma. Afirmar isso aqui é o que separa "consertei o invariante" de
   * "mudei silenciosamente um demonstrativo assinado".
   */
  it("em magnitude municipal, o valor publicado continua idêntico ao de antes", () => {
    const casos: readonly (readonly [string, string, string])[] = [
      ["1234.56", "7890.12", "0.03"],
      ["0.01", "0.02", "0.00"],
      ["45678901.23", "1234567.89", "9876.54"],
      ["999999.99", "0.01", "0.00"],
    ];
    for (const [a, b, c] of casos) {
      expect(caixaDaLinhaDeDespesa(linhaCom(a, b, c)), `caixa de ${a}+${b}+${c}`).toBe(somaEmFloat([a, b, c]));
      const l = lancamentoCom(partida("DEBITO", a), partida("DEBITO", b), partida("DEBITO", c));
      expect(totalDeDebitoDoLancamento(l), `diário de ${a}+${b}+${c}`).toBe(somaEmFloat([a, b, c]));
    }
  });
});
