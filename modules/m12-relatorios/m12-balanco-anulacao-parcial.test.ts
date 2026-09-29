import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import {
  anularEmpenhoParcial,
  anularLiquidacaoParcial,
  anularPagamentoParcial,
  estornarAnulacaoParcial,
} from "../m05-despesa/anulacao-parcial.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { balancoOrcamentario, lerDespesas } from "./balanco-orcamentario.js";
import { demonstracaoFluxosDeCaixa } from "./dfc.js";

/**
 * ═══ A ANULAÇÃO PARCIAL NO ANEXO 12 — caracterização do defeito e régua da correção ═══
 *
 * A anulação parcial (TR 5.35) é uma LINHA NOVA na mesma tabela do fato que reduz, com
 * `anulacaoParcialDeId` apontando para ele e `estornoDeId` nulo. Um leitor que só conhece o
 * `estornoDeId` a enxerga como um fato ORIGINAL VIVO e a SOMA — a coluna cresce pelo valor que
 * deveria ter saído. `packages/estornaveis` é a régua: o original fica, a parcial viva subtrai.
 *
 * ⚠️ N=2 PARCIAIS SOBRE O MESMO FATO, nas duas colunas. Com uma parcial só, uma leitura que
 * subtraísse "a última parcial" (e não a soma delas) passaria por vacuidade.
 *
 * ⚠️ E UMA PARCIAL ESTORNADA, que volta a não subtrair nada. Sem ela, uma leitura que
 * subtraísse TODA parcial (viva ou não) também passaria.
 *
 * Os literais são aritmética manual — nenhum é recalculado com a query do serviço:
 *
 *   ficha 10.000 · empenha 9.000
 *   liquida 7.000 → parciais de 1.000 e 400 (vivas) → liquidado 5.600
 *   paga 3.000    → parciais de 500 e 300 (vivas) + parcial de 100 ESTORNADA → pago 2.200
 *   empenho       → parciais de 800 e 200 → empenhado 8.000 (coluna lida do MovimentoDotacao)
 *
 * Com o defeito, liquidado sairia 7.000 + 1.000 + 400 = 8.400 e pago 3.000 + 500 + 300 = 3.800
 * (a parcial estornada some junto com o estorno que a nega; as vivas SOMAM em vez de subtrair).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const FICHA = "ficha-ap";
const FONTE = "fnt-500";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

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

const MOTIVO = "glosa parcial registrada pela fiscalização do contrato";

describe("M12 — Anexo 12: anulação parcial de liquidação e de pagamento (N=2)", () => {
  beforeAll(async () => {
    await limparBanco(prisma);
    const deps: M05Deps = criarM05Deps(prisma);

    await prisma.contaPcasp.createMany({
      data: [
        { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
        { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
        { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
        { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      ],
    });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
    });
    await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
    await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
    await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
    await prisma.naturezaDespesa.create({
      data: {
        id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39",
        codigoCompleto: "339039", descricao: "Serviços",
      },
    });
    await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
    await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE } });

    await criarFichaDeTeste(prisma, {
      id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
      funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "10000.00",
    });

    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "9000.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000195",
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "7000.00",
        data: new Date("2026-03-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    const p = await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "3000.00",
        data: new Date("2026-04-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    // Pagamento: duas parciais vivas e uma estornada.
    for (const [n, valor] of [["NP-1-AP1", "500.00"], ["NP-1-AP2", "300.00"]] as const) {
      await anularPagamentoParcial(
        { originalId: p.pagamentoId, numero: n, valor, data: new Date("2026-05-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
        deps
      );
    }
    const ap3 = await anularPagamentoParcial(
      { originalId: p.pagamentoId, numero: "NP-1-AP3", valor: "100.00", data: new Date("2026-05-02T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
      deps
    );
    await estornarAnulacaoParcial(
      { nivel: "PAGAMENTO", anulacaoId: ap3.anulacaoId, numero: "NP-1-AP3-E", data: new Date("2026-05-03T12:00:00Z"), motivo: "anulação registrada em duplicidade", criadoPor: POR },
      deps
    );

    // Liquidação: duas parciais vivas (saldo não pago = 7.000 − 2.200 = 4.800).
    for (const [n, valor] of [["NL-1-AP1", "1000.00"], ["NL-1-AP2", "400.00"]] as const) {
      await anularLiquidacaoParcial(
        { originalId: l.liquidacaoId, numero: n, valor, data: new Date("2026-06-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
        deps
      );
    }

    // Empenho: duas parciais (saldo a liquidar = 9.000 − 5.600 = 3.400).
    for (const [n, valor] of [["NE-1-AP1", "800.00"], ["NE-1-AP2", "200.00"]] as const) {
      await anularEmpenhoParcial(
        { originalId: e.empenhoId, numero: n, valor, data: new Date("2026-07-01T12:00:00Z"), motivo: MOTIVO, criadoPor: POR },
        deps
      );
    }
  }, 180_000);

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("sanidade do cenário: as parciais existem como linhas próprias, com anulacaoParcialDeId", async () => {
    expect(await prisma.liquidacao.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(2);
    expect(await prisma.pagamento.count({ where: { anulacaoParcialDeId: { not: null } } })).toBe(3);
  });

  it("lerDespesas: liquidado 5.600 e pago 2.200 — as parciais vivas SUBTRAEM, a estornada não", async () => {
    const [f] = await lerDespesas(prisma, 2026, null);
    expect(f).toBeDefined();
    expect(f!.empenhadas.toFixed(2)).toBe("8000.00");
    expect(f!.liquidadas.toFixed(2)).toBe("5600.00");
    expect(f!.pagas.toFixed(2)).toBe("2200.00");
  });

  it("Anexo 12: as colunas de despesa liquidada e paga refletem as parciais", async () => {
    const b = await balancoOrcamentario(prisma, 2026);
    const total = b.despesas.find((l) => l.nota === "XV")!;
    expect(total.liquidadas).toBe("5600.00");
    expect(total.pagas).toBe("2200.00");
  });

  it("DFC: a despesa paga lida do Anexo 12 também é a líquida das parciais", async () => {
    // A DFC confere o caixa final contra as partidas da conta de caixa: com o defeito, o
    // desembolso declarado (3.800) e o caixa apurado pelas partidas (−2.200) divergiriam.
    const d = await demonstracaoFluxosDeCaixa(prisma, 2026, [CAIXA]);
    const desembolsos = d.fluxos.flatMap((x) => x.desembolsos);
    expect(desembolsos.find((l) => l.rotulo === "Outras Despesas Correntes")?.valor).toBe("2200.00");
    expect(d.caixaFinal).toBe(d.caixaApuradoPelasPartidas);
  });
});
