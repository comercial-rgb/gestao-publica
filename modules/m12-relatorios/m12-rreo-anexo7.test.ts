import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, roteiroLiquidacao } from "../m05-despesa/dominio.js";
import { empenhar } from "../m05-despesa/servico.js";
import { liquidar } from "../m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import {
  roteiroCancelamentoRestos,
  roteiroLiquidacaoRestos,
  roteiroPagamentoRestos,
} from "../m08-restos-a-pagar/dominio.js";
import {
  cancelarRestosAPagar,
  liquidarRestosAPagar,
  pagarRestosAPagar,
} from "../m08-restos-a-pagar/restos.js";
import { anexo7, type LinhaAnexo7 } from "./rreo-anexo7.js";

/**
 * RREO — ANEXO 7: RESTOS A PAGAR POR PODER E ÓRGÃO. LRF art. 53, V · MDF Tabela 7.
 *
 * ═══ CENÁRIO OURO (ref 2026), FLUXO REAL (empenhar → [liquidar] → encerrar → RP ops) ═══
 * As inscrições atravessam DOIS encerramentos (2024 e 2025):
 *   A  PROC-2024   EXEC/02:  emp 1.000, liq 1.000 → PROCESSADO 1.000 (bloco 1, col a). Em 2026 paga 400.
 *   C  RPNP-2024   EXEC/02:  emp 1.000 → RPNP 1.000. Em 2025 liquida 1.000 e paga 700 → em 2026
 *                            MIGRA para o bloco 1 (liquidado em ex. anterior), col a = abertura 300.
 *   B  RPNP-2025   EXEC/02:  emp 1.000 → RPNP 1.000 (col g). Em 2026 liquida 1.000 (h) e paga 700 (i) → k=300.
 *   F  PROC-2024   EXEC/03:  emp 100, liq 100 → PROCESSADO 100 (bloco 1, col a). Sem movimento em 2026.
 *   D  PROC-2025   LEG/01:   emp 500, liq 500 → PROCESSADO 500 (bloco 1, col b). Em 2026 cancela 100.
 *   E  RPNP-2025   EXEC/02 INTRA (mod. 91): emp 200 → RPNP 200 (col g, tabela II). Sem movimento em 2026.
 *
 *   EXEC/02 (I): a=1.300(A 1000+C 300) c=400 e=900 · g=1.000 h=1.000 i=700 k=300 · l=1.200
 *   EXEC/03 (I): a=100 e=100 l=100
 *   LEG/01  (I): b=500 d=100 e=400 l=400
 *   (I)  = a=1.400 b=500 c=400 d=100 e=1.400 · g=1.000 h=1.000 i=700 k=300 · l=1.700
 *   (II) = EXEC/02 intra: g=200 k=200 l=200
 *   (III)= a=1.400 b=500 c=400 d=100 e=1.400 · g=1.200 h=1.000 i=700 k=500 · l=1.900
 *
 * ═══ IDENTIDADES (literais escolhidos ANTES; mutação no t5) ═══
 *   R1 e=(a+b)−(c+d) · k=(f+g)−(i+j) · l=e+k     R2 Σórgãos==poder · Σpoderes==(I) · (III)=(I)+(II)
 *   R3 (III).g == Σ RPNP inscritos no encerramento 2025    R4 (d)+(j) == cancelamento de RP de 2026 (M08)
 *   R5 migração: C no bloco 2 em ref 2025, no bloco 1 em ref 2026 (mesmos dados)
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br"; // usuário de fixtures (TR 4.55)
const FONTE = "fnt-500";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Forn", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // Bancos e a VPA de desincorporação (PCASP 4.6.4) — as contas CERTAS das pernas
  // patrimoniais do pagamento e do cancelamento de RP. Ver MODULO.md do M01.
  { id: "c-caixa", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true, indicadorSuperavit: "F" as const },
  { id: "c-vpa-desinc", codigo: "4.6.4.1.1.00.00", nome: "Ganhos com Desincorporação de Passivos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMP = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQ = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });
const R_LIQ_RP = roteiroLiquidacaoRestos({ variacaoDiminutiva: "3.3.2.1.1.01.00", restosAPagarProcessados: "2.1.3.1.1.00.00" });
const R_PAG_RP = roteiroPagamentoRestos({ restosAPagarProcessados: "2.1.3.1.1.00.00", disponibilidade: "1.1.1.1.2.00.00" });
const R_CANC_RP = roteiroCancelamentoRestos({ restosAPagar: "2.1.3.1.1.00.00", variacaoAumentativa: "4.6.4.1.1.00.00" });

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.createMany({
    data: [
      { id: "org-01", codigo: "01", nome: "Câmara Municipal" },
      { id: "org-02", codigo: "02", nome: "Prefeitura" },
      { id: "org-03", codigo: "03", nome: "Secretaria de Educação" },
      { id: "org-09", codigo: "09", nome: "Órgão sem poder" },
    ],
  });
  await prisma.unidadeOrcamentaria.createMany({
    data: [
      { id: "uo-01", codigo: "01001", descricao: "Câmara", orgaoId: "org-01" },
      { id: "uo-02", codigo: "02001", descricao: "Gabinete", orgaoId: "org-02" },
      { id: "uo-03", codigo: "03001", descricao: "Educação", orgaoId: "org-03" },
      { id: "uo-09", codigo: "09001", descricao: "Sem poder", orgaoId: "org-09" },
    ],
  });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm Geral" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0001", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd90", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC" },
      { id: "nd91", codCategoria: "3", codNatureza: "3", codModalidade: "91", codElemento: "39", codigoCompleto: "339139", descricao: "ODC intra" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Livre", fonteId: FONTE } });
  // exercícios abertos (2024/2025 serão encerrados nos testes; 2026 recebe as RP ops).
  for (const ano of [2024, 2025, 2026]) {
    await prisma.exercicio.upsert({ where: { ano }, update: {}, create: { ano, criadoPor: "TESTE" } });
  }
  // o de-para órgão → poder (fail-closed): 09 fica de FORA de propósito.
  await prisma.deParaOrgaoPoder.createMany({
    data: [
      { orgaoCodigo: "01", poder: "LEGISLATIVO", criadoPor: "TESTE" },
      { orgaoCodigo: "02", poder: "EXECUTIVO", criadoPor: "TESTE" },
      { orgaoCodigo: "03", poder: "EXECUTIVO", criadoPor: "TESTE" },
    ],
  });
}

let seqFicha = 0;
async function criarFicha(ano: number, orgaoId: string, unidadeOrcId: string, naturezaDespesaId: string): Promise<string> {
  const id = `ficha-${++seqFicha}`;
  await criarFichaDeTeste(prisma, {
    id, exercicio: ano, numero: seqFicha, orgaoId, unidadeOrcId,
    funcaoId: "fun-04", subfuncaoId: "sub-122", programaId: "prg", acaoId: "aca",
    naturezaDespesaId, fonteId: FONTE, valorDotado: "100000.00",
  });
  return id;
}

let seq = 0;
const dataDe = (ano: number, mes = 6) => new Date(Date.UTC(ano, mes - 1, 15, 12, 0, 0));

type Categoria = "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
// ⚠️ Empenhos PAGOS ganham categorias DISTINTAS: cada um fica sozinho na sua fila do art. 141
// (M06), senão o guard da ordem cronológica barra o pagamento fora de ordem. Os não-pagos
// (cancelados/só-empenhados) partilham uma categoria: sem pagamento, não há ordem a checar.
async function empenhar1(fichaId: string, valor: string, ano: number, categoria: Categoria = "REALIZACAO_OBRAS"): Promise<string> {
  const n = `NE-${++seq}`;
  const e = await empenhar(
    { fichaId, numero: n, tipo: "ORDINARIO", valor, data: dataDe(ano), credorCpfCnpj: "12345678000199", historico: n, categoriaOrdemCronologica: categoria, criadoPor: POR },
    R_EMP, deps
  );
  return e.empenhoId;
}
async function liquidar1(empenhoId: string, valor: string, ano: number): Promise<string> {
  const n = `NL-${++seq}`;
  const l = await liquidar({ empenhoId, numero: n, valor, data: dataDe(ano, 8), responsavelAtesto: "F", historico: n, criadoPor: POR }, R_LIQ, deps);
  return l.liquidacaoId;
}
const encerrar = (ano: number) => encerrarExercicioComRestos(prisma, { ano, encerradoPor: POR });

async function liquidarRP(empenhoId: string, valor: string, ano: number): Promise<string> {
  const n = `RPL-${++seq}`;
  const r = await liquidarRestosAPagar(prisma, { empenhoId, numero: n, valor, data: dataDe(ano, 3), responsavelAtesto: "F", historico: n, criadoPor: POR }, R_LIQ_RP);
  return r.liquidacaoId;
}
async function pagarRP(liquidacaoId: string, valor: string, ano: number): Promise<void> {
  const n = `RPP-${++seq}`;
  await pagarRestosAPagar(prisma, { liquidacaoId, numero: n, valor, data: dataDe(ano, 5), contaBancaria: "CC-001", fonteId: FONTE, historico: n, criadoPor: POR }, R_PAG_RP);
}
async function cancelarRP(empenhoId: string, valor: string, ano: number): Promise<void> {
  const insc = await prisma.inscricaoRestosAPagar.findFirstOrThrow({ where: { empenhoId }, select: { id: true } });
  await cancelarRestosAPagar(prisma, { inscricaoId: insc.id, valor, motivo: "cancelamento de teste do Anexo 7", data: dataDe(ano, 7), criadoPor: POR }, R_CANC_RP);
}

/** Monta o cenário ouro completo (A..F). Empenhos da mesma classificação vivem na MESMA ficha
 *  (o unique da FichaOrcamentaria é da classificação, não do número): A e C dividem a ficha EXEC/02. */
