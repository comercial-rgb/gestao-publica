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
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import {
  anularCancelamentoRestosAPagar,
  anularPagamentoRestosAPagar,
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
} from "../m08-restos-a-pagar/restos.js";
import { relatorioRestosAPagar } from "./relatorio-restos.js";
import { ordemCronologicaMensal } from "./ordem-cronologica.js";
import type { RelatorioRestosAPagar } from "./dominio-restos.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import type { JustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";

/**
 * ═══ O TESTE DE OURO DO BLOCO 3 ═══
 *
 * Um cenário com TUDO o que faz as colunas de estorno existirem — porque uma
 * coluna de estorno que só sabe mostrar zero não prova nada.
 *
 *   2026  empenha 9.000 → liquida 7.000 → paga 6.000 → ENCERRA
 *           RP PROCESSADO     = 7.000 − 6.000 = 1.000
 *           RP NÃO PROCESSADO = 9.000 − 7.000 = 2.000
 *
 *   2027  (aberto — relatório PARCIAL)
 *         RPP:  paga 1.000  →  ANULA o pagamento
 *                 pago 1.000 | estorno de pagamento 1.000 | saldo VOLTA a 1.000
 *         RPNP: liquida 800 (vira obrigação — não baixa saldo de RP)
 *               cancela 500 e 300  →  ANULA o cancelamento de 500
 *                 cancelado 800 | estorno de cancelamento 500 | líquido 300
 *                 saldo = 2.000 − 300 = 1.700
 *         + empenho novo de 2027, liquidado e pago FURANDO A FILA
 *           (o RP de 2026 estava na frente)
 *
 * Cada célula conferida contra aritmética MANUAL escrita como literal.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m12@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA_2026 = "ficha-2026";
const FICHA_2027 = "ficha-2027";
const CREDOR_A = "12345678000199";
const CREDOR_B = "98765432000188";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const VPA = "4.9.9.9.9.99.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";

const CONTAS = [
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA, nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
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
const R_LIQ_RP = roteiroLiquidacaoRestos({
  variacaoDiminutiva: VPD,
  restosAPagarProcessados: FORNECEDOR,
});
const R_PAG_RP = roteiroPagamentoRestos({
  restosAPagarProcessados: FORNECEDOR,
  disponibilidade: CAIXA,
});
const R_CANC_RP = roteiroCancelamentoRestos({
  restosAPagar: FORNECEDOR,
  variacaoAumentativa: VPA,
});

const JUSTIFICATIVA: JustificativaQuebraOrdemInput = {
  hipotese: "V_ATIVIDADE_FINALISTICA",
  justificativa:
    "Pagamento imprescindível à continuidade do transporte escolar da rede municipal.",
  autorizadoPor: "Secretário de Finanças",
};

/** O relógio real — o `criadoEm` de tudo que o teste cria é AGORA. */
const AGORA = new Date();
const ANO_ATUAL = AGORA.getUTCFullYear();
const MES_ATUAL = AGORA.getUTCMonth() + 1;
const MES_ANTERIOR = MES_ATUAL === 1 ? 12 : MES_ATUAL - 1;
const ANO_DO_MES_ANTERIOR = MES_ATUAL === 1 ? ANO_ATUAL - 1 : ANO_ATUAL;

