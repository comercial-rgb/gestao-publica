import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM04Deps } from "../m04-receita/adapter-prisma.js";
import { roteiroArrecadacao } from "../m04-receita/dominio.js";
import { registrarArrecadacao } from "../m04-receita/servico.js";
import { abrirExercicio, encerrarExercicio } from "../m08-restos-a-pagar/exercicio.js";
import { criarM03DepsAmarrado } from "../m12-relatorios/adapter-m03.js";
import { criarM03Deps } from "./adapter-prisma.js";
import {
  anularCredito,
  criarDecreto,
  criarLei,
  executarCredito,
  saldoDaLei,
} from "./servico.js";
import type { M03Deps } from "./ports.js";

/**
 * M03 × M12 — A AMARRAÇÃO DO SUPERÁVIT FINANCEIRO (TR 4.37/4.39).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O SUPERÁVIT DE 2025, DERIVADO DOS FATOS ═══
 *   fonte 500: arrecadou 10.000,00 em 2025 · nenhuma despesa · nada de extra
 *              caixa       = 10.000 + 0 − 0 − 0        = 10.000,00
 *              obrigações  = liquidado 0 − pago 0      =      0,00
 *              SUPERÁVIT   = 10.000 − 0 − 0            = 10.000,00
 *   fonte 540: NENHUM fato em 2025
 *              SUPERÁVIT   =                                  0,00
 *
 * ═══ A DISPONIBILIDADE DECLARADA (o que alguém DIGITOU para 2026) ═══
 *   fonte 500: 20.000,00  ← INFLADA. É o dobro do que os fatos dão. Este é o erro
 *                            que o bloco inteiro existe para pegar: até aqui, ela
 *                            era a ÚNICA coisa contra a qual o crédito era validado.
 *   fonte 540:  5.000,00  ← declarada sobre um superávit que é ZERO.
 *
 * ═══ t1 — O TETO É O DERIVADO, NÃO O DECLARADO ═══
 *   D1  8.000,00   usado 0      + 8.000  =  8.000 <= 10.000  ✓
 *   D2  2.000,00   usado 8.000  + 2.000  = 10.000 <= 10.000  ✓ (== teto, passa)
 *   D3      0,01   usado 10.000 +   0,01 = 10.000,01 > 10.000 ✗
 *   ...e a mensagem nomeia os QUATRO: derivado 10.000, usado 10.000, pedido 0,01,
 *   declarado 20.000.
 *
 * ═══ t3 — A ANULAÇÃO DEVOLVE POR DERIVAÇÃO ═══
 *   anula D1 (8.000) -> usado volta a 2.000 -> um novo crédito de 8.000 cabe
 *   (2.000 + 8.000 = 10.000 == teto).
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m03@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
const FICHA_500 = "ficha-500";
const FICHA_540 = "ficha-540";

const CAIXA = "1.1.1.1.2.00.00";
const VPA = "4.1.1.2.1.01.00";
const R_A_REALIZAR = "6.2.1.1.0.00.00";
const R_REALIZADA = "6.2.1.2.0.00.00";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";

const R_ARRECADACAO = roteiroArrecadacao({
  disponibilidade: CAIXA,
  variacaoAumentativa: VPA,
  receitaARealizar: R_A_REALIZAR,
  receitaRealizada: R_REALIZADA,
});

/** Corrente · imposto · principal — código válido no classificador do M04. */
const NAT_IPTU = "11180111";

/**
 * ⚠️ O ENCERRAMENTO DE 2025 É A CONDIÇÃO, NÃO O CORTE. Ele acontece em 2026 (é
 * quando alguém aperta o botão); o corte do superávit é 31/12/2025. Semear com esta
 * ordem — arrecadar em 2025, encerrar depois — é o caso real.
 */
