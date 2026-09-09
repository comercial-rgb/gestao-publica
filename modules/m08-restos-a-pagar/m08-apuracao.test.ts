import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import { balancoPatrimonial } from "../m12-relatorios/balanco-patrimonial.js";
import { cadastrarLinhaDemonstrativo } from "../m12-relatorios/cadastro-linhas.js";
import { demonstracaoVariacoesPatrimoniais } from "../m12-relatorios/dvp.js";
import { encerrarExercicioComRestos } from "./encerramento.js";
import { apurarResultadoDoExercicio, estornarApuracao, ORIGEM_APURACAO } from "./apuracao.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * M08 — APURAÇÃO DO RESULTADO DO EXERCÍCIO (MCASP).
 *
 * ⚠️ A ÁLGEBRA, DERIVADA À MÃO ANTES DE CODAR (o prompt se embolou nela).
 *
 * Seja S(t) a LINHA SINTÉTICA do Balanço no corte t (VPA − VPD acumulado,
 * INCLUINDO o encerramento) e Normal(t) o acumulado só dos lançamentos normais.
 * O encerramento DEBITA as VPA e CREDITA as VPD, reduzindo S exatamente pelo
 * montante transferido ao PL. Logo:
 *
 *     S(t)  =  Normal(t) − Apurado(t)
 *     DVP   =  Normal(fim) − Normal(véspera)        [a DVP exclui o encerramento]
 *  ⟹  DVP  =  [ S(fim) − S(véspera) ] + ΔApurado(período)
 *
 * ═══ CENÁRIO (exercício 2026) — o mesmo do Anexo 15 ═══
 *   arrecada 8.000 (VPA) · liquida 2.000 (VPD, não paga)
 *   VPA 8.000 − VPD 2.000  =  RESULTADO 6.000,00
 *
 *   ANTES da apuração, em 31/12/2026:
 *     BP: ATIVO 8.000 (caixa) == PASSIVO 2.000 + PL 6.000 (sintética)
 *     DVP 2026 = 6.000
 *     D3: 6.000 == (6.000 − 0) + 0        ✓
 *
 *   DEPOIS da apuração:
 *     as classes 3 e 4 ZERAM; 6.000 vão para Resultados Acumulados (2.3.7)
 *     BP: ATIVO 8.000 == PASSIVO 2.000 + PL 6.000 (RESULTADOS ACUMULADOS)
 *         e a linha SINTÉTICA vira 0,00
 *     DVP 2026 = 6.000  (INALTERADA — o encerramento não é fato novo)
 *     D3: 6.000 == (0 − 0) + 6.000        ✓   ← a identidade nova
 *
 * ═══ EXERCÍCIO 2 (2027): mais 1.000 de VPA ═══
 *     BP 31/12/2027: ATIVO 9.000 == PASSIVO 2.000 + PL (9.500? NÃO:)
 *       Resultados Acumulados 6.000 + sintética 1.000 = 7.000
 *       9.000 == 2.000 + 7.000              ✓
 *     DVP 2027 = 1.000 · D3: 1.000 == (1.000 − 0) + 0   ✓
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "contabilidade@cg.pb.gov.br";
const FONTE = "fnt-500";
const FICHA = "ficha-corrente";
const NAT_RECEITA = "11130111";

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const RESULTADOS_ACUM = "2.3.7.1.1.00.00"; // classe 2 — Patrimônio Líquido
const VPD_USO = "3.3.2.1.1.01.00";
const VPA_IMPOSTOS = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";

const CONTAS = [
  // O `indicadorSuperavit` (art. 105) — exigido pelo quadro financeiro/permanente
  // do Anexo 14. A conta de PL (2.3) NÃO tem indicador de propósito: patrimônio
  // líquido não é passivo (art. 105, V) e não se classifica.
  { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-resacum", codigo: RESULTADOS_ACUM, nome: "Resultados acumulados", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: VPD_USO, nome: "VPD uso de bens", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: VPA_IMPOSTOS, nome: "VPA impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: C_LIQUIDADO, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({
  variacaoDiminutiva: VPD_USO, obrigacaoAPagar: FORNECEDOR,
  creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO,
});
const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA_IMPOSTOS,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});

const INICIO_2026 = new Date("2026-01-01T00:00:00Z");
const FIM_2026 = new Date("2026-12-31T23:59:59Z");
const INICIO_2027 = new Date("2027-01-01T00:00:00Z");
const FIM_2027 = new Date("2027-12-31T23:59:59Z");

let deps: M05Deps;
let exercicio2026: string;

