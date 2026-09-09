import { autzQuePermiteTudo } from "../../test/usuarios-teste.js";
import { beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import type { LancamentoContabil } from "../../packages/ledger/index.js";
import { estornarLancamento, registrarLancamento } from "./servico.js";
import type { RegistrarLancamentoInput } from "./dominio.js";
import type {
  ContaResolvida,
  LancamentoParaPersistir,
  M01Deps,
} from "./ports.js";

/**
 * Fakes em memória das ports — SEED MÍNIMO do PCASP, só o necessário para os
 * testes (o plano completo vem como tarefa de dados separada).
 *
 * O serviço só conhece as ports, então o caso de uso inteiro — incluindo a
 * barreira "conta tem que ser analítica" — é exercitável sem Postgres.
 */

const SEED_PCASP: readonly ContaResolvida[] = [
  { id: "c-caixa", codigo: "1.1.1.1.1.00.00", analitica: true, naturezaSaldo: "DEVEDORA" },
  { id: "c-bancos", codigo: "1.1.1.1.2.00.00", analitica: true, naturezaSaldo: "DEVEDORA" },
  // ⚠️ ERA `c-iptu` com o código 6.2.1.1.0.00.00 — uma conta de classe 6
  // (ORÇAMENTÁRIA) usada como crédito PATRIMONIAL a receber. O guard de natureza
  // de informação pegou. O crédito tributário é ATIVO: classe 1, DEVEDORA.
  { id: "c-iptu", codigo: "1.1.2.2.1.00.00", analitica: true, naturezaSaldo: "DEVEDORA" },
  { id: "c-passivo", codigo: "2.1.1.1.0.00.00", analitica: true, naturezaSaldo: "CREDORA" },
  // As duas de controle orçamentário CONTINUAM existindo — o que estava errado era
  // usá-las em perna patrimonial, não elas.
  { id: "c-rec-realizar", codigo: "6.2.1.1.0.00.00", analitica: true, naturezaSaldo: "CREDORA" },
  { id: "c-rec-realizada", codigo: "6.2.1.2.0.00.00", analitica: true, naturezaSaldo: "CREDORA" },
  // SINTÉTICA — nível de agregação, NÃO recebe partida (INVARIANTE 5).
  { id: "c-caixa-eq", codigo: "1.1.1.0.0.00.00", analitica: false, naturezaSaldo: "DEVEDORA" },
];

function criarFakes(): {
  deps: M01Deps;
  persistidos: LancamentoParaPersistir[];
  banco: Map<string, LancamentoContabil>;
} {
  const persistidos: LancamentoParaPersistir[] = [];
  const banco = new Map<string, LancamentoContabil>();
  let seq = 0;

  const deps: M01Deps = {
    // ⚠️ Teste UNITÁRIO (sem banco): a autorização é um stub que deixa passar, e ela está
    // ESCRITA. Quem prova a autorização de verdade é a suíte de integração, com o cadastro.
    autz: autzQuePermiteTudo,
    contas: {
      async buscarPorCodigos(codigos) {
        return SEED_PCASP.filter((c) => codigos.includes(c.codigo));
      },
    },
    lancamentos: {
      async persistir(lancamento) {
        // INVARIANTE 5 no adapter: nenhuma partida em conta sintética.
        const porId = new Map(SEED_PCASP.map((c) => [c.id, c]));
        const sinteticas = lancamento.partidas
          .map((p) => porId.get(p.contaId))
          .filter((c) => c !== undefined && !c.analitica);
        if (sinteticas.length > 0) {
          throw new Error(
            `Conta sintética não recebe partida: ` +
              `${sinteticas.map((c) => c!.codigo).join(", ")}.`
          );
        }

        persistidos.push(lancamento);

        banco.set(lancamento.id, {
          id: lancamento.id,
          numeroControle: lancamento.numeroControle,
          partidas: lancamento.partidas.map((p) => ({
            conta: porId.get(p.contaId)!.codigo,
            tipo: p.tipo,
            subsistema: p.subsistema,
            valor: p.valor,
          })),
          dataTransacao: lancamento.dataTransacao,
          historico: lancamento.historico,
          ...(lancamento.estornoDeId !== undefined
            ? { estornoDeId: lancamento.estornoDeId }
            : {}),
          estornos: [],
        });

        // `estornos` é DERIVADO: gravar um estorno faz o original passar a
        // enxergá-lo. Imita a relação 1-N do Prisma — não é UPDATE de campo de
        // negócio do original, que segue append-only (INVARIANTE 3).
        if (lancamento.estornoDeId !== undefined) {
          const original = banco.get(lancamento.estornoDeId);
          if (original !== undefined) {
            banco.set(original.id, {
              ...original,
              estornos: [...original.estornos, lancamento.id],
            });
          }
        }

        return lancamento.id;
      },
      async buscar(id) {
        return banco.get(id) ?? null;
      },
    },
    ids: {
      novo: () => `lanc-${String(++seq).padStart(3, "0")}`,
    },
  };

  return { deps, persistidos, banco };
}

const LANCAMENTO_VALIDO: RegistrarLancamentoInput = {
  numeroControle: "2026NL000001",
  dataTransacao: new Date("2026-07-01T12:00:00Z"),
  historico: "Arrecadação de IPTU",
  origemTipo: "ARRECADACAO",
  origemId: "arr-42",
  criadoPor: "usuario@cg.pb.gov.br",
  partidas: [
    { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
    { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
  ],
};

describe("M01 — registrarLancamento", () => {
  let fakes: ReturnType<typeof criarFakes>;
  beforeEach(() => {
    fakes = criarFakes();
  });

  it("aceita lançamento balanceado com múltiplas pernas (2 débitos + 1 crédito)", async () => {
    const id = await registrarLancamento(
      {
        ...LANCAMENTO_VALIDO,
        partidas: [
          { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "750.50" },
          { conta: "1.1.1.1.2.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "249.50" },
          { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
        ],
      },
      fakes.deps
    );

    expect(fakes.persistidos).toHaveLength(1);
    const persistido = fakes.persistidos[0]!;
    expect(persistido.id).toBe(id);
    // código PCASP resolvido para contaId
    expect(
      persistido.partidas.map((p) => [p.contaId, p.tipo, p.valor.toFixed(2)])
    ).toEqual([
      ["c-caixa", "DEBITO", "750.50"],
      ["c-bancos", "DEBITO", "249.50"],
      ["c-iptu", "CREDITO", "1000.00"],
    ]);
  });

  it("REJEITA pernas que NÃO somam (ΣDEBITO != ΣCREDITO) e não persiste nada", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "750.50" },
            { conta: "1.1.1.1.2.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "249.50" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "999.99" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/desbalanceado/i);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA lançamento sem nenhum crédito", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "500.00" },
            { conta: "1.1.1.1.2.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "500.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/partida simples/i);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA lançamento sem nenhum débito", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "500.00" },
            { conta: "2.1.1.1.0.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "500.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/partida simples/i);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA valor <= 0", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "0.00" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "0.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/valor deve ser > 0/);

    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "-10.00" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "-10.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/valor deve ser > 0/);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA partida em conta SINTÉTICA (analitica=false) — fail-closed", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            { conta: "1.1.1.0.0.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/sintética não recebe partida.*1\.1\.1\.0\.0\.00\.00/s);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA conta inexistente no plano (nunca cria implicitamente)", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            // ⚠️ CLASSE VÁLIDA, CONTA INEXISTENTE — e a diferença importa. Este teste
            // prova que o ADAPTER recusa conta fora do plano; com o antigo
            // `9.9.9.9.9.99.99` quem recusava passou a ser o MOTOR ("classe 9
            // desconhecida"), e o teste ficaria verde provando outra coisa.
            { conta: "1.9.9.9.9.99.99", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow(/inexistente.*1.9.9.9.9.99.99/s);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("REJEITA dinheiro como number (regra de ouro: Decimal sempre)", async () => {
    await expect(
      registrarLancamento(
        {
          ...LANCAMENTO_VALIDO,
          partidas: [
            // @ts-expect-error INVARIANTE 1: dinheiro NUNCA é number — zMoney rejeita.
            { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: 1500 },
            { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1500.00" },
          ],
        },
        fakes.deps
      )
    ).rejects.toThrow();

    expect(fakes.persistidos).toHaveLength(0);
  });
});

describe("M01 — estornarLancamento", () => {
  let fakes: ReturnType<typeof criarFakes>;
  beforeEach(() => {
    fakes = criarFakes();
  });

  it("gera lançamento NOVO com pernas invertidas; original permanece intacto", async () => {
    const idOriginal = await registrarLancamento(LANCAMENTO_VALIDO, fakes.deps);
    const originalAntes = structuredCloneLancamento(
      fakes.persistidos[0]!
    );

    const idEstorno = await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2026NL000099",
        dataEstorno: new Date("2026-07-05T12:00:00Z"),
        criadoPor: "usuario@cg.pb.gov.br",
      },
      fakes.deps
    );

    // registro NOVO — o original não foi substituído
    expect(fakes.persistidos).toHaveLength(2);
    const estorno = fakes.persistidos[1]!;
    expect(estorno.id).toBe(idEstorno);
    expect(idEstorno).not.toBe(idOriginal);
    expect(estorno.estornoDeId).toBe(idOriginal);
    expect(estorno.origemTipo).toBe("ESTORNO");
    expect(estorno.historico).toMatch(/^ESTORNO de 2026NL000001:/);

    // mesma conta, mesmo valor, tipo INVERTIDO
    expect(
      estorno.partidas.map((p) => [p.contaId, p.tipo, p.valor.toFixed(2)])
    ).toEqual([
      ["c-caixa", "CREDITO", "1500.00"],
      ["c-iptu", "DEBITO", "1500.00"],
    ]);

    // INVARIANTE 3: NENHUM campo do original foi alterado
    expect(structuredCloneLancamento(fakes.persistidos[0]!)).toEqual(
      originalAntes
    );
  });

  it("REJEITA duplo estorno (lido de `estornos`, não de campo mutável)", async () => {
    const idOriginal = await registrarLancamento(LANCAMENTO_VALIDO, fakes.deps);

    await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2026NL000099",
        dataEstorno: new Date("2026-07-05T12:00:00Z"),
        criadoPor: "usuario@cg.pb.gov.br",
      },
      fakes.deps
    );

    await expect(
      estornarLancamento(
        {
          lancamentoId: idOriginal,
          numeroControleEstorno: "2026NL000100",
          dataEstorno: new Date("2026-07-06T12:00:00Z"),
          criadoPor: "usuario@cg.pb.gov.br",
        },
        fakes.deps
      )
    ).rejects.toThrow(/já foi estornado/);

    expect(fakes.persistidos).toHaveLength(2);
  });

  it("REJEITA estornar lançamento inexistente", async () => {
    await expect(
      estornarLancamento(
        {
          lancamentoId: "nao-existe",
          numeroControleEstorno: "2026NL000099",
          dataEstorno: new Date("2026-07-05T12:00:00Z"),
          criadoPor: "usuario@cg.pb.gov.br",
        },
        fakes.deps
      )
    ).rejects.toThrow(/não encontrado/);

    expect(fakes.persistidos).toHaveLength(0);
  });

  it("o estorno de um multi-subsistema fecha em cada subsistema", async () => {
    const idOriginal = await registrarLancamento(
      {
        ...LANCAMENTO_VALIDO,
        partidas: [
          { conta: "1.1.1.1.1.00.00", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "800.00" },
          { conta: "1.1.2.2.1.00.00", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "800.00" },
          // ⚠️ A perna ORÇAMENTÁRIA creditava `1.1.1.1.2.00.00` (Bancos, classe 1):
          // o inverso do outro padrão — conta patrimonial rotulada ORCAMENTARIO. As
          // duas pernas orçamentárias são o par da arrecadação (a realizar → realizada).
          { conta: "6.2.1.1.0.00.00", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "800.00" },
          { conta: "6.2.1.2.0.00.00", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "800.00" },
        ],
      },
      fakes.deps
    );

    const idEstorno = await estornarLancamento(
      {
        lancamentoId: idOriginal,
        numeroControleEstorno: "2026NL000099",
        dataEstorno: new Date("2026-07-05T12:00:00Z"),
        criadoPor: "usuario@cg.pb.gov.br",
      },
      fakes.deps
    );

    const estorno = fakes.banco.get(idEstorno)!;
    for (const subsistema of ["PATRIMONIAL", "ORCAMENTARIO"] as const) {
      const doSub = estorno.partidas.filter((p) => p.subsistema === subsistema);
      const debitos = doSub.filter((p) => p.tipo === "DEBITO");
      const creditos = doSub.filter((p) => p.tipo === "CREDITO");
      expect(debitos).toHaveLength(1);
      expect(creditos).toHaveLength(1);
      expect(debitos[0]!.valor.equals(creditos[0]!.valor)).toBe(true);
    }

    expect(estorno.partidas.every((p) => p.valor.equals(toMoney("800.00")))).toBe(
      true
    );
  });
});

/** Decimal não é clonável por structuredClone — snapshot em primitivos. */
function structuredCloneLancamento(l: LancamentoParaPersistir) {
  return {
    id: l.id,
    numeroControle: l.numeroControle,
    dataTransacao: l.dataTransacao.toISOString(),
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId,
    estornoDeId: l.estornoDeId,
    criadoPor: l.criadoPor,
    partidas: l.partidas.map((p) => ({
      contaId: p.contaId,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
    })),
  };
}
