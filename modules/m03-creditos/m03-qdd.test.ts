import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarFichasDeTeste } from "../../test/ficha-teste.js";
import { criarM03Deps } from "./adapter-prisma.js";
import { criarDecreto, criarLei, executarCredito } from "./servico.js";
import { listarQdd } from "./consultas.js";
import { saldosCorrentesDaFicha } from "../m05-despesa/servico.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import type { M03Deps } from "./ports.js";

/**
 * M03 — A DOTAÇÃO ATUALIZADA DO QDD (TR 4.20–4.40).
 *
 * ═══ O QUE ESTE ARQUIVO PROVA, E POR QUE PRECISA DE BANCO ═══
 * A identidade `inicial + suplementações − anulações = atualizada` é fácil de escrever e fácil de
 * escrever ERRADO — o jeito clássico de errá-la é somar a anulação com sinal positivo, e aí o QDD
 * mostra uma ficha anulada crescendo. Testá-la contra um mock provaria só que o mock concorda com
 * o teste; contra o banco, ela é conferida sobre os MovimentoDotacao que o `executarCredito` de
 * verdade gravou.
 *
 * ═══ A AMARRAÇÃO QUE IMPORTA (t3) ═══
 * O QDD não pode ter uma segunda definição de dotação. `listarQdd` delega ao `calcularSaldos` do
 * M05 — o MESMO que escreve o cache da ficha e o mesmo que a `reconciliarFicha` confere. O teste
 * compara a coluna do QDD com o `saldosCorrentesDaFicha().autorizado` e exige IGUALDADE: no dia em que
 * alguém reescrever a soma aqui, é esta linha que cai. Um QDD que discorda do teto contra o qual
 * o empenho é julgado seria pior do que não ter QDD.
 *
 * ⚠️ FAIL-HARD: banco indisponível DERRUBA o arquivo, nunca o pula (ver test/banco.ts).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

// ⚠️ Um identificador do elenco de `test/usuarios-teste.ts`: o funil recusa autor não cadastrado.
const CRIADO_POR = "m03@cg.pb.gov.br";
const FONTE_500 = "fnt-500";
/** A (fonte 500, 10.000) e B (fonte 500, 5.000) — o par que permite um decreto que FECHA. */
const FICHA_A = "ficha-a";
const FICHA_B = "ficha-b";

