import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../m05-despesa/dominio.js";
import { empenhar, reconciliarFicha, saldosCorrentesDaFicha } from "../m05-despesa/servico.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { validarBalanceamento } from "./dominio.js";
import {
  anularCredito,
  criarDecreto,
  criarLei,
  encerrarDecreto,
  executarCredito,
} from "./servico.js";
import type { M03Deps } from "./ports.js";
import type { M05Deps } from "../m05-despesa/ports.js";

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Uma suíte
// inteiramente PULADA o Vitest reporta como PASSANDO (exit 0). Ver test/banco.ts.
await exigirBanco(prisma);

const CRIADO_POR = "m03@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
const FONTE_540 = "fnt-540";
/** Ficha A (fonte 500), dotada em 10.000. Ficha B (fonte 500), dotada em 5.000. */
const FICHA_A = "ficha-a";
const FICHA_B = "ficha-b";
/** Ficha C é de OUTRA fonte (540) — usada para provar a TR 5.111. */
const FICHA_C = "ficha-c";

const CONTAS = [
  { id: "c-disp", codigo: "6.2.2.1.1.00.00", nome: "Crédito Disponível", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-emp", codigo: "6.2.2.1.3.01.00", nome: "Crédito Empenhado", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
];
const R_EMPENHO = roteiroEmpenho({
  creditoDisponivel: "6.2.2.1.1.00.00",
  creditoEmpenhado: "6.2.2.1.3.01.00",
});

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({ data: CONTAS });
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
  await prisma.programa.create({ data: { id: "prg-0012", codigo: "0012", descricao: "Educação" } });
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE_500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
      { id: FONTE_540, codigo: "540", descricao: "FUNDEB", codigoTce: "540" },
    ],
  });

  const fichaBase = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg-0012", acaoId: "aca-2001", naturezaDespesaId: "nd-339039",
  };
  // Fichas COM dotação inicial — o mesmo que o adapter do M02 faz.
  await criarFichasDeTeste(prisma, [
    { ...fichaBase, id: FICHA_A, numero: 1, subfuncaoId: "sub-361", fonteId: FONTE_500, valorDotado: "10000.00" },
    { ...fichaBase, id: FICHA_B, numero: 2, subfuncaoId: "sub-362", fonteId: FONTE_500, valorDotado: "5000.00" },
    { ...fichaBase, id: FICHA_C, numero: 3, subfuncaoId: "sub-363", fonteId: FONTE_540, valorDotado: "8000.00" },
  ]);
}

/** Lei com teto de 20.000 + decreto. Devolve os ids. */
async function leiEDecreto(
  deps: M03Deps,
  origem: "ANULACAO" | "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO" = "ANULACAO",
  teto = "20000.00"
): Promise<{ leiId: string; decretoId: string }> {
  const leiId = await criarLei(
    {
      numero: "L-001", ano: 2026, tipoCredito: "SUPLEMENTAR",
      valorAutorizado: teto, dataPublicacao: new Date("2026-01-15T12:00:00Z"),
      criadoPor: CRIADO_POR,
    },
    deps
  );
  const decretoId = await criarDecreto(
    {
      leiId, numero: "D-001", ano: 2026, data: new Date("2026-03-01T12:00:00Z"),
      origemRecurso: origem, criadoPor: CRIADO_POR,
    },
    deps
  );
  return { leiId, decretoId };
}

