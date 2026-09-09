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
import {
  roteiroCancelamentoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import {
  cancelarRestosAPagar,
  pagarRestosAPagar,
} from "../m08-restos-a-pagar/restos.js";
import { roteiroDispendioExtra } from "../m07-extraorcamentario/dominio.js";
import { registrarDispendioExtra } from "../m07-extraorcamentario/extraorcamentario.js";
import { balancoFinanceiro } from "./balanco-financeiro.js";
import { balancoOrcamentario } from "./balanco-orcamentario.js";
import type { BalancoFinanceiro, LinhaFinanceira } from "./dominio-financeiro.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * ═══ O TESTE DE OURO DO ANEXO 13 ═══
 *
 * O MESMO cenário do Anexo 12, visto pelo CAIXA. Cada célula conferida contra
 * aritmética MANUAL, escrita como literal — nunca contra o SUM do próprio serviço.
 *
 *   2026  arrecada 8.000                                   caixa +8.000
 *         empenha 9.000 → liquida 7.000 → paga 6.000
 *              COM RETENÇÃO de 500 de INSS                 caixa −5.500
 *         encerra: inscreve RP NP 2.000 e RP P 1.000
 *         ─────────────────────────────────────────────────────────────
 *         caixa em 31/12/2026 = 8.000 − 5.500 = 2.500
 *
 *   2027  paga o RP processado (1.000)                     caixa −1.000
 *         REPASSA os 500 ao INSS                           caixa −500
 *         cancela 500 do RP não processado                 caixa INALTERADO
 *         ─────────────────────────────────────────────────────────────
 *         caixa = 2.500 − 1.000 − 500 = 1.000
 *
 * ═══ A IDENTIDADE QUE FAZ TUDO FECHAR ═══
 *   empenhado (9.000) = pago em caixa (5.500) + retido (500) + RP inscritos (3.000)
 *
 * Se o Anexo 12 publicasse o pagamento pelo líquido, ou se o Anexo 13 esquecesse o
 * ingresso extraorçamentário da retenção, essa conta quebraria — e é exatamente
 * isso que os dois demonstrativos, juntos, provam não acontecer.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
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
const VPA_CANCEL = "4.9.9.9.9.99.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

/** O rol de contas de CAIXA — por PARÂMETRO, como todo roteiro do projeto. */
const CONTAS_CAIXA = [CAIXA];

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-inss", codigo: P_INSS, nome: "Consignações INSS", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_RECEITA, nome: "VPA tributária", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa2", codigo: VPA_CANCEL, nome: "VPA cancelamento", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
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
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: FORNECEDOR,
  disponibilidade: CAIXA,
});
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: FORNECEDOR,
  variacaoAumentativa: VPA_CANCEL,
});
const R_REPASSE_INSS = roteiroDispendioExtra({
  consignacaoAPagar: P_INSS,
  disponibilidade: CAIXA,
});

/** Acha uma linha pelo rótulo. */
const ing = (b: BalancoFinanceiro, rotulo: string): LinhaFinanceira =>
  b.ingressos.find((l) => l.rotulo === rotulo)!;
const dis = (b: BalancoFinanceiro, rotulo: string): LinhaFinanceira =>
  b.dispendios.find((l) => l.rotulo === rotulo)!;

