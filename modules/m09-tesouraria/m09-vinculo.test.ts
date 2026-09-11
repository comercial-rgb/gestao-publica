import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anularPagamento, liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "../m07-extraorcamentario/dominio.js";
import {
  registrarDispendioExtra,
  registrarIngressoExtra,
} from "../m07-extraorcamentario/extraorcamentario.js";
import { importarExtrato } from "./extrato.js";
import { estornarVinculo, situacaoDoLancamento, vincular } from "./vinculo.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M09 bloco 2 — vínculo de conciliação.
 *
 * Os limites são conferidos contra ARITMÉTICA MANUAL escrita como literal, nunca
 * contra o SUM do próprio serviço.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
const CONTA = "cb1";
const CONTA_2 = "cb2";
const FICHA = "ficha-1";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const P_INSS = "2.1.8.8.1.01.00";
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: P_INSS, nome: "Consignações", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO, creditoPago: C_PAGO,
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_IN_EXTRA = roteiroIngressoExtra({ disponibilidade: CAIXA, consignacaoAPagar: P_INSS });
const R_OUT_EXTRA = roteiroDispendioExtra({ consignacaoAPagar: P_INSS, disponibilidade: CAIXA });

interface Linha {
  fitid: string;
  dt: string;
  amt: string;
  memo: string;
}

function arquivoOfx(linhas: readonly Linha[], periodo = ["20260101", "20260131"]): string {
  const trns = linhas
    .map((l) =>
      [
        "<STMTTRN>", "<TRNTYPE>OTHER", `<DTPOSTED>${l.dt}`, `<TRNAMT>${l.amt}`,
        `<FITID>${l.fitid}`, `<MEMO>${l.memo}`, "</STMTTRN>",
      ].join("\n")
    )
    .join("\n");
  return `OFXHEADER:100
<OFX>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<ACCTID>12345-6
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${periodo[0]}
<DTEND>${periodo[1]}
${trns}
</BANKTRANLIST>
</STMTRS>
</OFX>`;
}

let deps: M05Deps;

/** ids das linhas do extrato, por FITID. */
async function linhaDoExtrato(fitid: string): Promise<string> {
  const l = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid } });
  return l.id;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  await prisma.contaBancaria.createMany({
    data: [
      { id: CONTA, codigo: "CC-001", descricao: "Movimento", fonteId: FONTE_500 },
      { id: CONTA_2, codigo: "CC-002", descricao: "FUNDEB", fonteId: FONTE_540 },
    ],
  });
  await prisma.tipoConsignacao.create({
    data: {
      id: "tc-inss", codigo: "INSS", descricao: "INSS", criadoPor: POR,
      // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
      contaPassivo: { connect: { codigo: P_INSS } },
    },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE_500, valorDotado: "100000.00",
  });
}

