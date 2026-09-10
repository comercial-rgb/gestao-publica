import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { processarExecucoesPendentes } from "../modules/m26-designer/servico.js";

/**
 * O TRABALHADOR DO DESIGNER — drena a fila de execuções pendentes.
 *
 * Uso:
 *   npm run relatorios:processar
 *
 * ⚠️ ELE RODA POR CHAMADA, E ISSO ESTÁ DECLARADO. Não há processo dedicado neste
 * repositório: um `setInterval` dentro do servidor web seria um agendador que morre no
 * primeiro deploy sem ninguém perceber, e a fila pararia em silêncio — que é o pior
 * modo de falha possível para uma fila.
 *
 * A tela de execuções também chama o trabalhador ao ser aberta, de modo que o caminho
 * normal do usuário não depende de alguém lembrar deste comando. Um processo contínuo
 * de verdade é a pendência DESIGNER-WORKER-CONTINUO.
 *
 * ⚠️ ELE NÃO COBRA AUTORIZAÇÃO, e isso é desenho: a autorização aconteceu no
 * ENFILEIRAMENTO, com a identidade de quem pediu. Ver `modules/m26-designer/servico.ts`.
 */
function urlDoBanco(): string {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim() === "") {
    throw new Error("DATABASE_URL não definida — veja .env.example.");
  }
  return url;
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(urlDoBanco());
  try {
    const r = await processarExecucoesPendentes(prisma, 100);
    console.log(
      `[relatorios] ${r.processadas} concluída(s), ${r.falhas} com falha. ` +
        `As falhas ficam gravadas com o motivo e notificam quem pediu.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : erro);
  process.exitCode = 1;
});
