import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho, type RoteiroContabil } from "../m05-despesa/dominio.js";
import { anularEmpenho, empenhar } from "../m05-despesa/servico.js";
import type { M05Deps } from "../m05-despesa/ports.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import {
  confrontoMba,
  gerarDecretoCmd,
  liberarProgramacao,
  proporCmdDaLoa,
  registrarEventoLimitacao,
  registrarVersaoCmd,
} from "./programacao.js";
import {
  distribuirEmParcelas,
  gerarTextoDecreto,
} from "./programacao-dominio.js";
import { criarReceitaPrevista } from "./servico.js";
import { criarM02Deps } from "./adapter-prisma.js";

/**
 * M02 — CMD, MBA e limitação de empenho (TR 4.18/4.19/4.43/4.44 · art. 8º/9º LRF).
 *
 * ═══ A ARITMÉTICA QUE FECHA AO CENTAVO (t1 — o coração) ═══
 *   previsão 120.000 / 12  →  12 cotas de 10.000,00        (Σ = 120.000,00 exato)
 *   previsão 100.000 / 12  →  11 × 8.333,33 + 8.333,37     (Σ = 100.000,00 exato)
 *                                                   ↑ a última absorve o resto (4 centavos)
 *
 * ═══ O GUARD DO 4.43, POR MÊS (t3) ═══
 *   cota jan = 10.000 · empenhos 9.000 + 1.000 passam (== teto) · +0,01 rejeita
 *   fevereiro é INDEPENDENTE — não herda a sobra de janeiro (a cota NÃO rola).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "orcamento@cg.pb.gov.br";
const EXERC = 2026;

const FONTE_A = "fnt-500";
const FONTE_B = "fnt-540";

// contas do empenho
const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  // contas da arrecadação (para o MBA)
  { id: "c-caixa", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.1.1.00.00", nome: "VPA", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-rar", codigo: "5.2.1.1.1.00.00", nome: "Receita a Realizar", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-rr", codigo: "6.2.1.1.1.00.00", nome: "Receita Realizada", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];

const R_EMPENHO: RoteiroContabil = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});
const R_ARREC = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.2.00.00",
  variacaoAumentativa: "4.1.1.1.1.00.00",
  receitaARealizar: "5.2.1.1.1.00.00",
  receitaRealizada: "6.2.1.1.1.00.00",
});
const NAT = "11130111";

let deps: M05Deps;

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
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "M", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ" },
      // ⚠️ a2 difere de a1 na NATUREZA (senão a uq_ficha_sagres colide — mesma fonte A).
      { id: "nd2", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material" },
    ],
  });
  await prisma.naturezaReceita.create({ data: { id: "nr", codigo: NAT, descricao: "IPTU" } });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_A, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: FONTE_B, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });
  // duas fichas da fonte A (para a corrida t7) + uma da fonte B (para t5)
  for (const [id, numero, nd] of [["ficha-a1", 1, "nd"], ["ficha-a2", 2, "nd2"]] as const) {
    await criarFichaDeTeste(prisma, {
      id, exercicio: EXERC, numero, orgaoId: "org-01", unidadeOrcId: "uo-01",
      funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
      naturezaDespesaId: nd, fonteId: FONTE_A, valorDotado: "100000.00",
    });
  }
  await criarFichaDeTeste(prisma, {
    id: "ficha-b1", exercicio: EXERC, numero: 3, orgaoId: "org-01", unidadeOrcId: "uo-01",
    funcaoId: "fun-12", subfuncaoId: "sub-361", programaId: "prg", acaoId: "aca",
    naturezaDespesaId: "nd", fonteId: FONTE_B, valorDotado: "100000.00",
  });
}

/** Empenha na ficha/data/valor. Devolve o empenhoId. */
async function emp(fichaId: string, numero: string, valor: string, data: string): Promise<string> {
  const e = await empenhar(
    {
      fichaId, numero, tipo: "ORDINARIO", valor, data: new Date(data),
      credorCpfCnpj: "12345678000199", historico: "empenho",
      categoriaOrdemCronologica: "FORNECIMENTO_BENS", criadoPor: POR,
    },
    R_EMPENHO,
    deps
  );
  return e.empenhoId;
}