describe("M03 — crédito por ANULAÇÃO (balanceado)", () => {
  let deps: M03Deps;
  let deps05: M05Deps;

  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("FECHA (anula 500 de A, suplementa 500 em B): saldos mudam, TOTAL não", async () => {
    const { decretoId } = await leiEDecreto(deps);

    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    const sa = await saldosCorrentesDaFicha(FICHA_A, deps05);
    const sb = await saldosCorrentesDaFicha(FICHA_B, deps05);

    expect(sa.autorizado.toFixed(2)).toBe("9500.00"); // 10000 - 500
    expect(sb.autorizado.toFixed(2)).toBe("5500.00"); // 5000 + 500

    // INVARIANTE 4: reconciliação das DUAS fichas
    expect(await reconciliarFicha(FICHA_A, deps05)).toEqual([]);
    expect(await reconciliarFicha(FICHA_B, deps05)).toEqual([]);

    // o total do orçamento das duas fichas NÃO mudou
    const total = toMoney(sa.autorizado.plus(sb.autorizado));
    expect(total.toFixed(2)).toBe("15000.00"); // 10000 + 5000
  });

  it("PROVA DE BALANCEAMENTO: os movimentos do decreto somam ZERO", async () => {
    const { decretoId } = await leiEDecreto(deps);
    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "300.00", fonteId: FONTE_500 },
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "200.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    // Soma TODOS os MovimentoDotacao gerados por este decreto, com o sinal do
    // tipo. Um crédito por anulação NÃO pode mudar o total do orçamento.
    const movs = await prisma.movimentoDotacao.findMany({
      where: { origemTipo: "CREDITO_ADICIONAL", origemId: decretoId },
      select: { tipo: true, valor: true },
    });
    expect(movs).toHaveLength(3);

    let liquido = toMoney("0.00");
    for (const m of movs) {
      const v = toMoney(m.valor.toFixed(2));
      liquido =
        m.tipo === "CREDITO_ADICIONAL"
          ? toMoney(liquido.plus(v))
          : toMoney(liquido.minus(v));
    }
    expect(liquido.toFixed(2)).toBe("0.00");
  });

  it("REJEITA quando NÃO FECHA (anula 500, suplementa 600) — nada grava", async () => {
    const { decretoId } = await leiEDecreto(deps);

    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "600.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/NÃO FECHA.*suplementado 600\.00.*anulado 500\.00/s);

    // FAIL-CLOSED: nada gravado. Nenhum item, e NENHUM movimento de crédito —
    // o balanceamento é conferido no domínio PURO, antes de abrir transação.
    // (Os 3 movimentos que existem são as DOTACAO_INICIAL com que as fichas
    // nasceram — nenhum CREDITO_ADICIONAL / ANULACAO_CREDITO.)
    expect(await prisma.itemCredito.count()).toBe(0);
    expect(
      await prisma.movimentoDotacao.count({
        where: { tipo: { in: ["CREDITO_ADICIONAL", "ANULACAO_CREDITO"] } },
      })
    ).toBe(0);
    // os saldos das duas fichas seguem intactos
    expect((await saldosCorrentesDaFicha(FICHA_A, deps05)).autorizado.toFixed(2)).toBe("10000.00");
    expect((await saldosCorrentesDaFicha(FICHA_B, deps05)).autorizado.toFixed(2)).toBe("5000.00");
  });

  it("TR 5.111: REJEITA fonte divergente — fecha no total mas não por fonte", async () => {
    const { decretoId } = await leiEDecreto(deps);

    // anula 500 da fonte 540 (ficha C) para suplementar 500 na fonte 500 (ficha B).
    // O TOTAL fecha (500/500) — mas a vinculação do recurso estaria furada.
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_C, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_540 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/TR 5\.111.*não fecha na fonte/s);

    expect(await prisma.itemCredito.count()).toBe(0);
  });

  it("REJEITA fonte do item divergente da fonte da FICHA", async () => {
    const { decretoId } = await leiEDecreto(deps);
    // ficha C é fonte 540, mas o item declara 500 — o balanceamento por fonte
    // passaria a checar uma ficção.
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_C, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/Fonte do item.*diverge da fonte da ficha/s);
  });

  it("REJEITA anular ficha SEM saldo disponível (já empenhado)", async () => {
    // empenha 9800 dos 10000 de A -> disponível 200
    await empenhar(
      {
        fichaId: FICHA_A, numero: "NE1", tipo: "ORDINARIO", valor: "9800.00",
        data: new Date("2026-02-01T12:00:00Z"), credorCpfCnpj: "12345678000199",
        historico: "empenho", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
        criadoPor: CRIADO_POR,
      },
      R_EMPENHO,
      deps05
    );

    const { decretoId } = await leiEDecreto(deps);
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/Não se anula o que já foi empenhado/);

    expect(await prisma.itemCredito.count()).toBe(0);
  });

  it("TR 4.30: REJEITA suplementação além do TETO da lei", async () => {
    const { decretoId } = await leiEDecreto(deps, "ANULACAO", "400.00"); // teto 400
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/TR 4\.30.*excede o saldo da lei.*restante 400\.00/s);
  });
});

