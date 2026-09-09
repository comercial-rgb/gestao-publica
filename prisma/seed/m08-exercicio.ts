import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * SEED do exercício corrente.
 *
 * IDEMPOTENTE: `ano @unique` + upsert. Rodar N vezes não duplica.
 *
 * Sem um Exercicio aberto, TODA operação orçamentária é rejeitada pelo guard
 * (fail-closed). Um banco novo precisa deste seed antes de qualquer coisa.
 *
 * Uso: npx tsx prisma/seed/m08-exercicio.ts [ano]
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const argumento = process.argv[2];
const ano =
  argumento !== undefined ? Number(argumento) : new Date().getUTCFullYear();

if (!Number.isInteger(ano) || ano < 1900 || ano > 2999) {
  throw new Error(`Ano inválido: "${argumento}".`);
}

const prisma = criarPrismaClient(DATABASE_URL);

await prisma.exercicio.upsert({
  where: { ano },
  update: {},
  create: { ano, criadoPor: "SEED" },
});

const exercicios = await prisma.exercicio.findMany({
  select: { ano: true, encerramento: { select: { criadoEm: true } } },
  orderBy: { ano: "asc" },
});

console.log("EXERCÍCIOS no banco:\n");
for (const e of exercicios) {
  const estado =
    e.encerramento === null
      ? "ABERTO"
      : `ENCERRADO em ${e.encerramento.criadoEm.toISOString().slice(0, 10)}`;
  console.log(`  ${e.ano}  ${estado}`);
}

await prisma.$disconnect();
