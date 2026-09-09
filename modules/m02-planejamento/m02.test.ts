import { autzQuePermiteTudo } from "../../test/usuarios-teste.js";
import { beforeEach, describe, expect, it } from "vitest";
import { conferirCodigoNaturezaDespesa } from "./dominio.js";
import { criarFicha, criarReceitaPrevista } from "./servico.js";
import type {
  FichaParaPersistir,
  M02Deps,
  ReceitaPrevistaParaPersistir,
} from "./ports.js";
import type { CriarFichaInput } from "./dominio.js";
import {
  CLASSIFICACAO_VALIDA,
  SEED_ACOES,
  SEED_COS,
  SEED_FONTES,
  SEED_FUNCOES,
  SEED_NATUREZAS_DESPESA,
  SEED_NATUREZAS_RECEITA,
  SEED_ORGAOS,
  SEED_PROGRAMAS,
  SEED_SUBFUNCOES,
  SEED_UNIDADES,
} from "./seed-minimo.js";

/**
 * Testes PUROS — fakes das ports, sem banco. Cobrem as barreiras que o M02
 * aplica antes de chegar ao Postgres: forma (Zod), existência dos componentes
 * (fail-closed) e coerência órgão × UO.
 *
 * A unicidade `uq_ficha_sagres` é do BANCO e está em `m02.integracao.test.ts`.
 */

function acharPorCodigo<T extends { id: string; codigo: string }>(
  lista: readonly T[],
  codigo: string
): { id: string } | null {
  const achado = lista.find((x) => x.codigo === codigo);
  return achado === undefined ? null : { id: achado.id };
}

function criarFakes(): {
  deps: M02Deps;
  fichas: FichaParaPersistir[];
  receitas: ReceitaPrevistaParaPersistir[];
} {
  const fichas: FichaParaPersistir[] = [];
  const receitas: ReceitaPrevistaParaPersistir[] = [];
  let seq = 0;

  const deps: M02Deps = {
    // ⚠️ Teste UNITÁRIO (sem banco): stub que deixa passar — ver `autzQuePermiteTudo`.
    autz: autzQuePermiteTudo,
    classificacao: {
      async resolver(c) {
        const uo = SEED_UNIDADES.find((u) => u.codigo === c.unidadeOrc);
        return {
          orgao: acharPorCodigo(SEED_ORGAOS, c.orgao),
          unidadeOrc:
            uo === undefined ? null : { id: uo.id, orgaoId: uo.orgaoId },
          funcao: acharPorCodigo(SEED_FUNCOES, c.funcao),
          subfuncao: acharPorCodigo(SEED_SUBFUNCOES, c.subfuncao),
          programa: acharPorCodigo(SEED_PROGRAMAS, c.programa),
          acao: acharPorCodigo(SEED_ACOES, c.acao),
          naturezaDespesa:
            SEED_NATUREZAS_DESPESA.find(
              (n) => n.codigoCompleto === c.naturezaDespesa
            ) ?? null,
          fonte: acharPorCodigo(SEED_FONTES, c.fonte),
          co: c.co === undefined ? null : acharPorCodigo(SEED_COS, c.co),
        };
      },
      async resolverReceita(c) {
        return {
          naturezaReceita: acharPorCodigo(SEED_NATUREZAS_RECEITA, c.naturezaReceita),
          fonte: acharPorCodigo(SEED_FONTES, c.fonte),
        };
      },
    },
    fichas: {
      async criar(ficha) {
        fichas.push(ficha);
        return `ficha-${++seq}`;
      },
      async buscarPorNumero() {
        return null;
      },
    },
    receitas: {
      async criar(receita) {
        receitas.push(receita);
        return `receita-${++seq}`;
      },
      async reprevisar() {
        return `reprev-${++seq}`;
      },
    },
  };

  return { deps, fichas, receitas };
}

const FICHA_VALIDA: CriarFichaInput = {
  exercicio: 2026,
  numero: 1,
  classificacao: { ...CLASSIFICACAO_VALIDA },
  exercicioFonte: 1,
  valorDotado: "1500000.00",
  criadoPor: "m02@cg.pb.gov.br",
};

