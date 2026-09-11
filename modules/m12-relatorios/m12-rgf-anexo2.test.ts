import "dotenv/config";
import { CONTA_DIVIDA_FUNDADA } from "../m01-core-contabil/roteiros.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar, pagar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import {
  roteiroArrecadacao,
  roteiroEmpenho,
  roteiroLiquidacao,
  roteiroPagamento,
} from "../m01-core-contabil/roteiros.js";
import { semearPcasp } from "../../prisma/seed/pcasp.js";
import { rgfAnexo5 } from "./rgf-anexo5.js";
import { rgfAnexo2 } from "./rgf-anexo2.js";

/**
 * RGF — ANEXO 2: DÍVIDA CONSOLIDADA LÍQUIDA (LRF art. 55, I, "b").
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ⚠️ Fixture do padrão da 7.6-a/b: plano de PRODUÇÃO + roteiros do M01 — o Anexo 2
 * consome o `rgfAnexo5` (a disponibilidade bruta), e a amarração S1 do
 * `superavit-por-fonte` derruba dinheiro sem fato de origem.
 *
 * ═══ O CENÁRIO (2026, 3º quadrimestre → corte 31/12) ═══
 * DÍVIDA (M10, fonte do fato = a data do movimento):
 *   mobiliária (títulos) ..... ingresso 200.000 em 15/01
 *   contratual (banco) ....... ingresso 500.000 em 15/01
 *   ⇒ (I) DC = 700.000  ·  precatórios e demais dívidas: 0,00 (linhas vazias nomeadas)
 *
 * ═══ t1 — CASO NORMAL ═══
 *   arrecada 400.000 · empenha 150.000 · liquida 150.000 · paga 100.000
 *   (a) caixa bruto ..... 400.000 − 100.000 = 300.000
 *   RP processados ...... 0 (não há inscrição de exercício anterior)
 *   Disponibilidade de Caixa = 300.000 − 0 = 300.000  ⇒ (II) = 300.000
 *   (III) DCL = 700.000 − 300.000 = 400.000
 *
 * ═══ t2 — A NOTA ¹: A DEDUÇÃO NEGATIVA VAI A ZERO ═══
 *   Mesmo cenário, mas com RP processados de 350.000 (inscrição de 2025):
 *   caixa bruto 300.000 − RP 350.000 = −50.000
 *   ⇒ Disponibilidade de Caixa = 0,00        (a nota manda; NÃO fica −50.000)
 *   ⇒ (II) = 0,00  ·  (III) DCL = 700.000 − 0 = 700.000
 *   ⇒ Insuficiência Financeira = 50.000,00   (ABSOLUTO, sem o menos)
 *
 *   ⚠️ POR QUE ISSO IMPORTA: se a dedução ficasse −50.000, a DCL seria
 *   700.000 − (−50.000) = 750.000 — subtrair um negativo SOMA. O ente apareceria devendo
 *   50.000 a mais do que a lei manda medir, e o buraco de caixa sumiria dentro da dívida
 *   em vez de aparecer na linha que existe para mostrá-lo.
 *
 * ═══ t3 — R3: um dono ═══
 *   `disponibilidadeCaixaBruta` é o `totalBruta` do Anexo 5, não uma segunda soma.
 *   É identidade POR CONSTRUÇÃO — o teste a trava contra regressão, não a "descobre".
 *
 * ═══ t4 — R1 (DCL = I − II) e a coluna do exercício anterior ═══
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const FONTE = "500";
const CREDOR = "12345678000199";

const R_ARREC = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
});
const R_EMP = roteiroEmpenho();
const R_LIQ = roteiroLiquidacao({ codElemento: "39", obrigacaoAPagar: "2.1.3.1.1.00.00" });
const R_PAG = roteiroPagamento({
  obrigacaoAPagar: "2.1.3.1.1.00.00",
  disponibilidade: "1.1.1.1.1.00.00",
});

let m04: ReturnType<typeof criarM04Deps>;
let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await semearPcasp(prisma);
  m04 = criarM04Deps(prisma);
  deps = criarM05Deps(prisma);

  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Finanças", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
  });
  // Uma receita CORRENTE — é ela que forma a RCL do Anexo 3.
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: "11121101", descricao: "IPTU" },
  });
  await prisma.fonteRecurso.create({
    data: { id: "fnt-500", codigo: FONTE, descricao: "Não vinculados", codigoTce: "500" },
  });
  await prisma.contaBancaria.create({
    data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: "fnt-500" },
  });
  for (const ano of [2025, 2026]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }

  await criarFichaDeTeste(prisma, {
    id: "ficha-1", exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "1000000.00",
  });

  // ── A DÍVIDA CONSOLIDADA (M10) ──
  // A conta de passivo vem do plano de produção — a Dívida Fundada Interna.
  const passivo = await prisma.contaPcasp.findUniqueOrThrow({
    // ⚠️ PELA CONSTANTE, NÃO PELO LITERAL — o ENT05 repontou a conta (ITEM 3), e este
    // literal apontava para PESSOAL A PAGAR.
    where: { codigo: CONTA_DIVIDA_FUNDADA },
    select: { id: true },
  });
  for (const d of [
    { id: "dv-mob", identificador: "TIT-2026-01", tipo: "MOBILIARIA" as const, valor: "200000.00" },
    { id: "dv-con", identificador: "CTR-2026-01", tipo: "CONTRATUAL" as const, valor: "500000.00" },
  ]) {
    await prisma.dividaConsolidada.create({
      data: {
        id: d.id, identificador: d.identificador, credorNome: "Credor", credorDocumento: "00000000000191",
        tipo: d.tipo, leiAutorizativa: "Lei 1/2026", objeto: "o", contaContabilId: passivo.id, criadoPor: POR,
      },
    });
    // ⚠️ O movimento pela DATA DO FATO (a assinatura), nunca por `criadoEm`.
    await prisma.movimentoDivida.create({
      data: {
        dividaId: d.id, tipo: "INGRESSO_OPERACAO_CREDITO", valor: d.valor,
        dataMovimento: new Date("2026-01-15T12:00:00Z"), motivo: "assinatura do contrato", criadoPor: POR,
      },
    });
  }
}

async function cenarioBase(): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: "11121101", fonte: FONTE, valor: "400000.00",
      dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "G1", criadoPor: POR,
    },
    R_ARREC,
    m04
  );
  const e = await empenhar(
    {
      fichaId: "ficha-1", numero: "NE-1", tipo: "ORDINARIO", valor: "150000.00",
      data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: CREDOR, historico: "s",
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMP,
    deps
  );
  const l = await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "150000.00",
      data: new Date("2026-04-01T12:00:00Z"), responsavelAtesto: "F", historico: "l", criadoPor: POR,
    },
    R_LIQ,
    deps
  );
  await pagar(
    {
      liquidacaoId: l.liquidacaoId, numero: "NP-1", valor: "100000.00",
      data: new Date("2026-05-01T12:00:00Z"), contaBancaria: "CC-001",
      fonteId: "fnt-500", historico: "p", criadoPor: POR,
    },
    R_PAG,
    deps
  );
}

/** A última coluna — a do quadrimestre de referência. */
const ref = (a2: Awaited<ReturnType<typeof rgfAnexo2>>) => a2.colunas[a2.colunas.length - 1]!.valores;

