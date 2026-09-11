import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { instanteCivil } from "../../packages/datas/index.js";
import {
  ordenarFilaDePrecatorios,
  quebraDeOrdemAoPagar,
  saldoDoPrecatorio,
  textoDaQuebra,
  type PrecatorioNaFila,
} from "./dominio.js";

/**
 * ═══ A FILA DO ART. 100 — E ELA SÓ SE MANIFESTA EM CONJUNTO ═══
 *
 * ⚠️ TODA FIXTURE AQUI TEM N ≥ 2, e a regra não é estética. "Este precatório pode ser pago?"
 * com UM precatório na base passa por VACUIDADE: não há ninguém à frente, e qualquer
 * implementação — inclusive uma que ignore a natureza e a preferência — responde "pode".
 * Foi assim que o guard da ordem cronológica do art. 141 só falhou porque o teste tinha DUAS
 * liquidações.
 */

const dinheiro = (v: string) => toMoney(v);

function prec(
  id: string,
  natureza: "ALIMENTAR" | "COMUM",
  preferencia: "NENHUMA" | "IDOSO" | "DOENCA_GRAVE" | "DEFICIENCIA",
  dia: [number, number, number],
  saldo = "1000.00"
): PrecatorioNaFila {
  return {
    id,
    numeroProcesso: id,
    natureza,
    preferencia,
    dataApresentacao: instanteCivil(dia[0], dia[1], dia[2], 12),
    saldoDevido: dinheiro(saldo),
  };
}

