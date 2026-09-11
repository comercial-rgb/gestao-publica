import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import {
  comporPagamentoComRetencoes,
  comporPartidas,
  roteiroDispendioExtra,
  roteiroIngressoExtra,
  SINAL_MOVIMENTO_EXTRA,
  tipoDoEstorno,
  totaisPorConsignatario,
  zEstornarMovimentoExtraInput,
  zRegistrarIngressoExtraInput,
  zRetencaoInput,
  type MovimentoExtra,
  type RoteiroContabil,
} from "./dominio.js";

/**
 * M07 bloco 1 — o domínio dos sinais.
 *
 * Simétrico DESDE O DIA 1. No M08 os estornos chegaram depois e custaram dois
 * bugs seguidos (345af7d, 4768cff), ambos num SUM que não consultava o sinal.
 * Aqui os quatro tipos nascem juntos e toda soma passa por
 * `totaisPorConsignatario`.
 */

describe("M07 — SINAL_MOVIMENTO_EXTRA (a fonte única do sinal)", () => {
  it("INGRESSO e ESTORNO_DISPENDIO somam; DISPENDIO e ESTORNO_INGRESSO subtraem", () => {
    expect(SINAL_MOVIMENTO_EXTRA.INGRESSO).toBe(1);
    expect(SINAL_MOVIMENTO_EXTRA.ESTORNO_DISPENDIO).toBe(1);
    expect(SINAL_MOVIMENTO_EXTRA.DISPENDIO).toBe(-1);
    expect(SINAL_MOVIMENTO_EXTRA.ESTORNO_INGRESSO).toBe(-1);
  });

  it("cada estorno tem o sinal OPOSTO ao do movimento que desfaz", () => {
    expect(SINAL_MOVIMENTO_EXTRA.ESTORNO_INGRESSO).toBe(
      -SINAL_MOVIMENTO_EXTRA.INGRESSO
    );
    expect(SINAL_MOVIMENTO_EXTRA.ESTORNO_DISPENDIO).toBe(
      -SINAL_MOVIMENTO_EXTRA.DISPENDIO
    );
  });

  it("o Record cobre os QUATRO tipos — um tipo novo quebra o typecheck", () => {
    expect(Object.keys(SINAL_MOVIMENTO_EXTRA).sort()).toEqual([
      "DISPENDIO",
      "ESTORNO_DISPENDIO",
      "ESTORNO_INGRESSO",
      "INGRESSO",
    ]);
  });
});

describe("M07 — totaisPorConsignatario (puro)", () => {
  const mov = (tipo: MovimentoExtra["tipo"], v: string): MovimentoExtra => ({
    tipo,
    valor: toMoney(v),
  });

  it("sem movimento: saldo zero", () => {
    const t = totaisPorConsignatario([]);
    expect(t.saldo.toFixed(2)).toBe("0.00");
  });

  it("só ingresso: o ente DEVE o valor ao consignatário", () => {
    const t = totaisPorConsignatario([mov("INGRESSO", "150.00")]);
    expect(t.ingressoLiquido.toFixed(2)).toBe("150.00");
    expect(t.saldo.toFixed(2)).toBe("150.00");
  });

  it("ingresso + dispêndio total: saldo zerado (o dinheiro foi repassado)", () => {
    const t = totaisPorConsignatario([
      mov("INGRESSO", "150.00"),
      mov("DISPENDIO", "150.00"),
    ]);
    expect(t.dispendioLiquido.toFixed(2)).toBe("150.00");
    expect(t.saldo.toFixed(2)).toBe("0.00");
  });

  it("ESTORNO_INGRESSO desfaz o ingresso (o passivo some)", () => {
    const t = totaisPorConsignatario([
      mov("INGRESSO", "150.00"),
      mov("ESTORNO_INGRESSO", "150.00"),
    ]);
    expect(t.ingressoLiquido.toFixed(2)).toBe("0.00");
    expect(t.saldo.toFixed(2)).toBe("0.00");
  });

  it("ESTORNO_DISPENDIO desfaz o repasse (o passivo VOLTA)", () => {
    const t = totaisPorConsignatario([
      mov("INGRESSO", "150.00"),
      mov("DISPENDIO", "150.00"),
      mov("ESTORNO_DISPENDIO", "150.00"),
    ]);
    expect(t.dispendioLiquido.toFixed(2)).toBe("0.00");
    // o ente voltou a dever os 150 — o dinheiro está de novo no caixa
    expect(t.saldo.toFixed(2)).toBe("150.00");
  });

  it("os quatro tipos juntos: tudo desfeito", () => {
    const t = totaisPorConsignatario([
      mov("INGRESSO", "500.00"),
      mov("ESTORNO_INGRESSO", "500.00"),
      mov("DISPENDIO", "300.00"),
      mov("ESTORNO_DISPENDIO", "300.00"),
    ]);
    expect(t.saldo.toFixed(2)).toBe("0.00");
  });

  it("vários ingressos parciais e um repasse parcial", () => {
    const t = totaisPorConsignatario([
      mov("INGRESSO", "150.00"),
      mov("INGRESSO", "80.00"),
      mov("INGRESSO", "70.00"),
      mov("DISPENDIO", "200.00"),
    ]);
    expect(t.ingressoLiquido.toFixed(2)).toBe("300.00");
    expect(t.saldo.toFixed(2)).toBe("100.00");
  });
});

