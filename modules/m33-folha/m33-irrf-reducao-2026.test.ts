import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { calcularIrrf, reducaoDoImposto, type CenarioIrrf, type TabelaIrrfLida } from "./dominio.js";
import { cadastrarTabelaIrrf } from "./servico.js";

/**
 * M33 — A REDUÇÃO DO IRRF MENSAL (Lei 15.270/2025) E O DESCONTO SIMPLIFICADO (Lei 9.250/1995 art.
 * 4º § 2º). Regime de rigor: PROFUNDIDADE (cálculo tributário da folha).
 *
 * FONTES, conferidas no texto oficial em 2026-09-28:
 *  · Lei 9.250/1995 art. 3º-A, incluído pelo art. 2º da Lei 15.270/2025 —
 *    https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm
 *    tabela: "até R$ 5.000,00 → até R$ 312,89 (de modo que o imposto devido seja zero)";
 *    "de R$ 5.000,01 até R$ 7.350,00 → R$ 978,62 − (0,133145 x rendimentos tributáveis sujeitos à
 *    incidência mensal)"; § 1º limitada ao imposto "determinado de acordo com a tabela progressiva
 *    mensal e com o disposto no art. 4º"; § 2º acima de R$ 7.350,00 não há redução.
 *  · Lei 9.250/1995 art. 4º § 2º (redação da Lei 14.663/2023) — https://www.planalto.gov.br/ccivil_03/leis/l9250.htm
 *    "Alternativamente às deduções de que trata o caput deste artigo, poderá ser utilizado desconto
 *    simplificado mensal" — o caput inclui o inciso IV (contribuições para a Previdência Social).
 *  · Receita Federal, "Exemplos de Aplicação da Lei 15.270/2025" (implementação INDEPENDENTE: os
 *    números esperados dos exemplos 2 a 5 são os dela, não do motor) —
 *    https://www.gov.br/receitafederal/pt-br/assuntos/meu-imposto-de-renda/tabelas/exemplos-de-aplicacao-da-lei-15-270-2025
 *
 * A TABELA abaixo é a mensal de 2026 publicada pela Receita (faixas, parcela a deduzir, dependente,
 * simplificado 607,20) — a mesma que o semeador da demonstração cadastra com a fonte. Aqui ela é
 * fixture de teste de domínio; em produção vem da tabela que o ente cadastra.
 *
 * As contas "à mão" de cada caso estão no comentário ao lado. ⚠️ O MOTOR CALCULA FAIXA A FAIXA,
 * arredondando por faixa (decisão registrada no schema: a parcela a deduzir "só confere"), e na
 * faixa de 27,5% isso fica UM CENTAVO acima da fórmula da Receita (base × alíquota − parcela), porque
 * a parcela 908,73 é ela mesma arredondada (a exata seria 908,7285). Faixa a faixa, à mão:
 *   F2 397,85 × 7,5% = 29,84 · F3 924,40 × 15% = 138,66 · F4 913,63 × 22,5% = 205,57 → 374,07 até 4.664,68.
 * Os casos abaixo afirmam o valor do motor com as duas contas ao lado; a divergência tem teste
 * próprio em (5), que muda de cor no dia em que alguém trocar o método.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const $ = (v: string | number): Decimal => toMoney(v);

const TABELA_2026: TabelaIrrfLida = {
  id: "irrf-2026", competenciaInicio: "2026-01", competenciaFim: null,
  deducaoPorDependente: $("189.59"), descontoSimplificado: $("607.20"), isencaoMaior65: $("1903.98"),
  redutorBase: $("978.62"), redutorFator: new Decimal("0.13314500"), redutorRendaMaxima: $("7350.00"),
  redutorRendaDaFaixaIsenta: $("5000.00"), redutorMaximoNaFaixaIsenta: $("312.89"),
  fundamentacaoLegal: "Lei 15.191/2025 e Lei 15.270/2025 — fixture de teste com os valores publicados pela Receita",
  faixas: [
    { ordem: 1, ate: $("2428.80"), aliquota: new Decimal("0") },
    { ordem: 2, ate: $("2826.65"), aliquota: new Decimal("0.075") },
    { ordem: 3, ate: $("3751.05"), aliquota: new Decimal("0.15") },
    { ordem: 4, ate: $("4664.68"), aliquota: new Decimal("0.225") },
    { ordem: 5, ate: null, aliquota: new Decimal("0.275") },
  ],
};
/** A mesma tabela como era cadastrada antes da coluna: só a fórmula linear. */
const TABELA_SO_LINEAR: TabelaIrrfLida = { ...TABELA_2026, redutorRendaDaFaixaIsenta: null, redutorMaximoNaFaixaIsenta: null };

