import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { importarExtrato } from "./extrato.js";
import { transferirEntreContas } from "./transferencia.js";
import { conciliacaoBancaria } from "./conciliacao.js";
import { vincular } from "./vinculo.js";

/**
 * ═══ DUAS CONTAS BANCÁRIAS NA MESMA CONTA CONTÁBIL (V22 rodada 7) — PROFUNDIDADE ═══
 *
 * O plano oficial do TCE-PB tem UMA analítica de movimento para todas as contas bancárias. Antes, o
 * lado contábil da conciliação de cada conta somava a contábil inteira — o movimento das duas — e
 * nenhuma fechava. Agora cada conta soma os lançamentos dos SEUS fatos.
 *
 * Aritmética manual, escrita como literal (nunca o SUM do próprio serviço):
 *
 *   conta A: arrecadação +3.000; pagamento −1.000; transferência A→B −200      = +1.800
 *   conta B: arrecadação   +500; transferência A→B +200                        =   +700
 *   ajuste manual na contábil (não é fato de conta nenhuma)                    =    +70
 *   ─────────────────────────────────────────────────────────────────────────────────────
 *   a contábil inteira = 1.800 + 700 + 70                                       = +2.570
 *
 *   extrato de A: +3.000, −1.000, −200 → +1.800. Sem vínculo: diferença 0, pendências 1.800 − 1.800.
 *   B sem extrato: saldo 0; diferença −700; pendência interna +700 → explicado −700.
 *
 * O que este arquivo existe para impedir: a conta A somando o dinheiro da B (e a conciliação de
 * nenhuma das duas fechando); a transferência entre as duas sumindo dos dois lados; o ajuste manual
 * sendo atribuído a uma conta por palpite.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
const NAT_RECEITA = "11130111";
const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.1.1.2.1.01.00";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "6.2.1.1.0.00.00", nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.2.0.00.00", nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const D = (s: string): Date => new Date(`${s}T12:00:00Z`);
const CORTE = new Date("2026-01-31T23:00:00Z");

async function arrecadar(valor: string, guia: string, data: string, conta: string): Promise<void> {
  await registrarArrecadacao(
    { exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor, dataArrecadacao: D(data), numeroReceita: guia, criadoPor: POR, contaBancaria: conta },
    roteiroArrecadacao({ disponibilidade: CAIXA, variacaoAumentativa: VPA, receitaARealizar: "6.2.1.1.0.00.00", receitaRealizada: "6.2.1.2.0.00.00" }),
    criarM04Deps(prisma)
  );
}

beforeAll(async () => {
  await limparBanco(prisma);
  const deps = criarM05Deps(prisma);
  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  // AS DUAS CONTAS BANCÁRIAS, NA MESMA CONTA CONTÁBIL — o caso do plano oficial.
  await prisma.contaBancaria.create({ data: { id: "cb-a", codigo: "CC-A", descricao: "Movimento A", fonteId: FONTE, contaContabilId: "c-caixa" } });
  await prisma.contaBancaria.create({ data: { id: "cb-b", codigo: "CC-B", descricao: "Movimento B", fonteId: FONTE, contaContabilId: "c-caixa" } });
  await criarFichaDeTeste(prisma, { id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00" });

  await arrecadar("3000.00", "GUIA-A", "2026-01-05", "CC-A");
  await arrecadar("500.00", "GUIA-B", "2026-01-06", "CC-B");
  const e = await empenhar({ fichaId: FICHA, numero: "1", tipo: "ORDINARIO", valor: "1000.00", data: D("2026-01-02"), credorCpfCnpj: "12345678000195", historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" }), deps);
  const l = await liquidar({ empenhoId: e.empenhoId, numero: "1", valor: "1000.00", data: D("2026-01-08"), responsavelAtesto: "Fulano", historico: "liq", criadoPor: POR }, roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" }), deps);
  await pagar({ liquidacaoId: l.liquidacaoId, numero: "1", valor: "1000.00", data: D("2026-01-10"), contaBancaria: "CC-A", fonteId: FONTE, historico: "pgto", criadoPor: POR }, roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" }), deps);
  await transferirEntreContas(prisma, { contaOrigemId: "cb-a", contaDestinoId: "cb-b", valor: "200.00", data: D("2026-01-12"), codigo: "T1", historico: "Transferência de A para B", criadoPor: POR });
  // o AJUSTE MANUAL na contábil: não é fato de conta bancária nenhuma
  await prisma.$transaction((tx) =>
    lancarNoRazao(tx, {
      numeroControle: "AJ-1", dataTransacao: D("2026-01-15"), historico: "Ajuste manual de caixa", origemTipo: "MANUAL", criadoPor: POR,
      partidas: [
        { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "70.00" },
        { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "70.00" },
      ],
    })
  );
  await importarExtrato(prisma, {
    contaBancariaId: "cb-a",
    importadoPor: POR,
    arquivoOfx: `OFXHEADER:100
<OFX>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<ACCTID>1-1
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260101
<DTEND>20260131
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260105
<TRNAMT>3000.00
<FITID>A1
<MEMO>DEPOSITO
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260110
<TRNAMT>-1000.00
<FITID>A2
<MEMO>PAGTO
</STMTTRN>
<STMTTRN>
<TRNTYPE>OTHER
<DTPOSTED>20260112
<TRNAMT>-200.00
<FITID>A3
<MEMO>TED PARA B
</STMTTRN>
</BANKTRANLIST>
</STMTRS>
</OFX>`,
  });
}, 120_000);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("duas contas bancárias na mesma conta contábil", () => {
  it("c1: a conta A soma SÓ os lançamentos dos seus fatos (+1.800), não a contábil inteira (+2.570) — e fecha", async () => {
    const r = await conciliacaoBancaria(prisma, "cb-a", CORTE);
    expect([r.saldoExtrato, r.saldoContabil, r.diferenca]).toEqual(["1800.00", "1800.00", "0.00"]);
    // a transferência para B entra como SAÍDA de A, dos dois lados (banco e razão)
    expect(r.internoSemVinculo.map((l) => [l.tipoInterno, l.residual])).toEqual([
      ["ARRECADACAO", "3000.00"],
      ["PAGAMENTO", "-1000.00"],
      ["TRANSFERENCIA", "-200.00"],
    ]);
  });

  it("c2: a conta B soma +700 (a arrecadação e a transferência que chegou) — e fecha sem extrato", async () => {
    const r = await conciliacaoBancaria(prisma, "cb-b", CORTE);
    expect([r.saldoExtrato, r.saldoContabil, r.diferenca]).toEqual(["0.00", "700.00", "-700.00"]);
    expect(r.internoSemVinculo.map((l) => [l.tipoInterno, l.residual])).toEqual([
      ["ARRECADACAO", "500.00"],
      ["TRANSFERENCIA", "200.00"],
    ]);
  });

  it("c3: o ajuste manual não vai para conta nenhuma por palpite — sai nomeado nas duas, fora da identidade", async () => {
    const a = await conciliacaoBancaria(prisma, "cb-a", CORTE);
    const b = await conciliacaoBancaria(prisma, "cb-b", CORTE);
    const ajuste = await prisma.lancamentoContabil.findFirstOrThrow({ where: { numeroControle: "AJ-1" }, select: { id: true } });
    expect(a.lancamentosSemContaBancaria).toEqual([{ lancamentoId: ajuste.id, valor: "70.00" }]);
    expect(b.lancamentosSemContaBancaria).toEqual([{ lancamentoId: ajuste.id, valor: "70.00" }]);
    // e a soma das duas contas mais o que não é de ninguém é a contábil inteira
    const total = Number(a.saldoContabil) + Number(b.saldoContabil) + 70;
    expect(total.toFixed(2)).toBe("2570.00");
  });

  it("c4: a TRANSFERÊNCIA agora se vincula à linha do extrato (antes o domínio aceitava só três tipos) — e sai das pendências dos dois lados", async () => {
    const linha = await prisma.lancamentoExtrato.findFirstOrThrow({ where: { fitid: "A3" }, select: { id: true } });
    const t = await prisma.transferenciaEntreContas.findFirstOrThrow({ select: { id: true } });
    await vincular(prisma, { lancamentoExtratoId: linha.id, tipoInterno: "TRANSFERENCIA", internoId: t.id, valor: "200.00", criadoPor: POR });
    const r = await conciliacaoBancaria(prisma, "cb-a", CORTE, { conhecimento: new Date() });
    expect(r.noExtratoSemVinculo.some((l) => /TED PARA B/.test(l.descricao))).toBe(false);
    expect(r.internoSemVinculo.some((l) => l.tipoInterno === "TRANSFERENCIA")).toBe(false);
    expect(r.diferenca).toBe("0.00");
  });
});
