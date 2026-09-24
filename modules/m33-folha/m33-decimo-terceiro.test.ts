import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor, desligarServidor, registrarMovimentacao } from "../m32-pessoal/servico.js";
import {
  abrirFolha,
  cadastrarRubrica,
  cadastrarTabelaDeContribuicao,
  cadastrarTabelaIrrf,
  calcularFolha,
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
