import { describe, expect, it } from "vitest";
import {
  apensosDe,
  codigoVerificador,
  descreverSituacao,
  estaFechado,
  inicioDaContagem,
  movimentosVigentes,
  principalDoApenso,
  setorAtual,
  situacaoDaTaxa,
  situacaoDePrazo,
  situacaoDoProcesso,
  type MovimentoParaDerivar,
  type TipoDeMovimento,
} from "./dominio.js";

/**
 * M21 — O DOMÍNIO PURO. Sem banco, sem relógio: só a aritmética da situação.
 *
 * ⚠️ OS VALORES ESPERADOS FORAM ESCRITOS ANTES DE RODAR. Um teste cujo esperado sai da
 * primeira execução não testa nada: ele registra o que o código faz, inclusive quando o
 * que o código faz está errado.
 */

const T0 = new Date("2026-03-02T09:00:00Z");
let seq = 0;

function mov(
  tipo: TipoDeMovimento,
  extra: Partial<MovimentoParaDerivar> = {}
): MovimentoParaDerivar {
  seq += 1;
  return {
    id: extra.id ?? `m${seq}`,
    tipo,
    criadoEm: extra.criadoEm ?? new Date(T0.getTime() + seq * 60_000),
    ...extra,
  };
}

describe("M21 — a situação DERIVADA do processo", () => {
  it("t1: processo sem movimento nenhum está ABERTO", () => {
    expect(situacaoDoProcesso([])).toBe("ABERTO");
  });

  it("t2: trâmite deixa EM_TRAMITE; o recebimento é que põe EM_ANALISE", () => {
    const t = mov("TRAMITE", { setorDestinoId: "s2" });
    expect(situacaoDoProcesso([t])).toBe("EM_TRAMITE");
    expect(situacaoDoProcesso([t, mov("RECEBIMENTO")])).toBe("EM_ANALISE");
  });

  it("t3: DOIS pareceres pedidos e UM respondido continua AGUARDANDO_PARECER", () => {
    // ⚠️ É AQUI QUE "O ÚLTIMO MOVIMENTO MANDA" QUEBRARIA. Contando só o último, a
    // resposta ao segundo pedido devolveria o processo a EM_ANALISE com o primeiro
    // parecer ainda pendente — e o setor consultado ficaria esperando para sempre,
    // sem que o processo dissesse que o espera.
    const p1 = mov("PARECER_SOLICITADO", { id: "p1" });
    const p2 = mov("PARECER_SOLICITADO", { id: "p2" });
    const r2 = mov("PARECER_RESPONDIDO", { respondeAId: "p2" });
    expect(situacaoDoProcesso([p1, p2, r2])).toBe("AGUARDANDO_PARECER");

    const r1 = mov("PARECER_RESPONDIDO", { respondeAId: "p1" });
    expect(situacaoDoProcesso([p1, p2, r2, r1])).toBe("EM_ANALISE");
  });

  it("t4: readequação segue a mesma conta de pendências", () => {
    const s = mov("READEQUACAO_SOLICITADA", { id: "r1" });
    expect(situacaoDoProcesso([s])).toBe("AGUARDANDO_READEQUACAO");
    expect(
      situacaoDoProcesso([s, mov("READEQUACAO_ATENDIDA", { respondeAId: "r1" })])
    ).toBe("EM_ANALISE");
  });

  it("t5: encerrar, arquivar e reabrir — e reabrir volta para EM_ANALISE", () => {
    const enc = mov("ENCERRAMENTO");
    const arq = mov("ARQUIVAMENTO");
    expect(situacaoDoProcesso([enc])).toBe("ENCERRADO");
    expect(situacaoDoProcesso([enc, arq])).toBe("ARQUIVADO");
    expect(situacaoDoProcesso([enc, arq, mov("REABERTURA")])).toBe("EM_ANALISE");
  });

  it("t6: o par TORNADO_SEM_EFEITO some da derivação — os DOIS movimentos", () => {
    const t = mov("TRAMITE", { id: "t1", setorDestinoId: "s2" });
    const anula = mov("TORNADO_SEM_EFEITO", { id: "a1", tornaSemEfeitoId: "t1" });

    const vigentes = movimentosVigentes([t, anula]);
    expect(vigentes).toHaveLength(0);
    // Sem o processo voltar a ABERTO, o trâmite anulado continuaria "movendo" o
    // documento — e o setor destino veria na caixa um processo que ninguém lhe mandou.
    expect(situacaoDoProcesso([t, anula])).toBe("ABERTO");
    expect(setorAtual("s1", [t, anula])).toBe("s1");
  });

  it("t7: o setor atual segue o ÚLTIMO trâmite vigente", () => {
    const t1 = mov("TRAMITE", { setorDestinoId: "s2" });
    const t2 = mov("TRAMITE", { setorDestinoId: "s3" });
    expect(setorAtual("s1", [])).toBe("s1");
    expect(setorAtual("s1", [t1])).toBe("s2");
    expect(setorAtual("s1", [t1, t2])).toBe("s3");
  });

  it("t8: fechado é encerrado, arquivado ou cancelado — e só isso", () => {
    expect(estaFechado("ENCERRADO")).toBe(true);
    expect(estaFechado("ARQUIVADO")).toBe(true);
    expect(estaFechado("CANCELADO")).toBe(true);
    expect(estaFechado("PARALISADO")).toBe(false);
    expect(estaFechado("AGUARDANDO_PARECER")).toBe(false);
    // O rótulo é de negócio, sem identificador de catálogo.
    expect(descreverSituacao("AGUARDANDO_READEQUACAO")).toBe(
      "Aguardando readequação do requerente"
    );
  });
});