describe("M29 — a fila do art. 100", () => {
  it("t1: ALIMENTAR vem antes de COMUM, mesmo apresentado DEPOIS", () => {
    // ⚠️ O COMUM É O MAIS ANTIGO. Uma ordenação só por data o poria na frente, e o teste
    // passaria — é por isso que a fixture inverte as datas de propósito.
    const fila = ordenarFilaDePrecatorios([
      prec("C-antigo", "COMUM", "NENHUMA", [2024, 1, 10]),
      prec("A-novo", "ALIMENTAR", "NENHUMA", [2026, 8, 30]),
    ]);
    expect(fila.map((p) => p.id)).toEqual(["A-novo", "C-antigo"]);
  });

  it("t2: a preferência do §2º ordena DENTRO dos alimentares", () => {
    const fila = ordenarFilaDePrecatorios([
      prec("A-comum", "ALIMENTAR", "NENHUMA", [2024, 1, 10]),
      prec("A-idoso", "ALIMENTAR", "IDOSO", [2026, 8, 30]),
    ]);
    expect(fila.map((p) => p.id)).toEqual(["A-idoso", "A-comum"]);
  });

  it("t3: a preferência NÃO tira um COMUM da frente de um ALIMENTAR", () => {
    // ⚠️ ESTE É O CASO QUE UMA IMPLEMENTAÇÃO PLAUSÍVEL ERRA. Somar natureza e preferência num
    // peso só faria um comum-idoso (0+0) passar à frente de um alimentar-sem-preferência
    // (0+1) — e a inversão seria invisível, porque a fila continuaria "ordenada".
    const fila = ordenarFilaDePrecatorios([
      prec("A-sem-pref", "ALIMENTAR", "NENHUMA", [2026, 8, 30]),
      prec("C-idoso", "COMUM", "IDOSO", [2020, 1, 1]),
    ]);
    expect(fila.map((p) => p.id)).toEqual(["A-sem-pref", "C-idoso"]);
  });

  it("t4: apresentados no MESMO DIA empatam, e o número do processo desempata", () => {
    // ⚠️ É O EMPATE QUE FAZ O DESEMPATE RODAR. Comparar instantes ordenaria pela hora do
    // protocolo — que não é critério de lei nenhuma — e o desempate pelo número NUNCA
    // rodaria. Foi exatamente o defeito que o eixo de data civil achou no art. 141.
    const manha: PrecatorioNaFila = {
      ...prec("0009-B", "COMUM", "NENHUMA", [2026, 3, 10]),
      dataApresentacao: instanteCivil(2026, 3, 10, 9, 0),
    };
    const noite: PrecatorioNaFila = {
      ...prec("0002-A", "COMUM", "NENHUMA", [2026, 3, 10]),
      dataApresentacao: instanteCivil(2026, 3, 10, 22, 30),
    };
    const fila = ordenarFilaDePrecatorios([manha, noite]);
    expect(fila.map((p) => p.id)).toEqual(["0002-A", "0009-B"]);
  });

  it("t5: a ordem é ESTÁVEL — duas leituras da mesma base dão a mesma fila", () => {
    const base = [
      prec("C-1", "COMUM", "NENHUMA", [2025, 5, 5]),
      prec("A-2", "ALIMENTAR", "IDOSO", [2025, 5, 5]),
      prec("A-1", "ALIMENTAR", "NENHUMA", [2025, 5, 5]),
      prec("C-2", "COMUM", "NENHUMA", [2025, 5, 5]),
    ];
    const primeira = ordenarFilaDePrecatorios(base).map((p) => p.id);
    const segunda = ordenarFilaDePrecatorios([...base].reverse()).map((p) => p.id);
    expect(segunda).toEqual(primeira);
    expect(primeira).toEqual(["A-2", "A-1", "C-1", "C-2"]);
  });

  it("t6: pagar o SEGUNDO da fila é quebra, e a recusa NOMEIA quem ficou para trás", () => {
    const fila = [
      prec("A-1", "ALIMENTAR", "NENHUMA", [2024, 1, 10]),
      prec("C-1", "COMUM", "NENHUMA", [2023, 1, 10]),
    ];
    const quebra = quebraDeOrdemAoPagar(fila, "C-1");
    expect(quebra).not.toBeNull();
    expect(quebra!.posicao).toBe(2);
    expect(quebra!.naFrente.map((p) => p.numeroProcesso)).toEqual(["A-1"]);

    // ⚠️ TESTE DE NEGAÇÃO QUE AFIRMA O MOTIVO. "Não deixou pagar" é compatível com qualquer
    // recusa — inclusive a por banco fora do ar. O que se prende aqui é o que a mensagem DIZ.
    const texto = textoDaQuebra(quebra!);
    expect(texto).toContain("ART. 100");
    expect(texto).toContain("A-1");
    expect(texto).toContain("alimentar antes de comum");
    expect(texto).toContain("Nada foi gravado");
  });

  it("t7: pagar o PRIMEIRO da fila não é quebra", () => {
    const fila = [
      prec("A-1", "ALIMENTAR", "NENHUMA", [2024, 1, 10]),
      prec("C-1", "COMUM", "NENHUMA", [2023, 1, 10]),
    ];
    expect(quebraDeOrdemAoPagar(fila, "A-1")).toBeNull();
  });

  it("t8: quem JÁ ESTÁ QUITADO sai da fila e deixa de bloquear", () => {
    // ⚠️ SEM ISTO O GUARD SEMPRE ACUSARIA depois do primeiro pagamento — e um guard que
    // sempre acusa é um guard que alguém desliga.
    const fila = [
      prec("A-1", "ALIMENTAR", "NENHUMA", [2024, 1, 10], "0.00"),
      prec("C-1", "COMUM", "NENHUMA", [2023, 1, 10]),
    ];
    expect(quebraDeOrdemAoPagar(fila, "C-1")).toBeNull();
  });

  it("t9: o saldo é Σ dos movimentos pelo sinal — e o estorno do pagamento o devolve", () => {
    const v = dinheiro("1000.00");
    expect(
      saldoDoPrecatorio([
        { tipo: "INSCRICAO", valor: v },
        { tipo: "ATUALIZACAO", valor: dinheiro("50.00") },
      ]).toFixed(2)
    ).toBe("1050.00");
    expect(
      saldoDoPrecatorio([
        { tipo: "INSCRICAO", valor: v },
        { tipo: "PAGAMENTO", valor: dinheiro("400.00") },
        { tipo: "ESTORNO_PAGAMENTO", valor: dinheiro("400.00") },
      ]).toFixed(2)
    ).toBe("1000.00");
  });
});