describe("M02 — criarFicha (puro, com fakes)", () => {
  let fakes: ReturnType<typeof criarFakes>;
  beforeEach(() => {
    fakes = criarFakes();
  });

  it("cria ficha válida com todos os componentes resolvidos em ids", async () => {
    const id = await criarFicha(FICHA_VALIDA, fakes.deps);

    expect(id).toBe("ficha-1");
    expect(fakes.fichas).toHaveLength(1);

    const f = fakes.fichas[0]!;
    expect(f.exercicio).toBe(2026);
    expect(f.numero).toBe(1);
    expect(f.orgaoId).toBe("org-01");
    expect(f.unidadeOrcId).toBe("uo-01");
    expect(f.funcaoId).toBe("fun-12");
    expect(f.subfuncaoId).toBe("sub-361");
    expect(f.programaId).toBe("prg-0012");
    expect(f.acaoId).toBe("aca-2001");
    expect(f.naturezaDespesaId).toBe("nd-339039");
    expect(f.fonteId).toBe("fnt-500");
    expect(f.coId).toBe("co-0001");
    expect(f.exercicioFonte).toBe(1);
    // dinheiro chegou como Decimal, não como number
    expect(f.valorDotado.toFixed(2)).toBe("1500000.00");
  });

  it("aceita ficha SEM CO (coId é opcional)", async () => {
    const { co: _co, ...semCo } = CLASSIFICACAO_VALIDA;
    await criarFicha(
      { ...FICHA_VALIDA, classificacao: semCo },
      fakes.deps
    );

    expect(fakes.fichas[0]!.coId).toBeUndefined();
  });

  it("REJEITA ficha faltando componente obrigatório (sem naturezaDespesa)", async () => {
    const { naturezaDespesa: _nd, ...incompleta } = CLASSIFICACAO_VALIDA;

    await expect(
      criarFicha(
        // @ts-expect-error INVARIANTE 5: componente obrigatório ausente é rejeitado.
        { ...FICHA_VALIDA, classificacao: incompleta },
        fakes.deps
      )
    ).rejects.toThrow();

    expect(fakes.fichas).toHaveLength(0);
  });

  it("REJEITA componente que NÃO existe no plano (fail-closed, nada é criado)", async () => {
    await expect(
      criarFicha(
        {
          ...FICHA_VALIDA,
          classificacao: { ...CLASSIFICACAO_VALIDA, funcao: "99" },
        },
        fakes.deps
      )
    ).rejects.toThrow(/inexistente.*funcao="99"/s);

    expect(fakes.fichas).toHaveLength(0);
  });

  it("REJEITA CO informado que não existe (opcional não significa qualquer coisa)", async () => {
    await expect(
      criarFicha(
        {
          ...FICHA_VALIDA,
          classificacao: { ...CLASSIFICACAO_VALIDA, co: "9999" },
        },
        fakes.deps
      )
    ).rejects.toThrow(/inexistente.*co="9999"/s);
  });

  it("REJEITA valorDotado negativo", async () => {
    await expect(
      criarFicha({ ...FICHA_VALIDA, valorDotado: "-1.00" }, fakes.deps)
    ).rejects.toThrow(/negativo/i);

    expect(fakes.fichas).toHaveLength(0);
  });

  it("REJEITA dinheiro como number (regra de ouro)", async () => {
    await expect(
      // @ts-expect-error INVARIANTE 1: dinheiro NUNCA é number.
      criarFicha({ ...FICHA_VALIDA, valorDotado: 1500000 }, fakes.deps)
    ).rejects.toThrow();
  });

  it("ACEITA quando orgao.codigo é o prefixo de 2 dígitos da UO (01 / 01001)", async () => {
    await criarFicha(
      {
        ...FICHA_VALIDA,
        classificacao: { ...CLASSIFICACAO_VALIDA, orgao: "01", unidadeOrc: "01001" },
      },
      fakes.deps
    );

    expect(fakes.fichas).toHaveLength(1);
    expect(fakes.fichas[0]!.orgaoId).toBe("org-01");
  });

  it("REJEITA quando orgao.codigo NÃO é o prefixo da UO (02 / 01001) — antes de tocar o banco", async () => {
    await expect(
      criarFicha(
        {
          ...FICHA_VALIDA,
          classificacao: { ...CLASSIFICACAO_VALIDA, orgao: "02", unidadeOrc: "01001" },
        },
        fakes.deps
      )
    ).rejects.toThrow(/não é o prefixo da UO/);

    expect(fakes.fichas).toHaveLength(0);
  });

  it("REJEITA órgão incoerente com a UO (o órgão na ficha é denormalizado)", async () => {
    const deps: M02Deps = {
      ...fakes.deps,
      classificacao: {
        ...fakes.deps.classificacao,
        async resolver(c) {
          const base = await fakes.deps.classificacao.resolver(c);
          // a UO pertence a OUTRO órgão que não o declarado na ficha
          return { ...base, unidadeOrc: { id: "uo-01", orgaoId: "org-99" } };
        },
      },
    };

    await expect(criarFicha(FICHA_VALIDA, deps)).rejects.toThrow(
      /Órgão incoerente com a unidade orçamentária/
    );

    expect(fakes.fichas).toHaveLength(0);
  });
});

