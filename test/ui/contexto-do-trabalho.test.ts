import { describe, expect, it } from "vitest";
import { exercicioPadrao, periodoDoExercicio, situacaoDoExercicio, type FatosDoExercicio } from "../../lib/situacao-do-exercicio";
import { competenciaTravadaEm, mesesTravados } from "../../lib/portas/competencia";
import { alinharContextoEUrl, caminhoDaLista } from "../../lib/contexto-na-url";

/**
 * O CONTEXTO DE TRABALHO (V31 §2): a fase do exercício, o exercício que abre a sessão e o alinhamento
 * entre o seletor e a URL. Tudo puro — a regra que a tela aplica é esta, e não outra.
 */

const VAZIO: FatosDoExercicio = {
  ano: 2027,
  encerrado: false,
  temProposta: false,
  propostaEfetivada: false,
  projetoEnviado: false,
  leiAprovada: false,
};

describe("a fase do exercício — proposta, aprovado, execução, encerrado", () => {
  it("c1: o exercício seguinte passa pelas fases conforme os FATOS gravados, e nenhuma delas aceita execução", () => {
    const fases = [
      situacaoDoExercicio(VAZIO, 2026),
      situacaoDoExercicio({ ...VAZIO, temProposta: true }, 2026),
      situacaoDoExercicio({ ...VAZIO, temProposta: true, propostaEfetivada: true }, 2026),
      situacaoDoExercicio({ ...VAZIO, temProposta: true, propostaEfetivada: true, projetoEnviado: true }, 2026),
      situacaoDoExercicio({ ...VAZIO, projetoEnviado: true, leiAprovada: true }, 2026),
    ];
    expect(fases.map((f) => f.fase)).toEqual([
      "SEM_ORCAMENTO",
      "PROPOSTA_EM_ELABORACAO",
      "PROPOSTA_GERADA",
      "PROJETO_ENVIADO",
      "ORCAMENTO_APROVADO",
    ]);
    expect(fases.every((f) => !f.aceitaExecucao)).toBe(true);
  });

  it("c2: o ano civil começado é execução, com ou sem lei; encerrado vence tudo", () => {
    expect(situacaoDoExercicio({ ...VAZIO, ano: 2026 }, 2026).fase).toBe("EM_EXECUCAO");
    expect(situacaoDoExercicio({ ...VAZIO, ano: 2026, leiAprovada: true }, 2026).aceitaExecucao).toBe(true);
    const enc = situacaoDoExercicio({ ...VAZIO, ano: 2025, encerrado: true, leiAprovada: true }, 2026);
    expect(enc.fase).toBe("ENCERRADO");
    expect(enc.aceitaExecucao).toBe(false);
    // Negação com motivo: a MESMA proposta aprovada vira execução quando o ano civil chega.
    expect(situacaoDoExercicio({ ...VAZIO, leiAprovada: true }, 2027).fase).toBe("EM_EXECUCAO");
  });

  it("c3: o período é o mês corrente do exercício em curso; anterior e seguinte se dizem pelo nome", () => {
    expect(periodoDoExercicio(2026, 2026, 10)).toBe("outubro de 2026");
    expect(periodoDoExercicio(2025, 2026, 10)).toBe("exercício de 2025 (anterior)");
    expect(periodoDoExercicio(2027, 2026, 10)).toBe("exercício de 2027 (seguinte)");
  });
});

describe("o exercício que abre a sessão", () => {
  it("e1: com 2027 aberto pela proposta, a sessão abre em 2026 (ano civil), não no mais recente", () => {
    expect(exercicioPadrao([2027, 2026, 2025], 2026, null)).toBe(2026);
  });
  it("e2: a preferência gravada vale se o exercício existe; senão é ignorada", () => {
    expect(exercicioPadrao([2027, 2026], 2026, 2027)).toBe(2027);
    expect(exercicioPadrao([2027, 2026], 2026, 2019)).toBe(2026);
  });
  it("e3: sem o ano civil cadastrado, o último anterior; sem anterior, o primeiro seguinte", () => {
    expect(exercicioPadrao([2024, 2023], 2026, null)).toBe(2024);
    expect(exercicioPadrao([2028, 2027], 2026, null)).toBe(2027);
    expect(exercicioPadrao([], 2026, null)).toBeNull();
  });
});

