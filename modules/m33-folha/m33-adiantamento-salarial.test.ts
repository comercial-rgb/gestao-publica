import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  admitirServidor,
  cadastrarCargo,
  cadastrarLotacao,
  cadastrarServidor,
  desligarServidor,
  registrarAlteracaoRemuneratoria,
} from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  calcularFolha,
  fecharFolha,
  lancarNaFolha,
} from "./servico.js";
import { cadastrarParametroDoAdiantamentoSalarial } from "./adiantamento-salarial-servico.js";
import { cadastrarParametroDoDecimoTerceiro } from "./decimo-terceiro-servico.js";

/**
 * ═══ M33 / V13 — O ADIANTAMENTO SALARIAL, COM BANCO (TR 5.12.50) ═══
 *
 * Regime de rigor: PROFUNDIDADE. É dinheiro que sai do caixa e volta como desconto no
 * contracheque do servidor.
 *
 * ⚠️ TODO ESPERADO ESTÁ CALCULADO À MÃO no comentário de cada caso, e NENHUM é produzido
 * chamando o motor. A fixture é fechada de propósito — contribuição LINEAR de 10%, IRRF zerado,
 * mês fiscal de 30 dias — justamente para que a conta possa ser conferida de cabeça. Conferir o
 * motor com o próprio motor passaria com qualquer interpretação errada consistente.
 *
 * ⚠️ N=2 EM TODOS OS CASOS DE CÁLCULO, COM BASES DIFERENTES: MAT-A vale 3.000,00 e MAT-B vale
 * 2.000,00. Com N=1, um motor que abatesse um VALOR FIXO (ou o valor do vínculo errado) passaria;
 * com bases iguais, o segundo ainda passaria.
 *
 * ⚠️ AS TABELAS SÃO FIXTURES SINTÉTICAS. Nenhum valor aqui afirma alíquota oficial, e nenhum
 * percentual de vale aqui afirma norma de município nenhum.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "contabilidade@cg.pb.gov.br";
/**
 * ⚠️ O ATOR DA NEGATIVA É DE FORA DO CENSO DAS FIXTURES, E SEM PERFIL NENHUM.
 * `semearUsuariosDeTeste` dá ADMIN (= `TODAS_AS_ACOES`) a TODA identidade do censo, então
 * reusar qualquer uma delas faria a negativa passar por VACUIDADE — e teste de negação que passa
 * por vacuidade é pior que teste ausente.
 */
const SEM_PODER = "estagiario.do.vale@cg.pb.gov.br";

const MAIO = "2026-05";
const JUNHO = "2026-06";

const D = (a: number, m: number, d: number): Date =>
  meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const ATO = {
  atoEsfera: "MUNICIPAL",
  atoTipo: "DECRETO",
  atoNumero: "4.321",
  atoAno: 2020,
  atoDispositivo: "art. 3º, caput",
  atoEmenta: "Dispoe sobre o adiantamento salarial aos servidores do Municipio",
} as const;

/**
 * ⚠️ V13 rodada 4 — A CONTA EM QUE O VALE VIRA DIREITO, E ELA NÃO FOI INVENTADA PARA O TESTE.
 *
 * `1.1.3.1.1.01.01 SALÁRIOS E ORDENADOS - ADIANTAMENTOS` existe no plano oficial do TCE-PB
 * (`Pcasp_2025.xlsx`, sha256 conferido no MANIFEST), analítica e DEVEDORA — e desde esta rodada
 * também em `prisma/seed/pcasp.ts`. Aqui ela é criada à mão porque `limparBanco` trunca
 * `ContaPcasp`: cada fixture é dona das próprias contas.
 */
const CONTA_DO_VALE = "c-adiant-pessoal";

/**
 * ⚠️ AS DUAS CONTAS ERRADAS SÃO ERRADAS POR MOTIVOS DIFERENTES, e é isso que as torna uma fixture
 * e não um par de sinônimos:
 *
 *   · `CONTA_FORA_DO_RAMO` é a VPD de pessoal (`3.1.1.1.1.01.00`) — analítica, existente, e
 *     exatamente a conta que a rodada 2 debitava indevidamente. Ela falha no RAMO.
 *   · `CONTA_SINTETICA` é `1.1.3.1.1.01` — DENTRO do ramo `1.1.3.1`, e reprovada ainda assim
 *     porque sintética não recebe partida. Sem ela, um serviço que só conferisse o prefixo
 *     passaria os três casos e o defeito apareceria no primeiro pagamento.
 *
 * ⚠️ E ELAS SÃO O QUE IMPEDE A CONFERÊNCIA DUPLA DE PASSAR POR UMA SÓ. Com apenas a VPD, as duas
 * guardas ficariam indistinguíveis: a conta reprovaria pelo ramo e ninguém saberia se a exigência
 * de analítica existe.
 */
const CONTA_FORA_DO_RAMO = "c-vpd-pessoal";
const CONTA_SINTETICA = "c-adiant-sintetica";