/** Um pagamento de `valor` (sem retenção). Devolve o id. */
async function umPagamento(valor: string, numero = "NP-1"): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${numero}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${numero}`, valor,
      data: new Date("2026-01-03T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liq", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  const p = await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero, valor,
      data: new Date("2026-01-05T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: FONTE_500, historico: "pgto", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps
  );
  return p.pagamentoId;
}

/** Uma arrecadação de `valor`. Devolve o id. */
async function umaArrecadacao(valor: string, guia: string): Promise<string> {
  const r = await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor,
      dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: guia,
      criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  return r.receitaId;
}

describe("M09 — vínculo de conciliação", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — PARCIAL DO LADO DO EXTRATO
  it("t1: depósito de 1.000 cobre DUAS arrecadações (400 + 600); a 3ª estoura", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "D1", dt: "20260110", amt: "1000.00", memo: "DEPOSITO" }]),
      importadoPor: POR,
    });
    const deposito = await linhaDoExtrato("D1");

    const a1 = await umaArrecadacao("400.00", "GUIA-1");
    const a2 = await umaArrecadacao("600.00", "GUIA-2");
    const a3 = await umaArrecadacao("100.00", "GUIA-3");

    await vincular(prisma, {
      lancamentoExtratoId: deposito, tipoInterno: "ARRECADACAO",
      internoId: a1, valor: "400.00", criadoPor: POR,
    });
    await vincular(prisma, {
      lancamentoExtratoId: deposito, tipoInterno: "ARRECADACAO",
      internoId: a2, valor: "600.00", criadoPor: POR,
    });

    // 400 + 600 = 1.000. O depósito está cheio: 0,01 a mais estoura.
    await expect(
      vincular(prisma, {
        lancamentoExtratoId: deposito, tipoInterno: "ARRECADACAO",
        internoId: a3, valor: "0.01", criadoPor: POR,
      })
    ).rejects.toThrow(/ESTOURO no lado do EXTRATO/);

    // prova por SELECT: só os DOIS vínculos legítimos
    expect(await prisma.vinculoConciliacao.count()).toBe(2);

    const s = await situacaoDoLancamento(prisma, deposito);
    expect(s.vinculado.toFixed(2)).toBe("1000.00");
    expect(s.restante.toFixed(2)).toBe("0.00");
    expect(s.conciliado).toBe(true); // DERIVADO, nunca flag
  });

  // t2 — PARCIAL DO LADO INTERNO
  it("t2: um pagamento de 1.000 sai em DOIS débitos (700 + 300); o estouro é simétrico", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([
        { fitid: "P1", dt: "20260105", amt: "-700.00", memo: "PAGTO PARTE 1" },
        { fitid: "P2", dt: "20260106", amt: "-300.00", memo: "PAGTO PARTE 2" },
        { fitid: "P3", dt: "20260107", amt: "-50.00", memo: "SOBRA" },
      ]),
      importadoPor: POR,
    });
    const pagamento = await umPagamento("1000.00");

    await vincular(prisma, {
      lancamentoExtratoId: await linhaDoExtrato("P1"), tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "700.00", criadoPor: POR,
    });
    await vincular(prisma, {
      lancamentoExtratoId: await linhaDoExtrato("P2"), tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "300.00", criadoPor: POR,
    });

    // 700 + 300 = 1.000: o pagamento está inteiramente conciliado.
    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("P3"), tipoInterno: "PAGAMENTO",
        internoId: pagamento, valor: "0.01", criadoPor: POR,
      })
    ).rejects.toThrow(/ESTOURO no lado INTERNO/);

    expect(await prisma.vinculoConciliacao.count()).toBe(2);
  });

  // t3 — NATUREZA CRUZADA
  it("t3: CREDITO do extrato contra um PAGAMENTO = erro", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "C1", dt: "20260110", amt: "1000.00", memo: "CREDITO" }]),
      importadoPor: POR,
    });
    const pagamento = await umPagamento("1000.00");

    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("C1"), tipoInterno: "PAGAMENTO",
        internoId: pagamento, valor: "1000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/NATUREZA CRUZADA/);

    expect(await prisma.vinculoConciliacao.count()).toBe(0);
  });

  // t4 — CONTAS DIFERENTES
  it("t4: linha do extrato de OUTRA conta bancária = erro", async () => {
    // o extrato é da CONTA_2 (FUNDEB); o movimento extra é da CONTA (livre)
    await importarExtrato(prisma, {
      contaBancariaId: CONTA_2,
      arquivoOfx: arquivoOfx([{ fitid: "X1", dt: "20260110", amt: "5000.00", memo: "CAUCAO" }]),
      importadoPor: POR,
    });
    const ingresso = await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: "tc-inss", credorConsignatario: "Construtora Alfa",
        contaBancaria: "CC-001", fonteId: FONTE_500, valor: "5000.00",
        data: new Date("2026-01-10T12:00:00Z"), historico: "caução", criadoPor: POR,
      },
      R_IN_EXTRA
    );

    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("X1"), tipoInterno: "MOVIMENTO_EXTRA",
        internoId: ingresso.movimentoId, valor: "5000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/CONTAS DIFERENTES/);

    expect(await prisma.vinculoConciliacao.count()).toBe(0);
  });

  // t5 — ESTORNO NÃO É CONCILIÁVEL
  it("t5: MOVIMENTO_EXTRA do tipo ESTORNO_* é rejeitado com a mensagem", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "E1", dt: "20260120", amt: "-5000.00", memo: "DEVOL" }]),
      importadoPor: POR,
    });

    const ingresso = await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: "tc-inss", credorConsignatario: "Construtora Alfa",
        contaBancaria: "CC-001", fonteId: FONTE_500, valor: "5000.00",
        data: new Date("2026-01-10T12:00:00Z"), historico: "caução", criadoPor: POR,
      },
      R_IN_EXTRA
    );
    // devolve a caução e ESTORNA a devolução -> nasce um ESTORNO_DISPENDIO
    const dispendio = await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: "tc-inss", credorConsignatario: "Construtora Alfa",
        contaBancaria: "CC-001", fonteId: FONTE_500, valor: "5000.00",
        data: new Date("2026-01-20T12:00:00Z"), historico: "devolução", criadoPor: POR,
      },
      R_OUT_EXTRA
    );
    const { estornarMovimentoExtra } = await import("../m07-extraorcamentario/extraorcamentario.js");
    const estorno = await estornarMovimentoExtra(prisma, {
      movimentoId: dispendio.movimentoId,
      data: new Date("2026-01-25T12:00:00Z"),
      motivo: "Devolução feita para a conta errada do caucionante.",
      criadoPor: POR,
    });

    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("E1"), tipoInterno: "MOVIMENTO_EXTRA",
        internoId: estorno.movimentoId, valor: "5000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/estorno não é conciliável/i);

    expect(await prisma.vinculoConciliacao.count()).toBe(0);
    expect(ingresso.movimentoId).toBeDefined();
  });

  // t6 — MOVIMENTO ANULADO NO MÓDULO DE ORIGEM (anulação de verdade, sem mock)
  it("t6a: pagamento ANULADO pelo M05 não recebe vínculo", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "A1", dt: "20260105", amt: "-1000.00", memo: "PAGTO" }]),
      importadoPor: POR,
    });
    const pagamento = await umPagamento("1000.00");

    // anula DE VERDADE, pelo serviço do M05
    await anularPagamento(
      {
        pagamentoId: pagamento, numero: "NP-1-ANUL",
        data: new Date("2026-01-08T12:00:00Z"),
        historico: "Anulação", criadoPor: POR,
      },
      deps
    );

    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("A1"), tipoInterno: "PAGAMENTO",
        internoId: pagamento, valor: "1000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/está ANULADO/);

    expect(await prisma.vinculoConciliacao.count()).toBe(0);
  });

  it("t6b: arrecadação ANULADA pelo M04 não recebe vínculo", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "A2", dt: "20260110", amt: "500.00", memo: "IPTU" }]),
      importadoPor: POR,
    });
    const receita = await umaArrecadacao("500.00", "GUIA-9");

    // anula DE VERDADE, pelo serviço do M04
    await anularArrecadacao(
      {
        receitaId: receita, dataAnulacao: new Date("2026-01-12T12:00:00Z"),
        numeroReceita: "GUIA-9-ANUL", criadoPor: POR,
      },
      criarM04Deps(prisma)
    );

    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("A2"), tipoInterno: "ARRECADACAO",
        internoId: receita, valor: "500.00", criadoPor: POR,
      })
    ).rejects.toThrow(/está ANULADA/);

    expect(await prisma.vinculoConciliacao.count()).toBe(0);
  });

  // t7 — O ESTORNO RESTAURA A PERMISSÃO (o SALDO governa, não uma flag)
  it("t7: vincular 1.000 → estornar → vincular 1.000 de novo é ACEITO", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "V1", dt: "20260105", amt: "-1000.00", memo: "PAGTO" }]),
      importadoPor: POR,
    });
    const linha = await linhaDoExtrato("V1");
    const pagamento = await umPagamento("1000.00");

    const v1 = await vincular(prisma, {
      lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "1000.00", criadoPor: POR,
    });

    // cheio: um segundo vínculo estouraria
    await expect(
      vincular(prisma, {
        lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
        internoId: pagamento, valor: "1000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/ESTOURO/);

    await estornarVinculo(prisma, {
      vinculoId: v1.vinculoId,
      motivo: "Conciliado contra a linha errada do extrato.",
      criadoPor: POR,
    });

    // o líquido voltou a ZERO -> o mesmo vínculo passa de novo
    const s = await situacaoDoLancamento(prisma, linha);
    expect(s.vinculado.toFixed(2)).toBe("0.00");
    expect(s.conciliado).toBe(false);

    await vincular(prisma, {
      lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "1000.00", criadoPor: POR,
    });

    expect((await situacaoDoLancamento(prisma, linha)).vinculado.toFixed(2)).toBe("1000.00");
    // 1 vínculo + 1 estorno + 1 vínculo = 3 linhas, APPEND-ONLY
    expect(await prisma.vinculoConciliacao.count()).toBe(3);
  });

  // t8 — O ÍNDICE PARCIAL BARRA O DUPLO ESTORNO
  it("t8: duplo estorno é barrado pelo BANCO (INSERT direto driblando o serviço)", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "V2", dt: "20260105", amt: "-1000.00", memo: "PAGTO" }]),
      importadoPor: POR,
    });
    const linha = await linhaDoExtrato("V2");
    const pagamento = await umPagamento("1000.00");

    const v1 = await vincular(prisma, {
      lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "1000.00", criadoPor: POR,
    });
    await estornarVinculo(prisma, {
      vinculoId: v1.vinculoId,
      motivo: "Conciliado contra a linha errada do extrato.",
      criadoPor: POR,
    });

    // o serviço barra...
    await expect(
      estornarVinculo(prisma, {
        vinculoId: v1.vinculoId,
        motivo: "Tentando estornar de novo, por fora.",
        criadoPor: POR,
      })
    ).rejects.toThrow(/já foi estornado/);

    // ...e o BANCO barra quem driblar o serviço.
    let erro: unknown;
    try {
      await prisma.vinculoConciliacao.create({
        data: {
          lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO", internoId: pagamento,
          valor: "1000.00", tipo: "ESTORNO_VINCULO",
          estornoDeId: v1.vinculoId, // JÁ estornado!
          motivo: "clandestino", criadoPor: "atacante",
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log(
      "\n>>> ERRO REAL DO POSTGRES (duplo estorno de vínculo):\n" + String(erro) + "\n"
    );
    expect(String(erro)).toMatch(/uq_estorno_vinculo_unico|Unique constraint/i);

    // e o saldo não devolveu em dobro: 1 vínculo + 1 estorno
    expect(await prisma.vinculoConciliacao.count()).toBe(2);
  });

  // t9 — O ESTORNO PRESERVA O VALOR
  it("t9: o estorno espelha o valor do original (Decimal exato)", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "V3", dt: "20260105", amt: "-1234.56", memo: "PAGTO" }]),
      importadoPor: POR,
    });
    const linha = await linhaDoExtrato("V3");
    const pagamento = await umPagamento("1234.56");

    const v1 = await vincular(prisma, {
      lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
      internoId: pagamento, valor: "1234.56", criadoPor: POR,
    });
    const e1 = await estornarVinculo(prisma, {
      vinculoId: v1.vinculoId,
      motivo: "Conciliação indevida — a linha era de outro credor.",
      criadoPor: POR,
    });

    const estorno = await prisma.vinculoConciliacao.findUniqueOrThrow({
      where: { id: e1.vinculoId },
    });
    // MESMO valor — recarimbar devolveria capacidade diferente da que foi tomada
    expect(estorno.valor.toFixed(2)).toBe("1234.56");
    expect(estorno.tipo).toBe("ESTORNO_VINCULO");
    expect(estorno.estornoDeId).toBe(v1.vinculoId);
    expect(estorno.motivo).toMatch(/outro credor/);

    // APPEND-ONLY: o original está INTACTO
    const original = await prisma.vinculoConciliacao.findUniqueOrThrow({
      where: { id: v1.vinculoId },
    });
    expect(original.tipo).toBe("VINCULO");
    expect(original.estornoDeId).toBeNull();
    expect(original.motivo).toBeNull();
  });

  it("motivo do estorno com menos de 10 caracteres: Zod rejeita", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([{ fitid: "V4", dt: "20260105", amt: "-100.00", memo: "PAGTO" }]),
      importadoPor: POR,
    });
    const v = await vincular(prisma, {
      lancamentoExtratoId: await linhaDoExtrato("V4"), tipoInterno: "PAGAMENTO",
      internoId: await umPagamento("100.00"), valor: "100.00", criadoPor: POR,
    });

    await expect(
      estornarVinculo(prisma, { vinculoId: v.vinculoId, motivo: "erro", criadoPor: POR })
    ).rejects.toThrow(/ao menos 10 caracteres/);
  });

  // A RETENÇÃO NA FONTE não tem linha bancária própria
  it("pagamento COM RETENÇÃO: o extrato mostra o LÍQUIDO, e é ele o limite", async () => {
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([
        // A linha REAL: do banco saiu o LÍQUIDO.
        { fitid: "R1", dt: "20260105", amt: "-5500.00", memo: "PAGTO LIQ" },
        // Uma linha HIPOTÉTICA de 6.000, grande o bastante para o guard do
        // extrato não barrar antes — é o limite INTERNO que este teste persegue.
        { fitid: "R2", dt: "20260106", amt: "-6000.00", memo: "OUTRA MAIOR" },
      ]),
      importadoPor: POR,
    });

    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-R", tipo: "ORDINARIO", valor: "6000.00",
        data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-R", valor: "6000.00",
        data: new Date("2026-01-03T12:00:00Z"), responsavelAtesto: "F",
        historico: "liq", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    const p = await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-R", valor: "6000.00",
        data: new Date("2026-01-05T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE_500, historico: "pgto", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps,
      {
        contaDisponibilidade: CAIXA,
        retencoes: [
          {
            tipoConsignacaoId: "tc-inss", credorConsignatario: "INSS",
            valor: "500.00", contaConsignacaoAPagar: P_INSS,
          },
        ],
      }
    );

    const linha = await linhaDoExtrato("R1");

    // O BRUTO do pagamento é 6.000, mas do banco saíram 5.500. Conciliar 6.000
    // casaria 500 que NUNCA saíram — o limite do lado interno é o LÍQUIDO.
    // (Contra a linha de 6.000, para que o guard do EXTRATO não barre antes.)
    await expect(
      vincular(prisma, {
        lancamentoExtratoId: await linhaDoExtrato("R2"), tipoInterno: "PAGAMENTO",
        internoId: p.pagamentoId, valor: "6000.00", criadoPor: POR,
      })
    ).rejects.toThrow(/ESTOURO no lado INTERNO/);

    // o líquido, sim, concilia inteiro
    await vincular(prisma, {
      lancamentoExtratoId: linha, tipoInterno: "PAGAMENTO",
      internoId: p.pagamentoId, valor: "5500.00", criadoPor: POR,
    });
    expect((await situacaoDoLancamento(prisma, linha)).restante.toFixed(2)).toBe("0.00");

    // e a RETENÇÃO em si não é conciliável: ela não tem linha no banco.
    const retencao = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { pagamentoId: p.pagamentoId, tipo: "INGRESSO" },
    });
    await expect(
      vincular(prisma, {
        lancamentoExtratoId: linha, tipoInterno: "MOVIMENTO_EXTRA",
        internoId: retencao.id, valor: "500.00", criadoPor: POR,
      })
    ).rejects.toThrow(/RETENÇÃO NA FONTE.*não tem linha bancária própria/is);
  });
});
