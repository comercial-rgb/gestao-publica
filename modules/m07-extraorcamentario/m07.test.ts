import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  roteiroDispendioExtra,
  roteiroIngressoExtra,
} from "./dominio.js";
import {
  estornarMovimentoExtra,
  registrarDispendioExtra,
  registrarIngressoExtra,
  saldoExtraorcamentario,
} from "./extraorcamentario.js";

/**
 * M07 bloco 2 — ingresso, dispêndio e estorno avulsos.
 *
 * A asserção que atravessa todos: NENHUMA operação extraorçamentária cria
 * MovimentoDotacao. Dinheiro de terceiro não passa pelo orçamento.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m07@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";

/** Contas por PARÂMETRO (padrão do projeto — nada inventado). */
const CAIXA = "1.1.1.1.2.00.00";
const PASSIVO = "2.1.8.8.1.01.00";
const R_IN = roteiroIngressoExtra({
  disponibilidade: CAIXA,
  consignacaoAPagar: PASSIVO,
});
const R_OUT = roteiroDispendioExtra({
  consignacaoAPagar: PASSIVO,
  disponibilidade: CAIXA,
});

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-passivo", codigo: PASSIVO, nome: "Consignações a pagar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-sintetica", codigo: "2.1.8.0.0.00.00", nome: "Demais obrigações", naturezaSaldo: "CREDORA" as const, nivel: 3, analitica: false },
];

/** ids dos tipos, resolvidos no seed. */
let T_CAUCAO: string;
let T_INSS: string;
let T_INATIVO: string;

export async function semearM07(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE_500 },
      { id: "cb2", codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540 },
    ],
  });

  const caucao = await prisma.tipoConsignacao.create({
    data: { codigo: "CAUCAO", descricao: "Caução", criadoPor: "TESTE" },
  });
  const inss = await prisma.tipoConsignacao.create({
    data: { codigo: "INSS", descricao: "INSS", criadoPor: "TESTE" },
  });
  const inativo = await prisma.tipoConsignacao.create({
    data: { codigo: "ANTIGO", descricao: "Tipo desativado", ativo: false, criadoPor: "TESTE" },
  });
  T_CAUCAO = caucao.id;
  T_INSS = inss.id;
  T_INATIVO = inativo.id;
}

export { T_CAUCAO, T_INSS, CAIXA, PASSIVO, R_IN, R_OUT, FONTE_500, POR, CONTAS };

async function movimentosDotacao() {
  return prisma.movimentoDotacao.findMany({
    orderBy: { criadoEm: "asc" },
    select: { id: true, tipo: true },
  });
}

