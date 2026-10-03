import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularPagamentoParcial, estornarAnulacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import { fatosDeCaixaDaConta } from "./caixa.js";
import { importarExtrato } from "./extrato.js";
import { vincular } from "./vinculo.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ═══ V33 — A ANULAÇÃO PARCIAL DO PAGAMENTO NA CONCILIAÇÃO BANCÁRIA ═══
 *
 * A parcial de pagamento é uma linha de `Pagamento` com `anulacaoParcialDeId`, que herda a conta do
 * original. O lado interno da conciliação (`fatosDeCaixaDaConta`) e o vínculo (`carregarPagamento`)
 * filtravam só o `estornoDeId` e a tratavam como mais um PAGAMENTO — SAÍDA pelo valor cheio. O banco
 * mostra o contrário: a parcial é dinheiro VOLTANDO.
 *
 *   pagamento NP-1 de 2.500 · parcial de 1.000 · extrato: −2.500 e +1.000
 *   Certo: lado interno com SAÍDA 2.500 e ENTRADA 1.000; a parcial concilia com a linha de crédito.
 *   Com o defeito: SAÍDA 2.500 e SAÍDA 1.000 (3.500 saindo), e a parcial recusada na linha de crédito.
 *
 * N=2 no outro eixo: um segundo pagamento com parcial ESTORNADA sai dos dois lados (o par soma zero),
 * como a anulação total.
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
      // V6 P1.2: a guia declara CC-001, e a conta precisa da contábil mapeada (a MESMA do roteiro).
      { id: CONTA, codigo: "CC-001", descricao: "Movimento", fonteId: FONTE_500, contaContabilId: "c-caixa" },
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
      data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: "12345678000195",
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

const MOTIVO = "glosa registrada pela fiscalização do contrato";

describe("M09 V33 — a anulação parcial do pagamento na conciliação", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("o lado interno mostra a parcial como ENTRADA pelo valor dela, e o par estornado sai dos dois lados", async () => {
    // Os dois pagamentos antes das parciais: a parcial devolve saldo à liquidação, que volta à frente da fila.
    const p1 = await umPagamento("2500.00", "NP-1");
    const p2 = await umPagamento("800.00", "NP-2");
    const ap = await anularPagamentoParcial(
      { originalId: p1, numero: "NP-1-AP1", valor: "1000.00", data: new Date("2026-01-08T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    const ap2 = await anularPagamentoParcial(
      { originalId: p2, numero: "NP-2-AP1", valor: "300.00", data: new Date("2026-01-08T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    await estornarAnulacaoParcial(
      { nivel: "PAGAMENTO", anulacaoId: ap2.anulacaoId, numero: "NP-2-AP1-E", data: new Date("2026-01-09T12:00:00Z"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );

    const fatos = await fatosDeCaixaDaConta(
      prisma,
      { id: CONTA, codigo: "CC-001", fonteId: FONTE_500, contaContabilId: "c-caixa" },
      new Date("2026-01-31T23:59:59Z")
    );
    const pagamentos = fatos
      .filter((f) => f.tipoInterno === "PAGAMENTO")
      .map((f) => `${f.id === ap.anulacaoId ? "AP1" : f.id === p1 ? "NP-1" : f.id === p2 ? "NP-2" : f.id} ${f.sentido} ${f.teto.toFixed(2)}`)
      .sort();
    expect(pagamentos).toEqual(["AP1 ENTRADA 1000.00", "NP-1 SAIDA 2500.00", "NP-2 SAIDA 800.00"]);
  });

  it("a parcial concilia com a linha de CRÉDITO do extrato e é recusada na de débito, com o motivo", async () => {
    const p1 = await umPagamento("2500.00", "NP-1");
    const ap = await anularPagamentoParcial(
      { originalId: p1, numero: "NP-1-AP1", valor: "1000.00", data: new Date("2026-01-08T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      arquivoOfx: arquivoOfx([
        { fitid: "S1", dt: "20260105", amt: "-2500.00", memo: "PAGAMENTO" },
        { fitid: "E1", dt: "20260108", amt: "1000.00", memo: "DEVOLUCAO" },
        { fitid: "S2", dt: "20260108", amt: "-1000.00", memo: "OUTRA SAIDA" },
      ]),
      importadoPor: POR,
    });
    await expect(
      vincular(prisma, { lancamentoExtratoId: await linhaDoExtrato("S2"), tipoInterno: "PAGAMENTO", internoId: ap.anulacaoId, valor: "1000.00", criadoPor: POR })
    ).rejects.toThrow(/anulação parcial do pagamento/);
    await expect(
      vincular(prisma, { lancamentoExtratoId: await linhaDoExtrato("E1"), tipoInterno: "PAGAMENTO", internoId: ap.anulacaoId, valor: "1000.00", criadoPor: POR })
    ).resolves.toBeDefined();
    await expect(
      vincular(prisma, { lancamentoExtratoId: await linhaDoExtrato("S1"), tipoInterno: "PAGAMENTO", internoId: p1, valor: "2500.00", criadoPor: POR })
    ).resolves.toBeDefined();
  });
});
