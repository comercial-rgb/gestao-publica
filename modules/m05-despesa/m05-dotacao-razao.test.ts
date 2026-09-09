import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_EMPENHADO,
  CONTA_CREDITO_RESERVADO,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_DOTACAO_INICIAL,
  semearRoteiroOrcamentario,
} from "../../test/roteiro-orcamentario.js";
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import {
  anularCredito,
  criarDecreto,
  criarLei,
  executarCredito,
  saldoDaLei,
} from "../m03-creditos/servico.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { conferirDotacaoContraRazao } from "./conferir-dotacao.js";
import { roteiroEmpenho } from "./dominio.js";
import { empenhar, reservarDotacao, saldosDaFicha } from "./servico.js";
import type { M03Deps } from "../m03-creditos/ports.js";
import type { M05Deps } from "./ports.js";

/**
 * O SUBSISTEMA ORÇAMENTÁRIO NO RAZÃO — a cura do furo nomeado em 46dfd5d.
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O FURO ═══
 * Até aqui o razão só conhecia DUAS pernas da dotação: o EMPENHO (D crédito disponível /
 * C crédito empenhado) e o estorno dele. A LOA, os créditos adicionais e as reservas
 * viviam SÓ no `MovimentoDotacao`. O crédito disponível — conta CREDORA — era **debitado**
 * pelo empenho e **nunca creditado**. Saldo devedor, permanente.
 *
 * O balancete FECHAVA (todo lançamento é balanceado, um a um), e foi por isso que nenhuma
 * amarração pegou. Só a A1-orc — razão × movimentos — enxerga um buraco desses.
 *
 * ═══ t1 — A LOA NO RAZÃO ═══
 *   ficha dotada em 10.000
 *     dotação:  D 5.2.2.1.1 (dotação inicial) 10.000 / C 6.2.2.1.1 (disponível) 10.000
 *   empenho 6.000
 *     empenho:  D 6.2.2.1.1 6.000 / C 6.2.2.1.3 (empenhado) 6.000
 *
 *   razão, conta 6.2.2.1.1 (CREDORA): ΣC 10.000 − ΣD 6.000 = **4.000,00** credor
 *   ...que é EXATAMENTE o `disponivel` da ficha. Antes deste bloco o razão dizia
 *   **6.000 DEVEDOR** — o oposto, e sem ninguém para reclamar.
 *
 * ═══ t2 — O CRÉDITO ADICIONAL (M03) ═══
 *   suplementação 2.000 (decreto por ANULACAO: tira 2.000 da ficha B)
 *     ficha A:  D 5.2.2.1.2 (dotação adicional) 2.000 / C 6.2.2.1.1 2.000
 *     ficha B:  D 6.2.2.1.1 2.000 / C 5.2.2.1.2 2.000        (a perna de anulação)
 *   Somadas, as duas se cancelam no disponível GLOBAL — e é isso que a A1-orc confere.
 *
 *   autorizado(A) = 10.000 + 2.000 = 12.000 · autorizado(B) = 5.000 − 2.000 = 3.000
 *
 * ═══ t3 — A RESERVA ═══
 *   reserva 1.000:  D 6.2.2.1.1 1.000 / C 6.2.2.1.2 (reservado) 1.000
 *   disponível da ficha = 10.000 − 1.000 (reservado) − 6.000 (empenhado) = 3.000
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_A = "ficha-a";
const FICHA_B = "ficha-b";

const CONTAS_DO_ORCAMENTO = {
  disponivel: CONTA_CREDITO_DISPONIVEL,
  reservado: CONTA_CREDITO_RESERVADO,
  empenhado: CONTA_CREDITO_EMPENHADO,
};

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: CONTA_CREDITO_DISPONIVEL,
  creditoEmpenhado: CONTA_CREDITO_EMPENHADO,
});

let deps: M05Deps;
let deps03: M03Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);
  deps03 = criarM03Deps(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "EF" },
      { id: "sub-362", codigo: "362", nome: "EM" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE,
  };
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_A, numero: 1, subfuncaoId: "sub-361", valorDotado: "10000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: FICHA_B, numero: 2, subfuncaoId: "sub-362", valorDotado: "5000.00" });
}

/** O saldo CREDOR de uma conta de controle, direto do razão. */
async function noRazao(codigo: string): Promise<number> {
  const partidas = await prisma.partidaContabil.findMany({
    where: { conta: { codigo } },
    select: { tipo: true, valor: true },
  });
  return partidas.reduce(
    (a, p) => (p.tipo === "CREDITO" ? a + Number(p.valor) : a - Number(p.valor)),
    0
  );
}