/** Liga a limitação e programa a cota de jan da fonte A. */
async function ligarLimitacaoComCota(mesValor: Record<number, string>, fonteId = FONTE_A): Promise<void> {
  const cotas = Object.entries(mesValor).map(([mes, valor]) => ({ fonteId, mes: Number(mes), valor }));
  await registrarVersaoCmd(prisma, {
    exercicio: EXERC, atoRef: "DEC-1", vigenteDesde: new Date("2026-01-01T00:00:00Z"),
    cotas, criadoPor: POR,
  });
  await registrarEventoLimitacao(prisma, {
    exercicio: EXERC, ativo: true, atoRef: "DEC-LIM", motivo: "contingenciamento art. 9 LRF", criadoPor: POR,
  });
}

describe("M02 — programação financeira (TR 4.18/4.19/4.43/4.44)", () => {
  beforeEach(semear);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t1 — A DISTRIBUIÇÃO FECHA AO CENTAVO (domínio puro, sem banco).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t1: distribuirEmParcelas — 120.000/12 = 12×10.000; 100.000/12 = 11×8.333,33 + 8.333,37 (Σ EXATO)", () => {
    const a = distribuirEmParcelas(toMoney("120000.00"), 12).map((v) => v.toFixed(2));
    expect(a).toEqual(new Array(12).fill("10000.00"));
    expect(a.reduce((s, v) => s + Number(v), 0).toFixed(2)).toBe("120000.00");

    const b = distribuirEmParcelas(toMoney("100000.00"), 12).map((v) => v.toFixed(2));
    expect(b.slice(0, 11)).toEqual(new Array(11).fill("8333.33"));
    expect(b[11]).toBe("8333.37"); // ⚠️ a última absorve os 4 centavos
    // Σ EXATO — a conta manual do cabeçalho: 11×8333,33 = 91.666,63 + 8.333,37 = 100.000,00
    expect(b.reduce((s, v) => s + Number(v), 0).toFixed(2)).toBe("100000.00");

    // MBA: 100.000/6 = 5×16.666,66 + 16.666,70
    const m = distribuirEmParcelas(toMoney("100000.00"), 6).map((v) => v.toFixed(2));
    expect(m.slice(0, 5)).toEqual(new Array(5).fill("16666.66"));
    expect(m[5]).toBe("16666.70");
    expect(m.reduce((s, v) => s + Number(v), 0).toFixed(2)).toBe("100000.00");
  });

  it("t1b: proporCmdDaLoa gera a versão 1 da LOA — 12 cotas por fonte, Σ == previsão", async () => {
    const m02 = criarM02Deps(prisma);
    // previsão: fonte A = 120.000 (uma única receita prevista)
    await criarReceitaPrevista(
      { exercicio: EXERC, naturezaReceita: NAT, fonte: "500", tipoReceita: "ORCAMENTARIA", valorPrevisto: "120000.00", criadoPor: POR },
      m02
    );
    const r = await proporCmdDaLoa(prisma, { exercicio: EXERC, atoRef: "DEC-CMD-1", vigenteDesde: new Date("2026-01-01T00:00:00Z"), criadoPor: POR });
    expect(r.cotas).toBe(12);

    const cotas = await prisma.cotaCmd.findMany({ where: { versao: { id: r.versaoId } }, select: { mes: true, valor: true } });
    const soma = cotas.reduce((s, c) => s + Number(c.valor.toFixed(2)), 0);
    expect(soma.toFixed(2)).toBe("120000.00");
    expect(cotas.every((c) => c.valor.toFixed(2) === "10000.00")).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t2 — GUARD OFF: o empenho ignora cotas (a regressão dos 779).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t2: sem limitação ativa, o empenho ignora o CMD — mesmo com cota pequena, passa", async () => {
    // programa uma cota RIDÍCULA de 1,00 em janeiro, mas NÃO liga a limitação.
    await registrarVersaoCmd(prisma, {
      exercicio: EXERC, atoRef: "DEC-1", vigenteDesde: new Date("2026-01-01T00:00:00Z"),
      cotas: [{ fonteId: FONTE_A, mes: 1, valor: "1.00" }], criadoPor: POR,
    });
    // sem registrarEventoLimitacao → OFF → o empenho de 5.000 passa (o guard é no-op).
    const id = await emp("ficha-a1", "NE-1", "5000.00", "2026-01-15T12:00:00Z");
    expect(id).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t3 — GUARD ON: a cota do mês é o teto; fevereiro é independente.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t3: cota jan 10.000 — empenhos 9.000 + 1.000 passam (== teto); +0,01 rejeita nomeando; fev NÃO herda sobra", async () => {
    await ligarLimitacaoComCota({ 1: "10000.00", 2: "10000.00" });

    // 9.000 + 1.000 == 10.000 (o teto exato)
    await emp("ficha-a1", "NE-1", "9000.00", "2026-01-10T12:00:00Z");
    await emp("ficha-a2", "NE-2", "1000.00", "2026-01-20T12:00:00Z");

    // +0,01 estoura, e a mensagem nomeia os cinco números
    const estouro = emp("ficha-a1", "NE-3", "0.01", "2026-01-25T12:00:00Z");
    await expect(estouro).rejects.toThrow(/LIMITAÇÃO DE EMPENHO ESTOURADA/);
    await expect(
      emp("ficha-a1", "NE-3", "0.01", "2026-01-25T12:00:00Z")
    ).rejects.toThrow(/teto do mês.*10000\.00[\s\S]*já empenhado \(líquido\) \.* 10000\.00/);

    // ⚠️ FEVEREIRO É INDEPENDENTE — janeiro estourou, mas a cota de fev (10.000) está inteira.
    // A cota NÃO ROLA: a sobra de janeiro (zero) não vira crédito de fevereiro, e o déficit
    // também não. Fevereiro empenha 10.000 tranquilo.
    const fev = await emp("ficha-a1", "NE-FEV", "10000.00", "2026-02-10T12:00:00Z");
    expect(fev).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t4 — LIBERAÇÃO (4.44) e o LÍQUIDO (anulação devolve).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t4: liberação +2.000 → teto 12.000; empenho anulado DEVOLVE a cota (líquido manda)", async () => {
    await ligarLimitacaoComCota({ 1: "10000.00" });

    // libera 2.000 em janeiro → teto vira 12.000
    await liberarProgramacao(prisma, {
      exercicio: EXERC, fonteId: FONTE_A, mes: 1, valor: "2000.00",
      atoRef: "DEC-LIB", motivo: "receita restabelecida no bimestre", criadoPor: POR,
    });

    await emp("ficha-a1", "NE-1", "12000.00", "2026-01-10T12:00:00Z"); // == teto liberado
    await expect(emp("ficha-a1", "NE-2", "0.01", "2026-01-11T12:00:00Z")).rejects.toThrow(/ESTOURADA/);

    // ⚠️ ANULA o empenho → o líquido cai a zero → a cota volta inteira (12.000 disponíveis).
    await anularEmpenho({ empenhoId: (await prisma.empenho.findFirstOrThrow({ where: { numero: "NE-1" }, select: { id: true } })).id, numero: "AN-1", data: new Date("2026-01-12T12:00:00Z"), historico: "anula", criadoPor: POR }, deps);
    // agora empenha 12.000 de novo — passa (o anulado NÃO conta no líquido).
    const denovo = await emp("ficha-a2", "NE-3", "12000.00", "2026-01-15T12:00:00Z");
    expect(denovo).toBeDefined();
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t5 — COTA AUSENTE com regime ativo: fonte B sem cota rejeita.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t5: fonte SEM cota, com limitação ativa → o empenho rejeita nomeando a ausência", async () => {
    // liga a limitação, mas só programa cota para a fonte A. A fonte B fica SEM cota.
    await ligarLimitacaoComCota({ 1: "10000.00" }, FONTE_A);

    const semCota = emp("ficha-b1", "NE-B", "100.00", "2026-01-10T12:00:00Z");
    await expect(semCota).rejects.toThrow(/NÃO tem cota de CMD para o mês 1/);
    await expect(
      emp("ficha-b1", "NE-B", "100.00", "2026-01-10T12:00:00Z")
    ).rejects.toThrow(/limitação está ATIVA/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t6 — VERSÕES: v2 reduz a cota com empenho já feito → v2 GRAVA, próximo estoura.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t6: v2 reduz jan para 8.000 com 9.000 já empenhados → v2 GRAVA, mas o próximo empenho rejeita", async () => {
    await ligarLimitacaoComCota({ 1: "10000.00" });
    await emp("ficha-a1", "NE-1", "9000.00", "2026-01-10T12:00:00Z"); // dentro da cota de 10.000

    // ⚠️ v2 reduz a cota de janeiro para 8.000 — MENOS do que já foi empenhado (9.000). O plano é
    // ATO POLÍTICO: ele GRAVA (o sistema não recusa o decreto do prefeito). O que o sistema faz é
    // MOSTRAR o estouro no próximo empenho — não esconder que a execução passou do novo teto.
    await registrarVersaoCmd(prisma, {
      exercicio: EXERC, atoRef: "DEC-2", vigenteDesde: new Date("2026-01-15T00:00:00Z"),
      cotas: [{ fonteId: FONTE_A, mes: 1, valor: "8000.00" }], criadoPor: POR,
    });
    // a v2 existe
    expect(await prisma.versaoCmd.count({ where: { exercicio: EXERC } })).toBe(2);

    // o próximo empenho (após vigenteDesde da v2) usa a cota nova de 8.000, e 9.000 > 8.000 já.
    const estoura = emp("ficha-a2", "NE-2", "0.01", "2026-01-20T12:00:00Z");
    await expect(estoura).rejects.toThrow(/ESTOURADA/);
    await expect(
      emp("ficha-a2", "NE-2", "0.01", "2026-01-20T12:00:00Z")
    ).rejects.toThrow(/cota programada \.* 8000\.00/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t7 — CONCORRÊNCIA: dois empenhos, fichas DIFERENTES, mesma fonte, cota 10.000.
  // ═══════════════════════════════════════════════════════════════════════════
  it("t7: dois empenhos de 6.000, fichas DIFERENTES da mesma fonte, cota 10.000 → exatamente UM (5 rodadas)", async () => {
    for (let rodada = 0; rodada < 5; rodada++) {
      await limparBanco(prisma);
      await semear();
      await ligarLimitacaoComCota({ 1: "10000.00" });

      const r = await Promise.allSettled([
        emp("ficha-a1", `R${rodada}-1`, "6000.00", "2026-01-10T12:00:00Z"),
        emp("ficha-a2", `R${rodada}-2`, "6000.00", "2026-01-10T12:00:00Z"),
      ]);
      const ok = r.filter((x) => x.status === "fulfilled").length;

      // ⚠️ EXATAMENTE UM. Sem o lock na COTA (não na ficha — são fichas diferentes), os dois
      // leriam consumido 0, os dois veriam 6.000 <= 10.000, e os dois passariam (12.000 > cota).
      expect(ok, `rodada ${rodada}: esperava 1, veio ${ok}`).toBe(1);
    }
  }, 60000);

  // ═══════════════════════════════════════════════════════════════════════════
  // t8 — CONFRONTO MBA: metas × arrecadado com estorno (leitor puro).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t8: confrontoMba — meta bim 1 = 30.000, arrecadado 25.000 (após um estorno) → diferença −5.000", async () => {
    const m04 = criarM04Deps(prisma);
    // MBA: fonte A, bimestre 1, meta 30.000
    await prisma.versaoMba.create({
      data: {
        exercicio: EXERC, numero: 1, atoRef: "DEC-MBA", vigenteDesde: new Date("2026-01-01T00:00:00Z"), criadoPor: POR,
        metas: { create: [{ fonteId: FONTE_A, bimestre: 1, valor: "30000.00", criadoPor: POR }] },
      },
    });

    // ⚠️ UM ESTORNO NO MEIO: arrecada 30.000 (G-1), ANULA os 30.000 inteiros, e arrecada 25.000
    // (G-2). O líquido do bimestre 1 é 25.000 — a anulação NÃO conta (é o líquido do M04).
    const g1 = await registrarArrecadacao(
      { exercicio: EXERC, naturezaReceita: NAT, fonte: "500", valor: "30000.00", dataArrecadacao: new Date("2026-01-20T12:00:00Z"), numeroReceita: "G-1", criadoPor: POR },
      R_ARREC, m04
    );
    const { anularArrecadacao } = await import("../m04-receita/servico.js");
    await anularArrecadacao({ receitaId: g1.receitaId, numeroReceita: "G-1", dataAnulacao: new Date("2026-01-25T12:00:00Z"), criadoPor: POR }, m04);
    await registrarArrecadacao(
      { exercicio: EXERC, naturezaReceita: NAT, fonte: "500", valor: "25000.00", dataArrecadacao: new Date("2026-02-10T12:00:00Z"), numeroReceita: "G-2", criadoPor: POR },
      R_ARREC, m04
    );

    const confronto = await confrontoMba(prisma, { exercicio: EXERC, ateBimestre: 1 });
    const linhaA = confronto.find((l) => l.fonteId === FONTE_A && l.bimestre === 1)!;
    expect(linhaA.metaAcumulada).toBe("30000.00");
    expect(linhaA.arrecadadoAcumulado).toBe("25000.00");
    expect(linhaA.diferenca).toBe("-5000.00"); // frustração de 5.000 — o gatilho do art. 9º
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // t9 — DECRETO: template default e customizado (função pura).
  // ═══════════════════════════════════════════════════════════════════════════
  it("t9: gerarTextoDecreto — o default preenche os placeholders; um placeholder sem dado FALHA", () => {
    const texto = gerarTextoDecreto("DECRETO {ato}/{exercicio} — vigência {data}. {corpo}", {
      ato: "015", exercicio: "2026", data: "2026-01-01", corpo: "Anexo I.",
    });
    expect(texto).toBe("DECRETO 015/2026 — vigência 2026-01-01. Anexo I.");

    // ⚠️ FAIL-CLOSED: um placeholder sem dado NÃO sai cru no papel.
    expect(() => gerarTextoDecreto("DECRETO {ato} — {faltante}", { ato: "015" })).toThrow(/PLACEHOLDER SEM DADO.*faltante/);
  });

  it("t9b: gerarDecretoCmd usa o template CUSTOMIZADO do ente quando cadastrado", async () => {
    await prisma.templateDecreto.create({
      data: { tipo: "CMD", texto: "Prefeitura de Campina Grande — Decreto {ato} ({exercicio}). {corpo} Vigente: {data}.", criadoPor: POR },
    });
    const texto = await gerarDecretoCmd(prisma, {
      exercicio: EXERC, atoRef: "099", dataVigencia: new Date("2026-03-01T00:00:00Z"), corpo: "Cronograma anexo.",
    });
    expect(texto).toBe("Prefeitura de Campina Grande — Decreto 099 (2026). Cronograma anexo. Vigente: 2026-03-01.");

    // sem template cadastrado para MBA → cai no default (contém o art. 13 da LRF).
    const mba = await (await import("./programacao.js")).gerarDecretoMba(prisma, {
      exercicio: EXERC, atoRef: "100", dataVigencia: new Date("2026-03-01T00:00:00Z"), corpo: "Metas anexas.",
    });
    expect(mba).toContain("art. 13 da Lei Complementar nº 101/2000");
    expect(mba).toContain("Metas anexas.");
  });
});