describe("o alinhamento entre o seletor e a URL", () => {
  const base = { exerciciosValidos: [2027, 2026], ugsValidas: ["10101", "20202"] };

  it("u1: na montagem a URL vence — um link com ?exercicio=2026 não é sobrescrito pelo contexto 2027", () => {
    const r = alinharContextoEUrl({
      ...base,
      pathname: "/despesa/empenhos",
      busca: "exercicio=2026&ug=20202&credor=joao",
      contexto: { exercicio: 2027, ugCodigo: "10101" },
      anterior: null,
    });
    expect(r.adotar).toEqual({ exercicio: 2026, ugCodigo: "20202" });
    expect(r.destino).toBeNull();
  });

  it("u2: na montagem, valor inválido na URL não é adotado — exercício inexistente e unidade não permitida", () => {
    const r = alinharContextoEUrl({
      ...base,
      pathname: "/despesa/empenhos",
      busca: "exercicio=1999&ug=99999",
      contexto: { exercicio: 2026, ugCodigo: "10101" },
      anterior: null,
    });
    expect(r.adotar).toBeNull();
    expect(r.destino).toBe("/despesa/empenhos?exercicio=2026&ug=10101");
  });

  it("u3: trocar o exercício preserva o filtro e descarta a seleção de registro e a página", () => {
    const r = alinharContextoEUrl({
      ...base,
      pathname: "/despesa/empenhos",
      busca: "exercicio=2026&credor=joao&fichaId=cabc&pagina=3&situacao=ABERTO",
      contexto: { exercicio: 2027, ugCodigo: null },
      anterior: { exercicio: 2026, ugCodigo: null },
    });
    const destino = new URL(r.destino ?? "", "http://x");
    expect(destino.pathname).toBe("/despesa/empenhos");
    expect(destino.searchParams.get("credor")).toBe("joao");
    expect(destino.searchParams.get("situacao")).toBe("ABERTO");
    expect(destino.searchParams.get("exercicio")).toBe("2027");
    expect(destino.searchParams.has("fichaId")).toBe(false);
    expect(destino.searchParams.has("pagina")).toBe(false);
  });

  it("u4: trocar o exercício no DETALHE de um registro volta para a lista", () => {
    const r = alinharContextoEUrl({
      ...base,
      pathname: "/despesa/empenhos/cm1abcdefghijklmnopqrstu",
      busca: "exercicio=2026",
      contexto: { exercicio: 2027, ugCodigo: null },
      anterior: { exercicio: 2026, ugCodigo: null },
    });
    expect(r.destino).toBe("/despesa/empenhos?exercicio=2027");
    expect(caminhoDaLista("/licitacoes/contratos/cm1abcdefghijklmnopqrstu/ordens/cm9zzzzzzzzzzzzzzzzzzzzz")).toBe("/licitacoes/contratos");
    expect(caminhoDaLista("/relatorios/rreo/anexo1")).toBe("/relatorios/rreo/anexo1");
  });

  it("u5: sem troca, nada se descarta — a seleção sobrevive a uma re-renderização", () => {
    const r = alinharContextoEUrl({
      ...base,
      pathname: "/despesa/empenhos/cm1abcdefghijklmnopqrstu",
      busca: "exercicio=2026&fichaId=cabc",
      contexto: { exercicio: 2026, ugCodigo: null },
      anterior: { exercicio: 2026, ugCodigo: null },
    });
    expect(r.destino).toBeNull();
  });
});

describe("a competência no cabeçalho — a mesma resposta do guard do razão", () => {
  const ev = (id: string, tipo: "TRAVAR" | "DESTRAVAR", ini: string, fim: string, usuarioAlvo: string | null, criadoEm: string) => ({
    id,
    tipo,
    janelaInicio: new Date(ini),
    janelaFim: new Date(fim),
    usuarioAlvo,
    criadoEm: new Date(criadoEm),
    criadoPor: "contador@ente",
  });
  // Setembro e outubro travados para todos (horário civil de Brasília: -03:00); outubro destravado só para a ana;
  // e uma trava por data de 1 a 15 de novembro, que NÃO fecha a competência inteira.
  const eventos = [
    ev("e1", "TRAVAR", "2026-09-01T03:00:00Z", "2026-11-01T02:59:59.999Z", null, "2026-11-02T12:00:00Z"),
    ev("e2", "DESTRAVAR", "2026-10-01T03:00:00Z", "2026-11-01T02:59:59.999Z", "ana", "2026-11-03T12:00:00Z"),
    ev("e3", "TRAVAR", "2026-11-01T03:00:00Z", "2026-11-16T02:59:59.999Z", null, "2026-11-20T12:00:00Z"),
  ];

  it("t1: os meses travados inteiros, por usuário — a trava parcial de novembro não conta", () => {
    expect(mesesTravados(eventos, 2026, "bruno")).toEqual([9, 10]);
    expect(mesesTravados(eventos, 2026, "ana")).toEqual([9]);
    expect(mesesTravados(eventos, 2025, "bruno")).toEqual([]);
  });

  it("t2: a competência de agora diz o escopo — e a borda civil de 31/10 às 23h59 ainda é outubro", () => {
    const borda = new Date("2026-11-01T02:59:00Z"); // 31/10 23:59 em Brasília
    expect(competenciaTravadaEm(eventos, borda, "bruno")).toEqual({ escopo: "GLOBAL", travadoPor: "contador@ente" });
    expect(competenciaTravadaEm(eventos, borda, "ana")).toBeNull();
    expect(competenciaTravadaEm(eventos, new Date("2026-12-10T15:00:00Z"), "bruno")).toBeNull();
  });
});
