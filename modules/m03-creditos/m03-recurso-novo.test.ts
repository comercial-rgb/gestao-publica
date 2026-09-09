import "dotenv/config";
import { afterAll, describe, expect, it, vi } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "../m04-receita/servico.js";
import { abrirExercicio } from "../m08-restos-a-pagar/exercicio.js";
import { criarM03DepsAmarrado } from "../m12-relatorios/adapter-m03.js";
import { criarDecreto, criarLei, executarCredito } from "./servico.js";
import type { M03Deps } from "./ports.js";
import type { OrigemRecurso } from "./dominio.js";

/**
 * M03 — EXCESSO DE ARRECADAÇÃO e OPERAÇÃO DE CRÉDITO amarrados aos fatos (TR 4.37).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ EXCESSO DE ARRECADAÇÃO (fonte 500) ═══
 *   O decreto é de 2026-06-30. Tudo que se soma tem ESSE corte (a data do FATO).
 *
 *   previsão da fonte (LOA 2026) ................ 100.000,00
 *   arrecadado até 30/06 ........................ 112.000,00
 *   EXCESSO = max(0, 112.000 − 100.000) .........  12.000,00
 *
 *   t1:  7.000  usado 0      +  7.000 =  7.000 <= 12.000  ✓
 *        5.000  usado 7.000  +  5.000 = 12.000 <= 12.000  ✓ (== teto)
 *          0,01 usado 12.000 +    0,01 = 12.000,01 > 12.000 ✗
 *
 *   t2:  arrecadado 90.000 < previsto 100.000 -> excesso ZERO -> tudo barra.
 *        (ZERO é uma RESPOSTA. Não cai no fail-open.)
 *
 *   t4:  arrecadado 112.000 e uma ANULAÇÃO de 4.000
 *        líquido = 112.000 − 4.000 ................ 108.000,00
 *        EXCESSO = 108.000 − 100.000 ..............   8.000,00
 *        8.000 passa; 8.000,01 rejeita. O LÍQUIDO manda.
 *
 *   t7:  arrecadação de 20.000 em 2026-09-15 (DEPOIS do decreto de 30/06).
 *        Ela NÃO conta: excesso segue 12.000, e 12.000,01 rejeita.
 *
 * ═══ OPERAÇÃO DE CRÉDITO (fonte 540) ═══
 *   arrecadado 2.1 (operação de crédito) ......... 50.000,00
 *   arrecadado 2.4 (convênio) .................... 30.000,00
 *   TETO = só a 2.1 ..............................  50.000,00
 *
 *   t5: 50.000 passa; 50.000,01 rejeita. O convênio NÃO lastreia — ninguém tem de
 *       devolvê-lo. (É o t6b de ef6f559, no espelho.)
 *   t6: fonte SEM nenhuma arrecadação 2.1 -> ZERO -> rejeita (não é fail-open).
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
const FONTE_600 = "fnt-600"; // sem previsão e sem arrecadação — o dado AUSENTE
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";
const FICHA_600 = "ficha-600";

/** A data do FATO do decreto — o corte de tudo. */
const DATA_DO_DECRETO = new Date("2026-06-30T12:00:00Z");

const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";
const PASSIVO_DIVIDA = "2.2.1.1.1.00.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";

/** 1.1 — imposto, principal (corrente). */
const NAT_IPTU = "11180111";
/** 2.1 — OPERAÇÕES DE CRÉDITO. A única origem que lastreia crédito por empréstimo. */
const NAT_OPERACAO_CREDITO = "21180111";
/** 2.4 — TRANSFERÊNCIA DE CAPITAL (convênio). Capital, mas ninguém devolve. */
const NAT_CONVENIO = "24180111";

