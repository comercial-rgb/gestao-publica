import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { Decimal } from "../packages/contracts/index.js";
import { saldoDasContas } from "../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarImovel, vincularPessoaAoImovel } from "../modules/m34-tributario/cadastro-imobiliario.js";
import { publicarTabelaDeParametros, simularTributo } from "../modules/m34-tributario/simulacao.js";
import {
  cancelarLancamentoTributario,
  constituirCreditoTributario,
  lancamentosDoLote,
  lotesDeLancamento,
  prepararLoteDeLancamento,
  repartir,
  retificarLancamentoTributario,
} from "../modules/m34-tributario/lancamento.js";
import { cadastrarPessoa } from "../modules/m19-pessoas/servico.js";
import { criarM19Deps } from "../modules/m19-pessoas/adapter-prisma.js";
import { arrecadarComVinculo } from "../modules/m04-receita/index.js";

/**
 * ═══ M34 B2 — O LANÇAMENTO TRIBUTÁRIO (V10 T2 · N5) ═══
 *
 * ⚠️ O VALOR ESPERADO É CALCULADO À MÃO, AQUI NO CABEÇALHO, e não pela fórmula do produto.
 * "Parser se testa contra implementação independente" vale para motor de cálculo: se o teste
 * usasse `calcular()` para conferir `calcular()`, ele passaria com qualquer interpretação
 * errada consistente.
 *
 * A regra SINTÉTICA deste arquivo (não é a lei de município nenhum — é uma regra inventada
 * para o teste, e está dito):
 *
 *     valorVenal = areaDoTerreno * valorDoM2Terreno + areaConstruida * valorDoM2Construido
 *     imposto    = valorVenal * aliquota
 *
 * IMÓVEL A: terreno 300,0000 m² · construída 120,0000 m²
 *     valorDoM2Terreno = 100,000000 · valorDoM2Construido = 500,000000 · aliquota = 0,010000
 *     valorVenal = 300 × 100 + 120 × 500 = 30.000 + 60.000 = 90.000
 *     imposto    = 90.000 × 0,01 = **900,00**
 *
 * IMÓVEL B: terreno 200,0000 m² · construída 0,0000 m²
 *     valorVenal = 200 × 100 + 0 × 500 = 20.000
 *     imposto    = 20.000 × 0,01 = **200,00**
 *
 * ⚠️ FIXTURE N=2 EM TODO O ARQUIVO: dois imóveis, dois responsáveis, duas parcelas, dois
 * lançamentos por lote. Com N=1, "o lote preparou" passaria por vacuidade.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => prisma.$disconnect());

const POR = "tributos@cg.pb.gov.br";
const NAT_IPTU = "11130111";
const FONTE = "fonte-500";

const CR = "1.1.2.1.1.00.00";
const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.1.1.00.00";
const VPD = "3.6.1.1.1.00.00";
const R_A_REALIZAR = "5.2.1.1.1.00.00";
const R_REALIZADA = "6.2.1.1.1.00.00";

const FORMULA = "(areaDoTerreno * valorDoM2Terreno + areaConstruida * valorDoM2Construido) * aliquota";

const CREDORAS = new Set([VPA, R_REALIZADA]);
const saldo = (codigo: string): Promise<string> =>
  saldoDasContas(prisma, [codigo], null).then((m) => (CREDORAS.has(codigo) ? m.negated() : m).toFixed(2));

interface Cenario {
  readonly imovelA: string;
  readonly imovelB: string;
  readonly pessoa1: string;
  readonly pessoa2: string;
}

async function semearContas(comRoteiro: boolean): Promise<void> {
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-cr", codigo: CR, nome: "Crédito tributário a receber", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA — impostos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: VPD, nome: "VPD — perda de créditos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU — principal" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Recursos livres", codigoTce: "500" } });
  if (comRoteiro) {
    await prisma.roteiroReconhecimento.create({
      data: {
        origem: "IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA",
        contaCreditoAReceberId: "c-cr",
        contaVpaId: "c-vpa",
        contaVpdId: "c-vpd",
        criadoPor: POR,
      },
    });
  }
}

async function semearCadastro(): Promise<Cenario> {
  const deps = criarM19Deps(prisma);
  const p1 = await cadastrarPessoa({ documento: "529.982.247-25", nome: "Maria da Silva", criadoPor: POR }, deps);
  const p2 = await cadastrarPessoa({ documento: "111.444.777-35", nome: "Joao Pereira", criadoPor: POR }, deps);

  const a = await cadastrarImovel(prisma, {
    inscricao: "01.001.0001",
    vigenciaInicio: "2020-01-01",
    motivo: "Cadastro inicial do imovel",
    logradouro: "Rua das Flores", numero: "100", bairro: "Centro",
    uso: "RESIDENCIAL", areaDoTerreno: "300.0000", areaConstruida: "120.0000",
    criadoPor: POR,
  });
  const b = await cadastrarImovel(prisma, {
    inscricao: "01.001.0002",
    vigenciaInicio: "2020-01-01",
    motivo: "Cadastro inicial do imovel",
    logradouro: "Rua das Flores", numero: "102", bairro: "Centro",
    uso: "TERRITORIAL", areaDoTerreno: "200.0000", areaConstruida: "0.0000",
    criadoPor: POR,
  });

  await vincularPessoaAoImovel(prisma, {
    imovelId: a.imovelId, pessoaDocumento: "52998224725", papel: "PROPRIETARIO",
    fracao: "1.000000", vigenciaInicio: "2020-01-01", motivo: "Escritura registrada", criadoPor: POR,
  });
  await vincularPessoaAoImovel(prisma, {
    imovelId: b.imovelId, pessoaDocumento: "11144477735", papel: "PROPRIETARIO",
    fracao: "1.000000", vigenciaInicio: "2020-01-01", motivo: "Escritura registrada", criadoPor: POR,
  });

  await publicarTabelaDeParametros(prisma, {
    tributo: "IPTU",
    exercicio: 2026,
    vigenciaInicio: "2026-01-01",
    fundamento: "Regra SINTETICA do teste — nao e lei de municipio nenhum",
    motivo: "Tabela do exercicio para o teste",
    formula: FORMULA,
    parametros: [
      { chave: "valorDoM2Terreno", valor: "100.000000", descricao: "Valor do m2 do terreno" },
      { chave: "valorDoM2Construido", valor: "500.000000", descricao: "Valor do m2 construido" },
      { chave: "aliquota", valor: "0.010000", descricao: "Aliquota do IPTU" },
    ],
    criadoPor: POR,
  });

  return { imovelA: a.imovelId, imovelB: b.imovelId, pessoa1: p1.pessoaId, pessoa2: p2.pessoaId };
}

async function prepararLote(c: Cenario, numero = "IPTU/2026/001"): Promise<string> {
  const r = await prepararLoteDeLancamento(prisma, {
    numero,
    tributo: "IPTU",
    exercicio: 2026,
    fatoGerador: "2026-01-01",
    descricao: "Lancamento do IPTU do exercicio de 2026",
    naturezaCodigo: NAT_IPTU,
    fonteId: FONTE,
    vencimentos: ["2026-03-10", "2026-04-10"],
    criadoPor: POR,
    imoveisIds: [c.imovelA, c.imovelB],
  });
  expect(r.recusados).toEqual([]);
  expect(r.preparados).toBe(2);
  return r.loteId;
}

beforeEach(async () => {
  await limparBanco(prisma);
});

// ════════════════════════════════════════════════════════════════════════════
// B1 — A PREPARAÇÃO
// ════════════════════════════════════════════════════════════════════════════

describe("B1 — preparar calcula, congela e NÃO constitui", () => {
  it("o valor bate com a conta feita à mão, e nada foi ao razão", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);

    const ls = await lancamentosDoLote(prisma, loteId);
    expect(ls.map((l) => [l.inscricao, l.valor])).toEqual([
      ["01.001.0001", "900.00"],
      ["01.001.0002", "200.00"],
    ]);

    // ⚠️ O EFEITO, e não a mensagem: preparar não cria crédito nem lançamento contábil.
    expect(await prisma.receitaReconhecida.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
    expect(await saldo(CR)).toBe("0.00");
    expect(await saldo(VPA)).toBe("0.00");
  });

  it("simular continua sendo LEITURA — a regra do B1 não mudou", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const antes = await prisma.lancamentoTributario.count();
    const s = await simularTributo(prisma, { imovelId: c.imovelA, tributo: "IPTU", exercicio: 2026 });
    expect(s.valor).toBe("900.00");
    expect(await prisma.lancamentoTributario.count()).toBe(antes);
    expect(await prisma.receitaReconhecida.count()).toBe(0);
  });

  it("⚠️ a memória é CONGELADA: mudar a tabela depois não muda o lançamento", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);

    // Uma versão nova da tabela, com alíquota dobrada, valendo do mesmo dia.
    await publicarTabelaDeParametros(prisma, {
      tributo: "IPTU", exercicio: 2026, vigenciaInicio: "2026-01-01",
      fundamento: "Regra SINTETICA do teste — versao 2", motivo: "Alteracao de aliquota",
      formula: FORMULA,
      parametros: [
        { chave: "valorDoM2Terreno", valor: "100.000000", descricao: "Valor do m2 do terreno" },
        { chave: "valorDoM2Construido", valor: "500.000000", descricao: "Valor do m2 construido" },
        { chave: "aliquota", valor: "0.020000", descricao: "Aliquota do IPTU" },
      ],
      criadoPor: POR,
    });

    // A SIMULAÇÃO de hoje muda...
    const s = await simularTributo(prisma, { imovelId: c.imovelA, tributo: "IPTU", exercicio: 2026 });
    expect(s.valor).toBe("1800.00");
    // ...e o LANÇAMENTO preparado NÃO. É o que responde "por que deu este valor?" num recurso.
    const ls = await lancamentosDoLote(prisma, loteId);
    expect(ls.find((l) => l.inscricao === "01.001.0001")?.valor).toBe("900.00");
  });

  it("as parcelas somam o total, com o resto na primeira", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    for (const l of ls) {
      const soma = l.vencimentos.reduce((acc, v) => acc.plus(new Decimal(v.valor)), new Decimal(0));
      expect(soma.toFixed(2)).toBe(l.valor);
      expect(l.vencimentos).toHaveLength(2);
    }
  });

  it("⚠️ repartir não perde nem cria centavo — a divisão que não fecha é a que sangra", () => {
    // 100,00 em 3 = 33,34 + 33,33 + 33,33. Arredondar cada parcela daria 99,99 (o município
    // perde um centavo por carnê) ou 100,02 (cobra a mais).
    const tres = repartir(new Decimal("100.00"), 3).map((d) => d.toFixed(2));
    expect(tres).toEqual(["33.34", "33.33", "33.33"]);
    expect(tres.reduce((a, b) => a.plus(new Decimal(b)), new Decimal(0)).toFixed(2)).toBe("100.00");

    // FIXTURE N=2: um segundo caso, com resto diferente.
    const sete = repartir(new Decimal("10.00"), 7).map((d) => d.toFixed(2));
    expect(sete.reduce((a, b) => a.plus(new Decimal(b)), new Decimal(0)).toFixed(2)).toBe("10.00");
    expect(sete[0]).toBe("1.48");
  });

  it("o imóvel SEM responsável vigente entra com inconsistência, e o lote não aborta", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const semDono = await cadastrarImovel(prisma, {
      inscricao: "01.001.0003", vigenciaInicio: "2020-01-01", motivo: "Cadastro inicial do imovel",
      logradouro: "Rua das Flores", numero: "104", bairro: "Centro",
      uso: "TERRITORIAL", areaDoTerreno: "100.0000", areaConstruida: "0.0000", criadoPor: POR,
    });
    const r = await prepararLoteDeLancamento(prisma, {
      numero: "IPTU/2026/002", tributo: "IPTU", exercicio: 2026, fatoGerador: "2026-01-01",
      descricao: "Lancamento com um imovel sem dono", naturezaCodigo: NAT_IPTU, fonteId: FONTE,
      vencimentos: ["2026-03-10"], criadoPor: POR,
      imoveisIds: [c.imovelA, semDono.imovelId],
    });
    expect(r.preparados).toBe(2);
    expect(r.comInconsistencia).toBe(1);
    const ls = await lancamentosDoLote(prisma, r.loteId);
    const alvo = ls.find((l) => l.inscricao === "01.001.0003");
    expect(alvo?.inconsistencias.map((i) => i.codigo)).toEqual(["SEM-RESPONSAVEL-VIGENTE"]);
  });

  it("preparar o MESMO imóvel duas vezes no mesmo lote é recusado pelo banco", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const r = await prepararLoteDeLancamento(prisma, {
      numero: "IPTU/2026/003", tributo: "IPTU", exercicio: 2026, fatoGerador: "2026-01-01",
      descricao: "Lote com o mesmo imovel repetido", naturezaCodigo: NAT_IPTU, fonteId: FONTE,
      vencimentos: ["2026-03-10"], criadoPor: POR,
      imoveisIds: [c.imovelA, c.imovelA],
    });
    expect(r.preparados).toBe(1);
    expect(r.recusados).toHaveLength(1);
    expect(r.recusados[0]?.motivo).toMatch(/LANCAMENTO-JA-PREPARADO/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B2 — A CONSTITUIÇÃO
// ════════════════════════════════════════════════════════════════════════════

describe("B2 — constituir faz o crédito nascer, e só quando pode", () => {
  it("⚠️ SEM ROTEIRO CONTÁBIL a efetivação é impedida, com pendência acionável e nada gravado", async () => {
    await semearContas(false); // <- sem RoteiroReconhecimento
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);

    await expect(
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR })
    ).rejects.toThrow(/ROTEIRO-CONTABIL-AUSENTE/);
    // A mensagem diz o que NÃO se faz e quem resolve — é a pendência acionável.
    await expect(
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR })
    ).rejects.toThrow(/inventar norma da STN/);

    expect(await prisma.receitaReconhecida.count()).toBe(0);
    expect(await prisma.constituicaoDoLancamento.count()).toBe(0);
    // ⚠️ E A PREPARAÇÃO CONTINUA DE PÉ: o que fica impedido é a efetivação, não a revisão.
    expect((await lancamentosDoLote(prisma, loteId))[0]?.situacao).toBe("PREPARADO");
  });

  it("com roteiro: o crédito nasce no razão e o CAIXA NÃO É TOCADO", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);

    const r = await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });
    expect(r.novo).toBe(true);

    expect(await saldo(CR)).toBe("900.00");
    expect(await saldo(VPA)).toBe("900.00");
    // ⚠️ CONSTITUIR NÃO ARRECADA. Um crédito constituído que mexesse no caixa contaria a
    // mesma receita duas vezes quando a guia fosse paga.
    expect(await saldo(CAIXA)).toBe("0.00");
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    const depois = await lancamentosDoLote(prisma, loteId);
    expect(depois.find((l) => l.inscricao === "01.001.0001")?.situacao).toBe("CONSTITUIDO");
    expect(depois.find((l) => l.inscricao === "01.001.0002")?.situacao).toBe("PREPARADO");
  });

  it("a competência do crédito é o FATO GERADOR, não o dia de hoje", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });

    const rec = await prisma.receitaReconhecida.findFirstOrThrow({ select: { dataFatoGerador: true, contribuinteRef: true } });
    expect(rec.dataFatoGerador.toISOString().slice(0, 10)).toBe("2026-01-01");
    // ⚠️ SIGILO FISCAL (CTN art. 198): a referência é a INSCRIÇÃO, nunca o CPF.
    expect(rec.contribuinteRef).toBe("01.001.0001");
    expect(rec.contribuinteRef).not.toContain("52998224725");
  });

  it("lançamento COM INCONSISTÊNCIA não se constitui — é para isso que a revisão existe", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const semDono = await cadastrarImovel(prisma, {
      inscricao: "01.001.0009", vigenciaInicio: "2020-01-01", motivo: "Cadastro inicial do imovel",
      logradouro: "Rua das Flores", numero: "900", bairro: "Centro",
      uso: "TERRITORIAL", areaDoTerreno: "100.0000", areaConstruida: "0.0000", criadoPor: POR,
    });
    void c;
    const r = await prepararLoteDeLancamento(prisma, {
      numero: "IPTU/2026/004", tributo: "IPTU", exercicio: 2026, fatoGerador: "2026-01-01",
      descricao: "Lote com imovel sem dono", naturezaCodigo: NAT_IPTU, fonteId: FONTE,
      vencimentos: ["2026-03-10"], criadoPor: POR, imoveisIds: [semDono.imovelId],
    });
    const ls = await lancamentosDoLote(prisma, r.loteId);
    await expect(
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR })
    ).rejects.toThrow(/LANCAMENTO-INCONSISTENTE/);
    expect(await prisma.receitaReconhecida.count()).toBe(0);
  });

  it("⚠️ repetir a constituição não duplica o crédito", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);

    const um = await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });
    const dois = await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });
    expect(um.novo).toBe(true);
    expect(dois.novo).toBe(false);
    expect(dois.reconhecimentoId).toBe(um.reconhecimentoId);
    expect(await prisma.receitaReconhecida.count()).toBe(1);
    expect(await saldo(VPA)).toBe("900.00");
  });

  it("⚠️ duas constituições CONCORRENTES do mesmo lançamento produzem UM crédito", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);

    // A trava é do BANCO (`referenciaExterna @unique` no M04 e `chave @unique` na ponte), e não
    // de um `findFirst` antes do `create` — em corrida, os dois `findFirst` não acham nada.
    const resultados = await Promise.allSettled([
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR }),
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR }),
    ]);
    const oks = resultados.filter((r) => r.status === "fulfilled");
    expect(oks.length).toBeGreaterThanOrEqual(1);
    expect(await prisma.receitaReconhecida.count()).toBe(1);
    expect(await saldo(VPA)).toBe("900.00");
  });

  it("quem não tem a ação não constitui — e nada é gravado", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);

    const perfil = await prisma.perfil.create({
      data: {
        nome: "CADASTRO TRIBUTARIO",
        descricao: "prepara, mas nao constitui",
        criadoPor: POR,
        permissoes: { create: [{ acao: "PREPARAR_LANCAMENTO_TRIBUTARIO", criadoPor: POR }] },
      },
      select: { id: true },
    });
    const u = await prisma.usuario.create({
      data: { identificador: "cadastro@teste", nome: "Cadastro", criadoPor: POR },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });

    await expect(
      constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: "cadastro@teste" })
    ).rejects.toThrow(/ACESSO NEGADO/);
    expect(await prisma.receitaReconhecida.count()).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B3 — A CORREÇÃO
// ════════════════════════════════════════════════════════════════════════════

describe("B3 — corrigir preserva a origem", () => {
  it("cancelar baixa por VPD e DEIXA a VPA do fato gerador de pé", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });

    const r = await cancelarLancamentoTributario(prisma, {
      lancamentoId: ls[0]!.id,
      motivo: "Imovel demolido antes do fato gerador — anistia da Lei Sintetica do teste",
      criadoPor: POR,
    });
    expect(r.substitutoId).toBeNull();

    // ⚠️ CANCELAR NÃO É ESTORNAR: a VPA de janeiro FICA (ela foi verdadeira), e a perda aparece
    // como VPD — que é o número que o controle externo procura quando pergunta o que o
    // município perdoou.
    expect(await saldo(VPA)).toBe("900.00");
    expect(await saldo(VPD)).toBe("900.00");
    expect(await saldo(CR)).toBe("0.00");

    const depois = await lancamentosDoLote(prisma, loteId);
    const alvo = depois.find((l) => l.inscricao === "01.001.0001");
    expect(alvo?.situacao).toBe("CANCELADO");
    // ⚠️ E O ORIGINAL CONTINUA LEGÍVEL — memória, valor e responsáveis intactos.
    expect(alvo?.valor).toBe("900.00");
    expect(alvo?.responsaveis).toHaveLength(1);
    expect(alvo?.correcoes).toHaveLength(1);
  });

  it("⚠️ com arrecadação VIVA, a correção isolada é recusada e a sequência vem na mensagem", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    const con = await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });

    await arrecadarComVinculo(prisma, {
      arrecadacao: {
        exercicio: 2026, naturezaReceita: NAT_IPTU, fonte: "500", valor: "400.00",
        dataArrecadacao: new Date("2026-03-10T12:00:00Z"),
        numeroReceita: "GUIA-IPTU-1", criadoPor: POR,
      },
      // ⚠️ A PERNA DE CRÉDITO É O CRÉDITO A RECEBER, não a VPA: arrecadar um crédito já
      // reconhecido é PERMUTATIVO. Fosse a VPA, a receita seria contada duas vezes.
      contas: {
        disponibilidade: CAIXA,
        creditoAReceber: CR,
        receitaARealizar: R_A_REALIZAR,
        receitaRealizada: R_REALIZADA,
      },
      vinculos: [{ reconhecimentoId: con.reconhecimentoId, valor: "400.00" }],
    });

    await expect(
      cancelarLancamentoTributario(prisma, {
        lancamentoId: ls[0]!.id,
        motivo: "Tentativa de cancelar um credito que ja foi pago em parte",
        criadoPor: POR,
      })
    ).rejects.toThrow(/CREDITO-JA-MOVIMENTADO/);
    await expect(
      cancelarLancamentoTributario(prisma, {
        lancamentoId: ls[0]!.id,
        motivo: "Tentativa de cancelar um credito que ja foi pago em parte",
        criadoPor: POR,
      })
    ).rejects.toThrow(/anule a arrecadação/);

    // ⚠️ E NADA MUDOU: o lançamento continua constituído, e o saldo do razão intacto.
    const depois = await lancamentosDoLote(prisma, loteId);
    expect(depois.find((l) => l.inscricao === "01.001.0001")?.situacao).toBe("CONSTITUIDO");
    expect(await saldo(VPD)).toBe("0.00");
  });

  it("retificar cria um substituto PREPARADO — constituir continua sendo ato à parte", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });

    const r = await retificarLancamentoTributario(prisma, {
      lancamentoId: ls[0]!.id,
      motivo: "Area construida do cadastro estava errada — recadastramento de campo",
      criadoPor: POR,
    });
    expect(r.substitutoId).not.toBeNull();

    const substituto = await prisma.lancamentoTributario.findUniqueOrThrow({
      where: { id: r.substitutoId! },
      select: { situacao: true, valor: true, lote: { select: { numero: true } } },
    });
    expect(substituto.situacao).toBe("PREPARADO");
    expect(substituto.lote.numero).toBe("IPTU/2026/001-R");

    const original = await prisma.lancamentoTributario.findUniqueOrThrow({
      where: { id: ls[0]!.id },
      select: { situacao: true, valor: true },
    });
    expect(original.situacao).toBe("RETIFICADO");
    expect(original.valor.toFixed(2)).toBe("900.00");

    // O crédito antigo foi baixado por VPD; o novo NÃO nasceu sozinho.
    expect(await saldo(VPD)).toBe("900.00");
    expect(await prisma.receitaReconhecida.count()).toBe(1);
  });

  it("corrigir o que já foi corrigido é recusado, nomeando o caminho", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    await cancelarLancamentoTributario(prisma, {
      lancamentoId: ls[0]!.id, motivo: "Cancelamento por erro de cadastro do imovel", criadoPor: POR,
    });
    await expect(
      cancelarLancamentoTributario(prisma, {
        lancamentoId: ls[0]!.id, motivo: "Segunda tentativa de cancelar o mesmo lancamento", criadoPor: POR,
      })
    ).rejects.toThrow(/LANCAMENTO-JA-CORRIGIDO/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// B4 — O PLACAR DO LOTE
// ════════════════════════════════════════════════════════════════════════════

describe("B4 — o lote conta o que tem", () => {
  it("o placar separa preparados, constituídos e corrigidos", async () => {
    await semearContas(true);
    const c = await semearCadastro();
    const loteId = await prepararLote(c);
    const ls = await lancamentosDoLote(prisma, loteId);
    await constituirCreditoTributario(prisma, { lancamentoId: ls[0]!.id, criadoPor: POR });
    await cancelarLancamentoTributario(prisma, {
      lancamentoId: ls[1]!.id, motivo: "Imovel fora do territorio do municipio", criadoPor: POR,
    });

    const lotes = await lotesDeLancamento(prisma);
    const lote = lotes.find((l) => l.id === loteId);
    expect(lote?.preparados).toBe(0);
    expect(lote?.constituidos).toBe(1);
    expect(lote?.corrigidos).toBe(1);
    // ⚠️ O TOTAL SOMA TUDO o que foi preparado, inclusive o cancelado — é o total do lote, e
    // não o saldo a receber. A tela separa as duas leituras.
    expect(lote?.total).toBe("1100.00");
  });
});
