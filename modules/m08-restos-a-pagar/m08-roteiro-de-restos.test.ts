import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import {
  exigirRoteiroDeRestos,
  passivoDaLiquidacaoDeOrigem,
  publicarRoteiroRestosAPagar,
  roteiroVigenteDeRestos,
} from "./servico-roteiro.js";
// ⚠️ A FIXTURE DO EMPENHO É A DO PRÓPRIO M08, não uma nova. `Liquidacao.empenhoId` tem chave
// estrangeira, e inventar um id fura a integridade — foi exatamente o que a primeira corrida
// deste arquivo acusou (`Liquidacao_empenhoId_fkey`). Reusar a que existe também garante que a
// liquidação de origem seja um fato construído pelo domínio, não uma linha fabricada.
import { empenharDe2026, semearM08 } from "./m08-encerramento.test.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";

/**
 * ═══ AS CONTAS DAS OPERAÇÕES DE RESTOS A PAGAR (V15), CONTRA BANCO ═══
 *
 * O domínio de RP estava maduro e inalcançável: as contas vêm por parâmetro e não havia de onde
 * tirá-las. Este arquivo prova as três decisões que o desenho tomou, e cada uma existe porque a
 * alternativa produzia um defeito silencioso:
 *
 *   · MEIO PAR é recusado (t2/t3) — um roteiro com meio par não é incompleto, é um roteiro que não
 *     fecha, e a recusa chegaria no ato da operação sem dizer que a causa foi o cadastro;
 *   · NO PAGAMENTO o par patrimonial é RECUSADO (t4) — lá o débito é a obrigação que a liquidação
 *     de origem criou e o crédito é a conta da conta bancária do ato; guardá-los seria campo que
 *     a operação sobrescreve;
 *   · a decisão é VERSIONADA e a vigente é a de maior versão (t6);
 *   · faltando configuração, a recusa NOMEIA a operação e diz onde resolvê-la (t7) — nunca conta
 *     padrão;
 *   · o passivo se RASTREIA pela liquidação de origem, e mais de uma obrigação no mesmo lançamento
 *     RECUSA em vez de escolher a primeira (t10).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const CONTABIL = "contabil.rp@cg.pb.gov.br";
const SEM_CRACHA = "so.consulta@cg.pb.gov.br";

const VPD = "3.3.1.1.1.01.00";
const RP_PROC = "2.1.3.1.1.01.00";
const FORNECEDOR = "2.1.1.1.1.01.00";
const OUTRO_PASSIVO = "2.1.8.8.1.02.00";
const VPA = "4.9.9.1.1.01.00";
// ⚠️ RAMO PRÓPRIO, E A PRIMEIRA CORRIDA ENSINOU POR QUE. `2.1.3.1.1.00.00` já existe na fixture
// do M08 como conta ANALÍTICA ("Fornecedores"), e o `skipDuplicates` do meu semeio a manteve
// analítica — então o teste da sintética publicou com sucesso e falhou por motivo errado. Compor
// sobre uma fixture alheia exige não reaproveitar os códigos dela com outro significado.
const SINTETICA = "2.1.9.9.1.00.00";
const SOB_A_SINTETICA = "2.1.9.9.1.01.00";
const DDR_EMPENHO = "8.2.1.1.2.01.00";
const DDR_LIQUID = "8.2.1.1.3.01.00";
const DDR_UTIL = "8.2.1.1.4.01.00";

const FUNDAMENTO = "Plano de contas do municipio, quadro dos restos a pagar; orientacao do TCE-PB.";

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

let empenhoDeOrigem = "";

async function semear(): Promise<void> {
  // `semearM08` já limpa o banco e monta órgão, unidade, ficha, fontes e contas bancárias.
  await semearM08();
  await prisma.contaPcasp.createMany({
    data: [
      { id: "r-vpd", codigo: VPD, nome: "VPD DE PESSOAL", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "r-sint", codigo: SINTETICA, nome: "OUTROS PASSIVOS DE CURTO PRAZO", naturezaSaldo: "CREDORA", nivel: 5, analitica: false },
      { id: "r-sob", codigo: SOB_A_SINTETICA, nome: "OUTROS PASSIVOS - DIVERSOS", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-rp", codigo: RP_PROC, nome: "RESTOS A PAGAR PROCESSADOS A PAGAR", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-forn", codigo: FORNECEDOR, nome: "FORNECEDORES NACIONAIS", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-outro", codigo: OUTRO_PASSIVO, nome: "GARANTIAS RECEBIDAS", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-vpa", codigo: VPA, nome: "VPA DIVERSA", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-ddr2", codigo: DDR_EMPENHO, nome: "DDR COMPROMETIDA POR EMPENHO - A LIQUIDAR", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true },
      { id: "r-ddr3", codigo: DDR_LIQUID, nome: "COMPROMETIDA POR LIQUIDACAO", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
      { id: "r-ddr4", codigo: DDR_UTIL, nome: "UTILIZADA COM EXECUCAO ORCAMENTARIA", naturezaSaldo: "CREDORA", nivel: 6, analitica: true },
    ],
    skipDuplicates: true,
  });
  await usuarioComPerfil(CONTABIL, "CONTABILIDADE_RP", ["PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR"]);
  await usuarioComPerfil(SEM_CRACHA, "SO_CONSULTA", ["CONSULTAR_DESPESA"]);
  empenhoDeOrigem = await empenharDe2026(criarM05Deps(prisma), "NE-RP-ORIGEM", "1000.00");
}

beforeEach(semear, 120_000);

const publicar = (p: {
  evento?: string;
  debito?: string | null;
  credito?: string | null;
  ctrlDebito?: string | null;
  ctrlCredito?: string | null;
  por?: string;
}) =>
  publicarRoteiroRestosAPagar(prisma, {
    evento: (p.evento ?? "CANCELAMENTO_PROCESSADO") as never,
    contaDebitoCodigo: p.debito === undefined ? RP_PROC : p.debito,
    contaCreditoCodigo: p.credito === undefined ? VPA : p.credito,
    contaControleDebitoCodigo: p.ctrlDebito ?? null,
    contaControleCreditoCodigo: p.ctrlCredito ?? null,
    fundamento: FUNDAMENTO,
    criadoPor: p.por ?? CONTABIL,
  });

describe("as contas das operacoes de restos a pagar", () => {
  it("t1 publica o par patrimonial de um cancelamento e ele passa a ser o vigente", async () => {
    const r = await publicar({});
    expect(r.versao).toBe(1);
    expect(r.anterior).toBeNull();
    const v = await roteiroVigenteDeRestos(prisma, "CANCELAMENTO_PROCESSADO");
    expect(v?.patrimonial).toEqual({ debito: RP_PROC, credito: VPA });
    expect(v?.controle).toBeNull();
    expect(v?.fundamento).toBe(FUNDAMENTO);
  });

  it("t2 recusa MEIO par patrimonial — e diz que um roteiro assim nao fecha", async () => {
    await expect(publicar({ credito: null })).rejects.toThrow(/DUAS contas patrimoniais ou nenhuma/i);
    expect(await roteiroVigenteDeRestos(prisma, "CANCELAMENTO_PROCESSADO")).toBeNull();
  });

  it("t3 recusa MEIO par de disponibilidade", async () => {
    await expect(publicar({ ctrlDebito: DDR_LIQUID })).rejects.toThrow(
      /DUAS contas de disponibilidade por destinação de recursos ou nenhuma/i
    );
  });

  it("t4 no PAGAMENTO recusa o par patrimonial, porque ele vem do DADO", async () => {
    await expect(
      publicar({ evento: "PAGAMENTO", ctrlDebito: DDR_LIQUID, ctrlCredito: DDR_UTIL })
    ).rejects.toThrow(/as contas patrimoniais não se informam aqui/i);
    // e o mesmo evento COM só o par de disponibilidade passa
    const r = await publicar({
      evento: "PAGAMENTO",
      debito: null,
      credito: null,
      ctrlDebito: DDR_LIQUID,
      ctrlCredito: DDR_UTIL,
    });
    expect(r.versao).toBe(1);
  });

  it("t5 recusa conta SINTETICA listando as analiticas sob ela, e recusa debito igual ao credito", async () => {
    // ⚠️ E A RECUSA TEM DE LISTAR A ANALÍTICA. Recusar sem mostrar o que escolher foi o que
    // manteve pendências de roteiro abertas por vários lotes neste repositório.
    let msg = "";
    try {
      await publicar({ debito: SINTETICA });
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
    expect(msg).toMatch(/SINTÉTICA/i);
    expect(msg).toContain(SOB_A_SINTETICA);
    await expect(publicar({ debito: RP_PROC, credito: RP_PROC })).rejects.toThrow(/mesma conta/i);
  });

  it("t6 a decisao e VERSIONADA: a segunda publicacao vira v2 e a vigente passa a ser ela", async () => {
    await publicar({});
    const r2 = await publicar({ debito: FORNECEDOR });
    expect(r2.versao).toBe(2);
    expect(r2.anterior?.patrimonial).toEqual({ debito: RP_PROC, credito: VPA });
    const v = await roteiroVigenteDeRestos(prisma, "CANCELAMENTO_PROCESSADO");
    expect(v?.versao).toBe(2);
    expect(v?.patrimonial?.debito).toBe(FORNECEDOR);
    // a v1 continua no banco: e ela que responde "contra que roteiro aquilo foi feito?"
    expect(await prisma.roteiroRestosAPagar.count({ where: { evento: "CANCELAMENTO_PROCESSADO" } })).toBe(2);
  });

  it("t7 faltando configuracao, a recusa NOMEIA a operacao e diz onde resolve-la", async () => {
    await expect(exigirRoteiroDeRestos(prisma, "LIQUIDACAO_NAO_PROCESSADO")).rejects.toThrow(
      /liquidação de restos a pagar não processados.*Roteiros de restos a pagar/is
    );
  });

  it("t8 recusa quem NAO tem a acao — e o motivo e a falta de permissao, nao o cadastro", async () => {
    await expect(publicar({ por: SEM_CRACHA })).rejects.toThrow();
    expect(await roteiroVigenteDeRestos(prisma, "CANCELAMENTO_PROCESSADO")).toBeNull();
  });

  it("t9 recusa conta patrimonial no par de disponibilidade, e de controle no par patrimonial", async () => {
    await expect(publicar({ ctrlDebito: RP_PROC, ctrlCredito: DDR_UTIL })).rejects.toThrow(
      /não é de controle \(classe 8\)/i
    );
    await expect(publicar({ debito: DDR_LIQUID, credito: VPA })).rejects.toThrow(
      /é de controle \(classe 8\)/i
    );
  });

  it("t10 republicar EXATAMENTE o mesmo conjunto nao e fato novo", async () => {
    await publicar({});
    await expect(publicar({})).rejects.toThrow(/já é exatamente este/i);
    expect(await prisma.roteiroRestosAPagar.count()).toBe(1);
  });
});

/**
 * ═══ O PASSIVO PELA ORIGEM ═══
 *
 * ⚠️ FIXTURE N=2 NA PERNA CREDORA, e ela é o ponto do t13: com UMA perna de passivo a regra
 * passaria por vacuidade — qualquer implementação que pegasse "a primeira" acertaria. É com DUAS
 * que se vê se o código escolhe por acidente de consulta ou recusa.
 */
