import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { declararRoteiroPatrimonial } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { admitirServidor, cadastrarCargo, cadastrarLotacao, cadastrarServidor } from "../m32-pessoal/servico.js";
import { acertarDecimoTerceiro, apropriacoesDoExercicio, apropriarPorCompetencia, declararParametroDeFerias } from "./apropriacao-por-competencia.js";
import { cadastrarParametroDoDecimoTerceiro } from "./decimo-terceiro-servico.js";
import { abrirFolha, cadastrarRubrica, cadastrarTabelaDeContribuicao, cadastrarTabelaIrrf, calcularFolha, fecharFolha, lancarNaFolha } from "./servico.js";

/**
 * V35 — APROPRIAÇÃO MENSAL DO 13º E DAS FÉRIAS (MCASP 11ª ed., Parte II, item 18). Profundidade: razão e folha.
 *
 * ⚠️ CONTAS À MÃO. Dois vínculos admitidos em 01/01/2026: A com vencimento 3.000 e hora extra 500 em maio;
 * B com vencimento 2.000. A base do 13º declarada é só o VENCIMENTO: a hora extra NÃO entra (prova da seleção).
 *   13º (avosNoExercicio 12):        A 3.000/12 = 250,00       B 2.000/12 = 166,666… → 166,67   total 416,67
 *   férias, 12 meses, abono 1/3, sem a remuneração do período:
 *                                    A 3.000/36 = 83,333… → 83,33   B 2.000/36 = 55,555… → 55,56   total 138,89
 *   férias com a remuneração (versão 2 do parâmetro), competência de junho:
 *                                    A 3.000×4/36 = 333,33     B 2.000×4/36 = 222,22         total 555,55
 *   Acerto do 13º: apropriado só maio (416,67); a liquidação da folha do 13º baixa 400,00 do passivo
 *   (lançamento que representa a perna patrimonial da liquidação com o grupo apontando o passivo) → sobra 16,67;
 *   o acerto lança D passivo / C VPD 16,67 e o passivo fecha o ano em zero, como o MCASP manda.
 * Os números de 13º e férias (12 avos, 12 meses, 1/3) são FIXTURE declarada, não constante do motor.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const AUTOR = "contabilidade@cg.pb.gov.br";
const FECHA = "tesouraria@cg.pb.gov.br";
const SEM_PODER = "estagiario.rh@cg.pb.gov.br";
const D = (a: number, m: number, d: number): Date => meioDiaCivil(`${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
const ATO = { atoEsfera: "MUNICIPAL", atoTipo: "ESTATUTO_DOS_SERVIDORES", atoNumero: "1.234", atoAno: 2010, atoDispositivo: "art. 78", atoEmenta: "Dispoe sobre a gratificacao natalina" } as const;
const FUNDAMENTO = "MCASP 11ª ed., Parte II, item 18 — apropriação por competência; contas do PCASP 2025.";

const CONTAS = [
  ["3.1.1.1.1.01.22", "13. SALÁRIO", "DEVEDORA"],
  ["3.1.1.1.1.01.24", "FÉRIAS - ABONO CONSTITUCIONAL", "DEVEDORA"],
  ["2.1.1.1.1.01.01", "SALÁRIOS, REMUNERAÇÕES E BENEFÍCIOS", "CREDORA"],
  ["2.1.1.1.1.01.02", "DÉCIMO TERCEIRO SALÁRIO", "CREDORA"],
  ["2.1.1.1.1.01.03", "FÉRIAS", "CREDORA"],
] as const;

let rub: Record<string, string> = {};
let vA = "";
let vB = "";

async function vinculo(doc: string, matricula: string, salario: string): Promise<string> {
  const cargo = (await prisma.cargo.findFirst({ select: { id: true } }))?.id ?? (await cadastrarCargo(prisma, { codigo: "PROF", denominacao: "Professor", tipo: "EFETIVO", vagasFixadas: 50, leiAutorizativa: "Lei 1/2010", dataPublicacaoLei: D(2010, 1, 1), criadoPor: AUTOR })).cargoId;
  const lotacao = (await prisma.lotacao.findFirst({ select: { id: true } }))?.id ?? (await cadastrarLotacao(prisma, { codigo: "SEDUC", nome: "Educacao", criadoPor: AUTOR })).lotacaoId;
  const p = await prisma.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: AUTOR, versoes: { create: { nome: `Servidor ${matricula}`, criadoPor: AUTOR } } }, select: { id: true } });
  const { servidorId } = await cadastrarServidor(prisma, { pessoaId: p.id, dataNascimento: D(1985, 7, 20), sexo: "FEMININO", criadoPor: AUTOR });
  return (await admitirServidor(prisma, { servidorId, matricula, tipo: "EFETIVO", regimeJuridico: "Estatutario", regimePrevidenciario: "RPPS", dataAdmissao: D(2026, 1, 1), cargoId: cargo, lotacaoId: lotacao, salarioBase: salario, criadoPor: AUTOR })).vinculoId;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS.map(([codigo, nome, naturezaSaldo]) => ({ codigo, nome, naturezaSaldo, nivel: 7, analitica: true })) });
  await cadastrarTabelaDeContribuicao(prisma, { regime: "RPPS", competenciaInicio: "2026-01", fundamentacaoLegal: "FIXTURE lei municipal", faixas: [{ ordem: 1, ate: null, aliquota: "0.10" }], criadoPor: AUTOR });
  await cadastrarTabelaIrrf(prisma, { competenciaInicio: "2026-01", deducaoPorDependente: "0.00", fundamentacaoLegal: "FIXTURE de teste", faixas: [{ ordem: 1, ate: null, aliquota: "0" }], criadoPor: AUTOR });
  rub = {};
  const r = async (i: Parameters<typeof cadastrarRubrica>[1]): Promise<void> => {
    rub[i.codigo] = (await cadastrarRubrica(prisma, i)).rubricaId;
  };
  await r({ codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true, ordem: 1, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 3, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13", descricao: "13o salario", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: true, incideIrrf: true, proporcionalAosDias: false, ordem: 10, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ADI", descricao: "Adiantamento do 13o", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 11, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "D13ABAT", descricao: "Abatimento do adiantamento do 13o", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 95, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 90, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await r({ codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", incideContribuicao: false, incideIrrf: false, proporcionalAosDias: false, ordem: 91, fundamentacaoLegal: "fixture", criadoPor: AUTOR });
  await cadastrarParametroDoDecimoTerceiro(prisma, {
    exercicio: 2026, diasMinimosDoAvo: 15, avosNoExercicio: 12, percentualDaPrimeiraParcela: "0.5", baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
    decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: false, rubricaDoDecimoTerceiroId: rub["D13"]!, rubricaDoAdiantamentoId: rub["D13ADI"]!,
    rubricaDoAbatimentoId: rub["D13ABAT"]!, rubricasDaBase: [rub["VENC"]!], ...ATO, criadoPor: AUTOR,
  });
  vA = await vinculo("11144477735", "MAT-A", "3000.00");
  vB = await vinculo("52998224725", "MAT-B", "2000.00");
  await lancarNaFolha(prisma, { vinculoId: vA, rubricaId: rub["HEXT"]!, tipo: "VARIAVEL", competenciaInicio: "2026-05", valor: "500.00", criadoPor: AUTOR });
}

async function folhaFechada(competencia: string): Promise<void> {
  const { folhaId } = await abrirFolha(prisma, { competencia, criadoPor: AUTOR });
  await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
  await fecharFolha(prisma, { folhaId, criadoPor: FECHA });
}

async function roteiros(): Promise<void> {
  await declararRoteiroPatrimonial(prisma, { familia: "APROPRIACAO_PESSOAL", chave: "APROPRIACAO/DECIMO_TERCEIRO", contaDebitoCodigo: "3.1.1.1.1.01.22", contaCreditoCodigo: "2.1.1.1.1.01.02", historicoPadrao: "Apropriação do 13º salário", fundamento: FUNDAMENTO, criadoPor: AUTOR });
  await declararRoteiroPatrimonial(prisma, { familia: "APROPRIACAO_PESSOAL", chave: "APROPRIACAO/FERIAS", contaDebitoCodigo: "3.1.1.1.1.01.24", contaCreditoCodigo: "2.1.1.1.1.01.03", historicoPadrao: "Apropriação das férias", fundamento: FUNDAMENTO, criadoPor: AUTOR });
}

async function parametroDeFerias(incluiRemuneracaoDoPeriodo: boolean): Promise<void> {
  await declararParametroDeFerias(prisma, { exercicio: 2026, mesesDoPeriodoAquisitivo: 12, abonoNumerador: 1, abonoDenominador: 3, incluiRemuneracaoDoPeriodo, fundamento: "CF, art. 7º, XVII; Estatuto dos Servidores (fixture), art. 80", criadoPor: AUTOR });
}

/** Saldo credor da conta, somado à mão a partir das partidas (independente do serviço). */
async function saldoCredor(codigo: string): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } });
  let c = 0n;
  for (const p of ps) c += (p.tipo === "CREDITO" ? 1n : -1n) * BigInt(p.valor.toFixed(2).replace(".", ""));
  const s = (c < 0n ? -c : c).toString().padStart(3, "0");
  return `${c < 0n ? "-" : ""}${s.slice(0, -2)}.${s.slice(-2)}`;
}

