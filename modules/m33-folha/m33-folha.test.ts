import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarDependente, cadastrarLotacao, cadastrarServidor, registrarAlteracaoRemuneratoria, registrarMovimentacao } from "../m32-pessoal/servico.js";
import {
  FaixasInvalidasError,
  TabelaAusenteError,
  VencimentoAusenteError,
  VinculoSemRegimeError,
  aplicarFaixas,
  calcularContracheque,
  calcularContribuicao,
  calcularIrrf,
  calcularSalarioFamilia,
  canonico,
  contribuicaoMaxima,
  diasComputados,
  escolherVigente,
  imposicoesDaPessoa,
  sha256Canonico,
  situacaoDaFolha,
  type EntradaDoContracheque,
  type RubricaLida,
  type TabelaDeContribuicaoLida,
  type TabelaIrrfLida,
  type TabelaSalarioFamiliaLida,
} from "./dominio.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, cadastrarTabelaSalarioFamilia, calcularFolha, cancelarCalculoDaFolha, fecharFolha, lancarNaFolha } from "./servico.js";

/**
 * M33 — FOLHA DE PAGAMENTO (V6 P2.3). Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ AS TABELAS DESTE ARQUIVO SÃO FIXTURES SINTÉTICAS, NÃO A NORMA. Valores redondos, escolhidos
 * para que a conta se faça à mão e para que cada regra se manifeste: três faixas (N≥2), teto,
 * redutor, desconto simplificado. Nenhum número aqui afirma alíquota oficial — a do ente vem da
 * tabela que o ente cadastra com a fundamentação.
 *
 * O que este arquivo prova e o que existe para impedir:
 *  · faixa a faixa, arredondado por faixa, conferido contra a FÓRMULA SIMPLIFICADA independente
 *    (base × alíquota − parcela a deduzir) — parser não se confere com o próprio parser;
 *  · sem tabela vigente, RECUSA nomeando (nunca calcula com valor embutido);
 *  · o cálculo é fato numerado; fechada, a folha não se recalcula; o hash é determinístico;
 *  · duas matrículas da mesma pessoa: uma base, um teto, um imposto — rateados (5.12.79);
 *  · a promoção de junho não muda a folha de maio (o vencimento é o vigente no fim do mês).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
// ⚠️ IDENTIDADE DAS FIXTURES — não se inventa uma nova (`test/usuarios-teste.ts`). Uma fora da
// lista faz TODA escrita cair em "USUÁRIO NÃO CADASTRADO", que mascararia o teste de permissão.
const POR = "contabilidade@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const $ = (v: string | number): Decimal => toMoney(v);

// ── FIXTURES SINTÉTICAS ─────────────────────────────────────────────────────────
const CONTRIB_RGPS: TabelaDeContribuicaoLida = {
  id: "t-rgps", regime: "RGPS", competenciaInicio: "2026-01", competenciaFim: null, teto: $("8000.00"), fundamentacaoLegal: "FIXTURE de teste — não é a portaria",
  faixas: [
    { ordem: 1, ate: $("1000.00"), aliquota: new Decimal("0.0750") },
    { ordem: 2, ate: $("3000.00"), aliquota: new Decimal("0.0900") },
    { ordem: 3, ate: null, aliquota: new Decimal("0.1400") },
  ],
};
const CONTRIB_RPPS: TabelaDeContribuicaoLida = { id: "t-rpps", regime: "RPPS", competenciaInicio: "2026-01", competenciaFim: null, teto: null, fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: new Decimal("0.1400") }] };
const IRRF: TabelaIrrfLida = {
  id: "t-irrf", competenciaInicio: "2026-01", competenciaFim: null, deducaoPorDependente: $("200.00"), descontoSimplificado: $("600.00"), isencaoMaior65: $("1900.00"),
  redutorBase: $("1000.00"), redutorFator: new Decimal("0.20000000"), redutorRendaMaxima: $("5000.00"), fundamentacaoLegal: "FIXTURE de teste — não é a tabela da RFB",
  faixas: [
    { ordem: 1, ate: $("2000.00"), aliquota: new Decimal("0.0000") },
    { ordem: 2, ate: $("3000.00"), aliquota: new Decimal("0.1500") },
    { ordem: 3, ate: null, aliquota: new Decimal("0.2750") },
  ],
};
// A parcela a deduzir da fórmula simplificada, derivada das faixas acima: F2 = 2000×0,15 = 300; F3 = 300 + 3000×(0,275−0,15) = 675.
const PARCELA: Readonly<Record<number, string>> = { 1: "0", 2: "300.00", 3: "675.00" };
const SF: TabelaSalarioFamiliaLida = { id: "t-sf", competenciaInicio: "2026-01", competenciaFim: null, rendaMaxima: $("2000.00"), valorPorDependente: $("60.00"), idadeLimite: 14, fundamentacaoLegal: "FIXTURE de teste" };

const rubrica = (r: Partial<RubricaLida> & { readonly codigo: string; readonly natureza: RubricaLida["natureza"]; readonly tipo: RubricaLida["tipo"] }): RubricaLida => ({
  id: `r-${r.codigo}`, descricao: r.codigo, percentual: null, incideContribuicao: r.tipo === "PROVENTO", incideIrrf: r.tipo === "PROVENTO", proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture",
  // V11 V1.1 — a versão é a autoridade do cálculo; nas fixtures deste arquivo é sempre a 1.
  versao: 1, formula: null, casasDecimais: 2, ...r,
});
const RUBRICAS: readonly RubricaLida[] = [
  rubrica({ codigo: "VENC", natureza: "VENCIMENTO_BASE", tipo: "PROVENTO", ordem: 1, proporcionalAosDias: true }),
  rubrica({ codigo: "GRAT", natureza: "GRATIFICACOES_DO_VINCULO", tipo: "PROVENTO", ordem: 2 }),
  rubrica({ codigo: "HEXT", natureza: "VALOR_INFORMADO", tipo: "PROVENTO", ordem: 3 }),
  rubrica({ codigo: "INSAL", natureza: "PERCENTUAL_DO_VENCIMENTO", tipo: "PROVENTO", ordem: 4, percentual: new Decimal("0.2000") }),
  rubrica({ codigo: "PREV", natureza: "CONTRIBUICAO_PREVIDENCIARIA", tipo: "DESCONTO", ordem: 90, incideContribuicao: false, incideIrrf: false }),
  rubrica({ codigo: "IRRF", natureza: "IMPOSTO_DE_RENDA", tipo: "DESCONTO", ordem: 91, incideContribuicao: false, incideIrrf: false }),
  rubrica({ codigo: "SFAM", natureza: "SALARIO_FAMILIA", tipo: "PROVENTO", ordem: 50, incideContribuicao: false, incideIrrf: false }),
  rubrica({ codigo: "CONSIG", natureza: "VALOR_INFORMADO", tipo: "DESCONTO", ordem: 95, incideContribuicao: false, incideIrrf: false }),
];

function entrada(extra: Partial<EntradaDoContracheque> = {}): EntradaDoContracheque {
  return {
    competencia: "2026-05",
    vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: D(1985, 7, 20) },
    vencimentoBase: $("3000.00"),
    gratificacoes: [],
    dias: { dias: 30, explicacao: "30/30 dias" },
    lancamentos: [],
    dependentesSalarioFamilia: [],
    dependentesIr: 0,
    pensaoAlimenticia: $(0),
    rubricas: RUBRICAS,
    tabelas: { contribuicao: CONTRIB_RGPS, irrf: IRRF, salarioFamilia: SF },
    ...extra,
  };
}

/** A FÓRMULA SIMPLIFICADA — implementação INDEPENDENTE para conferir o faixa a faixa. */
function porFormulaSimplificada(base: Decimal, faixas: TabelaIrrfLida["faixas"]): Decimal {
  const f = faixas.find((x) => x.ate === null || base.lte(x.ate))!;
  return toMoney(base.times(f.aliquota).minus(PARCELA[f.ordem]!));
}