async function contaDoValeNoPlano(): Promise<void> {
  await prisma.contaPcasp.createMany({
    data: [
      { id: CONTA_DO_VALE, codigo: "1.1.3.1.1.01.01", nome: "SALÁRIOS E ORDENADOS - ADIANTAMENTOS", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: CONTA_FORA_DO_RAMO, codigo: "3.1.1.1.1.01.00", nome: "VENCIMENTOS E VANTAGENS FIXAS - PESSOAL CIVIL", naturezaSaldo: "DEVEDORA", nivel: 7, analitica: true },
      { id: CONTA_SINTETICA, codigo: "1.1.3.1.1.01", nome: "ADIANTAMENTOS CONCEDIDOS A PESSOAL", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: false },
    ],
  });
}

async function tabelasDoEnte(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, {
    regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal",
    faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: AUTOR,
  });
  await cadastrarTabelaIrrf(prisma, {
    competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste",
    faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: AUTOR,
  });
}

async function rubricasDoEnte(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  /**
   * ⚠️ A RUBRICA DO VALE É `VALOR_INFORMADO` E SEM LANÇAMENTO NENHUM, e isso é parte da fixture,
   * não acaso: assim ela NÃO produz linha na folha mensal (o motor mensal só a emite quando há
   * lançamento). Quem a preenche é o motor do adiantamento, que a emite com valor explícito.
   */
  await r({ codigo: "ADSAL", descricao: "Adiantamento salarial", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 12, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "ABATSAL", descricao: "Abatimento do adiantamento salarial", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 96, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "ABATSAL2", descricao: "Abatimento do adiantamento salarial (rubrica nova)", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 97, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  // ⚠️ AS TRÊS DO 13º EXISTEM AQUI DE PROPÓSITO, mesmo nos casos que não usam 13º: é o que torna
  // o caso de ISOLAMENTO (c7) possível, e é o que faz a recusa de c8 ter uma rubrica REAL de
  // natureza errada para oferecer ao cadastro — em vez de um id inventado, que seria recusado
  // por "não existe" e provaria outra coisa.
  await r({ codigo: "D13", descricao: "13o salario", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ADI", descricao: "Adiantamento do 13o", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ABAT", descricao: "Abatimento do adiantamento do 13o", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  return ids;
}

async function vinculo(doc: string, matricula: string, salario: string): Promise<string> {
  const cargo =
    (await prisma.cargo.findFirst({ select: { id: true } }))?.id ??
    (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: AUTOR })).cargoId;
  const lotacao =
    (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ??
    (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: AUTOR })).lotacaoId;
  const p = await prisma.pessoa.create({
    data: { documento: doc, tipo: "FISICA", criadoPor: AUTOR, versoes: { create: { nome: `Servidor ${matricula}`, criadoPor: AUTOR } } },
    select: { id: true },
  });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: AUTOR });
  const { vinculoId } = await admitirServidor(prisma, {
    servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS",
    dataAdmissao: D(2020, 1, 1), cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: AUTOR,
  });
  return vinculoId;
}

async function parametroDoVale(
  ids: Record<string, string>,
  over: Partial<Parameters<typeof cadastrarParametroDoAdiantamentoSalarial>[1]> = {}
): Promise<{ readonly versao: number }> {
  return cadastrarParametroDoAdiantamentoSalarial(prisma, {
    competencia: JUNHO,
    percentualDoAdiantamento: "0.40",
    baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES",
    estadoMinimoParaAbater: "FECHADO",
    rubricaDoAdiantamentoId: ids["ADSAL"]!,
    rubricaDoAbatimentoId: ids["ABATSAL"]!,
    contaDoAdiantamentoId: CONTA_DO_VALE,
    ...ATO,
    criadoPor: AUTOR,
    ...over,
  });
}

/** Os valores gravados, por matrícula e por código de rubrica — lidos do BANCO, não do retorno. */
async function linhasGravadas(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculo: { folhaId } } },
    select: { valor: true, rubrica: { select: { codigo: true } }, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
  });
  return new Map(linhas.map((l) => [`${l.contracheque.vinculo.matricula}/${l.rubrica.codigo}`, l.valor.toFixed(2)]));
}

async function liquidosGravados(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const cs = await prisma.contracheque.findMany({
    where: { calculo: { folhaId } },
    select: { liquido: true, vinculo: { select: { matricula: true } } },
  });
  return new Map(cs.map((c) => [c.vinculo.matricula, c.liquido.toFixed(2)]));
}

/** Duas matrículas, tabelas e rubricas. MAT-A 3.000,00 e MAT-B 2.000,00. */
async function enteComDoisServidores(): Promise<{ readonly ids: Record<string, string>; readonly a: string; readonly b: string }> {
  await contaDoValeNoPlano();
  await tabelasDoEnte();
  const ids = await rubricasDoEnte();
  const a = await vinculo("11111111111", "MAT-A", "3000.00");
  const b = await vinculo("22222222222", "MAT-B", "2000.00");
  return { ids, a, b };
}

