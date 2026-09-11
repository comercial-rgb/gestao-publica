import { describe, expect, it } from "vitest";
import { fimDoDiaCivil, instanteCivil } from "../../packages/datas/index.js";
import {
  contarChecklist,
  estadoDaAuditoria,
  estaSanada,
  prazoVencido,
  respostasVigentes,
  type MovimentoParaEstado,
  type RespostaVigente,
} from "./dominio.js";

const resp = (
  itemId: string,
  resposta: "CONFORME" | "NAO_CONFORME" | "NAO_APLICAVEL",
  quando: Date,
  por = "auditor"
): RespostaVigente => ({ itemId, resposta, observacao: null, criadoEm: quando, criadoPor: por });

describe("M31 — o estado da auditoria é derivado", () => {
  it("t1: sem movimento, ela está ABERTA", () => {
    expect(estadoDaAuditoria([])).toBe("ABERTA");
  });

  it("t2: o ÚLTIMO movimento decide — e 'último' é pela DATA DO FATO", () => {
    // ⚠️ FIXTURE N=2, E AS DATAS INVERTIDAS DE PROPÓSITO. A reabertura foi DIGITADA antes e
    // tem data de fato DEPOIS. Ordenar por `criadoEm` diria "encerrada"; a auditoria está
    // aberta, e foi essa a decisão de quem a reabriu.
    const m: MovimentoParaEstado[] = [
      {
        tipo: "REABERTURA",
        dataMovimento: instanteCivil(2026, 6, 10, 12),
        criadoEm: instanteCivil(2026, 6, 1, 9),
      },
      {
        tipo: "ENCERRAMENTO",
        dataMovimento: instanteCivil(2026, 6, 5, 12),
        criadoEm: instanteCivil(2026, 6, 8, 9),
      },
    ];
    expect(estadoDaAuditoria(m)).toBe("ABERTA");
  });

  it("t3: dois movimentos do MESMO DIA desempatam pelo instante do registro", () => {
    const dia = instanteCivil(2026, 6, 10, 12);
    const m: MovimentoParaEstado[] = [
      { tipo: "REABERTURA", dataMovimento: dia, criadoEm: instanteCivil(2026, 6, 10, 9) },
      { tipo: "ENCERRAMENTO", dataMovimento: dia, criadoEm: instanteCivil(2026, 6, 10, 17) },
    ];
    expect(estadoDaAuditoria(m)).toBe("ENCERRADA");
  });
});

describe("M31 — a resposta do checklist é append-only", () => {
  it("t4: a VIGENTE é a mais recente, e a anterior FICA na lista", () => {
    // ⚠️ N=2 NO MESMO ITEM. É a mudança de "conforme" para "não conforme" que a auditoria
    // precisa conseguir provar que aconteceu — e com uma resposta só não há o que provar.
    const respostas = [
      resp("i1", "CONFORME", instanteCivil(2026, 6, 1, 10)),
      resp("i1", "NAO_CONFORME", instanteCivil(2026, 6, 5, 10)),
    ];
    const vigentes = respostasVigentes(respostas);
    expect(vigentes.get("i1")!.resposta).toBe("NAO_CONFORME");
    expect(respostas).toHaveLength(2); // nada se apagou
  });

  it("t5: a contagem separa PENDENTE de NÃO APLICÁVEL", () => {
    // ⚠️ ITEM SEM RESPOSTA NÃO É "NÃO APLICÁVEL". Somá-los faria um roteiro pela metade
    // parecer examinado por inteiro — e o relatório diria, por omissão, que está tudo certo.
    const vigentes = respostasVigentes([
      resp("i1", "CONFORME", instanteCivil(2026, 6, 1, 10)),
      resp("i2", "NAO_APLICAVEL", instanteCivil(2026, 6, 1, 10)),
    ]);
    const c = contarChecklist(4, vigentes);
    expect(c).toMatchObject({
      total: 4,
      respondidos: 2,
      conformes: 1,
      naoAplicaveis: 1,
      pendentes: 2,
    });
  });
});

describe("M31 — a irregularidade e o prazo", () => {
  it("t6: sem apreciação nenhuma ela NÃO está sanada", () => {
    expect(estaSanada([])).toBe(false);
    expect(estaSanada([{ aceita: null, criadoEm: instanteCivil(2026, 6, 1, 10) }])).toBe(false);
  });

  it("t7: só a ÚLTIMA apreciação conta", () => {
    // N=2: a primeira providência foi recusada, a segunda aceita.
    expect(
      estaSanada([
        { aceita: false, criadoEm: instanteCivil(2026, 6, 1, 10) },
        { aceita: true, criadoEm: instanteCivil(2026, 6, 10, 10) },
      ])
    ).toBe(true);
    // e o contrário também: aceita antes, recusada depois.
    expect(
      estaSanada([
        { aceita: true, criadoEm: instanteCivil(2026, 6, 1, 10) },
        { aceita: false, criadoEm: instanteCivil(2026, 6, 10, 10) },
      ])
    ).toBe(false);
  });

  it("t8: o prazo vale o DIA INTEIRO, e a resposta não depende da hora", () => {
    // ⚠️ "PRAZO VENCIDO" É RÓTULO QUE PRODUZ PROVIDÊNCIA DISCIPLINAR. Comparado como instante
    // em UTC, o prazo de 31/01 venceria às 21:00 do dia 30.
    const prazo = fimDoDiaCivil("2026-01-31");
    for (const hora of [0, 9, 22, 23]) {
      expect(prazoVencido(prazo, instanteCivil(2026, 1, 31, hora, 30)), `às ${hora}h`).toBe(false);
    }
    expect(prazoVencido(prazo, instanteCivil(2026, 2, 1, 0, 30))).toBe(true);
  });
});
