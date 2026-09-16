import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, cadastrarTabelaSalarioFamilia, calcularFolha, lancarNaFolha } from "./servico.js";
import { AprovacaoPeloProprioAutorError, aprovarVersaoDaRubrica, competenciaAnterior, criarVersaoDaRubrica, revogarVersaoDaRubrica } from "./versao-servico.js";
import { CicloDeRubricasError, DependenciaInexistenteError, DependenciaPosteriorError } from "./rubrica-versionada.js";

/**
 * M33 / V11 V1.1 — A RUBRICA VERSIONADA. Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ OS NÚMEROS ESPERADOS ESTÃO CALCULADOS À MÃO, com a conta escrita ao lado. Conferir o motor
 * chamando o motor é o defeito que este repositório já registrou em parser.
 *
 * ⚠️ AS TABELAS SÃO FIXTURES SINTÉTICAS. Nenhum valor aqui afirma alíquota oficial.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "contabilidade@cg.pb.gov.br";
const REVISOR = "tesouraria@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

async function tabelasDoEnte(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RGPS", competenciaInicio: "2026-01", teto: "8000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: AUTOR });
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.14" }], criadoPor: AUTOR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "200.00", descontoSimplificado: "600.00", isencaoMaior65: "1900.00", redutorBase: "1000.00", redutorFator: "0.2", redutorRendaMaxima: "5000.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: AUTOR });
  await cadastrarTabelaSalarioFamilia(prisma, { competenciaInicio: "2026-01", rendaMaxima: "2000.00", valorPorDependente: "60.00", idadeLimite: 14, fundamentacaoLegal: "FIXTURE de teste", criadoPor: AUTOR });
}

/** As rubricas sistêmicas mínimas para a folha calcular, mais as deste teste. */
async function rubricasDoEnte(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => { ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId; };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "ADNOT", descricao: "Adicional noturno", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "INSAL", descricao: "Insalubridade", tipo: "PROVENTO", natureza: "FORMULA", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 4, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "PREV", descricao: "Contribuição", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  return ids;
}

async function vinculo(doc: string, matricula: string, salario: string, regime: "RGPS" | "RPPS"): Promise<string> {
  const cargo = (await prisma.cargo.findFirst({ select: { id: true } }))?.id ?? (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 10, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: AUTOR })).cargoId;
  const lotacao = (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ?? (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: AUTOR })).lotacaoId;
  const p = await prisma.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: AUTOR, versoes: { create: { nome: `Servidor ${matricula}`, criadoPor: AUTOR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: AUTOR });
  const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: regime, dataAdmissao: D(2026, 1, 1), cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: AUTOR });
  return vinculoId;
}

/** Cria a versão da fórmula e a aprova com OUTRA pessoa. */
async function versaoAprovada(rubricaId: string, p: { readonly formula?: string | null; readonly competenciaInicio: string; readonly regime?: "TODOS" | "RGPS" | "RPPS" }): Promise<string> {
  const { versaoId } = await criarVersaoDaRubrica(prisma, {
    rubricaId, competenciaInicio: p.competenciaInicio, formula: p.formula ?? null,
    incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2,
    regime: p.regime ?? "TODOS", fundamentacaoLegal: "Lei municipal sintética 7/2026", criadoPor: AUTOR,
  });
  await aprovarVersaoDaRubrica(prisma, { versaoId, aprovadoPor: REVISOR });
  return versaoId;
}

