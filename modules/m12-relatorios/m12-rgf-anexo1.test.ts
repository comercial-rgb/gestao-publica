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
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { rgfAnexo1, type Anexo1Rgf, type PoderRgf } from "./rgf-anexo1.js";
import { anexo3 } from "./rreo-anexo3.js";

/**
 * RGF — ANEXO 1: DESPESA COM PESSOAL. LRF art. 55 I "a" · art. 20.
 *
 * ═══ CENÁRIO OURO (quadrimestre 1 de 2026 → janela mai/2025 a abr/2026) ═══
 * RCL: receita corrente 1.000.000 (jan/2026) → RCL (IV) = 1.000.000; sem emendas/ACS → RCL AJ = 1.000.000
 * EXECUTIVO (órgão 02): ativo 400.000 (elem 11) + sentença atual 20.000 (empenho 2026, na janela) +
 *   sentença anterior 30.000 (empenho jan/2025, FORA da janela) = ativo 450.000; inativo 100.000
 *   (elem 01); terceirização 50.000 (elem 34) → BRUTA (I) = 600.000
 *   NÃO COMPUTADAS (II): só a sentença de período anterior = 30.000 → DTP (III) = 570.000
 *   % = 570.000 / 1.000.000 = 57,00% > 54% → ACIMA do prudencial
 * LEGISLATIVO (órgão 01): ativo 40.000 → DTP 40.000 · % = 4,00% < alerta (5,4%) → ABAIXO
 * CONSOLIDADO DTP = 610.000
 *
 * R1 III=I−II · VII=IV−V−VI−ACS · % HALF_EVEN
 * R2 IV == linha III do Anexo 3 (bimestre 2, mesma janela)
 * R3 sentença com empenho DENTRO da janela conta em I e NÃO deduz; empenho anterior deduz em II
 * R4 Σ DTP poderes == consolidado; limites 54 (Exec) / 6 (Legis)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "controle.interno@cg.pb.gov.br";
const FONTE = "500";
const N_CORRENTE = "11130111";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
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

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;
let seq = 0;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);
  seq = 0;

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.createMany({ data: [{ id: "org-01", codigo: "01", nome: "Câmara" }, { id: "org-02", codigo: "02", nome: "Prefeitura" }] });
  await prisma.unidadeOrcamentaria.createMany({ data: [{ id: "uo-01", codigo: "01001", descricao: "Câmara", orgaoId: "org-01" }, { id: "uo-02", codigo: "02001", descricao: "Prefeitura", orgaoId: "org-02" }] });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0001", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-ativo", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "11", codigoCompleto: "319011", descricao: "Vencimentos" },
      { id: "nd-inativo", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "01", codigoCompleto: "319001", descricao: "Aposentadorias" },
      { id: "nd-terc", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "34", codigoCompleto: "339034", descricao: "Terceirização" },
      { id: "nd-sent", codCategoria: "3", codNatureza: "1", codModalidade: "90", codElemento: "91", codigoCompleto: "319091", descricao: "Sentenças (pessoal)" },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr-c", codigo: N_CORRENTE, descricao: "Imposto corrente" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: FONTE, descricao: "Livre", codigoTce: "500" } });
  for (const ano of [2025, 2026]) await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  await prisma.deParaOrgaoPoder.createMany({ data: [{ orgaoCodigo: "01", poder: "LEGISLATIVO", criadoPor: "T" }, { orgaoCodigo: "02", poder: "EXECUTIVO", criadoPor: "T" }] });
}

async function despesaPessoal(ano: number, orgaoId: string, uoId: string, ndId: string, valor: string, dataEmp: string, dataLiq: string): Promise<void> {
  const fichaId = `ficha-${++seq}`;
  await criarFichaDeTeste(prisma, { id: fichaId, exercicio: ano, numero: seq, orgaoId, unidadeOrcId: uoId, funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca", naturezaDespesaId: ndId, fonteId: "fnt-500", valorDotado: "1000000.00" });
  const e = await empenhar({ fichaId, numero: `NE-${seq}`, tipo: "ORDINARIO", valor, data: new Date(dataEmp), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMP, deps);
  await liquidar({ empenhoId: e.empenhoId, numero: `NL-${seq}`, valor, data: new Date(dataLiq), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQ, deps);
}

async function montarOuro(): Promise<void> {
  await registrarArrecadacao({ exercicio: 2026, naturezaReceita: N_CORRENTE, fonte: FONTE, valor: "1000000.00", dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: "G1", criadoPor: POR }, R_ARREC, m04);

  // EXECUTIVO (org-02)
  await despesaPessoal(2026, "org-02", "uo-02", "nd-ativo", "400000.00", "2026-01-15T12:00:00Z", "2026-02-10T12:00:00Z");
  await despesaPessoal(2026, "org-02", "uo-02", "nd-inativo", "100000.00", "2026-01-15T12:00:00Z", "2026-02-10T12:00:00Z");
  await despesaPessoal(2026, "org-02", "uo-02", "nd-terc", "50000.00", "2026-01-15T12:00:00Z", "2026-02-10T12:00:00Z");
  await despesaPessoal(2026, "org-02", "uo-02", "nd-sent", "20000.00", "2026-01-15T12:00:00Z", "2026-02-10T12:00:00Z"); // sentença atual (empenho na janela)
  await despesaPessoal(2025, "org-02", "uo-02", "nd-sent", "30000.00", "2025-01-15T12:00:00Z", "2025-06-10T12:00:00Z"); // sentença anterior (empenho jan/2025 < mai/2025)

  // LEGISLATIVO (org-01)
  await despesaPessoal(2026, "org-01", "uo-01", "nd-ativo", "40000.00", "2026-01-15T12:00:00Z", "2026-02-10T12:00:00Z");
}

const achaPoder = (a: Anexo1Rgf, poder: string): PoderRgf => a.poderes.find((p) => p.poder === poder)!;

describe("M12 — RGF Anexo 1 (Despesa com Pessoal)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: RCL AJ 1.000.000; Exec DTP 570.000 (57%, acima); Legis 40.000 (4%, abaixo) — R1", async () => {
    await montarOuro();
    const rgf = await rgfAnexo1(prisma, { exercicio: 2026, quadrimestre: 1 });

    expect(rgf.rcl).toBe("1000000.00"); // IV
    expect(rgf.rclAjustada).toBe("1000000.00"); // VII

    const exec = achaPoder(rgf, "EXECUTIVO");
    expect(exec.despesaBruta.total).toBe("600000.00"); // I
    expect(exec.totalNaoComputadas).toBe("30000.00"); // II
    expect(exec.dtp).toBe("570000.00"); // III = I − II (R1)
    expect(exec.percentDtp).toBe("57.00");
    expect(exec.limiteMaximo).toBe("54.00");
    expect(exec.situacao).toBe("acima");

    const legis = achaPoder(rgf, "LEGISLATIVO");
    expect(legis.dtp).toBe("40000.00");
    expect(legis.percentDtp).toBe("4.00");
    expect(legis.limiteMaximo).toBe("6.00");
    expect(legis.situacao).toBe("abaixo");

    expect("570000.01").not.toBe(exec.dtp); // mutação
  });

  it("t2: R2 — IV == linha III do Anexo 3 (bimestre 2, mesma janela)", async () => {
    await montarOuro();
    const rgf = await rgfAnexo1(prisma, { exercicio: 2026, quadrimestre: 1 });
    const a3 = await anexo3(prisma, { exercicio: 2026, bimestre: 2 });
    expect(rgf.rcl).toBe(a3.rcl.total12m); // R2
    expect(a3.rcl.total12m).toBe("1000000.00");
  });

  it("t3: R3 — sentença com empenho na janela conta em I e NÃO deduz; empenho anterior deduz", async () => {
    await montarOuro();
    const exec = achaPoder(await rgfAnexo1(prisma, { exercicio: 2026, quadrimestre: 1 }), "EXECUTIVO");
    // as duas sentenças (20.000 atual + 30.000 anterior) estão na bruta (ativo); só a anterior deduz.
    expect(exec.despesaBruta.total).toBe("600000.00"); // inclui as duas sentenças
    const sentAnt = exec.naoComputadas.find((n) => n.chave === "SENTENCAS_ANT")!;
    expect(sentAnt.valor).toBe("30000.00"); // só a de período anterior (empenho jan/2025)
  });

  it("t4: R4 — Σ DTP dos poderes == consolidado; limites 54/6 no poder certo", async () => {
    await montarOuro();
    const rgf = await rgfAnexo1(prisma, { exercicio: 2026, quadrimestre: 1 });
    const soma = Number(achaPoder(rgf, "EXECUTIVO").dtp) + Number(achaPoder(rgf, "LEGISLATIVO").dtp);
    expect(soma).toBe(610000);
    expect(rgf.consolidado.dtp).toBe("610000.00"); // R4
    expect(achaPoder(rgf, "EXECUTIVO").limiteMaximo).toBe("54.00");
    expect(achaPoder(rgf, "LEGISLATIVO").limiteMaximo).toBe("6.00");
  });

  it("t5: rgf-anexo1.ts é LEITURA PURA", () => {
    const efetivo = readFileSync(fileURLToPath(new URL("./rgf-anexo1.ts", import.meta.url)), "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    expect(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(efetivo)).toBe(false);
    expect(/\.(aggregate|groupBy)\(|_sum/.test(efetivo)).toBe(false);
  });
});
