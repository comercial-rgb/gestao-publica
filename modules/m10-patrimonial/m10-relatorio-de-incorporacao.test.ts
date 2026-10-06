import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { adquirirBem, estornarMovimentoPatrimonial, saldoAIncorporarDaLiquidacao } from "./patrimonio.js";
import { relatorioDeIncorporacao } from "./relatorio-de-incorporacao.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * V36 — RELATÓRIO DE BENS INCORPORADOS E A INCORPORAR (TR 5.10.1.56). Fixture do m10-patrimonio (contas, classe,
 * bens e roteiro de aquisição), com N=2 liquidações de capital: uma incorporada em parte por DUAS aquisições (uma
 * delas estornada), outra sem incorporação; e uma liquidação corrente, que não entra. O a incorporar de cada linha
 * é conferido contra `saldoAIncorporarDaLiquidacao`, a leitura do teto do guard.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "patrimonio@cg.pb.gov.br";
const FONTE = "fnt-500";
const CLASSE = "cl-veiculos";
const BEM_1 = "bem-1";
const BEM_2 = "bem-2";

// Fixtures do PCASP.
const IMOBILIZADO = "1.2.3.1.1.01.00"; // Bens móveis — veículos
// V28 — a conta que a liquidação do elemento 52 debita (fixture): o bem ainda não tombado.
const A_INCORPORAR = "1.2.3.1.1.99.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPA_INCORP = "4.5.9.1.1.00.00"; // VPA — incorporação de ativos
const VPD_BAIXA = "3.6.1.1.1.00.00"; // VPD — baixa/alienação de ativos
const VPD_CORRENTE = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const CONTAS = [
  { id: "c-a-incorporar", codigo: A_INCORPORAR, nome: "Bens a incorporar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-imob", codigo: IMOBILIZADO, nome: "Veículos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_INCORP, nome: "VPA incorporação", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd-baixa", codigo: VPD_BAIXA, nome: "VPD baixa de ativos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD_CORRENTE, nome: "VPD corrente", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD_CORRENTE, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});

/**
 * V28 — a liquidação de CAPITAL debita o ativo (a conta declarada para o elemento 52), não VPD: é o
 * que torna a incorporação uma reclassificação e não um segundo reconhecimento.
 */
const R_LIQUIDACAO_CAPITAL = roteiroLiquidacao({
  variacaoDiminutiva: A_INCORPORAR, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});

let deps: M05Deps;

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

  // 4.4.90.52 — INVESTIMENTOS (grupo 4): compra bem.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-capital", codCategoria: "4", codNatureza: "4", codModalidade: "90",
      codElemento: "52", codigoCompleto: "449052", descricao: "Equipamentos e material permanente",
    },
  });
  // 3.3.90.39 — OUTRAS DESPESAS CORRENTES (grupo 3): NÃO compra bem.
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-corrente", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços - PJ",
    },
  });

  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", fonteId: FONTE,
    valorDotado: "500000.00",
  };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-capital", numero: 1, naturezaDespesaId: "nd-capital" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-corrente", numero: 2, naturezaDespesaId: "nd-corrente" });

  // ── A CLASSE e os BENS (cadastro = IDENTIDADE, zero valor) ──────────────
  await prisma.classeDeBens.create({
    data: {
      id: CLASSE, codigo: "1.2.3.1.1.01", descricao: "Veículos",
      especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR,
    },
  });
  await prisma.classeDeBens.create({
    data: {
      id: "cl-outra", codigo: "1.2.3.1.1.02", descricao: "Móveis e utensílios",
      especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR,
    },
  });
  await prisma.bemPatrimonial.createMany({
    data: [
      { id: BEM_1, numeroTombamento: "TOMB-0001", descricao: "Ônibus escolar", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
      { id: BEM_2, numeroTombamento: "TOMB-0002", descricao: "Van escolar", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
      { id: "bem-outra-classe", numeroTombamento: "TOMB-0003", descricao: "Armário", classeDeBensId: "cl-outra", dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR },
    ],
  });

  // ── O ROTEIRO — por PARÂMETRO (tabela). Só os tipos usados neste bloco.
  // CUSTO_SUBSEQUENTE fica DE FORA de propósito: é o teste t10.
  await prisma.roteiroPatrimonial.createMany({
    data: [
      // V28 — D imobilizado / C bens a incorporar: a incorporação RECLASSIFICA o que a liquidação
      // pôs no ativo. A obrigação com o fornecedor nasceu uma vez só, na liquidação.
      { tipo: "AQUISICAO", contaDebitoId: "c-imob", contaCreditoId: "c-a-incorporar", criadoPor: POR },
      // D imobilizado / C VPA (o patrimônio aumenta sem contrapartida financeira)
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "DOACAO_RECEBIDA", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      // D VPD / C imobilizado (o bem sai)
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd-baixa", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "DOACAO_REALIZADA", contaDebitoId: "c-vpd-baixa", contaCreditoId: "c-imob", criadoPor: POR },
    ],
  });
}

/** Empenha e liquida na ficha dada. Devolve o id da liquidação. */
async function umaLiquidacao(
  fichaId: string,
  numero: string,
  valor: string,
  roteiro?: ReturnType<typeof roteiroLiquidacao>
): Promise<string> {
  const e = await empenhar(
    {
      fichaId, numero: `NE-${numero}`, tipo: "ORDINARIO", valor,
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000195",
      historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero, valor,
      data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    roteiro ?? (fichaId === "ficha-capital" ? R_LIQUIDACAO_CAPITAL : R_LIQUIDACAO),
    deps
  );
  return l.liquidacaoId;
}

const DATA = new Date("2026-02-15T12:00:00Z");

describe("M10 V36 — relatório de bens incorporados e a incorporar", () => {
  beforeEach(semear, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cenario(): Promise<{ readonly l1: string; readonly l2: string }> {
    const l1 = await umaLiquidacao("ficha-capital", "L1", "150000.00");
    const l2 = await umaLiquidacao("ficha-capital", "L2", "40000.00");
    await umaLiquidacao("ficha-corrente", "L3", "9000.00");
    await adquirirBem(prisma, { classeDeBensId: CLASSE, liquidacaoId: l1, valor: "100000.00", bemId: BEM_1, dataMovimento: DATA, criadoPor: POR });
    const errada = await adquirirBem(prisma, { classeDeBensId: CLASSE, liquidacaoId: l1, valor: "30000.00", bemId: BEM_2, dataMovimento: new Date("2026-03-10T12:00:00Z"), criadoPor: POR });
    await estornarMovimentoPatrimonial(prisma, { movimentoId: errada.movimentoId, dataMovimento: new Date("2026-03-11T12:00:00Z"), motivo: "Bem incorporado com valor errado, refeito.", criadoPor: POR });
    return { l1, l2 };
  }

  it("t1: cada liquidação de capital com liquidado, incorporado e a incorporar iguais ao teto do guard; a corrente fica de fora", async () => {
    const { l1, l2 } = await cenario();
    const r = await relatorioDeIncorporacao(prisma, { exercicio: 2026 });
    expect(r.liquidacoes.map((l) => [l.liquidacaoNumero, l.empenhoNumero, l.liquidado.toFixed(2), l.incorporado.toFixed(2), l.aIncorporar.toFixed(2), l.situacao])).toEqual([
      ["L1", "NE-L1", "150000.00", "100000.00", "50000.00", "INCORPORADA_EM_PARTE"],
      ["L2", "NE-L2", "40000.00", "0.00", "40000.00", "A_INCORPORAR"],
    ]);
    expect(r.liquidacoes[0]?.aIncorporar.toFixed(2)).toBe((await saldoAIncorporarDaLiquidacao(prisma, l1)).toFixed(2));
    expect(r.liquidacoes[1]?.aIncorporar.toFixed(2)).toBe((await saldoAIncorporarDaLiquidacao(prisma, l2)).toFixed(2));
    expect(r.incorporacoes.map((i) => [i.bem, i.valor.toFixed(2), i.conta, i.liquidacaoNumero])).toEqual([["TOMB-0001 — Ônibus escolar", "100000.00", IMOBILIZADO, "L1"]]);
    expect([r.totais.liquidado, r.totais.incorporado, r.totais.aIncorporar].map((v) => v.toFixed(2))).toEqual(["190000.00", "100000.00", "90000.00"]);
  });

  it("t2: os filtros — classe, unidade, período de incorporação — recortam o que dizem recortar", async () => {
    await cenario();
    const outraClasse = await relatorioDeIncorporacao(prisma, { exercicio: 2026, classeDeBensId: "cl-outra" });
    expect(outraClasse.liquidacoes).toEqual([]);
    expect(outraClasse.incorporacoes).toEqual([]);
    const daClasse = await relatorioDeIncorporacao(prisma, { exercicio: 2026, classeDeBensId: CLASSE });
    expect(daClasse.liquidacoes.map((l) => l.liquidacaoNumero)).toEqual(["L1"]);
    const outraUnidade = await relatorioDeIncorporacao(prisma, { exercicio: 2026, unidadeOrcId: "uo-inexistente" });
    expect(outraUnidade.liquidacoes).toEqual([]);
    const depois = await relatorioDeIncorporacao(prisma, { exercicio: 2026, de: new Date("2026-03-01T03:00:00Z") });
    expect(depois.incorporacoes).toEqual([]);
    expect(depois.liquidacoes).toHaveLength(2);
    const outroExercicio = await relatorioDeIncorporacao(prisma, { exercicio: 2025 });
    expect(outroExercicio.liquidacoes).toEqual([]);
  });
});