async function empenhar6000(): Promise<void> {
  await empenhar(
    {
      fichaId: FICHA_A, numero: "NE-1", tipo: "ORDINARIO", valor: "6000.00",
      data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
}

describe("M02/M05 — a dotação no razão", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — TESTE DE OURO
  it("t1: a LOA LANÇA; o crédito disponível fecha CREDOR de 4.000 (era 6.000 DEVEDOR)", async () => {
    // ═══ A DOTAÇÃO, no razão ═══
    // ficha A (10.000) + ficha B (5.000) = 15.000 dotados
    expect(await noRazao(CONTA_DOTACAO_INICIAL)).toBe(-15000); // devedora: −15.000 credor
    expect(await noRazao(CONTA_CREDITO_DISPONIVEL)).toBe(15000);

    await empenhar6000();

    // ⚠️ 15.000 dotados − 6.000 empenhados = 9.000 disponíveis, e o RAZÃO diz isso.
    // Antes deste bloco o razão dizia **−6.000** (saldo DEVEDOR numa conta credora),
    // porque a dotação nunca chegou lá.
    expect(await noRazao(CONTA_CREDITO_DISPONIVEL)).toBe(9000);
    expect(await noRazao(CONTA_CREDITO_EMPENHADO)).toBe(6000);

    // ...e o disponível da FICHA A, pelos movimentos: 10.000 − 6.000 = 4.000
    const sa = await saldosDaFicha(FICHA_A, deps);
    expect(sa.autorizado.toFixed(2)).toBe("10000.00");
    expect(sa.empenhado.toFixed(2)).toBe("6000.00");
    expect(sa.disponivel.toFixed(2)).toBe("4000.00");

    // ═══ A1-orc: as duas leituras concordam ═══
    const conf = await conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO);
    const porConta = new Map(conf.map((c) => [c.conta, c]));
    expect(porConta.get(CONTA_CREDITO_DISPONIVEL)!.peloRazao.toFixed(2)).toBe("9000.00");
    expect(porConta.get(CONTA_CREDITO_DISPONIVEL)!.pelosMovimentos.toFixed(2)).toBe("9000.00");
    expect(porConta.get(CONTA_CREDITO_EMPENHADO)!.peloRazao.toFixed(2)).toBe("6000.00");
  });

  // t6 — o motor do M01 valida
  it("t6: o lançamento da dotação FECHA por subsistema (ΣD == ΣC), e é ORÇAMENTÁRIO", async () => {
    const lanc = await prisma.lancamentoContabil.findFirstOrThrow({
      where: { origemTipo: "LOA" },
      include: { partidas: { include: { conta: true } } },
    });

    expect(lanc.natureza).toBe("NORMAL");
    expect(lanc.partidas).toHaveLength(2);
    expect(lanc.partidas.every((p) => p.subsistema === "ORCAMENTARIO")).toBe(true);

    const d = lanc.partidas.filter((p) => p.tipo === "DEBITO").reduce((a, p) => a + Number(p.valor), 0);
    const c = lanc.partidas.filter((p) => p.tipo === "CREDITO").reduce((a, p) => a + Number(p.valor), 0);
    expect(d).toBe(c);

    // ⚠️ E A FICHA VAI NA PARTIDA — é a dimensão orçamentária dela, e é por ela que o
    // resolver do M14 diz a fonte, a natureza e a funcional desta linha da MSC.
    expect(lanc.partidas.every((p) => p.fichaId !== null)).toBe(true);

    // as duas contas do roteiro, e não outras
    const codigos = lanc.partidas.map((p) => p.conta.codigo).sort();
    expect(codigos).toEqual([CONTA_DOTACAO_INICIAL, CONTA_CREDITO_DISPONIVEL].sort());
  });

  // t3 — RESERVA + A1-orc com as três contas
  it("t3: a RESERVA também lança — e sem ela a A1-orc não fecharia", async () => {
    await reservarDotacao(
      {
        fichaId: FICHA_A, valor: "1000.00",
        historico: "reserva para licitação", criadoPor: POR,
      },
      deps
    );
    await empenhar6000();

    // disponível = 15.000 (dotado) − 1.000 (reservado) − 6.000 (empenhado) = 8.000
    expect(await noRazao(CONTA_CREDITO_DISPONIVEL)).toBe(8000);
    expect(await noRazao(CONTA_CREDITO_RESERVADO)).toBe(1000);

    const sa = await saldosDaFicha(FICHA_A, deps);
    expect(sa.reservado.toFixed(2)).toBe("1000.00");
    expect(sa.disponivel.toFixed(2)).toBe("3000.00"); // 10.000 − 1.000 − 6.000

    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).resolves.toBeDefined();
  });

  // t4 — A1-orc sob MUTAÇÃO
  it("t4: A1-orc ACUSA quando uma perna do razão é adulterada — nomeando a diferença", async () => {
    await empenhar6000();
    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).resolves.toBeDefined();

    // ⚠️ A MUTAÇÃO: apago a partida CREDORA da dotação de uma ficha. O razão passa a dizer
    // que há 5.000 a menos de crédito disponível do que os movimentos afirmam — e o
    // BALANCETE NEM PISCA (ele fecha por lançamento, e o lançamento continua balanceado
    // pela perna devedora... na verdade nem isso: mas nenhuma amarração ANTERIOR olhava
    // para cá). A A1-orc é a única que enxerga.
    const conta = await prisma.contaPcasp.findUniqueOrThrow({
      where: { codigo: CONTA_CREDITO_DISPONIVEL },
      select: { id: true },
    });
    const partida = await prisma.partidaContabil.findFirstOrThrow({
      where: {
        contaId: conta.id,
        tipo: "CREDITO",
        lancamento: { origemTipo: "LOA" },
      },
      select: { id: true, valor: true },
    });
    await prisma.partidaContabil.delete({ where: { id: partida.id } });

    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).rejects.toThrow(/A1-orc NÃO FECHA na conta 6\.2\.2\.1\.1\.00\.00/);
    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).rejects.toThrow(/o balancete NÃO pega isto/);
  });

  // t5 — FAIL-CLOSED
  it("t5: roteiro AUSENTE derruba a operação INTEIRA — zero movimento E zero lançamento", async () => {
    await prisma.roteiroOrcamentario.deleteMany({ where: { tipo: "RESERVA" } });

    const movsAntes = await prisma.movimentoDotacao.count();
    const lancsAntes = await prisma.lancamentoContabil.count();

    await expect(
      reservarDotacao(
        {
          fichaId: FICHA_A, valor: "1000.00",
          historico: "reserva sem roteiro", criadoPor: POR,
        },
        deps
      )
    ).rejects.toThrow(/ROTEIRO ORÇAMENTÁRIO NÃO PARAMETRIZADO para RESERVA/);

    // ⚠️ ATOMICIDADE, provada por SELECT: nem o movimento, nem a reserva, nem o lançamento.
    expect(await prisma.movimentoDotacao.count()).toBe(movsAntes);
    expect(await prisma.lancamentoContabil.count()).toBe(lancsAntes);
    expect(await prisma.reservaDotacao.count()).toBe(0);
  });

  it("o roteiro NÃO cobre o EMPENHO — o dono já lança (roteiro duplo lançaria 2x)", async () => {
    const tipos = (
      await prisma.roteiroOrcamentario.findMany({ select: { tipo: true } })
    ).map((r) => r.tipo);
    expect(tipos.sort()).toEqual([
      "ANULACAO_CREDITO",
      "CREDITO_ADICIONAL",
      "DOTACAO_INICIAL",
      "RESERVA",
      "RESERVA_LIBERADA",
    ]);
    expect(tipos).not.toContain("EMPENHO");
  });
});

