import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { saldoDdrPorFonte } from "../m01-core-contabil/consultas.js";
import {
  roteiroArrecadacao,
  roteiroArrecadacaoDistribuida,
  type RoteiroContabil,
} from "../m01-core-contabil/roteiros.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { arrecadadoPorFonte, arrecadadoPorNaturezaFonte } from "./consultas.js";
import { comporPartidas } from "./dominio.js";
import { consolidarPorNatureza } from "./distribuicao.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";
import { lerFatosReceitaOrcamentaria } from "../../adapters/tribunais/tce-pb/sagres/gerador.js";
import { toMoney } from "../../packages/contracts/index.js";
import type { M04Deps } from "./ports.js";

/**
 * V16/C30 — A ARRECADAÇÃO REPARTIDA ENTRE FONTES, contra o Postgres de teste.
 *
 * ⚠️ O NÚMERO QUE ESTE TESTE DEFENDE, DITO ANTES DO CÓDIGO. Uma guia de 100.000,00 que entra
 * repartida — 60.000,00 de recurso ordinário e 40.000,00 de vinculado — tem de produzir:
 *
 *   classe 7   D 7.2.1.1.1.00.00 (ORDINÁRIOS)   60.000,00
 *              D 7.2.1.1.2.00.00 (VINCULADOS)   40.000,00
 *   classe 8   C 8.2.1.1.1.01.00               100.000,00
 *
 *   DDR por fonte:  500 -> 60.000,00     540 -> 40.000,00
 *
 * Antes desta unidade o modelo não tinha como dizer isso: `ReceitaArrecadada.fonteId` é NOT NULL
 * e singular, e a chave da guia é `[exercicio, numeroReceita, tipo]` — um número de guia, uma
 * linha, uma fonte. O total inteiro ia para UMA natureza de destinação, e o erro sai no RGF
 * Anexo 5 e na DDR (o número que impede empenhar contra dinheiro que não existe), não aqui.
 *
 * ⚠️ FIXTURE N=2 NA DIMENSÃO QUE SÓ EXISTE EM CONJUNTO: DUAS fontes, de naturezas DIFERENTES.
 * Com uma fonte só, "distribuído" e "fonte única" dariam a mesma linha e a regra passaria por
 * vacuidade — e, pior, com duas fontes da MESMA natureza a partição da classe 7 também passaria
 * sem provar nada (as duas debitariam a mesma conta).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m04@cg.pb.gov.br";
const SEM_CRACHA = "arrecadador.sem.distribuicao@cg.pb.gov.br";

const CAIXA = "1.1.1.1.1.00.00";
const VPA = "4.1.1.2.1.01.00";
const DDR_ORDINARIOS = "7.2.1.1.1.00.00";
const DDR_VINCULADOS = "7.2.1.1.2.00.00";
const DDR_DISPONIVEL = "8.2.1.1.1.01.00";

const NATUREZA = "11121101";
const F500 = "fnt-500";
const F540 = "fnt-540";
const F700 = "fnt-700";

const DATA = new Date("2026-03-10T12:00:00Z");

interface ParcelaDeEntrada {
  readonly fonte: string;
  readonly exercicioFonte: 1 | 2;
  readonly valor: string;
  readonly naturezaDaFonte: "ORDINARIOS" | "VINCULADOS" | "OUTROS";
  readonly fundamento?: string;
}

/**
 * O roteiro da guia repartida — montado como a porta o monta, a partir das MESMAS parcelas.
 *
 * ⚠️ DELIBERADAMENTE PELA MESMA VIA DA PRODUÇÃO (`consolidarPorNatureza`), e não com as contas
 * escritas à mão: o que o teste afirma é o RESULTADO no razão, conferido no razão (t1). Montar o
 * roteiro à mão aqui e depois comparar com o que o roteiro produziu seria conferir o roteiro com
 * ele mesmo.
 */
function roteiroDe(parcelas: readonly ParcelaDeEntrada[]): RoteiroContabil {
  return roteiroArrecadacaoDistribuida({
    disponibilidade: CAIXA,
    variacaoAumentativa: VPA,
    porNaturezaDaFonte: consolidarPorNatureza(
      parcelas.map((x) => ({ natureza: x.naturezaDaFonte, valor: toMoney(x.valor) })),
      (x) => x.natureza
    ),
  });
}