const linhaBp = (b: Awaited<ReturnType<typeof balancoPatrimonial>>, codigo: string) =>
  b.grupos.flatMap((g) => g.linhas).find((l) => l.codigoLinha === codigo)!;

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
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços",
    },
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT_RECEITA, descricao: "IPTU" } });
  await prisma.fonteRecurso.create({
    data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
  });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE, valorDotado: "100000.00",
  });
  exercicio2026 = (
    await prisma.exercicio.findUniqueOrThrow({ where: { ano: 2026 }, select: { id: true } })
  ).id;

  // O ROTEIRO DE ENCERRAMENTO — a conta do PL que recebe o resultado, por PARÂMETRO.
  await prisma.roteiroEncerramento.create({
    data: { contaResultadosAcumuladosId: "c-resacum", criadoPor: POR },
  });

  // ANEXO 14 — note: PL.SOCIAL (2.3.1) e PL.RESULTADOS (2.3.7), sem sobreposição.
  const anexo14 = [
    { codigoLinha: "AC.CAIXA", rotulo: "Caixa e Equivalentes de Caixa", grupo: "ATIVO_CIRCULANTE", ordem: 1, prefixos: ["1.1"] },
    { codigoLinha: "PC.FORN", rotulo: "Fornecedores e Contas a Pagar a Curto Prazo", grupo: "PASSIVO_CIRCULANTE", ordem: 1, prefixos: ["2.1"] },
    { codigoLinha: "PL.SOCIAL", rotulo: "Patrimônio Social e Capital Social", grupo: "PATRIMONIO_LIQUIDO", ordem: 1, prefixos: ["2.3.1"] },
    { codigoLinha: "PL.RESULTADOS", rotulo: "Resultados Acumulados", grupo: "PATRIMONIO_LIQUIDO", ordem: 2, prefixos: ["2.3.7"] },
  ] as const;
  for (const l of anexo14) {
    await cadastrarLinhaDemonstrativo(prisma, {
      anexo: "ANEXO_14", ...l, prefixos: [...l.prefixos], criadoPor: POR,
    });
  }

  // ANEXO 15
  await cadastrarLinhaDemonstrativo(prisma, {
    anexo: "ANEXO_15", codigoLinha: "VPA.1", rotulo: "Impostos, Taxas e Contribuições de Melhoria",
    grupo: "VPA", ordem: 1, prefixos: ["4.1"], criadoPor: POR,
  });
  await cadastrarLinhaDemonstrativo(prisma, {
    anexo: "ANEXO_15", codigoLinha: "VPD.3", rotulo: "Uso de Bens, Serviços e Consumo de Capital Fixo",
    grupo: "VPD", ordem: 1, prefixos: ["3.3"], criadoPor: POR,
  });
}

