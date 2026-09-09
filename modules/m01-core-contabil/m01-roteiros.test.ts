import { describe, expect, it } from "vitest";
import { validarLancamento } from "../../packages/ledger/index.js";
import { toMoney } from "../../packages/contracts/index.js";
import {
  contrapartidaDaLiquidacao,
  ELEMENTOS_COM_ROTEIRO,
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
  CONTA_CONTROLE_DDR,
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
  CONTA_CREDITO_EMPENHADO_EM_LIQUIDACAO,
  CONTA_CREDITO_LIQUIDADO_A_PAGAR,
  CONTA_CREDITO_LIQUIDADO_PAGO,
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
  CONTA_DDR_DISPONIVEL,
  CONTA_DDR_UTILIZADA,
  CONTA_DIVIDA_FUNDADA,
  CONTA_ESTOQUE,
  CONTA_RECEITA_A_REALIZAR,
  CONTA_RECEITA_REALIZADA,
  CONTA_VPD,
  type RoteiroContabil,
} from "./roteiros.js";

/**
 * OS ROTEIROS OFICIAIS DA EXECUÇÃO — as pernas, conta a conta.
 *
 * ⚠️ AS CONTAS FORAM CONFERIDAS À MÃO CONTRA O EXTRATO STN/MCASP, e é isso que este
 * arquivo trava: se alguém trocar um código por engano, o teste diz qual perna mudou.
 *
 * ═══ O ENCADEAMENTO ORÇAMENTÁRIO (o que faz a cadeia fechar) ═══
 *   empenho     D 6.2.2.1.1     / C 6.2.2.1.3.01
 *   liquidação  D 6.2.2.1.3.01  / C 6.2.2.1.3.03
 *   pagamento   D 6.2.2.1.3.03  / C 6.2.2.1.3.04
 *
 * Cada crédito de um estágio é o débito do seguinte — é isso que impede pagar o que
 * não foi liquidado sem que o razão acuse. O `.02` (em liquidação) fica de FORA:
 * facultativo no MCASP, dormente aqui (SEM-ESTAGIO-EM-LIQUIDACAO).
 */

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPA = "4.1.1.2.1.01.00";

/** As pernas como pares legíveis: ["DEBITO 6.2...", "CREDITO 6.2..."]. */
function pernas(r: RoteiroContabil): readonly string[] {
  return r.map((p) => `${p.tipo} ${p.conta} ${p.subsistema}`);
}

/** Aplica um valor a cada perna e submete ao motor — prova que o roteiro FECHA. */
function fecha(r: RoteiroContabil, valor = "1000.00"): boolean {
  validarLancamento(
    r.map((p) => ({ ...p, valor: toMoney(valor) }))
  );
  return true;
}

