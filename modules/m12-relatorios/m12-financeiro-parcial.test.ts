import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import {
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { balancoFinanceiro } from "./balanco-financeiro.js";
import type { BalancoFinanceiro, LinhaFinanceira } from "./dominio-financeiro.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ═══ ANEXO 13 COM O EXERCÍCIO ABERTO (balanço parcial) ═══
 *
 * O teste de ouro (`m12-financeiro.test.ts`) só emite o Anexo 13 de 2026 DEPOIS do encerramento, e
 * o de 2027 aberto não tem empenho nenhum — a regra "empenhado não pago compensa nos ingressos"
 * nunca foi exercida com o exercício aberto. Passava por vacuidade. Com um único empenho em aberto,
 * o parcial recusava contra o razão pelo valor exato a pagar (defeito visto na demonstração:
 * diferença de −19.700,00 = empenhos liquidados e não pagos + empenhos não liquidados).
 *
 * Fixture N=2 em cada balde, conferida contra aritmética MANUAL (literais, nunca o SUM do serviço):
 *
 *   arrecada 10.000                                           caixa +10.000
 *   E1 empenha 6.000 → liquida 6.000 → paga 6.000, retém 500  caixa  −5.500 (depósito +500)
 *   E2 empenha 3.000 → liquida 2.000                          RP P 2.000 + RP NP 1.000
 *   E3 empenha 1.500 → liquida   500                          RP P   500 + RP NP 1.000
 *   ───────────────────────────────────────────────────────────────────────────────
 *   empenhado 10.500 = pago em caixa 5.500 + retido 500 + a pagar 4.500
 *   caixa = 10.000 − 5.500 = 4.500
 *   ingressos = 10.000 + RP P 2.500 + RP NP 2.000 + depósitos 500 = 15.000
 *   dispêndios = 10.500 + saldo 4.500 = 15.000
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-1";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const P_INSS = "2.1.8.8.1.01.00";
const VPD = "3.3.2.1.1.01.00";
const VPA_RECEITA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const CONTAS_CAIXA = [CAIXA];

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: P_INSS, nome: "Consignações INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_RECEITA, nome: "VPA tributária", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: C_DISPONIVEL,
  creditoEmpenhado: C_EMPENHADO,
});
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

const ing = (b: BalancoFinanceiro, rotulo: string): LinhaFinanceira =>
  b.ingressos.find((l) => l.rotulo === rotulo)!;
const dis = (b: BalancoFinanceiro, rotulo: string): LinhaFinanceira =>
  b.dispendios.find((l) => l.rotulo === rotulo)!;