describe("M21 — o PRAZO conta do recebimento", () => {
  const RECEBIDO = new Date("2026-03-02T12:00:00Z");

  it("t9: sem recebimento não há contagem — e sem contagem não há atraso", () => {
    expect(inicioDaContagem([mov("TRAMITE", { setorDestinoId: "s2" })])).toBeNull();
    expect(situacaoDePrazo(null, 5, new Date("2026-12-31T00:00:00Z"))).toBe("SEM_PRAZO");
  });

  it("t10: no prazo, próximo do fim e atrasado — nas três faixas", () => {
    // Prazo de 10 dias a partir de 02/03 12:00 -> vence em 12/03 12:00.
    // Aviso = 20% de 10 dias = 2 dias -> a partir de 10/03 12:00.
    expect(situacaoDePrazo(RECEBIDO, 10, new Date("2026-03-05T12:00:00Z"))).toBe("NO_PRAZO");
    expect(situacaoDePrazo(RECEBIDO, 10, new Date("2026-03-11T12:00:00Z"))).toBe("PROXIMO_DO_FIM");
    expect(situacaoDePrazo(RECEBIDO, 10, new Date("2026-03-13T12:00:00Z"))).toBe("ATRASADO");
  });

  it("t11: o piso de UM DIA no aviso — 20% de 2 dias seriam 9,6 horas", () => {
    // Prazo de 2 dias -> vence 04/03 12:00. Sem o piso, o aviso só começaria às
    // 02:24 de 04/03 — tarde demais para quem trabalha em dias, não em horas.
    expect(situacaoDePrazo(RECEBIDO, 2, new Date("2026-03-03T13:00:00Z"))).toBe("PROXIMO_DO_FIM");
  });

  it("t12: o último recebimento é que conta, não o primeiro", () => {
    const r1 = mov("RECEBIMENTO", { criadoEm: new Date("2026-03-02T12:00:00Z") });
    const t = mov("TRAMITE", { criadoEm: new Date("2026-03-04T12:00:00Z"), setorDestinoId: "s3" });
    const r2 = mov("RECEBIMENTO", { criadoEm: new Date("2026-03-05T12:00:00Z") });
    expect(inicioDaContagem([r1, t, r2])?.toISOString()).toBe("2026-03-05T12:00:00.000Z");
  });
});

describe("M21 — taxa, apensamento e código verificador", () => {
  it("t13: taxa nasce EM_ABERTO; o último movimento decide", () => {
    expect(situacaoDaTaxa([])).toBe("EM_ABERTO");
    expect(situacaoDaTaxa([{ tipo: "PAGAMENTO", criadoEm: T0 }])).toBe("PAGA");
    expect(
      situacaoDaTaxa([
        { tipo: "CANCELAMENTO", criadoEm: T0 },
        { tipo: "PAGAMENTO", criadoEm: new Date(T0.getTime() + 1000) },
      ])
    ).toBe("PAGA");
  });

  it("t14: apensar e desapensar — o último movimento do PAR manda", () => {
    const ap = {
      processoPrincipalId: "P1",
      processoApensoId: "P2",
      tipo: "APENSADO" as const,
      criadoEm: T0,
    };
    expect(principalDoApenso("P2", [ap])).toBe("P1");
    expect(apensosDe("P1", [ap])).toEqual(["P2"]);

    const des = { ...ap, tipo: "DESAPENSADO" as const, criadoEm: new Date(T0.getTime() + 1000) };
    expect(principalDoApenso("P2", [ap, des])).toBeNull();
    expect(apensosDe("P1", [ap, des])).toEqual([]);
  });

  it("t15: o código verificador tem 10 símbolos e NÃO usa 0/O/1/I/L", () => {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) bytes[i] = i * 13;
    const codigo = codigoVerificador(bytes);
    expect(codigo).toHaveLength(10);
    expect(codigo).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);
    // Ditado por telefone: confundir zero com O transforma "consulte seu processo"
    // em "seu processo não existe".
    expect(codigo).not.toMatch(/[01OIL]/);
  });

  it("t16: aleatoriedade curta é RECUSADA — o código é o que dá acesso ao processo", () => {
    expect(() => codigoVerificador(new Uint8Array(4))).toThrow(/ao menos 10 bytes/);
  });
});