async function montarOuro(): Promise<void> {
  // ── 2024: A (proc) e C (rpnp) na ficha EXEC/02; F (proc) na ficha EXEC/03 ──
  const fExec02_24 = await criarFicha(2024, "org-02", "uo-02", "nd90");
  const eA = await empenhar1(fExec02_24, "1000.00", 2024, "FORNECIMENTO_BENS"); // A pago em 2026
  await liquidar1(eA, "1000.00", 2024); // A → PROCESSADO 1000
  const eC = await empenhar1(fExec02_24, "1000.00", 2024, "PRESTACAO_SERVICOS"); // C pago em 2025
  const fExec03_24 = await criarFicha(2024, "org-03", "uo-03", "nd90");
  const eF = await empenhar1(fExec03_24, "100.00", 2024); // F não é pago
  await liquidar1(eF, "100.00", 2024); // F → PROCESSADO 100
  await encerrar(2024);

  // ── 2025: C migra (liquida RP 1.000, paga 700) ──
  const lC = await liquidarRP(eC, "1000.00", 2025);
  await pagarRP(lC, "700.00", 2025);

  // ── 2025: B (rpnp EXEC/02), D (proc LEG/01), E (rpnp intra EXEC/02) ──
  const fExec02_25 = await criarFicha(2025, "org-02", "uo-02", "nd90");
  const eB = await empenhar1(fExec02_25, "1000.00", 2025, "LOCACAO"); // B pago em 2026 → RPNP
  const fLeg01_25 = await criarFicha(2025, "org-01", "uo-01", "nd90");
  const eD = await empenhar1(fLeg01_25, "500.00", 2025);
  await liquidar1(eD, "500.00", 2025); // D → PROCESSADO 500
  const fExec02i_25 = await criarFicha(2025, "org-02", "uo-02", "nd91"); // intra (mod. 91)
  await empenhar1(fExec02i_25, "200.00", 2025); // E → RPNP 200
  await encerrar(2025);

  // ── 2026: A paga 400 (contra a liquidação original), B liquida 1.000 e paga 700, D cancela 100 ──
  const liqA = await prisma.liquidacao.findFirstOrThrow({ where: { empenhoId: eA }, select: { id: true } });
  await pagarRP(liqA.id, "400.00", 2026);
  const lB = await liquidarRP(eB, "1000.00", 2026);
  await pagarRP(lB, "700.00", 2026);
  await cancelarRP(eD, "100.00", 2026);
}

