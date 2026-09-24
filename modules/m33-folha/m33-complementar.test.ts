import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor, desligarServidor, registrarAlteracaoRemuneratoria } from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  calcularFolha,
  fecharFolha,
  lancarNaFolha,
} from "./servico.js";
import { cadastrarParametroDoDecimoTerceiro } from "./decimo-terceiro-servico.js";

/**
 * ═══ M33 / V11 V9.4 — A FOLHA MENSAL COMPLEMENTAR, COM BANCO (TR 5.12.50) ═══
 *
 * Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ TODO ESPERADO ESTÁ CALCULADO À MÃO no comentário de cada caso, e nenhum é produzido chamando
 * o motor. A conta da fixture é fechada de propósito (contribuição LINEAR de 10%, IRRF zerado)
 * justamente para que a diferença possa ser conferida de cabeça.
 *
 * ⚠️ AS TABELAS SÃO FIXTURES SINTÉTICAS. Nenhum valor aqui afirma alíquota oficial.
 *
 * ⚠️ N=2 EM TODOS OS CASOS, COM DELTAS DIFERENTES: MAT-A ganha 500,00 de hora extra e MAT-B ganha
 * 150,00. Com um vínculo só, "aplicar um valor fixo" e "aplicar o delta do vínculo errado" passam
 * os dois; com deltas iguais, o segundo ainda passaria.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "contabilidade@cg.pb.gov.br";
/**
 * ⚠️ O ATOR DA NEGATIVA É DE FORA DO CENSO DAS FIXTURES, E SEM PERFIL NENHUM — não por capricho.
 *
 * `semearUsuariosDeTeste` dá **ADMIN** (= `TODAS_AS_ACOES`) a TODA identidade do censo, então
 * NENHUMA delas serve para provar uma negativa: a primeira versão deste arquivo usava
 * `tesouraria@cg.pb.gov.br` e colidia no `@@unique` do identificador — e, se tivesse passado,
 * teria provado nada, porque aquele ator TEM `CALCULAR_FOLHA`. Teste de negação que passa por
 * vacuidade é pior que teste ausente.
 *
 * ⚠️ E NADA FOI CONCEDIDO NEM REMOVIDO DE NINGUÉM PARA ISTO. Este usuário nasce com zero perfis,
 * que é o mesmo caminho de `SEM_PODER` em `m33-decimo-terceiro.test.ts` — o padrão que o próprio
 * `usuarios-teste.ts` manda seguir: "os testes que SÃO sobre permissão criam os seus próprios
 * usuários com perfis restritos".
 */
const SEM_PODER = "estagiario.da.complementar@cg.pb.gov.br";
const COMP = "2026-05";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

async function tabelasDoEnte(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: AUTOR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: AUTOR });
}

async function rubricasDoEnte(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  return ids;
}

async function vinculo(doc: string, matricula: string, salario: string): Promise<string> {
  const cargo = (await prisma.cargo.findFirst({ select: { id: true } }))?.id ?? (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: AUTOR })).cargoId;
  const lotacao = (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ?? (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: AUTOR })).lotacaoId;
  const p = await prisma.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: AUTOR, versoes: { create: { nome: `Servidor ${matricula}`, criadoPor: AUTOR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: AUTOR });
  const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2020, 1, 1), cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: AUTOR });
  return vinculoId;
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

/**
 * O CENÁRIO BASE: duas matrículas, a mensal de 2026-05 calculada e FECHADA, e as horas extras
 * lançadas DEPOIS do fechamento.
 *
 *   MAT-A  vencimento 3.000,00 · PREV 10% = 300,00 · líquido 2.700,00
 *   MAT-B  vencimento 2.000,00 · PREV 10% = 200,00 · líquido 1.800,00
 */
