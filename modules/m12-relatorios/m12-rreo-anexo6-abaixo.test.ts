import "dotenv/config";
import { CONTA_DIVIDA_FUNDADA } from "../m01-core-contabil/roteiros.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { anexo6 } from "./rreo-anexo6.js";
import { anexo6AbaixoDaLinha } from "./rreo-anexo6-abaixo.js";
import { dclNoCorte } from "./rgf-anexo2.js";

/**
 * RREO — ANEXO 6: RESULTADO NOMINAL, ABAIXO DA LINHA (LRF, art. 53, III). 7.8-b.
 *
 * ⚠️ A FIXTURE LIMPA — a que PROVA a identidade. Contas à mão, bimestre 1 de 2026 (corte 28/02/2026).
 *
 * A harmonização só fecha quando nominal ≡ primário — e isso exige SEM JUROS e SEM RP. A fixture
 * 7.8-a tem os dois (é o teste do acima-da-linha, e da DIVERGÊNCIA — ver `m12-rreo-anexo6.test.ts`).
 * Aqui, o cenário mínimo em que os dois caminhos coincidem, com a ARITMÉTICA DOS DOIS À MÃO:
 *
 * ═══ OS FATOS (2026) ═══
 *   · dívida CONTRATO-001: ingresso de 500.000 em 2024 (o saldo de abertura).
 *   · arrecada IPTU (11130111, primária) ......................... 500.000
 *   · grupo 3 | elem 39 (primária): emp = liq = pago ............. 200.000
 *   · grupo 6 | elem 71 (amortização, dividaId): emp = liq = pago . 30.000
 *   · atualização monetária da dívida (não-fiscal) ............... +10.000   (2026-01-05)
 *   · SEM juros (nenhum grupo 2), SEM restos a pagar (nenhum encerramento).
 *
 * ═══ CAMINHO DE CIMA (fluxo) ═══
 *   XXIV = receita primária − despesa primária paga = 500.000 − 200.000 = 300.000.
 *   (a amortização é financeira; sai. Não há juros: XXVI = 0.)
 *   XXV = null (interruptor) → XXVII = null.
 *
 * ═══ CAMINHO DE BAIXO (estoque) ═══
 *   DCL(31/12/2025): dívida 500.000 (ingresso 2024) − disponibilidade 0 (nada aconteceu) = 500.000.
 *   DCL(28/02/2026): dívida 500.000 − 30.000 (amort) + 10.000 (atualização) = 480.000;
 *                    caixa 500.000 − 200.000 − 30.000 = 270.000; RP 0 → disponibilidade 270.000.
 *                    DCL = 480.000 − 270.000 = 210.000.
 *   VARIAÇÃO BRUTA = 500.000 − 210.000 = 290.000.
 *   AJUSTE (variação monetária, +) = 10.000  → o passivo subiu por índice, não por déficit.
 *   NOMINAL ABAIXO = 290.000 + 10.000 = 300.000.
 *
 * ═══ A HARMONIZAÇÃO ═══
 *   NOMINAL ABAIXO (300.000) == XXIV (300.000). Os dois caminhos fecham; `diferenca = 0`.
 *   ⚠️ A atualização é a prova do ajuste VIVO: sem somá-la de volta, o nominal sairia 290.000 e a
 *      identidade quebraria — a correção de índice seria contada como déficit de 10.000 que não houve.
 *   ⚠️ `primarioAbaixo` e `nominalAcima` (XXVII) ficam `null`: o furo do XXV é o mesmo dos dois lados.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const F500 = "fnt-500";
const CREDOR = "12345678000199";

const R_EMP = roteiroEmpenho();
const R_LIQ_39 = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_LIQ_71 = roteiroLiquidacao({ codElemento: "71", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({ obrigacaoAPagar: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.1.00.00" });
const R_ARR = roteiroArrecadacao({ disponibilidade: "1.1.1.1.1.00.00", variacaoAumentativa: "4.1.1.2.1.01.00" });

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });

  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-3-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
      { id: "nd-6-71", codCategoria: "4", codNatureza: "6", codModalidade: "90", codElemento: "71", codigoCompleto: "469071", descricao: "Principal da dívida resgatado" },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr-iptu", codigo: "11130111", descricao: "IPTU — principal" } });
  await prisma.fonteRecurso.create({ data: { id: F500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: F500 } });

  // A dívida e o ingresso de 2024 (o saldo de abertura). Sem ela o M05 recusa o empenho do grupo 6.
  const contaDivida = await prisma.contaPcasp.findFirstOrThrow({
    // ⚠️ PELA CONSTANTE, NÃO PELO LITERAL. O ENT05 repontou a conta (ITEM 3) e este
    // literal apontava para PESSOAL A PAGAR — a fixture semeava uma conta e o roteiro
    // pedia outra. Pela constante, a fixture acompanha o repontamento sozinha.
    where: { codigo: CONTA_DIVIDA_FUNDADA },
    select: { id: true },
  });
  await prisma.dividaConsolidada.create({
    data: {
      id: "div-1", identificador: "CONTRATO-001", credorNome: "Banco do Brasil S.A.",
      credorDocumento: "00000000000191", tipo: "CONTRATUAL",
      leiAutorizativa: "Lei 1.234/2020", objeto: "Infraestrutura",
      contaContabilId: contaDivida.id, criadoPor: POR,
    },
  });
  await prisma.movimentoDivida.create({
    data: {
      dividaId: "div-1", tipo: "INGRESSO_OPERACAO_CREDITO", valor: "500000.00",
      dataMovimento: new Date("2024-03-01T12:00:00Z"), motivo: "assinatura", criadoPor: POR,
    },
  });

  const base = { orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca" };
  await criarFichaDeTeste(prisma, { ...base, id: "f26-3", exercicio: 2026, numero: 1, naturezaDespesaId: "nd-3-39", fonteId: F500, valorDotado: "500000.00" });
  await criarFichaDeTeste(prisma, { ...base, id: "f26-6", exercicio: 2026, numero: 2, naturezaDespesaId: "nd-6-71", fonteId: F500, valorDotado: "40000.00" });

  deps = criarM05Deps(prisma);
}

async function cenario(): Promise<void> {
  // ── a receita primária ──
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11130111", fonte: "500", exercicioFonte: 1,
      valor: "500000.00", dataArrecadacao: new Date("2026-01-15T12:00:00Z"),
      numeroReceita: "2026RC000001", criadoPor: POR,
    },
    R_ARR,
    criarM04Deps(prisma)
  );

  // ── despesa primária: emp = liq = pago (sem RP, sem parcial) ──
  const e3 = await empenhar(
    { fichaId: "f26-3", numero: "NE-3", tipo: "ORDINARIO", valor: "200000.00", data: new Date("2026-01-10T12:00:00Z"), credorCpfCnpj: CREDOR, historico: "serviços", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR },
    R_EMP, deps
  );
  const l3 = await liquidar(
    { empenhoId: e3.empenhoId, numero: "NL-3", valor: "200000.00", data: new Date("2026-01-20T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liq", criadoPor: POR },
    R_LIQ_39, deps
  );
  await pagar(
    { liquidacaoId: l3.liquidacaoId, numero: "NP-3", valor: "200000.00", data: new Date("2026-02-10T12:00:00Z"), contaBancaria: "CC-001", fonteId: F500, historico: "pag", criadoPor: POR },
    R_PAG, deps
  );

  // ── amortização da dívida (grupo 6, dividaId) — a ponte fluxo↔estoque ──
  const e6 = await empenhar(
    { fichaId: "f26-6", numero: "NE-6", tipo: "ORDINARIO", valor: "30000.00", data: new Date("2026-01-10T12:00:00Z"), credorCpfCnpj: CREDOR, historico: "amort", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR, dividaId: "div-1" },
    R_EMP, deps
  );
  const l6 = await liquidar(
    { empenhoId: e6.empenhoId, numero: "NL-6", valor: "30000.00", data: new Date("2026-01-20T12:00:00Z"), responsavelAtesto: "Fulano", historico: "liq amort", criadoPor: POR },
    R_LIQ_71, deps
  );
  await pagar(
    { liquidacaoId: l6.liquidacaoId, numero: "NP-6", valor: "30000.00", data: new Date("2026-02-10T12:00:00Z"), contaBancaria: "CC-001", fonteId: F500, historico: "pag amort", criadoPor: POR },
    R_PAG, deps
  );

  // ── a atualização monetária (não-fiscal): move o passivo, não o caixa. Criada direta, como o
  //    ingresso — é FATO de dívida, e o que este teste exige é que o ajuste a leia e a some de volta.
  await prisma.movimentoDivida.create({
    data: {
      dividaId: "div-1", tipo: "ATUALIZACAO_MONETARIA", valor: "10000.00",
      dataMovimento: new Date("2026-01-05T12:00:00Z"), motivo: "correção IPCA", criadoPor: POR,
    },
  });
}

describe("RREO Anexo 6 — abaixo da linha, a fixture LIMPA (a identidade da sessão)", () => {
  beforeEach(async () => {
    await semear();
    await cenario();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t-dcl — a DCL nos dois cortes, e a amortização movendo o estoque", async () => {
    const a = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    // 31/12/2025: só o ingresso de 2024 existe; nada de caixa. DCL = 500.000.
    expect(a.dclInicial).toBe("500000.00");
    // 28/02/2026: dívida 480.000 (−30k amort +10k atualização), disponibilidade 270.000.
    expect(a.dclFinal).toBe("210000.00");
    expect(a.variacaoDclBruta).toBe("290000.00");
  });

  it("t-ajuste — a variação monetária é linha VIVA e volta ao nominal", async () => {
    const a = await anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 });

    const vm = a.ajustes.find((x) => x.chave === "VARIACAO_MONETARIA")!;
    expect(vm.tipo).toBe("vivo");
    expect(vm.valor).toBe("10000.00");
    expect(a.totalAjustes).toBe("10000.00");

    // ⚠️ 290.000 (bruto) + 10.000 (o índice, de volta) = 300.000. Sem o ajuste, sairia 290.000 e a
    // identidade quebraria — a correção monetária viraria um déficit de 10.000 que não houve.
    expect(a.resultadoNominal).toBe("300000.00");

    // Os demais ajustes são parâmetros nomeados, zero.
    for (const chave of ["ALIENACAO_INVESTIMENTOS", "DESINCORPORACAO_PASSIVO", "RECONHECIMENTO_DIVIDA_SEM_EXECUCAO"]) {
      const p = a.ajustes.find((x) => x.chave === chave)!;
      expect(p.tipo).toBe("parametro");
      expect(p.valor).toBe("0.00");
    }
  });

  it("t-harmonização — NOMINAL ABAIXO == XXIV, e os dois caminhos FECHAM", async () => {
    const [abaixo, acima] = await Promise.all([
      anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 }),
      anexo6(prisma, { exercicio: 2026, bimestre: 1 }),
    ]);

    // O XXIV do acima, hand-computed: 500.000 − 200.000 = 300.000.
    expect(acima.resultadoPrimario).toBe("300000.00");

    // A IDENTIDADE: o nominal abaixo (estoque) == o primário acima (fluxo), sem juros.
    expect(abaixo.harmonizacao.primarioAcima).toBe("300000.00");
    expect(abaixo.harmonizacao.nominalAbaixo).toBe("300000.00");
    expect(abaixo.harmonizacao.diferenca).toBe("0.00");
    expect(abaixo.harmonizacao.fecha).toBe(true);
  });

  it("t-null — o furo do XXV é o mesmo dos dois lados (não relaxamos o interruptor)", async () => {
    const [abaixo, acima] = await Promise.all([
      anexo6AbaixoDaLinha(prisma, { exercicio: 2026, bimestre: 1 }),
      anexo6(prisma, { exercicio: 2026, bimestre: 1 }),
    ]);

    // Acima: primário concreto, nominal (XXVII) null. Abaixo: nominal concreto, primário null.
    expect(acima.resultadoNominal).toBeNull(); // XXVII
    expect(abaixo.resultadoPrimario).toBeNull();
    expect(abaixo.jurosNominais).toBeNull();
    expect(abaixo.harmonizacao.nominalAcima).toBeNull();
    expect(abaixo.harmonizacao.primarioAbaixo).toBeNull();

    // Sem juros neste cenário, o XXVI é zero — e ainda assim o primário abaixo é null (falta o XXV).
    expect(abaixo.jurosPassivos).toBe("0.00");
  });

  it("t-corte-abertura — um corte ANTES do ingresso dá zero, não erro (Passo 0.2)", async () => {
    // O ingresso é 2024-03-01. Um corte anterior a ele não vê movimento nenhum: saldo 0, sem lançar.
    const antes = await dclNoCorte(prisma, { exercicio: 2023, corte: new Date("2023-12-31T23:59:59Z") });
    expect(antes.dividaConsolidada.toFixed(2)).toBe("0.00");
    expect(antes.dcl.toFixed(2)).toBe("0.00");
  });
});
