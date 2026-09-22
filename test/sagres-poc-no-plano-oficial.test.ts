import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { carregarPlanoOficial } from "../prisma/seed/oficial/pcasp-oficial.js";
import { semearSagresPoc } from "../prisma/seed/sagres-poc.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * ═══ A POC DO SAGRES RODA CONTRA O PLANO OFICIAL (V11 V8.14) ═══
 *
 * `SAGRES-POC-CONTA-SINTETICA`. A POC foi escrita contra o plano MÍNIMO, que marcava as contas
 * dela como analíticas. No PCASP oficial do TCE-PB (7.864 contas) elas são SINTÉTICAS, o
 * `skipDuplicates` do seed preserva a versão oficial, e a demonstração morria no primeiro
 * lançamento — "conta sintética não recebe partida", que é o guard fazendo o trabalho dele.
 *
 * ⚠️ O QUE ESTE ARQUIVO AFIRMA NÃO É "A POC RODOU". É a PROPRIEDADE que importa: **nenhuma
 * partida do razão caiu em conta sintética**, contra o plano REAL. "Rodou" passaria com uma conta
 * errada que por acaso fosse analítica; esta afirmação não.
 *
 * ⚠️ E O PLANO ENTRA INTEIRO, não um recorte. Um recorte seria eu escolhendo quais ramos a POC
 * enxerga — e a escolha do recorte esconderia exatamente o ramo que eu tivesse esquecido.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await limparBanco(prisma);
  const { contas } = carregarPlanoOficial();
  await prisma.contaPcasp.createMany({
    data: contas.map((c) => ({
      codigo: c.codigo,
      nome: c.nome,
      naturezaSaldo: c.naturezaSaldo,
      nivel: c.nivel,
      analitica: c.analitica,
    })),
    skipDuplicates: true,
  });
}, 300_000);

describe("a POC do SAGRES contra o PCASP oficial", () => {
  it("t1: a demonstração inteira nasce, e NENHUMA partida cai em conta sintética", async () => {
    // ⚠️ A IDENTIDADE É A DA FIXTURE (o `limparBanco` a semeia): todo fato carrega quem o criou, e
    // o funil do razão recusa um `criadoPor` que não existe. No dev quem cumpre esse papel é o
    // `seed:bootstrap`.
    await semearSagresPoc(prisma as unknown as PrismaClient, { criadoPor: "m05@cg.pb.gov.br" });

    // ⚠️ A ÂNCORA: sem ela, uma POC que não gravasse nada passaria neste teste com zero partidas
    // em conta sintética — o verde mais vazio que existe.
    const partidas = await prisma.partidaContabil.count();
    expect(partidas).toBeGreaterThan(20);

    const emSintetica = await prisma.partidaContabil.findMany({
      where: { conta: { analitica: false } },
      select: { valor: true, conta: { select: { codigo: true, nome: true } } },
    });
    expect(
      emSintetica.map((p) => `${p.conta.codigo} ${p.conta.nome}`),
      "\n\n⚠️ PARTIDA EM CONTA SINTÉTICA no plano OFICIAL.\n"
    ).toEqual([]);
  }, 300_000);

  it("t2: e as contas que a POC resolve estruturalmente são MESMO sintéticas no plano oficial", async () => {
    // ⚠️ A CONTRAPROVA DE t1. Se estas contas fossem analíticas no plano, `contaDaDemonstracao`
    // seria um desvio morto e t1 estaria provando o caminho antigo — verde pelo motivo errado.
    const base = ["1.2.3.1.1.01.00", "1.2.3.2.1.01.00", "1.2.3.8.1.01.00", "4.5.9.1.1.00.00", "3.3.3.1.1.00.00"];
    const lidas = await prisma.contaPcasp.findMany({
      where: { codigo: { in: base } },
      select: { codigo: true, analitica: true },
    });
    expect(lidas.length).toBe(base.length);
    expect(lidas.filter((c) => c.analitica)).toEqual([]);
  });
});