describe("M07 — tipoDoEstorno", () => {
  it("INGRESSO -> ESTORNO_INGRESSO; DISPENDIO -> ESTORNO_DISPENDIO", () => {
    expect(tipoDoEstorno("INGRESSO")).toBe("ESTORNO_INGRESSO");
    expect(tipoDoEstorno("DISPENDIO")).toBe("ESTORNO_DISPENDIO");
  });

  it("REJEITA estornar um estorno", () => {
    expect(() => tipoDoEstorno("ESTORNO_INGRESSO")).toThrow(/não se estorna/);
    expect(() => tipoDoEstorno("ESTORNO_DISPENDIO")).toThrow(/não se estorna/);
  });
});

describe("M07 — roteiros contábeis (puro)", () => {
  const CAIXA = "1.1.1.1.2.00.00";
  const PASSIVO = "2.1.8.8.1.01.00";

  it("INGRESSO: entra caixa, nasce o passivo — só PATRIMONIAL", () => {
    const r = roteiroIngressoExtra({
      disponibilidade: CAIXA,
      consignacaoAPagar: PASSIVO,
    });
    const p = comporPartidas(toMoney("150.00"), r);
    expect(p).toHaveLength(2);
    // nenhuma perna orçamentária: dinheiro de terceiro não passa pelo orçamento
    expect(p.every((x) => x.subsistema === "PATRIMONIAL")).toBe(true);

    const papel = new Map(p.map((x) => [x.conta, x.tipo]));
    expect(papel.get(CAIXA)).toBe("DEBITO");
    expect(papel.get(PASSIVO)).toBe("CREDITO");
  });

  it("DISPÊNDIO: baixa o passivo, sai o caixa — o inverso", () => {
    const r = roteiroDispendioExtra({
      consignacaoAPagar: PASSIVO,
      disponibilidade: CAIXA,
    });
    const p = comporPartidas(toMoney("150.00"), r);
    const papel = new Map(p.map((x) => [x.conta, x.tipo]));
    expect(papel.get(PASSIVO)).toBe("DEBITO");
    expect(papel.get(CAIXA)).toBe("CREDITO");
  });

  it("o motor puro BARRA roteiro desbalanceado", () => {
    expect(() =>
      comporPartidas(toMoney("100.00"), [
        { conta: CAIXA, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
        { conta: PASSIVO, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
      ])
    ).toThrow(/partida simples/i);
  });
});

describe("M07 — Zod dos inputs", () => {
  const ingresso = {
    tipoConsignacaoId: "t1",
    credorConsignatario: "INSS",
    contaBancaria: "CC-001",
    fonteId: "fnt-500",
    valor: "150.00",
    data: new Date("2026-05-01T12:00:00Z"),
    historico: "retenção",
    criadoPor: "u",
  };

  it("aceita ingresso válido", () => {
    expect(() => zRegistrarIngressoExtraInput.parse(ingresso)).not.toThrow();
  });

  it("REJEITA valor <= 0", () => {
    expect(() =>
      zRegistrarIngressoExtraInput.parse({ ...ingresso, valor: "0.00" })
    ).toThrow(/deve ser > 0/);
    expect(() =>
      zRegistrarIngressoExtraInput.parse({ ...ingresso, valor: "-1.00" })
    ).toThrow(/deve ser > 0/);
  });

  it("REJEITA dinheiro como number (regra de ouro)", () => {
    // `.parse()` aceita unknown, então quem barra é o Zod em runtime — não o TS.
    expect(() =>
      zRegistrarIngressoExtraInput.parse({ ...ingresso, valor: 150 })
    ).toThrow();
  });

  it("REJEITA credor com menos de 3 caracteres", () => {
    expect(() =>
      zRegistrarIngressoExtraInput.parse({ ...ingresso, credorConsignatario: "AB" })
    ).toThrow(/ao menos 3 caracteres/);
  });

  it("REJEITA motivo de estorno com menos de 10 caracteres", () => {
    expect(() =>
      zEstornarMovimentoExtraInput.parse({
        movimentoId: "m1",
        data: new Date(),
        motivo: "erro",
        criadoPor: "u",
      })
    ).toThrow(/ao menos 10 caracteres/);
  });

  it("retenção: valor > 0 e credor válido", () => {
    expect(() =>
      zRetencaoInput.parse({
        tipoConsignacaoId: "t1",
        credorConsignatario: "INSS",
        valor: "150.00",
      })
    ).not.toThrow();
    expect(() =>
      zRetencaoInput.parse({
        tipoConsignacaoId: "t1",
        credorConsignatario: "INSS",
        valor: "0.00",
      })
    ).toThrow(/deve ser > 0/);
  });
});

// ── BLOCO 3 — o pagamento COMPOSTO (puro) ───────────────────────────────────

describe("M07 — comporPagamentoComRetencoes (puro)", () => {
  const CAIXA = "1.1.1.1.2.00.00";
  const FORNECEDOR = "2.1.3.1.1.00.00";
  const P_INSS = "2.1.8.8.1.01.00";
  const P_ISS = "2.1.8.8.1.02.00";
  const C_LIQUIDADO = "6.2.2.1.3.03.00";
  const C_PAGO = "6.2.2.1.3.04.00";

  /** O roteiro do pagamento do M05 — estruturalmente idêntico ao daqui. */
  const ROTEIRO: RoteiroContabil = [
    { conta: FORNECEDOR, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: CAIXA, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: C_LIQUIDADO, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: C_PAGO, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];

  const inss = (valor: string) => ({
    tipoConsignacaoId: "t-inss",
    credorConsignatario: "INSS",
    valor,
    contaConsignacaoAPagar: P_INSS,
  });
  const iss = (valor: string) => ({
    tipoConsignacaoId: "t-iss",
    credorConsignatario: "Município",
    valor,
    contaConsignacaoAPagar: P_ISS,
  });

  const compor = (valorBruto: string, retencoes: readonly unknown[]) =>
    comporPagamentoComRetencoes({
      valorBruto: toMoney(valorBruto),
      roteiro: ROTEIRO,
      contaDisponibilidade: CAIXA,
      retencoes: retencoes as never,
    });

  it("SEM retenção: partidas IDÊNTICAS a comporPartidas — o caminho de sempre", () => {
    // Esta é a prova da retrocompatibilidade: acrescentar o M07 ao pagar() não
    // muda um único pagamento que não retém nada.
    const semRetencao = comporPagamentoComRetencoes({
      valorBruto: toMoney("1000.00"),
      roteiro: ROTEIRO,
      retencoes: [],
    });
    expect(semRetencao.partidas).toEqual(comporPartidas(toMoney("1000.00"), ROTEIRO));
    expect(semRetencao.partidasRetencao).toHaveLength(0);
    expect(semRetencao.totalRetido.toFixed(2)).toBe("0.00");
    expect(semRetencao.valorLiquido.toFixed(2)).toBe("1000.00");
  });

  it("só o CAIXA fica com o líquido; obrigação e orçamentário seguem no BRUTO", () => {
    const c = compor("1000.00", [inss("100.00"), iss("10.00")]);

    expect(c.totalRetido.toFixed(2)).toBe("110.00");
    expect(c.valorLiquido.toFixed(2)).toBe("890.00");

    const valor = new Map(c.partidas.map((p) => [p.conta, p.valor.toFixed(2)]));
    expect(valor.get(CAIXA)).toBe("890.00");
    expect(valor.get(FORNECEDOR)).toBe("1000.00");
    expect(valor.get(C_LIQUIDADO)).toBe("1000.00");
    expect(valor.get(C_PAGO)).toBe("1000.00");
    expect(valor.get(P_INSS)).toBe("100.00");
    expect(valor.get(P_ISS)).toBe("10.00");
  });

  it("as pernas de passivo são CREDITO e PATRIMONIAL — nenhuma perna orçamentária", () => {
    const c = compor("1000.00", [inss("100.00")]);
    expect(c.partidasRetencao).toHaveLength(1);
    expect(c.partidasRetencao[0]).toMatchObject({
      conta: P_INSS,
      tipo: "CREDITO",
      subsistema: "PATRIMONIAL",
    });
    // a retenção não executa orçamento: as únicas pernas orçamentárias são as
    // do pagamento, e elas seguem no bruto
    expect(
      c.partidasRetencao.every((p) => p.subsistema === "PATRIMONIAL")
    ).toBe(true);
  });

  it("N consignações = N pernas — nunca uma perna só, somada", () => {
    const c = compor("1000.00", [inss("100.00"), iss("10.00")]);
    expect(c.partidas).toHaveLength(6); // 4 do pagamento + 2 de passivo
    expect(c.partidasRetencao).toHaveLength(2);
  });

  it("o lançamento COMPOSTO fecha dentro de cada subsistema (o motor é o juiz)", () => {
    const c = compor("1000.00", [inss("100.00"), iss("10.00")]);

    for (const s of ["PATRIMONIAL", "ORCAMENTARIO"] as const) {
      const doSub = c.partidas.filter((p) => p.subsistema === s);
      const soma = (t: string) =>
        doSub
          .filter((p) => p.tipo === t)
          .reduce((a, p) => toMoney(a.plus(p.valor)), toMoney("0.00"));
      // PATRIMONIAL: D 1000 == C 890 + 100 + 10
      expect(soma("DEBITO").toFixed(2)).toBe(soma("CREDITO").toFixed(2));
    }
  });

  it("REJEITA retenção que consome o pagamento inteiro (líquido zero)", () => {
    expect(() => compor("1000.00", [inss("1000.00")])).toThrow(
      /consomem o pagamento inteiro/
    );
    expect(() => compor("1000.00", [inss("900.00"), iss("100.00")])).toThrow(
      /consomem o pagamento inteiro/
    );
  });

  it("REJEITA retenção MAIOR que o pagamento", () => {
    expect(() => compor("100.00", [inss("150.00")])).toThrow(
      /consomem o pagamento inteiro/
    );
  });

  it("REJEITA o mesmo (tipo, credor) duas vezes no mesmo pagamento", () => {
    expect(() => compor("1000.00", [inss("100.00"), inss("50.00")])).toThrow(
      /DUPLICADA/
    );
    // credores diferentes no mesmo tipo, porém, são DUAS retenções legítimas
    expect(() =>
      compor("1000.00", [
        { ...inss("100.00"), credorConsignatario: "Maria" },
        { ...inss("50.00"), credorConsignatario: "Joana" },
      ])
    ).not.toThrow();
  });

  it("REJEITA retenção sem dizer qual perna é o caixa", () => {
    expect(() =>
      comporPagamentoComRetencoes({
        valorBruto: toMoney("1000.00"),
        roteiro: ROTEIRO,
        retencoes: [inss("100.00")],
      })
    ).toThrow(/contaDisponibilidade/);
  });

  it("REJEITA conta de disponibilidade que não está no roteiro", () => {
    expect(() =>
      comporPagamentoComRetencoes({
        valorBruto: toMoney("1000.00"),
        roteiro: ROTEIRO,
        contaDisponibilidade: "9.9.9.9.9.99.99",
        retencoes: [inss("100.00")],
      })
    ).toThrow(/aparece 0x no roteiro/);
  });

  it("REJEITA deduzir uma perna ORÇAMENTÁRIA — retenção não é desconto de despesa", () => {
    // apontar o "caixa" para o crédito pago faria a execução orçamentária
    // registrar 890 numa despesa de 1000.
    expect(() =>
      comporPagamentoComRetencoes({
        valorBruto: toMoney("1000.00"),
        roteiro: ROTEIRO,
        contaDisponibilidade: C_PAGO,
        retencoes: [inss("100.00")],
      })
    ).toThrow(/só sai de uma perna de CAIXA/);
  });

  it("REJEITA valor de retenção <= 0 (Zod)", () => {
    expect(() => compor("1000.00", [inss("0.00")])).toThrow(/deve ser > 0/);
  });
});