/** O cenário de 2026: VPA 8.000 − VPD 2.000 = resultado 6.000. */
async function exercicioDe2026(): Promise<void> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: NAT_RECEITA, fonte: "500", valor: "8000.00",
      dataArrecadacao: new Date("2026-01-10T12:00:00Z"), numeroReceita: "GUIA-1",
      criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  const e = await empenhar(
    {
      fichaId: FICHA, numero: "NE-1", tipo: "ORDINARIO", valor: "2000.00",
      data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  await liquidar(
    {
      empenhoId: e.empenhoId, numero: "NL-1", valor: "2000.00",
      data: new Date("2026-02-10T12:00:00Z"), responsavelAtesto: "Fulano",
      historico: "liquidação", criadoPor: POR,
    },
    R_LIQUIDACAO,
    deps
  );
}

async function encerrar2026(): Promise<void> {
  await encerrarExercicioComRestos(prisma, { ano: 2026, encerradoPor: POR });
}

describe("M08 — apuração do resultado do exercício", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1 — A VIRADA
  it("t1: apurar zera a sintética e leva o resultado para Resultados Acumulados", async () => {
    await exercicioDe2026();

    // ── ANTES ────────────────────────────────────────────────────────────
    const antes = await balancoPatrimonial(prisma, FIM_2026);
    expect(antes.totalAtivo).toBe("8000.00");
    expect(antes.totalPassivo).toBe("2000.00");
    expect(antes.resultadoDoExercicio).toBe("6000.00"); // a sintética
    expect(linhaBp(antes, "PL.RESULTADOS").valor).toBe("0.00");

    const dvpAntes = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);
    expect(dvpAntes.resultadoPatrimonial).toBe("6000.00");

    // ── APURA ────────────────────────────────────────────────────────────
    await encerrar2026();
    const r = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });
    expect(r.resultadoApurado.toFixed(2)).toBe("6000.00");
    expect(r.contasZeradas).toBe(2); // a VPA e a VPD

    // ── DEPOIS ───────────────────────────────────────────────────────────
    const depois = await balancoPatrimonial(prisma, FIM_2026);
    // a SINTÉTICA zerou: as classes 3 e 4 foram encerradas
    expect(depois.resultadoDoExercicio).toBe("0.00");
    // e o resultado migrou para o PL
    expect(linhaBp(depois, "PL.RESULTADOS").valor).toBe("6000.00");
    // A1 continua fechando: 8.000 == 2.000 + 6.000
    expect(depois.totalAtivo).toBe("8000.00");
    expect(depois.totalPassivo).toBe("2000.00");
    expect(depois.totalPatrimonioLiquido).toBe("6000.00");

    // o lançamento tem NATUREZA própria
    const lanc = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId },
      include: { partidas: true },
    });
    expect(lanc.natureza).toBe("ENCERRAMENTO");
    expect(lanc.dataTransacao.toISOString()).toBe("2026-12-31T23:59:59.000Z");
    // 3 pernas: D VPA 8.000 / C VPD 2.000 / C Resultados Acumulados 6.000
    expect(lanc.partidas).toHaveLength(3);

    // ── A DVP NÃO MUDA, e o D3 fecha pela identidade NOVA ────────────────
    // 6.000 == (0 − 0) + 6.000
    const dvpDepois = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);
    expect(dvpDepois.resultadoPatrimonial).toBe("6000.00");
  });

  // t2 — O EXERCÍCIO SEGUINTE
  it("t2: no ano 2, o resultado do ano 1 NÃO aparece de novo (a dívida estrutural paga)", async () => {
    await exercicioDe2026();
    await encerrar2026();
    await apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR });

    // 2027: mais 1.000 de VPA
    await prisma.lancamentoContabil.create({
      data: {
        numeroControle: "REC-2027",
        dataTransacao: new Date("2027-03-10T12:00:00Z"),
        historico: "arrecadação de 2027",
        origemTipo: "TESTE",
        criadoPor: POR,
        partidas: {
          create: [
            { contaId: "c-caixa", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
            { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "1000.00" },
          ],
        },
      },
    });

    const bp = await balancoPatrimonial(prisma, FIM_2027);
    // ATIVO 8.000 + 1.000 = 9.000
    expect(bp.totalAtivo).toBe("9000.00");
    expect(bp.totalPassivo).toBe("2000.00");
    // a sintética traz SÓ o ano 2 (1.000) — não os dois anos somados
    expect(bp.resultadoDoExercicio).toBe("1000.00");
    // e o ano 1 está no PL, onde tem de estar
    expect(linhaBp(bp, "PL.RESULTADOS").valor).toBe("6000.00");
    // PL = 6.000 + 1.000 = 7.000; A1: 9.000 == 2.000 + 7.000
    expect(bp.totalPatrimonioLiquido).toBe("7000.00");

    // a DVP de 2027 vê só o que aconteceu em 2027
    const dvp = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2027, FIM_2027);
    expect(dvp.resultadoPatrimonial).toBe("1000.00");
    // ...e a de 2026 continua vendo os 6.000 dela
    const dvp26 = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);
    expect(dvp26.resultadoPatrimonial).toBe("6000.00");
  });

  // t3
  it("t3: apurar sem ENCERRAR é erro; SELECT prova zero lançamento", async () => {
    await exercicioDe2026();

    await expect(
      apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/NÃO está encerrado/);

    expect(
      await prisma.lancamentoContabil.count({ where: { origemTipo: ORIGEM_APURACAO } })
    ).toBe(0);
    expect(
      await prisma.lancamentoContabil.count({ where: { natureza: "ENCERRAMENTO" } })
    ).toBe(0);
  });

  it("t3b: sem ROTEIRO de encerramento, a apuração LANÇA e nada grava", async () => {
    await exercicioDe2026();
    await encerrar2026();
    await prisma.roteiroEncerramento.deleteMany({});

    await expect(
      apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/ROTEIRO DE ENCERRAMENTO NÃO PARAMETRIZADO/);

    expect(
      await prisma.lancamentoContabil.count({ where: { natureza: "ENCERRAMENTO" } })
    ).toBe(0);
  });

  // t4
  it("t4: apurar 2x cai em NADA A APURAR — o saldo governa, não uma flag", async () => {
    await exercicioDe2026();
    await encerrar2026();
    await apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR });

    await expect(
      apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR })
    ).rejects.toThrow(/NADA A APURAR/);

    // UMA operação, e só uma
    const lancs = await prisma.lancamentoContabil.findMany({
      where: { origemTipo: ORIGEM_APURACAO },
      select: { origemId: true },
    });
    expect(lancs).toHaveLength(1);
    expect(new Set(lancs.map((l) => l.origemId)).size).toBe(1);
  });

  // t5
  it("t5: o ESTORNO devolve o saldo às classes 3/4 — e a apuração pode ser REFEITA", async () => {
    await exercicioDe2026();
    await encerrar2026();
    const r = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });

    const est = await estornarApuracao(prisma, {
      operacaoId: r.operacaoId,
      motivo: "Apuração feita antes de lançar a última despesa do exercício.",
      criadoPor: POR,
    });
    expect(est.lancamentos).toHaveLength(1);

    // o estorno TAMBÉM é ENCERRAMENTO (senão a DVP contaria a reversão como fato)
    const lancEst = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: est.lancamentos[0]! },
      include: { partidas: true },
    });
    expect(lancEst.natureza).toBe("ENCERRAMENTO");
    // valores preservados, perna por perna
    expect(lancEst.partidas.map((p) => p.valor.toFixed(2)).sort()).toEqual(
      ["2000.00", "6000.00", "8000.00"]
    );

    // o estado VOLTA
    const bp = await balancoPatrimonial(prisma, FIM_2026);
    expect(bp.resultadoDoExercicio).toBe("6000.00"); // a sintética voltou
    expect(linhaBp(bp, "PL.RESULTADOS").valor).toBe("0.00");
    expect(bp.totalPatrimonioLiquido).toBe("6000.00"); // A1 continua fechando

    // a DVP nunca soube de nada disso
    const dvp = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);
    expect(dvp.resultadoPatrimonial).toBe("6000.00");

    // e agora a apuração PASSA de novo — o saldo voltou, e com ele a permissão
    const denovo = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });
    expect(denovo.resultadoApurado.toFixed(2)).toBe("6000.00");
    expect((await balancoPatrimonial(prisma, FIM_2026)).resultadoDoExercicio).toBe("0.00");

    // estornar 2x é erro
    await expect(
      estornarApuracao(prisma, {
        operacaoId: r.operacaoId, motivo: "Tentando estornar de novo.", criadoPor: POR,
      })
    ).rejects.toThrow(/já foi estornada/);
  });

  it("t5b: o duplo estorno é barrado pelo BANCO (INSERT direto driblando o serviço)", async () => {
    await exercicioDe2026();
    await encerrar2026();
    const r = await apurarResultadoDoExercicio(prisma, {
      exercicioId: exercicio2026, criadoPor: POR,
    });
    await estornarApuracao(prisma, {
      operacaoId: r.operacaoId, motivo: "Apuração prematura do exercício.", criadoPor: POR,
    });

    let erro: unknown;
    try {
      await prisma.lancamentoContabil.create({
        data: {
          numeroControle: "CLANDESTINO",
          dataTransacao: new Date("2026-12-31T23:59:59Z"),
          historico: "estorno clandestino",
          origemTipo: "ATAQUE",
          natureza: "ENCERRAMENTO",
          estornoDeId: r.lancamentoId, // JÁ estornado!
          criadoPor: "atacante",
          partidas: {
            create: [
              { contaId: "c-vpa", tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: "8000.00" },
              { contaId: "c-resacum", tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: "8000.00" },
            ],
          },
        },
      });
    } catch (e) {
      erro = e;
    }

    expect(erro).toBeDefined();
    console.log("\n>>> ERRO REAL DO POSTGRES (duplo estorno da apuração):\n" + String(erro) + "\n");
    expect(String(erro)).toMatch(/uq_estorno_unico|Unique constraint/i);
  });

  // t6
  it("t6: a DVP IGNORA o encerramento — literal idêntico antes e depois", async () => {
    await exercicioDe2026();

    const antes = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);

    await encerrar2026();
    await apurarResultadoDoExercicio(prisma, { exercicioId: exercicio2026, criadoPor: POR });

    const depois = await demonstracaoVariacoesPatrimoniais(prisma, INICIO_2026, FIM_2026);

    expect(depois.totalVPA).toBe(antes.totalVPA);
    expect(depois.totalVPD).toBe(antes.totalVPD);
    expect(depois.resultadoPatrimonial).toBe(antes.resultadoPatrimonial);
    // e os literais:
    expect(depois.totalVPA).toBe("8000.00");
    expect(depois.totalVPD).toBe("2000.00");
    expect(depois.resultadoPatrimonial).toBe("6000.00");
  });
});
