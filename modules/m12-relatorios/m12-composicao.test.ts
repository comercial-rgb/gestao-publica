import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularEmpenhoParcial, estornarAnulacaoParcial } from "../m05-despesa/anulacao-parcial.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { roteiroPagamentoRestos } from "../m08-restos-a-pagar/dominio.js";
import { pagarRestosAPagar } from "../m08-restos-a-pagar/restos.js";
import { balancoFinanceiro } from "./balanco-financeiro.js";
import { balancoOrcamentario } from "./balanco-orcamentario.js";
import { demonstracaoFluxosDeCaixa } from "./dfc.js";
import { composicaoDaLinha, type Composicao, type LinhaPedida } from "./composicao.js";
import { lerComposicao, linhaDaDfc, linhaPedidaDaUrl } from "../../lib/portas/composicao.js";
import { csvDasTabelas, tabelasDaComposicao, tabelasDoBalancoOrcamentario } from "../../lib/relatorios/tabelas-dos-demonstrativos.js";

/**
 * ═══ V33 — A COMPOSIÇÃO DE CADA LINHA SOMA A PRÓPRIA LINHA ═══
 *
 * Duas afirmações, e as duas são necessárias:
 *
 * 1. PROPRIEDADE: para TODA linha com documentos do Anexo 13, do Anexo 12 e da DFC, nos dois
 *    exercícios, a soma da composição é o valor que o motor emitiu. Não se enumera linha: percorre-se
 *    o que o motor devolveu. É o que acusa um filtro da composição que se afaste do motor.
 *
 * 2. ARITMÉTICA MANUAL: como a composição e o motor leem as MESMAS linhas, um erro de sinal no
 *    leitor comum mudaria os dois juntos e (1) continuaria verde. Os literais abaixo acusam isso.
 *
 * ⚠️ N=2 em cada eixo: duas fontes, duas naturezas de receita de origens diferentes, duas fichas de
 * categorias diferentes, uma guia anulada, um empenho anulado inteiro, uma parcial viva e uma
 * parcial ESTORNADA (o estorno aponta para a parcial, que aponta para o original — a composição
 * tem de subir dois níveis para achar o empenho).
 *
 *   2026  origem 1.1: 8.000 (500) · origem 1.7: 5.000 (540) · origem 1.1: 1.000 (540), anulado
 *         NE-1 339039/500: 9.000 → liquida 7.000 → paga 6.000
 *         NE-2 449039/540: 4.000, parcial −1.000 viva, parcial −300 estornada → 3.000
 *                          → liquida 2.000 → paga 2.000
 *         NE-3 339039/500: 500, anulado inteiro → 0
 *         encerra: RP P 1.000 (NE-1) · RP NP 2.000 (NE-1) · RP NP 1.000 (NE-2)
 *   2027  paga 1.000 do RP processado do NE-1 · origem 1.1: 300 (500)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const F500 = "fnt-500";
const F540 = "fnt-540";
const MOTIVO = "glosa registrada pela fiscalização do contrato";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA_RECEITA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const ROL = [CAIXA];

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_RECEITA, nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: VPA_RECEITA,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD,
  obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO,
  creditoLiquidado: C_LIQUIDADO,
});
const R_PAGAMENTO = roteiroPagamento({
  obrigacaoAPagar: FORNECEDOR,
  disponibilidade: CAIXA,
  creditoLiquidado: C_LIQUIDADO,
  creditoPago: C_PAGO,
});
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: FORNECEDOR, disponibilidade: CAIXA });

const dia = (iso: string): Date => new Date(`${iso}T12:00:00Z`);
const txt = (c: Composicao): string[] => c.totais.map((t) => t.toFixed(2));

/** Toda linha com documentos das três demonstrações, com o valor que o motor emitiu. */
async function linhasDoMotor(exercicio: number): Promise<{ pedida: LinhaPedida; valores: string[]; nome: string }[]> {
  const [bf, bo, dfc] = await Promise.all([
    balancoFinanceiro(prisma, exercicio, ROL),
    balancoOrcamentario(prisma, exercicio),
    demonstracaoFluxosDeCaixa(prisma, exercicio, ROL),
  ]);
  const saida: { pedida: LinhaPedida; valores: string[]; nome: string }[] = [];
  for (const l of bf.ingressos) if (l.nivel === "FONTE") saida.push({ pedida: { tipo: "BF_RECEITA", fonte: l.codigo! }, valores: [l.valor], nome: `BF ingresso ${l.codigo}` });
  for (const l of bf.dispendios) if (l.nivel === "FONTE") saida.push({ pedida: { tipo: "BF_DESPESA", fonte: l.codigo! }, valores: [l.valor], nome: `BF dispêndio ${l.codigo}` });
  for (const l of bo.receitas)
    if (l.codigo !== null && (l.nivel === "CATEGORIA" || l.nivel === "ORIGEM"))
      saida.push({ pedida: { tipo: "BO_RECEITA", codigo: l.codigo }, valores: [l.realizadas], nome: `BO receita ${l.codigo}` });
  for (const l of bo.despesas)
    if (l.codigo !== null && (l.nivel === "CATEGORIA" || l.nivel === "GRUPO"))
      saida.push({ pedida: { tipo: "BO_DESPESA", codigo: l.codigo }, valores: [l.empenhadas, l.liquidadas, l.pagas], nome: `BO despesa ${l.codigo}` });
  for (const f of dfc.fluxos)
    for (const l of [...f.ingressos, ...f.desembolsos]) {
      const pedida = l.composicao === undefined ? null : linhaDaDfc(l.composicao);
      if (pedida !== null) saida.push({ pedida, valores: [l.valor], nome: `DFC ${l.composicao}` });
    }
  return saida;
}