describe("M03 — crédito por RECURSO NOVO", () => {
  let deps: M03Deps;
  let deps05: M05Deps;
  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semear();
    await prisma.disponibilidadeRecursoNovo.create({
      data: {
        exercicio: 2026, fonteId: FONTE_500, origem: "SUPERAVIT_FINANCEIRO",
        valor: "3000.00", descricao: "Superávit apurado no balanço de 2025",
        criadoPor: CRIADO_POR,
      },
    });
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("superávit: o total autorizado SOBE (sem perna de anulação)", async () => {
    const { decretoId } = await leiEDecreto(deps, "SUPERAVIT_FINANCEIRO");

    await executarCredito(
      {
        decretoId,
        itens: [{ fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "2000.00", fonteId: FONTE_500 }],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    const sb = await saldosCorrentesDaFicha(FICHA_B, deps05);
    expect(sb.autorizado.toFixed(2)).toBe("7000.00"); // 5000 + 2000 (dinheiro novo)
    expect(await reconciliarFicha(FICHA_B, deps05)).toEqual([]);

    // não houve contrapartida: nenhum item de ANULACAO, e a ficha A só tem o
    // movimento com que nasceu (a DOTACAO_INICIAL) — nada do crédito.
    expect(await prisma.itemCredito.count({ where: { tipo: "ANULACAO" } })).toBe(0);
    const movsA = await prisma.movimentoDotacao.findMany({ where: { fichaId: FICHA_A } });
    expect(movsA).toHaveLength(1);
    expect(movsA[0]!.tipo).toBe("DOTACAO_INICIAL");

    // ficha A intocada pelo crédito: segue com a dotação da LOA
    expect((await saldosCorrentesDaFicha(FICHA_A, deps05)).autorizado.toFixed(2)).toBe("10000.00");
  });

  it("REJEITA perna de anulação num decreto por recurso novo", async () => {
    const { decretoId } = await leiEDecreto(deps, "SUPERAVIT_FINANCEIRO");
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/NÃO pode ter perna de anulação/);
  });

  it("REJEITA crédito além da DISPONIBILIDADE declarada da fonte", async () => {
    const { decretoId } = await leiEDecreto(deps, "SUPERAVIT_FINANCEIRO");
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [{ fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "3500.00", fonteId: FONTE_500 }],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/excede a disponibilidade da fonte.*declarado 3000\.00/s);
  });

  it("REJEITA recurso novo SEM disponibilidade declarada (não sai do nada)", async () => {
    const { decretoId } = await leiEDecreto(deps, "OPERACAO_CREDITO");
    await expect(
      executarCredito(
        {
          decretoId,
          itens: [{ fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "100.00", fonteId: FONTE_500 }],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/Sem disponibilidade declarada.*não pode sair do nada/s);
  });
});

describe("M03 — encerramento e anulação", () => {
  let deps: M03Deps;
  let deps05: M05Deps;
  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("decreto ENCERRADO rejeita novo item (estado DERIVADO do fato)", async () => {
    const { decretoId } = await leiEDecreto(deps);
    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    await encerrarDecreto(
      { decretoId, data: new Date("2026-03-10T12:00:00Z"), motivo: "executado", criadoPor: CRIADO_POR },
      deps
    );

    await expect(
      executarCredito(
        {
          decretoId,
          itens: [
            { fichaId: FICHA_A, tipo: "ANULACAO", valor: "100.00", fonteId: FONTE_500 },
            { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "100.00", fonteId: FONTE_500 },
          ],
          criadoPor: CRIADO_POR,
        },
        deps
      )
    ).rejects.toThrow(/ENCERRADO/);

    expect(await prisma.itemCredito.count()).toBe(2); // só os do 1º lote
  });

  it("anular crédito: registro NOVO; saldos voltam; original INTACTO", async () => {
    const { decretoId } = await leiEDecreto(deps);
    const ids = await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    const antes = await prisma.itemCredito.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { id: "asc" },
    });

    await anularCredito(
      { decretoId, data: new Date("2026-04-01T12:00:00Z"), motivo: "revogado", criadoPor: CRIADO_POR },
      deps
    );

    // saldos voltaram ao original
    expect((await saldosCorrentesDaFicha(FICHA_A, deps05)).autorizado.toFixed(2)).toBe("10000.00");
    expect((await saldosCorrentesDaFicha(FICHA_B, deps05)).autorizado.toFixed(2)).toBe("5000.00");
    expect(await reconciliarFicha(FICHA_A, deps05)).toEqual([]);
    expect(await reconciliarFicha(FICHA_B, deps05)).toEqual([]);

    // INVARIANTE 1: originais intactos
    const depois = await prisma.itemCredito.findMany({
      where: { id: { in: [...ids] } },
      orderBy: { id: "asc" },
    });
    expect(depois).toEqual(antes);

    // 2 itens originais + 2 estornos
    expect(await prisma.itemCredito.count()).toBe(4);
  });

  it("REJEITA anular crédito duas vezes", async () => {
    const { decretoId } = await leiEDecreto(deps);
    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );
    const anul = { decretoId, data: new Date("2026-04-01T12:00:00Z"), motivo: "revogado", criadoPor: CRIADO_POR };
    await anularCredito(anul, deps);

    await expect(anularCredito(anul, deps)).rejects.toThrow(/não tem item vivo/);
  });
});