async function mensalFechadaComHorasExtrasLancadasDepois(): Promise<{ readonly ids: Record<string, string>; readonly mensalId: string; readonly a: string; readonly b: string }> {
  await tabelasDoEnte();
  const ids = await rubricasDoEnte();
  const a = await vinculo("11111111111", "MAT-A", "3000.00");
  const b = await vinculo("22222222222", "MAT-B", "2000.00");

  const { folhaId: mensalId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL", criadoPor: AUTOR });
  await calcularFolha(prisma, { folhaId: mensalId, criadoPor: AUTOR });
  await fecharFolha(prisma, { folhaId: mensalId, criadoPor: AUTOR });

  // A CORREÇÃO, depois do fechamento: as horas extras de maio não tinham sido lançadas.
  await lancarNaFolha(prisma, { vinculoId: a, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: COMP, valor: "500.00", criadoPor: AUTOR });
  await lancarNaFolha(prisma, { vinculoId: b, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: COMP, valor: "150.00", criadoPor: AUTOR });
  return { ids, mensalId, a, b };
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// c1 · A DIFERENÇA, E SÓ ELA
// ═══════════════════════════════════════════════════════════════════════════════

describe("c1 · a complementar paga a diferença, rubrica a rubrica", () => {
  /**
   * DEPOIS DO LANÇAMENTO, o correto de maio passa a ser:
   *
   *   MAT-A  VENC 3.000,00 + HEXT 500,00 = 3.500,00 · PREV 10% = 350,00
   *          diferença: VENC 0,00 (não vira linha) · HEXT 500,00 · PREV 50,00 · líquido 450,00
   *   MAT-B  VENC 2.000,00 + HEXT 150,00 = 2.150,00 · PREV 10% = 215,00
   *          diferença: VENC 0,00 (não vira linha) · HEXT 150,00 · PREV 15,00 · líquido 135,00
   *
   * Total líquido da complementar = 450,00 + 135,00 = 585,00.
   */
  it("grava só as rubricas com diferença, com os valores da DIFERENÇA — N=2, deltas diferentes", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    expect(r.contracheques).toBe(2);
    expect(r.totalLiquido.toFixed(2)).toBe("585.00");

    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("MAT-A/HEXT")).toBe("500.00");
    expect(linhas.get("MAT-A/PREV")).toBe("50.00");
    expect(linhas.get("MAT-B/HEXT")).toBe("150.00");
    expect(linhas.get("MAT-B/PREV")).toBe("15.00");
    // ⚠️ O VENCIMENTO NÃO TEM LINHA: ele já foi pago inteiro em maio. Uma linha de 0,00 aqui
    // diria "o vencimento foi pago agora, no valor de zero" — e um leitor que somasse VENC das
    // duas folhas acharia o dobro se a linha viesse cheia.
    expect(linhas.has("MAT-A/VENC")).toBe(false);
    expect(linhas.has("MAT-B/VENC")).toBe(false);

    const liquidos = await liquidosGravados(folhaId);
    expect(liquidos.get("MAT-A")).toBe("450.00");
    expect(liquidos.get("MAT-B")).toBe("135.00");
  });

  it("a folha complementar nasce SEM exercício — ela recorre dentro do ano", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const f = await prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { exercicio: true, folhaDoAdiantamentoId: true } });
    // ⚠️ SE ISTO VIER 2026, O CHECK ANTIGO (`tipo <> 'MENSAL'`) VOLTOU: a complementar teria
    // exercício, e o `@@unique([exercicio, tipo])` passaria a dar UMA complementar por ANO.
    expect(f.exercicio).toBeNull();
    expect(f.folhaDoAdiantamentoId).toBeNull();
  });

  it("a folha mensal ORIGINAL não é tocada — a complementar não reabre nem corrige nada", async () => {
    const { mensalId } = await mensalFechadaComHorasExtrasLancadasDepois();
    const antes = await prisma.contracheque.findMany({ where: { calculo: { folhaId: mensalId } }, select: { sha256: true, liquido: true }, orderBy: { sha256: "asc" } });

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    const depois = await prisma.contracheque.findMany({ where: { calculo: { folhaId: mensalId } }, select: { sha256: true, liquido: true }, orderBy: { sha256: "asc" } });
    expect(depois.map((c) => `${c.sha256}/${c.liquido.toFixed(2)}`)).toEqual(antes.map((c) => `${c.sha256}/${c.liquido.toFixed(2)}`));
    expect(await prisma.calculoDaFolha.count({ where: { folhaId: mensalId } })).toBe(1);
  });

  it("a memória gravada diz DE ONDE veio cada diferença — folha, cálculo e valor anterior", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    const c = await prisma.contracheque.findFirstOrThrow({
      where: { calculo: { folhaId }, vinculo: { matricula: "MAT-A" } },
      select: { memoria: true },
    });
    const mem = c.memoria as Record<string, unknown>;
    expect(String(mem["natureza"])).toContain("DIFERENCA");
    const rubricas = mem["rubricas"] as readonly Record<string, unknown>[];
    const prev = rubricas.find((x) => x["codigo"] === "PREV")!;
    // ⚠️ O QUE SE AFIRMA É A PROCEDÊNCIA, e não só o número: "já apurado 300,00" sem dizer de que
    // folha e de que cálculo é uma afirmação que o documento não sustenta.
    expect(prev["correto"]).toBe("350.00");
    expect(prev["jaApurado"]).toBe("300.00");
    expect(prev["diferenca"]).toBe("50.00");
    expect(prev["procedencia"]).toEqual([{ folha: "MENSAL", competencia: COMP, calculo: 1, valor: "300.00" }]);
  });

  it("fecha pelo mesmo caminho da mensal, sem ato novo", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const f = await fecharFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(f.calculoId).toBe(r.calculoId);
    expect(await prisma.fechamentoDaFolha.count({ where: { folhaId } })).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c2 · AS RECUSAS — cada uma com o seu motivo, e nada gravado
// ═══════════════════════════════════════════════════════════════════════════════

describe("c2 · o que a complementar recusa", () => {
  it("sem mensal FECHADA na competência, recusa nomeando — senão pagaria o mês inteiro de novo", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    await vinculo("11111111111", "MAT-A", "3000.00");
    await vinculo("22222222222", "MAT-B", "2000.00");
    const mensal = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR }); // CALCULADA, não fechada

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/MENSAL-NAO-FECHADA/);
    // ⚠️ A NEGAÇÃO AFIRMA O EFEITO TAMBÉM: "recusou" é compatível com o serviço ter gravado o
    // cálculo e falhado depois.
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("sem diferença nenhuma, recusa em vez de gravar contracheques de zero", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    await vinculo("11111111111", "MAT-A", "3000.00");
    await vinculo("22222222222", "MAT-B", "2000.00");
    const mensal = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/COMPLEMENTAR-SEM-DIFERENCA/);
    expect(await prisma.contracheque.count({ where: { calculo: { folhaId } } })).toBe(0);
  });

  /**
   * ⚠️ DIFERENÇA NEGATIVA É RECUSA, NOMEANDO A MATRÍCULA — nunca clamp a zero.
   *
   * O reajuste de 3.000,00 para 2.500,00 é registrado com data de 1º de maio DEPOIS de a folha de
   * maio ter sido fechada por 3.000,00. O vencimento vigente no último dia da competência passa a
   * ser 2.500,00, e o correto fica ABAIXO do apurado: o servidor recebeu a mais.
   *
   * ⚠️ E ESTE É O CASO QUE SEPARA A COMPLEMENTAR DA RETIFICAÇÃO. Uma folha que se chama "pagar o
   * que faltou" não cobra de volta: repor ao erário é ato próprio, com rito próprio, e não existe
   * aqui. Seguir com zero pagaria as diferenças das outras rubricas e calaria sobre esta, com os
   * totais fechando — a forma exata de defeito que este módulo já pagou três vezes.
   */
  it("correto MENOR que o já apurado: recusa nomeando a matrícula e a rubrica", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    const a = await vinculo("11111111111", "MAT-A", "3000.00");
    await vinculo("22222222222", "MAT-B", "2000.00");
    const mensal = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });

    await registrarAlteracaoRemuneratoria(prisma, {
      vinculoId: a, tipo: "REAJUSTE_SALARIAL", data: D(2026, 5, 1), salarioBase: "2500.00",
      motivo: "correcao do enquadramento aplicada depois do fechamento", criadoPor: AUTOR,
    });

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/COMPLEMENTAR-COM-DIFERENCA-NEGATIVA[\s\S]*MAT-A[\s\S]*VENC/);
    /**
     * ⚠️ V11 V9.4b — O QUE A RECUSA AFIRMA É A APURAÇÃO, E O QUE ELA NÃO PODE AFIRMAR É O
     * RECEBIMENTO. Entre a folha FECHADA e o dinheiro na conta há certificação (que pode ser
     * DEVOLVIDA), empenho, liquidação e pagamento — e nenhum deles é consultado aqui. A recusa
     * cita a reposição ao erário como HIPÓTESE ("se esse valor chegou a ser pago"), nunca como
     * fato, e diz o que fazer.
     */
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/APURADOS A MAIS[\s\S]*em folha já fechada/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/O QUE FAZER/);
    // ⚠️ A METADE NEGATIVA, LIDA DA MENSAGEM E NÃO DE UM MATCHER AMBÍGUO: nada de "RECEBEU A
    // MAIS" nem de "já pago" — são os fatos que ninguém verificou.
    const capturado = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR }).then(
      () => null,
      (e: unknown) => (e instanceof Error ? e.message : String(e))
    );
    expect(capturado).not.toBeNull();
    expect(capturado).not.toMatch(/RECEBEU A MAIS|RETEVE A MAIS|já pag/i);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ QUEM FOI PAGO E NÃO ENTRA MAIS NO RECÁLCULO É RECUSA, NÃO OMISSÃO — e este é o caso que a
   * iteração ingênua perde inteiro.
   *
   * MAT-A é desligada com data de 30/04/2026, registrada DEPOIS de a folha de maio ter sido
   * fechada pagando-lhe o mês. O recálculo de maio não a alcança mais (desligamento anterior ao
   * início da competência), então ela some do conjunto dos contracheques corretos. Percorrendo só
   * esse conjunto, a complementar sairia normal com MAT-B — pagando 135,00 e calando sobre os
   * 2.700,00 que o ente tem a receber de volta de MAT-A, com os totais fechando.
   */
  it("vínculo apurado na competência e fora do recálculo: recusa nomeando a matrícula", async () => {
    const { a } = await mensalFechadaComHorasExtrasLancadasDepois();
    await desligarServidor(prisma, { vinculoId: a, data: D(2026, 4, 30), motivo: "exoneracao registrada depois do fechamento da folha de maio", criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/VINCULO-APURADO-FORA-DO-RECALCULO[\s\S]*MAT-A/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c3 · O QUE ENTRA NO "JÁ APURADO" — e o 13º NÃO entra
// ═══════════════════════════════════════════════════════════════════════════════

describe("c3 · a folha de adiantamento do 13º da MESMA competência não compõe a remuneração mensal", () => {
  /**
   * ⚠️ ESTE CASO É A PROVA DE `compoeARemuneracaoMensal`, e sem ele a propriedade é só um
   * comentário. A folha de ADIANTAMENTO do 13º de 2026-05 é uma folha DA competência 2026-05.
   * Se ela entrasse no "já apurado", a rubrica D13ADI teria correto 0,00 (o motor mensal não a
   * produz) e apurado > 0 — diferença NEGATIVA — e a complementar de maio RECUSARIA, dizendo que
   * o servidor deve ao erário metade do próprio 13º.
   *
   * Os números da complementar são os MESMOS de c1 (450,00 e 135,00): a presença do adiantamento
   * não pode mover um centavo.
   */
  it("a complementar calcula normalmente, com os mesmos valores, mesmo com o adiantamento fechado", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    // As três rubricas do 13º, além das de c1.
    const r13 = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
      ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
    };
    await r13({ codigo: "D13", descricao: "13o salario", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
    await r13({ codigo: "D13ADI", descricao: "Adiantamento do 13o", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
    await r13({ codigo: "D13ABAT", descricao: "Abatimento do adiantamento", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
    await cadastrarParametroDoDecimoTerceiro(prisma, {
      exercicio: 2026, diasMinimosDoAvo: 15, avosNoExercicio: 12, percentualDaPrimeiraParcela: "0.5",
      baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO", decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: false,
      rubricaDoDecimoTerceiroId: ids["D13"]!, rubricaDoAdiantamentoId: ids["D13ADI"]!, rubricaDoAbatimentoId: ids["D13ABAT"]!,
      rubricasDaBase: [ids["VENC"]!],
      atoEsfera: "MUNICIPAL", atoTipo: "ESTATUTO_DOS_SERVIDORES", atoNumero: "1.234", atoAno: 2010,
      atoDispositivo: "art. 78, § 2º", atoEmenta: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
      criadoPor: AUTOR,
    });

    const a = await vinculo("11111111111", "MAT-A", "3000.00");
    const b = await vinculo("22222222222", "MAT-B", "2000.00");

    const mensal = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: mensal.folhaId, criadoPor: AUTOR });

    // O ADIANTAMENTO DO 13º, na MESMA competência, calculado e FECHADO.
    const adi = await abrirFolha(prisma, { competencia: COMP, tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi.folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: adi.folhaId, criadoPor: AUTOR });
    const doAdiantamento = await linhasGravadas(adi.folhaId);
    expect(doAdiantamento.has("MAT-A/D13ADI"), "o adiantamento não pagou nada — o caso passaria por vacuidade").toBe(true);

    await lancarNaFolha(prisma, { vinculoId: a, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: COMP, valor: "500.00", criadoPor: AUTOR });
    await lancarNaFolha(prisma, { vinculoId: b, rubricaId: ids["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: COMP, valor: "150.00", criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    expect(r.totalLiquido.toFixed(2)).toBe("585.00");
    const liquidos = await liquidosGravados(folhaId);
    expect(liquidos.get("MAT-A")).toBe("450.00");
    expect(liquidos.get("MAT-B")).toBe("135.00");
    // E nenhuma linha do 13º aparece na complementar.
    const linhas = await linhasGravadas(folhaId);
    expect([...linhas.keys()].some((k) => k.includes("D13"))).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// c4 · AUTORIZAÇÃO — a positiva e a negativa, pela mesma ação da mensal
// ═══════════════════════════════════════════════════════════════════════════════

describe("c4 · autorização no servidor", () => {
  it("sem a ação de calcular, recusa NOMEANDO-A e não grava nada", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" } });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: SEM_PODER })).rejects.toThrow(/CALCULAR_FOLHA/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("com a ação, o mesmo cálculo passa — a negativa acima não passa por vacuidade", async () => {
    await mensalFechadaComHorasExtrasLancadasDepois();
    const { folhaId } = await abrirFolha(prisma, { competencia: COMP, tipo: "MENSAL_COMPLEMENTAR", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(r.contracheques).toBe(2);
  });
});