async function semear(comEncerramentoDe2025: boolean): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpa", codigo: VPA, nome: "VPA tributária", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
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
  await prisma.naturezaReceita.create({
    data: { id: "nr-iptu", codigo: NAT_IPTU, descricao: "IPTU — principal" },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });

  // ═══ 2025: O EXERCÍCIO QUE PRODUZIU O SUPERÁVIT ═══
  await abrirExercicio(prisma, { ano: 2025, criadoPor: POR });
  await registrarArrecadacao(
    {
      exercicio: 2025, naturezaReceita: NAT_IPTU, fonte: "500", valor: "10000.00",
      dataArrecadacao: new Date("2025-06-10T12:00:00Z"),
      numeroReceita: "GUIA-2025-1", criadoPor: POR,
    },
    R_ARRECADACAO,
    criarM04Deps(prisma)
  );
  if (comEncerramentoDe2025) {
    await encerrarExercicio(prisma, { ano: 2025, encerradoPor: POR });
  }

  // ═══ 2026: onde os créditos são abertos ═══
  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-339039",
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_500, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE_500, valorDotado: "5000.00" },
    { ...base, id: FICHA_540, numero: 2, subfuncaoId: "sub-362", fonteId: FONTE_540, valorDotado: "5000.00" },
  ]);

  // ⚠️ AS DECLARAÇÕES — e a da fonte 500 está INFLADA de propósito (20.000 contra
  // 10.000 de fatos). Era a única coisa que o sistema conferia.
  await prisma.disponibilidadeRecursoNovo.createMany({
    data: [
      {
        exercicio: 2026, fonteId: FONTE_500, origem: "SUPERAVIT_FINANCEIRO",
        valor: "20000.00", descricao: "Superávit do balanço de 2025 (digitado)",
        criadoPor: POR,
      },
      {
        exercicio: 2026, fonteId: FONTE_540, origem: "SUPERAVIT_FINANCEIRO",
        valor: "5000.00", descricao: "Superávit do FUNDEB (digitado)",
        criadoPor: POR,
      },
    ],
  });
}

/** Uma lei com teto largo (o teto da lei NÃO é o que se está testando aqui). */
async function lei(deps: M03Deps): Promise<string> {
  return criarLei(
    {
      numero: "L-001", ano: 2026, tipoCredito: "SUPLEMENTAR",
      valorAutorizado: "50000.00", dataPublicacao: new Date("2026-01-15T12:00:00Z"),
      criadoPor: POR,
    },
    deps
  );
}

async function decreto(
  deps: M03Deps,
  leiId: string,
  numero: string
): Promise<string> {
  return criarDecreto(
    {
      leiId, numero, ano: 2026, data: new Date("2026-03-01T12:00:00Z"),
      origemRecurso: "SUPERAVIT_FINANCEIRO", criadoPor: POR,
    },
    deps
  );
}

