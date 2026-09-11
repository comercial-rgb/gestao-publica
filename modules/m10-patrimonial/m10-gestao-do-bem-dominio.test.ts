import { describe, expect, it } from "vitest";
import {
  CAMPO_OBRIGATORIO_DO_TIPO,
  TIPO_DO_ESTORNO_DE_GESTAO,
  comissaoVigenteEm,
  divergenciasDoInventario,
  estadoDoBemEm,
  type MovimentoDeGestaoParaLeitura,
  type TipoMovimentoDeGestao,
} from "./gestao-do-bem-dominio.js";

/**
 * ═══ O ESTADO DO BEM É DERIVADO — REGIME DE PROFUNDIDADE (decisão D4) ═══
 *
 * ⚠️ A 5.19.20 pede "seu estado e localização **atual (no momento do inventário)**". O
 * parêntese é um eixo temporal escrito por extenso, e é ele que este arquivo prova.
 */

/** 23h50 de 31/12 CIVIS do ente = 02h50 de 01/01 em UTC. A hora de borda. */
const BORDA = new Date("2027-01-01T02:50:00.000Z");

let seq = 0;
function mov(
  tipo: TipoMovimentoDeGestao,
  dataMovimento: Date,
  campos: Partial<MovimentoDeGestaoParaLeitura> = {}
): MovimentoDeGestaoParaLeitura {
  seq += 1;
  return {
    id: `m${seq}`,
    tipo,
    dataMovimento,
    criadoEm: new Date(2026, 0, seq),
    localizacaoId: null,
    responsavelId: null,
    estado: null,
    situacao: null,
    unidadeOrcId: null,
    estornoDeId: null,
    ...campos,
  };
}

describe("os Records exaustivos", () => {
  it("todo tipo base tem estorno; nenhum estorno tem estorno", () => {
    for (const [tipo, estorno] of Object.entries(TIPO_DO_ESTORNO_DE_GESTAO)) {
      if (tipo.startsWith("ESTORNO_")) expect(estorno).toBeNull();
      else expect(estorno, `${tipo} ficou sem estorno`).not.toBeNull();
    }
  });

  it("todo tipo base declara qual campo ele obriga", () => {
    for (const [tipo, campo] of Object.entries(CAMPO_OBRIGATORIO_DO_TIPO)) {
      if (tipo.startsWith("ESTORNO_")) expect(campo).toBeNull();
      else expect(campo, `${tipo} não declarou campo obrigatório`).not.toBeNull();
    }
  });
});

describe("D4 · o estado do bem é o último movimento de cada tipo ATÉ UMA DATA", () => {
  const ms = [
    mov("LOCALIZACAO", new Date("2026-03-01T12:00:00Z"), { localizacaoId: "sala-1" }),
    mov("RESPONSAVEL", new Date("2026-03-01T12:00:00Z"), { responsavelId: "p-ana" }),
    mov("LOCALIZACAO", new Date("2026-08-10T12:00:00Z"), { localizacaoId: "sala-2" }),
    mov("ESTADO", new Date("2026-08-10T12:00:00Z"), { estado: "REGULAR" }),
  ];

  it("caracterização: hoje é o último de cada eixo", () => {
    const e = estadoDoBemEm(ms);
    expect(e.localizacaoId).toBe("sala-2");
    expect(e.responsavelId).toBe("p-ana");
    expect(e.estado).toBe("REGULAR");
  });

  it("⚠️ em 31/07 o bem ainda estava na sala-1, e sem estado registrado", () => {
    const e = estadoDoBemEm(ms, "2026-07-31");
    expect(
      e.localizacaoId,
      "a localização de julho veio como a de agosto — a leitura está respondendo 'hoje' " +
        "a uma pergunta que tem data, que é exatamente o defeito que a coluna teria"
    ).toBe("sala-1");
    expect(e.estado).toBeNull();
  });

  it("⚠️ BORDA: o movimento das 23h50 de 31/12 conta para 31/12", () => {
    const comBorda = [
      ...ms,
      mov("LOCALIZACAO", BORDA, { localizacaoId: "sala-3" }),
    ];
    expect(estadoDoBemEm(comBorda, "2026-12-31").localizacaoId).toBe("sala-3");
    expect(estadoDoBemEm(comBorda, "2026-12-30").localizacaoId).toBe("sala-2");
  });

  it("⚠️ O ESTORNO ANULA — não é 'mais um movimento no fim da fila'", () => {
    const ultimo = mov("LOCALIZACAO", new Date("2026-09-01T12:00:00Z"), {
      localizacaoId: "sala-9",
    });
    const comEstorno = [
      ...ms,
      ultimo,
      mov("ESTORNO_LOCALIZACAO", new Date("2026-09-02T12:00:00Z"), {
        localizacaoId: "sala-9",
        estornoDeId: ultimo.id,
      }),
    ];
    expect(
      estadoDoBemEm(comEstorno).localizacaoId,
      "o estorno foi tratado como movimento comum e reafirmou a sala que ele desfez — " +
        "é o contrário do que estornar significa"
    ).toBe("sala-2");
  });

  it("dois movimentos do mesmo dia desempatam pelo criadoEm", () => {
    const a = mov("LOCALIZACAO", new Date("2026-10-01T12:00:00Z"), { localizacaoId: "sala-a" });
    const b = {
      ...mov("LOCALIZACAO", new Date("2026-10-01T12:00:00Z"), { localizacaoId: "sala-b" }),
      criadoEm: new Date(2026, 11, 31),
    };
    expect(estadoDoBemEm([a, b]).localizacaoId).toBe("sala-b");
  });

  it("a unidade gestora vem da ENTRADA da transferência, não da saída", () => {
    const e = estadoDoBemEm([
      mov("TRANSFERENCIA_SAIDA", new Date("2026-05-01T12:00:00Z"), { unidadeOrcId: "uo-1" }),
      mov("TRANSFERENCIA_ENTRADA", new Date("2026-05-01T12:00:00Z"), { unidadeOrcId: "uo-2" }),
    ]);
    expect(e.unidadeOrcId).toBe("uo-2");
  });
});

