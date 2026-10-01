import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "./dominio.js";
import {
  aRecolherDoIngresso,
  estornarMovimentoExtra,
  registrarDispendioExtra,
  registrarIngressoExtra,
} from "./extraorcamentario.js";
import {
  composicaoDoRecolhimento,
  conferirComposicaoExtra,
  retencoesComSaldo,
} from "./consultas.js";
// ⚠️ A FIXTURE É A DO PRÓPRIO M07, e reusá-la é regra aprendida nesta rodada: compor sobre uma
// fixture alheia exige NÃO reaproveitar os códigos dela com outro significado. Aqui nada é
// redefinido — os ids dos tipos são RESOLVIDOS por consulta, não supostos.
import { semearM07 } from "./m07.test.js";

/**
 * ═══ A COMPOSIÇÃO DO RECOLHIMENTO POR ORIGEM (C34) E OS QUATRO NÚMEROS (C37) ═══
 *
 * O saldo extraorçamentário sempre foi somado por `(tipoConsignacao, credorConsignatario)`, e isso
 * responde "quanto ainda se deve ao INSS". O termo de referência pede duas coisas que o agregado
 * não dá:
 *
 *   C34 — vincular o recolhimento, parcial ou total, às retenções ATUAIS OU ANTERIORES, com a
 *         composição por origem e o saldo remanescente conciliados;
 *   C37 — consultar retido, recolhido, estornado e a recolher, com o total global igual à soma das
 *         obrigações e seus movimentos.
 *
 * ⚠️ O QUE ESTE ARQUIVO AFIRMA, e cada item existe porque a ausência dele produz número que fecha
 * e está errado:
 *
 *   · FIXTURE N=2 NA COMPOSIÇÃO (t1): uma guia que compõe DUAS retenções, uma de 2026 e outra de
 *     2027. Com UMA retenção a regra passaria por vacuidade — qualquer implementação que ignorasse
 *     a origem acertaria, porque haveria só uma origem possível;
 *   · a composição que NÃO FECHA é recusada (t2), e é o pior caso silencioso: parece conciliada;
 *   · o ESTORNO reabre EXATAMENTE a parcela alocada (t7), não uma fatia proporcional — e a linha
 *     de alocação PERMANECE, porque "o que aquela guia quitou antes de ser desfeita" é resposta
 *     que o razão tem de ter;
 *   · o ESTORNADO não fica EMBUTIDO (t8): `listarSaldosExtra` entrega líquidos, e "recolhido
 *     400,00" esconde um recolhimento de 500,00 e um estorno de 100,00.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

// ⚠️ O MESMO ATOR DA FIXTURE. `autorizarNo` exige que o usuario EXISTA (TR 4.55) — string livre
// em `criadoPor` era um nome que ninguem podia cobrar. Inventar um segundo ator aqui obrigaria a
// criar perfil e permissoes ao lado dos da fixture, que e duplicar o que ela ja resolve.
const POR = "m07@cg.pb.gov.br";
const CAIXA = "1.1.1.1.2.00.00";
const PASSIVO = "2.1.8.8.1.01.00";
const R_IN = roteiroIngressoExtra({ disponibilidade: CAIXA, consignacaoAPagar: PASSIVO });
const R_OUT = roteiroDispendioExtra({ consignacaoAPagar: PASSIVO, disponibilidade: CAIXA });

const INSS = "12345678000100";
const PENSAO = "98765432000155";

let tInss = "";
let tCaucao = "";
let fonte500 = "";

async function semear(): Promise<void> {
  await semearM07();
  // ⚠️ RESOLVIDOS POR CONSULTA. Os ids dos tipos são `let` privados no arquivo da fixture; supô-los
  // seria depender de um detalhe que ninguém prometeu.
  const tipos = await prisma.tipoConsignacao.findMany({ select: { id: true, codigo: true } });
  tInss = tipos.find((t) => t.codigo === "INSS")!.id;
  tCaucao = tipos.find((t) => t.codigo === "CAUCAO")!.id;
  fonte500 = (await prisma.fonteRecurso.findFirstOrThrow({ where: { codigo: "500" }, select: { id: true } })).id;
}

beforeEach(semear, 120_000);

const reter = (valor: string, ano: number, mes: number, credor = INSS, tipo?: string) =>
  registrarIngressoExtra(
    prisma,
    {
      tipoConsignacaoId: tipo ?? tInss,
      credorConsignatario: credor,
      contaBancaria: "CC-001",
      fonteId: fonte500,
      valor,
      data: DIA_DE_BORDA(ano, mes, 10),
      historico: `retencao ${mes}/${ano}`,
      criadoPor: POR,
    } as never,
    R_IN
  );

const recolher = (
  valor: string,
  ano: number,
  mes: number,
  alocacoes?: readonly { readonly ingressoId: string; readonly valor: string }[],
  credor = INSS
) =>
  registrarDispendioExtra(
    prisma,
    {
      tipoConsignacaoId: tInss,
      credorConsignatario: credor,
      contaBancaria: "CC-001",
      fonteId: fonte500,
      valor,
      data: DIA_DE_BORDA(ano, mes, 20),
      historico: `guia ${mes}/${ano}`,
      criadoPor: POR,
      ...(alocacoes === undefined ? {} : { alocacoes }),
    } as never,
    R_OUT
  );

describe("C34 — a composicao do recolhimento por origem", () => {
  it("t1 uma guia compoe DUAS retencoes, uma de 2026 e outra de 2027, e as parcelas somam o valor", async () => {
    const a = await reter("300.00", 2026, 12);
    const b = await reter("200.00", 2027, 1);

    const guia = await recolher("500.00", 2027, 2, [
      { ingressoId: a.movimentoId, valor: "300.00" },
      { ingressoId: b.movimentoId, valor: "200.00" },
    ]);

    const parcelas = await composicaoDoRecolhimento(prisma, guia.movimentoId);
    expect(parcelas).toHaveLength(2);
    // ⚠️ A DE 2026 VEM PRIMEIRO, e a ordem é a da data da retenção: "retenções anteriores" deixa de
    // ser frase quando a de dezembro aparece ao lado da de janeiro.
    expect(parcelas[0]?.dataDaRetencao.getUTCFullYear()).toBe(2026);
    expect(parcelas[0]?.valor).toBe("300.00");
    expect(parcelas[1]?.dataDaRetencao.getUTCFullYear()).toBe(2027);
    expect(parcelas[1]?.valor).toBe("200.00");

    // e as duas retenções ficam sem nada a recolher
    expect((await aRecolherDoIngresso(prisma, a.movimentoId)).toFixed(2)).toBe("0.00");
    expect((await aRecolherDoIngresso(prisma, b.movimentoId)).toFixed(2)).toBe("0.00");
  });

  it("t2 recusa a composicao que NAO FECHA com o valor do recolhimento", async () => {
    // ⚠️ O SALDO AGREGADO TEM DE CABER, e isto e um achado de ORDEM: a guarda do saldo
    // ("nao se repassa o que nao se reteve") e a defesa EXTERNA e dispara ANTES da composicao.
    // A primeira versao deste teste retinha 300 e recolhia 500 — e a recusa que chegava era a do
    // saldo, nao a da composicao. O teste passava a medir outra coisa: verde, ou vermelho, pelo
    // motivo errado. Aqui o saldo cabe (500) e o que nao fecha e a composicao.
    const a = await reter("300.00", 2026, 12);
    await reter("200.00", 2027, 1);
    await expect(
      recolher("500.00", 2027, 2, [{ ingressoId: a.movimentoId, valor: "300.00" }])
    ).rejects.toThrow(/composição não fecha/i);
    // nada gravado: nem o movimento, nem a parcela
    expect(await prisma.alocacaoDoRecolhimento.count()).toBe(0);
    expect(await prisma.movimentoExtraorcamentario.count({ where: { tipo: "DISPENDIO" } })).toBe(0);
  });

  it("t3 recusa a parcela que excede o que aquela retencao ainda tem a recolher", async () => {
    const a = await reter("300.00", 2026, 12);
    const b = await reter("200.00", 2027, 1);
    // a primeira guia consome 250 de `a`
    await recolher("250.00", 2027, 2, [{ ingressoId: a.movimentoId, valor: "250.00" }]);
    expect((await aRecolherDoIngresso(prisma, a.movimentoId)).toFixed(2)).toBe("50.00");
    // a segunda tenta 100 de `a`, e só cabem 50
    await expect(
      recolher("250.00", 2027, 3, [
        { ingressoId: a.movimentoId, valor: "100.00" },
        { ingressoId: b.movimentoId, valor: "150.00" },
      ])
    ).rejects.toThrow(/excede o que a retenção/i);
  });

  it("t4 recusa retencao de OUTRA obrigacao — outro tipo ou outro consignatario", async () => {
    // O saldo da obrigacao do INSS existe (senao a guarda externa dispara antes, ver t2); o que se
    // mede aqui e a origem: a parcela recai sobre retencao de OUTRA obrigacao.
    await reter("300.00", 2026, 11);
    const deOutroTipo = await reter("300.00", 2026, 12, INSS, tCaucao);
    await expect(
      recolher("300.00", 2027, 2, [{ ingressoId: deOutroTipo.movimentoId, valor: "300.00" }])
    ).rejects.toThrow(/outra obrigação/i);

    const deOutroCredor = await reter("300.00", 2026, 12, PENSAO);
    await expect(
      recolher("300.00", 2027, 2, [{ ingressoId: deOutroCredor.movimentoId, valor: "300.00" }])
    ).rejects.toThrow(/outra obrigação/i);
  });

  it("t5 recusa a MESMA retencao duas vezes na mesma composicao", async () => {
    const a = await reter("300.00", 2026, 12);
    await expect(
      recolher("300.00", 2027, 2, [
        { ingressoId: a.movimentoId, valor: "150.00" },
        { ingressoId: a.movimentoId, valor: "150.00" },
      ])
    ).rejects.toThrow(/duas vezes/i);
  });

  it("t6 recolhimento PARCIAL: a retencao guarda o remanescente e a segunda guia o consome", async () => {
    const a = await reter("300.00", 2026, 12);
    await recolher("120.00", 2027, 2, [{ ingressoId: a.movimentoId, valor: "120.00" }]);
    const meio = await retencoesComSaldo(prisma, { tipoConsignacaoId: tInss, credorConsignatario: INSS });
    expect(meio[0]?.valor).toBe("300.00");
    expect(meio[0]?.alocado).toBe("120.00");
    expect(meio[0]?.aRecolher).toBe("180.00");

    await recolher("180.00", 2027, 3, [{ ingressoId: a.movimentoId, valor: "180.00" }]);
    const fim = await retencoesComSaldo(prisma, { tipoConsignacaoId: tInss, credorConsignatario: INSS });
    expect(fim[0]?.alocado).toBe("300.00");
    expect(fim[0]?.aRecolher).toBe("0.00");
  });

  it("t7 estornar o recolhimento REABRE exatamente a parcela alocada, e a linha PERMANECE", async () => {
    const a = await reter("300.00", 2026, 12);
    const b = await reter("200.00", 2027, 1);
    const guia = await recolher("500.00", 2027, 2, [
      { ingressoId: a.movimentoId, valor: "300.00" },
      { ingressoId: b.movimentoId, valor: "200.00" },
    ]);
    // uma SEGUNDA guia, que NÃO é estornada: é ela que prova que o estorno reabre só o que era dele
    // (com uma guia só, "reabriu tudo" e "reabriu a parcela certa" seriam indistinguíveis).
    const c = await reter("100.00", 2027, 3);
    await recolher("100.00", 2027, 4, [{ ingressoId: c.movimentoId, valor: "100.00" }]);

    await estornarMovimentoExtra(prisma, {
      movimentoId: guia.movimentoId,
      data: DIA_DE_BORDA(2027, 5, 1),
      motivo: "guia recolhida em codigo de receita errado",
      criadoPor: POR,
    } as never);

    expect((await aRecolherDoIngresso(prisma, a.movimentoId)).toFixed(2)).toBe("300.00");
    expect((await aRecolherDoIngresso(prisma, b.movimentoId)).toFixed(2)).toBe("200.00");
    // a retenção da OUTRA guia segue quitada
    expect((await aRecolherDoIngresso(prisma, c.movimentoId)).toFixed(2)).toBe("0.00");
    // APPEND-ONLY: as parcelas da guia estornada continuam no banco
    expect(await prisma.alocacaoDoRecolhimento.count({ where: { recolhimentoId: guia.movimentoId } })).toBe(2);
  });

  it("t8 retencao ESTORNADA nao tem o que recolher, e aparece na lista em vez de desaparecer", async () => {
    const a = await reter("300.00", 2026, 12);
    await estornarMovimentoExtra(prisma, {
      movimentoId: a.movimentoId,
      data: DIA_DE_BORDA(2027, 5, 1),
      motivo: "retencao lancada em duplicidade",
      criadoPor: POR,
    } as never);
    expect((await aRecolherDoIngresso(prisma, a.movimentoId)).toFixed(2)).toBe("0.00");
    const lista = await retencoesComSaldo(prisma, { tipoConsignacaoId: tInss, credorConsignatario: INSS });
    expect(lista).toHaveLength(1);
    expect(lista[0]?.estornada).toBe(true);
    expect(lista[0]?.aRecolher).toBe("0.00");
  });
});

describe("C37 — retido, recolhido, estornado e a recolher", () => {
  it("t9 os quatro numeros vem SEPARADOS: o estornado nao fica embutido", async () => {
    await reter("300.00", 2026, 12);
    const b = await reter("200.00", 2027, 1);
    const guia = await recolher("200.00", 2027, 2, [{ ingressoId: b.movimentoId, valor: "200.00" }]);
    await estornarMovimentoExtra(prisma, {
      movimentoId: guia.movimentoId,
      data: DIA_DE_BORDA(2027, 5, 1),
      motivo: "guia paga em duplicidade pelo banco",
      criadoPor: POR,
    } as never);

    const c = await conferirComposicaoExtra(prisma);
    const inss = c.obrigacoes.find((o) => o.tipoCodigo === "INSS");
    expect(inss).toBeDefined();
    expect(inss?.retido).toBe("500.00");
    expect(inss?.estornoDeRetencao).toBe("0.00");
    // ⚠️ AQUI ESTÁ A DIFERENÇA: recolhido BRUTO 200,00 e estorno BRUTO 200,00, visíveis os dois.
    // O agregado líquido diria "recolhido 0,00" e esconderia que a guia existiu.
    expect(inss?.recolhido).toBe("200.00");
    expect(inss?.estornoDeRecolhimento).toBe("200.00");
    expect(inss?.aRecolher).toBe("500.00");
  });

  it("t10 a conferencia compara dois caminhos INDEPENDENTES e eles fecham", async () => {
    const a = await reter("300.00", 2026, 12);
    await reter("150.00", 2027, 1, PENSAO);
    await reter("90.00", 2026, 11, INSS, tCaucao);
    await recolher("300.00", 2027, 2, [{ ingressoId: a.movimentoId, valor: "300.00" }]);

    const c = await conferirComposicaoExtra(prisma);
    expect(c.obrigacoes.length).toBe(3);
    expect(c.confere).toBe(true);
    // 300 + 150 + 90 − 300 = 240
    expect(c.totalGlobal).toBe("240.00");
    expect(c.somaDasObrigacoes).toBe("240.00");
  });

  it("t11 recolhimento SEM composicao aparece NOMEADO em vez de sumir no agregado", async () => {
    await reter("300.00", 2026, 12);
    await recolher("120.00", 2027, 2);
    const c = await conferirComposicaoExtra(prisma);
    const inss = c.obrigacoes.find((o) => o.tipoCodigo === "INSS");
    expect(inss?.recolhido).toBe("120.00");
    expect(inss?.recolhidoSemComposicao).toBe("120.00");
    expect(inss?.aRecolher).toBe("180.00");
  });

  it("t12 recolhimento COM composicao nao conta como sem composicao", async () => {
    const a = await reter("300.00", 2026, 12);
    await recolher("120.00", 2027, 2, [{ ingressoId: a.movimentoId, valor: "120.00" }]);
    const c = await conferirComposicaoExtra(prisma);
    const inss = c.obrigacoes.find((o) => o.tipoCodigo === "INSS");
    expect(inss?.recolhidoSemComposicao).toBe("0.00");
  });
  // ⚠️ O EXERCÍCIO DA RETENÇÃO É O DO ENTE. Lido por `getUTCFullYear`, a retenção de 31/12 às 22:00
  // virava 2027 na tela da guia (já é 01/01 em Greenwich) e ia para o grupo do ano errado.
  it("t13 a retencao de 31/12 as 22:00 e do exercicio que termina, nao do seguinte", async () => {
    const r = await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: tInss,
        credorConsignatario: INSS,
        contaBancaria: "CC-001",
        fonteId: fonte500,
        valor: "80.00",
        data: DIA_DE_BORDA(2026, 12, 31),
        historico: "retencao da noite de 31/12",
        criadoPor: POR,
      } as never,
      R_IN
    );
    const lista = await retencoesComSaldo(prisma, { tipoConsignacaoId: tInss, credorConsignatario: INSS });
    expect(lista.find((x) => x.movimentoId === r.movimentoId)?.exercicio).toBe(2026);
  });
});