describe("M12 — Balanço Financeiro (Anexo 13) com o exercício ABERTO", () => {
  let parcial: BalancoFinanceiro;
  let encerrado: BalancoFinanceiro;

  beforeAll(async () => {
    await limparBanco(prisma);
    const deps: M05Deps = criarM05Deps(prisma);
    const depsReceita = criarM04Deps(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
    await prisma.unidadeOrcamentaria.create({
      data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
    });
    await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
    await prisma.subfuncao.create({ data: { id: "sub-361", codigo: "361", nome: "EF" } });
    await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
    await prisma.acao.create({
      data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
    });
    await prisma.naturezaDespesa.create({
      data: {
        id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "39", codigoCompleto: "339039", descricao: "Serviços - PJ",
      },
    });
    await prisma.naturezaReceita.create({
      data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" },
    });
    await prisma.fonteRecurso.create({
      data: { id: FONTE, codigo: "500", descricao: "Recursos não vinculados", codigoTce: "500" },
    });
    await prisma.contaBancaria.create({
      data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE },
    });
    const tipoInss = await prisma.tipoConsignacao.create({
      data: {
        codigo: "INSS", descricao: "INSS", criadoPor: POR,
        contaPassivo: { connect: { codigo: P_INSS } },
      },
    });

    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500",
        valor: "10000.00", dataArrecadacao: new Date("2026-05-10T12:00:00Z"),
        numeroReceita: "GUIA-1", criadoPor: POR,
      },
      roteiroArrecadacao({
        disponibilidade: CAIXA, variacaoAumentativa: VPA_RECEITA,
        receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
      }),
      depsReceita
    );

    await criarFichaDeTeste(prisma, {
      id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01",
      unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361",
      programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd",
      fonteId: FONTE, valorDotado: "20000.00",
    });

    const empenho = (numero: string, valor: string) =>
      empenhar(
        {
          fichaId: FICHA, numero, tipo: "ORDINARIO", valor,
          data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
          historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
          criadoPor: POR,
        },
        R_EMPENHO,
        deps
      );
    const liquidacao = (empenhoId: string, numero: string, valor: string) =>
      liquidar(
        {
          empenhoId, numero, valor,
          data: new Date("2026-06-01T12:00:00Z"), responsavelAtesto: "Fulano",
          historico: "liquidação", criadoPor: POR,
        },
        R_LIQUIDACAO,
        deps
      );

    // E1 — quitado, com retenção.
    const e1 = await empenho("NE-1", "6000.00");
    const l1 = await liquidacao(e1.empenhoId, "NL-1", "6000.00");
    await pagar(
      {
        liquidacaoId: l1.liquidacaoId, numero: "NP-1", valor: "6000.00",
        data: new Date("2026-09-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps,
      {
        contaDisponibilidade: CAIXA,
        retencoes: [
          {
            tipoConsignacaoId: tipoInss.id, credorConsignatario: "INSS",
            valor: "500.00", contaConsignacaoAPagar: P_INSS,
          },
        ],
      }
    );

    // E2 e E3 — em aberto, cada um com parte processada e parte não processada.
    const e2 = await empenho("NE-2", "3000.00");
    await liquidacao(e2.empenhoId, "NL-2", "2000.00");
    const e3 = await empenho("NE-3", "1500.00");
    await liquidacao(e3.empenhoId, "NL-3", "500.00");

    parcial = await balancoFinanceiro(prisma, 2026, CONTAS_CAIXA);

    // A PROPRIEDADE: o que o parcial computa como RP do exercício é exatamente o que o
    // encerramento inscreve. Encerra e emite de novo.
    await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    encerrado = await balancoFinanceiro(prisma, 2026, CONTAS_CAIXA);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("o parcial SAI (não recusa) e fecha contra o caixa do razão", () => {
    expect(parcial.parcial).toBe(true);
    expect(parcial.saldoEmEspecie.apuradoPelasPartidas).toBe("4500.00");
    expect(parcial.saldoEmEspecie.seguinte).toBe("4500.00");
    expect(parcial.totalIngressos).toBe("15000.00");
    expect(parcial.totalDispendios).toBe("15000.00");
  });

  it("o empenhado não pago compensa nos ingressos, separado em processado e não processado", () => {
    expect(dis(parcial, "DESPESAS ORÇAMENTÁRIAS").valor).toBe("10500.00");
    // E2 2.000 + E3 500 (liquidado − pago)
    expect(ing(parcial, "Inscrição de Restos a Pagar Processados").valor).toBe("2500.00");
    // E2 1.000 + E3 1.000 (empenhado − liquidado)
    expect(ing(parcial, "Inscrição de Restos a Pagar Não Processados").valor).toBe("2000.00");
    expect(ing(parcial, "Depósitos Restituíveis e Valores Vinculados").valor).toBe("500.00");
    expect(ing(parcial, "RECEBIMENTOS EXTRAORÇAMENTÁRIOS").valor).toBe("5000.00");
  });

  it("o parcial e o encerrado publicam os MESMOS restos — a apuração é a do encerramento", () => {
    expect(encerrado.parcial).toBe(false);
    for (const rotulo of [
      "Inscrição de Restos a Pagar Processados",
      "Inscrição de Restos a Pagar Não Processados",
    ]) {
      expect(ing(encerrado, rotulo).valor).toBe(ing(parcial, rotulo).valor);
    }
    expect(encerrado.saldoEmEspecie.seguinte).toBe("4500.00");
    expect(encerrado.totalIngressos).toBe("15000.00");
  });
});