const R_ARRECADACAO_IPTU = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
/** A operação de crédito credita o PASSIVO, não uma VPA (roteiro por parâmetro). */
const R_ARRECADACAO_OPERACAO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: PASSIVO_DIVIDA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});
const R_ARRECADACAO_CONVENIO = roteiroArrecadacao({
  disponibilidade: CAIXA, variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR, receitaRealizada: R_REALIZADA,
});

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-divida", codigo: PASSIVO_DIVIDA, nome: "Empréstimos", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
      { id: "c-rar", codigo: R_A_REALIZAR, nome: "Receita a realizar", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-rr", codigo: R_REALIZADA, nome: "Receita realizada", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMPENHADO, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({
    data: { id: "uo-01", codigo: "01001", descricao: "Educação", orgaoId: "org-01" },
  });
  await prisma.funcao.create({ data: { id: "fun-12", codigo: "12", nome: "Educação" } });
  await prisma.subfuncao.createMany({
    data: [
      { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
      { id: "sub-362", codigo: "362", nome: "Ensino Médio" },
      { id: "sub-363", codigo: "363", nome: "Ensino Profissional" },
    ],
  });
  await prisma.programa.create({ data: { id: "prg", codigo: "0012", descricao: "Educação" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.naturezaReceita.createMany({
    data: [
      { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU — principal" },
      { id: "nr-op", codigo: NAT_OPERACAO_CREDITO, descricao: "Operações de crédito internas" },
      { id: "nr-conv", codigo: NAT_CONVENIO, descricao: "Transferências de capital (convênio)" },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "Operação de crédito", codigoTce: "540" },
      { id: FONTE_600, codigo: "600", descricao: "Sem LOA cadastrada", codigoTce: "600" },
    ],
  });

  await abrirExercicio(prisma, { ano: 2026, criadoPor: POR });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-339039",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_500, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE_500, valorDotado: "5000.00" },
    { ...base, id: FICHA_540, numero: 2, subfuncaoId: "sub-362", fonteId: FONTE_540, valorDotado: "5000.00" },
    { ...base, id: FICHA_600, numero: 3, subfuncaoId: "sub-363", fonteId: FONTE_600, valorDotado: "5000.00" },
  ]);

  // ⚠️ AS DECLARAÇÕES — todas INFLADAS de propósito (o dobro ou mais do que os fatos
  // dão). Era a única coisa que o sistema conferia.
  await prisma.disponibilidadeRecursoNovo.createMany({
    data: [
      {
        exercicio: 2026, fonteId: FONTE_500, origem: "EXCESSO_ARRECADACAO",
        valor: "999999.00", descricao: "Excesso (digitado)", criadoPor: POR,
      },
      {
        exercicio: 2026, fonteId: FONTE_540, origem: "OPERACAO_CREDITO",
        valor: "999999.00", descricao: "Operação de crédito (digitado)", criadoPor: POR,
      },
      {
        exercicio: 2026, fonteId: FONTE_600, origem: "EXCESSO_ARRECADACAO",
        valor: "999999.00", descricao: "Excesso na fonte sem LOA", criadoPor: POR,
      },
      {
        exercicio: 2026, fonteId: FONTE_600, origem: "OPERACAO_CREDITO",
        valor: "999999.00", descricao: "Operação de crédito sem empréstimo", criadoPor: POR,
      },
    ],
  });
}

/** A PREVISÃO da fonte (LOA) — o minuendo do excesso. */
async function prever(fonteId: string, valor: string): Promise<void> {
  await prisma.receitaPrevista.create({
    data: {
      exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId,
      tipoReceita: "ORCAMENTARIA", valorPrevisto: valor,
    },
  });
}

/** O M04 recebe o CÓDIGO da fonte (3 dígitos); o M03 fala por id. */
const CODIGO_DA_FONTE: Record<string, string> = {
  [FONTE_500]: "500",
  [FONTE_540]: "540",
  [FONTE_600]: "600",
};

async function arrecadar(
  fonte: string,
  valor: string,
  guia: string,
  natureza = NAT_IPTU,
  roteiro = R_ARRECADACAO_IPTU,
  data = new Date("2026-03-10T12:00:00Z")
): Promise<string> {
  await registrarArrecadacao(
    {
      exercicio: 2026, naturezaReceita: natureza,
      fonte: CODIGO_DA_FONTE[fonte]!, valor,
      dataArrecadacao: data, numeroReceita: guia, criadoPor: POR,
    },
    roteiro,
    criarM04Deps(prisma)
  );
  const r = await prisma.receitaArrecadada.findFirstOrThrow({
    where: { numeroReceita: guia, estornoDeId: null },
    select: { id: true },
  });
  return r.id;
}

async function lei(deps: M03Deps): Promise<string> {
  return criarLei(
    {
      numero: "L-001", ano: 2026, tipoCredito: "SUPLEMENTAR",
      valorAutorizado: "500000.00", dataPublicacao: new Date("2026-01-15T12:00:00Z"),
      criadoPor: POR,
    },
    deps
  );
}

async function decreto(
  deps: M03Deps,
  leiId: string,
  numero: string,
  origem: OrigemRecurso,
  data = DATA_DO_DECRETO
): Promise<string> {
  return criarDecreto(
    { leiId, numero, ano: 2026, data, origemRecurso: origem, criadoPor: POR },
    deps
  );
}

async function suplementar(
  deps: M03Deps,
  decretoId: string,
  valor: string,
  fichaId: string,
  fonteId: string
): Promise<readonly string[]> {
  return executarCredito(
    {
      decretoId,
      itens: [{ fichaId, tipo: "SUPLEMENTACAO", valor, fonteId }],
      criadoPor: POR,
    },
    deps
  );
}

const autorizado = async (fichaId: string): Promise<string> =>
  (
    await prisma.fichaOrcamentaria.findUniqueOrThrow({
      where: { id: fichaId },
      select: { saldoAutorizado: true },
    })
  ).saldoAutorizado.toFixed(2);

describe("M03 — EXCESSO DE ARRECADAÇÃO (TR 4.37)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: previsto 100.000 · arrecadado 112.000 -> excesso 12.000. 7.000 + 5.000 passam; 0,01 estoura", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    await prever(FONTE_500, "100000.00");
    await arrecadar(FONTE_500, "112000.00", "GUIA-1");

    const leiId = await lei(deps);

    await suplementar(deps, await decreto(deps, leiId, "D1", "EXCESSO_ARRECADACAO"), "7000.00", FICHA_500, FONTE_500);
    await suplementar(deps, await decreto(deps, leiId, "D2", "EXCESSO_ARRECADACAO"), "5000.00", FICHA_500, FONTE_500);
    expect(await autorizado(FICHA_500)).toBe("17000.00"); // 5.000 (LOA) + 12.000

    // ⚠️ O CENTAVO. A disponibilidade DECLARADA (999.999) daria folga de sobra — e era
    // só ela que o sistema conferia. Quem barra é o DERIVADO.
    const d3 = await decreto(deps, leiId, "D3", "EXCESSO_ARRECADACAO");
    await expect(
      suplementar(deps, d3, "0.01", FICHA_500, FONTE_500)
    ).rejects.toThrow(/EXCESSO_ARRECADACAO INSUFICIENTE/);
    await expect(
      suplementar(deps, d3, "0.01", FICHA_500, FONTE_500)
    ).rejects.toThrow(
      /os FATOS dão 12000\.00[\s\S]*já foram usados 12000\.00[\s\S]*pede mais 0\.01[\s\S]*DECLARADA é 999999\.00/
    );

    expect(await prisma.itemCredito.count({ where: { decretoId: d3 } })).toBe(0);
    expect(await autorizado(FICHA_500)).toBe("17000.00");
  });

  // t2
  it("t2: arrecadou 90.000 contra 100.000 previstos -> excesso ZERO, e ZERO barra", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    await prever(FONTE_500, "100000.00");
    await arrecadar(FONTE_500, "90000.00", "GUIA-1");

    const leiId = await lei(deps);
    // ⚠️ ZERO É UMA RESPOSTA, não uma ausência: não há excesso nenhum, e o crédito cai.
    // Se isto caísse no fail-open, o ente abriria crédito por um excesso que não houve.
    await expect(
      suplementar(deps, await decreto(deps, leiId, "D1", "EXCESSO_ARRECADACAO"), "0.01", FICHA_500, FONTE_500)
    ).rejects.toThrow(/EXCESSO_ARRECADACAO INSUFICIENTE[\s\S]*os FATOS dão 0\.00/);

    expect(await prisma.itemCredito.count()).toBe(0);
  });

  // t3
  it("t3: fonte SEM previsão cadastrada -> null -> fail-open COM LOG (e gravou)", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    // a fonte 600 não tem `receitaPrevista` nenhuma — e arrecadou 50.000.
    await arrecadar(FONTE_600, "50000.00", "GUIA-600");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const leiId = await lei(deps);
      await suplementar(
        deps,
        await decreto(deps, leiId, "D1", "EXCESSO_ARRECADACAO"),
        "40000.00",
        FICHA_600,
        FONTE_600
      );

      // ⚠️ PROVA POR SELECT: gravou. Sem previsão, a subtração do excesso não tem
      // minuendo — e tratar a ausência como previsão ZERO faria TODO o arrecadado
      // virar excesso: o número mais generoso possível, tirado do dado que falta.
      expect(await autorizado(FICHA_600)).toBe("45000.00"); // 5.000 + 40.000

      expect(aviso).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(aviso.mock.calls[0]![0]));
      expect(payload.evento).toBe("RECURSO_NOVO_SEM_AMARRACAO");
      expect(payload.origem).toBe("EXCESSO_ARRECADACAO");
      expect(payload.fonteId).toBe(FONTE_600);
      expect(payload.motivo).toMatch(/não tem RECEITA PREVISTA cadastrada/);
      // ...e o log DIZ a diferença entre isto e o excesso zero (o t2).
      expect(payload.motivo).toMatch(/não é excesso zero/);
    } finally {
      aviso.mockRestore();
    }
  });

  // t4
  it("t4: o LÍQUIDO manda — anulação de 4.000 derruba o excesso de 12.000 para 8.000", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    await prever(FONTE_500, "100000.00");

    // ⚠️ 112.000 arrecadados em DUAS guias — e a de 4.000 é ANULADA. A anulação é uma
    // LINHA NOVA (append-only), com tipo ANULACAO, e ela carrega a MESMA fonte e a
    // MESMA natureza do original (o `anularArrecadacao` as copia). O arrecadado por
    // fonte é líquido POR SINAL: a ANULACAO entra com −1.
    //   112.000 − 4.000 = 108.000  ->  excesso = 108.000 − 100.000 = 8.000
    await arrecadar(FONTE_500, "108000.00", "GUIA-A");
    const guiaB = await arrecadar(FONTE_500, "4000.00", "GUIA-B");
    await anularArrecadacao(
      {
        receitaId: guiaB,
        dataAnulacao: new Date("2026-04-01T12:00:00Z"),
        numeroReceita: "GUIA-B-ANUL",
        criadoPor: POR,
      },
      criarM04Deps(prisma)
    );

    const leiId = await lei(deps);
    await suplementar(deps, await decreto(deps, leiId, "D1", "EXCESSO_ARRECADACAO"), "8000.00", FICHA_500, FONTE_500);
    expect(await autorizado(FICHA_500)).toBe("13000.00"); // 5.000 + 8.000

    await expect(
      suplementar(deps, await decreto(deps, leiId, "D2", "EXCESSO_ARRECADACAO"), "0.01", FICHA_500, FONTE_500)
    ).rejects.toThrow(/os FATOS dão 8000\.00/);
  });

  // t7
  it("t7: arrecadação POSTERIOR à data do decreto não conta — o corte é o do FATO", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    await prever(FONTE_500, "100000.00");
    await arrecadar(FONTE_500, "112000.00", "GUIA-1");
    // 20.000 a mais, mas em SETEMBRO — o decreto é de 30/06.
    await arrecadar(
      FONTE_500, "20000.00", "GUIA-SET", NAT_IPTU, R_ARRECADACAO_IPTU,
      new Date("2026-09-15T12:00:00Z")
    );

    const leiId = await lei(deps);
    // o excesso do decreto de junho segue 12.000 — e não 32.000.
    await suplementar(deps, await decreto(deps, leiId, "D1", "EXCESSO_ARRECADACAO"), "12000.00", FICHA_500, FONTE_500);
    await expect(
      suplementar(deps, await decreto(deps, leiId, "D2", "EXCESSO_ARRECADACAO"), "0.01", FICHA_500, FONTE_500)
    ).rejects.toThrow(/os FATOS dão 12000\.00/);

    // ...e um decreto de OUTUBRO enxerga os 20.000: 32.000 − 12.000 já usados = 20.000
    const dOut = await decreto(
      deps, leiId, "D3", "EXCESSO_ARRECADACAO", new Date("2026-10-01T12:00:00Z")
    );
    await suplementar(deps, dOut, "20000.00", FICHA_500, FONTE_500);
    expect(await autorizado(FICHA_500)).toBe("37000.00"); // 5.000 + 12.000 + 20.000
  });

  // t8
  it("t8: dois créditos concorrentes de 7.000 contra excesso de 12.000 — UM só grava", async () => {
    const RODADAS = 5;
    for (let r = 0; r < RODADAS; r++) {
      await semear();
      const deps = criarM03DepsAmarrado(prisma);
      await prever(FONTE_500, "100000.00");
      await arrecadar(FONTE_500, "112000.00", "GUIA-1");

      const leiId = await lei(deps);
      const dA = await decreto(deps, leiId, `A${r}`, "EXCESSO_ARRECADACAO");
      const dB = await decreto(deps, leiId, `B${r}`, "EXCESSO_ARRECADACAO");

      // fichas DIFERENTES da mesma fonte: o `travarFichas` não os cruza. Quem serializa
      // é o lock da DISPONIBILIDADE (posto 2) — o mesmo de cf765b0, reusado.
      await criarFichasDeTeste(prisma, [
        {
          exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
          programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-339039",
          id: "ficha-outra", numero: 9, subfuncaoId: "sub-362", fonteId: FONTE_500,
          valorDotado: "1000.00",
        },
      ]);

      const rs = await Promise.allSettled([
        suplementar(deps, dA, "7000.00", FICHA_500, FONTE_500),
        suplementar(deps, dB, "7000.00", "ficha-outra", FONTE_500),
      ]);

      expect(rs.filter((x) => x.status === "fulfilled")).toHaveLength(1);
      expect(
        await prisma.itemCredito.count({ where: { tipo: "SUPLEMENTACAO" } })
      ).toBe(1);
    }
  });
});

