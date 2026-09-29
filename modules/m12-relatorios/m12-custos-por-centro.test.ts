import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { toMoney, toPercentual } from "../../packages/contracts/index.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { anularLiquidacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { ratearPorPercentual, somaDasPartes } from "./custos.js";
import { apropriarCustoDaLiquidacao, publicarCriterioDeRateio } from "./custos-servico.js";
import { composicaoDoCentro, criteriosDeRateio, custoPorCentro } from "./custos-consultas.js";

/**
 * ═══ M12/C05 — A APROPRIAÇÃO DE CUSTO POR CENTRO, CONTRA BANCO ═══
 *
 * A prova que o requisito pede está escrita nele: *"apropriar um custo elegível de 1.000,00 a dois
 * centros, 600,00 e 400,00: a composição deve voltar ao fato, SEM NOVA DESPESA"*. Os três pedaços
 * dessa frase são três asserções diferentes, e nenhuma delas se prova sozinha:
 *
 *   · **600 e 400** — a aritmética do rateio (t1);
 *   · **volta ao fato** — a composição devolve a liquidação, o empenho e o credor (t2);
 *   · **sem nova despesa** — a contagem de `LancamentoContabil` e de `MovimentoDotacao` é a MESMA
 *     antes e depois (t3). É a asserção mais importante do arquivo: um custo que lança no razão
 *     conta a mesma variação patrimonial diminutiva duas vezes, e o resultado do exercício sai
 *     errado sem que nada recuse.
 *
 * ⚠️ FIXTURE N=2 EM TODO LUGAR, porque rateio é exatamente a regra que passa por vacuidade com um
 * centro só: com N=1 o percentual é sempre 100, o resíduo é sempre zero e a soma fecha por
 * acidente. Há dois centros no critério de dois, e TRÊS no critério do resíduo — com dois centros
 * de 50 % o centavo nunca sobra.
 *
 * ⚠️ E A FIXTURE É PRÓPRIA, não a do M08. Importar helpers de um arquivo `.test.ts` alheio
 * registra as suítes dele dentro desta (o Vitest executa o módulo inteiro), e o custo de uma
 * corrida deste arquivo passaria a incluir o encerramento de exercício do M08.
 */

const prisma = criarPrismaDeTeste();
// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte inteiramente
// pulada o Vitest reporta como passando (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "custos@cg.pb.gov.br";
const SEM_CRACHA = "so.consulta@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-custo";

const EDU = "set-edu";
const SAU = "set-sau";
const ADM = "set-adm";
const DESATIVADO = "set-morto";

const CONTAS = [
  { id: "cc-disp", codigo: "6.2.2.1.1.00.00", nome: "Credito Disponivel", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "cc-emp", codigo: "6.2.2.1.3.01.00", nome: "Credito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "cc-liq", codigo: "6.2.2.1.3.03.00", nome: "Credito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "cc-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD de servicos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "cc-forn", codigo: "2.1.3.1.1.00.00", nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: "3.3.2.1.1.01.00",
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
  creditoLiquidado: "6.2.2.1.3.03.00",
});

let deps: M05Deps;

async function usuarioComPerfil(
  identificador: string,
  perfil: string,
  acoes: readonly string[]
): Promise<void> {
  const p = await prisma.perfil.create({
    data: {
      nome: perfil,
      descricao: perfil,
      criadoPor: "SEED",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) },
    },
    select: { id: true },
  });
  const u = await prisma.usuario.create({
    data: { identificador, nome: identificador, criadoPor: "SEED" },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({
    data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" },
  });
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Secretaria de Administracao", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administracao" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Administracao geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "Gestao" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "Manutencao", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Servicos de terceiros PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1,
    orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04",
    subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });

  // ⚠️ OS CENTROS DE CUSTO SÃO SETORES — nenhum cadastro novo. Ver o docblock de `custos.ts`.
  await prisma.setor.createMany({
    data: [
      { id: EDU, codigo: "SEC-EDU", nome: "Secretaria de Educacao", unidadeOrcId: "uo-01", criadoPor: "SEED" },
      { id: SAU, codigo: "SEC-SAU", nome: "Secretaria de Saude", unidadeOrcId: "uo-01", criadoPor: "SEED" },
      { id: ADM, codigo: "SEC-ADM", nome: "Secretaria de Administracao", unidadeOrcId: "uo-01", criadoPor: "SEED" },
      { id: DESATIVADO, codigo: "SEC-EXT", nome: "Secretaria extinta", unidadeOrcId: "uo-01", ativo: false, criadoPor: "SEED" },
    ],
  });

  await usuarioComPerfil(POR, "CONTABILIDADE_DE_CUSTOS", [
    "PARAMETRIZAR_RATEIO_DE_CUSTO",
    "APROPRIAR_CUSTO",
    "EMPENHAR",
    "LIQUIDAR",
    "ANULAR_LIQUIDACAO_PARCIAL",
  ]);
  await usuarioComPerfil(SEM_CRACHA, "SO_CONSULTA", ["CONSULTAR_DESPESA"]);
}

