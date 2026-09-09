import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { origemDaNatureza } from "../m04-receita/natureza.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { anexo11 } from "./rreo-anexo11.js";
import { anexo1 } from "./rreo-anexo1.js";

/**
 * RREO — ANEXO 11: ALIENAÇÃO DE ATIVOS. LRF art. 44 e 53 §1º III.
 *
 * ═══ CENÁRIO OURO (bim 1 de 2026) ═══
 * RECEITAS (jan): móveis 50.000 (prev 60.000) · imóveis 100.000 · rendimentos 5.000 → (I) 155.000
 * APLICAÇÃO (fonte 500 = alienação): grupo 4 (investimentos), dotação 200.000, empenha 80.000,
 *   liquida 60.000, paga 40.000 → h = 200.000 − 80.000 = 120.000
 * SALDO j = i(0) + 155.000 − (40.000 + 0) = 115.000
 *
 * R1 c=a−b · h=d−e · j=i+b−(g+RPpagos)
 * R2 (móveis+imóveis+intangíveis) == origem de alienação (22) no Anexo 1
 * R3 a natureza que o Anexo 11 conta como alienação tem origem ALIENACAO_DE_BENS — a MESMA que o
 *    M10 (TR 4.65) exige para sustentar a baixa de um bem (uma classificação, dois consumidores)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "patrimonio@cg.pb.gov.br";
const FONTE = "500";

const N_MOVEIS = "22110001"; // categoria 2, origem 22 (alienação), tipo 1
const N_IMOVEIS = "22120001";
const N_RENDIMENTOS = "13210001"; // categoria 1, origem 13 (receita patrimonial)

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: "6.2.2.1.3.04.00", nome: "Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Forn", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-banco", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "RaR", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "RR", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARREC = roteiroArrecadacao({ disponibilidade: "1.1.1.1.2.00.00", variacaoAumentativa: "4.1.1.1.1.00.00", receitaARealizar: "5.2.1.1.1.00.00", receitaRealizada: "6.2.1.1.1.00.00" });
const R_EMP = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQ = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });
const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.2.00.00", creditoLiquidado: "6.2.2.1.3.03.00", creditoPago: "6.2.2.1.3.04.00" });

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Adm", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0001", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "1001", descricao: "A", tipo: "PROJETO" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd-inv", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos" } });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-mov", codigo: N_MOVEIS, descricao: "Alienação de bens móveis" },
      { id: "nr-imo", codigo: N_IMOVEIS, descricao: "Alienação de bens imóveis" },
      { id: "nr-rend", codigo: N_RENDIMENTOS, descricao: "Rendimentos de aplicação" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: FONTE, descricao: "Alienação", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Alienação", fonteId: "fnt-500" } });
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });

  await prisma.deParaReceitaAlienacao.createMany({
    data: [
      { naturezaCodigo: N_MOVEIS, chave: "MOVEIS", criadoPor: "T" },
      { naturezaCodigo: N_IMOVEIS, chave: "IMOVEIS", criadoPor: "T" },
      { naturezaCodigo: N_RENDIMENTOS, chave: "RENDIMENTOS", criadoPor: "T" },
    ],
  });
  await prisma.deParaFonteAlienacao.create({ data: { fonteCodigo: FONTE, criadoPor: "T" } });
}

async function arrecadar(natureza: string, valor: string, guia: string): Promise<void> {
  await registrarArrecadacao({ exercicio: 2026, naturezaReceita: natureza, fonte: FONTE, valor, dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: guia, criadoPor: POR }, R_ARREC, m04);
}
async function prever(naturezaId: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: naturezaId, fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: valor } });
}

async function montarOuro(): Promise<void> {
  await prever("nr-mov", "60000.00");
  await arrecadar(N_MOVEIS, "50000.00", "G1");
  await arrecadar(N_IMOVEIS, "100000.00", "G2");
  await arrecadar(N_RENDIMENTOS, "5000.00", "G3");

  // aplicação: despesa de capital (fonte 500 = alienação)
  await criarFichaDeTeste(prisma, { id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-inv", fonteId: "fnt-500", valorDotado: "200000.00" });
  const e = await empenhar({ fichaId: "ficha-1", numero: "NE-1", tipo: "ORDINARIO", valor: "80000.00", data: new Date("2026-01-15T12:00:00Z"), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMP, deps);
  const l = await liquidar({ empenhoId: e.empenhoId, numero: "NL-1", valor: "60000.00", data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
  await pagar({ liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "40000.00", data: new Date("2026-02-20T12:00:00Z"), contaBancaria: "CC-001", fonteId: "fnt-500", historico: "p", criadoPor: POR }, R_PAG, deps);
}

describe("M12 — RREO Anexo 11 (Alienação de Ativos)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══ t1 — OURO: receitas, aplicação, saldo (R1) ═══
  it("t1: (I)=155.000; aplicação grupo 4 (h=120.000); saldo j=115.000", async () => {
    await montarOuro();
    const a11 = await anexo11(prisma, { exercicio: 2026, bimestre: 1 });

    const mov = a11.receitas.find((r) => r.chave === "MOVEIS")!;
    expect(mov.previsaoAtualizada).toBe("60000.00");
    expect(mov.realizada).toBe("50000.00");
    expect(mov.saldo).toBe("10000.00"); // R1: c = a − b
    expect(a11.receitas.find((r) => r.chave === "IMOVEIS")!.realizada).toBe("100000.00");
    expect(a11.totalReceitas.realizada).toBe("155000.00"); // (I)

    const g4 = a11.aplicacoes.find((l) => l.chave === "4")!;
    expect(g4.dotacaoAtualizada).toBe("200000.00");
    expect(g4.empenhada).toBe("80000.00");
    expect(g4.liquidada).toBe("60000.00");
    expect(g4.paga).toBe("40000.00");
    expect(g4.saldo).toBe("120000.00"); // R1: h = d − e

    expect(a11.saldoAnterior).toBe("0.00"); // (i)
    expect(a11.saldoExercicio).toBe("115000.00"); // R1: j = 0 + 155.000 − (40.000 + 0)
    // mutação: os literais errados NÃO batem.
    expect("115000.01").not.toBe(a11.saldoExercicio);
    expect("120000.01").not.toBe(g4.saldo);
  });

  // ═══ t2 — R2: (I alienação) == recorte origem 22 do Anexo 1 ═══
  it("t2: R2 — móveis+imóveis (origem alienação) == a linha de origem 22 do Anexo 1", async () => {
    await montarOuro();
    const a11 = await anexo11(prisma, { exercicio: 2026, bimestre: 1 });
    const a1 = await anexo1(prisma, { exercicio: 2026, bimestre: 1 });

    const alienacaoA11 = Number(a11.receitas.find((r) => r.chave === "MOVEIS")!.realizada) + Number(a11.receitas.find((r) => r.chave === "IMOVEIS")!.realizada);
    expect(alienacaoA11).toBe(150000); // rendimentos (origem 13) ficam de fora deste recorte
    const origem22 = a1.receitas.find((l) => l.nivel === "origem" && l.codigo === "22")!;
    expect(Number(origem22.ateBimestre)).toBe(150000);
    expect(alienacaoA11).toBe(Number(origem22.ateBimestre)); // R2
  });

  // ═══ t3 — R3: uma classificação, dois consumidores (Anexo 11 e o guard do M10) ═══
  it("t3: R3 — a natureza contada como alienação tem origem ALIENACAO_DE_BENS (a que o M10 exige)", async () => {
    await montarOuro();
    const a11 = await anexo11(prisma, { exercicio: 2026, bimestre: 1 });
    // o Anexo 11 conta os móveis; a MESMA natureza é a que o M10 (TR 4.65) aceita para sustentar a baixa.
    expect(origemDaNatureza(N_MOVEIS)).toBe("ALIENACAO_DE_BENS");
    expect(origemDaNatureza(N_IMOVEIS)).toBe("ALIENACAO_DE_BENS");
    expect(a11.receitas.find((r) => r.chave === "MOVEIS")!.realizada).toBe("50000.00");
  });

  // ═══ t4 — LEITURA PURA (grep) ═══
  it("t4: rreo-anexo11.ts é LEITURA PURA", () => {
    const efetivo = readFileSync(fileURLToPath(new URL("./rreo-anexo11.ts", import.meta.url)), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(efetivo)).toBe(false);
    expect(/\.(aggregate|groupBy)\(|_sum/.test(efetivo)).toBe(false);
  });
});
