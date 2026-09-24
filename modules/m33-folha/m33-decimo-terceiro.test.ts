import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
// `toMoney` entra para a CONFERÊNCIA CRUZADA de t4: somar dinheiro com `+` nativo é o que este
// repositório proíbe, e um teste que somasse errado "provaria" a conta errada com ar de prova.
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor, desligarServidor, registrarAlteracaoRemuneratoria, registrarMovimentacao } from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  calcularFolha,
  cancelarCalculoDaFolha,
  fecharFolha,
} from "./servico.js";
import { criarVersaoDaRubrica, aprovarVersaoDaRubrica } from "./versao-servico.js";
import {
  cadastrarParametroDoDecimoTerceiro,
  parametroVigenteDoExercicio,
  RubricaNaoAdmitidaNaBaseError,
  RubricaDoDecimoTerceiroInvalidaError,
} from "./decimo-terceiro-servico.js";
import { ParametroDoDecimoTerceiroAusenteError } from "./decimo-terceiro.js";

/**
 * M33 / V11 V9.1 — O 13º EM DUAS PARCELAS, COM BANCO. Regime de rigor: PROFUNDIDADE.
 *
 * ⚠️ OS AVOS ESPERADOS ESTÃO CALCULADOS À MÃO, mês a mês, no comentário de cada caso — e a conta
 * de dinheiro ao lado. O domínio puro tem o seu próprio arquivo; aqui o que se prova é o que só
 * o banco prova: a persistência, a recarga, o elo entre as duas folhas, a autorização e os CHECKs.
 *
 * ⚠️ AS TABELAS SÃO FIXTURES SINTÉTICAS (contribuição de 10% linear, IRRF zerado). Nenhum valor
 * aqui afirma alíquota oficial.
 *
 * ⚠️ E O PARÂMETRO DO 13º TAMBÉM É FIXTURE: 15 dias, 12 avos e 50% aparecem porque ALGUÉM tem de
 * declará-los para o teste rodar — e é exatamente o ponto. Trocá-los muda o resultado, e há um
 * caso abaixo que faz isso de propósito.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const AUTOR = "contabilidade@cg.pb.gov.br";
const REVISOR = "tesouraria@cg.pb.gov.br";
const SEM_PODER = "estagiario.do.13@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const ATO = {
  atoEsfera: "MUNICIPAL",
  atoTipo: "ESTATUTO_DOS_SERVIDORES",
  atoNumero: "1.234",
  atoAno: 2010,
  atoDispositivo: "art. 78, § 2º",
  atoEmenta: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
} as const;

async function tabelasDoEnte(): Promise<void> {
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: AUTOR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: AUTOR });
}

/** As rubricas sistêmicas mínimas mais as três do 13º, todas com versão APROVADA por outra pessoa. */
async function rubricasDoEnte(): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    ids[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13", descricao: "13o salario", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ADI", descricao: "Adiantamento do 13o", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ABAT", descricao: "Abatimento do adiantamento do 13o", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  // ⚠️ SEM VERSÃO APROVADA NENHUMA RUBRICA CALCULA (V11 V1.1). `cadastrarRubrica` cria a versão 1;
  // as de natureza VALOR_INFORMADO e DESCONTO também precisam dela para entrar no contracheque.
  return ids;
}

async function parametroPadrao(ids: Record<string, string>, over: Partial<Parameters<typeof cadastrarParametroDoDecimoTerceiro>[1]> = {}): Promise<void> {
  await cadastrarParametroDoDecimoTerceiro(prisma, {
    exercicio: 2026,
    diasMinimosDoAvo: 15,
    avosNoExercicio: 12,
    percentualDaPrimeiraParcela: "0.5",
    baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
    decimoTerceiroSofreContribuicao: true,
    decimoTerceiroSofreIrrf: false,
    rubricaDoDecimoTerceiroId: ids["D13"]!,
    rubricaDoAdiantamentoId: ids["D13ADI"]!,
    rubricaDoAbatimentoId: ids["D13ABAT"]!,
    rubricasDaBase: [ids["VENC"]!],
    ...ATO,
    criadoPor: AUTOR,
    ...over,
  });
}

async function vinculo(doc: string, matricula: string, salario: string, admissao: Date): Promise<string> {
  const cargo = (await prisma.cargo.findFirst({ select: { id: true } }))?.id ?? (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: AUTOR })).cargoId;
  const lotacao = (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ?? (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: AUTOR })).lotacaoId;
  const p = await prisma.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: AUTOR, versoes: { create: { nome: `Servidor ${matricula}`, criadoPor: AUTOR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: AUTOR });
  const { vinculoId } = await admitirServidor(prisma, { servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: admissao, cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: AUTOR });
  return vinculoId;
}

/**
 * Os contracheques de UMA folha, por matrícula — lidos do BANCO.
 *
 * ⚠️ O FILTRO POR FOLHA É O PONTO. Sem ele, `contracheque.findMany` devolve os contracheques de
 * TODAS as folhas do banco, e num cenário de duas parcelas isso traz o adiantamento junto com o
 * 13º. O teste passou assim por um tempo porque o primeiro cenário tinha folha única — uma
 * asserção que só está certa enquanto o cenário for pequeno.
 */
async function chequesDaFolha(folhaId: string): Promise<readonly (readonly [string, number | null, string])[]> {
  const cs = await prisma.contracheque.findMany({
    where: { calculo: { folhaId } },
    select: { avosComputados: true, diasComputados: true, liquido: true, vinculo: { select: { matricula: true } } },
    orderBy: { vinculo: { matricula: "asc" } },
  });
  return cs.map((c) => [c.vinculo.matricula, c.avosComputados, c.liquido.toFixed(2)] as const);
}

