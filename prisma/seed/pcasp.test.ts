import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  CONTAS_FIXTURE_A_CONFIRMAR,
  CONTAS_PCASP_STN,
  PLANO_MINIMO,
  semearPcasp,
} from "./pcasp.js";

/**
 * O SEED DO PLANO PCASP — o dado que faltava para a execução sair do papel.
 *
 * ⚠️ ESTE TESTE SUBSTITUI A CONFERÊNCIA MANUAL NO psql. "Rodei o seed e olhei o
 * banco" não é verificação: é uma coisa que aconteceu uma vez, na máquina de alguém.
 *
 * ⚠️ O BOOTSTRAP DO PRIMEIRO USUÁRIO NÃO ESTÁ AQUI — pendência
 * `BOOTSTRAP-VS-GUARD-SEED`, ver MODULO.md do M16. Ele foi escrito nesta sessão e
 * REMOVIDO: o t5 de `m16-rollout.test.ts` proíbe qualquer seed que toque perfil,
 * usuário ou permissão, e o guard está certo — um seed re-executável que carimba
 * chave-mestra num banco povoado é o vetor que ele descreve.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula.
await exigirBanco(prisma);

describe("seed:pcasp — o plano mínimo, com procedência", () => {
  beforeEach(async () => {
    await limparBanco(prisma);
  });

  it("t1: semeia o plano e o banco bate com as DUAS listas", async () => {
    const r = await semearPcasp(prisma);

    expect(r.total).toBe(PLANO_MINIMO.length);
    expect(r.criadas).toBe(PLANO_MINIMO.length);
    expect(r.atualizadas).toBe(0);

    const noBanco = await prisma.contaPcasp.findMany({ select: { codigo: true } });
    expect(noBanco.length).toBe(PLANO_MINIMO.length);
    expect(new Set(noBanco.map((c) => c.codigo))).toEqual(
      new Set(PLANO_MINIMO.map((c) => c.codigo))
    );

    // As duas listas são DISJUNTAS — uma conta não pode ser oficial e a confirmar.
    const stn = new Set(CONTAS_PCASP_STN.map((c) => c.codigo));
    for (const c of CONTAS_FIXTURE_A_CONFIRMAR) {
      expect(stn.has(c.codigo)).toBe(false);
    }
  });

  it("t2: IDEMPOTENTE — a 2ª execução não cria nada", async () => {
    await semearPcasp(prisma);
    const antes = await prisma.contaPcasp.count();

    const r2 = await semearPcasp(prisma);

    expect(r2.criadas).toBe(0);
    expect(r2.atualizadas).toBe(PLANO_MINIMO.length);
    expect(await prisma.contaPcasp.count()).toBe(antes);
  });

  it("t3: as contas do EXTRATO estão lá, com a natureza certa", async () => {
    await semearPcasp(prisma);

    const porCodigo = new Map(
      (await prisma.contaPcasp.findMany()).map((c) => [c.codigo, c])
    );

    // O encadeamento orçamentário da despesa, conta a conta.
    expect(porCodigo.get("6.2.2.1.1.00.00")?.naturezaSaldo).toBe("CREDORA");
    expect(porCodigo.get("6.2.2.1.3.01.00")?.analitica).toBe(true);
    expect(porCodigo.get("6.2.2.1.3.03.00")?.analitica).toBe(true);
    expect(porCodigo.get("6.2.2.1.3.04.00")?.analitica).toBe(true);

    // ⚠️ A SINTÉTICA existe e NÃO é analítica — era exatamente ela que as fixtures
    // usavam para receber partida.
    expect(porCodigo.get("6.2.2.1.3.00.00")?.analitica).toBe(false);

    // As duas contas confirmadas nesta sessão.
    expect(porCodigo.get("4.6.4.1.1.00.00")?.naturezaSaldo).toBe("CREDORA");
    expect(porCodigo.get("1.1.2.2.1.00.00")?.naturezaSaldo).toBe("DEVEDORA");
    expect(porCodigo.get("1.1.2.2.1.00.00")?.indicadorSuperavit).toBe("P");

    // A DDR entra no plano (é oficial) mesmo sem roteiro que a use — DDR-CLASSE-8.
    expect(porCodigo.get("8.2.1.1.1.00.00")?.analitica).toBe(true);
  });

  it("t4: a HIERARQUIA fecha — nenhuma analítica órfã", async () => {
    await semearPcasp(prisma);

    const contas = await prisma.contaPcasp.findMany({
      select: { codigo: true, analitica: true, contaPaiId: true },
    });
    const porCodigo = new Map(
      (await prisma.contaPcasp.findMany({ select: { id: true, codigo: true } })).map(
        (c) => [c.id, c.codigo]
      )
    );

    for (const c of contas) {
      const declarado = PLANO_MINIMO.find((p) => p.codigo === c.codigo)!;
      if (declarado.pai === undefined) {
        expect(c.contaPaiId).toBeNull();
        continue;
      }
      // o pai gravado é o pai declarado — a árvore não depende da ordem do array
      expect(porCodigo.get(c.contaPaiId!)).toBe(declarado.pai);
    }
  });
});