beforeEach(semear, 120_000);

/** Uma despesa reconhecida: empenho e liquidação pelo domínio, nunca linha fabricada. */
async function despesaDe(valor: string, numero: string): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${numero}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-06-01T12:00:00Z"), credorCpfCnpj: "12345678000195",
      historico: `empenho ${numero}`,
      categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${numero}`, valor,
      data: new Date("2026-08-01T12:00:00Z"),
      responsavelAtesto: "Fulano de Tal", historico: `liquidacao ${numero}`, criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  return l.liquidacaoId;
}

const CRITERIO_60_40 = {
  chave: "RATEIO-ALUGUEL-PREDIO-CENTRAL",
  atoRef: "Portaria 12/2026 da Secretaria de Financas",
  vigenteDesde: new Date("2026-01-01T00:00:00Z"),
  centroDoResiduoId: EDU,
  itens: [
    { centroId: EDU, percentual: toPercentual("60") },
    { centroId: SAU, percentual: toPercentual("40") },
  ],
  criadoPor: POR,
};

const publicar60_40 = () => publicarCriterioDeRateio(prisma, CRITERIO_60_40);

const apropriar = (p: {
  liquidacaoId: string;
  valor?: string;
  competencia?: string;
  chave?: string;
  por?: string;
}) =>
  apropriarCustoDaLiquidacao(prisma, {
    liquidacaoId: p.liquidacaoId,
    criterioChave: p.chave ?? CRITERIO_60_40.chave,
    competencia: new Date(p.competencia ?? "2026-08-31T00:00:00Z"),
    valor: p.valor,
    motivo: "Apropriacao do aluguel do predio central ao mes de agosto",
    criadoPor: p.por ?? POR,
  });

// ═══════════════════════════════════════════════════════════════════════════
// A ARITMÉTICA, PURA — sem banco, porque ela não precisa de um
// ═══════════════════════════════════════════════════════════════════════════

describe("o rateio por percentual (puro)", () => {
  it("t0a 1.000,00 em 60/40 da 600,00 e 400,00, e a soma fecha EXATAMENTE", () => {
    const partes = ratearPorPercentual(
      toMoney("1000.00"),
      [
        { centroId: EDU, percentual: toPercentual("60") },
        { centroId: SAU, percentual: toPercentual("40") },
      ],
      EDU
    );
    expect(partes.map((p) => p.valor.toFixed(2))).toEqual(["600.00", "400.00"]);
    expect(somaDasPartes(partes).toFixed(2)).toBe("1000.00");
  });

  it("t0b o CENTAVO que sobra vai ao centro declarado — e nao ao ultimo da lista", () => {
    // ⚠️ N=3 DE PROPÓSITO: 1.000,00 em três partes iguais dá 333,33 três vezes e sobra 0,01. Com
    // dois centros de 50 % isto nunca aconteceria, e a regra passaria por vacuidade.
    const fatias = [
      { centroId: EDU, percentual: toPercentual("33.333333") },
      { centroId: SAU, percentual: toPercentual("33.333333") },
      { centroId: ADM, percentual: toPercentual("33.333334") },
    ];
    const noMeio = ratearPorPercentual(toMoney("1000.00"), fatias, SAU);
    expect(somaDasPartes(noMeio).toFixed(2)).toBe("1000.00");
    const porCentro = new Map(noMeio.map((p) => [p.centroId, p.valor.toFixed(2)]));
    expect(porCentro.get(SAU)).toBe("333.34");
    expect(porCentro.get(EDU)).toBe("333.33");
    expect(porCentro.get(ADM)).toBe("333.33");

    // e mudar SÓ o dono do resíduo move o centavo — a prova de que ele não cai por ordem
    const noPrimeiro = ratearPorPercentual(toMoney("1000.00"), fatias, EDU);
    expect(new Map(noPrimeiro.map((p) => [p.centroId, p.valor.toFixed(2)])).get(EDU)).toBe("333.34");
    expect(somaDasPartes(noPrimeiro).toFixed(2)).toBe("1000.00");
  });

  it("t0c recusa rateio sem centro, valor negativo e centro do residuo FORA do rateio", () => {
    expect(() => ratearPorPercentual(toMoney("10.00"), [], EDU)).toThrow(/ao menos um centro/i);
    expect(() =>
      ratearPorPercentual(toMoney("-1.00"), [{ centroId: EDU, percentual: toPercentual("100") }], EDU)
    ).toThrow(/valor negativo/i);
    expect(() =>
      ratearPorPercentual(toMoney("10.00"), [{ centroId: EDU, percentual: toPercentual("100") }], SAU)
    ).toThrow(/NÃO ESTÁ NO RATEIO/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CRITÉRIO
// ═══════════════════════════════════════════════════════════════════════════

describe("o criterio de rateio", () => {
  it("t1 publica a v1 e a proxima publicacao da MESMA chave e a v2 — append-only", async () => {
    const v1 = await publicar60_40();
    expect(v1.versao).toBe(1);
    expect(v1.centros).toBe(2);

    const v2 = await publicarCriterioDeRateio(prisma, {
      ...CRITERIO_60_40,
      vigenteDesde: new Date("2026-07-01T00:00:00Z"),
      itens: [
        { centroId: EDU, percentual: toPercentual("50") },
        { centroId: SAU, percentual: toPercentual("50") },
      ],
    });
    expect(v2.versao).toBe(2);
    // a v1 continua no banco: é ela que responde "contra que régua aquilo foi apropriado?"
    expect(await prisma.criterioDeRateioDeCusto.count({ where: { chave: CRITERIO_60_40.chave } })).toBe(2);
  });

  it("t2 recusa soma DIFERENTE de 100, centro repetido e residuo fora do rateio", async () => {
    await expect(
      publicarCriterioDeRateio(prisma, {
        ...CRITERIO_60_40,
        itens: [
          { centroId: EDU, percentual: toPercentual("60") },
          { centroId: SAU, percentual: toPercentual("30") },
        ],
      })
    ).rejects.toThrow(/SOMA DOS PERCENTUAIS É 90\.000000 E TEM DE SER 100/i);

    await expect(
      publicarCriterioDeRateio(prisma, {
        ...CRITERIO_60_40,
        itens: [
          { centroId: EDU, percentual: toPercentual("60") },
          { centroId: EDU, percentual: toPercentual("40") },
        ],
      })
    ).rejects.toThrow(/MESMO CENTRO APARECE DUAS VEZES/i);

    await expect(
      publicarCriterioDeRateio(prisma, { ...CRITERIO_60_40, centroDoResiduoId: ADM })
    ).rejects.toThrow(/CENTRO DO RESÍDUO TEM DE RECEBER PARTE/i);

    expect(await prisma.criterioDeRateioDeCusto.count()).toBe(0);
  });

  it("t3 recusa centro INEXISTENTE e centro DESATIVADO, nomeando o setor", async () => {
    await expect(
      publicarCriterioDeRateio(prisma, {
        ...CRITERIO_60_40,
        itens: [
          { centroId: EDU, percentual: toPercentual("60") },
          { centroId: "setor-que-nao-existe", percentual: toPercentual("40") },
        ],
      })
    ).rejects.toThrow(/CENTRO DE CUSTO INEXISTENTE/i);

    let msg = "";
    try {
      await publicarCriterioDeRateio(prisma, {
        ...CRITERIO_60_40,
        itens: [
          { centroId: EDU, percentual: toPercentual("60") },
          { centroId: DESATIVADO, percentual: toPercentual("40") },
        ],
      });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/DESATIVADO/i);
    expect(msg).toContain("SEC-EXT");
    expect(await prisma.criterioDeRateioDeCusto.count()).toBe(0);
  });

  it("t4 recusa quem NAO tem a acao — e o motivo e a permissao, nao o cadastro", async () => {
    await expect(publicarCriterioDeRateio(prisma, { ...CRITERIO_60_40, criadoPor: SEM_CRACHA }))
      .rejects.toThrow();
    expect(await prisma.criterioDeRateioDeCusto.count()).toBe(0);
  });

  it("t5 a listagem marca como VIGENTE a versao decorrida, e nao a de vigencia futura", async () => {
    await publicar60_40();
    await publicarCriterioDeRateio(prisma, {
      ...CRITERIO_60_40,
      vigenteDesde: new Date("2027-01-01T00:00:00Z"),
      itens: [
        { centroId: EDU, percentual: toPercentual("50") },
        { centroId: SAU, percentual: toPercentual("50") },
      ],
    });
    const lista = await criteriosDeRateio(prisma, { em: new Date("2026-08-31T00:00:00Z") });
    expect(lista).toHaveLength(2);
    const vigente = lista.find((c) => c.vigente);
    expect(vigente?.versao).toBe(1);
    expect(vigente?.itens.map((i) => i.percentual)).toEqual(["60.000000", "40.000000"]);
    // e em 2027 a vigente passa a ser a v2, sem ninguém reescrever nada
    const em2027 = await criteriosDeRateio(prisma, { em: new Date("2027-03-01T00:00:00Z") });
    expect(em2027.find((c) => c.vigente)?.versao).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A APROPRIAÇÃO — a prova que C05 pede
// ═══════════════════════════════════════════════════════════════════════════

describe("a apropriacao do custo de uma liquidacao", () => {
  it("t6 apropria 1.000,00 a dois centros em 600,00 e 400,00, SEM NOVA DESPESA", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");

    // ⚠️ O RETRATO DE ANTES. É a contagem, e não o comentário, que prova "sem lançar novamente a
    // mesma despesa": a apropriação não cria partida no razão nem movimento de dotação.
    const lancamentosAntes = await prisma.lancamentoContabil.count();
    const movimentosAntes = await prisma.movimentoDotacao.count();
    const somaDoRazaoAntes = await prisma.partidaContabil.aggregate({ _sum: { valor: true } });

    const r = await apropriar({ liquidacaoId });

    expect(r.valor.toFixed(2)).toBe("1000.00");
    const porCentro = new Map(r.partes.map((p) => [p.centroId, p.valor.toFixed(2)]));
    expect(porCentro.get(EDU)).toBe("600.00");
    expect(porCentro.get(SAU)).toBe("400.00");

    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes);
    expect(await prisma.movimentoDotacao.count()).toBe(movimentosAntes);
    const somaDoRazaoDepois = await prisma.partidaContabil.aggregate({ _sum: { valor: true } });
    expect(somaDoRazaoDepois._sum.valor?.toFixed(2)).toBe(somaDoRazaoAntes._sum.valor?.toFixed(2));

    // e o que EXISTE é a apropriação, com as duas partes gravadas
    expect(await prisma.apropriacaoDeCusto.count()).toBe(1);
    expect(await prisma.itemDaApropriacaoDeCusto.count()).toBe(2);
  });

  it("t7 a composicao VOLTA AO FATO: a liquidacao, o empenho e o credor", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");
    await apropriar({ liquidacaoId });

    const composicao = await composicaoDoCentro(prisma, { centroId: EDU, exercicio: 2026 });
    expect(composicao).toHaveLength(1);
    const linha = composicao[0]!;
    expect(linha.valorNoCentro.toFixed(2)).toBe("600.00");
    expect(linha.valorApropriado.toFixed(2)).toBe("1000.00");
    expect(linha.liquidacaoNumero).toBe("NL-C05");
    expect(linha.liquidacaoValor.toFixed(2)).toBe("1000.00");
    expect(linha.empenhoNumero).toBe("NE-C05");
    expect(linha.credor).toBe("12345678000195");
    expect(linha.criterio).toBe(CRITERIO_60_40.chave);
    expect(linha.criterioVersao).toBe(1);
    expect(linha.criterioAto).toBe(CRITERIO_60_40.atoRef);

    // o acumulado por centro é a soma das partes gravadas, e ele fecha com o apropriado
    const relatorio = await custoPorCentro(prisma, { exercicio: 2026 });
    expect(relatorio.total.toFixed(2)).toBe("1000.00");
    expect(relatorio.centros.map((c) => [c.centroCodigo, c.total.toFixed(2)])).toEqual([
      ["SEC-EDU", "600.00"],
      ["SEC-SAU", "400.00"],
    ]);
    // o centro sem apropriação NÃO aparece com zero: um relatório de custos não inventa linha
    expect(relatorio.centros.some((c) => c.centroCodigo === "SEC-ADM")).toBe(false);
    expect(relatorio.centros[0]?.unidadeCodigo).toBe("01001");
  });

  it("t8 o TETO e o liquido: apropriar duas vezes acima da despesa e RECUSADO", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");

    await apropriar({ liquidacaoId, valor: "600.00" });
    let msg = "";
    try {
      await apropriar({ liquidacaoId, valor: "600.00" });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/ACIMA DA DESPESA/i);
    expect(msg).toContain("400.00");
    expect(msg).toMatch(/Nada foi gravado/i);
    // e o resto exato passa
    const r = await apropriar({ liquidacaoId, valor: "400.00" });
    expect(r.valor.toFixed(2)).toBe("400.00");
    // a terceira não tem o que apropriar, e a recusa diz o quanto já foi
    await expect(apropriar({ liquidacaoId })).rejects.toThrow(/NADA A APROPRIAR/i);
    const total = await custoPorCentro(prisma, { exercicio: 2026 });
    expect(total.total.toFixed(2)).toBe("1000.00");
  });

  it("t9 a ANULACAO PARCIAL reduz o teto, e o liquido e o mesmo que o razao reconhece", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");
    await anularLiquidacaoParcial(
      {
        originalId: liquidacaoId, numero: "NL-C05-ANUL", valor: "400.00",
        data: new Date("2026-08-20T12:00:00Z"),
        motivo: "Glosa parcial do atesto por servico nao prestado",
        criadoPor: POR,
      },
      deps
    );

    // sem valor informado, aproprie-se o LÍQUIDO: 1.000 - 400 = 600
    const r = await apropriar({ liquidacaoId });
    expect(r.valor.toFixed(2)).toBe("600.00");
    expect(new Map(r.partes.map((p) => [p.centroId, p.valor.toFixed(2)])).get(EDU)).toBe("360.00");

    // e o bruto NÃO é o teto: pedir 1.000 sobre uma liquidação reduzida é recusado
    await expect(apropriar({ liquidacaoId, valor: "1000.00" })).rejects.toThrow(/ACIMA DA DESPESA/i);
  });

  it("t10 recusa apropriar SOBRE a linha de anulacao — o fato e a liquidacao original", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");
    await anularLiquidacaoParcial(
      {
        originalId: liquidacaoId, numero: "NL-C05-ANUL", valor: "400.00",
        data: new Date("2026-08-20T12:00:00Z"),
        motivo: "Glosa parcial do atesto por servico nao prestado",
        criadoPor: POR,
      },
      deps
    );
    const anulacao = await prisma.liquidacao.findFirstOrThrow({
      where: { anulacaoParcialDeId: liquidacaoId },
      select: { id: true },
    });
    let msg = "";
    try {
      await apropriar({ liquidacaoId: anulacao.id });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/APROPRIAÇÃO SOBRE ANULAÇÃO/i);
    expect(msg).toMatch(/liquidação ORIGINAL/i);
    expect(await prisma.apropriacaoDeCusto.count()).toBe(0);
  });

  it("t11 recusa quando NENHUMA versao do criterio vigia na competencia", async () => {
    await publicarCriterioDeRateio(prisma, {
      ...CRITERIO_60_40,
      vigenteDesde: new Date("2027-01-01T00:00:00Z"),
    });
    const liquidacaoId = await despesaDe("1000.00", "C05");
    let msg = "";
    try {
      await apropriar({ liquidacaoId, competencia: "2026-08-31T00:00:00Z" });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/CRITÉRIO DE RATEIO NÃO VIGENTE/i);
    expect(msg).toContain(CRITERIO_60_40.chave);
    expect(await prisma.apropriacaoDeCusto.count()).toBe(0);

    // e uma chave inexistente cai na MESMA recusa, com o nome da chave pedida
    await expect(apropriar({ liquidacaoId, chave: "RATEIO-QUE-NINGUEM-PUBLICOU" }))
      .rejects.toThrow(/CRITÉRIO DE RATEIO NÃO VIGENTE/i);
  });

  it("t12 recusa quem NAO tem a acao de apropriar", async () => {
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");
    await expect(apropriar({ liquidacaoId, por: SEM_CRACHA })).rejects.toThrow();
    expect(await prisma.apropriacaoDeCusto.count()).toBe(0);
  });

  it("t13 a COMPETENCIA e o recorte, e nao a data da liquidacao", async () => {
    // ⚠️ A liquidação é de AGOSTO e a competência declarada é DEZEMBRO. O custo tem de aparecer em
    // dezembro — "custo não é necessariamente o mesmo instante do desembolso".
    await publicar60_40();
    const liquidacaoId = await despesaDe("1000.00", "C05");
    await apropriar({ liquidacaoId, competencia: "2026-12-31T00:00:00Z" });

    const agosto = await custoPorCentro(prisma, {
      de: new Date("2026-08-01T00:00:00Z"),
      ate: new Date("2026-08-31T23:59:59Z"),
    });
    expect(agosto.total.toFixed(2)).toBe("0.00");
    expect(agosto.centros).toHaveLength(0);

    const dezembro = await custoPorCentro(prisma, {
      de: new Date("2026-12-01T00:00:00Z"),
      ate: new Date("2026-12-31T23:59:59Z"),
    });
    expect(dezembro.total.toFixed(2)).toBe("1000.00");
    // e no exercício inteiro ele aparece uma vez só
    const ano = await custoPorCentro(prisma, { exercicio: 2026 });
    expect(ano.total.toFixed(2)).toBe("1000.00");
  });

  it("t14 DUAS liquidacoes no mesmo centro SOMAM, e a composicao lista as duas", async () => {
    // ⚠️ FIXTURE N=2 NO ACÚMULO: com uma liquidação só, um relatório que devolvesse "a última" em
    // vez da soma passaria igual.
    await publicar60_40();
    const a = await despesaDe("1000.00", "A");
    const b = await despesaDe("500.00", "B");
    await apropriar({ liquidacaoId: a });
    await apropriar({ liquidacaoId: b });

    const relatorio = await custoPorCentro(prisma, { exercicio: 2026 });
    expect(relatorio.total.toFixed(2)).toBe("1500.00");
    const edu = relatorio.centros.find((c) => c.centroCodigo === "SEC-EDU");
    expect(edu?.total.toFixed(2)).toBe("900.00");
    expect(edu?.apropriacoes).toBe(2);
    const sau = relatorio.centros.find((c) => c.centroCodigo === "SEC-SAU");
    expect(sau?.total.toFixed(2)).toBe("600.00");

    const composicao = await composicaoDoCentro(prisma, { centroId: EDU, exercicio: 2026 });
    expect(composicao.map((l) => l.liquidacaoNumero).sort()).toEqual(["NL-A", "NL-B"]);
    // Σ da composição == o total do centro: é essa igualdade que faz o número ser conferível
    const soma = composicao.reduce((acc, l) => acc.plus(l.valorNoCentro), toMoney("0.00"));
    expect(soma.toFixed(2)).toBe("900.00");
  });
});