describe("M02 — criarReceitaPrevista (puro, com fakes)", () => {
  let fakes: ReturnType<typeof criarFakes>;
  beforeEach(() => {
    fakes = criarFakes();
  });

  it("cria receita prevista válida", async () => {
    const id = await criarReceitaPrevista(
      {
        exercicio: 2026,
        naturezaReceita: "11121101",
        fonte: "500",
        exercicioFonte: 1,
        tipoReceita: "ORCAMENTARIA",
        valorPrevisto: "8000000.00",
        criadoPor: "m02@cg.pb.gov.br",
      },
      fakes.deps
    );

    expect(id).toBe("receita-1");
    const r = fakes.receitas[0]!;
    expect(r.naturezaReceitaId).toBe("nr-11121101");
    expect(r.fonteId).toBe("fnt-500");
    expect(r.tipoReceita).toBe("ORCAMENTARIA");
    expect(r.valorPrevisto.toFixed(2)).toBe("8000000.00");
  });

  it("REJEITA natureza de receita inexistente", async () => {
    await expect(
      criarReceitaPrevista(
        {
          exercicio: 2026,
          naturezaReceita: "99999999",
          fonte: "500",
          tipoReceita: "ORCAMENTARIA",
          valorPrevisto: "1000.00",
          criadoPor: "m02@cg.pb.gov.br",
        },
        fakes.deps
      )
    ).rejects.toThrow(/inexistente.*naturezaReceita="99999999"/s);

    expect(fakes.receitas).toHaveLength(0);
  });

  it("REJEITA valorPrevisto negativo", async () => {
    await expect(
      criarReceitaPrevista(
        {
          exercicio: 2026,
          naturezaReceita: "11121101",
          fonte: "500",
          tipoReceita: "ORCAMENTARIA",
          valorPrevisto: "-0.01",
          criadoPor: "m02@cg.pb.gov.br",
        },
        fakes.deps
      )
    ).rejects.toThrow(/negativo/i);
  });
});

describe("M02 — coerência da natureza da despesa (4 componentes)", () => {
  it("aceita quando os 4 componentes formam o codigoCompleto", () => {
    expect(() =>
      conferirCodigoNaturezaDespesa(SEED_NATUREZAS_DESPESA[0])
    ).not.toThrow();
  });

  it("REJEITA quando codigoCompleto diverge dos componentes", () => {
    expect(() =>
      conferirCodigoNaturezaDespesa({
        codCategoria: "3",
        codNatureza: "3",
        codModalidade: "90",
        codElemento: "39",
        codigoCompleto: "449052", // divergente
      })
    ).toThrow(/incoerente.*339039.*449052/s);
  });
});