describe("M33 — apropriação mensal do 13º e das férias por competência", () => {
  beforeEach(async () => {
    await semear();
  });

  it("t1: a folha fechada de maio vira o duodécimo de cada vínculo, só pelas rubricas da base; a segunda vez é recusada", async () => {
    await roteiros();
    await parametroDeFerias(false);
    await folhaFechada("2026-05");
    const r = await apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR });
    expect(r).toEqual({ competencia: "2026-05", decimoTerceiro: "416.67", ferias: "138.89", vinculos: 2 });

    const itens = await prisma.itemDaApropriacaoPorCompetencia.findMany({ select: { vinculoId: true, base: true, valor: true, apropriacao: { select: { tipo: true } } } });
    const de = (v: string, t: string) => itens.find((i) => i.vinculoId === v && i.apropriacao.tipo === t);
    expect([de(vA, "DECIMO_TERCEIRO")!.base.toFixed(2), de(vA, "DECIMO_TERCEIRO")!.valor.toFixed(2)]).toEqual(["3000.00", "250.00"]);
    expect(de(vB, "DECIMO_TERCEIRO")!.valor.toFixed(2)).toBe("166.67");
    expect([de(vA, "FERIAS")!.valor.toFixed(2), de(vB, "FERIAS")!.valor.toFixed(2)]).toEqual(["83.33", "55.56"]);

    expect(await saldoCredor("2.1.1.1.1.01.02")).toBe("416.67");
    expect(await saldoCredor("3.1.1.1.1.01.22")).toBe("-416.67");
    expect(await saldoCredor("2.1.1.1.1.01.03")).toBe("138.89");

    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR })).rejects.toThrow(/2026-05 já foi apropriada/);
    expect(await apropriacoesDoExercicio(prisma, 2026)).toHaveLength(2);
  });

  it("t2: com a remuneração do período no parâmetro, as férias de junho são base × (1 + 1/3) / 12", async () => {
    await roteiros();
    await parametroDeFerias(false);
    await parametroDeFerias(true); // versão 2, a vigente
    await folhaFechada("2026-06");
    const r = await apropriarPorCompetencia(prisma, { competencia: "2026-06", criadoPor: AUTOR });
    expect(r).toMatchObject({ decimoTerceiro: "416.67", ferias: "555.55" });
  });

  it("t3: folha aberta, sem parâmetro de férias ou sem roteiro — recusa nomeada, e nada gravado", async () => {
    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR })).rejects.toThrow(/parâmetro de férias declarado para 2026/);
    await parametroDeFerias(false);
    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR })).rejects.toThrow(/roteiro da apropriação do 13º e das férias não está declarado/);
    await roteiros();
    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR })).rejects.toThrow(/folha mensal de 2026-05 não está fechada/);
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-05", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR })).rejects.toThrow(/folha mensal de 2026-05 não está fechada/);
    expect(await prisma.apropriacaoPorCompetencia.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    await expect(apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: SEM_PODER })).rejects.toThrow(/APROPRIAR_FOLHA/);
  });

  it("t4: o acerto do 13º recusa sem a folha do 13º fechada e sem baixa; com a baixa, zera o passivo no fim do ano", async () => {
    await roteiros();
    await parametroDeFerias(false);
    await folhaFechada("2026-05");
    await apropriarPorCompetencia(prisma, { competencia: "2026-05", criadoPor: AUTOR });

    await expect(acertarDecimoTerceiro(prisma, { exercicio: 2026, criadoPor: AUTOR })).rejects.toThrow(/folha do 13º de 2026 não está fechada/);
    const { folhaId } = await abrirFolha(prisma, { competencia: "2026-12", tipo: "DECIMO_TERCEIRO", criadoPor: AUTOR });
    await calcularFolha(prisma, { folhaId, criadoPor: AUTOR });
    await fecharFolha(prisma, { folhaId, criadoPor: FECHA });
    await expect(acertarDecimoTerceiro(prisma, { exercicio: 2026, criadoPor: AUTOR })).rejects.toThrow(/não recebeu baixa nenhuma em 2026/);
    expect(await prisma.acertoDoDecimoTerceiro.count()).toBe(0);

    // a perna patrimonial da liquidação da folha do 13º, com o grupo apontando o passivo apropriado
    const conta = async (codigo: string) => (await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo }, select: { id: true } })).id;
    await prisma.$transaction(async (tx) =>
      lancarNoRazao(tx, {
        numeroControle: "LIQ-13", dataTransacao: D(2026, 12, 18), historico: "Liquidação da folha do 13º", origemTipo: "LIQUIDACAO", criadoPor: AUTOR,
        partidas: [
          { contaId: await conta("2.1.1.1.1.01.02"), tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "400.00" },
          { contaId: await conta("2.1.1.1.1.01.01"), tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "400.00" },
        ],
      })
    );
    const a = await acertarDecimoTerceiro(prisma, { exercicio: 2026, criadoPor: AUTOR });
    expect(a.saldoAntes).toBe("16.67");
    expect(await saldoCredor("2.1.1.1.1.01.02")).toBe("0.00");
    expect(await saldoCredor("3.1.1.1.1.01.22")).toBe("-400.00");
    await expect(acertarDecimoTerceiro(prisma, { exercicio: 2026, criadoPor: AUTOR })).rejects.toThrow(/já foi acertado/);
  });
});
