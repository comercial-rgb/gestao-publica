import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { CONTA_DIVIDA_FUNDADA, roteiroArrecadacao, roteiroEmpenho } from "../m01-core-contabil/roteiros.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularEmpenhoParcial } from "../m05-despesa/anulacao-parcial.js";
import { empenhar } from "../m05-despesa/servico.js";
import { anexo9 } from "./rreo-anexo9.js";

/**
 * V35 — RREO ANEXO 9 (REGRA DE OURO). Contas à mão, exercício 2026, 6º bimestre.
 *   (I) operação de crédito 21190011: previsto 500.000; arrecadado 300.000 (+ 400.000 no cenário 2)
 *       uma receita corrente (11121101) de 900.000 NÃO entra
 *   Despesas de capital (dotação · empenhada):
 *       449052 equipamentos ..... 400.000 · 250.000
 *       459061 imóveis .......... 50.000  · 10.000
 *       469071 amortização ...... 100.000 · 60.000 com anulação parcial de 10.000 → 50.000
 *       339039 (corrente) ....... 999     · 999   → fora
 *   (II) dotação 550.000 · empenhada 310.000
 *   (III) previsto: 550.000 − 500.000 = 50.000; executado: 310.000 − 300.000 = 10.000 → cumpre
 *   cenário 2: +400.000 de operação de crédito → executado 310.000 − 700.000 = −390.000 → não cumpre
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "orcamento@cg.pb.gov.br";
const D = (iso: string) => new Date(`${iso}T12:00:00Z`);
const R_ARREC = roteiroArrecadacao({ naturezaDaFonte: "ORDINARIOS", disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  await prisma.exercicio.upsert({ where: { ano: 2026 }, update: {}, create: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.orgao.create({ data: { id: "org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo", codigo: "01001", descricao: "Obras", orgaoId: "org" } });
  await prisma.funcao.create({ data: { id: "f15", codigo: "15", nome: "Urbanismo" } });
  await prisma.subfuncao.create({ data: { id: "s451", codigo: "451", nome: "Infraestrutura Urbana" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0015", descricao: "Urbanismo" } });
  await prisma.acao.createMany({ data: ["1001", "1002", "1003", "2001"].map((c) => ({ id: `a${c}`, codigo: c, descricao: `Ação ${c}`, tipo: c.startsWith("1") ? ("PROJETO" as const) : ("ATIVIDADE" as const) })) });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-44", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos e material permanente" },
      { id: "nd-45", codCategoria: "4", codNatureza: "5", codModalidade: "90", codElemento: "61", codigoCompleto: "459061", descricao: "Aquisição de imóveis" },
      { id: "nd-46", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida contratual resgatado" },
      { id: "nd-33", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" } });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-oc", codigo: "21190011", descricao: "Operações de crédito internas - outras" },
      { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" },
    ],
  });
  await prisma.receitaPrevista.create({ data: { exercicio: 2026, naturezaReceitaId: "nr-oc", fonteId: "fnt-500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "500000.00" } });
  const base = { exercicio: 2026, orgaoId: "org", unidadeOrcId: "uo", funcaoId: "f15", subfuncaoId: "s451", programaId: "prg", fonteId: "fnt-500" };
  await criarFichaDeTeste(prisma, { ...base, id: "OB", numero: 1, acaoId: "a1001", naturezaDespesaId: "nd-44", valorDotado: "400000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "IM", numero: 2, acaoId: "a1002", naturezaDespesaId: "nd-45", valorDotado: "50000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "AM", numero: 3, acaoId: "a1003", naturezaDespesaId: "nd-46", valorDotado: "100000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "CO", numero: 4, acaoId: "a2001", naturezaDespesaId: "nd-33", valorDotado: "999.00" });
  // a amortização paga uma dívida cadastrada (o M05 recusa o empenho do grupo 6 sem ela)
  const passivo = await prisma.contaPcasp.findUniqueOrThrow({ where: { codigo: CONTA_DIVIDA_FUNDADA }, select: { id: true } });
  await prisma.dividaConsolidada.create({ data: { id: "dv", identificador: "CTR-1", credorNome: "Banco", credorDocumento: "00000000000191", tipo: "CONTRATUAL", leiAutorizativa: "Lei 1/2025", objeto: "financiamento de obras", contaContabilId: passivo.id, criadoPor: POR } });
}

let g = 0;
async function arrecadar(natureza: string, valor: string, data: string): Promise<void> {
  g += 1;
  await registrarArrecadacao({ exercicio: 2026, naturezaReceita: natureza, fonte: "500", valor, dataArrecadacao: D(data), numeroReceita: `G${String(g)}`, criadoPor: POR }, R_ARREC, criarM04Deps(prisma));
}

async function cenario(): Promise<void> {
  await arrecadar("21190011", "300000.00", "2026-04-10");
  await arrecadar("11121101", "900000.00", "2026-02-10");
  const deps = criarM05Deps(prisma);
  const emp = async (ficha: string, numero: string, valor: string, dividaId?: string) =>
    (await empenhar({ fichaId: ficha, numero, tipo: "ORDINARIO", valor, ...(dividaId !== undefined ? { dividaId } : {}), data: D("2026-05-02"), credorCpfCnpj: "11144477735", historico: "fixture", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, roteiroEmpenho(), deps)).empenhoId;
  await emp("OB", "NE-1", "250000.00");
  await emp("IM", "NE-2", "10000.00");
  const am = await emp("AM", "NE-3", "60000.00", "dv");
  await anularEmpenhoParcial({ originalId: am, numero: "NE-3-AP", valor: "10000.00", data: D("2026-06-02"), motivo: "Parcela renegociada com o credor", criadoPor: POR }, deps);
  await emp("CO", "NE-4", "999.00");
}

describe("RREO Anexo 9 — regra de ouro", () => {
  beforeEach(async () => {
    g = 0;
    await semear();
  });

  it("operações de crédito contra a despesa de capital: só os grupos 4.4, 4.5 e 4.6, líquidos de anulação; cumpre", async () => {
    await cenario();
    const a = await anexo9(prisma, { exercicio: 2026, bimestre: 6 });
    expect(a.operacoesDeCredito).toEqual({ previsaoAtualizada: "500000.00", realizada: "300000.00", saldoNaoRealizado: "200000.00" });
    expect(a.despesasDeCapital.map((l) => [l.chave, l.dotacaoAtualizada, l.empenhada])).toEqual([
      ["INVESTIMENTOS", "400000.00", "250000.00"],
      ["INVERSOES", "50000.00", "10000.00"],
      ["AMORTIZACAO", "100000.00", "50000.00"],
    ]);
    expect(a.despesaDeCapitalLiquida).toMatchObject({ dotacaoAtualizada: "550000.00", empenhada: "310000.00", saldoNaoExecutado: "240000.00" });
    expect(a.resultado).toEqual({ previsto: "50000.00", executado: "10000.00" });
    expect(a.cumpreRegraDeOuro).toBe(true);
  });

  it("operação de crédito acima da despesa de capital: o resultado é negativo e a regra não é cumprida", async () => {
    await cenario();
    await arrecadar("21190011", "400000.00", "2026-06-10");
    const a = await anexo9(prisma, { exercicio: 2026, bimestre: 6 });
    expect(a.operacoesDeCredito.realizada).toBe("700000.00");
    expect(a.resultado.executado).toBe("-390000.00");
    expect(a.cumpreRegraDeOuro).toBe(false);
  });
});