describe("M12 — Balanço Financeiro (Anexo 13)", () => {
  let b2026: BalancoFinanceiro;
  let b2027: BalancoFinanceiro;

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
        // A conta de passivo é do CADASTRO — a gravação a confronta com a conta composta.
        contaPassivo: { connect: { codigo: P_INSS } },
      },
    });

    // ── 2026 ─────────────────────────────────────────────────────────────
    await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500",
        valor: "8000.00", dataArrecadacao: new Date("2026-05-10T12:00:00Z"),
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
      fonteId: FONTE, valorDotado: "10000.00",
    });

    const e = await empenhar(
      {
        fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "9000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l = await liquidar(
      {
        empenhoId: e.empenhoId, numero: "NL-1", valor: "7000.00",
        data: new Date("2026-06-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    await pagar(
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "6000.00",
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

    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const rpnp = enc.inscricoes.find((i) => i.tipo === "NAO_PROCESSADO")!;

    // ── 2027 ─────────────────────────────────────────────────────────────
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });

    await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: l.liquidacaoId, numero: "NP-RP-1", valor: "1000.00",
        data: new Date("2027-02-10T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento de RP", criadoPor: POR,
      },
      R_PAG_RP
    );

    // O REPASSE ao INSS: o dinheiro de terceiro finalmente sai do caixa.
    await registrarDispendioExtra(
      prisma,
      {
        tipoConsignacaoId: tipoInss.id, credorConsignatario: "INSS",
        contaBancaria: "CC-001", fonteId: FONTE, valor: "500.00",
        data: new Date("2027-01-20T12:00:00Z"),
        historico: "GPS competência 09/2026", criadoPor: POR,
      },
      R_REPASSE_INSS
    );

    // O cancelamento NÃO toca o caixa — e o teste prova que ele não aparece aqui.
    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: rpnp.id, valor: "500.00",
        motivo: "Contrato rescindido — o serviço não será prestado.",
        data: new Date("2027-03-15T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );

    b2026 = await balancoFinanceiro(prisma, 2026, CONTAS_CAIXA);
    b2027 = await balancoFinanceiro(prisma, 2027, CONTAS_CAIXA);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ── GUARDS ─────────────────────────────────────────────────────────────

  it("sem o rol de contas de caixa: fail-closed (não há como apurar o saldo)", async () => {
    await expect(balancoFinanceiro(prisma, 2026, [])).rejects.toThrow(
      /sem contas de disponibilidade/
    );
  });

  it("conta de caixa inexistente no PCASP: fail-closed", async () => {
    await expect(
      balancoFinanceiro(prisma, 2026, ["9.9.9.9.9.99.99"])
    ).rejects.toThrow(/inexistente\(s\) no PCASP/);
  });

  it("exercício inexistente: fail-closed", async () => {
    await expect(balancoFinanceiro(prisma, 2099, CONTAS_CAIXA)).rejects.toThrow(
      /Exercício 2099 não existe/
    );
  });

  // ── 2026 ───────────────────────────────────────────────────────────────

  it("2026 — INGRESSOS: receita 8.000 + RP inscritos 3.000 + depósitos 500 = 11.500", () => {
    expect(ing(b2026, "RECEITAS ORÇAMENTÁRIAS").valor).toBe("8000.00");

    // a linha por FONTE vem do banco (código e descrição), sem segregação
    // ordinárias × vinculadas — o modelo não carrega essa classificação.
    const fonte = b2026.ingressos.find((l) => l.nivel === "FONTE")!;
    expect(fonte.codigo).toBe("500");
    expect(fonte.rotulo).toBe("Recursos não vinculados");
    expect(fonte.valor).toBe("8000.00");

    // A INSCRIÇÃO de RP é ingresso: a despesa foi empenhada, mas o dinheiro FICOU.
    expect(ing(b2026, "Inscrição de Restos a Pagar Não Processados").valor).toBe("2000.00");
    expect(ing(b2026, "Inscrição de Restos a Pagar Processados").valor).toBe("1000.00");
    // Os 500 retidos de INSS: entraram e ficaram no caixa (ainda não repassados).
    expect(ing(b2026, "Depósitos Restituíveis e Valores Vinculados").valor).toBe("500.00");
    expect(ing(b2026, "RECEBIMENTOS EXTRAORÇAMENTÁRIOS").valor).toBe("3500.00");

    expect(ing(b2026, "TRANSFERÊNCIAS FINANCEIRAS RECEBIDAS").valor).toBe("0.00");
    expect(ing(b2026, "SALDO EM ESPÉCIE DO EXERCÍCIO ANTERIOR").valor).toBe("0.00");

    // 8.000 + 0 + 3.500 + 0 = 11.500
    expect(b2026.totalIngressos).toBe("11500.00");
  });

  it("2026 — DISPÊNDIOS: despesa EMPENHADA 9.000 + saldo 2.500 = 11.500", () => {
    // PELA EMPENHADA, não pela paga: o que foi empenhado e não saiu do caixa está
    // do outro lado, como inscrição de RP.
    expect(dis(b2026, "DESPESAS ORÇAMENTÁRIAS").valor).toBe("9000.00");
    expect(dis(b2026, "PAGAMENTOS EXTRAORÇAMENTÁRIOS").valor).toBe("0.00");
    expect(dis(b2026, "Depósitos Restituíveis e Valores Vinculados").valor).toBe("0.00");

    // 11.500 − 9.000 = 2.500
    expect(dis(b2026, "SALDO EM ESPÉCIE PARA O EXERCÍCIO SEGUINTE").valor).toBe("2500.00");
    expect(b2026.totalDispendios).toBe("11500.00");
  });

  it("2026 — A AMARRAÇÃO e a PROVA DOS NOVE contra o caixa do razão", () => {
    expect(b2026.totalIngressos).toBe(b2026.totalDispendios);

    // 8.000 arrecadados − 5.500 que saíram do banco (6.000 brutos − 500 retidos)
    expect(b2026.saldoEmEspecie.apuradoPelasPartidas).toBe("2500.00");
    // o saldo DERIVADO bate com o caixa REAL — é isso que o serviço confere
    expect(b2026.saldoEmEspecie.seguinte).toBe("2500.00");
    expect(b2026.saldoEmEspecie.seguinte).toBe(b2026.saldoEmEspecie.apuradoPelasPartidas);
  });

  it("⚠️ A SIMETRIA DA RETENÇÃO: os mesmos 500, com sinais opostos nos dois anexos", async () => {
    const orcamentario = await balancoOrcamentario(prisma, 2026);
    const pagas = orcamentario.despesas.find((l) => l.nota === "XIII")!.pagas;

    // ANEXO 12: a despesa executada é o BRUTO.
    expect(pagas).toBe("6000.00");
    // ANEXO 13: do caixa saíram 5.500 — e os 500 aparecem como INGRESSO.
    expect(ing(b2026, "Depósitos Restituíveis e Valores Vinculados").valor).toBe("500.00");

    // A IDENTIDADE, conferida na mão:
    //   empenhado 9.000 = caixa 5.500 + retido 500 + RP inscritos 3.000
    // Se o Anexo 12 publicasse o líquido (5.500), ou se o Anexo 13 esquecesse os
    // 500, esta conta quebraria — e o balanço não fecharia contra o razão.
    expect(dis(b2026, "DESPESAS ORÇAMENTÁRIAS").valor).toBe("9000.00");
    const caixaQueSaiu = 5500;
    const retido = 500;
    const rpInscritos = 3000;
    expect(caixaQueSaiu + retido + rpInscritos).toBe(9000);
  });

  // ── 2027 ───────────────────────────────────────────────────────────────

  it("2027 — o saldo anterior VIRA ingresso, e o repasse do INSS vira dispêndio", () => {
    expect(b2027.parcial).toBe(true); // exercício aberto

    // nenhuma receita e nenhum empenho novos em 2027
    expect(ing(b2027, "RECEITAS ORÇAMENTÁRIAS").valor).toBe("0.00");
    expect(dis(b2027, "DESPESAS ORÇAMENTÁRIAS").valor).toBe("0.00");

    // o caixa que sobrou de 2026 entra aqui
    expect(ing(b2027, "SALDO EM ESPÉCIE DO EXERCÍCIO ANTERIOR").valor).toBe("2500.00");
    expect(b2027.totalIngressos).toBe("2500.00");

    // o RP processado pago em 2027
    expect(dis(b2027, "Pagamento de Restos a Pagar Processados").valor).toBe("1000.00");
    expect(dis(b2027, "Pagamento de Restos a Pagar Não Processados").valor).toBe("0.00");
    // O REPASSE ao INSS: o dinheiro de terceiro SAI. Simétrico ao ingresso de 2026.
    expect(dis(b2027, "Depósitos Restituíveis e Valores Vinculados").valor).toBe("500.00");
    expect(dis(b2027, "PAGAMENTOS EXTRAORÇAMENTÁRIOS").valor).toBe("1500.00");

    // 2.500 − 1.000 − 500 = 1.000
    expect(dis(b2027, "SALDO EM ESPÉCIE PARA O EXERCÍCIO SEGUINTE").valor).toBe("1000.00");
    expect(b2027.totalDispendios).toBe("2500.00");
    expect(b2027.saldoEmEspecie.apuradoPelasPartidas).toBe("1000.00");
  });

  it("o CANCELAMENTO de RP não é fluxo financeiro: não aparece em lugar nenhum", () => {
    // Cancelaram-se 500 do RP não processado em 2027. A obrigação morreu SEM saída
    // de caixa — então o Anexo 13 não a registra, e o saldo não muda por causa
    // dela. (No Anexo 12 ela aparece, na coluna "cancelados" do quadro de RP.)
    const rotulos = [...b2027.ingressos, ...b2027.dispendios].map((l) => l.rotulo);
    expect(rotulos.some((r) => /cancel/i.test(r))).toBe(false);

    // e a prova real: o caixa de 2027 é 1.000 — o cancelamento não tirou nem pôs.
    expect(b2027.saldoEmEspecie.seguinte).toBe("1000.00");
    expect(b2027.saldoEmEspecie.seguinte).toBe(b2027.saldoEmEspecie.apuradoPelasPartidas);
  });

  it("o saldo de um exercício é o saldo anterior do seguinte (a corrente não quebra)", () => {
    expect(b2026.saldoEmEspecie.seguinte).toBe("2500.00");
    expect(b2027.saldoEmEspecie.anterior).toBe("2500.00");
  });

  // ── SERIALIZAÇÃO ───────────────────────────────────────────────────────

  it("todo dinheiro é STRING com 2 casas — nunca number", () => {
    const celulas = [
      ...b2026.ingressos.map((l) => l.valor),
      ...b2026.dispendios.map((l) => l.valor),
      b2026.totalIngressos,
      b2026.totalDispendios,
      b2026.saldoEmEspecie.anterior,
      b2026.saldoEmEspecie.seguinte,
      b2026.saldoEmEspecie.apuradoPelasPartidas,
    ];
    for (const c of celulas) {
      expect(typeof c).toBe("string");
      expect(c).toMatch(/^-?\d+\.\d{2}$/);
    }
  });
});