/** Os valores gravados, por matrícula e por código de rubrica — lidos do BANCO, não do retorno. */
async function linhasGravadas(folhaId: string): Promise<ReadonlyMap<string, string>> {
  const linhas = await prisma.linhaDoContracheque.findMany({
    where: { contracheque: { calculo: { folhaId } } },
    select: { valor: true, rubrica: { select: { codigo: true } }, contracheque: { select: { vinculo: { select: { matricula: true } } } } },
  });
  return new Map(linhas.map((l) => [`${l.contracheque.vinculo.matricula}/${l.rubrica.codigo}`, l.valor.toFixed(2)]));
}

beforeEach(async () => {
  await limparBanco(prisma);
});
afterAll(async () => {
  await prisma.$disconnect();
});

// ═══════════════════════════════════════════════════════════════════════════════
// t1 · O PARÂMETRO — autorização, coerência do ato e o recorte da base
// ═══════════════════════════════════════════════════════════════════════════════

describe("t1 · o parâmetro do 13º", () => {
  it("grava a versão 1 e a leitura devolve o que foi gravado (persistência e recarga)", async () => {
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    const lido = await parametroVigenteDoExercicio(prisma, 2026);
    expect(lido.parametro.versao).toBe(1);
    expect(lido.parametro.diasMinimosDoAvo).toBe(15);
    expect(lido.parametro.avosNoExercicio).toBe(12);
    expect(lido.parametro.percentualDaPrimeiraParcela.toFixed(4)).toBe("0.5000");
    expect(lido.parametro.ato.numero).toBe("1.234");
    expect(lido.parametro.ato.dispositivo).toBe("art. 78, § 2º");
    expect(lido.rubricasDaBase).toEqual([ids["VENC"]]);
  });

  /**
   * ⚠️ APPEND-ONLY: a segunda versão NÃO edita a primeira. A vigente passa a ser a 2, e a 1
   * continua na tabela — as folhas que ela calculou citam o id e a versão na memória, e sem a
   * linha o contracheque deixaria de se explicar.
   */
  it("a versão seguinte supera a anterior sem apagá-la", async () => {
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await parametroPadrao(ids, { diasMinimosDoAvo: 10 });
    const lido = await parametroVigenteDoExercicio(prisma, 2026);
    expect(lido.parametro.versao).toBe(2);
    expect(lido.parametro.diasMinimosDoAvo).toBe(10);
    expect(await prisma.parametroDoDecimoTerceiro.count({ where: { exercicio: 2026 } })).toBe(2);
  });

  /**
   * AUTORIZAÇÃO NEGATIVA COM O MOTIVO. "não completou" seria compatível com o servidor tendo
   * gravado e falhado depois — por isso a asserção é DUPLA: a mensagem nomeia a ação, e o banco
   * continua sem parâmetro nenhum.
   */
  it("sem a ação, recusa NOMEANDO-A e não grava nada", async () => {
    const ids = await rubricasDoEnte();
    await prisma.usuario.create({ data: { identificador: SEM_PODER, nome: "Estagiario sem perfil", criadoPor: "TESTE" } });
    await expect(parametroPadrao(ids, { criadoPor: SEM_PODER })).rejects.toThrow(/CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO/);
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  it("com a ação, o mesmo cadastro passa (a positiva, para a negativa acima não passar por vacuidade)", async () => {
    const ids = await rubricasDoEnte();
    await expect(parametroPadrao(ids)).resolves.toBeUndefined();
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(1);
  });

  it("ato sem número recusa antes de gravar", async () => {
    const ids = await rubricasDoEnte();
    await expect(parametroPadrao(ids, { atoNumero: "conforme a legislacao vigente" })).rejects.toThrow(/ATO-INCOERENTE/);
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  /**
   * ⚠️ A RECUSA VEM ANTES DA GRAVAÇÃO, e isso é a regra "efeito colateral antes da operação
   * guardada envenena a tentativa seguinte": gravar o parâmetro e só então descobrir a rubrica
   * inválida deixaria uma versão inútil ocupando o número — e nada aqui apaga.
   */
  it("rubrica de valor informado na BASE recusa, e o banco continua sem parâmetro", async () => {
    const ids = await rubricasDoEnte();
    await expect(parametroPadrao(ids, { rubricasDaBase: [ids["VENC"]!, ids["HEXT"]!] })).rejects.toThrow(RubricaNaoAdmitidaNaBaseError);
    await expect(parametroPadrao(ids, { rubricasDaBase: [ids["HEXT"]!] })).rejects.toThrow(/MÉDIA das/);
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  it("rubrica de abatimento com a natureza errada recusa nomeando a natureza que o motor lê", async () => {
    const ids = await rubricasDoEnte();
    await expect(parametroPadrao(ids, { rubricaDoAbatimentoId: ids["PREV"]! })).rejects.toThrow(RubricaDoDecimoTerceiroInvalidaError);
    await expect(parametroPadrao(ids, { rubricaDoAbatimentoId: ids["PREV"]! })).rejects.toThrow(/ABATIMENTO_DO_ADIANTAMENTO_DO_13/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t2 · A FOLHA DE 13º — N=2, com os avos escritos à mão
// ═══════════════════════════════════════════════════════════════════════════════

describe("t2 · a folha do 13º", () => {
  /**
   * ⚠️ FIXTURE N=2, e o par é o que separa a regra do acaso:
   * · M-1 admitido em 01/01/2020 → doze meses cheios → 12 avos → 12/12 × 3000 = 3000,00
   * · M-2 admitido em 20/03/2026 → março rende 11 dias (abaixo de 15) → 9 avos
   *                              → 9/12 × 3000 = 2250,00
   * Contribuição de 10% (fixture): 300,00 e 225,00. Líquidos 2700,00 e 2025,00.
   */
  it("calcula, grava e recarrega: 12 e 9 avos sobre a mesma base", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    const r = await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect(r.contracheques).toBe(2);

    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("M-1/D13")).toBe("3000.00");
    expect(linhas.get("M-2/D13")).toBe("2250.00");
    expect(linhas.get("M-1/PREV")).toBe("300.00");
    expect(linhas.get("M-2/PREV")).toBe("225.00");

    // os avos ficam gravados, e os dias ficam em zero — o CHECK do banco exige exatamente isso
    expect(await chequesDaFolha(folhaId)).toEqual([
      ["M-1", 12, "2700.00"],
      ["M-2", 9, "2025.00"],
    ]);
    // e os dias ficam em ZERO nos dois — o CHECK `ck_contracheque_avos_ou_dias` exige exatamente
    // isso quando `avosComputados` vem, e é o que impede o zero de ser lido como "não trabalhou"
    const dias = await prisma.contracheque.findMany({ where: { calculo: { folhaId } }, select: { diasComputados: true } });
    expect(dias.map((d) => d.diasComputados)).toEqual([0, 0]);
  });

  /**
   * ⚠️ O MESMO PAR, COM O PARÂMETRO TROCADO — é o que prova que o "15" não mora no motor.
   * Com mínimo de 10 dias, março de M-2 (11 dias) passa a contar: 10 avos, 2500,00.
   * M-1 não se move, e é por isso que o par importa: um teste com M-2 sozinho não distinguiria
   * "o parâmetro funcionou" de "a conta mudou para todo mundo".
   */
  it("baixar o mínimo do avo no parâmetro muda M-2 e não move M-1", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids, { diasMinimosDoAvo: 10 });
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("M-1/D13")).toBe("3000.00");
    expect(linhas.get("M-2/D13")).toBe("2500.00"); // 10/12 × 3000
  });

  it("sem parâmetro do exercício, recusa nomeando o exercício e não grava cálculo", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(ParametroDoDecimoTerceiroAusenteError);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/exercício 2026/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  it("o exercício é gravado na folha e o banco recusa duas folhas do mesmo tipo no mesmo ano", async () => {
    await tabelasDoEnte();
    await rubricasDoEnte();
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    const f = await prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { exercicio: true } });
    expect(f.exercicio).toBe(2026);
    // outra competência, mesmo tipo, mesmo ano: o @@unique([exercicio, tipo]) barra
    await expect(abrirFolha(prisma, { competencia: "2026-11", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR })).rejects.toThrow();
    // e a MENSAL segue livre: exercicio nulo, vários NULL convivem no índice único
    await expect(abrirFolha(prisma, { competencia: "2026-11", tipo: "MENSAL", criadoPor: AUTOR })).resolves.toBeTruthy();
    await expect(abrirFolha(prisma, { competencia: "2026-12", tipo: "MENSAL", criadoPor: AUTOR })).resolves.toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t3 · AS DUAS PARCELAS — o elo, o abatimento e as recusas que evitam pagar em dobro
// ═══════════════════════════════════════════════════════════════════════════════

describe("t3 · adiantamento e abatimento", () => {
  /** Monta o adiantamento de junho FECHADO, com o par N=2 de sempre. */
  async function adiantamentoFechado(ids: Record<string, string>): Promise<string> {
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId, criadoPor: REVISOR });
    return folhaId;
  }

  /**
   * ⚠️ N=2 NO ABATIMENTO, e o par é desigual de propósito:
   * · M-1 (admitido em 2020): 12 avos → adiantamento 50% × 12/12 × 3000 = 1500,00
   *   13º 3000,00 − contribuição 300,00 − abatimento 1500,00 = líquido 1200,00
   * · M-2 (admitido em 20/03/2026): 9 avos (março rende 11 dias, abaixo do mínimo de 15; janeiro e
   *   fevereiro são anteriores à admissão) → adiantamento 50% × 9/12 × 3000 = 1125,00
   *   13º 2250,00 − contribuição 225,00 − abatimento 1125,00 = líquido 900,00
   *
   * ⚠️ E A PRIMEIRA VERSÃO DESTE COMENTÁRIO ESTAVA ERRADA, o que é o motivo de o esperado ser
   * escrito à mão. Eu havia raciocinado que `EXERCICIO_INTEIRO` faria os avos de M-2 "projetarem
   * 12" no adiantamento de junho, e escrito 1500,00 para os dois. A execução devolveu 1125,00 e o
   * MOTOR estava certo: projetar até dezembro não apaga a admissão de março — os meses anteriores
   * ao vínculo nunca contam. O defeito era meu, e teria virado regra se o esperado viesse de
   * chamar `avosDoExercicio`.
   *
   * O par ficou MAIS forte do que eu pretendia: os dois adiantamentos são valores DIFERENTES
   * (1500,00 e 1125,00), então abater um valor fixo, ou abater o do vínculo errado, falha nos dois
   * sentidos — não só no líquido final.
   */
  it("a 2ª parcela abate o que a 1ª pagou, por vínculo", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const adiantamentoId = await adiantamentoFechado(ids);
    const doAdiantamento = await linhasGravadas(adiantamentoId);
    expect(doAdiantamento.get("M-1/D13ADI")).toBe("1500.00");
    expect(doAdiantamento.get("M-2/D13ADI")).toBe("1125.00"); // 9 avos, não 12: a admissão é de março
    // a 1ª parcela não desconta nada — limite declarado, e a ausência de linha é a prova
    expect(doAdiantamento.get("M-1/PREV")).toBeUndefined();

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    // o elo foi resolvido na abertura, e aponta para o adiantamento do exercício
    const f = await prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { folhaDoAdiantamentoId: true } });
    expect(f.folhaDoAdiantamentoId).toBe(adiantamentoId);

    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("M-1/D13ABAT")).toBe("1500.00");
    expect(linhas.get("M-2/D13ABAT")).toBe("1125.00");
    expect(await chequesDaFolha(folhaId)).toEqual([
      ["M-1", 12, "1200.00"], // 3000,00 − 300,00 − 1500,00
      ["M-2", 9, "900.00"], // 2250,00 − 225,00 − 1125,00
    ]);
  });

  it("adiantamento ABERTO recusa: abater cálculo que ainda pode mudar deixaria o 13º errado", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR }); // calculada, NÃO fechada

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/ADIANTAMENTO-NAO-FECHADO/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O CASO QUE MOTIVA A RECONFERÊNCIA NO CÁLCULO. A folha de 13º nasce em dezembro sem
   * adiantamento no exercício; alguém abre e fecha o adiantamento DEPOIS. Sem esta recusa o elo
   * ficaria nulo, o abatimento seria zero, e o ente pagaria o 13º INTEIRO a quem já recebeu
   * metade — com os totais fechando.
   */
  it("adiantamento que APARECE depois da abertura recusa, em vez de abater zero em silêncio", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    expect((await prisma.folhaDePagamento.findUniqueOrThrow({ where: { id: folhaId }, select: { folhaDoAdiantamentoId: true } })).folhaDoAdiantamentoId).toBeNull();

    await adiantamentoFechado(ids);

    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/ADIANTAMENTO-APARECEU-DEPOIS/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ⚠️ O ABATIMENTO MAIOR QUE O 13º — caso real, não defensiva. Adiantado em junho sobre o ano
   * PROJETADO (12 avos = 1500,00) e desligado em 10/04/2026: o 13º conta jan, fev e mar (abril
   * tem 10 dias, abaixo de 15) = 3/12 × 3000 = 750,00. O líquido seria negativo.
   */
  it("abatimento maior que o 13º recusa nomeando a matrícula", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    const v = await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await adiantamentoFechado(ids);

    await desligarServidor(prisma, { vinculoId: v, data: D(2026, 4, 10), motivo: "Exoneracao a pedido", criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/ABATIMENTO-MAIOR-QUE-O-13/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/M-1/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * O AFASTAMENTO CHEGA AO 13º — é o par que a mutação do instrumento vai atacar.
   * M-3 afastado de 10/05 a 05/08/2026 (o retorno é o primeiro dia trabalhado):
   *   maio 9 dias, junho e julho 0, agosto 26 → jan–abr (4) + ago (1) + set–dez (4) = 9 avos.
   * M-1, sem afastamento, continua em 12. Um motor que ignorasse o afastamento daria 12 aos dois.
   */
  it("o afastamento reduz os avos, e o par mostra quem não se move", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    const v3 = await vinculo("33333333333", "M-3", "3000.00", D(2020, 1, 1));
    await registrarMovimentacao(prisma, { vinculoId: v3, tipo: "AFASTAMENTO", data: D(2026, 5, 10), motivo: "Licenca para tratamento de saude", criadoPor: AUTOR });
    await registrarMovimentacao(prisma, { vinculoId: v3, tipo: "RETORNO_AFASTAMENTO", data: D(2026, 8, 5), motivo: "Retorno da licenca", criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    expect((await chequesDaFolha(folhaId)).map(([m, avos]) => [m, avos])).toEqual([
      ["M-1", 12],
      ["M-3", 9],
    ]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t4 · V11 V9.2 — a base com três naturezas, o half-even, as duas portas do
//      abatimento-como-provento, o cancelamento e o parâmetro trocado
// ═══════════════════════════════════════════════════════════════════════════════

describe("t4 · V11 V9.2", () => {
  /**
   * A BASE COM AS TRÊS NATUREZAS ADMITIDAS. `VALOR_INFORMADO` e `FORMULA` ficam FORA por decisão
   * declarada (`MEDIA-DAS-VARIAVEIS-NO-13`, TR 5.12.82) — e essa recusa tem caso próprio em t1.
   *
   * ⚠️ `QUIN` É `PERCENTUAL_DO_VENCIMENTO`, E ELE VALE PARA TODO VÍNCULO. O percentual mora na
   * VERSÃO DA RUBRICA, não no vínculo (`servico.ts`, o ramo `PERCENTUAL_DO_VENCIMENTO` da base do
   * 13º), então quem o põe na base do 13º dá o adicional a todos. O motor MENSAL faz igual; não é
   * defeito do 13º, é armadilha de CADASTRO — e está escrito aqui porque o par abaixo depende de
   * M-2 receber os 240,10 que muita gente esperaria que ela não recebesse.
   */
  async function rubricasComBaseDeTresNaturezas(): Promise<Record<string, string>> {
    const ids = await rubricasDoEnte();
    ids["GRAT"] = (await cadastrarRubrica(prisma, { codigo: "GRAT", descricao: "Gratificacoes do vinculo", tipo: "PROVENTO", natureza: "GRATIFICACOES_DO_VINCULO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 2, fundamentacaoLegal: "fixture", criadoPor: AUTOR })).rubricaId;
    ids["QUIN"] = (await cadastrarRubrica(prisma, { codigo: "QUIN", descricao: "Adicional por tempo de servico", tipo: "PROVENTO", natureza: "PERCENTUAL_DO_VENCIMENTO", percentual: "0.10", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 4, fundamentacaoLegal: "fixture", criadoPor: AUTOR })).rubricaId;
    return ids;
  }

  /** A memória gravada de um contracheque, por matrícula — lida do BANCO. */
  async function memoriaDe(folhaId: string, matricula: string): Promise<Record<string, unknown>> {
    const c = await prisma.contracheque.findFirstOrThrow({
      where: { calculo: { folhaId }, vinculo: { matricula } },
      select: { memoria: true },
    });
    return c.memoria as Record<string, unknown>;
  }

  /**
   * ═══ O PAR N=2 PONTA A PONTA, COM TODO O ESPERADO ESCRITO À MÃO ═══
   *
   * Parâmetro (fixture, NÃO norma): avo de 15 dias, 12 avos, 1ª parcela 50%, avos do adiantamento
   * pelo EXERCÍCIO INTEIRO, 13º com contribuição e sem IRRF. Tabelas: RPPS 10% linear sem teto,
   * IRRF 0%. Base: VENC + GRAT + QUIN(10%).
   *
   * ── OS AVOS, mês a mês ──
   * M-1 (admitida 01/01/2020): os doze meses rendem 30/30 dias ≥ 15 → 12 avos.
   * M-2 (admitida 20/03/2026):
   *     jan e fev: admissão posterior à competência           → 0 dias  → não conta
   *     mar: primeiro = dia fiscal 20, último = 30 → 30−20+1  → 11 dias → 11 < 15, NÃO conta
   *     abr..dez: nove meses de 30 dias                       → contam  → 9 avos
   *   ⚠️ `EXERCICIO_INTEIRO` projeta o corte até dezembro, e isso NÃO apaga a admissão de março.
   *      São 9, não 12 — o erro de raciocínio que a regra do "esperado à mão" pegou na V11 V9.1.
   *
   * ── A BASE INTEGRAL ──
   * M-1: VENC 3.000,00 + GRAT 500,00 + QUIN 0,10×3.000,00 = 300,00  → 3.800,00
   * M-2: VENC 2.401,00 + GRAT     0,00 + QUIN 0,10×2.401,00 = 240,10 → 2.641,10
   *
   * ── O 13º APURADO ──
   * M-1: 3.800,00 × 12/12 = 3.800,00
   * M-2: 2.641,10 × 9/12  = 1.980,825  ← EMPATE EXATO no meio do centavo
   *      ⚠️ HALF-EVEN (`toMoney`, packages/contracts) FICA COM 1.980,82: entre 1.980,82 e
   *         1.980,83 vence o dígito PAR. HALF-UP DARIA 1.980,83. Se alguém "consertar" este
   *         número para 1.980,83, trocou a regra de arredondamento do sistema inteiro sem dizer.
   *         O vencimento de M-2 é 2.401,00 (e não 2.400,00) exatamente para produzir este empate:
   *         com 2.400,00 tudo fecha redondo e a regra passa por vacuidade.
   *
   * ── 1ª PARCELA (50%) ──   M-1: 1.900,00      M-2: 1.980,82 × 0,5 = 990,41
   * ── 2ª PARCELA ──
   *   contribuição 10%:      M-1:   380,00      M-2: 1.980,82 × 0,10 = 198,082 → 198,08
   *   abatimento:            M-1: 1.900,00      M-2:   990,41
   *   líquido:               M-1: 3.800,00 − 380,00 − 1.900,00 = 1.520,00
   *                          M-2: 1.980,82 − 198,08 −   990,41 =   792,33
   */
  it("o par N=2 com base de três naturezas: avos, half-even, as duas parcelas e a conferência cruzada", async () => {
    await tabelasDoEnte();
    const ids = await rubricasComBaseDeTresNaturezas();
    await parametroPadrao(ids, { rubricasDaBase: [ids["VENC"]!, ids["GRAT"]!, ids["QUIN"]!] });
    const v1 = await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "2401.00", D(2026, 3, 20));
    await registrarAlteracaoRemuneratoria(prisma, { vinculoId: v1, tipo: "GRATIFICACAO", data: D(2024, 1, 1), gratificacaoDescricao: "Funcao gratificada", gratificacaoValor: "500.00", motivo: "Designacao para funcao gratificada", criadoPor: AUTOR });

    // ── 1ª parcela ────────────────────────────────────────────────────────────
    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    const l1 = await linhasGravadas(adi);
    expect(l1.get("M-1/D13ADI")).toBe("1900.00");
    expect(l1.get("M-2/D13ADI")).toBe("990.41");
    // a 1ª parcela não retém nada — a AUSÊNCIA das linhas é a prova, não o valor zero
    expect(l1.get("M-1/PREV")).toBeUndefined();
    expect(l1.get("M-2/PREV")).toBeUndefined();
    expect(await chequesDaFolha(adi)).toEqual([
      ["M-1", 12, "1900.00"],
      ["M-2", 9, "990.41"],
    ]);
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    // ── 2ª parcela ────────────────────────────────────────────────────────────
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const l2 = await linhasGravadas(folhaId);
    // o apurado de M-2 é o empate exato resolvido para BAIXO pelo half-even
    expect(l2.get("M-2/D13")).toBe("1980.82");
    expect(l2.get("M-1/D13")).toBe("3800.00");
    expect(l2.get("M-1/PREV")).toBe("380.00");
    expect(l2.get("M-2/PREV")).toBe("198.08");
    expect(l2.get("M-1/D13ABAT")).toBe("1900.00");
    expect(l2.get("M-2/D13ABAT")).toBe("990.41");
    // IRRF não incide neste parâmetro: de novo, a ausência da linha é a prova
    expect(l2.get("M-1/IRRF")).toBeUndefined();
    expect(await chequesDaFolha(folhaId)).toEqual([
      ["M-1", 12, "1520.00"],
      ["M-2", 9, "792.33"],
    ]);

    /**
     * ⚠️ A CONFERÊNCIA CRUZADA — a asserção que não depende de eu ter acertado os intermediários.
     * O que o servidor recebe nas DUAS parcelas tem de ser o 13º bruto menos a contribuição, e
     * mais nada. Ela quebra se o abatimento errar de valor, de vínculo, de folha ou de sinal.
     */
    const cruzada = (parcela1: string, liquido2: string, bruto: string, contribuicao: string): void => {
      expect(toMoney(parcela1).plus(toMoney(liquido2)).toFixed(2)).toBe(toMoney(bruto).minus(toMoney(contribuicao)).toFixed(2));
    };
    cruzada("1900.00", "1520.00", "3800.00", "380.00"); // = 3420,00
    cruzada("990.41", "792.33", "1980.82", "198.08"); //   = 1782,74
  });

  /**
   * ═══ A PROCEDÊNCIA DO ABATIMENTO CHEGA AO BANCO (V11 V9.2) ═══
   *
   * ⚠️ O QUE ESTA GUARDA IMPEDE É UMA AFIRMAÇÃO FALSA, NÃO UM CENTAVO ERRADO. Até a V11 V9.2 a
   * memória do contracheque — o documento com que o servidor confere o próprio pagamento, lacrado
   * em sha256 — dizia "1ª parcela já PAGA". O único fato que o cálculo verifica é o FECHAMENTO da
   * folha de adiantamento. Entre fechada e paga há certificação (que pode ser DEVOLVIDA), empenho
   * e liquidação, e o pagamento nem é ato do M33.
   */
  it("a memória grava a PROCEDÊNCIA do abatimento e não afirma pagamento nenhum", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });

    const mem = await memoriaDe(folhaId, "M-1");
    const proc = mem["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["folhaDeAdiantamento"]).toBe("2026-06");
    expect(proc["calculoNumero"]).toBe(1);
    // ninguém certificou nada neste cenário, e a memória diz isso em vez de calar
    expect(proc["situacaoDaCertificacao"]).toBe("PENDENTE");
    expect(proc["fatoVerificado"]).toBe("FECHAMENTO_DA_FOLHA_DE_ADIANTAMENTO");

    const texto = JSON.stringify(mem);
    expect(texto).toMatch(/1ª parcela APURADA na folha de adiantamento FECHADA de 2026-06/);
    // ⚠️ A ASSERÇÃO NEGATIVA É O PONTO. Sem ela, encurtar o texto de volta para "já paga" passa.
    expect(texto).not.toMatch(/já paga/);

    // e no ADIANTAMENTO não há procedência: não existe 1ª parcela anterior de onde proceder
    expect((await memoriaDe(adi, "M-1"))["procedenciaDoAbatimento"]).toBeNull();
  });

  /**
   * ═══ AS DUAS PORTAS DO "ABATIMENTO CADASTRADO COMO PROVENTO" ═══
   *
   * ⚠️ ESTE É O DEFEITO Nº 1 DA V11 V9.1, E ELE FOI CONSERTADO SEM QUE NASCESSE A ASSERÇÃO QUE O
   * VIGIA. Uma rubrica de abatimento com tipo PROVENTO SOMARIA a 1ª parcela à 2ª em vez de
   * abatê-la: o ente pagaria uma vez e meia o 13º, e o contracheque FECHARIA — proventos e
   * descontos batem, o empenho bate, a liquidação bate. Nenhuma etapa adiante acusa.
   *
   * São DUAS portas para o mesmo dano, e testar só uma deixa a outra aberta:
   *   (1) o CADASTRO DA RUBRICA (`zCadastrarRubricaInput`, o superRefine que classifica DESCONTO);
   *   (2) o CADASTRO DO PARÂMETRO, que confere o papel de cada rubrica antes de gravar.
   */
  it("porta 1: cadastrar a rubrica de abatimento como PROVENTO é recusado, nomeando a natureza", async () => {
    await expect(
      cadastrarRubrica(prisma, { codigo: "D13ABATX", descricao: "Abatimento como provento", tipo: "PROVENTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 96, fundamentacaoLegal: "fixture", criadoPor: AUTOR })
    ).rejects.toThrow(/ABATIMENTO_DO_ADIANTAMENTO_DO_13 é DESCONTO/);
    expect(await prisma.rubrica.count({ where: { codigo: "D13ABATX" } })).toBe(0);
  });

  it("porta 2: apontar o abatimento do parâmetro para uma rubrica PROVENTO é recusado, dizendo o motivo", async () => {
    const ids = await rubricasDoEnte();
    // `D13` é PROVENTO — é o que um operador apontaria por engano, e é o que somaria em vez de abater
    await expect(parametroPadrao(ids, { rubricaDoAbatimentoId: ids["D13"]! })).rejects.toThrow(RubricaDoDecimoTerceiroInvalidaError);
    await expect(parametroPadrao(ids, { rubricaDoAbatimentoId: ids["D13"]! })).rejects.toThrow(/é PROVENTO e precisa ser DESCONTO/);
    // a recusa vem ANTES da gravação — nada ocupa o número da versão
    expect(await prisma.parametroDoDecimoTerceiro.count()).toBe(0);
  });

  /**
   * ═══ O CANCELAMENTO DO CÁLCULO DO ADIANTAMENTO — a combinação que ninguém percorria ═══
   *
   * Cancelar o cálculo não "desfecha" coisa nenhuma: ele deixa a folha SEM cálculo vivo, e é isso
   * que o 13º tem de enxergar. Depois, recalculado e fechado, o abatimento sai do cálculo nº 2 —
   * e NÃO da soma dos dois. Um motor que somasse os cálculos da folha (em vez de ler o cálculo do
   * FECHAMENTO) abateria 3.000,00 aqui, e o líquido de M-1 cairia para zero sem nada acusar.
   */
  it("cancelar o cálculo do adiantamento: fechar recusa, e depois o 13º abate o cálculo nº 2, não a soma", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    const c1 = await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    expect(c1.numero).toBe(1);
    await cancelarCalculoDaFolha(prisma, { calculoId: c1.calculoId, motivo: "Vencimento de M-1 lancado errado", criadoPor: AUTOR });

    // sem cálculo VIVO não se fecha — e o 13º, por consequência, recusa
    await expect(fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR })).rejects.toThrow(/FOLHA-SEM-CALCULO-VIVO/);

    const c2 = await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    expect(c2.numero).toBe(2);
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    const linhas = await linhasGravadas(folhaId);
    // 1.500,00 e 1.125,00 — os valores de UM cálculo. A soma dos dois daria 3.000,00 e 2.250,00.
    expect(linhas.get("M-1/D13ABAT")).toBe("1500.00");
    expect(linhas.get("M-2/D13ABAT")).toBe("1125.00");
    // e a memória aponta para o cálculo nº 2, que é o que o fechamento consagrou
    expect(((await memoriaDe(folhaId, "M-1"))["procedenciaDoAbatimento"] as Record<string, unknown>)["calculoNumero"]).toBe(2);
  });

  /**
   * ═══ ABATIMENTO MAIOR QUE O 13º, PELO DESLIGAMENTO — sem encenar pagamento nenhum ═══
   *
   * M-2 é admitida em 20/03/2026 e adiantada em junho sobre o exercício INTEIRO: 9 avos de
   * 2.641,10 = 1.980,825 → 1.980,82; metade = 990,41.
   * Desligada em 31/07/2026, o 13º conta abr, mai, jun e jul (julho rende o mês fiscal inteiro,
   * 30 dias) = 4 avos: 2.641,10 × 4/12 = 880,3666… → 880,37.
   *   990,41 > 880,37 → o líquido ficaria negativo, e a folha RECUSA nomeando a matrícula.
   *
   * ⚠️ O FATO NOVO É UM DESLIGAMENTO, ato ordinário do M32 — nenhuma ordem bancária, nenhum
   * pagamento, nenhum estado inventado para o cenário fechar.
   */
  it("abatimento maior que o 13º pelo desligamento em 31/07, e o par mostra quem não se move", async () => {
    await tabelasDoEnte();
    const ids = await rubricasComBaseDeTresNaturezas();
    await parametroPadrao(ids, { rubricasDaBase: [ids["VENC"]!, ids["GRAT"]!, ids["QUIN"]!] });
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    const v2 = await vinculo("22222222222", "M-2", "2401.00", D(2026, 3, 20));

    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    expect((await linhasGravadas(adi)).get("M-2/D13ADI")).toBe("990.41");
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    await desligarServidor(prisma, { vinculoId: v2, data: D(2026, 7, 31), motivo: "Exoneracao a pedido", criadoPor: AUTOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/ABATIMENTO-MAIOR-QUE-O-13/);
    // ⚠️ NOMEIA A MATRÍCULA, e a certa: M-1 (12 avos, 3.800,00) passa folgado. Uma recusa que
    // nomeasse a matrícula errada mandaria o RH tratar quem não tem problema nenhum.
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/M-2/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/880\.37/);
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
  });

  /**
   * ═══ `PARAMETRO-TROCADO-ENTRE-AS-PARCELAS` — ESTE TESTE DOCUMENTA UM BURACO, NÃO O FECHA ═══
   *
   * ⚠️ LEIA ANTES DE "CONSERTAR" QUALQUER COISA AQUI. O que ele afirma é o comportamento de HOJE,
   * e o comportamento de hoje é indefensável: nada impede cadastrar a versão 2 do parâmetro ENTRE
   * o fechamento do adiantamento e o cálculo do 13º. `cadastrarParametroDoDecimoTerceiro` não
   * consulta `FolhaDePagamento`, e `parametroVigenteDoExercicio` sempre pega a de maior `versao`.
   *
   * O dano, com os números abaixo: baixando o avo de 15 para 10 dias, março (11 dias) passa a
   * contar e M-2 salta de 9 para 10 avos. A 2ª parcela é calculada sobre 10 avos e abate um
   * adiantamento apurado sobre 9. AS DUAS PARCELAS PASSAM A FALAR DE EXERCÍCIOS DIFERENTES — e a
   * folha fecha, o total bate, o empenho bate, a liquidação bate. Não há etapa adiante que acuse;
   * é exatamente o dano que a atualização de permissões v28 descreve para esta ação.
   *
   * A ÚNICA defesa hoje é a concessão restrita de CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO.
   *
   * ⚠️ FAZER O MOTOR RECUSAR AQUI É DECISÃO PENDENTE, NÃO ESQUECIMENTO. Comparar a `versao` citada
   * pela memória do adiantamento com a vigente e recusar seria barato — o dado já está gravado —,
   * mas muda o que o sistema EXIGE do ente, e essa é decisão de quem responde pelo produto, não
   * deste arquivo. Enquanto não vier, o buraco fica com teste, nome e número, que é melhor que
   * ficar só na cabeça de quem o encontrou.
   */
  /** Monta o desalinhamento: adiantamento fechado na v1, parâmetro trocado para a v2. */
  async function adiantamentoNaV1EParametroNaV2(ids: Record<string, string>): Promise<string> {
    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    // 9 avos na v1 (avo de 15 dias): 50% × 9/12 × 3000 = 1125,00
    expect((await linhasGravadas(adi)).get("M-2/D13ADI")).toBe("1125.00");
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });
    // ⚠️ O CADASTRO DA v2 CONTINUA PASSANDO, e é deliberado: o parâmetro é append-only e o ente
    // pode corrigi-lo quando quiser. Quem recusa é o CÁLCULO da parcela final, que é onde a
    // incoerência aritmética se consumaria.
    await parametroPadrao(ids, { diasMinimosDoAvo: 10 });
    expect((await parametroVigenteDoExercicio(prisma, 2026)).parametro.versao).toBe(2);
    return adi;
  }

  it("ACUSA: trocar o parâmetro entre as parcelas RECUSA o cálculo da parcela final", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids); // versão 1: avo de 15 dias
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));
    await adiantamentoNaV1EParametroNaV2(ids);

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/PARAMETRO-TROCADO-ENTRE-AS-PARCELAS/);

    /**
     * ⚠️ A NEGAÇÃO AFIRMA O MOTIVO, E O MOTIVO AQUI É ORIENTAÇÃO. "Recusou" é compatível com uma
     * mensagem que não diz ao servidor do RH o que fazer — e a tela é o único lugar onde ele lê
     * isso. As asserções abaixo exigem os dois números (a versão que apurou a 1ª parcela e a
     * vigente) e a saída: voltar a vigência à versão com que se adiantou.
     */
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/VERSÃO 1 do parâmetro/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/vigente agora é a 2/);
    // os DOIS critérios, lado a lado — é o que permite ao RH ver o que mudou sem abrir o cadastro
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/diasMinimosDoAvo=15/);
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/diasMinimosDoAvo=10/);
    // e a saída, que o caso seguinte percorre de fato
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/append-only/);

    // ⚠️ E NADA FOI GRAVADO. Uma recusa que deixasse o cálculo nº 1 pela metade envenenaria a
    // tentativa seguinte, que é a regra do "efeito colateral antes da operação guardada".
    expect(await prisma.calculoDaFolha.count({ where: { folhaId } })).toBe(0);
    expect(await prisma.contracheque.count({ where: { calculo: { folhaId } } })).toBe(0);
  });

  /**
   * ⚠️ A POSITIVA PAREADA — sem ela a negativa acima passa por VACUIDADE. Se a guarda recusasse
   * SEMPRE (um `throw` incondicional, ou uma comparação que nunca bate), o teste de cima ficaria
   * verde e o 13º estaria quebrado para todo mundo. Este caso é o mesmo cenário com a mesma
   * versão nas duas parcelas: tem de PASSAR, e passar com o número certo.
   */
  it("e a positiva: mesma versão nas duas parcelas calcula normalmente (senão a negativa acima é vácua)", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).resolves.toBeTruthy();
    const linhas = await linhasGravadas(folhaId);
    expect(linhas.get("M-2/D13")).toBe("2250.00"); // 9 avos, a mesma régua das duas parcelas
    expect(linhas.get("M-2/D13ABAT")).toBe("1125.00");

    // a memória do 13º carrega as DUAS versões, e elas são iguais — a identidade fica conferível
    const mem = await memoriaDe(folhaId, "M-2");
    const proc = mem["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["versaoDoParametroDoAdiantamento"]).toBe(1);
    expect((mem["parametro"] as Record<string, unknown>)["versao"]).toBe(1);
  });

  /**
   * ⚠️ VOLTAR A VIGÊNCIA É A SAÍDA QUE A MENSAGEM PROMETE — e uma mensagem que promete uma saída
   * que não funciona é pior que uma recusa seca. Aqui o ente faz o que a recusa mandou: cadastra
   * de novo o critério com que adiantou (append-only, vira a v3) e o cálculo passa.
   *
   * ⚠️ ATENÇÃO AO QUE ISTO **NÃO** DIZ: não é um override. A v3 é uma decisão registrada, com
   * autor e ato, não uma caixa "ignorar" — e o 13º sai pela régua com que foi adiantado, que é
   * exatamente o que a guarda exige.
   */
  it("a saída que a recusa oferece funciona: recadastrar o critério do adiantamento destrava o cálculo", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));
    await adiantamentoNaV1EParametroNaV2(ids);

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).rejects.toThrow(/PARAMETRO-TROCADO-ENTRE-AS-PARCELAS/);

    // o ente volta ao critério com que adiantou — append-only, então é a versão 3
    await parametroPadrao(ids, { diasMinimosDoAvo: 15 });
    expect((await parametroVigenteDoExercicio(prisma, 2026)).parametro.versao).toBe(3);

    /**
     * ⚠️ AGORA PASSA — e é por isso que a guarda compara a RÉGUA, e não o `id` do parâmetro.
     *
     * A primeira versão desta guarda comparava a identidade do registro. Este teste é quem a
     * derrubou: a v3 tem exatamente o critério da v1 e um `id` novo, então a comparação por
     * identidade recusaria para sempre — e a saída que a própria mensagem oferece não existiria.
     * Uma recusa sem saída dentro do exercício não é fail-closed, é beco sem saída.
     */
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).resolves.toBeTruthy();
    const linhas = await linhasGravadas(folhaId);
    // de volta ao avo de 15 dias: M-2 tem 9 avos, 9/12 × 3000 = 2250,00, e abate os 1125,00 da 1ª
    expect(linhas.get("M-2/D13")).toBe("2250.00");
    expect(linhas.get("M-2/D13ABAT")).toBe("1125.00");
    // a memória registra a v3 como a que calculou e a v1 como a que adiantou — versões diferentes,
    // mesma régua, e é a régua que a conta exige
    const proc = (await memoriaDe(folhaId, "M-2"))["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["versaoDoParametroDoAdiantamento"]).toBe(1);
  });

  /**
   * ⚠️ O QUE A GUARDA **NÃO** BLOQUEIA, e isto é tão importante quanto o que ela bloqueia. Mudar a
   * EMENTA do ato entre as parcelas não mexe em avo nenhum: o abatimento continua sendo o valor
   * apurado, e a subtração continua coerente. Uma guarda que recusasse aqui viraria proibição de
   * corrigir um texto — zelo virado obstáculo, e o ente sem saída dentro do exercício.
   *
   * Este caso é o que mantém a lista `CAMPOS_DA_REGUA_DO_AVO` honesta: alguém que a alargue "por
   * segurança" derruba este teste e tem de justificar campo a campo.
   */
  it("mudar o ATO entre as parcelas NÃO bloqueia — só a régua do avo é exigida igual", async () => {
    await tabelasDoEnte();
    const ids = await rubricasDoEnte();
    await parametroPadrao(ids);
    await vinculo("11111111111", "M-1", "3000.00", D(2020, 1, 1));
    await vinculo("22222222222", "M-2", "3000.00", D(2026, 3, 20));

    const { folhaId: adi } = await abrirFolha(prisma, { competencia: "2026-06", tipo: "ADIANTAMENTO_DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId: adi, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId: adi, criadoPor: REVISOR });

    // a mesma régua, outro texto de ato (a correção de uma ementa mal transcrita)
    await parametroPadrao(ids, { atoEmenta: "Dispoe sobre a gratificacao natalina e da outras providencias" });
    expect((await parametroVigenteDoExercicio(prisma, 2026)).parametro.versao).toBe(2);

    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await expect(calcularFolha(prisma, { folhaId, criadoPor: AUTOR })).resolves.toBeTruthy();
    expect((await linhasGravadas(folhaId)).get("M-2/D13ABAT")).toBe("1125.00");
  });
});
