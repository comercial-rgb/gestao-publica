import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";

/**
 * VERSIONAR OS ROTEIROS EXISTENTES — o backfill da HISTÓRIA (orquestração V3, 4.4/4.5).
 *
 * ═══ O QUE ISTO FAZ, E O QUE NÃO FAZ ═══
 * Para cada linha legada de `RoteiroPatrimonial` e `RoteiroResultadoAlienacao` que ainda
 * NÃO tem versão, cria a VERSÃO 1 em `VersaoDeRoteiro`, PUBLICADA, com:
 *   - as MESMAS contas da linha legada;
 *   - `criadoPor`/`publicadaPor` = o autor da linha legada, `criadoEm`/`publicadaEm` = o
 *     momento dela — a origem é preservada, não reescrita;
 *   - o motivo nomeando a origem: "linha anterior ao versionamento".
 *
 * Ele NÃO troca conta nenhuma, NÃO apaga a linha legada (ela fica como evidência, e o
 * resolvedor a ignora assim que há versão) e NÃO toca em movimento nem em lançamento. É
 * migração de HISTÓRIA, e por isso corre pelo dono do banco, como `db:sql` — não é ato de
 * usuário e não cobra permissão: nada de novo é concedido nem parametrizado.
 *
 * ⚠️ IDEMPOTENTE: uma linha que já tem versão é pulada e relatada. Rodar de novo não cria
 * nada.
 *
 * Uso:  npx tsx scripts/versionar-roteiros-existentes.ts
 */
const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");

const prisma = criarPrismaClient(url);
try {
  const patrimoniais = await prisma.roteiroPatrimonial.findMany({
    select: { tipo: true, contaDebitoId: true, contaCreditoId: true, criadoEm: true, criadoPor: true },
  });
  const resultados = await prisma.roteiroResultadoAlienacao.findMany({
    select: { chave: true, contaDebitoId: true, contaCreditoId: true, criadoEm: true, criadoPor: true },
  });
  const legadas = [
    ...patrimoniais.map((r) => ({
      familia: "PATRIMONIAL" as const, chave: String(r.tipo),
      contaDebitoId: r.contaDebitoId, contaCreditoId: r.contaCreditoId, criadoEm: r.criadoEm, criadoPor: r.criadoPor,
    })),
    ...resultados.map((r) => ({
      familia: "RESULTADO_ALIENACAO" as const, chave: String(r.chave),
      contaDebitoId: r.contaDebitoId, contaCreditoId: r.contaCreditoId, criadoEm: r.criadoEm, criadoPor: r.criadoPor,
    })),
  ];

  let criadas = 0;
  let puladas = 0;
  for (const l of legadas) {
    const ja = await prisma.versaoDeRoteiro.count({ where: { familia: l.familia, chave: l.chave } });
    if (ja > 0) {
      puladas += 1;
      console.log(`  já versionado  ${l.familia} ${l.chave} (${ja} versão(ões))`);
      continue;
    }
    await prisma.versaoDeRoteiro.create({
      data: {
        familia: l.familia,
        chave: l.chave,
        numero: 1,
        contaDebitoId: l.contaDebitoId,
        contaCreditoId: l.contaCreditoId,
        motivo:
          `Origem: linha anterior ao versionamento, gravada por ${l.criadoPor} em ` +
          `${l.criadoEm.toISOString()}. Esta versão 1 apenas registra o que já vigorava; ` +
          `nenhuma conta foi trocada aqui.`,
        situacao: "PUBLICADA",
        criadoEm: l.criadoEm,
        criadoPor: l.criadoPor,
        publicadaEm: l.criadoEm,
        publicadaPor: l.criadoPor,
      },
    });
    criadas += 1;
    console.log(`  + versão 1     ${l.familia} ${l.chave} — origem preservada (${l.criadoPor}, ${l.criadoEm.toISOString().slice(0, 10)})`);
  }
  console.log(`\n${criadas} versão(ões) criada(s), ${puladas} já existia(m). Nenhuma conta trocada, nenhum lançamento tocado.`);
} finally {
  await prisma.$disconnect();
}
