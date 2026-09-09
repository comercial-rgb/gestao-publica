import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { roteiroArrecadacao, type RoteiroContabil } from "./dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";
import type { M04Deps, RegistrarArrecadacaoInput } from "./index.js";

/**
 * M04 — testes contra o Postgres de TESTE (DATABASE_URL_TEST).
 *
 * Este é o primeiro módulo que exercita o ciclo inteiro:
 *   fato (arrecadação) -> partidas balanceadas (motor puro) -> ledger append-only.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

/**
 * SEED MÍNIMO. As contas PCASP entram por PARÂMETRO no roteiro — nenhuma conta
 * mágica hardcoded no domínio (o roteiro completo virá da Matriz de Eventos).
 */
const CONTAS = [
  { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.2.1.01.00", nome: "VPA - Impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-a-realizar", codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-realizada", codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-sintetica", codigo: "1.1.1.0.0.00.00", nome: "Caixa e Equivalentes", naturezaSaldo: "DEVEDORA" as const, nivel: 3, analitica: false },
];

const ROTEIRO: RoteiroContabil = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: "6.2.1.1.0.00.00",
  receitaRealizada: "6.2.1.2.0.00.00",
});

const ARRECADACAO: RegistrarArrecadacaoInput = {
  exercicio: 2026,
  naturezaReceita: "11121101",
  fonte: "500",
  co: "0001",
  exercicioFonte: 1,
  valor: "1500.00",
  dataArrecadacao: new Date("2026-03-10T12:00:00Z"),
  numeroReceita: "2026RC000001",
  criadoPor: "m04@cg.pb.gov.br",
};

