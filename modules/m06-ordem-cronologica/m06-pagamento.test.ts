import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroPagamento } from "../m05-despesa/dominio.js";
import { pagar } from "../m05-despesa/servico-bloco2.js";
import { criarOrdemCronologicaPrisma } from "./adapter-prisma.js";
import { empenharELiquidar, semearM06 } from "./m06.test.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import type { JustificativaQuebraOrdemInput } from "./dominio.js";

/**
 * BLOCO 3 — `pagar()` do M05 valida a ordem cronológica (art. 141).
 *
 * A validação acontece DENTRO da transação do pagamento, ANTES de gravar. Se a
 * ordem for quebrada sem justificativa, NADA existe: nem pagamento, nem
 * lançamento, nem partida. E se houver justificativa, ela é gravada
 * atomicamente com o pagamento — um não pode existir sem o outro (§2º).
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";
const POR = "m06@cg.pb.gov.br";

const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.2.00.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
  creditoPago: "6.2.2.1.3.01.00",
});

const JUSTIFICATIVA: JustificativaQuebraOrdemInput = {
  hipotese: "V_ATIVIDADE_FINALISTICA",
  justificativa:
    "Pagamento imprescindível à continuidade do transporte escolar da rede municipal.",
  autorizadoPor: "Secretário de Finanças",
};

function pgto(
  liquidacaoId: string,
  numero: string,
  valor: string,
  conta = "CC-001",
  fonteId = FONTE_500
) {
  return {
    liquidacaoId,
    numero,
    valor,
    data: new Date("2026-07-01T12:00:00Z"),
    contaBancaria: conta,
    fonteId,
    historico: `Pagamento ${numero}`,
    criadoPor: POR,
  };
}

describe("M06 — pagar() valida a ordem cronológica", () => {
  let deps: M05Deps;
  const ordem = criarOrdemCronologicaPrisma(prisma);

  /** Duas liquidações na MESMA fonte + MESMA categoria. `a` é mais antiga. */
  let a: string;
  let b: string;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM06();

    a = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL1", valor: "100.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-01-05T12:00:00Z",
    });
    b = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL2", valor: "200.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-03-10T12:00:00Z",
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // (a)
  it("pagar a CABEÇA da fila: ok, sem justificativa", async () => {
    await pagar(pgto(a, "NP1", "100.00"), R_PAGAMENTO, deps);

    expect(await prisma.pagamento.count()).toBe(1);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
    // quitada, sai da fila -> agora `b` é a cabeça
    expect(await ordem.posicaoNaFila(b)).toBe(1);
  });

  // (b)
  it("pagar a 2ª ANTES da 1ª SEM justificativa: REJEITA e NADA é gravado", async () => {
    await expect(
      pagar(pgto(b, "NP1", "200.00"), R_PAGAMENTO, deps)
    ).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA sem justificativa/);

    // NADA: nem pagamento, nem justificativa, nem lançamento do pagamento,
    // nem partida. A transação inteira abortou.
    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: "PAGAMENTO" } })
    ).toBe(0);
    expect(
      await prisma.partidaContabil.count({
        where: { lancamento: { origemTipo: "PAGAMENTO" } },
      })
    ).toBe(0);

    // a fila segue intacta
    expect(await ordem.posicaoNaFila(a)).toBe(1);
    expect(await ordem.posicaoNaFila(b)).toBe(2);
  });

  it("a mensagem do erro diz QUEM está sendo preterido (para o §2º ter o que apurar)", async () => {
    let erro: unknown;
    try {
      await pagar(pgto(b, "NP1", "200.00"), R_PAGAMENTO, deps);
    } catch (e) {
      erro = e;
    }
    const msg = String(erro);
    console.log("\n>>> ERRO REAL (quebra de ordem sem justificativa):\n" + msg + "\n");
    expect(msg).toMatch(/posição 2 da fila/);
    expect(msg).toMatch(/a cabeça é a liquidação NL1/);
    expect(msg).toMatch(/2026-01-05/);
    expect(msg).toMatch(/FORNECIMENTO_BENS/);
  });

  // (c)
  it("pagar a 2ª COM justificativa: pagamento + JustificativaQuebraOrdem, ATOMICAMENTE", async () => {
    await pagar(
      { ...pgto(b, "NP1", "200.00"), justificativaQuebraOrdem: JUSTIFICATIVA },
      R_PAGAMENTO,
      deps
    );

    expect(await prisma.pagamento.count()).toBe(1);

    const quebras = await prisma.justificativaQuebraOrdem.findMany();
    expect(quebras).toHaveLength(1);
    expect(quebras[0]!.liquidacaoId).toBe(b);
    expect(quebras[0]!.hipotese).toBe("V_ATIVIDADE_FINALISTICA");
    expect(quebras[0]!.autorizadoPor).toBe("Secretário de Finanças");
    expect(quebras[0]!.justificativa).toMatch(/transporte escolar/);

    // `a` continua na fila, agora sozinha
    expect(await ordem.posicaoNaFila(a)).toBe(1);
    expect(await ordem.posicaoNaFila(b)).toBeNull(); // quitada
  });

  // (d)
  it("FONTES diferentes = filas independentes: não exige justificativa", async () => {
    const outraFonte = await empenharELiquidar(deps, {
      fichaId: FICHA_540, numero: "NL9", valor: "300.00",
      categoria: "FORNECIMENTO_BENS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // `a` (fonte 500, jan) é mais antiga, mas está em OUTRA fila.
    await pagar(
      pgto(outraFonte, "NP1", "300.00", "CC-002", FONTE_540),
      R_PAGAMENTO,
      deps
    );

    expect(await prisma.pagamento.count()).toBe(1);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  // (e)
  it("CATEGORIAS diferentes na mesma fonte = filas independentes", async () => {
    const obras = await empenharELiquidar(deps, {
      fichaId: FICHA_500, numero: "NL9", valor: "300.00",
      categoria: "REALIZACAO_OBRAS", dataLiquidacao: "2026-06-30T12:00:00Z",
    });

    // `a` (bens, jan) é mais antiga, mas obras é outra fila.
    await pagar(pgto(obras, "NP1", "300.00"), R_PAGAMENTO, deps);

    expect(await prisma.pagamento.count()).toBe(1);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  // (f)
  it("PAGAMENTO PARCIAL mantém a posição: pagar outra antes de quitar EXIGE justificativa", async () => {
    // paga metade da cabeça — ela CONTINUA na fila, na data original
    await pagar(pgto(a, "NP1", "50.00"), R_PAGAMENTO, deps);
    expect(await ordem.posicaoNaFila(a)).toBe(1);

    // pagar `b` agora ainda é quebra de ordem: `a` não foi quitada.
    // Sem isto, bastaria pagar R$ 0,01 a cada credor para desmontar a fila.
    await expect(
      pagar(pgto(b, "NP2", "200.00"), R_PAGAMENTO, deps)
    ).rejects.toThrow(/QUEBRA DA ORDEM CRONOLÓGICA sem justificativa/);

    expect(await prisma.pagamento.count()).toBe(1); // só o parcial

    // quitando `a`, `b` vira a cabeça e passa sem justificativa
    await pagar(pgto(a, "NP3", "50.00"), R_PAGAMENTO, deps);
    await pagar(pgto(b, "NP4", "200.00"), R_PAGAMENTO, deps);

    expect(await prisma.pagamento.count()).toBe(3);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  // (g)
  it("justificativa com texto CURTO: Zod rejeita, nada grava", async () => {
    await expect(
      pagar(
        {
          ...pgto(b, "NP1", "200.00"),
          justificativaQuebraOrdem: { ...JUSTIFICATIVA, justificativa: "urgente" },
        },
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow(/ao menos 30 caracteres/);

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  it("justificativa com HIPÓTESE inválida (fora do rol taxativo): Zod rejeita", async () => {
    await expect(
      pagar(
        {
          ...pgto(b, "NP1", "200.00"),
          // @ts-expect-error o §1º é taxativo — não existe "VI_OUTROS".
          justificativaQuebraOrdem: { ...JUSTIFICATIVA, hipotese: "VI_OUTROS" },
        },
        R_PAGAMENTO,
        deps
      )
    ).rejects.toThrow();

    expect(await prisma.pagamento.count()).toBe(0);
    expect(await prisma.justificativaQuebraOrdem.count()).toBe(0);
  });

  it("§3º: a consulta do mês mostra a fila E a quebra autorizada", async () => {
    await pagar(
      { ...pgto(b, "NP1", "200.00"), justificativaQuebraOrdem: JUSTIFICATIVA },
      R_PAGAMENTO,
      deps
    );

    const c = await ordem.consultaOrdemCronologica({
      inicio: new Date("2026-01-01T00:00:00Z"),
      fim: new Date("2026-12-31T23:59:59Z"),
    });

    expect(c.quebras).toHaveLength(1);
    expect(c.quebras[0]!.hipotese).toBe("V_ATIVIDADE_FINALISTICA");

    // `a` continua pendente na fila (500, BENS)
    const fila = c.filas.find(
      (f) => f.fonteCodigo === "500" && f.categoria === "FORNECIMENTO_BENS"
    );
    expect(fila?.liquidacoes.map((l) => l.liquidacaoId)).toEqual([a]);
  });
});