describe("M01 — os roteiros oficiais da execução", () => {
  it("t1: EMPENHO — orçamentário + controle, e nada patrimonial (nada foi recebido)", () => {
    expect(pernas(roteiroEmpenho())).toEqual([
      `DEBITO ${CONTA_CREDITO_DISPONIVEL} ORCAMENTARIO`,
      `CREDITO ${CONTA_CREDITO_EMPENHADO_A_LIQUIDAR} ORCAMENTARIO`,
      // ⚠️ A DDR: comprometer o CRÉDITO e comprometer o DINHEIRO são fatos distintos.
      `DEBITO ${CONTA_DDR_DISPONIVEL} CONTROLE`,
      `CREDITO ${CONTA_DDR_COMPROMETIDA_EMPENHO} CONTROLE`,
    ]);
    // Cada subsistema fecha SOZINHO: 2 pernas orçamentárias + 2 de controle.
    expect(fecha(roteiroEmpenho())).toBe(true);
    expect(roteiroEmpenho().filter((p) => p.subsistema === "PATRIMONIAL")).toHaveLength(0);
  });

  it("t2: LIQUIDAÇÃO — a contrapartida patrimonial depende do ELEMENTO", () => {
    // serviço (39) → VPD: a riqueza diminuiu, nada sobrou.
    expect(pernas(roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDOR }))).toEqual([
      `DEBITO ${CONTA_VPD} PATRIMONIAL`,
      `CREDITO ${FORNECEDOR} PATRIMONIAL`,
      `DEBITO ${CONTA_CREDITO_EMPENHADO_A_LIQUIDAR} ORCAMENTARIO`,
      `CREDITO ${CONTA_CREDITO_LIQUIDADO_A_PAGAR} ORCAMENTARIO`,
      `DEBITO ${CONTA_DDR_COMPROMETIDA_EMPENHO} CONTROLE`,
      `CREDITO ${CONTA_DDR_COMPROMETIDA_LIQUIDACAO} CONTROLE`,
    ]);

    // material de consumo (30) → ESTOQUE: a riqueza mudou de forma, não diminuiu.
    expect(contrapartidaDaLiquidacao("30")).toBe(CONTA_ESTOQUE);
    // amortização (71) → baixa o PASSIVO: não há despesa, há dívida a menos.
    expect(contrapartidaDaLiquidacao("71")).toBe(CONTA_DIVIDA_FUNDADA);

    for (const el of ELEMENTOS_COM_ROTEIRO) {
      expect(fecha(roteiroLiquidacao({ codElemento: el, obrigacaoAPagar: FORNECEDOR }))).toBe(true);
    }
  });

  it("t3: elemento SEM regra DERRUBA nomeando — nunca vira VPD no chute", () => {
    // 52 = Equipamentos e Material Permanente. Um default `VPD` faria o empenho de um
    // computador virar despesa em vez de imobilizado: o patrimônio nunca cresceria, e
    // o lançamento FECHARIA — ninguém veria.
    expect(() => contrapartidaDaLiquidacao("52")).toThrow(/SEM ROTEIRO PARA O ELEMENTO 52/);
    expect(() => contrapartidaDaLiquidacao("52")).toThrow(/MAPA-ELEMENTO-CONTA/);
    // a mensagem nomeia os que TÊM regra, para quem lê saber o tamanho do buraco
    expect(() => contrapartidaDaLiquidacao("52")).toThrow(/30, 39, 71/);

    expect(() => roteiroLiquidacao({ codElemento: "51", obrigacaoAPagar: FORNECEDOR })).toThrow(
      /SEM ROTEIRO PARA O ELEMENTO 51/
    );
  });

  it("t4: PAGAMENTO — o dinheiro sai: comprometido por liquidação → utilizada", () => {
    const r = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA });
    expect(pernas(r)).toEqual([
      `DEBITO ${FORNECEDOR} PATRIMONIAL`,
      `CREDITO ${CAIXA} PATRIMONIAL`,
      `DEBITO ${CONTA_CREDITO_LIQUIDADO_A_PAGAR} ORCAMENTARIO`,
      `CREDITO ${CONTA_CREDITO_LIQUIDADO_PAGO} ORCAMENTARIO`,
      `DEBITO ${CONTA_DDR_COMPROMETIDA_LIQUIDACAO} CONTROLE`,
      `CREDITO ${CONTA_DDR_UTILIZADA} CONTROLE`,
    ]);
    expect(r).toHaveLength(6);
    expect(fecha(r)).toBe(true);
  });

  it("t5: ARRECADAÇÃO — a ÚNICA perna de classe 7 do sistema", () => {
    const r = roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA });
    expect(pernas(r)).toEqual([
      `DEBITO ${CAIXA} PATRIMONIAL`,
      `CREDITO ${VPA} PATRIMONIAL`,
      `DEBITO ${CONTA_RECEITA_A_REALIZAR} ORCAMENTARIO`,
      `CREDITO ${CONTA_RECEITA_REALIZADA} ORCAMENTARIO`,
      // ⚠️ D classe 7 / C classe 8 — e as duas são CONTROLE, então o subsistema fecha.
      // É o único ato que traz dinheiro NOVO sob controle; os demais só o movem de
      // estado, dentro da classe 8.
      `DEBITO ${CONTA_CONTROLE_DDR} CONTROLE`,
      `CREDITO ${CONTA_DDR_DISPONIVEL} CONTROLE`,
    ]);
    expect(fecha(r)).toBe(true);

    // Nenhum outro roteiro toca a classe 7.
    for (const outro of [
      roteiroEmpenho(),
      roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDOR }),
      roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA }),
    ]) {
      expect(outro.some((p) => p.conta.startsWith("7."))).toBe(false);
    }
  });

  it("t8: a CADEIA da DDR fecha — o crédito de um estágio é o débito do seguinte", () => {
    const ddr = (r: RoteiroContabil, tipo: "DEBITO" | "CREDITO"): string =>
      r.find((p) => p.subsistema === "CONTROLE" && p.tipo === tipo)!.conta;

    const arr = roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA });
    const emp = roteiroEmpenho();
    const liq = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDOR });
    const pag = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA });

    // arrecada → disponível → comprometido por empenho → por liquidação → utilizada
    expect(ddr(arr, "CREDITO")).toBe(ddr(emp, "DEBITO"));
    expect(ddr(emp, "CREDITO")).toBe(ddr(liq, "DEBITO"));
    expect(ddr(liq, "CREDITO")).toBe(ddr(pag, "DEBITO"));
    expect(ddr(pag, "CREDITO")).toBe(CONTA_DDR_UTILIZADA);
  });

  it("t6: a CADEIA fecha — o crédito de um estágio é o débito do seguinte", () => {
    const emp = roteiroEmpenho();
    const liq = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDOR });
    const pag = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA });

    const creditoOrc = (r: RoteiroContabil): string =>
      r.find((p) => p.subsistema === "ORCAMENTARIO" && p.tipo === "CREDITO")!.conta;
    const debitoOrc = (r: RoteiroContabil): string =>
      r.find((p) => p.subsistema === "ORCAMENTARIO" && p.tipo === "DEBITO")!.conta;

    // empenho credita o que a liquidação debita…
    expect(creditoOrc(emp)).toBe(debitoOrc(liq));
    // …e a liquidação credita o que o pagamento debita.
    expect(creditoOrc(liq)).toBe(debitoOrc(pag));

    // ⚠️ E O `.02` NÃO APARECE EM LUGAR NENHUM — é a decisão, não um esquecimento.
    for (const r of [emp, liq, pag]) {
      expect(r.some((p) => p.conta === CONTA_CREDITO_EMPENHADO_EM_LIQUIDACAO)).toBe(false);
    }
  });

  it("t7: nenhum roteiro usa a SINTÉTICA 6.2.2.1.3.00.00 — era o bug de todas as fixtures", () => {
    const todos = [
      roteiroEmpenho(),
      roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: FORNECEDOR }),
      roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA }),
      roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA }),
    ];
    for (const r of todos) {
      expect(r.some((p) => p.conta === "6.2.2.1.3.00.00")).toBe(false);
    }
  });
});