describe("M04 — receita (arrecadação)", () => {
  let deps: M04Deps;

  beforeEach(async () => {
    deps = criarM04Deps(prisma);

    await limparBanco(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.naturezaReceita.createMany({
      data: [{ id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" }],
    });
    await prisma.fonteRecurso.createMany({
      data: [{ id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" }],
    });
    await prisma.codigoAcompanhamento.createMany({
      data: [{ id: "co-0001", codigo: "0001", descricao: "Execução direta" }],
    });
    await prisma.receitaPrevista.createMany({
      data: [
        {
          exercicio: 2026,
          naturezaReceitaId: "nr-iptu",
          fonteId: "fnt-500",
          exercicioFonte: 1,
          tipoReceita: "ORCAMENTARIA",
          valorPrevisto: "2000.00",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("registra arrecadação e gera lançamento BALANCEADO por subsistema", async () => {
    const r = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);

    const receita = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: r.receitaId },
      include: {
        naturezaReceita: true,
        fonte: true,
        co: true,
        lancamento: { include: { partidas: { include: { conta: true } } } },
      },
    });

    expect(receita.tipo).toBe("ARRECADACAO");
    expect(receita.naturezaReceita.codigo).toBe("11121101");
    expect(receita.fonte.codigo).toBe("500");
    expect(receita.co?.codigo).toBe("0001");
    // dinheiro sobreviveu à ida e volta pelo Postgres
    expect(receita.valor.toFixed(2)).toBe("1500.00");
    expect(receita.estornoDeId).toBeNull();

    // 4 pernas: 2 patrimoniais + 2 orçamentárias
    const partidas = receita.lancamento.partidas;
    expect(partidas).toHaveLength(4);

    for (const subsistema of ["PATRIMONIAL", "ORCAMENTARIO"] as const) {
      const doSub = partidas.filter((p) => p.subsistema === subsistema);
      const d = doSub.filter((p) => p.tipo === "DEBITO");
      const c = doSub.filter((p) => p.tipo === "CREDITO");
      expect(d).toHaveLength(1);
      expect(c).toHaveLength(1);
      expect(d[0]!.valor.toFixed(2)).toBe(c[0]!.valor.toFixed(2));
      expect(d[0]!.valor.toFixed(2)).toBe("1500.00");
    }

    // as contas certas, nos papéis certos
    const papel = new Map(partidas.map((p) => [p.conta.codigo, `${p.tipo}/${p.subsistema}`]));
    expect(papel.get("1.1.1.1.1.00.00")).toBe("DEBITO/PATRIMONIAL");
    expect(papel.get("4.1.1.2.1.01.00")).toBe("CREDITO/PATRIMONIAL");
    expect(papel.get("6.2.1.1.0.00.00")).toBe("DEBITO/ORCAMENTARIO");
    expect(papel.get("6.2.1.2.0.00.00")).toBe("CREDITO/ORCAMENTARIO");
  });

  it("REJEITA roteiro cujo TOTAL fecha mas o SUBSISTEMA não — só o check por subsistema pega", async () => {
    // 1 débito patrimonial + 1 crédito orçamentário: o total fecha (1500/1500),
    // mas o PATRIMONIAL só tem débito e o ORCAMENTARIO só tem crédito. Um check
    // só global deixaria isto passar — e a contabilidade estaria errada.
    const roteiroTorto: RoteiroContabil = [
      { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL" },
      { conta: "6.2.1.2.0.00.00", tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
    ];

    await expect(
      registrarArrecadacao(ARRECADACAO, roteiroTorto, deps)
    ).rejects.toThrow(/partida simples no subsistema/i);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("REJEITA roteiro DESBALANCEADO no total — o motor barra, nada é persistido", async () => {
    // 2 débitos e 1 crédito: ΣD = 3000, ΣC = 1500.
    const roteiroTorto: RoteiroContabil = [
      { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL" },
      { conta: "1.1.2.2.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL" },
      { conta: "4.1.1.2.1.01.00", tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    ];

    await expect(
      registrarArrecadacao(ARRECADACAO, roteiroTorto, deps)
    ).rejects.toThrow(/desbalanceado/i);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("REJEITA valor <= 0", async () => {
    await expect(
      registrarArrecadacao({ ...ARRECADACAO, valor: "0.00" }, ROTEIRO, deps)
    ).rejects.toThrow(/deve ser > 0/);

    await expect(
      registrarArrecadacao({ ...ARRECADACAO, valor: "-1.00" }, ROTEIRO, deps)
    ).rejects.toThrow(/deve ser > 0/);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("REJEITA dinheiro como number (regra de ouro)", async () => {
    await expect(
      // @ts-expect-error INVARIANTE 1: dinheiro NUNCA é number.
      registrarArrecadacao({ ...ARRECADACAO, valor: 1500 }, ROTEIRO, deps)
    ).rejects.toThrow();
  });

  it("REJEITA natureza de receita inexistente (fail-closed)", async () => {
    await expect(
      registrarArrecadacao(
        { ...ARRECADACAO, naturezaReceita: "99999999" },
        ROTEIRO,
        deps
      )
    ).rejects.toThrow(/inexistente.*naturezaReceita="99999999"/s);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("REJEITA conta SINTÉTICA no roteiro (fail-closed)", async () => {
    const roteiroSintetico = roteiroArrecadacao({
      disponibilidade: "1.1.1.0.0.00.00", // sintética!
      variacaoAumentativa: "4.1.1.2.1.01.00",
      receitaARealizar: "6.2.1.1.0.00.00",
      receitaRealizada: "6.2.1.2.0.00.00",
    });

    await expect(
      registrarArrecadacao(ARRECADACAO, roteiroSintetico, deps)
    ).rejects.toThrow(/sintética não recebe partida/);

    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("REJEITA data de arrecadação fora do exercício", async () => {
    await expect(
      registrarArrecadacao(
        { ...ARRECADACAO, dataArrecadacao: new Date("2027-01-05T12:00:00Z") },
        ROTEIRO,
        deps
      )
    ).rejects.toThrow(/fora do exercício 2026/);
  });

  it("REJEITA a mesma guia arrecadada duas vezes (uq_receita_guia)", async () => {
    await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);
    await expect(
      registrarArrecadacao(ARRECADACAO, ROTEIRO, deps)
    ).rejects.toThrow(/Unique constraint/i);

    expect(await prisma.receitaArrecadada.count()).toBe(1);
  });
});

describe("M04 — excesso de arrecadação (sinaliza, não bloqueia)", () => {
  let deps: M04Deps;

  beforeEach(async () => {
    deps = criarM04Deps(prisma);
    await limparBanco(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.naturezaReceita.createMany({
      data: [{ id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" }],
    });
    await prisma.fonteRecurso.createMany({
      data: [{ id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" }],
    });
    await prisma.codigoAcompanhamento.createMany({
      data: [{ id: "co-0001", codigo: "0001", descricao: "Execução direta" }],
    });
    // previsão de 2000
    await prisma.receitaPrevista.createMany({
      data: [
        {
          exercicio: 2026,
          naturezaReceitaId: "nr-iptu",
          fonteId: "fnt-500",
          exercicioFonte: 1,
          tipoReceita: "ORCAMENTARIA",
          valorPrevisto: "2000.00",
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("dentro da previsão: não sinaliza excesso", async () => {
    const r = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps); // 1500 de 2000
    expect(r.confronto.previsto.toFixed(2)).toBe("2000.00");
    expect(r.confronto.acumuladoAnterior.toFixed(2)).toBe("0.00");
    expect(r.confronto.acumuladoComEsta.toFixed(2)).toBe("1500.00");
    expect(r.confronto.excedeuPrevisao).toBe(false);
  });

  it("acima da previsão: NÃO bloqueia, mas SINALIZA — e o lançamento é gravado", async () => {
    await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps); // 1500

    const segunda = await registrarArrecadacao(
      { ...ARRECADACAO, numeroReceita: "2026RC000002", valor: "800.00" },
      ROTEIRO,
      deps
    ); // acumulado 2300 > previsto 2000

    expect(segunda.confronto.previsto.toFixed(2)).toBe("2000.00");
    expect(segunda.confronto.acumuladoAnterior.toFixed(2)).toBe("1500.00");
    expect(segunda.confronto.acumuladoComEsta.toFixed(2)).toBe("2300.00");
    expect(segunda.confronto.excedeuPrevisao).toBe(true);

    // INVARIANTE 5: excesso é legítimo — foi REGISTRADO, não barrado.
    expect(await prisma.receitaArrecadada.count()).toBe(2);
    const gravada = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: segunda.receitaId },
    });
    expect(gravada.valor.toFixed(2)).toBe("800.00");
  });

  it("anulação reduz o acumulado líquido", async () => {
    const primeira = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps); // 1500
    await anularArrecadacao(
      {
        receitaId: primeira.receitaId,
        dataAnulacao: new Date("2026-03-20T12:00:00Z"),
        numeroReceita: "2026RC000001",
        criadoPor: "m04@cg.pb.gov.br",
      },
      deps
    );

    const nova = await registrarArrecadacao(
      { ...ARRECADACAO, numeroReceita: "2026RC000003", valor: "100.00" },
      ROTEIRO,
      deps
    );
    // 1500 arrecadado - 1500 anulado = 0 de acumulado anterior
    expect(nova.confronto.acumuladoAnterior.toFixed(2)).toBe("0.00");
    expect(nova.confronto.excedeuPrevisao).toBe(false);
  });
});

describe("M04 — anulação (append-only)", () => {
  let deps: M04Deps;

  beforeEach(async () => {
    deps = criarM04Deps(prisma);
    await limparBanco(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.naturezaReceita.createMany({
      data: [{ id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" }],
    });
    await prisma.fonteRecurso.createMany({
      data: [{ id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" }],
    });
    await prisma.codigoAcompanhamento.createMany({
      data: [{ id: "co-0001", codigo: "0001", descricao: "Execução direta" }],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const ANULACAO = {
    dataAnulacao: new Date("2026-03-20T12:00:00Z"),
    numeroReceita: "2026RC000001",
    criadoPor: "m04@cg.pb.gov.br",
  };

  it("gera registro NOVO (ANULACAO) com pernas invertidas; original INTACTO", async () => {
    const original = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);

    const antes = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: original.receitaId },
      include: { lancamento: { include: { partidas: true } } },
    });

    const anulacao = await anularArrecadacao(
      { receitaId: original.receitaId, ...ANULACAO },
      deps
    );

    const nova = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: anulacao.receitaId },
      include: { lancamento: { include: { partidas: { include: { conta: true } } } } },
    });

    expect(nova.tipo).toBe("ANULACAO");
    expect(nova.estornoDeId).toBe(original.receitaId);
    expect(nova.valor.toFixed(2)).toBe("1500.00");
    expect(nova.lancamento.estornoDeId).toBe(original.lancamentoId);

    // pernas INVERTIDAS: o caixa que foi debitado agora é creditado
    const papel = new Map(
      nova.lancamento.partidas.map((p) => [p.conta.codigo, `${p.tipo}/${p.subsistema}`])
    );
    expect(papel.get("1.1.1.1.1.00.00")).toBe("CREDITO/PATRIMONIAL");
    expect(papel.get("4.1.1.2.1.01.00")).toBe("DEBITO/PATRIMONIAL");
    expect(papel.get("6.2.1.1.0.00.00")).toBe("CREDITO/ORCAMENTARIO");
    expect(papel.get("6.2.1.2.0.00.00")).toBe("DEBITO/ORCAMENTARIO");

    // INVARIANTE 2: NENHUM campo do original mudou
    const depois = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: original.receitaId },
      include: { lancamento: { include: { partidas: true } } },
    });
    expect(depois).toEqual(antes);

    // "já foi anulada?" é DERIVADO da relação
    const comEstornos = await prisma.receitaArrecadada.findUniqueOrThrow({
      where: { id: original.receitaId },
      include: { estornos: { select: { id: true } } },
    });
    expect(comEstornos.estornos.map((e) => e.id)).toEqual([anulacao.receitaId]);
  });

  it("REJEITA anular a mesma receita duas vezes (barreira do serviço)", async () => {
    const original = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);
    await anularArrecadacao({ receitaId: original.receitaId, ...ANULACAO }, deps);

    await expect(
      anularArrecadacao(
        {
          receitaId: original.receitaId,
          ...ANULACAO,
          numeroReceita: "2026RC000099",
        },
        deps
      )
    ).rejects.toThrow(/já foi anulada/);

    expect(await prisma.receitaArrecadada.count()).toBe(2);
  });

  it("DUPLO ESTORNO: o índice único parcial do Postgres rejeita, driblando o adapter", async () => {
    const original = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);
    await anularArrecadacao({ receitaId: original.receitaId, ...ANULACAO }, deps);

    // INSERT direto, sem passar pelo serviço nem pelo recheck da transação.
    // Sob concorrência real, o count da tx pode não ver a outra anulação; o
    // índice único vê sempre.
    let erro: unknown;
    try {
      const lanc = await prisma.lancamentoContabil.create({
        data: {
          numeroControle: "2026RC000098",
          dataTransacao: new Date("2026-03-25T12:00:00Z"),
          historico: "anulação clandestina",
          origemTipo: "ANULACAO_RECEITA",
          criadoPor: "atacante",
          partidas: {
            create: [
              { contaId: "c-caixa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
              { contaId: "c-vpa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
            ],
          },
        },
        select: { id: true },
      });
      await prisma.receitaArrecadada.create({
        data: {
          exercicio: 2026,
          naturezaReceitaId: "nr-iptu",
          fonteId: "fnt-500",
          exercicioFonte: 1,
          tipo: "ANULACAO",
          valor: "1500.00",
          dataArrecadacao: new Date("2026-03-25T12:00:00Z"),
          numeroReceita: "2026RC000098",
          lancamentoId: lanc.id,
          estornoDeId: original.receitaId, // JÁ anulada!
          criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (duplo estorno de receita):\n" + String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_receita_unico|Unique constraint/i);

    // só a anulação legítima existe
    expect(await prisma.receitaArrecadada.count({ where: { tipo: "ANULACAO" } })).toBe(1);
  });

  it("REJEITA anular uma ANULAÇÃO", async () => {
    const original = await registrarArrecadacao(ARRECADACAO, ROTEIRO, deps);
    const anulacao = await anularArrecadacao(
      { receitaId: original.receitaId, ...ANULACAO },
      deps
    );

    await expect(
      anularArrecadacao(
        { receitaId: anulacao.receitaId, ...ANULACAO, numeroReceita: "2026RC000097" },
        deps
      )
    ).rejects.toThrow(/JÁ É uma anulação/);
  });

  it("REJEITA anular receita inexistente", async () => {
    await expect(
      anularArrecadacao({ receitaId: "nao-existe", ...ANULACAO }, deps)
    ).rejects.toThrow(/não encontrada/);
  });
});