async function registrar(p: {
  readonly numero: string;
  readonly valor: string;
  readonly parcelas: readonly ParcelaDeEntrada[];
  readonly conta?: string;
  readonly fonteDaGuia?: string;
  readonly criadoPor?: string;
}): Promise<string> {
  const r = await registrarArrecadacao(
    {
      exercicio: 2026,
      naturezaReceita: NATUREZA,
      fonte: p.fonteDaGuia ?? p.parcelas[0]!.fonte,
      exercicioFonte: p.parcelas[0]!.exercicioFonte,
      valor: p.valor,
      dataArrecadacao: DATA,
      numeroReceita: p.numero,
      contaBancaria: p.conta ?? "CC-001",
      // ⚠️ CÓPIA MUTÁVEL: o tipo de ENTRADA do Zod é um array mutável, e o daqui é `readonly`.
      distribuicao: [...p.parcelas],
      criadoPor: p.criadoPor ?? POR,
    },
    roteiroDe(p.parcelas),
    deps
  );
  return r.receitaId;
}

/** As pernas do lançamento de uma guia, como `CONTA tipo valor`. */
async function pernas(receitaId: string): Promise<readonly string[]> {
  const g = await prisma.receitaArrecadada.findUniqueOrThrow({
    where: { id: receitaId },
    select: {
      lancamento: {
        select: {
          partidas: {
            select: { tipo: true, valor: true, conta: { select: { codigo: true } } },
          },
        },
      },
    },
  });
  return g.lancamento.partidas
    .map((p) => `${p.conta.codigo} ${p.tipo} ${p.valor.toFixed(2)}`)
    .sort();
}

async function ddr(fonteCodigo: string): Promise<string> {
  const linhas = await saldoDdrPorFonte(prisma, { exercicio: 2026 });
  return linhas.find((l) => l.fonteCodigo === fonteCodigo)?.disponivel.toFixed(2) ?? "ausente";
}

async function porFonte(): Promise<Record<string, string>> {
  const mapa = await arrecadadoPorFonte(prisma, { ate: new Date("2026-12-31T23:59:59Z") });
  const fontes = await prisma.fonteRecurso.findMany({ select: { id: true, codigo: true } });
  const saida: Record<string, string> = {};
  for (const [fonteId, valor] of mapa) {
    saida[fontes.find((f) => f.id === fonteId)!.codigo] = valor.toFixed(2);
  }
  return saida;
}

let deps: M04Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  // O plano de PRODUÇÃO: a DDR só existe porque o seed a tem (as cinco analíticas da classe 7).
  await semearPcasp(prisma);

  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: NATUREZA, descricao: "IPTU - Principal" },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: F500, codigo: "500", descricao: "Recursos nao vinculados", codigoTce: "500" },
      { id: F540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
      { id: F700, codigo: "700", descricao: "Convenio nao previsto", codigoTce: "700" },
    ],
  });

  // ⚠️ A NATUREZA DA FONTE É ATO DO ENTE, fail-closed e versionada. Sem ela a arrecadação recusa
  // nomeando a fonte — e é isso que faz a classe 7 sair certa em vez de escolhida.
  await prisma.deParaFonteNaturezaDdr.createMany({
    data: [
      { fonteCodigo: "500", natureza: "ORDINARIOS", fundamento: "Lei Municipal da LOA - recurso ordinario do tesouro.", versao: 1, criadoPor: POR },
      { fonteCodigo: "540", natureza: "VINCULADOS", fundamento: "FUNDEB - vinculacao constitucional da educacao.", versao: 1, criadoPor: POR },
      { fonteCodigo: "700", natureza: "OUTROS", fundamento: "Convenio sem classificacao propria no plano do ente.", versao: 1, criadoPor: POR },
    ],
  });

  const caixa = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: CAIXA }, select: { id: true } });
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-1", codigo: "CC-001", descricao: "Conta unica", fonteId: F500, contaContabilId: caixa.id, banco: "001", agencia: "1234", digitoAgencia: "5", conta: "67890", digitoConta: "1" },
      { id: "cb-2", codigo: "CC-002", descricao: "Conta so do tesouro", fonteId: F500, contaContabilId: caixa.id },
    ],
  });
  // ⚠️ O ROL da CC-001 (TR 5.10.2.6): municipio pequeno nao abre uma conta por fonte. A CC-002
  // fica com rol de UMA fonte — e e ela que prova a recusa por fonte fora do rol.
  await prisma.fonteDaContaBancaria.createMany({
    data: [
      { contaBancariaId: "cb-1", fonteId: F500, criadoPor: POR },
      { contaBancariaId: "cb-1", fonteId: F540, criadoPor: POR },
      { contaBancariaId: "cb-1", fonteId: F700, criadoPor: POR },
      { contaBancariaId: "cb-2", fonteId: F500, criadoPor: POR },
    ],
  });

  // A LOA prevê a natureza em 500 e 540. A 700 NÃO é prevista — é ela que exige motivo escrito e
  // a autorização nomeada.
  await prisma.receitaPrevista.createMany({
    data: [
      { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: F500, exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "1000000.00" },
      { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: F540, exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "500000.00" },
    ],
  });

  deps = criarM04Deps(prisma);
}

