import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { importarExtrato } from "./extrato.js";
import { estornarVinculo, vincular } from "./vinculo.js";
import {
  conciliacaoBancaria,
  MapeamentoContabilAusenteError,
  type ConciliacaoBancaria,
} from "./conciliacao.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ═══ O TESTE DE OURO DA CONCILIAÇÃO ═══
 *
 * Todos os números conferidos contra ARITMÉTICA MANUAL, escrita como literal —
 * nunca contra o SUM do próprio serviço.
 *
 *   EXTRATO (por natureza)            CONTÁBIL (partidas de caixa)
 *   D1  DEBITO   5.500  (−5.500)      P1 pagamento líq.  (−5.500)
 *   C1  CREDITO  2.000  (+2.000)      A1 arrecadação     (+2.000)
 *   D2  CREDITO  1.000  (+1.000)      A2 arrecadação     (+  400)
 *   E1  DEBITO     800  (−  800)      P2 pagamento       (−1.200)
 *   T1  DEBITO      35  (−   35)      P3 pagamento       (−  800)
 *   ─────────────────────────────     ────────────────────────────
 *   saldoExtrato      = −3.335,00     saldoContabil    = −5.100,00
 *
 *   diferença = −3.335 − (−5.100) = +1.765,00
 *
 *   noExtratoSemVinculo: T1 (−35) + D2 (+600) + E1 (−800) = −  235,00
 *   internoSemVinculo:   P2 (−1.200) + P3 (−800)          = −2.000,00
 *   explicado = −235 − (−2.000) = +1.765,00   ✓ FECHA
 *
 * P1 tem RETENÇÃO de 500 (bruto 6.000, líquido 5.500): o extrato mostra 5.500, e
 * é o líquido que concilia. A retenção não entra em lugar nenhum — ela não tem
 * linha bancária própria.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const FONTE = "fnt-500";
const CONTA = "cb1";
const SEM_MAPA = "cb-sem-mapa";
const FICHA = "ficha-1";
const NAT_RECEITA = "11130111";

// As contas do roteiro — as MESMAS já usadas pelo Anexo 13. Nada inventado.
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

interface Linha { fitid: string; dt: string; amt: string; memo: string }