describe("5.19.16 · a comissão vigente naquele dia", () => {
  const c = {
    vigenciaInicio: new Date("2026-03-01T12:00:00Z"),
    vigenciaFim: new Date("2026-12-31T12:00:00Z"),
  };

  it("⚠️ BORDAS INCLUSIVAS: começa e termina valendo no próprio dia", () => {
    expect(comissaoVigenteEm(c, "2026-03-01")).toBe(true);
    expect(comissaoVigenteEm(c, "2026-12-31")).toBe(true);
    expect(comissaoVigenteEm(c, "2026-02-28")).toBe(false);
    expect(comissaoVigenteEm(c, "2027-01-01")).toBe(false);
  });

  it("sem fim declarado, ela segue vigente", () => {
    expect(comissaoVigenteEm({ ...c, vigenciaFim: null }, "2030-01-01")).toBe(true);
  });
});

describe("5.19.21 · a divergência do inventário é derivada", () => {
  const esperado = {
    "bem-1": { localizacaoId: "sala-1", responsavelId: null, estado: "BOM" as const, situacao: null, unidadeOrcId: null },
    "bem-2": { localizacaoId: "sala-1", responsavelId: null, estado: null, situacao: null, unidadeOrcId: null },
    "bem-3": { localizacaoId: null, responsavelId: null, estado: null, situacao: null, unidadeOrcId: null },
  };
  const em = (id: string) => esperado[id as keyof typeof esperado];

  it("bem não encontrado é o primeiro achado", () => {
    const d = divergenciasDoInventario(
      [{ bemId: "bem-1", encontrado: false, localizacaoObservadaId: null, estadoObservado: null }],
      em
    );
    expect(d).toHaveLength(1);
    expect(d[0]?.motivo).toBe("NAO_ENCONTRADO");
  });

  it("local diferente e estado diferente são achados separados", () => {
    const d = divergenciasDoInventario(
      [{ bemId: "bem-1", encontrado: true, localizacaoObservadaId: "sala-9", estadoObservado: "RUIM" }],
      em
    );
    expect(d.map((x) => x.motivo)).toEqual(["LOCAL_DIFERENTE", "ESTADO_DIFERENTE"]);
  });

  it("bem no lugar certo não é divergência", () => {
    const d = divergenciasDoInventario(
      [{ bemId: "bem-2", encontrado: true, localizacaoObservadaId: "sala-1", estadoObservado: null }],
      em
    );
    expect(d).toEqual([]);
  });

  it("⚠️ bem SEM registro anterior é ACHADO, não silêncio", () => {
    // É o caso que o primeiro inventário existe para descobrir: o acervo que o sistema
    // nunca soube onde estava. Silenciá-lo esconderia justamente o que se foi procurar.
    const d = divergenciasDoInventario(
      [{ bemId: "bem-3", encontrado: true, localizacaoObservadaId: "sala-7", estadoObservado: null }],
      em
    );
    expect(d).toHaveLength(1);
    expect(d[0]?.motivo).toBe("SEM_REGISTRO_ANTERIOR");
    expect(d[0]?.observado).toBe("sala-7");
  });
});