const irrf = (renda: string, contribuicao: string, tabela: TabelaIrrfLida = TABELA_2026) =>
  calcularIrrf({ rendaTributavel: $(renda), contribuicao: $(contribuicao), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela });
const cen = (r: ReturnType<typeof irrf>, nome: CenarioIrrf) => r.cenarios.find((c) => c.nome === nome)!;
const reducao = (r: ReturnType<typeof irrf>, nome: CenarioIrrf) => cen(r, nome).deducoes.find((d) => d.tipo === "REDUTOR")?.valor.toFixed(2);

describe("(1) a redução do art. 3º-A — sobre a RENDA, por faixa, limitada ao imposto", () => {
  it("renda 4.800 (faixa isenta), sem deduções: A 411,28; B = 411,28 − 312,89 (teto da faixa) = 98,39; C 267,89; D 267,89 − 267,89 = 0 → vence D", () => {
    // A: faixa a faixa 374,07 + 135,32 × 27,5% (37,21) = 411,28 (fórmula: 4800 × 27,5% − 908,73 = 411,27).
    // B: redução "até 312,89" (a linear daria 978,62 − 0,133145×4800 = 339,52) → 411,28 − 312,89 = 98,39.
    // C: base 4800 − 607,20 = 4192,80 → 29,84 + 138,66 + 441,75 × 22,5% (99,39) = 267,89 (fórmula: 267,89).
    // D: redução limitada ao imposto (§ 1º) → 267,89 − 267,89 = 0.
    const r = irrf("4800.00", "0");
    expect(cen(r, "DEDUCOES_LEGAIS").valor.toFixed(2)).toBe("411.28");
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("312.89");
    expect(cen(r, "DEDUCOES_LEGAIS_COM_REDUTOR").valor.toFixed(2)).toBe("98.39");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").valor.toFixed(2)).toBe("267.89");
    expect(reducao(r, "DESCONTO_SIMPLIFICADO_COM_REDUTOR")).toBe("267.89");
    expect(r.cenario).toBe("DESCONTO_SIMPLIFICADO_COM_REDUTOR");
    expect(r.valor.toFixed(2)).toBe("0.00");
  });
  it("renda 5.000, INSS 509,60 (exemplo 3 da Receita): C = 4.392,80 × 22,5% − 675,49 = 312,89; a redução é 312,89 → zero; B = 334,85 − 312,89 = 21,96", () => {
    const r = irrf("5000.00", "509.60");
    expect(cen(r, "DEDUCOES_LEGAIS").valor.toFixed(2)).toBe("334.85"); // 4490,40 × 22,5% − 675,49
    expect(cen(r, "DEDUCOES_LEGAIS_COM_REDUTOR").valor.toFixed(2)).toBe("21.96");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").base.toFixed(2)).toBe("4392.80");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").valor.toFixed(2)).toBe("312.89");
    expect(r.cenario).toBe("DESCONTO_SIMPLIFICADO_COM_REDUTOR");
    expect(r.valor.toFixed(2)).toBe("0.00");
  });
  it("renda 6.000, INSS 649,60 (exemplo 4 da Receita): as deduções legais vencem; redução 978,62 − 0,133145 × 6.000 = 179,75 (a da Receita)", () => {
    // A: base 5350,40 → 374,07 + 685,72 × 27,5% (188,57) = 562,64 (Receita: 562,63). B = 562,64 − 179,75 = 382,89 (Receita: 382,88).
    // C: base 5392,80 → 374,07 + 728,12 × 27,5% (200,23) = 574,30. D = 574,30 − 179,75 = 394,55.
    const r = irrf("6000.00", "649.60");
    expect(cen(r, "DEDUCOES_LEGAIS").valor.toFixed(2)).toBe("562.64");
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("179.75");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").valor.toFixed(2)).toBe("574.30");
    expect(cen(r, "DESCONTO_SIMPLIFICADO_COM_REDUTOR").valor.toFixed(2)).toBe("394.55");
    expect(r.cenario).toBe("DEDUCOES_LEGAIS_COM_REDUTOR");
    expect(r.valor.toFixed(2)).toBe("382.89");
  });
  it("renda 7.350,00 (o limite): 978,62 − 978,61575 = 0,00425 → 0,00; vence A", () => {
    // A: base 6550 → 374,07 + 1885,32 × 27,5% (518,46) = 892,53 (fórmula: 892,52).
    // C: base 6742,80 → 374,07 + 2078,12 × 27,5% (571,48) = 945,55 (fórmula: 945,54).
    const r = irrf("7350.00", "800.00");
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("0.00");
    expect(cen(r, "DEDUCOES_LEGAIS").valor.toFixed(2)).toBe("892.53");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").valor.toFixed(2)).toBe("945.55");
    expect(r.cenario).toBe("DEDUCOES_LEGAIS"); // empate A = B fica com o primeiro
    expect(r.valor.toFixed(2)).toBe("892.53");
  });
  it("renda 7.400 (acima, § 2º): redução zero; vence A = 374,07 + 1935,32 × 27,5% (532,21) = 906,28 (fórmula: 906,27)", () => {
    const r = irrf("7400.00", "800.00");
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("0.00");
    expect(reducao(r, "DESCONTO_SIMPLIFICADO_COM_REDUTOR")).toBe("0.00");
    expect(r.valor.toFixed(2)).toBe("906.28");
  });
  it("renda 4.000, INSS 373,41 (exemplo 2 da Receita): C = 114,76, e a redução se limita a 114,76 (não 312,89) → zero", () => {
    const r = irrf("4000.00", "373.41");
    expect(cen(r, "DESCONTO_SIMPLIFICADO").valor.toFixed(2)).toBe("114.76");
    expect(reducao(r, "DESCONTO_SIMPLIFICADO_COM_REDUTOR")).toBe("114.76");
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("149.83"); // A = 3626,59 × 15% − 394,16
    expect(r.valor.toFixed(2)).toBe("0.00");
  });
  it("renda 7.607,20 sem deduções (exemplo 5 da Receita): simplificado, base 7.000, sem redução — a tabela olha o salário, não a base", () => {
    // C: 374,07 + 2335,32 × 27,5% (642,21) = 1016,28 (Receita: 1016,27). Redução: 7.607,20 > 7.350 → zero,
    // embora a BASE (7.000) esteja abaixo de 7.350 — é o ponto do exemplo.
    const r = irrf("7607.20", "0");
    expect(r.cenario).toBe("DESCONTO_SIMPLIFICADO");
    expect(r.base.toFixed(2)).toBe("7000.00");
    expect(reducao(r, "DESCONTO_SIMPLIFICADO_COM_REDUTOR")).toBe("0.00");
    expect(r.valor.toFixed(2)).toBe("1016.28");
  });
});