const achar = (linhas: readonly LinhaAnexo7[], chave: string) => linhas.find((l) => l.chave === chave)!;

describe("M12 — RREO Anexo 7 (Restos a Pagar por Poder e Órgão)", () => {
  beforeEach(async () => {
    seq = 0;
    seqFicha = 0;
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO ref 2026: R1, R2, R3 e a hierarquia.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: (I)/(II)/(III) fecham; poderes e órgãos batem; R1/R2/R3", async () => {
    await montarOuro();
    const a7 = await anexo7(prisma, { exercicio: 2026 });

    // ── EXEC/02 ──
    const o02 = achar(a7.excetoIntra, "EXECUTIVO:02");
    expect(o02.inscExAnterioresB1).toBe("1300.00"); // a = A 1000 + C 300
    expect(o02.pagosB1).toBe("400.00"); // c
    expect(o02.saldoB1).toBe("900.00"); // e = (1300+0)−(400+0)
    expect(o02.inscAnoAnteriorB2).toBe("1000.00"); // g (B)
    expect(o02.liquidadosB2).toBe("1000.00"); // h (informativa)
    expect(o02.pagosB2).toBe("700.00"); // i
    expect(o02.saldoB2).toBe("300.00"); // k = (0+1000)−(700+0)
    expect(o02.saldoTotal).toBe("1200.00"); // l

    // ── EXEC/03 e o PODER EXECUTIVO = Σ órgãos (R2) ──
    const o03 = achar(a7.excetoIntra, "EXECUTIVO:03");
    expect(o03.saldoTotal).toBe("100.00");
    const exec = achar(a7.excetoIntra, "EXECUTIVO");
    expect(exec.inscExAnterioresB1).toBe("1400.00"); // R2: 1300 + 100
    expect(exec.saldoTotal).toBe("1300.00"); // 1200 + 100

    // ── LEG/01 ──
    const leg = achar(a7.excetoIntra, "LEGISLATIVO");
    expect(leg.inscAnoAnteriorB1).toBe("500.00"); // b (D)
    expect(leg.canceladosB1).toBe("100.00"); // d
    expect(leg.saldoB1).toBe("400.00"); // e = 500 − 100
    expect(leg.saldoTotal).toBe("400.00");

    // ── (I) = Σ poderes (R2) ──
    expect(a7.subtotalExcetoIntra.saldoTotal).toBe("1700.00"); // 1300 + 400
    expect(a7.subtotalExcetoIntra.inscExAnterioresB1).toBe("1400.00");

    // ── (II) intra ──
    expect(a7.subtotalIntra.inscAnoAnteriorB2).toBe("200.00"); // g (E)
    expect(a7.subtotalIntra.saldoTotal).toBe("200.00");

    // ── (III) = (I) + (II) (R2) ──
    expect(a7.total.saldoTotal).toBe("1900.00"); // 1700 + 200
    expect(a7.total.inscAnoAnteriorB2).toBe("1200.00"); // g = 1000 + 200

    // ── R3: (III).g == Σ RPNP inscritos no encerramento 2025 ──
    const npInscritos2025 = await prisma.inscricaoRestosAPagar.findMany({
      where: { exercicioOrigem: 2025, tipo: "NAO_PROCESSADO" },
      select: { valorInscrito: true },
    });
    const somaNp = npInscritos2025.reduce((acc, i) => acc + Number(i.valorInscrito), 0);
    expect(somaNp).toBe(1200); // B 1000 + E 200
    expect(Number(a7.total.inscAnoAnteriorB2)).toBe(somaNp); // R3

    // ── R1 em TODA linha ──
    for (const l of [...a7.excetoIntra, a7.subtotalExcetoIntra, ...a7.intra, a7.subtotalIntra, a7.total]) {
      const e = (Number(l.inscExAnterioresB1) + Number(l.inscAnoAnteriorB1)) - (Number(l.pagosB1) + Number(l.canceladosB1));
      const k = (Number(l.inscExAnterioresB2) + Number(l.inscAnoAnteriorB2)) - (Number(l.pagosB2) + Number(l.canceladosB2));
      expect(Number(l.saldoB1)).toBeCloseTo(e, 2);
      expect(Number(l.saldoB2)).toBeCloseTo(k, 2);
      expect(Number(l.saldoTotal)).toBeCloseTo(e + k, 2);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — R4: (d)+(j) == cancelamento de RP de 2026 (a MESMA fonte do MANAD).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: R4 — cancelados (d)+(j) == Σ cancelamento de RP de 2026 (MovimentoRestosAPagar)", async () => {
    await montarOuro();
    const a7 = await anexo7(prisma, { exercicio: 2026 });

    const doAnexo = Number(a7.total.canceladosB1) + Number(a7.total.canceladosB2);
    expect(doAnexo).toBe(100);

    // a MESMA fonte que o MANAD usa: MovimentoRestosAPagar CANCELAMENTO − ESTORNO, por dataTransacao 2026.
    const movs = await prisma.movimentoRestosAPagar.findMany({
      where: { tipo: { in: ["CANCELAMENTO", "ESTORNO_CANCELAMENTO"] } },
      select: { tipo: true, valor: true, lancamento: { select: { dataTransacao: true } } },
    });
    const doM08 = movs
      .filter((m) => m.lancamento?.dataTransacao.getUTCFullYear() === 2026)
      .reduce((acc, m) => acc + (m.tipo === "CANCELAMENTO" ? Number(m.valor) : -Number(m.valor)), 0);
    expect(doM08).toBe(100);
    expect(doAnexo).toBe(doM08); // R4
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — R5: MIGRAÇÃO. Mesmos dados de C, dois anos de referência.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: R5 — C (RPNP-2024 liquidado em 2025) está no BLOCO 2 em ref 2025 e no BLOCO 1 em ref 2026", async () => {
    const fC = await criarFicha(2024, "org-02", "uo-02", "nd90");
    const eC = await empenhar1(fC, "1000.00", 2024);
    await encerrar(2024);
    const lC = await liquidarRP(eC, "1000.00", 2025);
    await pagarRP(lC, "700.00", 2025);
    await encerrar(2025);

    // ref 2025: liquidado NO ano → BLOCO 2. g=1000, h=1000, i=700, k=300; bloco 1 vazio.
    const r25 = await anexo7(prisma, { exercicio: 2025 });
    const o25 = achar(r25.excetoIntra, "EXECUTIVO:02");
    expect(o25.inscAnoAnteriorB2).toBe("1000.00"); // g (exercicioOrigem 2024 == 2025−1)
    expect(o25.liquidadosB2).toBe("1000.00"); // h
    expect(o25.pagosB2).toBe("700.00"); // i
    expect(o25.saldoB2).toBe("300.00"); // k
    expect(o25.saldoB1).toBe("0.00"); // bloco 1 vazio

    // ref 2026: liquidado em ex. ANTERIOR → MIGRA para o BLOCO 1. a=300 (abertura), e=300; bloco 2 vazio.
    const r26 = await anexo7(prisma, { exercicio: 2026 });
    const o26 = achar(r26.excetoIntra, "EXECUTIVO:02");
    expect(o26.inscExAnterioresB1).toBe("300.00"); // a (exercicioOrigem 2024 < 2025) = 1000 − 700
    expect(o26.saldoB1).toBe("300.00"); // e
    expect(o26.saldoB2).toBe("0.00"); // bloco 2 vazio
    expect(o26.saldoTotal).toBe("300.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — FAIL-CLOSED: órgão com RP e sem poder mapeado PARA o gerador, nomeando-o.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: órgão sem poder mapeado (09) faz o Anexo 7 PARAR nomeando o órgão", async () => {
    const f = await criarFicha(2024, "org-09", "uo-09", "nd90"); // órgão 09 NÃO está no de-para
    const e = await empenhar1(f, "500.00", 2024);
    await liquidar1(e, "500.00", 2024);
    await encerrar(2024);

    await expect(anexo7(prisma, { exercicio: 2026 })).rejects.toThrow(/órgão "09".*mapeado a um Poder/s);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — MUTAÇÃO: uma célula forjada rompe R1 e R2.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: os literais errados NÃO batem (R1, R2 gritam)", async () => {
    await montarOuro();
    const a7 = await anexo7(prisma, { exercicio: 2026 });

    // R1: e = (a+b)−(c+d). Uma célula forjada quebra.
    const exec = achar(a7.excetoIntra, "EXECUTIVO");
    expect("999.99").not.toBe(exec.saldoB1); // 1000.00 é o certo (1400 − 400)
    // R2: (III) == (I) + (II).
    expect(Number(a7.total.saldoTotal)).toBe(Number(a7.subtotalExcetoIntra.saldoTotal) + Number(a7.subtotalIntra.saldoTotal));
    expect(1899.99).not.toBe(Number(a7.total.saldoTotal)); // 1900 é o certo
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — LEITURA PURA (grep): zero escrita, zero soma bruta no motor.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: rreo-anexo7.ts é LEITURA PURA — zero escrita, zero SUM bruto", () => {
    const arquivo = fileURLToPath(new URL("./rreo-anexo7.ts", import.meta.url));
    const efetivo = readFileSync(arquivo, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;
    expect(ESCRITA.test(efetivo), "rreo-anexo7.ts tem ESCRITA").toBe(false);
    expect(SUM_BRUTO.test(efetivo), "rreo-anexo7.ts tem SUM bruto").toBe(false);
  });
});
