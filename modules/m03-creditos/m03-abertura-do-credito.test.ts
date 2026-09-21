import { describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import {
  classificarAbertura,
  ehReabrivel,
  promulgadaNosUltimosQuatroMeses,
} from "./abertura-do-credito.js";

/**
 * ABERTO OU REABERTO (V11 V8.6) — a partição da CF art. 167 § 2º, sem banco.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROTEGE ═══
 * A pendência `CREDITO-ESPECIAL-ABERTO-OU-REABERTO` dizia que faltava um FATO. O fato existia —
 * o decreto aponta para a lei, e cada um tem o seu ano —; faltava LER a diferença. E ler é melhor
 * que perguntar: uma caixa de seleção entre "aberto" e "reaberto" é uma escolha que se erra, e o
 * erro vai direto para o balancete do TCE.
 *
 * Três coisas falham em silêncio aqui, e cada uma tem teste:
 *
 *  (1) TRATAR O SUPLEMENTAR COMO REABRÍVEL. Ele reforça dotação que já existe e morre com o
 *      exercício; o PCASP não o parte. Inventar a partição para ele seria inventar norma (t1).
 *
 *  (2) ACEITAR REABERTURA DE LEI DE MEIO DO ANO. O § 2º só reabre o que foi promulgado nos
 *      ÚLTIMOS QUATRO MESES. Sem esta guarda, um especial de março vira orçamento do ano
 *      seguinte — dinheiro autorizado uma vez, gasto duas (t4).
 *
 *  (3) ACEITAR REABERTURA DE DOIS ANOS ATRÁS. "Exercício subsequente" é UM. Um decreto de N+2
 *      contra lei de N é crédito sem autorização vigente, e é o tipo de coisa que passa
 *      despercebida por anos (t5).
 */

const LEI_DEZEMBRO = meioDiaCivil("2026-12-15");
const LEI_MARCO = meioDiaCivil("2026-03-10");
const LEI_SETEMBRO = meioDiaCivil("2026-09-01");
const LEI_AGOSTO = meioDiaCivil("2026-08-31");

describe("o que se reabre", () => {
  it("t1: só ESPECIAL e EXTRAORDINÁRIO se reabrem — o suplementar não é partido", () => {
    expect(ehReabrivel("ESPECIAL")).toBe(true);
    expect(ehReabrivel("EXTRAORDINARIO")).toBe(true);
    expect(ehReabrivel("SUPLEMENTAR")).toBe(false);

    // ⚠️ E PARA O SUPLEMENTAR A RESPOSTA É `null`, NÃO UMA RECUSA. "Não se aplica" e "não
    // decidido" são coisas diferentes: confundi-las faria o roteiro do suplementar exigir uma
    // dimensão que a norma não tem.
    const s = classificarAbertura({
      tipoCredito: "SUPLEMENTAR", leiAno: 2026, leiDataPublicacao: LEI_MARCO, decretoAno: 2027,
    });
    expect(s).toEqual({ abertura: null, recusa: null });
  });

  it("t2: a fronteira dos QUATRO MESES é setembro — e 31 de agosto está fora", () => {
    expect(promulgadaNosUltimosQuatroMeses(LEI_SETEMBRO)).toBe(true);
    expect(promulgadaNosUltimosQuatroMeses(LEI_AGOSTO)).toBe(false);
    expect(promulgadaNosUltimosQuatroMeses(meioDiaCivil("2026-12-31"))).toBe(true);
  });

  it("t2b: o mês vem do DIA CIVIL DO ENTE — 31 de dezembro à noite não vira janeiro", () => {
    // ⚠️ Lido em UTC, 31/12 às 22h em São Paulo é 1º de janeiro — e a lei passaria a ser do
    // exercício SEGUINTE, o que muda a resposta inteira.
    const fimDoAnoNoEnte = new Date("2026-12-31T22:00:00-03:00");
    expect(fimDoAnoNoEnte.getUTCMonth()).toBe(0); // UTC já virou janeiro…
    expect(promulgadaNosUltimosQuatroMeses(fimDoAnoNoEnte)).toBe(true); // …e no ente é dezembro.
  });
});

describe("a classificação do decreto contra a lei", () => {
  const especial = (leiAno: number, decretoAno: number, publicacao: Date) =>
    classificarAbertura({ tipoCredito: "ESPECIAL", leiAno, leiDataPublicacao: publicacao, decretoAno });

  it("t3: mesmo exercício da lei é ABERTO — e a data de promulgação não importa", () => {
    expect(especial(2026, 2026, LEI_MARCO)).toEqual({ abertura: "ABERTO", recusa: null });
    expect(especial(2026, 2026, LEI_DEZEMBRO)).toEqual({ abertura: "ABERTO", recusa: null });
  });

  it("t4: exercício seguinte é REABERTO só se a lei nasceu de setembro a dezembro", () => {
    expect(especial(2026, 2027, LEI_DEZEMBRO)).toEqual({ abertura: "REABERTO", recusa: null });
    expect(especial(2026, 2027, LEI_SETEMBRO)).toEqual({ abertura: "REABERTO", recusa: null });

    // ⚠️ MARÇO NÃO REABRE. Sem esta guarda, um especial autorizado no meio do ano viraria
    // orçamento do ano seguinte: dinheiro autorizado uma vez, gasto duas.
    const marco = especial(2026, 2027, LEI_MARCO);
    expect(marco.abertura).toBeNull();
    expect(marco.recusa).toMatch(/ÚLTIMOS QUATRO MESES[\s\S]*167 § 2º/);

    // E a borda: 31 de agosto também não.
    expect(especial(2026, 2027, LEI_AGOSTO).abertura).toBeNull();
  });

  it("t5: DOIS exercícios depois não é reabertura — é crédito sem autorização vigente", () => {
    const longe = especial(2026, 2028, LEI_DEZEMBRO);
    expect(longe.abertura).toBeNull();
    expect(longe.recusa).toMatch(/exercício SUBSEQUENTE, um só — 2027[\s\S]*autorização nova/);
  });

  it("t6: decreto ANTERIOR à lei é recusado — não se executa o que ainda não foi autorizado", () => {
    const antes = especial(2026, 2025, LEI_DEZEMBRO);
    expect(antes.abertura).toBeNull();
    expect(antes.recusa).toMatch(/não executa autorização que ainda não existia/);
  });

  it("t7: o EXTRAORDINÁRIO segue a mesma regra — a norma não os separa", () => {
    const c = (decretoAno: number, pub: Date) =>
      classificarAbertura({ tipoCredito: "EXTRAORDINARIO", leiAno: 2026, leiDataPublicacao: pub, decretoAno });
    expect(c(2026, LEI_MARCO).abertura).toBe("ABERTO");
    expect(c(2027, LEI_DEZEMBRO).abertura).toBe("REABERTO");
    expect(c(2027, LEI_MARCO).abertura).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E A GUARDA MORDE NO ATO — contra o Postgres
// ═══════════════════════════════════════════════════════════════════════════

describe("a guarda no criarDecreto", async () => {
  const { criarPrismaDeTeste, exigirBanco } = await import("../../test/banco.js");
  const { limparBanco } = await import("../../test/limpar-banco.js");
  const { criarM03Deps } = await import("./adapter-prisma.js");
  const { criarDecreto, criarLei } = await import("./servico.js");
  const { beforeEach, afterAll } = await import("vitest");

  const prisma = criarPrismaDeTeste();
  await exigirBanco(prisma);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  const POR = "m03@cg.pb.gov.br";
  let deps: Awaited<ReturnType<typeof criarM03Deps>>;

  beforeEach(async () => {
    await limparBanco(prisma);
    deps = criarM03Deps(prisma);
  });

  const lei = async (p: { tipo: "ESPECIAL" | "SUPLEMENTAR"; ano: number; publicacao: string }) =>
    criarLei(
      {
        numero: `L-${p.tipo}-${p.ano}`, ano: p.ano, tipoCredito: p.tipo,
        valorAutorizado: "100000.00", dataPublicacao: meioDiaCivil(p.publicacao), criadoPor: POR,
      },
      deps
    );

  const decreto = async (leiId: string, ano: number) =>
    criarDecreto(
      { leiId, numero: `D-${ano}`, ano, data: meioDiaCivil(`${ano}-02-10`), origemRecurso: "ANULACAO", criadoPor: POR },
      deps
    );

  it("t8: o decreto ILEGAL não NASCE — e a recusa cita a lei e o artigo", async () => {
    // ⚠️ AQUI, E NÃO NA EXECUÇÃO. Deixá-lo nascer criaria um documento que o ente vê na tela,
    // cita em ofício, e que nunca vai poder ser executado.
    const especialDeMarco = await lei({ tipo: "ESPECIAL", ano: 2026, publicacao: "2026-03-10" });
    await expect(decreto(especialDeMarco, 2027)).rejects.toThrow(
      /L-ESPECIAL-2026\/2026[\s\S]*ÚLTIMOS QUATRO MESES[\s\S]*167 § 2º/
    );
    expect(await prisma.decretoCredito.count()).toBe(0);
  });

  it("t9: o mesmo crédito promulgado em DEZEMBRO reabre no ano seguinte — e o decreto nasce", async () => {
    const especialDeDezembro = await lei({ tipo: "ESPECIAL", ano: 2026, publicacao: "2026-12-15" });
    const id = await decreto(especialDeDezembro, 2027);
    expect(id).toBeTruthy();
    expect(await prisma.decretoCredito.count()).toBe(1);
  });

  it("t10: dois exercícios depois é recusado, e o SUPLEMENTAR passa sem a partição", async () => {
    const especial = await lei({ tipo: "ESPECIAL", ano: 2026, publicacao: "2026-12-15" });
    await expect(decreto(especial, 2028)).rejects.toThrow(/exercício SUBSEQUENTE, um só — 2027/);

    // ⚠️ O SUPLEMENTAR NÃO É ALCANÇADO pela regra — e continua passando em qualquer ano, porque
    // quem o limita é o teto da lei, não o § 2º.
    const suplementar = await lei({ tipo: "SUPLEMENTAR", ano: 2026, publicacao: "2026-03-10" });
    expect(await decreto(suplementar, 2028)).toBeTruthy();
  });
});