describe("o passivo que a liquidacao de origem criou", () => {
  async function lancamentoCom(
    pernas: readonly { readonly contaId: string; readonly tipo: "DEBITO" | "CREDITO"; readonly subsistema: "PATRIMONIAL" | "CONTROLE"; readonly valor: string }[]
  ): Promise<string> {
    const l = await prisma.lancamentoContabil.create({
      data: {
        numeroControle: `L-${Math.random().toString(36).slice(2, 10)}`,
        dataTransacao: new Date("2026-03-10T12:00:00Z"),
        historico: "liquidacao de origem",
        origemTipo: "LIQUIDACAO",
        origemId: "x",
        criadoPor: CONTABIL,
        partidas: { create: pernas.map((p) => ({ ...p })) },
      },
      select: { id: true },
    });
    return l.id;
  }

  it("t11 com UMA perna de passivo, devolve a conta e preserva a liquidacao de origem", async () => {
    const lancamentoId = await lancamentoCom([
      { contaId: "r-vpd", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
      { contaId: "r-forn", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
    ]);
    const liq = await prisma.liquidacao.create({
      data: {
        empenhoId: empenhoDeOrigem,
        numero: "LIQ-1",
        valor: "100.00",
        data: new Date("2026-03-10T12:00:00Z"),
        responsavelAtesto: "fiscal",
        lancamentoId,
        criadoPor: CONTABIL,
      },
      select: { id: true },
    });
    const r = await passivoDaLiquidacaoDeOrigem(prisma, {
      liquidacaoId: liq.id,
      empenhoIdEsperado: empenhoDeOrigem,
    });
    expect(r.conta).toBe(FORNECEDOR);
    expect(r.liquidacaoNumero).toBe("LIQ-1");
  });

  it("t12 recusa quando a liquidacao e de OUTRO empenho — a contraparte se preserva", async () => {
    const lancamentoId = await lancamentoCom([
      { contaId: "r-vpd", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
      { contaId: "r-forn", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
    ]);
    const liq = await prisma.liquidacao.create({
      data: {
        empenhoId: empenhoDeOrigem,
        numero: "LIQ-2",
        valor: "100.00",
        data: new Date("2026-03-10T12:00:00Z"),
        responsavelAtesto: "fiscal",
        lancamentoId,
        criadoPor: CONTABIL,
      },
      select: { id: true },
    });
    await expect(
      passivoDaLiquidacaoDeOrigem(prisma, { liquidacaoId: liq.id, empenhoIdEsperado: "empenho-de-outro-credor" })
    ).rejects.toThrow(/não pertence ao empenho deste resto a pagar/i);
  });

  it("t13 com DUAS pernas de passivo, RECUSA nomeando as duas em vez de escolher a primeira", async () => {
    const lancamentoId = await lancamentoCom([
      { contaId: "r-vpd", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "150.00" },
      { contaId: "r-forn", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
      { contaId: "r-outro", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "50.00" },
    ]);
    const liq = await prisma.liquidacao.create({
      data: {
        empenhoId: empenhoDeOrigem,
        numero: "LIQ-3",
        valor: "150.00",
        data: new Date("2026-03-10T12:00:00Z"),
        responsavelAtesto: "fiscal",
        lancamentoId,
        criadoPor: CONTABIL,
      },
      select: { id: true },
    });
    let mensagem = "";
    try {
      await passivoDaLiquidacaoDeOrigem(prisma, { liquidacaoId: liq.id, empenhoIdEsperado: empenhoDeOrigem });
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    expect(mensagem).toMatch(/MAIS DE UMA obrigação/i);
    // ⚠️ AS DUAS APARECEM. Recusar sem dizer QUAIS deixaria o operador sem como resolver.
    expect(mensagem).toContain(FORNECEDOR);
    expect(mensagem).toContain(OUTRO_PASSIVO);
  });
});