async function semear(): Promise<void> {
  await limparBanco(prisma);
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
  await prisma.programa.create({ data: { id: "prg-0012", codigo: "0012", descricao: "Educação" } });
  await prisma.acao.create({ data: { id: "aca-2001", codigo: "2001", descricao: "Manutenção", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({
    data: {
      id: "nd-339039", codCategoria: "3", codNatureza: "3", codModalidade: "90",
      codElemento: "39", codigoCompleto: "339039", descricao: "Serviços PJ",
    },
  });
  await prisma.fonteRecurso.create({
    data: { id: FONTE_500, codigo: "500", descricao: "Não vinculados", codigoTce: "500" },
  });

  const base = {
    exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-12",
    programaId: "prg-0012", acaoId: "aca-2001", naturezaDespesaId: "nd-339039", fonteId: FONTE_500,
  };
  await criarFichasDeTeste(prisma, [
    { ...base, id: FICHA_A, numero: 1, subfuncaoId: "sub-361", valorDotado: "10000.00" },
    { ...base, id: FICHA_B, numero: 2, subfuncaoId: "sub-362", valorDotado: "5000.00" },
  ]);
}

/** Um decreto por ANULAÇÃO que FECHA: tira 1.500 de A e põe 1.500 em B (mesma fonte, TR 5.111). */
async function decretoQueRemaneja(deps: M03Deps): Promise<void> {
  const leiId = await criarLei(
    {
      numero: "L-001", ano: 2026, tipoCredito: "SUPLEMENTAR", valorAutorizado: "20000.00",
      dataPublicacao: new Date("2026-01-15T12:00:00Z"), criadoPor: CRIADO_POR,
    },
    deps
  );
  const decretoId = await criarDecreto(
    {
      leiId, numero: "D-001", ano: 2026, data: new Date("2026-03-01T12:00:00Z"),
      origemRecurso: "ANULACAO", criadoPor: CRIADO_POR,
    },
    deps
  );
  await executarCredito(
    {
      decretoId,
      itens: [
        { fichaId: FICHA_A, tipo: "ANULACAO", valor: "1500.00", fonteId: FONTE_500 },
        { fichaId: FICHA_B, tipo: "SUPLEMENTACAO", valor: "1500.00", fonteId: FONTE_500 },
      ],
      criadoPor: CRIADO_POR,
    },
    deps
  );
}

describe("M03 — QDD: a coluna DOTAÇÃO ATUALIZADA", () => {
  let deps: M03Deps;

  beforeEach(async () => {
    deps = criarM03Deps(prisma);
    await semear();
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: sem crédito nenhum, a atualizada É a inicial (e os créditos saem zerados)", async () => {
    const qdd = await listarQdd(prisma, { exercicio: 2026 });

    expect(qdd.map((l) => l.numero), "uma linha por ficha, ordenadas pelo número").toEqual([1, 2]);
    const a = qdd.find((l) => l.numero === 1)!;
    expect(a.dotacaoInicial).toBe("10000.00");
    expect(a.creditoSuplementado).toBe("0.00");
    expect(a.creditoAnulado).toBe("0.00");
    expect(a.dotacaoAtualizada, "sem movimento de crédito, a atualizada não inventa nada").toBe("10000.00");
  });

  it("t2: a suplementação SOMA e a anulação SUBTRAI — a identidade do 4.40", async () => {
    await decretoQueRemaneja(deps);
    const qdd = await listarQdd(prisma, { exercicio: 2026 });
    const a = qdd.find((l) => l.numero === 1)!;
    const b = qdd.find((l) => l.numero === 2)!;

    // A ficha ANULADA encolhe: 10.000 − 1.500. O erro clássico (somar a anulação) daria 11.500.
    expect(a.creditoAnulado).toBe("1500.00");
    expect(a.creditoSuplementado).toBe("0.00");
    expect(a.dotacaoAtualizada).toBe("8500.00");

    // A ficha SUPLEMENTADA cresce: 5.000 + 1.500.
    expect(b.creditoSuplementado).toBe("1500.00");
    expect(b.dotacaoAtualizada).toBe("6500.00");

    // ⚠️ A IDENTIDADE, LINHA A LINHA: inicial + suplementado − anulado = atualizada.
    for (const l of qdd) {
      const conferido =
        Number(l.dotacaoInicial) + Number(l.creditoSuplementado) - Number(l.creditoAnulado);
      expect(conferido.toFixed(2), `a linha da ficha ${l.numero} tem de fechar na horizontal`).toBe(
        l.dotacaoAtualizada
      );
    }

    // ⚠️ O TOTAL DO ENTE NÃO MUDA num decreto por anulação — é o ponto todo da TR 5.111. Se o QDD
    // somasse a anulação com o sinal errado, este total daria 18.000 em vez de 15.000.
    const total = qdd.reduce((s, l) => s + Number(l.dotacaoAtualizada), 0);
    expect(total.toFixed(2)).toBe("15000.00");
  });

  it("t3: a atualizada do QDD é EXATAMENTE o autorizado da ficha (uma definição só de dotação)", async () => {
    await decretoQueRemaneja(deps);
    const deps05 = criarM05Deps(prisma);
    const qdd = await listarQdd(prisma, { exercicio: 2026 });

    for (const l of qdd) {
      const saldos = await saldosCorrentesDaFicha(l.fichaId, deps05);
      expect(
        l.dotacaoAtualizada,
        `a ficha ${l.numero}: o QDD e o saldo AUTORIZADO da ficha têm de ser o mesmo número — ` +
          `é contra o autorizado que o empenho é julgado. Divergir aqui significa que alguém ` +
          `escreveu uma segunda soma de dotação.`
      ).toBe(saldos.autorizado.toFixed(2));
    }
  });

  it("t4: o recorte por UNIDADE filtra as fichas; uma UG inexistente devolve lista vazia", async () => {
    expect((await listarQdd(prisma, { exercicio: 2026, unidadeCodigo: "01001" })).length).toBe(2);
    expect(
      (await listarQdd(prisma, { exercicio: 2026, unidadeCodigo: "09999" })).length,
      "UG sem ficha devolve vazio — nunca o consolidado do ente por engano"
    ).toBe(0);
    expect((await listarQdd(prisma, { exercicio: 2025 })).length, "outro exercício, outras fichas").toBe(0);
  });
});