/** Abre, calcula e FECHA a folha do vale de junho. Devolve o id da folha. */
async function valeDeJunhoFechado(): Promise<string> {
  const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
  await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
  await fecharFolha(prisma, { folhaId, criadoPor: AUTOR });
  return folhaId;
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// c1 · O CÁLCULO DO VALE, E O ABATIMENTO NA MENSAL — com a conta feita à mão
// ═══════════════════════════════════════════════════════════════════════════════

describe("c1 · o vale sai pelo parâmetro do ente e a mensal o abate", () => {
  /**
   * A CONTA, À MÃO, SEM O MOTOR:
   *
   *   base PROJETADA de junho = o que o motor mensal produziria hoje = só VENC (30/30 dias)
   *     MAT-A  3.000,00        MAT-B  2.000,00
   *   vale = 40% da base
   *     MAT-A  3.000,00 × 0,40 = 1.200,00
   *     MAT-B  2.000,00 × 0,40 =   800,00
   *
   * ⚠️ OS DOIS VALORES SÃO DIFERENTES DE PROPÓSITO (N=2, bases diferentes): com um vínculo só,
   * um motor que devolvesse um valor fixo — ou o valor do OUTRO vínculo — passaria igual.
   */
  it("calcula 40% da base projetada, por vínculo, e grava uma linha de provento", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    expect(r.contracheques).toBe(2);
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/ADSAL")).toBe("1200.00");
    expect(linhas.get("MAT-B/ADSAL")).toBe("800.00");

    // ⚠️ E NADA MAIS É LANÇADO. O vale não retém contribuição nem imposto neste sistema, e a
    // ausência é afirmada aqui em vez de deduzida do silêncio: quem tributa a remuneração do mês
    // é a MENSAL, que calcula sobre o valor INTEIRO (o abatimento não reduz base).
    expect([...linhas.keys()].sort()).toEqual(["MAT-A/ADSAL", "MAT-B/ADSAL"]);
    expect(r.totalDescontos.toFixed(2)).toBe("0.00");
    expect(r.totalLiquido.toFixed(2)).toBe("2000.00"); // 1.200,00 + 800,00
  });

  /**
   * A CONTA DA MENSAL DE JUNHO, À MÃO:
   *
   *   MAT-A  VENC 3.000,00 · PREV 10% de 3.000,00 = 300,00 · ABATSAL 1.200,00
   *          líquido = 3.000,00 − 300,00 − 1.200,00 = 1.500,00
   *   MAT-B  VENC 2.000,00 · PREV 10% de 2.000,00 = 200,00 · ABATSAL   800,00
   *          líquido = 2.000,00 − 200,00 − 800,00 = 1.000,00
   *
   * ⚠️ O `PREV` É O ASSERT QUE IMPORTA MAIS. Se o abatimento reduzisse a base de contribuição,
   * MAT-A recolheria 10% de 1.800,00 = 180,00 — e o ente recolheria a MENOS ao RPPS todo mês em
   * que houvesse vale, com a folha fechando e o total batendo.
   */
  it("a mensal abate o vale de cada um, e a contribuição continua sobre a remuneração INTEIRA", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);
    await valeDeJunhoFechado();

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR });

    const linhas = await linhasGravadas(mensal);
    expect(linhas.get("MAT-A/ABATSAL")).toBe("1200.00");
    expect(linhas.get("MAT-B/ABATSAL")).toBe("800.00");
    expect(linhas.get("MAT-A/PREV")).toBe("300.00");
    expect(linhas.get("MAT-B/PREV")).toBe("200.00");

    const liquidos = await liquidosGravados(mensal);
    expect(liquidos.get("MAT-A")).toBe("1500.00");
    expect(liquidos.get("MAT-B")).toBe("1000.00");

    const cs = await prisma.contracheque.findMany({ where: { calculo: { folhaId: mensal } }, select: { baseContribuicao: true, vinculo: { select: { matricula: true } } } });
    expect(new Map(cs.map((c) => [c.vinculo.matricula, c.baseContribuicao.toFixed(2)])).get("MAT-A")).toBe("3000.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c2 · AS DUAS BASES SÃO DUAS CONTAS DIFERENTES — e não um rótulo
// ═══════════════════════════════════════════════════════════════════════════════

describe("c2 · as duas práticas suportadas produzem valores diferentes", () => {
  /**
   * O CENÁRIO QUE AS SEPARA: a mensal de MAIO fecha com MAT-A a 3.000,00; em 1º de junho MAT-A é
   * reajustado para 4.000,00.
   *
   *   REMUNERACAO_DO_MES_ANTERIOR  → base 3.000,00 → vale 40% = 1.200,00
   *   REMUNERACAO_PROJETADA_DO_MES → base 4.000,00 → vale 40% = 1.600,00
   *
   * ⚠️ SE AS DUAS OPÇÕES FOSSEM O MESMO CÓDIGO COM ROTULOS DIFERENTES, este caso ficaria verde
   * com os dois valores iguais — e o ente que declarou uma prática estaria pagando a outra.
   */
  async function maioFechadoEReajusteEmJunho(): Promise<Record<string, string>> {
    const { ids, a } = await enteComDoisServidores();
    const { folhaId: maio } = await abrirFolha(prisma, { competencia: MAIO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: maio, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: maio, criadoPor: AUTOR });
    await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId: a, tipo: "REAJUSTE_SALARIAL", data: D(2026, 6, 1), salarioBase: "4000.00",
      motivo: "reajuste geral concedido por lei municipal", criadoPor: AUTOR,
    });
    return ids;
  }

  it("mês anterior lê o que a folha fechada de maio APUROU (1.200,00), e não o vencimento de hoje", async () => {
    const ids = await maioFechadoEReajusteEmJunho();
    await parametroDoVale(ids, { baseDoAdiantamento: "REMUNERACAO_DO_MES_ANTERIOR" });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/ADSAL")).toBe("1200.00");
    expect(linhas.get("MAT-B/ADSAL")).toBe("800.00");
  });

  it("projetada do próprio mês já enxerga o reajuste de junho (1.600,00)", async () => {
    const ids = await maioFechadoEReajusteEmJunho();
    await parametroDoVale(ids, { baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES" });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/ADSAL")).toBe("1600.00");
    expect(linhas.get("MAT-B/ADSAL")).toBe("800.00");
  });

  it("sem a mensal ANTERIOR fechada, a prática do mês anterior RECUSA — não projeta em silêncio", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids, { baseDoAdiantamento: "REMUNERACAO_DO_MES_ANTERIOR" });

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/MENSAL-ANTERIOR-NAO-FECHADA[\s\S]*2026-05/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c3 · PARÂMETRO AUSENTE IMPEDE A EFETIVAÇÃO, COM ORIENTAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

describe("c3 · sem parâmetro do ente, nada acontece", () => {
  it("recusa nomeando a competência e dizendo onde cadastrar, e não grava cálculo nenhum", async () => {
    await enteComDoisServidores();
    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });

    // ⚠️ A NEGATIVA AFIRMA O MOTIVO, NÃO SÓ O RESULTADO. "Não calculou" é compatível com o motor
    // ter estourado por qualquer outra coisa — inclusive por um erro de digitação desta fixture.
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(
      /PARAMETRO-DO-ADIANTAMENTO-SALARIAL-AUSENTE[\s\S]*2026-06[\s\S]*O QUE FAZER/
    );
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
    expect(await prisma.contracheque.count()).toBe(0);
  });

  it("com o parâmetro, o mesmo cálculo passa — a recusa acima não passa por vacuidade", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);
    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(r.contracheques).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c4 · AS GUARDAS DA MENSAL, NA ORDEM
// ═══════════════════════════════════════════════════════════════════════════════

describe("c4 · o que a folha mensal recusa por causa do vale", () => {
  it("vale ABERTO bloqueia a mensal — abater valor que ainda pode mudar", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);
    const { folhaId: vale } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: vale, criadoPor: AUTOR }); // calculado, NÃO fechado

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(/ADIANTAMENTO-SALARIAL-NAO-FECHADO[\s\S]*2026-06/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: mensal } })).toBe(0);
  });

  /**
   * ⚠️ A GUARDA GRAVE ANTES DA TRIVIAL. MAT-A recebeu o vale e é desligada com efeito ANTES de
   * junho (registro retroativo): o recálculo de junho não a alcança, e há 1.200,00 adiantados que
   * ninguém vai abater. A recusa tem de NOMEAR a matrícula e o valor — "nenhum vínculo elegível"
   * mandaria o operador embora com dinheiro do ente pendurado e sem nome.
   */
  it("vínculo com vale que não entra na mensal recusa NOMEANDO a matrícula e o valor", async () => {
    const { ids, a } = await enteComDoisServidores();
    await parametroDoVale(ids);
    await valeDeJunhoFechado();

    await desligarServidor(prisma, { vinculoId: a, data: D(2026, 5, 20), motivo: "exoneracao registrada depois do pagamento do vale", criadoPor: AUTOR });

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(
      /VINCULO-DO-ADIANTAMENTO-SALARIAL-FORA-DA-MENSAL[\s\S]*MAT-A/
    );
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(/1\.200,00/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: mensal } })).toBe(0);
  });

  /**
   * ⚠️ NUNCA LÍQUIDO NEGATIVO, E A FOLHA INTEIRA PARA. A conta, à mão:
   *
   *   vale de junho pela remuneração de MAIO: MAT-A 3.000,00 × 0,40 = 1.200,00
   *   em junho MAT-A é desligada no dia 2 → 2 dias computados
   *     VENC = 3.000,00 × 2/30 = 200,00 · PREV 10% = 20,00 → líquido antes do abatimento 180,00
   *   1.200,00 > 180,00 → recusa nomeando matrícula, líquido e adiantado.
   */
  it("abatimento maior que o líquido do mês recusa a folha inteira, nomeando os três números", async () => {
    const { ids, a } = await enteComDoisServidores();
    const { folhaId: maio } = await abrirFolha(prisma, { competencia: MAIO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: maio, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: maio, criadoPor: AUTOR });
    await parametroDoVale(ids, { baseDoAdiantamento: "REMUNERACAO_DO_MES_ANTERIOR" });
    await valeDeJunhoFechado();

    await desligarServidor(prisma, { vinculoId: a, data: D(2026, 6, 2), motivo: "exoneracao a pedido no inicio do mes", criadoPor: AUTOR });

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(
      /ABATIMENTO-DO-ADIANTAMENTO-SALARIAL-MAIOR-QUE-A-REMUNERACAO[\s\S]*MAT-A/
    );
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(/1\.200,00[\s\S]*180,00|180,00[\s\S]*1\.200,00/);
    // ⚠️ A FOLHA INTEIRA PARA: MAT-B, que estava certa, TAMBÉM não é gravada. Pagar os demais e
    // calar sobre este fecharia com os totais batendo.
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: mensal } })).toBe(0);
  });

  /**
   * ⚠️ "FECHOU" NÃO É "CERTIFICADO", E O ENTE DECLARA QUAL BASTA. Com o parâmetro exigindo
   * CERTIFICADO, a folha de vale FECHADA e não atestada não pode ser abatida.
   */
  it("com o ente exigindo CERTIFICADO, a mensal recusa o vale apenas fechado", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids, { estadoMinimoParaAbater: "CERTIFICADO" });
    await valeDeJunhoFechado();

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR })).rejects.toThrow(
      /ADIANTAMENTO-SALARIAL-NAO-CERTIFICADO[\s\S]*DECRETO 4\.321\/2020/
    );
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: mensal } })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c5 · REPETIÇÃO E CORREÇÃO
// ═══════════════════════════════════════════════════════════════════════════════