const REPARTIDA: readonly ParcelaDeEntrada[] = [
  { fonte: "500", exercicioFonte: 1, valor: "60000.00", naturezaDaFonte: "ORDINARIOS" },
  { fonte: "540", exercicioFonte: 1, valor: "40000.00", naturezaDaFonte: "VINCULADOS" },
];

describe("M04 V16/C30 — a arrecadacao repartida entre fontes", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a classe 7 sai REPARTIDA por natureza e a DDR por fonte mostra 60/40", async () => {
    const id = await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });

    // Ordenado por código (o helper ordena) — as sete pernas, com as DUAS de classe 7 repartidas.
    expect(await pernas(id)).toEqual([
      `${CAIXA} DEBITO 100000.00`,
      `${VPA} CREDITO 100000.00`,
      "6.2.1.1.0.00.00 DEBITO 100000.00",
      "6.2.1.2.0.00.00 CREDITO 100000.00",
      `${DDR_ORDINARIOS} DEBITO 60000.00`,
      `${DDR_VINCULADOS} DEBITO 40000.00`,
      `${DDR_DISPONIVEL} CREDITO 100000.00`,
    ]);

    // ⚠️ ESTE É O NÚMERO DA UNIDADE. Antes, a DDR inteira ia para a fonte padrão da guia.
    expect(await ddr("500")).toBe("60000.00");
    expect(await ddr("540")).toBe("40000.00");

    // E as parcelas ficaram gravadas, com o retrato da previsão no instante do ato.
    const parcelas = await prisma.fonteDaArrecadacao.findMany({
      where: { receitaArrecadadaId: id },
      orderBy: { criadoEm: "asc" },
      select: { fonte: { select: { codigo: true } }, valor: true, previstaNaLoa: true },
    });
    expect(parcelas.map((p) => `${p.fonte.codigo}=${p.valor.toFixed(2)}/${String(p.previstaNaLoa)}`)).toEqual([
      "500=60000.00/true",
      "540=40000.00/true",
    ]);
  });

  it("t2: parcelas que NAO somam o total recusam dizendo os dois numeros, e nada e gravado", async () => {
    await expect(
      registrar({
        numero: "2026RC000002",
        valor: "100000.00",
        parcelas: [
          { fonte: "500", exercicioFonte: 1, valor: "60000.00", naturezaDaFonte: "ORDINARIOS" },
          { fonte: "540", exercicioFonte: 1, valor: "39000.00", naturezaDaFonte: "VINCULADOS" },
        ],
      })
      // ⚠️ A MENSAGEM É A DO FORMULÁRIO, E FOI ESTE TESTE QUE A TROUXE. Antes da correção a
      // recusa vinha do motor — "Desbalanceado no lançamento: débitos = 299000.00, créditos =
      // 300000.00" —, que é verdade e não diz a ninguém qual parcela corrigir.
    ).rejects.toThrow(/AS PARCELAS NÃO SOMAM O TOTAL DA GUIA.*somam 99000\.00 e a guia é de 100000\.00.*falta 1000\.00/s);

    expect(await prisma.receitaArrecadada.count()).toBe(0);
    expect(await prisma.fonteDaArrecadacao.count()).toBe(0);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("t3: quem guarda a conservacao e o MOTOR — fatias que nao somam nao fecham o CONTROLE", () => {
    // Sem banco: o roteiro reparte a classe 7 em 60+30 e a classe 8 leva 100. O invariante (e) do
    // motor (cada subsistema fecha sozinho) derruba antes de qualquer escrita.
    const torto = roteiroArrecadacaoDistribuida({
      disponibilidade: CAIXA,
      variacaoAumentativa: VPA,
      porNaturezaDaFonte: [
        { natureza: "ORDINARIOS", valor: toMoney("60000.00") },
        { natureza: "VINCULADOS", valor: toMoney("30000.00") },
      ],
    });
    // ⚠️ A MENSAGEM É A DO LANÇAMENTO INTEIRO, e não a do subsistema: o motor confere o total
    // ANTES de conferir cada subsistema, e com as fatias erradas o total já não fecha
    // (débitos 290.000 contra créditos 300.000). Quem guarda é o motor, e é isso que importa aqui
    // — a mensagem legível para o operador vem antes, no domínio (t2).
    expect(() => comporPartidas(toMoney("100000.00"), torto)).toThrow(
      /Desbalanceado no lançamento: débitos = 290000\.00, créditos = 300000\.00/
    );

    // E a mesma composição, com as fatias somando o total, passa — para a negativa acima não
    // passar por vacuidade.
    expect(comporPartidas(toMoney("100000.00"), roteiroDe(REPARTIDA))).toHaveLength(7);
  });

  it("t4: o arrecadado POR FONTE (o insumo do superavit do Anexo 14) sai repartido", async () => {
    await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });
    expect(await porFonte()).toEqual({ "500": "60000.00", "540": "40000.00" });

    const detalhado = await arrecadadoPorNaturezaFonte(prisma, { ate: new Date("2026-12-31T23:59:59Z") });
    expect(detalhado).toHaveLength(2);
    expect(detalhado.every((l) => l.naturezaCodigo === NATUREZA)).toBe(true);
  });

  it("t5: a ANULACAO herda a distribuicao original — o liquido por fonte volta a zero", async () => {
    const id = await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });
    const anulacao = await anularArrecadacao(
      { receitaId: id, dataAnulacao: new Date("2026-04-01T12:00:00Z"), numeroReceita: "2026RA000001", criadoPor: POR },
      deps
    );

    const parcelasDoEstorno = await prisma.fonteDaArrecadacao.findMany({
      where: { receitaArrecadadaId: anulacao.receitaId },
      select: { fonte: { select: { codigo: true } }, valor: true },
      orderBy: { criadoEm: "asc" },
    });
    expect(parcelasDoEstorno.map((p) => `${p.fonte.codigo}=${p.valor.toFixed(2)}`)).toEqual([
      "500=60000.00",
      "540=40000.00",
    ]);

    // ⚠️ E O LÍQUIDO FECHA NAS DUAS FONTES. Se o estorno nascesse sem parcelas, a fonte padrão
    // levaria −100.000 e a outra ficaria com +40.000 para sempre — as duas mentindo, com o total
    // do ente fechando em zero, que é o que torna esse erro invisível.
    expect(await porFonte()).toEqual({ "500": "0.00", "540": "0.00" });
    expect(await ddr("500")).toBe("0.00");
    expect(await ddr("540")).toBe("0.00");
  });

  it("t6: fonte que a LOA nao preve — sem motivo recusa; sem cracha recusa; com os dois entra", async () => {
    const comA700: readonly ParcelaDeEntrada[] = [
      { fonte: "500", exercicioFonte: 1, valor: "70000.00", naturezaDaFonte: "ORDINARIOS" },
      { fonte: "700", exercicioFonte: 1, valor: "30000.00", naturezaDaFonte: "OUTROS" },
    ];

    // (a) sem o motivo escrito — a recusa NOMEIA a fonte
    await expect(
      registrar({ numero: "2026RC000003", valor: "100000.00", parcelas: comA700 })
    ).rejects.toThrow(/FONTE FORA DA PREVISÃO SEM MOTIVO ESCRITO.*700/s);
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    const comMotivo = comA700.map((x) =>
      x.fonte === "700"
        ? { ...x, fundamento: "Convenio federal assinado em marco, ainda sem credito na LOA." }
        : x
    );

    // (b) com o motivo, mas SEM a ação — ator fora do censo das fixtures, com um perfil que tem
    //     a ação VIZINHA (registrar a arrecadação) e NÃO a vigiada. É o que separa "recusou
    //     porque não tem ESTA ação" de "recusou porque não tem ação nenhuma".
    const perfil = await prisma.perfil.create({
      data: {
        nome: "Arrecadacao sem redistribuicao",
        descricao: "Registra guia; NAO redistribui receita fora da previsao da LOA.",
        criadoPor: POR,
        permissoes: { create: [{ acao: "REGISTRAR_ARRECADACAO", criadoPor: POR }] },
      },
      select: { id: true },
    });
    const usuario = await prisma.usuario.create({
      data: { identificador: SEM_CRACHA, nome: "Arrecadador sem o cracha da redistribuicao", criadoPor: POR },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({
      data: { usuarioId: usuario.id, perfilId: perfil.id, criadoPor: POR },
    });

    await expect(
      registrar({ numero: "2026RC000003", valor: "100000.00", parcelas: comMotivo, criadoPor: SEM_CRACHA })
    ).rejects.toThrow(/DISTRIBUIR_RECEITA_FORA_DA_PREVISAO/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    // (c) com motivo E com a ação: entra, e o retrato da previsão fica gravado como FALSO.
    const id = await registrar({ numero: "2026RC000003", valor: "100000.00", parcelas: comMotivo });
    const parcelas = await prisma.fonteDaArrecadacao.findMany({
      where: { receitaArrecadadaId: id },
      select: { fonte: { select: { codigo: true } }, previstaNaLoa: true, fundamento: true },
      orderBy: { criadoEm: "asc" },
    });
    expect(parcelas.map((p) => `${p.fonte.codigo}/${String(p.previstaNaLoa)}`)).toEqual([
      "500/true",
      "700/false",
    ]);
    expect(parcelas.find((p) => p.fonte.codigo === "700")!.fundamento).toMatch(/Convenio federal/);
  });

  it("t7: a fonte da GUIA tem de estar entre as parcelas", async () => {
    await expect(
      registrar({ numero: "2026RC000004", valor: "100000.00", parcelas: REPARTIDA, fonteDaGuia: "700" })
    ).rejects.toThrow(/declara a fonte 700, que não está entre as fontes da distribuição \(500, 540\)/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("t8: a mesma fonte duas vezes na mesma guia recusa, nomeando-a", async () => {
    await expect(
      registrar({
        numero: "2026RC000005",
        valor: "100000.00",
        parcelas: [
          { fonte: "500", exercicioFonte: 1, valor: "60000.00", naturezaDaFonte: "ORDINARIOS" },
          { fonte: "500", exercicioFonte: 1, valor: "40000.00", naturezaDaFonte: "ORDINARIOS" },
        ],
      })
    ).rejects.toThrow(/fonte 500 \(exercício 1\) aparece mais de uma vez/);
    expect(await prisma.receitaArrecadada.count()).toBe(0);
  });

  it("t9: fonte fora do ROL da conta recusa — e e a MESMA guia que a conta multifonte aceita", async () => {
    // A CC-002 só comporta a 500; a parcela da 540 é recusada NOMEANDO as permitidas.
    await expect(
      registrar({ numero: "2026RC000006", valor: "100000.00", parcelas: REPARTIDA, conta: "CC-002" })
    ).rejects.toThrow(/FONTE FORA DO ROL.*CC-002.*permitidas nesta conta são: 500/s);
    expect(await prisma.receitaArrecadada.count()).toBe(0);

    // A MESMA guia, na conta cujo rol tem as duas fontes, entra. É a ordem que prova o rol.
    await expect(
      registrar({ numero: "2026RC000006", valor: "100000.00", parcelas: REPARTIDA, conta: "CC-001" })
    ).resolves.toMatch(/.+/);
  });

  it("t10: a conta MULTIFONTE passa a receber guia da SEGUNDA fonte dela (fonte unica)", async () => {
    // ⚠️ O SEXTO SÍTIO DA TR 5.23. A arrecadação comparava `ContaBancaria.fonteId` — a fonte
    // PADRÃO —, e por isso a CC-001 (padrão 500, rol {500, 540, 700}) RECUSAVA uma guia da 540,
    // que é justamente o caso que a ADR da conta multifonte veio permitir.
    const r = await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NATUREZA, fonte: "540", exercicioFonte: 1,
        valor: "25000.00", dataArrecadacao: DATA, numeroReceita: "2026RC000007",
        contaBancaria: "CC-001", criadoPor: POR,
      },
      roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA, naturezaDaFonte: "VINCULADOS" }),
      deps
    );
    expect(r.receitaId).toMatch(/.+/);
    // Guia de fonte única: NENHUMA parcela, e a leitura por fonte a deriva da coluna.
    expect(await prisma.fonteDaArrecadacao.count()).toBe(0);
    expect(await porFonte()).toEqual({ "540": "25000.00" });

    // E na CC-002, cujo rol é só {500}, a mesma guia é recusada nomeando as permitidas.
    await expect(
      registrarArrecadacao(
        {
          exercicio: 2026, naturezaReceita: NATUREZA, fonte: "540", exercicioFonte: 1,
          valor: "25000.00", dataArrecadacao: DATA, numeroReceita: "2026RC000008",
          contaBancaria: "CC-002", criadoPor: POR,
        },
        roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA, naturezaDaFonte: "VINCULADOS" }),
        deps
      )
    ).rejects.toThrow(/FONTE FORA DO ROL/);
  });

  it("t11: o CHECK do banco recusa parcela sem motivo e parcela de valor zero", async () => {
    const id = await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });

    // ⚠️ PELO BANCO, NÃO PELO DOMÍNIO: é a prova de que `prisma/sql/ck_fonte_da_arrecadacao.sql`
    // está aplicado. Um importador, um script ou um INSERT de manutenção não passam por baixo.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "FonteDaArrecadacao" ("id","receitaArrecadadaId","fonteId","exercicioFonte","valor","previstaNaLoa","criadoPor")
         VALUES ('x1', $1, $2, 2, 1000.00, false, 'TESTE')`,
        id,
        F700
      )
    ).rejects.toThrow(/ck_fonte_da_arrecadacao_fundamento/);

    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "FonteDaArrecadacao" ("id","receitaArrecadadaId","fonteId","exercicioFonte","valor","previstaNaLoa","criadoPor")
         VALUES ('x2', $1, $2, 2, 0.00, true, 'TESTE')`,
        id,
        F700
      )
    ).rejects.toThrow(/ck_fonte_da_arrecadacao_valor/);
  });

  it("t12: parcela adulterada no banco faz a leitura por fonte RECUSAR, nomeando a guia", async () => {
    const id = await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });
    // O caminho de escrita não permite isto (o motor derruba); o `UPDATE` direto simula o
    // importador que gravasse parcela sem lançamento. A leitura tem de acusar, não devolver
    // "o que der".
    await prisma.$executeRawUnsafe(
      `UPDATE "FonteDaArrecadacao" SET "valor" = 10.00 WHERE "receitaArrecadadaId" = $1 AND "fonteId" = $2`,
      id,
      F540
    );
    await expect(porFonte()).rejects.toThrow(
      /DISTRIBUIÇÃO INCONSISTENTE na guia 2026RC000001.*somam 60010\.00 e a guia é de 100000\.00/s
    );
  });

  it("t13: o SAGRES emite UMA LINHA POR FONTE, com o mesmo numero de guia", async () => {
    await registrar({ numero: "2026RC000001", valor: "100000.00", parcelas: REPARTIDA });

    const fatos = await lerFatosReceitaOrcamentaria(prisma, {
      codUnidadeGestora: "000001",
      cnpjGerenciadora: "12345678000195",
      codContaArrecadadora: "CC-001",
      dia: DATA,
    });

    // ⚠️ O LEIAUTE §4.16 NÃO TEM CAMPO DE TOTAL: duas linhas com o mesmo número de guia e fontes
    // diferentes é a forma que o TCE recebe uma guia repartida. Quem não sabia repartir era o
    // nosso modelo.
    expect(fatos).toHaveLength(2);
    expect(fatos.every((f) => f.numeroReceita === "2026RC000001")).toBe(true);
    expect(fatos.map((f) => `${f.codFonteRecurso}=${f.valor.toFixed(2)}`)).toEqual([
      "500=60000.00",
      "540=40000.00",
    ]);
  });
});
