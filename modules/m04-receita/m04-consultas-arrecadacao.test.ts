import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM04Deps } from "./adapter-prisma.js";
import { listarArrecadacoes, listarNaturezasPrevistas } from "./consultas.js";
import { roteiroArrecadacao, type RoteiroContabil } from "./dominio.js";
import { anularArrecadacao, registrarArrecadacao } from "./servico.js";
import type { M04Deps } from "./ports.js";

/**
 * AS LEITURAS DA ARRECADAÇÃO — o que a UI da 7.1 mostra (TR 4.59).
 *
 * ⚠️ TODAS AS CONTAS FEITAS À MÃO, ANTES DO CÓDIGO.
 *
 * ═══ O CENÁRIO ═══
 *   G1  arrecada 1.500,00 em 10/03
 *   G2  arrecada   800,00 em 15/03
 *   G1' ANULA a G1 (guia de anulação, 20/03)
 *
 * ═══ t1 — O TOTAL É LÍQUIDO, E AS TRÊS LINHAS APARECEM ═══
 *   total = 1.500 + 800 − 1.500 = 800,00
 *   A lista tem 3 linhas — a anulada CONTINUA lá (append-only) e a anulação está ao
 *   lado dela, com sinal −1. Esconder as duas faria a tela mostrar 800 de total com
 *   uma única linha de 800 visível... e a de 1.500 sumindo sem explicação. O usuário
 *   que conferiu a guia de 1.500 ontem precisa vê-la hoje, anulada.
 *
 * ═══ t2 — O CORTE É PELA DATA DO FATO ═══
 *   período 01/03..12/03 ⟹ só a G1 (1.500,00). A G2 é de 15/03 e a anulação de 20/03:
 *   nenhuma das duas entra, e o total do recorte é 1.500,00 — a fila do que ACONTECEU
 *   naquele intervalo, não do que foi digitado nele.
 *
 * ═══ t3 — O ROL DA LOA ═══
 *   `listarNaturezasPrevistas` devolve o vocabulário da arrecadação (o que a LOA
 *   previu). É o que a tela oferece em vez de pedir 8 dígitos de cabeça.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula. Ver test/banco.ts.
await exigirBanco(prisma);

const POR = "m04@cg.pb.gov.br";

const CONTAS = [
  { id: "c-caixa", codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
  { id: "c-vpa", codigo: "4.1.1.2.1.01.00", nome: "VPA - Impostos", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-a-realizar", codigo: "6.2.1.1.0.00.00", nome: "Receita a Realizar", naturezaSaldo: "CREDORA" as const, nivel: 5, analitica: true },
  { id: "c-realizada", codigo: "6.2.1.2.0.00.00", nome: "Receita Realizada", naturezaSaldo: "DEVEDORA" as const, nivel: 5, analitica: true },
];

const ROTEIRO: RoteiroContabil = roteiroArrecadacao({
  disponibilidade: "1.1.1.1.1.00.00",
  variacaoAumentativa: "4.1.1.2.1.01.00",
  receitaARealizar: "6.2.1.1.0.00.00",
  receitaRealizada: "6.2.1.2.0.00.00",
});

describe("M04 — as leituras da arrecadação (TR 4.59)", () => {
  let deps: M04Deps;

  beforeEach(async () => {
    deps = criarM04Deps(prisma);
    await limparBanco(prisma);

    await prisma.contaPcasp.createMany({ data: CONTAS });
    await prisma.naturezaReceita.createMany({
      data: [
        { id: "nr-iptu", codigo: "11121101", descricao: "IPTU - Principal" },
        { id: "nr-issqn", codigo: "11130501", descricao: "ISSQN - Principal" },
      ],
    });
    await prisma.fonteRecurso.createMany({
      data: [{ id: "fnt-500", codigo: "500", descricao: "Não vinculados", codigoTce: "500" }],
    });
    await prisma.codigoAcompanhamento.createMany({
      data: [{ id: "co-0001", codigo: "0001", descricao: "Execução direta" }],
    });
    await prisma.receitaPrevista.createMany({
      data: [
        { exercicio: 2026, naturezaReceitaId: "nr-iptu", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "2000.00" },
        { exercicio: 2026, naturezaReceitaId: "nr-issqn", fonteId: "fnt-500", exercicioFonte: 1, tipoReceita: "ORCAMENTARIA", valorPrevisto: "3000.00" },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function arrecada(
    valor: string,
    numero: string,
    dia: string
  ): Promise<string> {
    const r = await registrarArrecadacao(
      {
        exercicio: 2026, naturezaReceita: "11121101", fonte: "500", co: "0001",
        exercicioFonte: 1, valor, dataArrecadacao: new Date(`2026-03-${dia}T12:00:00Z`),
        numeroReceita: numero, criadoPor: POR,
      },
      ROTEIRO,
      deps
    );
    return r.receitaId;
  }

  it("t1: o total é LÍQUIDO das anulações — e a guia anulada continua na lista", async () => {
    const g1 = await arrecada("1500.00", "2026RC000001", "10");
    await arrecada("800.00", "2026RC000002", "15");
    // ⚠️ A anulação NÃO recebe roteiro: ela INVERTE o lançamento original (o M04 o
    // busca e estorna), em vez de compor um roteiro novo. Passar um aqui seria
    // oferecer ao estorno a chance de divergir do fato que ele nega.
    await anularArrecadacao(
      {
        receitaId: g1,
        dataAnulacao: new Date("2026-03-20T12:00:00Z"),
        numeroReceita: "2026RC000001",
        criadoPor: POR,
      },
      deps
    );

    const { linhas, total } = await listarArrecadacoes(prisma, { exercicio: 2026 });

    // 1.500 + 800 − 1.500 = 800,00
    expect(total.toFixed(2)).toBe("800.00");
    expect(linhas.length).toBe(3);

    // A anulação é linha, com sinal −1 e valor POSITIVO (o valor da guia que ela nega).
    const anulacao = linhas.find((l) => l.sinal === -1)!;
    expect(anulacao.valor.toFixed(2)).toBe("1500.00");
    expect(anulacao.anulacaoDeId).toBe(g1);
    expect(anulacao.tipo).toBe("ANULACAO");

    // A guia original NÃO some — ela continua lá, com sinal +1.
    const original = linhas.find((l) => l.id === g1)!;
    expect(original.sinal).toBe(1);
    expect(original.valor.toFixed(2)).toBe("1500.00");
    expect(original.naturezaCodigo).toBe("11121101");
    expect(original.naturezaDescricao).toBe("IPTU - Principal");
    expect(original.fonteCodigo).toBe("500");
    expect(original.coCodigo).toBe("0001");
    expect(original.criadoPor).toBe(POR);
  });

  it("t2: o corte é pela DATA DO FATO (dataArrecadacao), não pela digitação", async () => {
    const g1 = await arrecada("1500.00", "2026RC000001", "10");
    await arrecada("800.00", "2026RC000002", "15");
    // ⚠️ A anulação NÃO recebe roteiro: ela INVERTE o lançamento original (o M04 o
    // busca e estorna), em vez de compor um roteiro novo. Passar um aqui seria
    // oferecer ao estorno a chance de divergir do fato que ele nega.
    await anularArrecadacao(
      {
        receitaId: g1,
        dataAnulacao: new Date("2026-03-20T12:00:00Z"),
        numeroReceita: "2026RC000001",
        criadoPor: POR,
      },
      deps
    );

    const recorte = await listarArrecadacoes(prisma, {
      exercicio: 2026,
      inicio: new Date("2026-03-01T00:00:00Z"),
      fim: new Date("2026-03-12T23:59:59Z"),
    });

    // Só a G1 (10/03). A G2 (15/03) e a anulação (20/03) estão fora da janela.
    expect(recorte.linhas.length).toBe(1);
    expect(recorte.linhas[0]!.id).toBe(g1);
    expect(recorte.total.toFixed(2)).toBe("1500.00");
  });

  it("t3: o rol da LOA é o vocabulário da arrecadação", async () => {
    const rol = await listarNaturezasPrevistas(prisma, { exercicio: 2026 });

    expect(rol.map((n) => n.naturezaCodigo)).toEqual(["11121101", "11130501"]);
    expect(rol[0]!.naturezaDescricao).toBe("IPTU - Principal");
    expect(rol[0]!.fonteCodigo).toBe("500");
    expect(rol[0]!.valorPrevisto.toFixed(2)).toBe("2000.00");

    // Exercício sem LOA: rol vazio — a tela mostra o EstadoVazio, não um erro.
    expect((await listarNaturezasPrevistas(prisma, { exercicio: 2025 })).length).toBe(0);
  });
});