describe("M03 — OPERAÇÃO DE CRÉDITO (TR 4.37)", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t5
  it("t5: só a origem 2.1 lastreia — o convênio (2.4) entra na fonte e NÃO conta", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);

    // 50.000 de EMPRÉSTIMO (2.1) e 30.000 de CONVÊNIO (2.4), na MESMA fonte, no MESMO
    // caixa. Só o primeiro tem de ser devolvido — e só ele lastreia.
    await arrecadar(FONTE_540, "50000.00", "GUIA-OP", NAT_OPERACAO_CREDITO, R_ARRECADACAO_OPERACAO);
    await arrecadar(FONTE_540, "30000.00", "GUIA-CONV", NAT_CONVENIO, R_ARRECADACAO_CONVENIO);

    const leiId = await lei(deps);
    await suplementar(deps, await decreto(deps, leiId, "D1", "OPERACAO_CREDITO"), "50000.00", FICHA_540, FONTE_540);
    expect(await autorizado(FICHA_540)).toBe("55000.00"); // 5.000 + 50.000

    // ⚠️ 80.000 entraram na fonte. O guard só enxerga 50.000 — e o centavo seguinte
    // estoura. Um guard "por fonte", sem a ORIGEM, deixaria o convênio virar
    // empréstimo: crédito lastreado num dinheiro que ninguém tem de devolver.
    await expect(
      suplementar(deps, await decreto(deps, leiId, "D2", "OPERACAO_CREDITO"), "0.01", FICHA_540, FONTE_540)
    ).rejects.toThrow(
      /OPERACAO_CREDITO INSUFICIENTE[\s\S]*os FATOS dão 50000\.00[\s\S]*ORIGEM "operações de crédito"/
    );
  });

  // t6
  it("t6: fonte sem NENHUMA arrecadação 2.1 -> ZERO -> rejeita (e não é fail-open)", async () => {
    await semear();
    const deps = criarM03DepsAmarrado(prisma);
    // a fonte 600 arrecadou 50.000 — de IPTU (1.1). Nenhum empréstimo.
    await arrecadar(FONTE_600, "50000.00", "GUIA-600");
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const leiId = await lei(deps);
      await expect(
        suplementar(deps, await decreto(deps, leiId, "D1", "OPERACAO_CREDITO"), "0.01", FICHA_600, FONTE_600)
      ).rejects.toThrow(/OPERACAO_CREDITO INSUFICIENTE[\s\S]*os FATOS dão 0\.00/);

      // ⚠️ E NÃO HOUVE LOG: isto não é dado ausente. A resposta EXISTE e é zero — o
      // ente não tomou empréstimo nenhum nesta fonte. Devolver `null` aqui faria o
      // fail-open liberar crédito por operação de crédito num ente que nunca tomou uma.
      expect(aviso).not.toHaveBeenCalled();
      expect(await prisma.itemCredito.count()).toBe(0);
    } finally {
      aviso.mockRestore();
    }
  });
});