describe("M12 — bloco 3 (RP + ordem cronológica)", () => {
  let deps: M05Deps;
  let liqRPP: string; // NL-1: a liquidação de 2026 (vira RP processado)
  let liqDeRP: string; // NL-RP: a liquidação DE RESTOS A PAGAR (do RPNP)
  let liq2027: string; // NL-2: a liquidação corrente de 2027
  let r2026: RelatorioRestosAPagar;
  let r2027: RelatorioRestosAPagar;

  beforeAll(async () => {
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
    await prisma.acao.create({
      data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" },
    });
    await prisma.naturezaDespesa.create({
      data: {
        id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
        codElemento: "39", codigoCompleto: "339039", descricao: "Serviços - PJ",
      },
    });
    await prisma.fonteRecurso.create({
      data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
    });
    await prisma.contaBancaria.create({
      data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE },
    });

    const base = {
      orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
      subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "50000.00",
    };
    await criarFichaDeTeste(prisma, { ...base, id: FICHA_2026, exercicio: 2026, numero: 1 });

    // ── 2026 ─────────────────────────────────────────────────────────────
    const e2026 = await empenhar(
      {
        fichaId: FICHA_2026, numero: "NE-1", tipo: "ORDINARIO", valor: "9000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: CREDOR_A,
        historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l1 = await liquidar(
      {
        empenhoId: e2026.empenhoId, numero: "NL-1", valor: "7000.00",
        data: new Date("2026-06-01T12:00:00Z"), responsavelAtesto: "Fulano",
        historico: "liquidação", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    liqRPP = l1.liquidacaoId;

    await pagar(
      {
        liquidacaoId: liqRPP, numero: "NP-1", valor: "6000.00",
        data: new Date("2026-09-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento", criadoPor: POR,
      },
      R_PAGAMENTO,
      deps
    );

    const enc = await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
    const rpnp = enc.inscricoes.find((i) => i.tipo === "NAO_PROCESSADO")!;
    expect(rpnp.valorInscrito.toFixed(2)).toBe("2000.00");

    // O RELATÓRIO DE 2026 — tirado ANTES de qualquer execução em 2027, para provar
    // o corte temporal (nada do que vem abaixo pode aparecer nele).
    r2026 = await relatorioRestosAPagar(prisma, 2026);

    // ── 2027 ─────────────────────────────────────────────────────────────
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: POR } });

    // (1) RPP: paga 1.000 e DEPOIS ANULA o pagamento.
    const pRP = await pagarRestosAPagar(
      prisma,
      {
        liquidacaoId: liqRPP, numero: "NP-RP-1", valor: "1000.00",
        data: new Date("2027-02-10T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento de RP", criadoPor: POR,
      },
      R_PAG_RP
    );
    await anularPagamentoRestosAPagar(prisma, {
      pagamentoId: pRP.pagamentoId, numero: "NP-RP-1-ANUL",
      data: new Date("2027-02-20T12:00:00Z"),
      motivo: "Pagamento efetuado ao credor errado — devolvido pelo banco.",
      criadoPor: POR,
    });

    // (2) RPNP: liquida 800 (não baixa saldo de RP — só o qualifica para pagamento)
    const lRP = await liquidarRestosAPagar(
      prisma,
      {
        empenhoId: e2026.empenhoId, numero: "NL-RP", valor: "800.00",
        data: new Date("2027-03-01T12:00:00Z"), responsavelAtesto: "Ciclano",
        historico: "liquidação de RPNP", criadoPor: POR,
      },
      R_LIQ_RP
    );
    liqDeRP = lRP.liquidacaoId;

    // (3) RPNP: cancela 500 e 300; depois ANULA o cancelamento de 500.
    const c1 = await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: rpnp.id, valor: "500.00",
        motivo: "Contrato rescindido — parte do serviço não será prestada.",
        data: new Date("2027-03-10T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );
    await cancelarRestosAPagar(
      prisma,
      {
        inscricaoId: rpnp.id, valor: "300.00",
        motivo: "Saldo remanescente sem cobertura contratual.",
        data: new Date("2027-03-12T12:00:00Z"), criadoPor: POR,
      },
      R_CANC_RP
    );
    await anularCancelamentoRestosAPagar(prisma, {
      movimentoId: c1.movimentoId, numero: "CANC-ANUL-1",
      data: new Date("2027-03-20T12:00:00Z"),
      motivo: "Rescisão revertida judicialmente — a obrigação voltou a existir.",
      criadoPor: POR,
    });

    // (4) Um empenho CORRENTE de 2027, pago FURANDO A FILA (o RP está na frente).
    await criarFichaDeTeste(prisma, { ...base, id: FICHA_2027, exercicio: 2027, numero: 2 });
    const e2027 = await empenhar(
      {
        fichaId: FICHA_2027, numero: "NE-2", tipo: "ORDINARIO", valor: "1000.00",
        data: new Date("2027-04-01T12:00:00Z"), credorCpfCnpj: CREDOR_B,
        historico: "empenho 2027", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
        criadoPor: POR,
      },
      R_EMPENHO,
      deps
    );
    const l2 = await liquidar(
      {
        empenhoId: e2027.empenhoId, numero: "NL-2", valor: "1000.00",
        data: new Date("2027-05-01T12:00:00Z"), responsavelAtesto: "Beltrano",
        historico: "liquidação 2027", criadoPor: POR,
      },
      R_LIQUIDACAO,
      deps
    );
    liq2027 = l2.liquidacaoId;

    // FURA A FILA: NL-1 (RP de 2026) e NL-RP estão na frente.
    await pagar(
      {
        liquidacaoId: liq2027, numero: "NP-2", valor: "1000.00",
        data: new Date("2027-06-01T12:00:00Z"), contaBancaria: "CC-001",
        fonteId: FONTE, historico: "pagamento 2027", criadoPor: POR,
        justificativaQuebraOrdem: JUSTIFICATIVA,
      },
      R_PAGAMENTO,
      deps
    );

    r2027 = await relatorioRestosAPagar(prisma, 2027);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══ 3a — RELATÓRIO DE RESTOS A PAGAR ═══

  it("guard: exercício inexistente é erro (fail-closed)", async () => {
    await expect(relatorioRestosAPagar(prisma, 2099)).rejects.toThrow(
      /Exercício 2099 não existe/
    );
  });

  it("2026 (ENCERRADO): as inscrições existem, mas NADA foi executado ainda", () => {
    expect(r2026.parcial).toBe(false);
    // O corte temporal: toda a execução de 2027 (abaixo) NÃO pode aparecer aqui.
    const np = r2026.grupos.find((g) => g.tipo === "NAO_PROCESSADO")!;
    const pp = r2026.grupos.find((g) => g.tipo === "PROCESSADO")!;

    expect(np.total.inscrito).toBe("2000.00");
    expect(np.total.pago).toBe("0.00");
    expect(np.total.cancelado).toBe("0.00");
    expect(np.total.liquidadoAposInscricao).toBe("0.00");
    expect(np.total.saldo).toBe("2000.00");

    expect(pp.total.inscrito).toBe("1000.00");
    expect(pp.total.saldo).toBe("1000.00");

    expect(r2026.total.inscrito).toBe("3000.00");
    expect(r2026.total.saldo).toBe("3000.00");
  });

  it("2027 (ABERTO): relatório PARCIAL, agrupado por exercício de origem e tipo", () => {
    expect(r2027.parcial).toBe(true);
    expect(r2027.grupos).toHaveLength(2);
    expect(r2027.grupos.every((g) => g.exercicioOrigem === 2026)).toBe(true);
  });

  it("RPP — o PAGAMENTO ESTORNADO aparece: pago 1.000, estorno 1.000, saldo VOLTA", () => {
    const pp = r2027.grupos.find((g) => g.tipo === "PROCESSADO")!;
    expect(pp.linhas).toHaveLength(1);

    const linha = pp.linhas[0]!;
    expect(linha.numeroEmpenho).toBe("NE-1");
    expect(linha.credorCpfCnpj).toBe(CREDOR_A);
    expect(linha.inscrito).toBe("1000.00");
    // As colunas de estorno com VALOR REAL — não zero estrutural. Um relatório que
    // mostrasse só o líquido esconderia que houve um pagamento e uma anulação.
    expect(linha.pago).toBe("1000.00");
    expect(linha.estornosDePagamento).toBe("1000.00");
    // pago líquido = 0 -> o saldo VOLTOU ao inscrito
    expect(linha.saldo).toBe("1000.00");
    // o processado já nasceu liquidado: esta coluna não é dele
    expect(linha.liquidadoAposInscricao).toBe("0.00");
  });

  it("RPNP — CANCELAMENTO ESTORNADO e liquidação após a inscrição", () => {
    const np = r2027.grupos.find((g) => g.tipo === "NAO_PROCESSADO")!;
    const linha = np.linhas[0]!;

    expect(linha.inscrito).toBe("2000.00");
    // liquidar um RPNP NÃO baixa o saldo — só o qualifica para pagamento
    expect(linha.liquidadoAposInscricao).toBe("800.00");
    // cancelou 500 + 300 = 800 BRUTO; estornou 500 -> líquido 300
    expect(linha.cancelado).toBe("800.00");
    expect(linha.estornosDeCancelamento).toBe("500.00");
    expect(linha.pago).toBe("0.00");
    // 2.000 − 0 (pago líq.) − 300 (cancelado líq.) = 1.700
    expect(linha.saldo).toBe("1700.00");
  });

  it("TOTALIZADORES: por grupo e geral, conferidos na mão", () => {
    const np = r2027.grupos.find((g) => g.tipo === "NAO_PROCESSADO")!;
    const pp = r2027.grupos.find((g) => g.tipo === "PROCESSADO")!;

    expect(np.total.saldo).toBe("1700.00");
    expect(pp.total.saldo).toBe("1000.00");

    // geral: inscrito 2.000 + 1.000 = 3.000
    expect(r2027.total.inscrito).toBe("3000.00");
    expect(r2027.total.liquidadoAposInscricao).toBe("800.00");
    expect(r2027.total.pago).toBe("1000.00");
    expect(r2027.total.estornosDePagamento).toBe("1000.00");
    expect(r2027.total.cancelado).toBe("800.00");
    expect(r2027.total.estornosDeCancelamento).toBe("500.00");
    // saldo: 1.700 + 1.000 = 2.700  (= 3.000 inscritos − 300 de baixa líquida)
    expect(r2027.total.saldo).toBe("2700.00");
  });

  it("todo dinheiro é STRING com 2 casas", () => {
    const celulas = [
      ...r2027.grupos.flatMap((g) => [
        ...g.linhas.flatMap((l) => [
          l.inscrito, l.liquidadoAposInscricao, l.pago, l.estornosDePagamento,
          l.cancelado, l.estornosDeCancelamento, l.saldo,
        ]),
        g.total.saldo,
      ]),
      r2027.total.saldo,
    ];
    for (const c of celulas) {
      expect(typeof c).toBe("string");
      expect(c).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  // ═══ 3b — ORDEM CRONOLÓGICA MENSAL (§3º) ═══

  it("guard: mês FUTURO é erro (não há o que publicar sobre o que não aconteceu)", async () => {
    await expect(
      ordemCronologicaMensal(prisma, ANO_ATUAL + 1, 1, AGORA)
    ).rejects.toThrow(/está no FUTURO/);
    await expect(ordemCronologicaMensal(prisma, ANO_ATUAL, 13, AGORA)).rejects.toThrow(
      /Mês inválido/
    );
  });

  it("a fila do mês CORRENTE traz o RP de 2026 NA FRENTE, e a liquidação DE RP nela", async () => {
    const r = await ordemCronologicaMensal(prisma, ANO_ATUAL, MES_ATUAL, AGORA);
    expect(r.mesCorrente).toBe(true);

    const fila = r.filas.find(
      (f) => f.fonteCodigo === "500" && f.categoria === "PRESTACAO_SERVICOS"
    )!;
    expect(fila).toBeDefined();

    // NL-2 (2027) foi paga e saiu. Sobram, em ordem de exigibilidade:
    //   1º NL-1  — liquidada em 2026-06-01, virou RP e teve o pagamento anulado
    //   2º NL-RP — a liquidação DE RESTOS A PAGAR, de 2027-03-01
    expect(fila.itens.map((i) => i.numeroLiquidacao)).toEqual(["NL-1", "NL-RP"]);

    const primeiro = fila.itens[0]!;
    expect(primeiro.posicao).toBe(1);
    expect(primeiro.liquidacaoId).toBe(liqRPP);
    expect(primeiro.credorCpfCnpj).toBe(CREDOR_A);
    expect(primeiro.numeroEmpenho).toBe("NE-1");
    expect(primeiro.valorAPagar).toBe("1000.00"); // 7.000 − 6.000 (o de RP foi anulado)
    expect(primeiro.dataExigibilidade.toISOString().slice(0, 10)).toBe("2026-06-01");
    expect(primeiro.diasNaFila).toBeGreaterThan(0);

    // A EXPOSIÇÃO NÃO FILTRA LIQUIDAÇÃO DE RP: ela está na fila, como o M08 provou.
    const segundo = fila.itens[1]!;
    expect(segundo.posicao).toBe(2);
    expect(segundo.liquidacaoId).toBe(liqDeRP);
    expect(segundo.valorAPagar).toBe("800.00");
  });

  it("a QUEBRA sai com a hipótese, quem autorizou, e QUEM FOI PRETERIDO (§2º)", async () => {
    const r = await ordemCronologicaMensal(prisma, ANO_ATUAL, MES_ATUAL, AGORA);

    expect(r.quebras).toHaveLength(1);
    const q = r.quebras[0]!;
    expect(q.liquidacaoId).toBe(liq2027);
    expect(q.numeroLiquidacao).toBe("NL-2");
    expect(q.credorCpfCnpj).toBe(CREDOR_B);
    expect(q.hipotese).toBe("V_ATIVIDADE_FINALISTICA");
    expect(q.autorizadoPor).toBe("Secretário de Finanças");
    expect(q.justificativa).toMatch(/transporte escolar/);

    // A POSIÇÃO QUE ELA OCUPAVA QUANDO FUROU: a fila era NL-1, NL-RP, NL-2.
    expect(q.posicaoNaEpoca).toBe(3);
    // E QUEM FOI PRETERIDO: a cabeça da fila naquele instante — o RP de 2026.
    expect(q.preterida?.liquidacaoId).toBe(liqRPP);
    expect(q.preterida?.numeroLiquidacao).toBe("NL-1");
    expect(q.preterida?.valorAPagar).toBe("1000.00");
  });

  it("a quebra do mês corrente NÃO VAZA para o mês anterior (fila e quebras vazias)", async () => {
    // Nada foi criado no mês passado — a fila daquele momento estava vazia, e não
    // havia quebra nenhuma. Estrutura VÁLIDA e vazia, não erro.
    const r = await ordemCronologicaMensal(
      prisma,
      ANO_DO_MES_ANTERIOR,
      MES_ANTERIOR,
      AGORA
    );

    expect(r.mesCorrente).toBe(false);
    expect(r.quebras).toEqual([]);
    expect(r.filas).toEqual([]);
    expect(r.relatorio).toBe("ORDEM CRONOLÓGICA DE PAGAMENTOS (art. 141, §3º)");
    expect(r.competencia.inicio.getUTCMonth() + 1).toBe(MES_ANTERIOR);
  });
});
