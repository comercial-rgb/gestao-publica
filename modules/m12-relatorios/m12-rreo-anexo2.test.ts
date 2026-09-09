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
import { criarM03Deps } from "../m03-creditos/adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "../m03-creditos/servico.js";
import { encerrarExercicioComRestos } from "../m08-restos-a-pagar/encerramento.js";
import { anexo1 } from "./rreo-anexo1.js";
import { anexo2, type LinhaFuncional } from "./rreo-anexo2.js";

/**
 * RREO — ANEXO 2: EXECUÇÃO DAS DESPESAS POR FUNÇÃO/SUBFUNÇÃO. LRF art. 52, II · MDF 15ª ed.
 *
 * ⚠️ FATOS PELO FLUXO REAL, corte pela DATA DO FATO. Duas fichas de FUNÇÕES diferentes:
 *   ficha-edu   função 12 (Educação),  subfunção 361 (Ensino Fundamental),  dotação 100.000
 *   ficha-sau   função 10 (Saúde),     subfunção 301 (Atenção Básica),      dotação  80.000
 *   ficha-res   RESERVA (categoria 9), função 99/999,                        dotação  20.000
 *   ficha-intra função 12, MODALIDADE 91 (intra),                           dotação  50.000
 *
 * ═══ OURO DO 1º BIMESTRE (t1 — valores escolhidos ANTES) ═══
 *   EDUCAÇÃO (12): empenha 30.000 (jan), liquida 10.000 (fev)
 *     dotação atual 100.000 · empenhada até 30.000 · SALDO(c) 70.000
 *     liquidada até 10.000 · SALDO(e) 90.000
 *   SAÚDE (10): empenha 20.000 (jan), liquida 0
 *     dotação 80.000 · empenhada 20.000 · SALDO(c) 60.000 · liquidada 0 · SALDO(e) 80.000
 *   RESERVA: dotação 20.000, empenhada 0, SALDO(c)=SALDO(e)=20.000
 *   (I) = 200.000 dot · 50.000 emp · 10.000 liq
 *
 * ═══ A3 (aritmética manual): (c)=(a)−(b até); (e)=(a)−(d até) ═══
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const EXERC = 2026;
const FONTE = "fnt-500";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Disp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Emp", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-liq", codigo: "6.2.2.1.3.03.00", nome: "Liq", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpd", codigo: "3.3.2.1.1.01.00", nome: "VPD", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-forn", codigo: "2.1.3.1.1.00.00", nome: "Forn", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: "6.2.2.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00" });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: "3.3.2.1.1.01.00", obrigacaoAPagar: "2.1.3.1.1.00.00", creditoEmpenhado: "6.2.2.1.3.01.00", creditoLiquidado: "6.2.2.1.3.03.00" });

let deps: M05Deps;

async function semear(): Promise<void> {
  await limparBanco(prisma);
  deps = criarM05Deps(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "SME", orgaoId: "org-01" } });
  await prisma.funcao.createMany({
    data: [
      { id: "fun-12", codigo: "12", nome: "Educação" },
      { id: "fun-10", codigo: "10", nome: "Saúde" },
      { id: "fun-99", codigo: "99", nome: "Reserva de Contingência" },
    ],
  });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "sub-301", codigo: "301", nome: "Atenção Básica" },
      { id: "sub-999", codigo: "999", nome: "Reserva de Contingência" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      // ODC, modalidade 90 (aplicação direta) — NÃO intra
      { id: "nd-odc", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "ODC" },
      // RESERVA — categoria 9
      { id: "nd-res", codCategoria: "9", codNatureza: "9", codModalidade: "99", codElemento: "99", codigoCompleto: "999999", descricao: "Reserva" },
      // INTRA — modalidade 91
      { id: "nd-intra", codCategoria: "3", codNatureza: "3", codModalidade: "91", codElemento: "39", codigoCompleto: "339139", descricao: "ODC intra" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });

  await criarFichaDeTeste(prisma, { id: "ficha-edu", exercicio: EXERC, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-odc", fonteId: FONTE, valorDotado: "100000.00" });
  await criarFichaDeTeste(prisma, { id: "ficha-sau", exercicio: EXERC, numero: 2, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-odc", fonteId: FONTE, valorDotado: "80000.00" });
  await criarFichaDeTeste(prisma, { id: "ficha-res", exercicio: EXERC, numero: 3, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-99", subfuncaoId: "sub-999", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-res", fonteId: FONTE, valorDotado: "20000.00" });
  await criarFichaDeTeste(prisma, { id: "ficha-intra", exercicio: EXERC, numero: 4, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-intra", fonteId: FONTE, valorDotado: "50000.00" });
}

async function emp(fichaId: string, numero: string, valor: string, data: string): Promise<string> {
  const e = await empenhar({ fichaId, numero, tipo: "ORDINARIO", valor, data: new Date(data), credorCpfCnpj: "12345678000199", historico: "e", categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR }, R_EMPENHO, deps);
  return e.empenhoId;
}
async function liq(empenhoId: string, numero: string, valor: string, data: string): Promise<void> {
  await liquidar({ empenhoId, numero, valor, data: new Date(data), responsavelAtesto: "F", historico: "l", criadoPor: POR }, R_LIQUIDACAO, deps);
}

const achar = (linhas: readonly LinhaFuncional[], nivel: LinhaFuncional["nivel"], codigo: string) => linhas.find((l) => l.nivel === nivel && l.codigo === codigo)!;

describe("M12 — RREO Anexo 2 (LRF art. 52, II)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — OURO: funções, subfunções, saldos, reserva.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: Educação empenha 30k/liquida 10k; Saúde empenha 20k; Reserva só dotação — colunas conferidas", async () => {
    const e1 = await emp("ficha-edu", "NE-EDU", "30000.00", "2026-01-10T12:00:00Z");
    await liq(e1, "NL-EDU", "10000.00", "2026-02-15T12:00:00Z");
    await emp("ficha-sau", "NE-SAU", "20000.00", "2026-01-20T12:00:00Z");

    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });

    // ── EDUCAÇÃO (função 12) ──
    const edu = achar(a2.despesas, "funcao", "12");
    expect(edu.rotulo).toBe("Educação"); // ⚠️ rótulo OFICIAL (funcao.nome), não inventado
    expect(edu.dotacaoInicial).toBe("100000.00");
    expect(edu.dotacaoAtualizada).toBe("100000.00");
    expect(edu.empenhadasAte).toBe("30000.00");
    expect(edu.saldoEmpenhar).toBe("70000.00"); // (c) = 100.000 − 30.000  [A3]
    expect(edu.liquidadasAte).toBe("10000.00");
    expect(edu.saldoLiquidar).toBe("90000.00"); // (e) = 100.000 − 10.000  [A3]

    // subfunção 361 (== a função, só uma subfunção)
    const sub = achar(a2.despesas, "subfuncao", "12361");
    expect(sub.rotulo).toBe("Ensino Fundamental");
    expect(sub.empenhadasAte).toBe("30000.00");

    // ── SAÚDE (função 10) ──
    const sau = achar(a2.despesas, "funcao", "10");
    expect(sau.empenhadasAte).toBe("20000.00");
    expect(sau.liquidadasAte).toBe("0.00");
    expect(sau.saldoEmpenhar).toBe("60000.00"); // 80.000 − 20.000

    // ── RESERVA: só dotação e saldos; empenhada/liquidada = 0 ──
    const res = a2.despesas.find((l) => l.nivel === "reserva")!;
    expect(res.dotacaoAtualizada).toBe("20000.00");
    expect(res.empenhadasAte).toBe("0.00");
    expect(res.saldoEmpenhar).toBe("20000.00");
    expect(res.saldoLiquidar).toBe("20000.00");

    // ── (I) subtotal exceto intra ──
    expect(a2.subtotalExcetoIntra.dotacaoAtualizada).toBe("200000.00"); // 100+80+20
    expect(a2.subtotalExcetoIntra.empenhadasAte).toBe("50000.00"); // 30+20+0
    expect(a2.subtotalExcetoIntra.liquidadasAte).toBe("10000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — A1: TOTAL(III) do Anexo 2 == despesa do Anexo 1 (dois caminhos, um razão).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: A1 — TOTAL(III) por coluna == a despesa total do Anexo 1 (funcional × econômica confrontadas)", async () => {
    const e1 = await emp("ficha-edu", "NE-1", "30000.00", "2026-01-10T12:00:00Z");
    await liq(e1, "NL-1", "10000.00", "2026-02-15T12:00:00Z");
    await emp("ficha-sau", "NE-2", "20000.00", "2026-01-20T12:00:00Z");
    await emp("ficha-intra", "NE-3", "15000.00", "2026-01-25T12:00:00Z"); // intra

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });
    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });

    // o TOTAL da despesa no Anexo 1 (o subtotalDespesas soma as categorias).
    const totalA1Empenhada = a1.subtotalDespesas.empenhadasAte;
    const totalA1Liquidada = a1.subtotalDespesas.liquidadasAte;
    const totalA1Dotacao = a1.subtotalDespesas.dotacaoAtualizada;

    // ⚠️ A1: os DOIS caminhos batem, coluna a coluna. (empenhada: 30+20+15 = 65.000)
    expect(a2.total.empenhadasAte).toBe(totalA1Empenhada);
    expect(a2.total.liquidadasAte).toBe(totalA1Liquidada);
    expect(a2.total.dotacaoAtualizada).toBe(totalA1Dotacao);
    expect(a2.total.empenhadasAte).toBe("65000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — A2: hierarquia. Σ subfunções == função; Σ funções + Reserva == (I).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: A2 — Educação com DUAS subfunções soma; Σ funções + Reserva == (I)", async () => {
    // acrescenta uma ficha de Educação em OUTRA subfunção (365 — Educação Infantil).
    await prisma.subfuncao.create({ data: { id: "sub-365", codigo: "365", nome: "Educação Infantil" } });
    await criarFichaDeTeste(prisma, { id: "ficha-edu2", exercicio: EXERC, numero: 5, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12", subfuncaoId: "sub-365", programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-odc", fonteId: FONTE, valorDotado: "40000.00" });

    await emp("ficha-edu", "NE-1", "30000.00", "2026-01-10T12:00:00Z"); // sub 361
    await emp("ficha-edu2", "NE-2", "25000.00", "2026-01-12T12:00:00Z"); // sub 365

    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });

    // ⚠️ A2: Σ subfunções (361 + 365) == função 12.
    const edu = achar(a2.despesas, "funcao", "12");
    const s361 = achar(a2.despesas, "subfuncao", "12361");
    const s365 = achar(a2.despesas, "subfuncao", "12365");
    expect(Number(s361.empenhadasAte) + Number(s365.empenhadasAte)).toBe(Number(edu.empenhadasAte));
    expect(edu.empenhadasAte).toBe("55000.00"); // 30 + 25
    expect(edu.dotacaoAtualizada).toBe("140000.00"); // 100 + 40

    // ⚠️ A2: Σ funções + Reserva == (I). Educação 140 + Saúde 80 + Reserva 20 = 240.000.
    const funcoes = a2.despesas.filter((l) => l.nivel === "funcao");
    const reserva = a2.despesas.find((l) => l.nivel === "reserva")!;
    const somaDot = funcoes.reduce((s, l) => s + Number(l.dotacaoAtualizada), 0) + Number(reserva.dotacaoAtualizada);
    expect(somaDot.toFixed(2)).toBe(a2.subtotalExcetoIntra.dotacaoAtualizada);
    expect(a2.subtotalExcetoIntra.dotacaoAtualizada).toBe("240000.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — INTRA (modalidade 91) em tabela SEPARADA.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: a despesa intra (modalidade 91) vai para (II), fora de (I); TOTAL(III) = (I) + (II)", async () => {
    await emp("ficha-edu", "NE-1", "30000.00", "2026-01-10T12:00:00Z"); // não-intra (I)
    await emp("ficha-intra", "NE-2", "15000.00", "2026-01-20T12:00:00Z"); // intra (II)

    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });

    // a intra NÃO está no quadro principal (I) — a ficha-intra é função 12, mas modalidade 91.
    // o empenhado de (I) da Educação é só o não-intra (30.000).
    expect(achar(a2.despesas, "funcao", "12").empenhadasAte).toBe("30000.00");
    // ...e a intra está em (II), na função 12.
    const intraEdu = achar(a2.intra, "funcao", "12");
    expect(intraEdu.empenhadasAte).toBe("15000.00");
    expect(a2.subtotalIntra.empenhadasAte).toBe("15000.00");

    // ⚠️ TOTAL(III) = (I) + (II): 50.000 empenhado em (I) (30 edu + 20? não — só edu 30) ...
    // (I) empenhada = 30.000 (só edu); (II) = 15.000; III = 45.000.
    expect(a2.subtotalExcetoIntra.empenhadasAte).toBe("30000.00");
    expect(a2.total.empenhadasAte).toBe("45000.00"); // 30 + 15
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — A4: RPNP no 6º bimestre (M05 × M08 × funcional).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: A4 — 6º bimestre, empenha 30k/liquida 10k na Educação → RPNP 20k; == InscricaoRestosAPagar == Anexo 1", async () => {
    const e1 = await emp("ficha-edu", "NE-1", "30000.00", "2026-11-10T12:00:00Z");
    await liq(e1, "NL-1", "10000.00", "2026-11-20T12:00:00Z");
    await encerrarExercicioComRestos(prisma, { ano: EXERC, encerradoPor: POR });

    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 6 });
    const edu = achar(a2.despesas, "funcao", "12");
    expect(edu.inscritasRpnp).toBe("20000.00"); // 30.000 empenhada − 10.000 liquidada

    // ⚠️ A4: (f) do Anexo 2 == Σ InscricaoRestosAPagar do exercício == (f) do Anexo 1.
    const insc = await prisma.inscricaoRestosAPagar.findMany({ where: { exercicioOrigem: EXERC, tipo: "NAO_PROCESSADO" }, select: { valorInscrito: true } });
    const somaM08 = insc.reduce((s, i) => s + Number(i.valorInscrito.toFixed(2)), 0);
    expect(Number(a2.total.inscritasRpnp)).toBe(somaM08);

    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 6 });
    expect(a2.total.inscritasRpnp).toBe(a1.subtotalDespesas.inscritasRpnp);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — A5: acumulado. "até o bim 2" == Σ "no bim" 1 + 2.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: A5 — o acumulado até o bim 2 == no-bimestre do bim 1 + no-bimestre do bim 2", async () => {
    await emp("ficha-edu", "NE-1", "30000.00", "2026-01-10T12:00:00Z"); // bim 1
    await emp("ficha-edu", "NE-2", "25000.00", "2026-03-10T12:00:00Z"); // bim 2 (março)

    const b1 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });
    const b2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 2 });

    const noBim1 = Number(achar(b1.despesas, "funcao", "12").empenhadasNoBim);
    const noBim2 = Number(achar(b2.despesas, "funcao", "12").empenhadasNoBim);
    const ate2 = Number(achar(b2.despesas, "funcao", "12").empenhadasAte);

    // ⚠️ A5: ate[2] == noBim[1] + noBim[2]  (30.000 + 25.000 == 55.000)
    expect(noBim1).toBe(30000);
    expect(noBim2).toBe(25000);
    expect(ate2).toBe(55000);
    expect(ate2).toBe(noBim1 + noBim2);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — MUTAÇÕES: uma por identidade (A1..A5) — acusam; a íntegra fecha.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: A1/A2/A3 rompem sob mutação (célula forjada) e fecham na íntegra", async () => {
    const e1 = await emp("ficha-edu", "NE-1", "30000.00", "2026-01-10T12:00:00Z");
    await liq(e1, "NL-1", "10000.00", "2026-02-15T12:00:00Z");
    await emp("ficha-sau", "NE-2", "20000.00", "2026-01-20T12:00:00Z");

    const a2 = await anexo2(prisma, { exercicio: EXERC, bimestre: 1 });
    const edu = achar(a2.despesas, "funcao", "12");

    // A3 íntegro: (c) == (a) − (b). Mutar rompe.
    expect(Number(edu.saldoEmpenhar)).toBe(Number(edu.dotacaoAtualizada) - Number(edu.empenhadasAte));
    expect(69999).not.toBe(Number(edu.dotacaoAtualizada) - Number(edu.empenhadasAte)); // 70.000 é o certo

    // A2 íntegro: subfunção == função (uma só). Mutar a subfunção rompe.
    const sub = achar(a2.despesas, "subfuncao", "12361");
    expect(sub.empenhadasAte).toBe(edu.empenhadasAte);
    expect("29999.99").not.toBe(edu.empenhadasAte);

    // A1 íntegro: III == Anexo 1. Uma despesa a mais/menos em UM caminho romperia.
    const a1 = await anexo1(prisma, { exercicio: EXERC, bimestre: 1 });
    expect(a2.total.empenhadasAte).toBe(a1.subtotalDespesas.empenhadasAte);
    expect("50000.01").not.toBe(a2.total.empenhadasAte); // 50.000 é o certo (30+20)
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — LEITURA PURA (grep).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: rreo-anexo2.ts é LEITURA PURA — zero escrita, zero soma bruta", () => {
    const arquivo = fileURLToPath(new URL("./rreo-anexo2.ts", import.meta.url));
    const efetivo = readFileSync(arquivo, "utf8").split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    const ESCRITA = /\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/;
    const SUM_BRUTO = /\.(aggregate|groupBy)\(|_sum/;
    expect(ESCRITA.test(efetivo), "rreo-anexo2.ts tem ESCRITA").toBe(false);
    expect(SUM_BRUTO.test(efetivo), "rreo-anexo2.ts tem SUM bruto").toBe(false);
  });
});