async function suplementar(
  deps: M03Deps,
  decretoId: string,
  valor: string,
  fichaId = FICHA_500,
  fonteId = FONTE_500
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

describe("M03 — superávit financeiro amarrado aos fatos", () => {
  let deps: M03Deps;

  beforeEach(async () => {
    await semear(true);
    deps = criarM03DepsAmarrado(prisma);
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t1
  it("t1: 8.000 passa, 2.000 passa (== teto), 0,01 REJEITA nomeando os quatro valores", async () => {
    const leiId = await lei(deps);

    await suplementar(deps, await decreto(deps, leiId, "D1"), "8000.00");
    await suplementar(deps, await decreto(deps, leiId, "D2"), "2000.00");

    // a ficha recebeu os dois créditos: 5.000 (LOA) + 8.000 + 2.000
    const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({
      where: { id: FICHA_500 },
      select: { saldoAutorizado: true },
    });
    expect(ficha.saldoAutorizado.toFixed(2)).toBe("15000.00");

    // ⚠️ O CENTAVO QUE ESTOURA. A disponibilidade DECLARADA (20.000) daria folga de
    // sobra — e era só ela que o sistema conferia. Quem barra é o DERIVADO.
    const d3 = await decreto(deps, leiId, "D3");
    await expect(suplementar(deps, d3, "0.01")).rejects.toThrow(
      /SUPERAVIT_FINANCEIRO INSUFICIENTE/
    );
    await expect(suplementar(deps, d3, "0.01")).rejects.toThrow(
      /os FATOS dão 10000\.00[\s\S]*já foram usados 10000\.00[\s\S]*pede mais 0\.01[\s\S]*DECLARADA é 20000\.00/
    );

    // nada gravado pelo D3
    expect(await prisma.itemCredito.count({ where: { decretoId: d3 } })).toBe(0);
    expect(
      (
        await prisma.fichaOrcamentaria.findUniqueOrThrow({
          where: { id: FICHA_500 },
          select: { saldoAutorizado: true },
        })
      ).saldoAutorizado.toFixed(2)
    ).toBe("15000.00");
  });

  // t2
  it("t2: fonte SEM superávit (zero derivado) rejeita QUALQUER valor — a declaração não vale", async () => {
    const leiId = await lei(deps);
    const d = await decreto(deps, leiId, "D-540");

    // A fonte 540 tem 5.000 DECLARADOS e ZERO de fatos em 2025. `null` seria
    // fail-open; zero é uma RESPOSTA — e ela barra.
    await expect(
      suplementar(deps, d, "0.01", FICHA_540, FONTE_540)
    ).rejects.toThrow(/os FATOS dão 0\.00/);

    expect(await prisma.itemCredito.count()).toBe(0);
  });

  // t3
  it("t3: anular o crédito de 8.000 DEVOLVE o superávit — por derivação, sem coluna", async () => {
    const leiId = await lei(deps);
    const d1 = await decreto(deps, leiId, "D1");
    await suplementar(deps, d1, "8000.00");
    await suplementar(deps, await decreto(deps, leiId, "D2"), "2000.00");

    // esgotado: nem um centavo cabe
    const d3 = await decreto(deps, leiId, "D3");
    await expect(suplementar(deps, d3, "0.01")).rejects.toThrow(
      /SUPERAVIT_FINANCEIRO INSUFICIENTE/
    );

    // ANULA o D1 — o item de estorno cancela o original, e a soma líquida deixa de
    // enxergar os 8.000. Nenhuma coluna foi decrementada.
    await anularCredito(
      {
        decretoId: d1,
        data: new Date("2026-06-01T12:00:00Z"),
        motivo: "Decreto anulado por vício de forma no processo administrativo.",
        criadoPor: POR,
      },
      deps
    );

    // ⚠️ E O TETO DA LEI TAMBÉM VOLTOU. Este era o BUG: o item de estorno nasce com o
    // tipo INVERTIDO (ANULACAO), e as duas somas filtravam `tipo: SUPLEMENTACAO` no
    // SQL — o estorno não voltava da query, e o original seguia consumindo. Anular um
    // decreto não devolvia teto nenhum: uma lei de 50.000 gasta em decretos anulados
    // ficava esgotada para sempre.
    // vivos = só os 2.000 do D2 (os 8.000 do D1 foram anulados) -> 50.000 − 2.000
    const lei1 = await saldoDaLei(leiId, "50000.00", deps);
    expect(lei1.consumido).toBe("2000.00");
    expect(lei1.restante).toBe("48000.00");

    // usado volta a 2.000 -> 8.000 cabe de novo (2.000 + 8.000 = 10.000 == teto)
    await suplementar(deps, d3, "8000.00");
    expect(
      (
        await prisma.fichaOrcamentaria.findUniqueOrThrow({
          where: { id: FICHA_500 },
          select: { saldoAutorizado: true },
        })
      ).saldoAutorizado.toFixed(2)
    ).toBe("15000.00"); // 5.000 LOA + 2.000 + 8.000 (os 8.000 do D1 foram anulados)

    // e mais 0,01 volta a estourar
    await expect(
      suplementar(deps, await decreto(deps, leiId, "D4"), "0.01")
    ).rejects.toThrow(/SUPERAVIT_FINANCEIRO INSUFICIENTE/);
  });

  // t6
  it("t6: dois créditos concorrentes de 6.000 contra superávit de 10.000 — UM só grava", async () => {
    const RODADAS = 5;
    for (let r = 0; r < RODADAS; r++) {
      await semear(true);
      const leiId = await lei(deps);
      const dA = await decreto(deps, leiId, `A${r}`);
      const dB = await decreto(deps, leiId, `B${r}`);

      // ⚠️ FICHAS DIFERENTES DA MESMA FONTE. É o caso que o `travarFichas` NÃO cobre:
      // os dois decretos nunca se cruzam nas fichas. Quem os serializa é o lock da
      // DISPONIBILIDADE — e sem ele os dois passariam, estourando o superávit em
      // 2.000 (6.000 + 6.000 = 12.000 > 10.000).
      await criarFichasDeTeste(prisma, [
        {
          exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
          programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd-339039",
          id: "ficha-outra", numero: 9, subfuncaoId: "sub-362", fonteId: FONTE_500,
          valorDotado: "1000.00",
        },
      ]);

      const rs = await Promise.allSettled([
        suplementar(deps, dA, "6000.00", FICHA_500, FONTE_500),
        suplementar(deps, dB, "6000.00", "ficha-outra", FONTE_500),
      ]);

      const ok = rs.filter((x) => x.status === "fulfilled").length;
      expect(ok).toBe(1);

      const itens = await prisma.itemCredito.count({ where: { tipo: "SUPLEMENTACAO" } });
      expect(itens).toBe(1);
    }
  });
});

describe("M03 — o fail-open, e o que ele custa", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  // t4
  it("t4: SEM encerramento de 2025 o crédito PASSA — e o log denuncia", async () => {
    await semear(false); // 2025 aberto: não há foto contra a qual conferir
    const deps = criarM03DepsAmarrado(prisma);
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const leiId = await lei(deps);
      // 15.000 — MAIS que o superávit real (10.000), MENOS que o declarado (20.000).
      // Com o encerramento, isto seria barrado. Sem ele, passa: barrar aqui
      // paralisaria o ente que ainda não fechou o ano anterior, e o art. 43 não
      // proíbe o crédito — proíbe o crédito SEM lastro.
      await suplementar(deps, await decreto(deps, leiId, "D1"), "15000.00");

      // ⚠️ PROVA POR SELECT: gravou mesmo.
      const ficha = await prisma.fichaOrcamentaria.findUniqueOrThrow({
        where: { id: FICHA_500 },
        select: { saldoAutorizado: true },
      });
      expect(ficha.saldoAutorizado.toFixed(2)).toBe("20000.00"); // 5.000 + 15.000

      // ...e o log estruturado nomeia o buraco.
      expect(aviso).toHaveBeenCalledTimes(1);
      const payload = JSON.parse(String(aviso.mock.calls[0]![0]));
      expect(payload.evento).toBe("RECURSO_NOVO_SEM_AMARRACAO");
      expect(payload.origem).toBe("SUPERAVIT_FINANCEIRO");
      expect(payload.fonteId).toBe(FONTE_500);
      expect(payload.declarado).toBe("20000.00");
      expect(payload.motivo).toMatch(/Exercício 2025 não foi ENCERRADO/);
    } finally {
      aviso.mockRestore();
    }
  });

  // t5 — a mutação de WIRING
  it("t5: port DESLIGADO = fail-open silencioso; religado, barra", async () => {
    await semear(true); // 2025 ENCERRADO: a foto existe

    // ═══ MUTANTE: as deps SEM o port (é o `criarM03Deps` cru — o wiring de antes
    // deste bloco). O crédito de 15.000 passa contra um superávit de 10.000, porque
    // a única conferência é a disponibilidade DECLARADA (20.000). É exatamente o
    // buraco que o bloco fecha.
    const semPort = criarM03Deps(prisma);
    const leiSem = await lei(semPort);
    await suplementar(semPort, await decreto(semPort, leiSem, "D-SEM"), "15000.00");
    expect(
      (
        await prisma.fichaOrcamentaria.findUniqueOrThrow({
          where: { id: FICHA_500 },
          select: { saldoAutorizado: true },
        })
      ).saldoAutorizado.toFixed(2)
    ).toBe("20000.00");

    // ═══ RELIGADO: o MESMO crédito, no MESMO estado, agora é barrado.
    await semear(true);
    const comPort = criarM03DepsAmarrado(prisma);
    const leiCom = await lei(comPort);
    await expect(
      suplementar(comPort, await decreto(comPort, leiCom, "D-COM"), "15000.00")
    ).rejects.toThrow(/SUPERAVIT_FINANCEIRO INSUFICIENTE/);
    expect(await prisma.itemCredito.count()).toBe(0);
  });
});