describe("c5 · repetir e corrigir", () => {
  it("recalcular o vale ABERTO absorve o que mudou, e o número do cálculo avança sem folha nova", async () => {
    const { ids, a } = await enteComDoisServidores();
    await parametroDoVale(ids);
    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    const um = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(um.numero).toBe(1);

    await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId: a, tipo: "REAJUSTE_SALARIAL", data: D(2026, 6, 1), salarioBase: "4000.00",
      motivo: "reajuste publicado depois do primeiro calculo do vale", criadoPor: AUTOR,
    });
    const dois = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(dois.numero).toBe(2);

    // 4.000,00 × 0,40 = 1.600,00 — conferido à mão.
    const linhas = await prisma.linhaDoContracheque.findMany({
      where: { contracheque: { calculoId: dois.calculoId }, rubricaId: ids["ADSAL"]! },
      select: { valor: true, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
    });
    expect(new Map(linhas.map((l) => [l.contracheque.vinculo.matricula, l.valor.toFixed(2)])).get("MAT-A")).toBe("1600.00");
  });

  it("uma segunda folha de vale na mesma competência é recusada — existe UMA de cada tipo", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);
    await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await expect(abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR })).rejects.toThrow(/FOLHA-JA-ABERTA/);
  });

  /**
   * ═══ ⚠️ A MEMÓRIA HISTÓRICA: ALTERAR O PARÂMETRO NÃO REESCREVE CÁLCULO FECHADO ═══
   *
   * A versão 2 muda o percentual (40% → 60%) E a rubrica do abatimento (ABATSAL → ABATSAL2). Se a
   * mensal lesse o parâmetro VIGENTE, ela abateria 1.800,00 numa rubrica que o vale não conhece —
   * e o empenho cairia noutra ficha. O que ela tem de abater é o que o vale APUROU (1.200,00), na
   * rubrica que valia então.
   */
  it("versão nova do parâmetro depois do vale fechado NÃO muda o que a mensal abate nem em quanto nem em qual rubrica", async () => {
    const { ids } = await enteComDoisServidores();
    await parametroDoVale(ids);
    await valeDeJunhoFechado();

    const v2 = await parametroDoVale(ids, { percentualDoAdiantamento: "0.60", rubricaDoAbatimentoId: ids["ABATSAL2"]! });
    expect(v2.versao).toBe(2);

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR });

    const linhas = await linhasGravadas(mensal);
    expect(linhas.get("MAT-A/ABATSAL")).toBe("1200.00"); // o apurado, não 60% de 3.000,00
    expect(linhas.has("MAT-A/ABATSAL2")).toBe(false);
    expect(await liquidosGravados(mensal).then((m) => m.get("MAT-A"))).toBe("1500.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c6 · RECONCILIAÇÃO COM A COMPLEMENTAR — o vale não pode bloqueá-la
// ═══════════════════════════════════════════════════════════════════════════════

describe("c6 · a complementar continua funcionando em competência com vale", () => {
  /**
   * ═══ A ARMADILHA 1 DA VARREDURA, PROVADA E NÃO AFIRMADA ═══
   *
   * Se `ADIANTAMENTO_SALARIAL` compusesse a remuneração mensal, o "já apurado" da complementar
   * somaria o provento do vale — que o recálculo do mensal nunca reproduz —, o delta ficaria
   * NEGATIVO e a complementar recusaria TODA competência com vale, para sempre.
   *
   * A CONTA, À MÃO. Junho com vale, mensal fechada, horas extras lançadas DEPOIS:
   *
   *   correto de junho  MAT-A  VENC 3.000,00 + HEXT 500,00 · PREV 350,00 · ABATSAL 1.200,00
   *   já apurado        MAT-A  VENC 3.000,00              · PREV 300,00 · ABATSAL 1.200,00
   *   diferença         MAT-A  HEXT +500,00 · PREV +50,00 · ABATSAL 0,00 → líquido 450,00
   *                     MAT-B  HEXT +150,00 · PREV +15,00 · ABATSAL 0,00 → líquido 135,00
   *
   * ⚠️ E O ABATIMENTO NÃO VIRA LINHA NA COMPLEMENTAR: ele está nos DOIS lados da subtração, e uma
   * rubrica sem diferença não produz linha. É assim que "não compensar duas vezes" deixa de ser
   * promessa e vira consequência da aritmética.
   */
  it("paga só a diferença, sem recusar e sem abater o vale uma segunda vez", async () => {
    const { ids, a, b } = await enteComDoisServidores();
    await parametroDoVale(ids);
    await valeDeJunhoFechado();

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: mensal, criadoPor: AUTOR });

    await lancarNaFolha(prisma, { vinculoId: a, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: JUNHO, valor: "500.00", criadoPor: AUTOR });
    await lancarNaFolha(prisma, { vinculoId: b, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: JUNHO, valor: "150.00", criadoPor: AUTOR });

    const { folhaId: comp } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId: comp, criadoPor: AUTOR });
    expect(r.contracheques).toBe(2);

    const linhas = await linhasGravadas(comp);
    expect(linhas.get("MAT-A/HEXT")).toBe("500.00");
    expect(linhas.get("MAT-A/PREV")).toBe("50.00");
    expect(linhas.get("MAT-B/HEXT")).toBe("150.00");
    expect(linhas.get("MAT-B/PREV")).toBe("15.00");
    // A prova do "não compensar duas vezes": nenhuma linha de abatimento na complementar.
    expect([...linhas.keys()].some((k) => k.includes("ABATSAL"))).toBe(false);

    const liquidos = await liquidosGravados(comp);
    expect(liquidos.get("MAT-A")).toBe("450.00");
    expect(liquidos.get("MAT-B")).toBe("135.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c7 · ISOLAMENTO EM RELAÇÃO AO 13º
// ═══════════════════════════════════════════════════════════════════════════════

describe("c7 · o vale e o adiantamento do 13º não se confundem", () => {
  /**
   * ═══ DUAS FOLHAS DE ADIANTAMENTO NA MESMA COMPETÊNCIA, E SÓ UMA É ABATIDA NA MENSAL ═══
   *
   * Junho de 2026 tem as duas: o VALE (40% da remuneração de junho) e o ADIANTAMENTO DO 13º
   * (50% do 13º apurado do exercício). Se as duas naturezas de abatimento fossem uma só, o motor
   * mensal descontaria também a 1ª parcela do 13º do salário de junho — com o total batendo.
   *
   * A CONTA, À MÃO:
   *   13º apurado de MAT-A = 3.000,00 × 12/12 = 3.000,00 → 1ª parcela 50% = 1.500,00
   *   vale de junho de MAT-A = 40% × 3.000,00 = 1.200,00
   *   mensal de junho de MAT-A = 3.000,00 − PREV 300,00 − ABATSAL 1.200,00 = 1.500,00
   *
   * ⚠️ O 1.500,00 DO LÍQUIDO E O 1.500,00 DA 1ª PARCELA SÃO IGUAIS POR COINCIDÊNCIA DA FIXTURE, e
   * é por isso que o caso NÃO se contenta com o líquido: ele afirma também que NENHUMA linha de
   * `D13ABAT` existe na mensal.
   */
  it("a mensal abate o vale e NÃO a 1ª parcela do 13º da mesma competência", async () => {
    const { ids } = await enteComDoisServidores();
    await cadastrarParametroDoDecimoTerceiro(prisma, {
      exercicio: 2026, diasMinimosDoAvo: 15, avosNoExercicio: 12, percentualDaPrimeiraParcela: "0.5",
      baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO", decimoTerceiroSofreContribuicao: true,
      decimoTerceiroSofreIrrf: false,
      rubricaDoDecimoTerceiroId: ids["D13"]!, rubricaDoAdiantamentoId: ids["D13ADI"]!, rubricaDoAbatimentoId: ids["D13ABAT"]!,
      rubricasDaBase: [ids["VENC"]!],
      atoEsfera: "MUNICIPAL", atoTipo: "LEI", atoNumero: "1.234", atoAno: 2010,
      atoDispositivo: "art. 78, § 2º", atoEmenta: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
      criadoPor: AUTOR,
    });
    await parametroDoVale(ids);

    const { folhaId: d13 } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: d13, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: d13, criadoPor: AUTOR });
    expect((await linhasGravadas(d13)).get("MAT-A/D13ADI")).toBe("1500.00");

    await valeDeJunhoFechado();

    const { folhaId: mensal } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal, criadoPor: AUTOR });

    const linhas = await linhasGravadas(mensal);
    expect(linhas.get("MAT-A/ABATSAL")).toBe("1200.00");
    expect([...linhas.keys()].some((k) => k.includes("D13"))).toBe(false);
    expect((await liquidosGravados(mensal)).get("MAT-A")).toBe("1500.00");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c8 · AUTORIZAÇÃO NO SERVIDOR — positiva e negativa
// ═══════════════════════════════════════════════════════════════════════════════

describe("c8 · autorização", () => {
  it("sem CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL, o cadastro recusa NOMEANDO a ação e não grava", async () => {
    const { ids } = await enteComDoisServidores();
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" } });

    await expect(parametroDoVale(ids, { criadoPor: SEM_PODER })).rejects.toThrow(/CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL/);
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });

  it("com a ação, o mesmo cadastro grava — a negativa acima não passa por vacuidade", async () => {
    const { ids } = await enteComDoisServidores();
    const r = await parametroDoVale(ids);
    expect(r.versao).toBe(1);
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(1);
  });

  /**
   * ⚠️ A RUBRICA DO 13º NÃO SERVE COMO ABATIMENTO DO VALE. Aceitá-la faria o motor mensal
   * descontar do salário do mês metade da gratificação natalina — e o cadastro é o lugar de
   * recusar, não o cálculo: uma versão inválida ocuparia o número para sempre (nada aqui apaga).
   */
  it("a rubrica de abatimento do 13º é recusada no papel de abatimento do vale", async () => {
    const { ids } = await enteComDoisServidores();
    await expect(parametroDoVale(ids, { rubricaDoAbatimentoId: ids["D13ABAT"]! })).rejects.toThrow(
      /RUBRICA-DO-ADIANTAMENTO-SALARIAL-INVALIDA[\s\S]*ABATIMENTO_DO_ADIANTAMENTO_SALARIAL/
    );
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c9 · A CONTA EM QUE O VALE VIRA DIREITO — OS DOIS LADOS DA MESMA REGRA
//
// ⚠️ ESTA SEÇÃO EXISTE PORQUE A COLUNA É NULLABLE E A ENTRADA É OBRIGATÓRIA, e essa combinação
// só é honesta se AS DUAS PONTAS estiverem medidas. Uma coluna nullable com Zod exigente e
// leitura desprotegida é pior que uma coluna NOT NULL: parece fechada e não é.
//
//   · CADASTRO — nenhum parâmetro NOVO nasce sem a conta, nem com a conta errada (c9.1 a c9.4);
//   · LEITURA  — um parâmetro GRAVADO ANTES da pergunta não vira vale nenhum (c9.5 e c9.6).
//
// ⚠️ E A FIXTURE DO LADO DA LEITURA É GRAVADA À REVELIA DO SERVIÇO, de propósito. O serviço não
// consegue produzir a linha antiga (o Zod a recusa), e é justamente a linha que o serviço não
// produz mais que a leitura tem de tratar. Reproduzi-la por `prisma.create` direto é a única forma
// de medir o estado que a migration aditiva deixou existir.
// ═══════════════════════════════════════════════════════════════════════════════

describe("c9 · a conta do plano em que o vale vira direito", () => {
  it("c9.1 · conta que NÃO EXISTE no plano recusa nomeando o motivo, e não grava", async () => {
    const { ids } = await enteComDoisServidores();

    await expect(parametroDoVale(ids, { contaDoAdiantamentoId: "c-que-nunca-existiu" })).rejects.toThrow(
      /CONTA-DO-ADIANTAMENTO-SALARIAL-INVALIDA[\s\S]*não existe no plano de contas do ente/
    );
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });

  /**
   * ⚠️ A VPD DE PESSOAL É A CONTA DO DEFEITO DA RODADA 2 — aquela em que 4.200,00 viravam despesa
   * para 3.000,00 de custo. Recusá-la AQUI, no cadastro, é o que impede a duplicação de nascer:
   * na rodada 3 a mesma recusa só chegava depois de a folha estar calculada e fechada.
   */
  it("c9.2 · conta FORA do ramo 1.1.3.1 recusa nomeando o ramo e a conta oficial, e não grava", async () => {
    const { ids } = await enteComDoisServidores();

    await expect(parametroDoVale(ids, { contaDoAdiantamentoId: CONTA_FORA_DO_RAMO })).rejects.toThrow(
      /CONTA-DO-ADIANTAMENTO-SALARIAL-INVALIDA[\s\S]*3\.1\.1\.1\.1\.01\.00[\s\S]*não é do ramo 1\.1\.3\.1/
    );
    // A orientação nomeia a conta que o plano oficial tem para este caso — recusa sem destino
    // manda o operador adivinhar.
    await expect(parametroDoVale(ids, { contaDoAdiantamentoId: CONTA_FORA_DO_RAMO })).rejects.toThrow(
      /1\.1\.3\.1\.1\.01\.01/
    );
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });

  it("c9.3 · conta DENTRO do ramo mas SINTÉTICA recusa — e é o caso que o prefixo não pega", async () => {
    const { ids } = await enteComDoisServidores();

    await expect(parametroDoVale(ids, { contaDoAdiantamentoId: CONTA_SINTETICA })).rejects.toThrow(
      /CONTA-DO-ADIANTAMENTO-SALARIAL-INVALIDA[\s\S]*1\.1\.3\.1\.1\.01[\s\S]*SINTÉTICA/
    );
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);
  });

  /**
   * ⚠️ A ENTRADA SEM O CAMPO É RECUSADA PELO ZOD, ANTES DE QUALQUER CONSULTA. É uma recusa de
   * contrato, não de negócio, e por isso a mensagem é a do Zod — o que se afirma aqui é que o campo
   * é OBRIGATÓRIO, e que a ausência não escorrega para `undefined` gravado como nulo.
   */
  it("c9.4 · entrada SEM o campo é recusada, e a conta certa grava — nada disto passa por vacuidade", async () => {
    const { ids } = await enteComDoisServidores();

    const semCampo = {
      competencia: JUNHO,
      percentualDoAdiantamento: "0.40",
      baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES",
      estadoMinimoParaAbater: "FECHADO",
      rubricaDoAdiantamentoId: ids["ADSAL"]!,
      rubricaDoAbatimentoId: ids["ABATSAL"]!,
      ...ATO,
      criadoPor: AUTOR,
    } as unknown as Parameters<typeof cadastrarParametroDoAdiantamentoSalarial>[1];

    await expect(cadastrarParametroDoAdiantamentoSalarial(prisma, semCampo)).rejects.toThrow(/contaDoAdiantamentoId/);
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(0);

    // ── E A CONTA CERTA GRAVA, com a FK apontando para ela ──
    await parametroDoVale(ids);
    const gravado = await prisma.parametroDoAdiantamentoSalarial.findFirstOrThrow({
      select: { contaDoAdiantamentoId: true, contaDoAdiantamento: { select: { codigo: true } } },
    });
    expect(gravado.contaDoAdiantamentoId).toBe(CONTA_DO_VALE);
    expect(gravado.contaDoAdiantamento?.codigo).toBe("1.1.3.1.1.01.01");
  });

  /**
   * ═══ ⚠️ O LADO DA LEITURA — O PARÂMETRO QUE NASCEU ANTES DA PERGUNTA ═══
   *
   * A migration é aditiva e a coluna é nullable porque havia parâmetro gravado antes de o sistema
   * perguntar em que conta o vale vira direito. A recusa é medida PELO EFEITO e pela rota do
   * operador — `calcularFolha` —, não chamando o leitor direto: o que interessa é que o vale não
   * sai, e que nenhum cálculo fica gravado pela metade.
   *
   * ⚠️ E O ESPERADO É "NADA", CONTADO: `CalculoDaFolha` e `Contracheque` em zero. "Não calculou" é
   * compatível com um cálculo gravado e um erro depois — que é o defeito que este repositório já
   * pagou como "efeito colateral antes da operação guardada".
   */
  it("c9.5 · parâmetro antigo, com a conta NULA, falha fechado nomeando o motivo e não calcula nada", async () => {
    const { ids } = await enteComDoisServidores();

    // A LINHA DA RODADA 1, reproduzida como ela era: sem `contaDoAdiantamentoId`.
    await prisma.parametroDoAdiantamentoSalarial.create({
      data: {
        competencia: JUNHO,
        versao: 1,
        percentualDoAdiantamento: "0.40",
        baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES",
        estadoMinimoParaAbater: "FECHADO",
        rubricaDoAdiantamentoId: ids["ADSAL"]!,
        rubricaDoAbatimentoId: ids["ABATSAL"]!,
        atoEsfera: "MUNICIPAL",
        atoTipo: "DECRETO",
        atoNumero: "4.321",
        atoAno: 2020,
        atoDispositivo: "art. 3º, caput",
        atoEmenta: "Dispoe sobre o adiantamento salarial aos servidores do Municipio",
        criadoPor: AUTOR,
      },
    });
    // A fixture é o estado que a migration deixou existir — conferido, não suposto.
    expect(await prisma.parametroDoAdiantamentoSalarial.count({ where: { contaDoAdiantamentoId: null } })).toBe(1);

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(
      /CONTA-DO-ADIANTAMENTO-SALARIAL-NAO-DECLARADA[\s\S]*2026-06[\s\S]*O QUE FAZER/
    );

    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
    expect(await prisma.contracheque.count()).toBe(0);
  });

  /**
   * ⚠️ E A ORIENTAÇÃO DA RECUSA É VERDADE, NÃO DECORAÇÃO. A mensagem manda cadastrar a versão
   * seguinte declarando a conta; este caso executa exatamente isso e o vale sai. Sem ele, a recusa
   * poderia ser um beco sem saída com texto amigável — que é a pior forma de fail-closed.
   */
  it("c9.6 · a saída que a recusa promete funciona: a versão 2 declara a conta e o vale sai", async () => {
    const { ids } = await enteComDoisServidores();
    await prisma.parametroDoAdiantamentoSalarial.create({
      data: {
        competencia: JUNHO,
        versao: 1,
        percentualDoAdiantamento: "0.40",
        baseDoAdiantamento: "REMUNERACAO_PROJETADA_DO_MES",
        estadoMinimoParaAbater: "FECHADO",
        rubricaDoAdiantamentoId: ids["ADSAL"]!,
        rubricaDoAbatimentoId: ids["ABATSAL"]!,
        atoEsfera: "MUNICIPAL",
        atoTipo: "DECRETO",
        atoNumero: "4.321",
        atoAno: 2020,
        atoDispositivo: "art. 3º, caput",
        atoEmenta: "Dispoe sobre o adiantamento salarial aos servidores do Municipio",
        criadoPor: AUTOR,
      },
    });

    const r = await parametroDoVale(ids);
    expect(r.versao).toBe(2);

    // ⚠️ APPEND-ONLY: a versão 1 continua lá, com a conta nula. Nada foi reescrito.
    expect(await prisma.parametroDoAdiantamentoSalarial.count()).toBe(2);
    expect(await prisma.parametroDoAdiantamentoSalarial.count({ where: { contaDoAdiantamentoId: null } })).toBe(1);

    const { folhaId } = await abrirFolha(prisma, { competencia: JUNHO, tipo: "ADIANTAMENTO_SALARIAL", criadoPor: AUTOR });
    const calc = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(calc.contracheques).toBe(2);

    // A CONTA, À MÃO: 40% de 3.000,00 = 1.200,00 e 40% de 2.000,00 = 800,00.
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/ADSAL")).toBe("1200.00");
    expect(linhas.get("MAT-B/ADSAL")).toBe("800.00");
  });
});