describe("M12 V33 — a composição das linhas do Balanço Financeiro, do Orçamentário e da DFC", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    const deps = criarM05Deps(prisma);
    const depsReceita = criarM04Deps(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
    await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
    await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Administração geral" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0001", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.createMany({
      data: [
        { id: "nd-33", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
        { id: "nd-44", codCategoria: "4", codNatureza: "4", codModalidade: "90", codElemento: "39", codigoCompleto: "449039", descricao: "Investimento" },
      ],
    });
    await prisma.naturezaReceita.createMany({
      data: [
        // Códigos de FIXTURE (sem lastro normativo — ver `depara-impostos.test.ts`): o que o teste usa é só a
        // estrutura do código (categoria = 1º dígito, origem = 2º), que é o que o Anexo 12 e a DFC leem.
        { id: "nr-11", codigo: "11130111", descricao: "Receita de fixture da origem 1.1" },
        { id: "nr-17", codigo: "17210151", descricao: "Receita de fixture da origem 1.7" },
      ],
    });
    await prisma.fonteRecurso.createMany({
      data: [
        { id: F500, codigo: "500", descricao: "Recursos não vinculados", codigoTce: "500" },
        { id: F540, codigo: "540", descricao: "Transferências", codigoTce: "540" },
      ],
    });
    // A conta contábil da conta bancária é o rol de caixa que a PORTA usa (`contasDeDisponibilidade`).
    await prisma.contaBancaria.createMany({
      data: [
        { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: F500, contaContabilId: "c-caixa" },
        { id: "cb2", codigo: "CC-002", descricao: "Transferências", fonteId: F540, contaContabilId: "c-caixa" },
      ],
    });

    // ── 2026: receita ──────────────────────────────────────────────────
    const guia = (numero: string, natureza: string, fonte: string, valor: string, data: string) =>
      registrarArrecadacao(
        { exercicio: 2026, naturezaReceita: natureza, fonte, valor, dataArrecadacao: dia(data), numeroReceita: numero, criadoPor: POR },
        R_ARRECADACAO,
        depsReceita
      );
    await guia("GUIA-1", "11130111", "500", "8000.00", "2026-02-10");
    await guia("GUIA-2", "17210151", "540", "5000.00", "2026-03-10");
    const g3 = await guia("GUIA-3", "11130111", "540", "1000.00", "2026-04-10");
    await anularArrecadacao({ receitaId: g3.receitaId, dataAnulacao: dia("2026-04-20"), numeroReceita: "GUIA-3-A", criadoPor: POR }, depsReceita);

    // ── 2026: despesa ──────────────────────────────────────────────────
    const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca" };
    await criarFichaDeTeste(prisma, { ...base, id: "ficha-33", numero: 1, naturezaDespesaId: "nd-33", fonteId: F500, valorDotado: "20000.00" });
    await criarFichaDeTeste(prisma, { ...base, id: "ficha-44", numero: 2, naturezaDespesaId: "nd-44", fonteId: F540, valorDotado: "20000.00" });

    const empenho = (numero: string, ficha: string, valor: string) =>
      empenhar(
        {
          fichaId: ficha, numero, tipo: "ORDINARIO", valor, data: dia("2026-03-01"), credorCpfCnpj: "12345678000195",
          historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
        },
        R_EMPENHO,
        deps
      );
    const e1 = await empenho("NE-1", "ficha-33", "9000.00");
    const e2 = await empenho("NE-2", "ficha-44", "4000.00");
    const e3 = await empenho("NE-3", "ficha-33", "500.00");

    await anularEmpenho({ empenhoId: e3.empenhoId, numero: "NE-3-A", data: dia("2026-03-05"), historico: MOTIVO, criadoPor: POR }, deps);
    await anularEmpenhoParcial({ originalId: e2.empenhoId, numero: "NE-2-AP1", valor: "1000.00", data: dia("2026-03-10"), motivo: MOTIVO, criadoPor: POR }, deps);
    const ap2 = await anularEmpenhoParcial({ originalId: e2.empenhoId, numero: "NE-2-AP2", valor: "300.00", data: dia("2026-03-11"), motivo: MOTIVO, criadoPor: POR }, deps);
    await estornarAnulacaoParcial(
      { nivel: "EMPENHO", anulacaoId: ap2.anulacaoId, numero: "NE-2-AP2-E", data: dia("2026-03-12"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );

    const l1 = await liquidar(
      { empenhoId: e1.empenhoId, numero: "NL-1", valor: "7000.00", data: dia("2026-05-01"), responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      { liquidacaoId: l1.liquidacaoId, numero: "NP-1", valor: "6000.00", data: dia("2026-06-01"), contaBancaria: "CC-001", fonteId: F500, historico: "pagamento", criadoPor: POR },
      R_PAGAMENTO,
      deps
    );
    const l2 = await liquidar(
      { empenhoId: e2.empenhoId, numero: "NL-2", valor: "2000.00", data: dia("2026-05-02"), responsavelAtesto: "Fulano", historico: "liquidação", criadoPor: POR },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      { liquidacaoId: l2.liquidacaoId, numero: "NP-2", valor: "2000.00", data: dia("2026-06-02"), contaBancaria: "CC-002", fonteId: F540, historico: "pagamento", criadoPor: POR },
      R_PAGAMENTO,
      deps
    );

    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });

    // ── 2027 ───────────────────────────────────────────────────────────
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });
    await pagarRestosAPagar(
      prisma,
      { liquidacaoId: l1.liquidacaoId, numero: "NP-RP-1", valor: "1000.00", data: dia("2027-02-10"), contaBancaria: "CC-001", fonteId: F500, historico: "pagamento de RP", criadoPor: POR },
      R_PAG_RP
    );
    await registrarArrecadacao(
      { exercicio: 2027, naturezaReceita: "11130111", fonte: "500", valor: "300.00", dataArrecadacao: dia("2027-03-10"), numeroReceita: "GUIA-27", criadoPor: POR },
      R_ARRECADACAO,
      depsReceita
    );
  }, 240_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("propriedade: em toda linha com documentos, nos dois exercícios, a composição soma o que o motor emitiu", async () => {
    for (const exercicio of [2026, 2027]) {
      const linhas = await linhasDoMotor(exercicio);
      // Sem linhas a propriedade passaria por vacuidade.
      expect(linhas.filter((l) => l.pedida.tipo === "BF_RECEITA").length, `${exercicio} BF ingressos`).toBeGreaterThanOrEqual(exercicio === 2026 ? 2 : 1);
      expect(linhas.some((l) => l.pedida.tipo === "DFC_DESPESA")).toBe(true);
      for (const l of linhas) {
        const c = await composicaoDaLinha(prisma, exercicio, l.pedida);
        expect(txt(c), `${exercicio} ${l.nome}`).toEqual(l.valores.map((v) => toMoney(v).toFixed(2)));
      }
    }
  });

  it("aritmética manual: a fonte 540 recebe 5.000 (a guia anulada entra e sai) e os três documentos aparecem", async () => {
    const c = await composicaoDaLinha(prisma, 2026, { tipo: "BF_RECEITA", fonte: "540" });
    expect(txt(c)).toEqual(["5000.00"]);
    expect(c.documentos.map((d) => `${d.documento} ${d.descricao} ${d.valores[0]!.toFixed(2)}`)).toEqual([
      "GUIA-2 Arrecadação 5000.00",
      "GUIA-3 Arrecadação 1000.00",
      "GUIA-3-A Anulação de receita -1000.00",
    ]);
    expect(c.documentos.every((d) => d.destino?.tipo === "ARRECADACAO")).toBe(true);
  });

  it("aritmética manual: a origem 1.1 realiza 8.000 e a 1.7 5.000 no Anexo 12", async () => {
    expect(txt(await composicaoDaLinha(prisma, 2026, { tipo: "BO_RECEITA", codigo: "1.1" }))).toEqual(["8000.00"]);
    expect(txt(await composicaoDaLinha(prisma, 2026, { tipo: "BO_RECEITA", codigo: "1.7" }))).toEqual(["5000.00"]);
    expect(txt(await composicaoDaLinha(prisma, 2026, { tipo: "BO_RECEITA", codigo: "1" }))).toEqual(["13000.00"]);
  });

  it("aritmética manual: o grupo 4.4 empenha 3.000 (parcial viva desconta, a estornada não), liquida e paga 2.000, num empenho só", async () => {
    const c = await composicaoDaLinha(prisma, 2026, { tipo: "BO_DESPESA", codigo: "4.4" });
    expect(txt(c)).toEqual(["3000.00", "2000.00", "2000.00"]);
    // Os quatro movimentos do NE-2 (original, duas parciais, estorno de uma) se juntam no empenho original.
    expect(c.documentos.map((d) => d.documento)).toEqual(["NE-2"]);
    expect(c.documentos[0]!.destino?.tipo).toBe("EMPENHO");
  });

  it("aritmética manual: a fonte 500 dispende 9.000 empenhados; o NE-3 anulado aparece zerado, e não some", async () => {
    const c = await composicaoDaLinha(prisma, 2026, { tipo: "BF_DESPESA", fonte: "500" });
    expect(txt(c)).toEqual(["9000.00"]);
    expect(c.documentos.map((d) => `${d.documento} ${d.valores[0]!.toFixed(2)}`)).toEqual(["NE-1 9000.00", "NE-3 0.00"]);
  });

  it("aritmética manual: em 2027 a DFC desembolsa 1.000 no grupo 3 — só o resto a pagar pago, com o empenho de origem", async () => {
    const c = await composicaoDaLinha(prisma, 2027, { tipo: "DFC_DESPESA", grupo: "3" });
    expect(txt(c)).toEqual(["1000.00"]);
    expect(c.documentos.map((d) => `${d.documento} ${d.descricao.startsWith("Restos a pagar pagos") ? "RP" : "EX"}`)).toEqual(["NE-1 RP"]);
  });

  it("a porta confere a composição contra o motor, e a URL só aceita linhas da forma conhecida", async () => {
    const pedida = linhaPedidaDaUrl("bo-despesa:3.3");
    expect(pedida).toEqual({ tipo: "BO_DESPESA", codigo: "3.3" });
    const tela = await lerComposicao({ exercicio: 2026, linha: pedida! });
    expect(tela.confere).toBe(true);
    expect(tela.linha !== null && !("indisponivel" in tela.linha) ? tela.linha.valores : null).toEqual(["9000.00", "7000.00", "6000.00"]);
    expect(tela.documentos.find((d) => d.documento === "NE-1")?.href).toMatch(/^\/despesa\/empenhos\//);

    for (const ruim of ["bo-despesa:3.3;drop", "xx:1", "bf-receita:abc", "dfc-despesa:33", "bo-receita:1.12", undefined]) {
      expect(linhaPedidaDaUrl(ruim), String(ruim)).toBeNull();
    }
  });

  it("V34 — o PDF e o CSV saem da mesma apuração: a linha 3.3 do Balanço Orçamentário e a composição dela, nos dois", async () => {
    // A tela mostra 9.000 / 7.000 / 6.000 na linha 3.3 (caso acima); o papel e a planilha trazem os mesmos números.
    const t = tabelasDoBalancoOrcamentario(await balancoOrcamentario(prisma, 2026));
    const linha33 = t.secoes[1]!.linhas.find((l) => l[1] === "3.3");
    expect(linha33?.slice(6, 9)).toEqual(["9.000,00", "7.000,00", "6.000,00"]);
    const csvBo = csvDasTabelas(t);
    expect(csvBo).toContain("9.000,00");

    const tela = await lerComposicao({ exercicio: 2026, linha: { tipo: "BO_DESPESA", codigo: "3.3" } });
    const c = tabelasDaComposicao(tela, 2026);
    const total = c.secoes[0]!.linhas.at(-1)!;
    expect(total.slice(4)).toEqual(["9.000,00", "7.000,00", "6.000,00"]);
    expect(c.notas[0]).toBe("A soma dos documentos confere com a linha da demonstração.");
    expect(csvDasTabelas(c)).toContain("Total dos documentos");
  });
});