describe("M03 × M05 — o crédito vira saldo EMPENHÁVEL", () => {
  let deps: M03Deps;
  let deps05: M05Deps;
  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    deps05 = criarM05Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("suplementa B em 500 e empenha em B usando o novo saldo", async () => {
    // B tem 5000. Empenhar 5300 falha ANTES do crédito.
    const empenhoGrande = {
      fichaId: FICHA_B, numero: "NE1", tipo: "ORDINARIO" as const, valor: "5300.00",
      data: new Date("2026-03-15T12:00:00Z"), credorCpfCnpj: "12345678000199",
      historico: "empenho",
      categoriaOrdemCronologica: "FORNECIMENTO_BENS" as const,
      criadoPor: CRIADO_POR,
    };
    await expect(empenhar(empenhoGrande, R_EMPENHO, deps05)).rejects.toThrow(
      /Saldo insuficiente/
    );

    // suplementa 500 em B (anulando 500 de A)
    const { decretoId } = await leiEDecreto(deps);
    await executarCredito(
      {
        decretoId,
        itens: [
          { fichaId: FICHA_A, tipo: "ANULACAO", valor: "500.00", fonteId: FONTE_500 },
          { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "500.00", fonteId: FONTE_500 },
        ],
        criadoPor: CRIADO_POR,
      },
      deps
    );

    // agora o MESMO empenho passa — o crédito virou saldo empenhável de verdade
    const e = await empenhar(empenhoGrande, R_EMPENHO, deps05);
    expect(e.empenhoId).toBeTruthy();

    const sb = await saldosCorrentesDaFicha(FICHA_B, deps05);
    expect(sb.autorizado.toFixed(2)).toBe("5500.00");
    expect(sb.empenhado.toFixed(2)).toBe("5300.00");
    expect(sb.disponivel.toFixed(2)).toBe("200.00");
    expect(await reconciliarFicha(FICHA_B, deps05)).toEqual([]);
  });
});

// ── domínio puro ───────────────────────────────────────────────────────────

describe("M03 — balanceamento (puro)", () => {
  const f500 = "f500";
  const f540 = "f540";

  it("aceita quando fecha no total E por fonte", () => {
    expect(() =>
      validarBalanceamento("ANULACAO", [
        { fichaId: "a", tipo: "ANULACAO", valor: toMoney("500.00"), fonteId: f500 },
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).not.toThrow();
  });

  it("aceita N x M dentro da mesma fonte (2 anulações somam 1 suplementação)", () => {
    expect(() =>
      validarBalanceamento("ANULACAO", [
        { fichaId: "a", tipo: "ANULACAO", valor: toMoney("300.00"), fonteId: f500 },
        { fichaId: "c", tipo: "ANULACAO", valor: toMoney("200.00"), fonteId: f500 },
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).not.toThrow();
  });

  it("REJEITA quando não fecha no total", () => {
    expect(() =>
      validarBalanceamento("ANULACAO", [
        { fichaId: "a", tipo: "ANULACAO", valor: toMoney("500.00"), fonteId: f500 },
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("600.00"), fonteId: f500 },
      ])
    ).toThrow(/NÃO FECHA/);
  });

  it("REJEITA quando fecha no total mas NÃO por fonte (TR 5.111)", () => {
    expect(() =>
      validarBalanceamento("ANULACAO", [
        { fichaId: "c", tipo: "ANULACAO", valor: toMoney("500.00"), fonteId: f540 },
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).toThrow(/TR 5\.111/);
  });

  it("REJEITA crédito por anulação sem perna de anulação", () => {
    expect(() =>
      validarBalanceamento("ANULACAO", [
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).toThrow(/ao menos 1 suplementação e 1 anulação/);
  });

  it("REJEITA anulação num decreto por recurso novo", () => {
    expect(() =>
      validarBalanceamento("SUPERAVIT_FINANCEIRO", [
        { fichaId: "a", tipo: "ANULACAO", valor: toMoney("500.00"), fonteId: f500 },
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).toThrow(/NÃO pode ter perna de anulação/);
  });

  it("aceita recurso novo só com suplementação", () => {
    expect(() =>
      validarBalanceamento("EXCESSO_ARRECADACAO", [
        { fichaId: "b", tipo: "SUPLEMENTACAO", valor: toMoney("500.00"), fonteId: f500 },
      ])
    ).not.toThrow();
  });
});