describe("(2) o desconto simplificado substitui a contribuição previdenciária (art. 4º § 2º)", () => {
  it("N=2: renda 4.000/INSS 373,41 e 5.000/INSS 509,60 — a base do simplificado é renda − 607,20, sem a contribuição", () => {
    for (const [renda, inss, base] of [["4000.00", "373.41", "3392.80"], ["5000.00", "509.60", "4392.80"]] as const) {
      const c = cen(irrf(renda, inss), "DESCONTO_SIMPLIFICADO");
      expect(c.base.toFixed(2)).toBe(base);
      expect(c.deducoes.map((d) => d.tipo)).toEqual(["DESCONTO_SIMPLIFICADO"]);
    }
  });
  it("a parcela isenta de 65 anos (rendimento isento, Lei 7.713/1988 art. 6º XV) continua saindo da renda no simplificado", () => {
    const r = calcularIrrf({ rendaTributavel: $("6000.00"), contribuicao: $("600.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: true, tabela: TABELA_2026 });
    expect(cen(r, "DESCONTO_SIMPLIFICADO").base.toFixed(2)).toBe("3488.82"); // 6000 − 607,20 − 1903,98
  });
});

describe("(3) NEGAÇÕES com motivo e a tabela antiga", () => {
  it("tabela só com a fórmula linear (sem a faixa isenta): a 5.000 a redução é 978,62 − 665,725 = 312,895 → 312,90, não 312,89 — é por isso que a coluna existe", () => {
    const r = irrf("5000.00", "509.60", TABELA_SO_LINEAR);
    expect(reducao(r, "DEDUCOES_LEGAIS_COM_REDUTOR")).toBe("312.90");
    expect(cen(r, "DEDUCOES_LEGAIS_COM_REDUTOR").valor.toFixed(2)).toBe("21.95");
    const nova = irrf("5000.00", "509.60");
    expect(cen(nova, "DEDUCOES_LEGAIS_COM_REDUTOR").valor.toFixed(2)).toBe("21.96");
  });
  it("tabela sem redutor: B e D não se aplicam, cada um dizendo por quê", () => {
    const r = irrf("4000.00", "373.41", { ...TABELA_2026, redutorBase: null, redutorFator: null, redutorRendaMaxima: null, redutorRendaDaFaixaIsenta: null, redutorMaximoNaFaixaIsenta: null });
    expect(r.cenarios.filter((c) => !c.aplicavel).map((c) => `${c.nome}: ${c.motivo}`)).toEqual([
      "DEDUCOES_LEGAIS_COM_REDUTOR: a tabela vigente não traz redutor",
      "DESCONTO_SIMPLIFICADO_COM_REDUTOR: a tabela vigente não traz redutor",
    ]);
    expect(r.valor.toFixed(2)).toBe("114.76");
  });
  it("a redução nunca passa do imposto, nem com imposto zero", () => {
    expect(reducaoDoImposto(TABELA_2026, $("3000.00"), $(0))!.toFixed(2)).toBe("0.00");
    expect(reducaoDoImposto(TABELA_2026, $("5000.01"), $("1000.00"))!.toFixed(2)).toBe("312.89"); // 978,62 − 665,7263 = 312,8937
  });
});

describe("(5) PENDÊNCIA MEDIDA — faixa a faixa × fórmula da Receita na faixa de 27,5%", () => {
  it("exemplos 4 e 5 da Receita: o motor fica exatamente 1 centavo acima (562,64 × 562,63; 1.016,28 × 1.016,27)", () => {
    // Fórmula independente, com a parcela publicada: base × 27,5% − 908,73.
    const pelaReceita = (base: string) => toMoney($(base).times("0.275").minus("908.73"));
    for (const [renda, inss, nome, base] of [["6000.00", "649.60", "DEDUCOES_LEGAIS", "5350.40"], ["7607.20", "0", "DESCONTO_SIMPLIFICADO", "7000.00"]] as const) {
      const c = cen(irrf(renda, inss), nome);
      expect(c.base.toFixed(2)).toBe(base);
      expect(c.valor.minus(pelaReceita(base)).toFixed(2)).toBe("0.01");
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// O SERVIÇO E O BANCO — a faixa isenta vem inteira, só com o redutor, abaixo da renda máxima
// ═══════════════════════════════════════════════════════════════════════════════

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

const BASE_DO_CADASTRO = {
  competenciaInicio: "2026-01", deducaoPorDependente: "189.59", descontoSimplificado: "607.20",
  redutorBase: "978.62", redutorFator: "0.133145", redutorRendaMaxima: "7350.00",
  fundamentacaoLegal: "fixture de teste", faixas: [{ ordem: 1, ate: "2428.80", aliquota: "0" }, { ordem: 2, ate: null, aliquota: "0.275", parcelaADeduzir: "667.92" }], criadoPor: POR,
};

describe("(4) cadastrarTabelaIrrf — a faixa isenta do redutor", () => {
  it("grava os dois campos e o cálculo da folha os lê de volta", async () => {
    const { tabelaId } = await cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorRendaDaFaixaIsenta: "5000.00", redutorMaximoNaFaixaIsenta: "312.89" });
    const t = await prisma.tabelaIrrf.findUniqueOrThrow({ where: { id: tabelaId }, select: { redutorRendaDaFaixaIsenta: true, redutorMaximoNaFaixaIsenta: true } });
    expect(t.redutorRendaDaFaixaIsenta?.toFixed(2)).toBe("5000.00");
    expect(t.redutorMaximoNaFaixaIsenta?.toFixed(2)).toBe("312.89");
  });
  it("NEGAÇÃO: só um dos dois → recusa com o motivo, nada gravado", async () => {
    await expect(cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorRendaDaFaixaIsenta: "5000.00" })).rejects.toThrow(/REDUTOR-FAIXA-ISENTA-INCOMPLETA/);
    await expect(cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorMaximoNaFaixaIsenta: "312.89" })).rejects.toThrow(/REDUTOR-FAIXA-ISENTA-INCOMPLETA/);
    expect(await prisma.tabelaIrrf.count()).toBe(0);
  });
  it("NEGAÇÃO: faixa isenta sem o redutor linear, ou acima da renda máxima → recusa com o motivo", async () => {
    await expect(cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorBase: null, redutorFator: null, redutorRendaMaxima: null, redutorRendaDaFaixaIsenta: "5000.00", redutorMaximoNaFaixaIsenta: "312.89" })).rejects.toThrow(/REDUTOR-FAIXA-ISENTA-SEM-REDUTOR/);
    await expect(cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorRendaDaFaixaIsenta: "7350.00", redutorMaximoNaFaixaIsenta: "312.89" })).rejects.toThrow(/REDUTOR-FAIXA-ISENTA-FORA/);
    expect(await prisma.tabelaIrrf.count()).toBe(0);
  });
  it("NEGAÇÃO: quem não pode configurar tabelas é recusado pela autorização, não pela validação", async () => {
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" } });
    await expect(cadastrarTabelaIrrf(prisma, { ...BASE_DO_CADASTRO, redutorRendaDaFaixaIsenta: "5000.00", redutorMaximoNaFaixaIsenta: "312.89", criadoPor: SEM_PODER })).rejects.toThrow(/CONFIGURAR_TABELAS_DA_FOLHA/);
    expect(await prisma.tabelaIrrf.count()).toBe(0);
  });
  // ⚠️ ESTE TESTE ACUSOU UM DEFEITO NA PRIMEIRA CORRIDA: o CHECK "todos ou nenhum" escrito com
  // `x > 0` deixa passar a linha com um campo NULO (NULO > 0 é NULO, e CHECK NULO passa). O de 2025
  // do redutor tinha o mesmo buraco. A migration 20261029090100 acrescenta os CHECKs de presença.
  it("o CHECK do banco acusa por conta própria, por fora do serviço: faixa isenta pela metade", async () => {
    await expect(
      prisma.tabelaIrrf.create({ data: { competenciaInicio: "2026-02", deducaoPorDependente: "1.00", redutorBase: "978.62", redutorFator: "0.133145", redutorRendaMaxima: "7350.00", redutorRendaDaFaixaIsenta: "5000.00", fundamentacaoLegal: "x", criadoPor: POR } }),
    ).rejects.toThrow(/TabelaIrrf_redutor_faixa_isenta_presenca_chk/);
    expect(await prisma.tabelaIrrf.count()).toBe(0);
  });
  it("o CHECK do banco acusa por conta própria: redutor linear pela metade (renda máxima nula)", async () => {
    await expect(
      prisma.tabelaIrrf.create({ data: { competenciaInicio: "2026-03", deducaoPorDependente: "1.00", redutorBase: "978.62", redutorFator: "0.133145", fundamentacaoLegal: "x", criadoPor: POR } }),
    ).rejects.toThrow(/TabelaIrrf_redutor_presenca_chk/);
    expect(await prisma.tabelaIrrf.count()).toBe(0);
  });
});
