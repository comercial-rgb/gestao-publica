import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { TIPOS_CONSIGNACAO } from "./dados/tipos-consignacao.js";

/**
 * SEED dos tipos de consignação. IDEMPOTENTE (upsert por `codigo`).
 *
 * NÃO tem guard de cardinalidade — o rol NÃO é fechado (o ente cria tipos
 * próprios). É o oposto das subfunções e dos elementos, onde a contagem é o
 * invariante.
 *
 * Uso: npx tsx prisma/seed/m07-tipos-consignacao.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const t of TIPOS_CONSIGNACAO) {
  await prisma.tipoConsignacao.upsert({
    where: { codigo: t.codigo },
    update: { descricao: t.descricao },
    create: { codigo: t.codigo, descricao: t.descricao, criadoPor: "SEED" },
  });
}

const todos = await prisma.tipoConsignacao.findMany({
  orderBy: { codigo: "asc" },
});

console.log(`TIPOS DE CONSIGNAÇÃO (${todos.length}):\n`);
for (const t of todos) {
  console.log(`  ${t.ativo ? " " : "x"} ${t.codigo.padEnd(24)} ${t.descricao}`);
}
console.log(
  `\n  ⚠️ Seed MÍNIMO. O rol oficial do SAGRES-PB é pendência de dados ` +
    `(token ASTEC).\n     O rol NÃO é fechado — o ente pode criar tipos próprios.`
);

await prisma.$disconnect();