async function conferirBalanceamento(): Promise<void> {
  const lancs = await prisma.lancamentoContabil.findMany({
    select: { numeroControle: true, partidas: true },
  });
  expect(lancs.length).toBeGreaterThan(0);
  for (const l of lancs) {
    for (const s of new Set(l.partidas.map((p) => p.subsistema))) {
      const doSub = l.partidas.filter((p) => p.subsistema === s);
      const soma = (t: string) =>
        doSub
          .filter((p) => p.tipo === t)
          .reduce((a, p) => toMoney(a.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00"));
      expect(
        soma("DEBITO").toFixed(2),
        `lançamento ${l.numeroControle}, subsistema ${s}`
      ).toBe(soma("CREDITO").toFixed(2));
    }
  }
}

function ingresso(tipoId: string, credor: string, valor: string, conta = "CC-001") {
  return {
    tipoConsignacaoId: tipoId,
    credorConsignatario: credor,
    contaBancaria: conta,
    valor,
    data: new Date("2026-05-01T12:00:00Z"),
    historico: `ingresso ${credor}`,
    criadoPor: POR,
  };
}

function dispendio(
  tipoId: string,
  credor: string,
  valor: string,
  conta = "CC-001",
  fonteId = FONTE_500
) {
  return {
    tipoConsignacaoId: tipoId,
    credorConsignatario: credor,
    contaBancaria: conta,
    fonteId,
    valor,
    data: new Date("2026-06-01T12:00:00Z"),
    historico: `dispêndio ${credor}`,
    criadoPor: POR,
  };
}

describe("M07 — ciclo da CAUÇÃO", () => {
  beforeEach(async () => {
    await semearM07();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("ingressa 5000 → devolve 5000 → saldo 0 → devolver de novo é REJEITADO", async () => {
    const movsDotAntes = await movimentosDotacao();

    await registrarIngressoExtra(
      prisma,
      ingresso(T_CAUCAO, "Construtora Alfa Ltda", "5000.00"),
      R_IN
    );

    let s = await saldoExtraorcamentario(prisma, T_CAUCAO, "Construtora Alfa Ltda");
    expect(s.ingressoLiquido.toFixed(2)).toBe("5000.00");
    expect(s.saldo.toFixed(2)).toBe("5000.00"); // o ente DEVE 5000 ao caucionante

    await registrarDispendioExtra(
      prisma,
      dispendio(T_CAUCAO, "Construtora Alfa Ltda", "5000.00"),
      R_OUT
    );

    s = await saldoExtraorcamentario(prisma, T_CAUCAO, "Construtora Alfa Ltda");
    expect(s.dispendioLiquido.toFixed(2)).toBe("5000.00");
    expect(s.saldo.toFixed(2)).toBe("0.00"); // devolvida

    // devolver DE NOVO: não se devolve o que não se tem
    await expect(
      registrarDispendioExtra(
        prisma,
        dispendio(T_CAUCAO, "Construtora Alfa Ltda", "5000.00"),
        R_OUT
      )
    ).rejects.toThrow(/excede o saldo extraorçamentário.*saldo 0\.00/s);

    expect(await prisma.movimentoExtraorcamentario.count()).toBe(2);

    // dinheiro de terceiro NÃO passa pelo orçamento
    expect(await movimentosDotacao()).toEqual(movsDotAntes);
    await conferirBalanceamento();
  });

  it("o INGRESSO entra no caixa e cria o passivo (só PATRIMONIAL)", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_CAUCAO, "Construtora Alfa Ltda", "5000.00"),
      R_IN
    );

    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    expect(lanc.partidas).toHaveLength(2);
    // NENHUMA perna orçamentária
    expect(lanc.partidas.every((p) => p.subsistema === "PATRIMONIAL")).toBe(true);
    // e nenhuma partida com ficha
    expect(lanc.partidas.every((p) => p.fichaId === null)).toBe(true);

    const papel = new Map(lanc.partidas.map((p) => [p.conta.codigo, p.tipo]));
    expect(papel.get(CAIXA)).toBe("DEBITO");
    expect(papel.get(PASSIVO)).toBe("CREDITO");
  });

  it("REJEITA repasse maior que o saldo — nada grava", async () => {
    await registrarIngressoExtra(prisma, ingresso(T_INSS, "INSS", "150.00"), R_IN);

    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      registrarDispendioExtra(prisma, dispendio(T_INSS, "INSS", "200.00"), R_OUT)
    ).rejects.toThrow(/Não se repassa dinheiro de terceiro que não se reteve/);

    // prova por SELECT
    expect(await prisma.movimentoExtraorcamentario.count()).toBe(1);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
    const s = await saldoExtraorcamentario(prisma, T_INSS, "INSS");
    expect(s.saldo.toFixed(2)).toBe("150.00");
  });

  it("SALDO POR CONSIGNATÁRIO: o de um credor não paga o do outro", async () => {
    await registrarIngressoExtra(prisma, ingresso(T_INSS, "INSS", "1000.00"), R_IN);

    // a pensão de outro credor não tem saldo, mesmo havendo 1000 do INSS
    await expect(
      registrarDispendioExtra(
        prisma,
        dispendio(T_INSS, "Fulano da Silva", "100.00"),
        R_OUT
      )
    ).rejects.toThrow(/saldo 0\.00/);
  });

  it("REJEITA tipo de consignação INATIVO", async () => {
    await expect(
      registrarIngressoExtra(prisma, ingresso(T_INATIVO, "Alguem", "100.00"), R_IN)
    ).rejects.toThrow(/está INATIVO/);
  });

  it("TR 5.23: fonte do dispêndio divergente da conta é REJEITADA", async () => {
    await registrarIngressoExtra(prisma, ingresso(T_INSS, "INSS", "150.00"), R_IN);

    await expect(
      registrarDispendioExtra(
        prisma,
        dispendio(T_INSS, "INSS", "150.00", "CC-001", FONTE_540),
        R_OUT
      )
    ).rejects.toThrow(/TR 5\.23.*diverge da fonte da conta bancária/s);

    expect(await prisma.movimentoExtraorcamentario.count()).toBe(1);
  });

  it("REJEITA conta SINTÉTICA no roteiro", async () => {
    const roteiroSintetico = roteiroIngressoExtra({
      disponibilidade: CAIXA,
      consignacaoAPagar: "2.1.8.0.0.00.00", // sintética
    });
    await expect(
      registrarIngressoExtra(
        prisma,
        ingresso(T_CAUCAO, "Construtora Alfa Ltda", "100.00"),
        roteiroSintetico
      )
    ).rejects.toThrow(/sintética não recebe partida/);

    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });
});