describe("M12 — RGF Anexo 2 (Dívida Consolidada Líquida)", () => {
  beforeEach(async () => {
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: o caso normal — DC 700.000, deduções 300.000, DCL 400.000", async () => {
    await cenarioBase();
    const a2 = await rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 3 });
    const v = ref(a2);

    // (I) — do M10, por tipo. O cadastro só tem MOBILIARIA × CONTRATUAL.
    expect(v.dividaMobiliaria).toBe("200000.00");
    expect(v.dividaContratual).toBe("500000.00");
    expect(v.dividaConsolidada).toBe("700000.00");
    // As linhas sem entidade ficam zero, nomeadas.
    expect(v.precatoriosPosteriores2000VencidosNaoPagos).toBe("0.00");
    expect(v.demaisDividas).toBe("0.00");

    // (II)
    expect(v.disponibilidadeCaixaBruta).toBe("300000.00"); // 400.000 − 100.000 pagos
    expect(v.restosAPagarProcessados).toBe("0.00");
    expect(v.disponibilidadeDeCaixa).toBe("300000.00");
    expect(v.deducoes).toBe("300000.00");

    // (III) = (I) − (II)
    expect(v.dividaConsolidadaLiquida).toBe("400000.00");

    // O informativo, no corte de referência.
    expect(a2.quadroInformativo.insuficienciaFinanceira).toBe("0.00");
    expect(a2.limiteSenado).toBe("120.00");
    expect(a2.limiteAlerta).toBe("108.00");
  });

  it("t2: A NOTA ¹ — dedução negativa vai a ZERO e o buraco aparece SEM sinal", async () => {
    await cenarioBase();

    // Um RP PROCESSADO de 2025 (exercício anterior), maior que o caixa: 350.000 > 300.000.
    const e = await empenhar(
      {
        fichaId: "ficha-1", numero: "NE-RP", tipo: "ORDINARIO", valor: "350000.00",
        data: new Date("2026-03-01T12:00:00Z"), credorCpfCnpj: CREDOR, historico: "rp",
        categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMP,
      deps
    );
    await prisma.inscricaoRestosAPagar.create({
      data: {
        empenhoId: e.empenhoId, exercicioOrigem: 2025, tipo: "PROCESSADO",
        valorInscrito: "350000.00", criadoPor: POR,
      },
    });

    const a2 = await rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 3 });
    const v = ref(a2);

    expect(v.disponibilidadeCaixaBruta).toBe("300000.00");
    expect(v.restosAPagarProcessados).toBe("350000.00");

    // ⚠️ O CORAÇÃO DA NOTA ¹: 300.000 − 350.000 = −50.000, e a linha vai a ZERO.
    expect(v.disponibilidadeDeCaixa).toBe("0.00");
    expect(v.deducoes).toBe("0.00");

    // ⚠️ E A DCL NÃO INCHA: com a dedução negativa, seria 700.000 − (−50.000) = 750.000.
    expect(v.dividaConsolidadaLiquida).toBe("700000.00");
    expect(v.dividaConsolidadaLiquida).not.toBe("750000.00");

    // ⚠️ O buraco aparece no quadro informativo, ABSOLUTO — sem o menos.
    expect(a2.quadroInformativo.insuficienciaFinanceira).toBe("50000.00");
    expect(a2.quadroInformativo.insuficienciaFinanceira.startsWith("-")).toBe(false);
  });

  it("t3 (R3): a disponibilidade bruta É a do Anexo 5 — um dono, identidade por construção", async () => {
    await cenarioBase();
    const a2 = await rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 3 });
    const a5 = await rgfAnexo5(prisma, {
      exercicio: 2026,
      corte: new Date(Date.UTC(2026, 11, 31, 23, 59, 59)),
    });

    // ⚠️ NÃO É UM CONFRONTO DE DOIS CAMINHOS: o Anexo 2 CONSOME o `totalBruta` do Anexo 5.
    // Este teste trava a identidade contra regressão — o dia em que alguém "otimizar" o
    // Anexo 2 somando o caixa por conta própria, ele cai aqui.
    expect(ref(a2).disponibilidadeCaixaBruta).toBe(a5.totalBruta);
  });

  it("t4 (R1): DCL = I − II em TODAS as colunas; e o exercício anterior vem antes", async () => {
    await cenarioBase();
    const a2 = await rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 3 });

    // Anterior + Q1 + Q2 + Q3.
    expect(a2.colunas.map((c) => c.coluna)).toEqual(["ANTERIOR", "Q1", "Q2", "Q3"]);

    for (const c of a2.colunas) {
      const v = c.valores;
      expect(v.dividaConsolidadaLiquida).toBe(
        toMoney(toMoney(v.dividaConsolidada).minus(toMoney(v.deducoes))).toFixed(2)
      );
      expect(v.rclAjustada).toBe(
        toMoney(toMoney(v.rcl).minus(toMoney(v.emendasIndividuais))).toFixed(2)
      );
    }

    // ⚠️ O EXERCÍCIO ANTERIOR (2025) não tem dívida: os movimentos são de 15/01/2026, e o
    // corte é 31/12/2025. O corte é pela data do FATO — é isso que o prova.
    expect(a2.colunas[0]!.valores.dividaConsolidada).toBe("0.00");
    expect(a2.colunas[1]!.valores.dividaConsolidada).toBe("700000.00"); // Q1: já em 30/04
  });

  it("t5: publicar o 1º quadrimestre NÃO mostra o futuro", async () => {
    await cenarioBase();
    const a2 = await rgfAnexo2(prisma, { exercicio: 2026, quadrimestre: 1 });

    // ⚠️ Só o anterior + Q1. Publicar Q2/Q3 no relatório do 1º quadrimestre mostraria um
    // futuro que ainda não aconteceu.
    expect(a2.colunas.map((c) => c.coluna)).toEqual(["ANTERIOR", "Q1"]);
  });
});