async function linhasDaFolha(competencia: string): Promise<ReadonlyMap<string, string>> {
  const { folhaId } = await abrirFolha(prisma, { competencia, criadoPor: AUTOR });
  await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
  const linhas = await prisma.linhaDoContracheque.findMany({ select: { valor: true, memoria: true, rubrica: { select: { codigo: true } } } });
  return new Map(linhas.map((l) => [l.rubrica.codigo, l.valor.toFixed(2)]));
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("V11 V1.1 (d) — a fórmula do ente chega ao contracheque", () => {
  it("d1: a fórmula que cita OUTRA rubrica calcula na ordem do grafo, e o valor bate com a conta à mão", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    const v = await vinculo("11111111111", "M-1", "3000.00", "RPPS");
    // INSAL = 10% de (vencimento + adicional noturno). ADNOT é lançamento variável de 150,00.
    await versaoAprovada(ids["INSAL"]!, { formula: "(vencimento_base + rubrica.ADNOT) * 0.10", competenciaInicio: "2026-01" });
    await lancarNaFolha(prisma, { vinculoId: v, rubricaId: ids["ADNOT"]!, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "150.00", criadoPor: AUTOR });

    const linhas = await linhasDaFolha("2026-05");
    // À MÃO: (3000,00 + 150,00) × 0,10 = 315,00.
    expect(linhas.get("INSAL")).toBe("315.00");
    expect(linhas.get("ADNOT")).toBe("150.00");
    expect(linhas.get("VENC")).toBe("3000.00");
    // A contribuição RPPS incide sobre 3000 + 150 + 315 = 3465,00 × 14% = 485,10.
    expect(linhas.get("PREV")).toBe("485.10");
  });

  it("d2: a memória diz a VERSÃO, a expressão, cada variável usada e o arredondamento", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await vinculo("22222222222", "M-2", "2000.00", "RPPS");
    await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.05", competenciaInicio: "2026-01" });
    await linhasDaFolha("2026-05");

    const linha = await prisma.linhaDoContracheque.findFirstOrThrow({ where: { rubrica: { codigo: "INSAL" } }, select: { valor: true, memoria: true } });
    expect(linha.valor.toFixed(2)).toBe("100.00"); // 2000,00 × 0,05
    expect(linha.memoria).toContain("fórmula da versão 1");
    expect(linha.memoria).toContain("vencimento_base * 0.05");
    expect(linha.memoria).toContain("vencimento_base=2000");
    expect(linha.memoria).toContain("2 casa(s) half-even");

    // ⚠️ E A MEMÓRIA CANÔNICA DO CONTRACHEQUE cita a versão de CADA rubrica — é o que permite
    // explicar, dois anos depois, por que aquele valor deu aquilo.
    const cc = await prisma.contracheque.findFirstOrThrow({ select: { memoria: true } });
    const memoria = JSON.parse(JSON.stringify(cc.memoria)) as { readonly linhas: readonly { readonly codigo: string; readonly versaoDaRubrica: number }[] };
    expect(memoria.linhas.find((l) => l.codigo === "INSAL")?.versaoDaRubrica).toBe(1);
  });

  it("d3: RASCUNHO não calcula nada; a aprovação é que faz a rubrica existir na folha", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await vinculo("33333333333", "M-3", "2000.00", "RPPS");
    const { versaoId } = await criarVersaoDaRubrica(prisma, {
      rubricaId: ids["INSAL"]!, competenciaInicio: "2026-01", formula: "vencimento_base * 0.05",
      incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2,
      regime: "TODOS", fundamentacaoLegal: "Lei sintética", criadoPor: AUTOR,
    });
    expect((await linhasDaFolha("2026-05")).has("INSAL")).toBe(false);

    await limparBancoDeFolha();
    await aprovarVersaoDaRubrica(prisma, { versaoId, aprovadoPor: REVISOR });
    expect((await linhasDaFolha("2026-05")).get("INSAL")).toBe("100.00");
  });

  it("d4: a versão de julho NÃO reescreve maio — o passado continua explicável", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await vinculo("44444444444", "M-4", "2000.00", "RPPS");
    await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.05", competenciaInicio: "2026-01" });
    await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.30", competenciaInicio: "2026-07" });

    // Maio: 2000 × 0,05 = 100,00. Julho: 2000 × 0,30 = 600,00.
    expect((await linhasDaFolha("2026-05")).get("INSAL")).toBe("100.00");
    await limparBancoDeFolha();
    expect((await linhasDaFolha("2026-07")).get("INSAL")).toBe("600.00");

    // ⚠️ E A VIGÊNCIA DA ANTERIOR FOI FECHADA no mês certo — não apagada.
    // A rubrica de fórmula nasce sem versão: a de janeiro é a 1 e a de julho é a 2. Quem foi
    // FECHADA é a 1 — e ela continua APROVADA, porque a folha de maio precisa dela para ser
    // explicada. Fechar vigência não é revogar.
    const primeira = await prisma.versaoDaRubrica.findFirstOrThrow({ where: { rubrica: { codigo: "INSAL" }, versao: 1 }, select: { competenciaFim: true, situacao: true } });
    expect(primeira.competenciaFim).toBe("2026-06");
    expect(primeira.situacao).toBe("APROVADA");
    const segunda = await prisma.versaoDaRubrica.findFirstOrThrow({ where: { rubrica: { codigo: "INSAL" }, versao: 2 }, select: { competenciaFim: true, competenciaInicio: true } });
    expect(segunda.competenciaInicio).toBe("2026-07");
    expect(segunda.competenciaFim).toBeNull();
    expect(competenciaAnterior("2026-01")).toBe("2025-12");
  });

  it("d5: o regime específico vence o TODOS, e o outro regime NÃO herda a regra", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await vinculo("55555555555", "M-RPPS", "2000.00", "RPPS");
    await vinculo("66666666666", "M-RGPS", "2000.00", "RGPS");
    await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.05", competenciaInicio: "2026-01", regime: "TODOS" });
    await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.30", competenciaInicio: "2026-01", regime: "RPPS" });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const linhas = await prisma.linhaDoContracheque.findMany({
      where: { rubrica: { codigo: "INSAL" } },
      select: { valor: true, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
    });
    const porMatricula = new Map(linhas.map((l) => [l.contracheque.vinculo.matricula, l.valor.toFixed(2)]));
    expect(porMatricula.get("M-RPPS")).toBe("600.00"); // 2000 × 0,30 — a versão do RPPS
    expect(porMatricula.get("M-RGPS")).toBe("100.00"); // 2000 × 0,05 — só a de TODOS lhe alcança
  });
});