// ═══════════════════════════════════════════════════════════════════════════════
describe("(1) faixas progressivas — faixa a faixa, conferido por fórmula independente", () => {
  it("3000 na tabela RGPS: 1000×7,5% + 2000×9% = 255,00, em DUAS faixas", () => {
    const r = aplicarFaixas($("3000.00"), CONTRIB_RGPS.faixas);
    expect(r.valor.toFixed(2)).toBe("255.00");
    expect(r.percorridas.map((f) => `${f.ordem}:${f.baseNaFaixa.toFixed(2)}×${f.aliquota}=${f.valor.toFixed(2)}`)).toEqual(["1:1000.00×0.0750=75.00", "2:2000.00×0.0900=180.00"]);
  });
  it("o faixa a faixa do IRRF bate com base × alíquota − parcela a deduzir, em cinco bases (as duas contas são independentes)", () => {
    for (const base of ["1999.99", "2000.00", "2500.55", "3000.00", "7777.77"]) {
      expect(aplicarFaixas($(base), IRRF.faixas).valor.toFixed(2)).toBe(porFormulaSimplificada($(base), IRRF.faixas).toFixed(2));
    }
  });
  it("base zero ou negativa → zero, sem faixa percorrida", () => {
    expect(aplicarFaixas($(0), IRRF.faixas).percorridas).toEqual([]);
    expect(aplicarFaixas($("-5"), IRRF.faixas).valor.toFixed(2)).toBe("0.00");
  });
  it("NEGAÇÃO com motivo: faixa sem limite que não é a última; limite que não sobe; alíquota > 1", () => {
    expect(() => aplicarFaixas($(1), [{ ordem: 1, ate: null, aliquota: new Decimal("0.1") }, { ordem: 2, ate: $(100), aliquota: new Decimal("0.2") }], "X")).toThrow(/FAIXAS-INVALIDAS.*faixa 1 não tem limite e não é a última/);
    expect(() => aplicarFaixas($(1), [{ ordem: 1, ate: $(100), aliquota: new Decimal("0.1") }, { ordem: 2, ate: $(50), aliquota: new Decimal("0.2") }], "X")).toThrow(/não sobe/);
    expect(() => aplicarFaixas($(1), [{ ordem: 1, ate: null, aliquota: new Decimal("1.5") }], "X")).toThrow(FaixasInvalidasError);
  });
});

describe("(2) contribuição por regime", () => {
  it("RGPS acima do teto: base trava em 8000 e a memória diz que o teto foi aplicado", () => {
    const r = calcularContribuicao({ regime: "RGPS", base: $("15000.00"), tabela: CONTRIB_RGPS });
    expect(r.tetoAplicado).toBe(true);
    expect(r.base.toFixed(2)).toBe("8000.00");
    expect(r.baseAntesDoTeto.toFixed(2)).toBe("15000.00");
    // 75 + 180 + 5000×14% = 955
    expect(r.valor.toFixed(2)).toBe("955.00");
    expect(contribuicaoMaxima(CONTRIB_RGPS)!.toFixed(2)).toBe("955.00");
  });
  it("RPPS linear sem teto: 14% sobre a remuneração integral", () => {
    const r = calcularContribuicao({ regime: "RPPS", base: $("12000.00"), tabela: CONTRIB_RPPS });
    expect(r.valor.toFixed(2)).toBe("1680.00");
    expect(r.tetoAplicado).toBe(false);
    expect(contribuicaoMaxima(CONTRIB_RPPS)).toBeNull();
  });
  it("ISENTO: zero, sem tabela, com o motivo na memória", () => {
    const r = calcularContribuicao({ regime: "ISENTO", base: $("2000.00"), tabela: null });
    expect(r.valor.toFixed(2)).toBe("0.00");
    expect(r.fundamentacao).toMatch(/ISENTO/);
  });
  it("NEGAÇÃO: tabela do regime errado é recusada nomeando os dois regimes", () => {
    expect(() => calcularContribuicao({ regime: "RGPS", base: $(1), tabela: CONTRIB_RPPS })).toThrow(/regime RPPS, não RGPS/);
  });
});