describe("M03 — o crédito adicional no razão", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t2
  it("t2: suplementação 2.000 lança as DUAS pernas; anular estorna, e o teto volta", async () => {
    await semearRoteiroOrcamentario(prisma);

    const leiId = await criarLei(
      {
        numero: "L-1", ano: 2026, tipoCredito: "SUPLEMENTAR",
        valorAutorizado: "50000.00", dataPublicacao: new Date("2026-01-15T12:00:00Z"),
        criadoPor: POR,
      },
      deps03
    );
    const decretoId = await criarDecreto(
      {
        leiId, numero: "D-1", ano: 2026, data: new Date("2026-03-01T12:00:00Z"),
        origemRecurso: "ANULACAO", criadoPor: POR,
      },
      deps03
    );

    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_B, tipo: "ANULACAO", valor: "2000.00", fonteId: FONTE },
          { fichaId: FICHA_A, tipo: "SUPLEMENTACAO", valor: "2000.00", fonteId: FONTE },
        ],
        criadoPor: POR,
      },
      deps03
    );

    // autorizado: A = 10.000 + 2.000 = 12.000 · B = 5.000 − 2.000 = 3.000
    expect((await saldosDaFicha(FICHA_A, deps)).autorizado.toFixed(2)).toBe("12000.00");
    expect((await saldosDaFicha(FICHA_B, deps)).autorizado.toFixed(2)).toBe("3000.00");

    // ⚠️ NO RAZÃO: as duas pernas se cancelam no disponível global (é uma ANULAÇÃO — o
    // dinheiro só mudou de ficha), e a dotação ADICIONAL registra as duas passagens.
    expect(await noRazao(CONTA_CREDITO_DISPONIVEL)).toBe(15000); // inalterado
    expect(await noRazao(CONTA_DOTACAO_ADICIONAL)).toBe(0); // +2.000 e −2.000
    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).resolves.toBeDefined();

    // ═══ ANULAR O DECRETO — a perna do razão é estornada JUNTO ═══
    await anularCredito(
      {
        decretoId,
        data: new Date("2026-06-01T12:00:00Z"),
        motivo: "Decreto revogado por vício no processo administrativo.",
        criadoPor: POR,
      },
      deps03
    );

    // os saldos VOLTAM
    expect((await saldosDaFicha(FICHA_A, deps)).autorizado.toFixed(2)).toBe("10000.00");
    expect((await saldosDaFicha(FICHA_B, deps)).autorizado.toFixed(2)).toBe("5000.00");

    // ...e o razão volta junto — a A1-orc prova que as duas leituras não divergiram
    expect(await noRazao(CONTA_CREDITO_DISPONIVEL)).toBe(15000);
    await expect(
      conferirDotacaoContraRazao(prisma, CONTAS_DO_ORCAMENTO)
    ).resolves.toBeDefined();

    // ⚠️ REGRESSÃO DE cf765b0 COM A PERNA NOVA: o teto da lei volta a ser devolvido pela
    // anulação (o bug do item de estorno com tipo invertido, que ficava consumido para
    // sempre). A perna no razão não estragou a correção.
    const lei = await saldoDaLei(leiId, "50000.00", deps03);
    expect(lei.consumido).toBe("0.00");
    expect(lei.restante).toBe("50000.00");
  });
});