describe("M07 — estorno simétrico", () => {
  beforeEach(async () => {
    await semearM07();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const MOTIVO = "Retenção lançada em duplicidade por erro operacional.";

  it("estorno de INGRESSO reduz o saldo; original INTACTO", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    expect((await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)).toBe("150.00");

    const antes = await prisma.movimentoExtraorcamentario.findUniqueOrThrow({
      where: { id: r.movimentoId },
    });

    await estornarMovimentoExtra(prisma, {
      movimentoId: r.movimentoId,
      data: new Date("2026-05-10T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    });

    const s = await saldoExtraorcamentario(prisma, T_INSS, "INSS");
    expect(s.ingresso.toFixed(2)).toBe("150.00"); // bruto
    expect(s.estornoIngresso.toFixed(2)).toBe("150.00");
    expect(s.ingressoLiquido.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("0.00");

    // append-only: o original não mudou
    const depois = await prisma.movimentoExtraorcamentario.findUniqueOrThrow({
      where: { id: r.movimentoId },
    });
    expect(depois).toEqual(antes);

    await conferirBalanceamento();
  });

  it("estorno de DISPÊNDIO RESTAURA o saldo e permite repassar de novo", async () => {
    await registrarIngressoExtra(prisma, ingresso(T_INSS, "INSS", "150.00"), R_IN);
    const d = await registrarDispendioExtra(
      prisma,
      dispendio(T_INSS, "INSS", "150.00"),
      R_OUT
    );

    // saldo zero -> não dá para repassar de novo
    await expect(
      registrarDispendioExtra(prisma, dispendio(T_INSS, "INSS", "150.00"), R_OUT)
    ).rejects.toThrow(/saldo 0\.00/);

    // estorna o repasse -> o ente VOLTA a dever ao INSS
    await estornarMovimentoExtra(prisma, {
      movimentoId: d.movimentoId,
      data: new Date("2026-06-10T12:00:00Z"),
      motivo: "Repasse feito para a conta errada do consignatário.",
      criadoPor: POR,
    });

    const s = await saldoExtraorcamentario(prisma, T_INSS, "INSS");
    expect(s.dispendioLiquido.toFixed(2)).toBe("0.00");
    expect(s.saldo.toFixed(2)).toBe("150.00"); // RESTAURADO

    // e o repasse PASSA de novo — o saldo governa a permissão
    await registrarDispendioExtra(prisma, dispendio(T_INSS, "INSS", "150.00"), R_OUT);
    expect(
      (await saldoExtraorcamentario(prisma, T_INSS, "INSS")).saldo.toFixed(2)
    ).toBe("0.00");
  });

  it("REJEITA estornar o INGRESSO cujo dinheiro JÁ FOI REPASSADO", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    await registrarDispendioExtra(prisma, dispendio(T_INSS, "INSS", "150.00"), R_OUT);

    // estornar o ingresso deixaria o saldo NEGATIVO: o ente teria repassado
    // dinheiro que não reteve.
    await expect(
      estornarMovimentoExtra(prisma, {
        movimentoId: r.movimentoId,
        data: new Date("2026-07-01T12:00:00Z"),
        motivo: MOTIVO,
        criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ FOI REPASSADA.*Estorne o dispêndio primeiro/s);

    expect(
      await prisma.movimentoExtraorcamentario.count({ where: { tipo: "ESTORNO_INGRESSO" } })
    ).toBe(0);
  });

  it("REJEITA estornar duas vezes (barreira do serviço)", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    const anul = {
      movimentoId: r.movimentoId,
      data: new Date("2026-05-10T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    };
    await estornarMovimentoExtra(prisma, anul);

    await expect(estornarMovimentoExtra(prisma, anul)).rejects.toThrow(
      /já foi estornado/
    );
  });

  it("DUPLO ESTORNO: o índice único parcial rejeita driblando o serviço", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    await estornarMovimentoExtra(prisma, {
      movimentoId: r.movimentoId,
      data: new Date("2026-05-10T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    });

    const original = await prisma.movimentoExtraorcamentario.findUniqueOrThrow({
      where: { id: r.movimentoId },
    });

    let erro: unknown;
    try {
      await prisma.movimentoExtraorcamentario.create({
        data: {
          tipoConsignacaoId: original.tipoConsignacaoId,
          credorConsignatario: original.credorConsignatario,
          contaBancariaId: original.contaBancariaId,
          tipo: "ESTORNO_INGRESSO",
          valor: "150.00",
          data: new Date("2026-05-11T12:00:00Z"),
          estornoDeId: original.id, // JÁ estornado!
          lancamentoId: r.lancamentoId,
          historico: "clandestino",
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (duplo estorno extraorçamentário):\n" +
        String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_extra_unico|Unique constraint/i);
  });

  it("REJEITA estornar um ESTORNO", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    const e = await estornarMovimentoExtra(prisma, {
      movimentoId: r.movimentoId,
      data: new Date("2026-05-10T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    });

    await expect(
      estornarMovimentoExtra(prisma, {
        movimentoId: e.movimentoId,
        data: new Date("2026-05-11T12:00:00Z"),
        motivo: MOTIVO,
        criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ É um estorno/);
  });

  it("o lançamento de estorno tem as PERNAS INVERTIDAS", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      ingresso(T_INSS, "INSS", "150.00"),
      R_IN
    );
    const e = await estornarMovimentoExtra(prisma, {
      movimentoId: r.movimentoId,
      data: new Date("2026-05-10T12:00:00Z"),
      motivo: MOTIVO,
      criadoPor: POR,
    });

    const est = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: e.lancamentoId },
      include: { partidas: { include: { conta: true } } },
    });
    expect(est.estornoDeId).toBe(r.lancamentoId);

    const papel = new Map(est.partidas.map((p) => [p.conta.codigo, p.tipo]));
    // no ingresso era D caixa / C passivo -> agora invertido
    expect(papel.get(CAIXA)).toBe("CREDITO");
    expect(papel.get(PASSIVO)).toBe("DEBITO");
  });
});
