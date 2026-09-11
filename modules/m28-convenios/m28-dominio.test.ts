import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { fimDoDiaCivil, instanteCivil } from "../../packages/datas/index.js";
import {
  estadoDoConvenio,
  glosadoLiquido,
  limiteDaPrestacao,
  pendenteDePrestacao,
  saldoALiberar,
  type MovimentoParaSaldo,
} from "./dominio.js";

const d = (v: string) => toMoney(v);

/**
 * ═══ OS TRÊS SALDOS DO CONVÊNIO SÃO INDEPENDENTES ═══
 *
 * ⚠️ FIXTURE N=2 EM TUDO QUE SÓ SE MANIFESTA EM CONJUNTO. Com UMA parcela, "o saldo a liberar
 * e o pendente de prestação são a mesma coisa" passa — as duas contas dão o mesmo número. É
 * com DUAS, e com a prestação aprovada de só uma delas, que elas divergem.
 */
describe("M28 — os três saldos do convênio", () => {
  const termo = d("100000.00");

  it("t1: liberar consome o saldo A LIBERAR e ABRE pendência de prestação", () => {
    const m: MovimentoParaSaldo[] = [
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") },
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("30000.00") },
    ];
    expect(saldoALiberar(termo, m).toFixed(2)).toBe("30000.00");
    expect(pendenteDePrestacao(m).toFixed(2)).toBe("70000.00");
  });

  it("t2: aprovar a prestação BAIXA a pendência e NÃO devolve saldo a liberar", () => {
    // ⚠️ ESTE É O CASO QUE DISTINGUE AS DUAS CONTAS. Uma implementação que tratasse os dois
    // saldos como um só devolveria 70.000 ao "a liberar" — e o sistema autorizaria repassar
    // de novo dinheiro que já saiu.
    const m: MovimentoParaSaldo[] = [
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") },
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("30000.00") },
      { tipo: "PRESTACAO_APROVADA", valor: d("40000.00") },
    ];
    expect(saldoALiberar(termo, m).toFixed(2)).toBe("30000.00");
    expect(pendenteDePrestacao(m).toFixed(2)).toBe("30000.00");
  });

  it("t3: a GLOSA não mexe em nenhum dos dois — ela declara o que é devido de volta", () => {
    const m: MovimentoParaSaldo[] = [
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") },
      { tipo: "PRESTACAO_APROVADA", valor: d("40000.00") },
      { tipo: "GLOSA", valor: d("5000.00") },
    ];
    expect(saldoALiberar(termo, m).toFixed(2)).toBe("60000.00");
    expect(pendenteDePrestacao(m).toFixed(2)).toBe("0.00");
    expect(glosadoLiquido(m).toFixed(2)).toBe("5000.00");
  });

  it("t4: a DEVOLUÇÃO devolve saldo a liberar E baixa o glosado", () => {
    const m: MovimentoParaSaldo[] = [
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") },
      { tipo: "PRESTACAO_APROVADA", valor: d("40000.00") },
      { tipo: "GLOSA", valor: d("5000.00") },
      { tipo: "DEVOLUCAO", valor: d("5000.00") },
    ];
    expect(saldoALiberar(termo, m).toFixed(2)).toBe("65000.00");
    expect(glosadoLiquido(m).toFixed(2)).toBe("0.00");
  });

  it("t5: o estorno da liberação desfaz as DUAS contas de uma vez", () => {
    const m: MovimentoParaSaldo[] = [
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") },
      { tipo: "LIBERACAO_DE_PARCELA", valor: d("30000.00") },
      { tipo: "ESTORNO_LIBERACAO_DE_PARCELA", valor: d("30000.00") },
    ];
    expect(saldoALiberar(termo, m).toFixed(2)).toBe("60000.00");
    expect(pendenteDePrestacao(m).toFixed(2)).toBe("40000.00");
  });
});

describe("M28 — o estado do convênio é derivado, e o prazo é civil", () => {
  const termo = d("100000.00");
  const vigenciaFim = fimDoDiaCivil("2026-06-30");

  it("t6: sem movimento nenhum, ele está A INICIAR", () => {
    expect(
      estadoDoConvenio({
        valorRepasse: termo,
        vigenciaFim,
        diasParaPrestacaoDeContas: 60,
        movimentos: [],
        hoje: instanteCivil(2026, 3, 1, 12),
      })
    ).toBe("A_INICIAR");
  });

  it("t7: com saldo a liberar e prazo em aberto, EM EXECUÇÃO", () => {
    expect(
      estadoDoConvenio({
        valorRepasse: termo,
        vigenciaFim,
        diasParaPrestacaoDeContas: 60,
        movimentos: [{ tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") }],
        hoje: instanteCivil(2026, 5, 1, 12),
      })
    ).toBe("EM_EXECUCAO");
  });

  it("t8: prestação VENCIDA tem precedência sobre 'em execução'", () => {
    // ⚠️ A ORDEM DAS PERGUNTAS É O TESTE. Há saldo a liberar (60.000) E o prazo venceu. Um
    // estado que respondesse "em execução" esconderia do gestor exatamente o que ele precisa
    // ver ANTES de liberar a próxima parcela.
    expect(
      estadoDoConvenio({
        valorRepasse: termo,
        vigenciaFim,
        diasParaPrestacaoDeContas: 60,
        movimentos: [{ tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") }],
        hoje: instanteCivil(2026, 9, 1, 12),
      })
    ).toBe("PRESTACAO_VENCIDA");
  });

  it("t9: o prazo é em DIAS CIVIS, e a resposta não depende da hora do dia", () => {
    // 30/06 + 60 dias = 29/08. No dia 29 ainda não venceu; no dia 30, venceu.
    expect(limiteDaPrestacao(vigenciaFim, 60)).toBe("29/08/2026");
    for (const hora of [0, 9, 22, 23]) {
      expect(
        estadoDoConvenio({
          valorRepasse: termo,
          vigenciaFim,
          diasParaPrestacaoDeContas: 60,
          movimentos: [{ tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") }],
          hoje: instanteCivil(2026, 8, 29, hora, 30),
        }),
        `às ${hora}h do dia 29`
      ).toBe("EM_EXECUCAO");
    }
    expect(
      estadoDoConvenio({
        valorRepasse: termo,
        vigenciaFim,
        diasParaPrestacaoDeContas: 60,
        movimentos: [{ tipo: "LIBERACAO_DE_PARCELA", valor: d("40000.00") }],
        hoje: instanteCivil(2026, 8, 30, 0, 30),
      })
    ).toBe("PRESTACAO_VENCIDA");
  });

  it("t10: tudo liberado e tudo prestado = CONCLUÍDO", () => {
    expect(
      estadoDoConvenio({
        valorRepasse: termo,
        vigenciaFim,
        diasParaPrestacaoDeContas: 60,
        movimentos: [
          { tipo: "LIBERACAO_DE_PARCELA", valor: termo },
          { tipo: "PRESTACAO_APROVADA", valor: termo },
        ],
        hoje: instanteCivil(2026, 12, 1, 12),
      })
    ).toBe("CONCLUIDO");
  });
});