describe("(3) IRRF — quatro cenários, vence o menor; a aplicabilidade vem da tabela", () => {
  // ⚠️ V22 — o cenário C deixou de descontar a contribuição junto do simplificado (Lei 9.250/1995
  // art. 4º § 2º: o simplificado é ALTERNATIVO às deduções do caput, e o inciso IV é a contribuição),
  // e nasceu o D (simplificado + redução, art. 3º-A § 1º). Os números abaixo foram refeitos à mão.
  it("renda 4000 sem dependentes: A = 15% sobre (4000−255−2000) …; o REDUTOR (1000 − 0,2×4000 = 200) e o SIMPLIFICADO são calculados; vence o menor", () => {
    const r = calcularIrrf({ rendaTributavel: $("4000.00"), contribuicao: $("255.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF });
    const a = r.cenarios.find((c) => c.nome === "DEDUCOES_LEGAIS")!;
    const b = r.cenarios.find((c) => c.nome === "DEDUCOES_LEGAIS_COM_REDUTOR")!;
    const c = r.cenarios.find((c) => c.nome === "DESCONTO_SIMPLIFICADO")!;
    const d = r.cenarios.find((c) => c.nome === "DESCONTO_SIMPLIFICADO_COM_REDUTOR")!;
    expect(a.base.toFixed(2)).toBe("3745.00");
    expect(a.valor.toFixed(2)).toBe(porFormulaSimplificada($("3745.00"), IRRF.faixas).toFixed(2)); // 354.88
    expect(b.valor.toFixed(2)).toBe(toMoney(a.valor.minus(200)).toFixed(2));
    // C = 4000 − 600 (o simplificado SUBSTITUI a contribuição) = 3400 → 3400 × 27,5% − 675 = 260,00.
    expect(c.base.toFixed(2)).toBe("3400.00");
    expect(c.valor.toFixed(2)).toBe(porFormulaSimplificada($("3400.00"), IRRF.faixas).toFixed(2)); // 260.00
    // A = 354,88; B = 154,88; C = 260,00; D = 260,00 − 200 = 60,00 → vence D.
    expect(a.valor.toFixed(2)).toBe("354.88");
    expect(c.valor.toFixed(2)).toBe("260.00");
    expect(d.valor.toFixed(2)).toBe("60.00");
    expect(r.cenario).toBe("DESCONTO_SIMPLIFICADO_COM_REDUTOR");
    expect(r.valor.toFixed(2)).toBe("60.00");
  });
  it("com 3 dependentes as deduções legais vencem o simplificado (600 < 3×200 + …)", () => {
    const r = calcularIrrf({ rendaTributavel: $("4000.00"), contribuicao: $("255.00"), dependentes: 3, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF });
    expect(["DEDUCOES_LEGAIS", "DEDUCOES_LEGAIS_COM_REDUTOR"]).toContain(r.cenario);
    expect(r.cenarios.find((c) => c.nome === "DEDUCOES_LEGAIS")!.deducoes.map((d) => d.tipo)).toContain("DEPENDENTES (3 × 200,00)");
  });
  it("acima da renda máxima do redutor, o redutor zera (cenário B = A)", () => {
    const r = calcularIrrf({ rendaTributavel: $("6000.00"), contribuicao: $("500.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF });
    const a = r.cenarios.find((c) => c.nome === "DEDUCOES_LEGAIS")!;
    const b = r.cenarios.find((c) => c.nome === "DEDUCOES_LEGAIS_COM_REDUTOR")!;
    expect(b.valor.toFixed(2)).toBe(a.valor.toFixed(2));
    expect(b.deducoes.find((d) => d.tipo === "REDUTOR")!.valor.toFixed(2)).toBe("0.00");
  });
  it("tabela SEM redutor e SEM simplificado: só as deduções legais são aplicáveis, e cada inaplicável diz por quê", () => {
    const r = calcularIrrf({ rendaTributavel: $("4000.00"), contribuicao: $("255.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: { ...IRRF, descontoSimplificado: null, redutorBase: null, redutorFator: null, redutorRendaMaxima: null } });
    expect(r.cenario).toBe("DEDUCOES_LEGAIS");
    expect(r.cenarios.filter((c) => !c.aplicavel).map((c) => c.motivo)).toEqual(["a tabela vigente não traz redutor", "a tabela vigente não traz desconto simplificado", "a tabela vigente não traz desconto simplificado"]);
  });
  it("65 anos ou mais: a parcela isenta da tabela abate a renda nos dois cenários", () => {
    const sem = calcularIrrf({ rendaTributavel: $("5000.00"), contribuicao: $(0), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF });
    const com = calcularIrrf({ rendaTributavel: $("5000.00"), contribuicao: $(0), dependentes: 0, pensaoAlimenticia: $(0), maior65: true, tabela: IRRF });
    expect(com.cenarios[0]!.base.toFixed(2)).toBe(toMoney(sem.cenarios[0]!.base.minus(1900)).toFixed(2));
    expect(com.valor.lt(sem.valor)).toBe(true);
  });
});

describe("(4) salário-família — por dependente elegível, renda até a máxima, idade no 1º dia do mês", () => {
  const dep = (id: string, nasc: Date, extra: Partial<{ invalidezPermanente: boolean; finalidadeVigente: boolean }> = {}) => ({ id, nome: id, dataNascimento: nasc, invalidezPermanente: false, finalidadeVigente: true, ...extra });
  it("renda 1500 com DOIS filhos pequenos = 2 × 60", () => {
    const r = calcularSalarioFamilia({ rendaBruta: $("1500.00"), dependentes: [dep("a", D(2018, 3, 15)), dep("b", D(2020, 1, 1))], tabela: SF, competencia: "2026-05" });
    expect(r.elegiveis).toBe(2);
    expect(r.valor.toFixed(2)).toBe("120.00");
  });
  it("quem faz 14 anos no dia 20 do mês recebe o mês inteiro; quem já tinha 14 no dia 1º não recebe — e o motivo diz a idade", () => {
    const r = calcularSalarioFamilia({ rendaBruta: $("1500.00"), dependentes: [dep("faz-no-mes", D(2012, 5, 20)), dep("ja-tinha", D(2012, 4, 30))], tabela: SF, competencia: "2026-05" });
    expect(r.considerados.find((c) => c.id === "faz-no-mes")!.elegivel).toBe(true);
    const ja = r.considerados.find((c) => c.id === "ja-tinha")!;
    expect(ja.elegivel).toBe(false);
    expect(ja.motivo).toMatch(/idade 14 ≥ limite 14/);
  });
  it("invalidez permanente suspende o limite; finalidade não vigente não conta; um centavo acima da renda zera tudo com o motivo", () => {
    const ok = calcularSalarioFamilia({ rendaBruta: $("2000.00"), dependentes: [dep("inv", D(2000, 1, 1), { invalidezPermanente: true }), dep("fora", D(2020, 1, 1), { finalidadeVigente: false })], tabela: SF, competencia: "2026-05" });
    expect(ok.elegiveis).toBe(1);
    const acima = calcularSalarioFamilia({ rendaBruta: $("2000.01"), dependentes: [dep("a", D(2020, 1, 1))], tabela: SF, competencia: "2026-05" });
    expect(acima.valor.toFixed(2)).toBe("0.00");
    expect(acima.considerados[0]!.motivo).toMatch(/renda bruta 2\.000,01 acima da máxima 2\.000,00/);
  });
});

describe("(5) dias computados — mês fiscal de 30", () => {
  it("admitido dia 12 → 19/30; desligado dia 10 → 10/30; admitido e desligado no mês → dias entre", () => {
    expect(diasComputados({ dataAdmissao: D(2026, 5, 12), dataDesligamento: null, afastamentos: [] }, "2026-05").dias).toBe(19);
    expect(diasComputados({ dataAdmissao: D(2020, 1, 1), dataDesligamento: D(2026, 5, 10), afastamentos: [] }, "2026-05").dias).toBe(10);
    expect(diasComputados({ dataAdmissao: D(2026, 5, 5), dataDesligamento: D(2026, 5, 14), afastamentos: [] }, "2026-05").dias).toBe(10);
  });
  it("31 conta como 30; vínculo fora do mês → 0 com o motivo", () => {
    expect(diasComputados({ dataAdmissao: D(2026, 5, 31), dataDesligamento: null, afastamentos: [] }, "2026-05").dias).toBe(1);
    expect(diasComputados({ dataAdmissao: D(2026, 6, 1), dataDesligamento: null, afastamentos: [] }, "2026-05")).toEqual({ dias: 0, explicacao: "admissão em 2026-06-01, depois da competência" });
    expect(diasComputados({ dataAdmissao: D(2020, 1, 1), dataDesligamento: D(2026, 4, 30), afastamentos: [] }, "2026-05").dias).toBe(0);
  });
  it("afastamento do dia 5 ao retorno no dia 10 tira 5 dias; dois afastamentos sobrepostos contam UMA vez; afastamento aberto vai até o fim", () => {
    expect(diasComputados({ dataAdmissao: D(2020, 1, 1), dataDesligamento: null, afastamentos: [{ inicio: D(2026, 5, 5), fim: D(2026, 5, 10) }] }, "2026-05").dias).toBe(25);
    expect(diasComputados({ dataAdmissao: D(2020, 1, 1), dataDesligamento: null, afastamentos: [{ inicio: D(2026, 5, 5), fim: D(2026, 5, 10) }, { inicio: D(2026, 5, 8), fim: D(2026, 5, 12) }] }, "2026-05").dias).toBe(23);
    expect(diasComputados({ dataAdmissao: D(2020, 1, 1), dataDesligamento: null, afastamentos: [{ inicio: D(2026, 4, 20), fim: null }] }, "2026-05").dias).toBe(0);
  });
});

describe("(6) o contracheque — linhas, totais, memória, hash", () => {
  it("3000 integral: PREV 255, IRRF pelo menor cenário, líquido = proventos − descontos; a memória traz as fundamentações; o hash é determinístico", () => {
    const c1 = calcularContracheque(entrada());
    const c2 = calcularContracheque(entrada());
    expect(c1.totais.proventos.toFixed(2)).toBe("3600.00"); // VENC 3000 + INSAL 20% = 600
    expect(c1.totais.contribuicao.toFixed(2)).toBe("339.00"); // 75 + 180 + 600×14%
    const irrf = calcularIrrf({ rendaTributavel: $("3600.00"), contribuicao: $("339.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF });
    expect(c1.totais.irrf.toFixed(2)).toBe(irrf.valor.toFixed(2));
    expect(c1.totais.liquido.toFixed(2)).toBe(toMoney(c1.totais.proventos.minus(c1.totais.descontos)).toFixed(2));
    expect(c1.sha256).toHaveLength(64);
    expect(c1.sha256).toBe(c2.sha256);
    expect(canonico(c1.memoria)).toBe(canonico(c2.memoria));
    const linhas = c1.linhas.map((l) => `${l.codigo}=${l.valor.toFixed(2)}`);
    expect(linhas).toContain("VENC=3000.00");
    expect(linhas).toContain("INSAL=600.00");
    expect(linhas).toContain("PREV=339.00");
    expect(JSON.stringify(c1.memoria)).toContain("FIXTURE de teste — não é a portaria");
  });
  it("mudar um centavo muda o hash (o hash cobre o conteúdo, não a estrutura)", () => {
    const a = calcularContracheque(entrada());
    const b = calcularContracheque(entrada({ vencimentoBase: $("3000.01") }));
    expect(a.sha256).not.toBe(b.sha256);
    expect(sha256Canonico({ b: 1, a: 2 })).toBe(sha256Canonico({ a: 2, b: 1 }));
  });
  it("19/30 dias: só a rubrica proporcional encolhe (VENC 1900); a insalubridade (percentual, não proporcional) fica sobre o vencimento cheio", () => {
    const c = calcularContracheque(entrada({ dias: { dias: 19, explicacao: "19/30 dias (admitido no dia 12)" } }));
    expect(c.linhas.find((l) => l.codigo === "VENC")!.valor.toFixed(2)).toBe("1900.00");
    expect(c.linhas.find((l) => l.codigo === "VENC")!.memoria).toMatch(/× 19\/30 dias/);
    expect(c.linhas.find((l) => l.codigo === "INSAL")!.valor.toFixed(2)).toBe("600.00");
  });
  it("lançamentos: horas extras (provento informado) entram na base; consignado (desconto informado) só no líquido; gratificações do vínculo somam", () => {
    const c = calcularContracheque(entrada({ gratificacoes: [{ descricao: "FG-1", valor: $("400.00") }], lancamentos: [{ id: "l1", rubricaId: "r-HEXT", tipo: "VARIAVEL", valor: $("250.00") }, { id: "l2", rubricaId: "r-CONSIG", tipo: "FIXO", valor: $("100.00") }] }));
    expect(c.totais.proventos.toFixed(2)).toBe("4250.00"); // 3000 + 400 + 250 + 600
    expect(c.totais.baseContribuicao.toFixed(2)).toBe("4250.00");
    expect(c.linhas.find((l) => l.codigo === "CONSIG")!.valor.toFixed(2)).toBe("100.00");
    expect(c.totais.descontos.toFixed(2)).toBe(toMoney(c.totais.contribuicao.plus(c.totais.irrf).plus(100)).toFixed(2));
  });
  it("salário-família entra como provento que NÃO incide (base de contribuição não muda)", () => {
    const c = calcularContracheque(entrada({ vencimentoBase: $("1200.00"), dependentesSalarioFamilia: [{ id: "d", nome: "d", dataNascimento: D(2020, 1, 1), invalidezPermanente: false, finalidadeVigente: true }] }));
    expect(c.salarioFamilia!.valor.toFixed(2)).toBe("60.00");
    expect(c.totais.proventos.toFixed(2)).toBe("1500.00"); // 1200 + 240 + 60
    expect(c.totais.baseContribuicao.toFixed(2)).toBe("1440.00");
  });
  it("NEGAÇÕES com motivo: sem vencimento; sem rubrica sistêmica", () => {
    expect(() => calcularContracheque(entrada({ vencimentoBase: null }))).toThrow(VencimentoAusenteError);
    expect(() => calcularContracheque(entrada({ rubricas: RUBRICAS.filter((r) => r.natureza !== "IMPOSTO_DE_RENDA") }))).toThrow(/RUBRICA-AUSENTE: não há rubrica de natureza IMPOSTO_DE_RENDA/);
  });
});

describe("(7) a mesma pessoa com duas matrículas — base agregada, teto e imposto rateados (5.12.79)", () => {
  it("duas matrículas RGPS de 5000: sozinhas pagariam 2 × 535; juntas a base é 10000 → teto 8000 → 955, rateados 477,50 + 477,50", () => {
    const imp = imposicoesDaPessoa({
      competencia: "2026-05",
      vinculos: [
        { id: "a", matricula: "A", regime: "RGPS", baseContribuicao: $("5000.00"), contribuicaoSozinho: $("535.00"), rendaTributavel: $("5000.00") },
        { id: "b", matricula: "B", regime: "RGPS", baseContribuicao: $("5000.00"), contribuicaoSozinho: $("535.00"), rendaTributavel: $("5000.00") },
      ],
      dataNascimento: D(1985, 1, 1), dependentesIr: 0, pensaoAlimenticia: $(0), tabelas: { contribuicao: CONTRIB_RGPS, irrf: IRRF },
    });
    expect(imp.get("a")!.contribuicao!.valor.toFixed(2)).toBe("477.50");
    expect(imp.get("b")!.contribuicao!.valor.toFixed(2)).toBe("477.50");
    expect(imp.get("a")!.contribuicao!.explicacao).toMatch(/bases somadas 10\.000,00 → teto 8\.000,00 = 955,00/);
    // IRRF: uma fonte — renda 10000, contribuição 955, sem dependentes; rateado meio a meio; a soma bate com o cálculo único
    const total = calcularIrrf({ rendaTributavel: $("10000.00"), contribuicao: $("955.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF }).valor;
    expect(toMoney(imp.get("a")!.irrf!.valor.plus(imp.get("b")!.irrf!.valor)).toFixed(2)).toBe(total.toFixed(2));
  });
  it("o centavo do rateio fica no ÚLTIMO, e a soma fecha exata (bases 1000 e 2000 → terços)", () => {
    const imp = imposicoesDaPessoa({
      competencia: "2026-05",
      vinculos: [
        { id: "a", matricula: "A", regime: "RGPS", baseContribuicao: $("1000.00"), contribuicaoSozinho: $("75.00"), rendaTributavel: $("1000.00") },
        { id: "b", matricula: "B", regime: "RGPS", baseContribuicao: $("2000.00"), contribuicaoSozinho: $("165.00"), rendaTributavel: $("2000.00") },
      ],
      dataNascimento: D(1985, 1, 1), dependentesIr: 0, pensaoAlimenticia: $(0), tabelas: { contribuicao: CONTRIB_RGPS, irrf: IRRF },
    });
    const a = imp.get("a")!.contribuicao!.valor;
    const b = imp.get("b")!.contribuicao!.valor;
    expect(toMoney(a.plus(b)).toFixed(2)).toBe("255.00"); // 3000 agregados: 75 + 180
    expect(a.toFixed(2)).toBe("85.00");
    expect(b.toFixed(2)).toBe("170.00");
  });
  it("RPPS + RGPS não agregam a contribuição (regimes independentes), mas o IRRF é de uma fonte só; um vínculo só → nada imposto", () => {
    const imp = imposicoesDaPessoa({
      competencia: "2026-05",
      vinculos: [
        { id: "a", matricula: "A", regime: "RPPS", baseContribuicao: $("5000.00"), contribuicaoSozinho: $("700.00"), rendaTributavel: $("5000.00") },
        { id: "b", matricula: "B", regime: "RGPS", baseContribuicao: $("5000.00"), contribuicaoSozinho: $("535.00"), rendaTributavel: $("5000.00") },
      ],
      dataNascimento: D(1985, 1, 1), dependentesIr: 0, pensaoAlimenticia: $(0), tabelas: { contribuicao: CONTRIB_RGPS, irrf: IRRF },
    });
    expect(imp.get("a")!.contribuicao).toBeUndefined();
    expect(imp.get("b")!.contribuicao).toBeUndefined();
    const total = calcularIrrf({ rendaTributavel: $("10000.00"), contribuicao: $("1235.00"), dependentes: 0, pensaoAlimenticia: $(0), maior65: false, tabela: IRRF }).valor;
    expect(toMoney(imp.get("a")!.irrf!.valor.plus(imp.get("b")!.irrf!.valor)).toFixed(2)).toBe(total.toFixed(2));
    expect(imposicoesDaPessoa({ competencia: "2026-05", vinculos: [{ id: "a", matricula: "A", regime: "RGPS", baseContribuicao: $(1), contribuicaoSozinho: $(0), rendaTributavel: $(1) }], dataNascimento: D(1985, 1, 1), dependentesIr: 0, pensaoAlimenticia: $(0), tabelas: { contribuicao: CONTRIB_RGPS, irrf: IRRF } }).size).toBe(0);
  });
});

describe("(8) a tabela vigente — a de início mais recente; ambiguidade recusa", () => {
  it("escolhe a mais recente entre as vigentes; sem vigente nomeia a competência; duas com o mesmo início é ambíguo", () => {
    const t = (inicio: string, fim: string | null, id: string) => ({ id, competenciaInicio: inicio, competenciaFim: fim });
    expect(escolherVigente([t("2025-01", null, "velha"), t("2026-01", null, "nova")], "2026-05", "IRRF").id).toBe("nova");
    expect(escolherVigente([t("2025-01", "2025-12", "velha"), t("2026-01", null, "nova")], "2025-06", "IRRF").id).toBe("velha");
    expect(() => escolherVigente([t("2026-06", null, "futura")], "2026-05", "IRRF")).toThrow(/TABELA-AUSENTE: não há tabela de IRRF vigente na competência 2026-05/);
    expect(() => escolherVigente([t("2026-01", null, "a"), t("2026-01", null, "b")], "2026-05", "CONTRIBUICAO")).toThrow(/ambíguo/);
  });
  it("a situação da folha é derivada dos fatos", () => {
    expect(situacaoDaFolha({ calculos: [], fechada: false })).toBe("SEM_CALCULO");
    expect(situacaoDaFolha({ calculos: [{ cancelada: true }], fechada: false })).toBe("SEM_CALCULO");
    expect(situacaoDaFolha({ calculos: [{ cancelada: true }, { cancelada: false }], fechada: false })).toBe("CALCULADA");
    expect(situacaoDaFolha({ calculos: [{ cancelada: false }], fechada: true })).toBe("FECHADA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// O SERVIÇO — contra o banco isolado
// ═══════════════════════════════════════════════════════════════════════════════

async function pessoaFisica(documento: string, nome: string): Promise<string> {
  const p = await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome, criadoPor: POR } } }, select: { id: true } });
  return p.id;
}

async function tabelasDoEnte(opcoes: { readonly semRpps?: boolean } = {}): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "1000.00", aliquota: "0.075" }, { ordem: 2, ate: "3000.00", aliquota: "0.09" }, { ordem: 3, ate: null, aliquota: "0.14" }], criadoPor: POR });
  if (opcoes.semRpps !== true) await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.14" }], criadoPor: POR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", descontoSimplificado: "600.00", isencaoMaior65: "1900.00", redutorBase: "1000.00", redutorFator: "0.2", redutorRendaMaxima: "5000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: "2000.00", aliquota: "0" }, { ordem: 2, ate: "3000.00", aliquota: "0.15", parcelaADeduzir: "300.00" }, { ordem: 3, ate: null, aliquota: "0.275", parcelaADeduzir: "675.00" }], criadoPor: POR });
  await cadastrarTabelaSalarioFamilia(prisma, { competenciaInicio: "2026-01", rendaMaxima: "2000.00", valorPorDependente: "60.00", idadeLimite: 14, fundamentacaoLegal: "FIXTURE de teste", criadoPor: POR });
}
async function rubricasDoEnte(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => { ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId; };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "GRAT", descricao: "Gratificações", tipo: "PROVENTO", natureza: "GRATIFICACOES_DO_VINCULO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 2, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "PREV", descricao: "Contribuição", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: POR });
  await r({ codigo: "SFAM", descricao: "Salário-família", tipo: "PROVENTO", natureza: "SALARIO_FAMILIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 50, fundamentacaoLegal: "fixture", criadoPor: POR });
  return ids;
}

async function servidorComVinculo(doc: string, nome: string, matricula: string, salario: string, regime: "RGPS" | "RPPS" | "ISENTO" | undefined, admissao = D(2026, 1, 1)): Promise<{ readonly servidor: string; readonly vinculo: string; readonly cargo: string; readonly lotacao: string }> {
  const cargo = (await prisma.cargo.findFirst({ select: { id: true } }))?.id ?? (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 10, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: POR })).cargoId;
  const lotacao = (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ?? (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: POR })).lotacaoId;
  const pessoa = await pessoaFisica(doc, nome);
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: pessoa, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: POR });
  const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", ...(regime === undefined ? {} : { regimePrevidenciario: regime }), dataAdmissao: admissao, cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: POR });
  return { servidor: servidorId, vinculo: vinculoId, cargo, lotacao };
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("(9) o serviço — fail-closed, fatos numerados, fechamento", () => {
  it("sem tabela de IRRF vigente a folha RECUSA nomeando a competência — e não grava cálculo", async () => {
    await rubricasDoEnte();
    await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", "RGPS");
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR })).rejects.toThrow(/TABELA-AUSENTE: não há tabela de IRRF vigente na competência 2026-05/);
    expect(await prisma.calculoDaFolha.count()).toBe(0);
  });
  it("vínculo sem regime previdenciário é recusado nomeando a matrícula; tabela do regime ausente idem", async () => {
    await tabelasDoEnte({ semRpps: true });
    await rubricasDoEnte();
    await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", undefined);
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR })).rejects.toThrow(VinculoSemRegimeError);
    // O regime do vínculo legado se informa por FATO DATADO (M32), não por UPDATE mudo.
    const semRegime = await prisma.vinculo.findUniqueOrThrow({ where: { matricula: "M-1" }, select: { id: true } });
    await registrarMovimentacao(prisma, { vinculoId: semRegime.id, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 1, 1), motivo: "carga do regime previdenciario", regimePrevidenciario: "RGPS", criadoPor: POR });
    await servidorComVinculo("55566677788", "Bia", "M-2", "3000.00", "RPPS");
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR })).rejects.toThrow(/regime RPPS, exigido pela matrícula M-2/);
    expect(await prisma.calculoDaFolha.count()).toBe(0);
  });
  it("calcula, grava contracheques com memória e hash, recalcula como nº 2, cancela o nº 1, fecha sobre o nº 2 e recusa o terceiro cálculo", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    const a = await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", "RGPS");
    await servidorComVinculo("55566677788", "Bia", "M-2", "12000.00", "RPPS");
    await lancarNaFolha(prisma, { vinculoId: a.vinculo, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "250.00", observacao: "20 horas extras", criadoPor: POR });
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    await expect(abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR })).rejects.toThrow(/FOLHA-JA-ABERTA/);

    const c1 = await calcularFolha(prisma, { folhaId, criadoPor: POR });
    expect(c1.numero).toBe(1);
    expect(c1.contracheques).toBe(2);
    const contra = await prisma.contracheque.findMany({ where: { calculoId: c1.calculoId }, include: { linhas: { orderBy: { ordem: "asc" } }, vinculo: { select: { matricula: true } } } });
    const ana = contra.find((c) => c.vinculo.matricula === "M-1")!;
    const bia = contra.find((c) => c.vinculo.matricula === "M-2")!;
    expect(ana.totalProventos.toFixed(2)).toBe("3250.00");
    expect(ana.contribuicao.toFixed(2)).toBe("290.00"); // 75 + 180 + 250×14%
    expect(ana.linhas.map((l) => l.memoria).join(" | ")).toMatch(/lançamento\(s\) variavel 250.00/);
    expect(bia.regime).toBe("RPPS");
    expect(bia.contribuicao.toFixed(2)).toBe("1680.00");
    expect(bia.liquido.toFixed(2)).toBe(toMoney(bia.totalProventos.minus(bia.totalDescontos)).toFixed(2));
    expect(ana.sha256).toHaveLength(64);
    expect(JSON.stringify(ana.memoria)).toContain("FIXTURE de teste");
    expect(c1.totalLiquido.toFixed(2)).toBe(toMoney(ana.liquido.plus(bia.liquido)).toFixed(2));

    // recalcular sem mudar nada: nº 2, mesmo hash do conjunto (determinístico)
    const c2 = await calcularFolha(prisma, { folhaId, motivo: "conferência", criadoPor: POR });
    expect(c2.numero).toBe(2);
    expect(c2.sha256).toBe(c1.sha256);

    await cancelarCalculoDaFolha(prisma, { calculoId: c1.calculoId, motivo: "substituído pelo nº 2", criadoPor: POR });
    await expect(cancelarCalculoDaFolha(prisma, { calculoId: c1.calculoId, motivo: "de novo", criadoPor: POR })).rejects.toThrow(/CALCULO-JA-CANCELADO/);

    const f = await fecharFolha(prisma, { folhaId, criadoPor: POR });
    expect(f.numero).toBe(2);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: POR })).rejects.toThrow(/FOLHA-FECHADA.*cálculo nº 2/);
    await expect(fecharFolha(prisma, { folhaId, criadoPor: POR })).rejects.toThrow(/FOLHA-JA-FECHADA/);
    await expect(cancelarCalculoDaFolha(prisma, { calculoId: c2.calculoId, motivo: "tarde demais", criadoPor: POR })).rejects.toThrow(/CALCULO-FECHADO/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(2); // nada apagado
  });
  it("a promoção de JUNHO não muda a folha de MAIO; o afastamento em maio reduz os dias; o desligado em abril fica FORA", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    const a = await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", "RGPS");
    const cargoDir = (await cadastrarCargo(prisma, { codigo: "DIR", denominacao: "Diretor", tipo: "COMISSAO", vagasFixadas: 1, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: POR })).cargoId;
    await registrarAlteracaoRemuneratoria(prisma, { vinculoId: a.vinculo, tipo: "PROMOCAO", data: D(2026, 6, 1), cargoId: cargoDir, salarioBase: "5000.00", motivo: "promocao", criadoPor: POR });
    await registrarMovimentacao(prisma, { vinculoId: a.vinculo, tipo: "AFASTAMENTO", data: D(2026, 5, 21), motivo: "licenca", criadoPor: POR });
    const b = await servidorComVinculo("55566677788", "Bia", "M-2", "3000.00", "RGPS");
    const { desligarServidor } = await import("../m32-pessoal/servico.js");
    await desligarServidor(prisma, { vinculoId: b.vinculo, data: D(2026, 4, 30), motivo: "exoneracao", criadoPor: POR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    const c = await calcularFolha(prisma, { folhaId, criadoPor: POR });
    expect(c.contracheques).toBe(1); // Bia desligada em abril não entra
    const ana = await prisma.contracheque.findFirstOrThrow({ where: { calculoId: c.calculoId }, include: { linhas: true } });
    expect(ana.diasComputados).toBe(20); // afastada do dia 21 ao fim
    expect(ana.linhas.find((l) => l.memoria.startsWith("vencimento-base"))!.valorBase.toFixed(2)).toBe("3000.00"); // maio: ainda 3000
    expect(ana.linhas.find((l) => l.memoria.startsWith("vencimento-base"))!.valor.toFixed(2)).toBe("2000.00"); // 3000 × 20/30

    const junho = await abrirFolha(prisma, { competencia: "2026-06", criadoPor: POR });
    const cj = await calcularFolha(prisma, { folhaId: junho.folhaId, criadoPor: POR });
    const anaJunho = await prisma.contracheque.findFirstOrThrow({ where: { calculoId: cj.calculoId } });
    expect(anaJunho.diasComputados).toBe(0); // afastamento aberto atravessa junho
    expect(anaJunho.totalProventos.toFixed(2)).toBe("0.00");
  });
  it("⚠️ a MIGRAÇÃO DE REGIME em junho não muda a folha de maio: maio contribui pelo RGPS (faixas), junho pelo RPPS (linear)", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    const a = await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", "RGPS");
    await registrarMovimentacao(prisma, { vinculoId: a.vinculo, tipo: "MUDANCA_REGIME_PREVIDENCIARIO", data: D(2026, 6, 1), motivo: "migracao ao regime proprio", regimePrevidenciario: "RPPS", criadoPor: POR });

    const maio = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    const cMaio = await calcularFolha(prisma, { folhaId: maio.folhaId, criadoPor: POR });
    const contraMaio = await prisma.contracheque.findFirstOrThrow({ where: { calculoId: cMaio.calculoId } });
    expect(contraMaio.regime).toBe("RGPS");
    expect(contraMaio.contribuicao.toFixed(2)).toBe("255.00"); // 1000x7,5% + 2000x9%

    const junho = await abrirFolha(prisma, { competencia: "2026-06", criadoPor: POR });
    const cJunho = await calcularFolha(prisma, { folhaId: junho.folhaId, criadoPor: POR });
    const contraJunho = await prisma.contracheque.findFirstOrThrow({ where: { calculoId: cJunho.calculoId } });
    expect(contraJunho.regime).toBe("RPPS");
    expect(contraJunho.contribuicao.toFixed(2)).toBe("420.00"); // 3000 x 14% linear

    // ⚠️ E RECALCULAR MAIO DEPOIS DA MIGRAÇÃO CONTINUA DANDO MAIO: é o recálculo que se faz quando
    // alguém contesta o desconto, e ele não pode aplicar a tabela de hoje ao mês de ontem.
    const cMaio2 = await calcularFolha(prisma, { folhaId: maio.folhaId, criadoPor: POR });
    const contraMaio2 = await prisma.contracheque.findFirstOrThrow({ where: { calculoId: cMaio2.calculoId } });
    expect(contraMaio2.regime).toBe("RGPS");
    expect(contraMaio2.contribuicao.toFixed(2)).toBe("255.00");
    expect(cMaio2.sha256).toBe(cMaio.sha256);
  });

  it("duas matrículas da mesma pessoa: a contribuição RGPS é agregada e rateada; a memória diz que foi imposta", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    const a = await servidorComVinculo("11122233344", "Ana", "M-1", "5000.00", "RGPS");
    await admitirServidor(prisma, { servidorId: a.servidor, matricula: "M-1B", tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RGPS", dataAdmissao: D(2026, 1, 1), cargoId: a.cargo, lotacaoId: a.lotacao, salarioBase: "5000.00", criadoPor: POR });
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: POR });
    const c = await calcularFolha(prisma, { folhaId, criadoPor: POR });
    const contra = await prisma.contracheque.findMany({ where: { calculoId: c.calculoId } });
    expect(contra.map((x) => x.contribuicao.toFixed(2)).sort()).toEqual(["477.50", "477.50"]);
    expect(JSON.stringify(contra[0]!.memoria)).toMatch(/imposta.*RGPS agregado \(M-1, M-1B\)/);
  });
  it("NEGAÇÕES do cadastro com motivo: segunda rubrica sistêmica; lançamento em rubrica calculada; tabela ambígua; redutor incompleto; sem a ação", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await expect(cadastrarRubrica(prisma, { codigo: "VENC2", descricao: "Outro vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 5, fundamentacaoLegal: "fixture", criadoPor: POR })).rejects.toThrow(/RUBRICA-SISTEMICA-DUPLICADA: a natureza VENCIMENTO_BASE já é da rubrica VENC/);
    const a = await servidorComVinculo("11122233344", "Ana", "M-1", "3000.00", "RGPS");
    await expect(lancarNaFolha(prisma, { vinculoId: a.vinculo, rubricaId: ids["PREV"]!, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "10.00", criadoPor: POR })).rejects.toThrow(/RUBRICA-NAO-INFORMAVEL: a rubrica PREV é CONTRIBUICAO_PREVIDENCIARIA/);
    await expect(cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "1", fundamentacaoLegal: "fixture", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: POR })).rejects.toThrow(/TABELA-AMBIGUA/);
    await expect(cadastrarTabelaIrrf(prisma, { competenciaInicio: "2027-01", deducaoPorDependente: "1", redutorBase: "10", fundamentacaoLegal: "fixture", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: POR })).rejects.toThrow(/REDUTOR-INCOMPLETO/);
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" } });
    await expect(abrirFolha(prisma, { competencia: "2026-07", criadoPor: SEM_PODER })).rejects.toThrow(/ABRIR_FOLHA/);
    expect(await prisma.folhaDePagamento.count({ where: { competencia: "2026-07" } })).toBe(0);
  });
  it("a tabela recusa faixas inválidas antes de tocar o banco", async () => {
    await expect(cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", fundamentacaoLegal: "fixture", faixas: [{ ordem: 1, ate: "100", aliquota: "0.1" }, { ordem: 2, ate: "50", aliquota: "0.2" }], criadoPor: POR })).rejects.toThrow(FaixasInvalidasError);
    expect(await prisma.tabelaDeContribuicao.count()).toBe(0);
    expect(() => new TabelaAusenteError("IRRF", "2026-01")).not.toThrow();
  });
});
