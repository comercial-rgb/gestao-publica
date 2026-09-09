import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { backfillDotacaoInicial } from "../../modules/m02-planejamento/backfill-dotacao-inicial.js";

/**
 * Script do backfill. A lógica vive em
 * `modules/m02-planejamento/backfill-dotacao-inicial.ts` — aqui é só a borda,
 * para que o backfill seja TESTÁVEL (e ele é: ver m02-dotacao.test.ts).
 *
 * Uso: npx tsx prisma/seed/backfill-dotacao-inicial.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

console.log("BACKFILL — DOTACAO_INICIAL\n");

const r = await backfillDotacaoInicial(prisma, (f) => {
  console.log(`    ficha ${f.exercicio}/${f.numero} -> DOTACAO_INICIAL ${f.valor}`);
});

console.log(`  fichas ...................... ${r.fichas}`);
console.log(`  com DOTACAO_INICIAL (antes) . ${r.antes}`);
console.log(`  com DOTACAO_INICIAL (depois)  ${r.depois}`);
console.log(`  criadas nesta execução ....... ${r.criadas}`);
console.log(`  ✓ TODA ficha tem exatamente uma DOTACAO_INICIAL.`);

await prisma.$disconnect();