describe("V11 V1.1 (e) — o que o cadastro RECUSA, e por quê", () => {
  it("e1: quem escreveu a versão não a aprova — e nada muda de situação", async () => {
    const ids = await rubricasDoEnte();
    const { versaoId } = await criarVersaoDaRubrica(prisma, {
      rubricaId: ids["INSAL"]!, competenciaInicio: "2026-01", formula: "vencimento_base * 0.05",
      incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2,
      regime: "TODOS", fundamentacaoLegal: "Lei sintética", criadoPor: AUTOR,
    });
    await expect(aprovarVersaoDaRubrica(prisma, { versaoId, aprovadoPor: AUTOR })).rejects.toThrow(AprovacaoPeloProprioAutorError);
    const v = await prisma.versaoDaRubrica.findUniqueOrThrow({ where: { id: versaoId }, select: { situacao: true, aprovadoPor: true } });
    expect(v.situacao).toBe("RASCUNHO");
    expect(v.aprovadoPor).toBeNull();
  });

  it("e2: ciclo, dependência inexistente e dependência posterior são três recusas DIFERENTES", async () => {
    const ids = await rubricasDoEnte();
    const criar = (rubricaId: string, formula: string): Promise<unknown> =>
      criarVersaoDaRubrica(prisma, {
        rubricaId, competenciaInicio: "2026-01", formula,
        incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2,
        regime: "TODOS", fundamentacaoLegal: "Lei sintética", criadoPor: AUTOR,
      });
    await expect(criar(ids["INSAL"]!, "rubrica.INSAL + 1")).rejects.toThrow(CicloDeRubricasError);
    await expect(criar(ids["INSAL"]!, "rubrica.NAO_EXISTE * 2")).rejects.toThrow(DependenciaInexistenteError);
    // PREV é a contribuição: calculada DEPOIS, sobre a base que inclui esta linha.
    await expect(criar(ids["INSAL"]!, "rubrica.PREV * 2")).rejects.toThrow(DependenciaPosteriorError);
    // ⚠️ ZERO, e não uma: a rubrica de FÓRMULA nasce SEM versão — não há expressão a aprovar
    // no momento do cadastro. As três tentativas recusadas não deixaram rastro.
    expect(await prisma.versaoDaRubrica.count({ where: { rubricaId: ids["INSAL"]! } })).toBe(0);
  });

  it("e3: a fuga do interpretador não passa, e FORMULA proporcional aos dias é recusada", async () => {
    const ids = await rubricasDoEnte();
    const criar = (formula: string, proporcional = false): Promise<unknown> =>
      criarVersaoDaRubrica(prisma, {
        rubricaId: ids["INSAL"]!, competenciaInicio: "2026-01", formula,
        incideContribuicao: true, incideIrrf: true, proporcionalAosDias: proporcional, casasDecimais: 2,
        regime: "TODOS", fundamentacaoLegal: "Lei sintética", criadoPor: AUTOR,
      });
    await expect(criar("this.constructor.constructor")).rejects.toThrow(/FORMULA-INVALIDA/);
    await expect(criar("process.env.DATABASE_URL")).rejects.toThrow(/FORMULA-INVALIDA/);
    // A proporcionalidade se escreve na fórmula (fator_dias); aplicar as duas contaria duas vezes.
    await expect(criar("vencimento_base * 0.05", true)).rejects.toThrow(/proporcional aos dias/);
  });

  it("e4: fórmula em rubrica que não é FORMULA, e FORMULA sem expressão — as duas recusam", async () => {
    const ids = await rubricasDoEnte();
    const base = { competenciaInicio: "2026-01", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2, regime: "TODOS" as const, fundamentacaoLegal: "Lei sintética", criadoPor: AUTOR };
    await expect(criarVersaoDaRubrica(prisma, { ...base, rubricaId: ids["ADNOT"]!, formula: "vencimento_base * 2" })).rejects.toThrow(/não vem de fórmula/);
    await expect(criarVersaoDaRubrica(prisma, { ...base, rubricaId: ids["INSAL"]!, formula: null })).rejects.toThrow(/nenhuma expressão foi informada/);
  });

  it("e5: autorização no SERVIDOR — sem a ação, a recusa nomeia a ação e nada é gravado", async () => {
    const ids = await rubricasDoEnte();
    await expect(
      criarVersaoDaRubrica(prisma, {
        rubricaId: ids["INSAL"]!, competenciaInicio: "2026-01", formula: "vencimento_base * 0.05",
        incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, casasDecimais: 2,
        regime: "TODOS", fundamentacaoLegal: "Lei sintética", criadoPor: SEM_PODER,
      }),
    ).rejects.toThrow(/CADASTRAR_VERSAO_DE_RUBRICA/);
    expect(await prisma.versaoDaRubrica.count({ where: { rubricaId: ids["INSAL"]! } })).toBe(0);
  });

  it("e6: revogar é fato com motivo e autor — e a rubrica sai da folha seguinte", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await vinculo("77777777777", "M-7", "2000.00", "RPPS");
    const versaoId = await versaoAprovada(ids["INSAL"]!, { formula: "vencimento_base * 0.05", competenciaInicio: "2026-01" });
    expect((await linhasDaFolha("2026-05")).get("INSAL")).toBe("100.00");

    await limparBancoDeFolha();
    await revogarVersaoDaRubrica(prisma, { versaoId, motivo: "lei revogada pela Lei sintética 9/2026", revogadoPor: REVISOR });
    expect((await linhasDaFolha("2026-05")).has("INSAL")).toBe(false);
    const v = await prisma.versaoDaRubrica.findUniqueOrThrow({ where: { id: versaoId }, select: { situacao: true, motivoDaRevogacao: true, revogadoPor: true } });
    expect(v.situacao).toBe("REVOGADA");
    expect(v.motivoDaRevogacao).toContain("Lei sintética 9/2026");
    expect(v.revogadoPor).toBe(REVISOR);
  });
});

/** Apaga só a folha calculada, preservando cadastro, vínculos e versões. */
async function limparBancoDeFolha(): Promise<void> {
  await prisma.linhaDoContracheque.deleteMany({});
  await prisma.contracheque.deleteMany({});
  await prisma.calculoDaFolha.deleteMany({});
  await prisma.folhaDePagamento.deleteMany({});
}

// A `toMoney` e o `Decimal` ficam importados porque as fixtures deste arquivo os usam quando
// um caso precisa comparar dinheiro fora do banco.
void toMoney;
void Decimal;
