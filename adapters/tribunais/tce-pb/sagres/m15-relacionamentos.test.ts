import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../../../test/banco.js";
import { criarM05Deps } from "../../../../modules/m05-despesa/adapter-prisma.js";
import { encerrarExercicioComRestos } from "../../../../modules/m08-restos-a-pagar/encerramento.js";
import { roteiroPagamentoRestos } from "../../../../modules/m08-restos-a-pagar/dominio.js";
import { anularPagamentoRestosAPagar, pagarRestosAPagar } from "../../../../modules/m08-restos-a-pagar/restos.js";
import { empenharDe2026, liquidarDe2026, semearM08, FONTE, POR } from "../../../../modules/m08-restos-a-pagar/m08-encerramento.test.js";
import {
  gerarArquivosDeRelacionamentos,
  gerarFornecedores,
  gerarRelacionamentoContaFonte,
  gerarRelacionamentoEmpenhoNatureza,
  gerarRelacionamentoEmpenhoObra,
  gerarRelacionamentoLiquidacaoPagamento,
} from "./gerador.js";

/**
 * V25 — FORNECEDORES E OS RELACIONAMENTOS NO SAGRES (§4.24, §4.35, §4.37, §4.46, §4.58).
 *
 * Os arquivos gerados a partir de fatos gravados pelos serviços, com dois de cada (N=2). As posições dos
 * leiautes contra o HTML oficial estão em `m15-leiaute-oficial.test.ts`, para todos os leiautes.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const UG = "999001";
const CNPJ = "12345678000195";
const OUTRO = "11222333000181";
const RP = "2.1.3.1.1.00.00";
const CAIXA = "1.1.1.1.2.00.00";
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: RP, disponibilidade: CAIXA });
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
const JUNHO = new Date(Date.UTC(2026, 5, 30));

let e11 = "";
let e12 = "";

async function pessoa(documento: string, tipo: "FISICA" | "JURIDICA", nome: string, criadoEm: Date): Promise<void> {
  const p = await prisma.pessoa.upsert({ where: { documento }, create: { documento, tipo, criadoPor: "TESTE" }, update: {}, select: { id: true } });
  await prisma.versaoDePessoa.create({ data: { pessoaId: p.id, nome, criadoEm, criadoPor: "TESTE" } });
}

beforeEach(async () => {
  await semearM08();
  await prisma.contaBancaria.update({ where: { codigo: "CC-001" }, data: { banco: "001", agencia: "1234", digitoAgencia: "0", conta: "5555", digitoConta: "1" } });
  await prisma.contaBancaria.update({ where: { codigo: "CC-002" }, data: { banco: "001", agencia: "1234", digitoAgencia: "0", conta: "7777", digitoConta: "2" } });
  const deps = criarM05Deps(prisma);
  e11 = await empenharDe2026(deps, "11", "1000.00");
  e12 = await empenharDe2026(deps, "12", "600.00");
}, 120000);
afterAll(async () => prisma.$disconnect());

describe("V25 — fornecedores e relacionamentos gerados dos fatos", { timeout: 120000 }, () => {
  it("§4.24 cada conta com a fonte que comporta (N=2); a fonte do FUNDEB em duas contas é recusada nomeando", async () => {
    const l = linhas((await gerarRelacionamentoContaFonte(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: JUNHO })).conteudo);
    expect(l).toHaveLength(2);
    expect(l.every((x) => x.length === 47)).toBe(true);
    expect(l.map((x) => [x.slice(6, 19).trim(), x.slice(29, 32)])).toEqual([["55551", "500"], ["77772", "540"]]);
    expect(l[0]!.slice(28, 29)).toBe("1");
    expect(l[0]!.slice(33, 47)).toBe(CNPJ);
    // o rol da CC-001 passa a comportar 500 e 540: a 540 fica em duas contas.
    await prisma.fonteDaContaBancaria.createMany({ data: [{ contaBancariaId: "cb1", fonteId: FONTE, criadoPor: "TESTE" }, { contaBancariaId: "cb1", fonteId: "fnt-540", criadoPor: "TESTE" }] });
    await expect(gerarRelacionamentoContaFonte(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: JUNHO })).rejects.toThrow(/fonte 540 \(FUNDEB\) está no rol das contas CC-001, CC-002/);
  });

  it("§4.35 o credor do empenho do dia com o nome do cadastro; sem cadastro, a recusa nomeia o credor e o empenho", async () => {
    const dia = new Date(Date.UTC(2026, 5, 1));
    await expect(gerarFornecedores(prisma, { codUnidadeGestora: UG, dia })).rejects.toThrow(/credor 12345678000195 do empenho 11 não tem cadastro de pessoa/);
    await pessoa(CNPJ, "JURIDICA", "Construtora Borborema Ltda", new Date("2026-05-01T12:00:00Z"));
    const l = linhas((await gerarFornecedores(prisma, { codUnidadeGestora: UG, dia })).conteudo);
    expect(l).toHaveLength(1); //                         dois empenhos, um credor: sem duplicidade
    expect(l[0]!).toHaveLength(107);
    expect(l[0]!.slice(6, 20)).toBe(CNPJ);
    expect(l[0]!.slice(20, 100).trim()).toBe("Construtora Borborema Ltda");
    expect(l[0]!.slice(100, 101)).toBe("2");
    expect(l[0]!.slice(101, 107)).toBe("000000");
  });

  it("§4.35 a pessoa credora que muda de nome sai no dia da mudança, com o nome novo; a que não é credora, não (N=2)", async () => {
    await pessoa(CNPJ, "JURIDICA", "Construtora Borborema Ltda", new Date("2026-05-01T12:00:00Z"));
    await pessoa(OUTRO, "JURIDICA", "Empresa Sem Empenho Ltda", new Date("2026-05-01T12:00:00Z"));
    await pessoa(CNPJ, "JURIDICA", "Borborema Engenharia S.A.", new Date("2026-07-10T15:00:00Z"));
    await pessoa(OUTRO, "JURIDICA", "Empresa Sem Empenho S.A.", new Date("2026-07-10T15:00:00Z"));
    const l = linhas((await gerarFornecedores(prisma, { codUnidadeGestora: UG, dia: new Date(Date.UTC(2026, 6, 10)) })).conteudo);
    expect(l).toHaveLength(1);
    expect(l[0]!.slice(20, 100).trim()).toBe("Borborema Engenharia S.A.");
  });

  it("§4.37 e §4.46 os empenhos do mês: todos com a natureza; só o da obra no relacionamento com a obra", async () => {
    await prisma.obra.create({ data: { id: "obra-1", identificador: "00122026", descricao: "Pavimentação", tipoObraServico: "SERVICOS_DIVERSOS_SUJEITOS_A_RETENCAO", criadoPor: "TESTE" } });
    await prisma.empenho.update({ where: { id: e12 }, data: { obraId: "obra-1", categoriaOrdemCronologica: "REALIZACAO_OBRAS" } });
    const n = linhas((await gerarRelacionamentoEmpenhoNatureza(prisma, { codUnidadeGestora: UG, competencia: JUNHO })).conteudo);
    expect(n.map((x) => [x.length, x.slice(15, 22), x.slice(22, 23)])).toEqual([[23, "0000011", "1"], [23, "0000012", "4"]]);
    expect(n[0]!.slice(6, 11)).toBe("01001");
    expect(n[0]!.slice(11, 15)).toBe("2026");
    const o = linhas((await gerarRelacionamentoEmpenhoObra(prisma, { codUnidadeGestora: UG, competencia: JUNHO })).conteudo);
    expect(o).toHaveLength(1);
    expect(o[0]!).toHaveLength(36);
    expect(o[0]!.slice(11, 18)).toBe("0000012");
    expect(o[0]!.slice(18, 24)).toBe(UG);
    expect(o[0]!.slice(24, 32)).toBe("00122026");
    expect(o[0]!.slice(32, 36)).toBe("2026");
    // outro mês: nada.
    expect((await gerarRelacionamentoEmpenhoNatureza(prisma, { codUnidadeGestora: UG, competencia: new Date(Date.UTC(2026, 6, 31)) })).registros).toBe(0);
  });

  it("§4.58 os pagamentos do mês com a liquidação — inclusive os de restos — e sem a linha de anulação", async () => {
    const deps = criarM05Deps(prisma);
    const liq = await liquidarDe2026(deps, e11, "21", "1000.00");
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const pagar = (numero: string, valor: string, d: Date) =>
      pagarRestosAPagar(prisma, { liquidacaoId: liq, numero, valor, data: d, contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento de RP", criadoPor: POR }, R_PAG_RP, { contaDisponibilidade: CAIXA, retencoes: [] });
    const a = await pagar("31", "400.00", new Date("2027-02-10T12:00:00Z"));
    await pagar("32", "300.00", new Date("2027-02-20T12:00:00Z"));
    await pagar("33", "300.00", new Date("2027-03-01T12:00:00Z"));
    await anularPagamentoRestosAPagar(prisma, { pagamentoId: a.pagamentoId, numero: "34", data: new Date("2027-02-25T12:00:00Z"), motivo: "Pagamento em duplicidade ao credor", criadoPor: POR });
    const l = linhas((await gerarRelacionamentoLiquidacaoPagamento(prisma, { codUnidadeGestora: UG, competencia: new Date(Date.UTC(2027, 1, 28)) })).conteudo);
    expect(l.map((x) => [x.length, x.slice(6, 10), x.slice(15, 22), x.slice(22, 29), x.slice(29, 36)])).toEqual([
      [36, "2026", "0000011", "0000021", "0000031"],
      [36, "2026", "0000011", "0000021", "0000032"],
    ]);
  });

  it("o grupo põe a recusa de um arquivo à parte e entrega os outros quatro", async () => {
    const g = await gerarArquivosDeRelacionamentos(prisma, { codUnidadeGestora: UG, cnpjGerenciadora: CNPJ, dia: new Date(Date.UTC(2026, 5, 1)), competencia: JUNHO });
    expect(g.recusas.map((r) => r.arquivo)).toEqual(["Fornecedores"]);
    expect(g.arquivos.map((a) => a.layout.entidade)).toEqual(["RelacionamentoCCorrenteFontePagadora", "RelacionamentoEmpenhoObra", "RelacionamentoEmpenhoNaturezaContratacao", "RelacionamentoLiquidacaoPagamento"]);
  });
});