function arquivoOfx(linhas: readonly Linha[]): string {
  const trns = linhas
    .map((l) =>
      ["<STMTTRN>", "<TRNTYPE>OTHER", `<DTPOSTED>${l.dt}`, `<TRNAMT>${l.amt}`,
       `<FITID>${l.fitid}`, `<MEMO>${l.memo}`, "</STMTTRN>"].join("\n")
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
<DTSTART>20260101
<DTEND>20261231
${trns}
</BANKTRANLIST>
</STMTRS>
</OFX>`;
}

let deps: M05Deps;
let corte: Date;
let relatorio: ConciliacaoBancaria;
let P1: string, P2: string, P3: string, A1: string, A2: string;

async function idDaLinha(fitid: string): Promise<string> {
  return (await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid } })).id;
}

/** Empenha, liquida e paga. `retido` opcional (M07). Devolve o id do pagamento. */
async function pagamento(opts: {
  numero: string;
  valor: string;
  dataLiquidacao: string;
  dataPagamento: string;
  retido?: string;
}): Promise<string> {
  const e = await empenhar(
    {
      fichaId: FICHA, numero: `NE-${opts.numero}`, tipo: "ORDINARIO", valor: opts.valor,
      data: new Date("2026-01-02T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: `NL-${opts.numero}`, valor: opts.valor,
      data: new Date(opts.dataLiquidacao), responsavelAtesto: "Fulano",
      historico: "liq", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
  const p = await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: opts.numero, valor: opts.valor,
      data: new Date(opts.dataPagamento), contaBancaria: "CC-001",
      fonteId: FONTE, historico: "pgto", criadoPor: POR,
    },
    R_PAGAMENTO,
    deps,
    opts.retido !== undefined
      ? {
          contaDisponibilidade: CAIXA,
          retencoes: [
            {
              tipoConsignacaoId: "tc-inss", credorConsignatario: "INSS",
              valor: opts.retido, contaConsignacaoAPagar: P_INSS,
            },
          ],
        }
      : undefined
  );
  return p.pagamentoId;
}

async function arrecadacao(valor: string, guia: string, data: string): Promise<string> {
  const r = await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor,
      dataArrecadacao: new Date(data), numeroReceita: guia, criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  return r.receitaId;
}

describe("M09 — conciliação bancária", () => {
  beforeAll(async () => {
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
    await prisma.fonteRecurso.create({
      data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
    });

    // ═══ PARTE 0 — O MAPEAMENTO: a conta bancária aponta para a conta do PCASP
    // que ela movimenta. É a MESMA conta de caixa do roteiro (nada inventado).
    await prisma.contaBancaria.create({
      data: {
        id: CONTA, codigo: "CC-001", descricao: "Movimento",
        fonteId: FONTE, contaContabilId: "c-caixa",
      },
    });
    // E uma conta SEM mapeamento, para o fail-closed.
    await prisma.contaBancaria.create({
      data: { id: SEM_MAPA, codigo: "CC-099", descricao: "Sem mapa", fonteId: FONTE },
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
      naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
    });

    // ── OS FATOS INTERNOS ────────────────────────────────────────────────
    // P1: bruto 6.000 com 500 retidos -> LÍQUIDO 5.500 no banco.
    P1 = await pagamento({
      numero: "NP-1", valor: "6000.00",
      dataLiquidacao: "2026-01-03T12:00:00Z", dataPagamento: "2026-01-05T12:00:00Z",
      retido: "500.00",
    });
    A1 = await arrecadacao("2000.00", "GUIA-1", "2026-01-10T12:00:00Z");
    A2 = await arrecadacao("400.00", "GUIA-2", "2026-01-15T12:00:00Z");
    // P2: cheque NÃO COMPENSADO — não tem linha no extrato.
    P2 = await pagamento({
      numero: "NP-2", valor: "1200.00",
      dataLiquidacao: "2026-01-18T12:00:00Z", dataPagamento: "2026-01-20T12:00:00Z",
    });
    // P3: vai ser conciliado e o vínculo vai ser ESTORNADO.
    P3 = await pagamento({
      numero: "NP-3", valor: "800.00",
      dataLiquidacao: "2026-01-23T12:00:00Z", dataPagamento: "2026-01-25T12:00:00Z",
    });

    // ── O EXTRATO ────────────────────────────────────────────────────────
    await importarExtrato(prisma, {
      contaBancariaId: CONTA,
      importadoPor: POR,
      arquivoOfx: arquivoOfx([
        { fitid: "D1", dt: "20260105", amt: "-5500.00", memo: "PAGTO FORNECEDOR" },
        { fitid: "C1", dt: "20260110", amt: "2000.00", memo: "IPTU" },
        { fitid: "D2", dt: "20260115", amt: "1000.00", memo: "DEPOSITO" },
        { fitid: "E1", dt: "20260125", amt: "-800.00", memo: "PAGTO NP-3" },
        { fitid: "T1", dt: "20260131", amt: "-35.00", memo: "TARIFA MANUTENCAO" },
        // APÓS O CORTE — não pode contaminar nada.
        { fitid: "PC1", dt: "20261231", amt: "-999.00", memo: "APOS O CORTE" },
      ]),
    });

    // ── OS VÍNCULOS ──────────────────────────────────────────────────────
    await vincular(prisma, {
      lancamentoExtratoId: await idDaLinha("D1"), tipoInterno: "PAGAMENTO",
      internoId: P1, valor: "5500.00", criadoPor: POR, // o LÍQUIDO
    });
    await vincular(prisma, {
      lancamentoExtratoId: await idDaLinha("C1"), tipoInterno: "ARRECADACAO",
      internoId: A1, valor: "2000.00", criadoPor: POR,
    });
    // PARCIAL: o depósito de 1.000 cobre só a arrecadação de 400.
    await vincular(prisma, {
      lancamentoExtratoId: await idDaLinha("D2"), tipoInterno: "ARRECADACAO",
      internoId: A2, valor: "400.00", criadoPor: POR,
    });
    // ESTORNADO: os DOIS lados voltam para as listas de diferença.
    const vE1 = await vincular(prisma, {
      lancamentoExtratoId: await idDaLinha("E1"), tipoInterno: "PAGAMENTO",
      internoId: P3, valor: "800.00", criadoPor: POR,
    });
    await estornarVinculo(prisma, {
      vinculoId: vE1.vinculoId,
      motivo: "Conciliado contra a linha errada do extrato.",
      criadoPor: POR,
    });

    // ═══ O CORTE — tudo acima é ANTES; tudo abaixo é DEPOIS. ═══
    corte = new Date();

    // VÍNCULO PÓS-CORTE: concilia a tarifa contra o pagamento não compensado.
    // Ele NÃO pode reduzir residual nenhum no relatório do corte acima.
    await vincular(prisma, {
      lancamentoExtratoId: await idDaLinha("T1"), tipoInterno: "PAGAMENTO",
      internoId: P2, valor: "35.00", criadoPor: POR,
    });

    relatorio = await conciliacaoBancaria(prisma, CONTA, corte);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── PARTE 0: fail-closed do mapeamento ─────────────────────────────────

  it("conta SEM conta contábil mapeada: erro nomeado, e zero escrita", async () => {
    const vinculosAntes = await prisma.vinculoConciliacao.count();
    const extratosAntes = await prisma.extratoBancario.count();

    await expect(conciliacaoBancaria(prisma, SEM_MAPA, corte)).rejects.toThrow(
      MapeamentoContabilAusenteError
    );
    await expect(conciliacaoBancaria(prisma, SEM_MAPA, corte)).rejects.toThrow(
      /não tem CONTA CONTÁBIL mapeada/
    );

    // leitura pura: nada foi gravado nem "consertado" na passagem
    expect(await prisma.vinculoConciliacao.count()).toBe(vinculosAntes);
    expect(await prisma.extratoBancario.count()).toBe(extratosAntes);
  });

  it("conta bancária inexistente: fail-closed", async () => {
    await expect(conciliacaoBancaria(prisma, "nao-existe", corte)).rejects.toThrow(
      /não cadastrada/
    );
  });

  // ── OS SALDOS ──────────────────────────────────────────────────────────

  it("saldoExtrato = −3.335,00 (SUM com o sinal da NATUREZA, nunca bruto)", () => {
    // −5.500 + 2.000 + 1.000 − 800 − 35 = −3.335
    // (a linha PC1, de 31/12, está DEPOIS do corte e não entra)
    expect(relatorio.saldoExtrato).toBe("-3335.00");
    expect(relatorio.contaBancaria.contaContabil).toBe(CAIXA);
  });

  it("saldoContabil = −5.100,00 (partidas de caixa, a MESMA apuração do Anexo 13)", () => {
    // −5.500 (P1 líquido) + 2.000 (A1) + 400 (A2) − 1.200 (P2) − 800 (P3)
    expect(relatorio.saldoContabil).toBe("-5100.00");
  });

  it("diferença = +1.765,00", () => {
    // −3.335 − (−5.100)
    expect(relatorio.diferenca).toBe("1765.00");
  });

  // ── AS DIFERENÇAS NOMEADAS ─────────────────────────────────────────────

  it("noExtratoSemVinculo: a TARIFA, o resto do DEPÓSITO e a linha DESVINCULADA", () => {
    const por = new Map(relatorio.noExtratoSemVinculo.map((l) => [l.descricao, l]));
    expect(relatorio.noExtratoSemVinculo).toHaveLength(3);

    // A TARIFA: o banco cobrou, o razão não sabe. Residual com o sinal da natureza.
    const tarifa = [...por.values()].find((l) => /TARIFA/.test(l.descricao))!;
    expect(tarifa.residual).toBe("-35.00");

    // O DEPÓSITO: 1.000 no banco, só 400 conciliados -> sobram 600 (RESIDUAL,
    // nunca tudo-ou-nada).
    const deposito = [...por.values()].find((l) => /DEPOSITO/.test(l.descricao))!;
    expect(deposito.residual).toBe("600.00");

    // O VÍNCULO ESTORNADO devolveu a linha INTEIRA à lista — com valor REAL,
    // nunca zero estrutural.
    const desvinculada = [...por.values()].find((l) => /NP-3/.test(l.descricao))!;
    expect(desvinculada.residual).toBe("-800.00");

    // as conciliadas NÃO aparecem
    expect([...por.values()].some((l) => /IPTU/.test(l.descricao))).toBe(false);
    expect([...por.values()].some((l) => /FORNECEDOR/.test(l.descricao))).toBe(false);
  });

  it("internoSemVinculo: o cheque NÃO COMPENSADO e o pagamento DESVINCULADO", () => {
    expect(relatorio.internoSemVinculo).toHaveLength(2);
    const por = new Map(relatorio.internoSemVinculo.map((l) => [l.descricao, l]));

    // P2: o razão pagou, o banco não debitou (cheque não compensado).
    // O vínculo PÓS-CORTE (35) NÃO reduziu este residual.
    expect(por.get("Pagamento NP-2")!.residual).toBe("-1200.00");
    expect(por.get("Pagamento NP-2")!.tipoInterno).toBe("PAGAMENTO");

    // P3: o vínculo foi estornado -> volta com o residual CHEIO.
    expect(por.get("Pagamento NP-3")!.residual).toBe("-800.00");

    // P1 (conciliado pelo líquido) e as arrecadações conciliadas NÃO aparecem.
    expect(por.has("Pagamento NP-1")).toBe(false);
    expect(por.has("Arrecadação GUIA-1")).toBe(false);
    // A2 foi conciliada por INTEIRO (400 de 400) — some da lista, e o que sobra
    // do depósito aparece do lado do EXTRATO. Cada resíduo no seu lado.
    expect(por.has("Arrecadação GUIA-2")).toBe(false);
  });

  it("A RETENÇÃO não aparece em lugar nenhum: ela não tem linha bancária", async () => {
    const retencao = await prisma.movimentoExtraorcamentario.findFirstOrThrow({
      where: { pagamentoId: P1, tipo: "INGRESSO" },
    });
    expect(retencao.valor.toFixed(2)).toBe("500.00");

    expect(
      relatorio.internoSemVinculo.some((l) => l.id === retencao.id)
    ).toBe(false);
    // e é por isso que o pagamento concilia pelo LÍQUIDO: 6.000 − 500 = 5.500.
    expect(relatorio.saldoContabil).toBe("-5100.00");
  });

  // ── A AMARRAÇÃO ────────────────────────────────────────────────────────

  it("AMARRAÇÃO: diferença == Σresidual(extrato) − Σresidual(interno)", () => {
    // Somado na mão, aqui:
    const somaExtrato = -35 + 600 - 800; // = −235
    const somaInterno = -1200 - 800; // = −2.000
    expect(somaExtrato).toBe(-235);
    expect(somaInterno).toBe(-2000);
    expect(somaExtrato - somaInterno).toBe(1765);

    expect(relatorio.diferenca).toBe("1765.00");

    // e o serviço CONFERIU isso antes de devolver — se não fechasse, teria lançado.
    const somaReal = (linhas: readonly { residual: string }[]) =>
      linhas.reduce((acc, l) => acc + Number(l.residual), 0);
    expect(somaReal(relatorio.noExtratoSemVinculo)).toBeCloseTo(-235, 2);
    expect(somaReal(relatorio.internoSemVinculo)).toBeCloseTo(-2000, 2);
  });

  it("MUTAÇÃO: um lançamento de caixa que nenhum fato explica QUEBRA a amarração", async () => {
    // Injeta no razão um débito em caixa de 100 SEM fato interno correspondente —
    // exatamente o que a amarração existe para pegar ("há lançamento em conta de
    // caixa que nenhum fluxo explica").
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "INTRUSO-1",
        dataTransacao: new Date("2026-01-28T12:00:00Z"),
        historico: "lançamento manual em caixa, sem fato",
        origemTipo: "INTRUSO",
        criadoPor: "atacante",
        partidas: {
          create: [
            { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "100.00" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "100.00" },
          ],
        },
      },
    });

    let erro: unknown;
    try {
      await conciliacaoBancaria(prisma, CONTA, corte);
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    const msg = String(erro);
    console.log("\n>>> AMARRAÇÃO QUEBRADA (esperado):\n" + msg + "\n");
    expect(msg).toMatch(/CONCILIAÇÃO NÃO FECHA/);
    // O saldo contábil virou −5.000; a diferença cai para 1.665, mas as linhas
    // continuam explicando 1.765 -> sobram exatamente −100,00. O erro NOMEIA isso.
    expect(msg).toMatch(/sobram -100\.00 SEM EXPLICAÇÃO/);
  });
});
