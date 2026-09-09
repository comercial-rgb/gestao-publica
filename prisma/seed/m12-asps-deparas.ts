import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  BASE_IMPOSTO_ASPS,
  CLASSES_ASPS,
  FONTE_CLASSE_ASPS,
} from "./dados/asps-deparas.js";

/**
 * SEED dos de-paras do RREO Anexo 12 (ASPS). IDEMPOTENTE (upsert por chave natural).
 *
 * Seed MÍNIMO — o mapa completo (Portaria 163 / STN 710) é pendência de dado do ente.
 * Uso: npx tsx prisma/seed/m12-asps-deparas.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const d of BASE_IMPOSTO_ASPS) {
  await prisma.deParaBaseImpostoAsps.upsert({
    where: { naturezaCodigo: d.naturezaCodigo },
    update: { chave: d.chave },
    create: { naturezaCodigo: d.naturezaCodigo, chave: d.chave, criadoPor: "SEED" },
  });
}

for (const f of FONTE_CLASSE_ASPS) {
  if (!CLASSES_ASPS.includes(f.classe)) {
    throw new Error(`Classe ASPS inválida "${f.classe}" para a fonte ${f.fonteCodigo}. Rol: ${CLASSES_ASPS.join(", ")}.`);
  }
  await prisma.deParaFonteClasseAsps.upsert({
    where: { fonteCodigo: f.fonteCodigo },
    update: { classe: f.classe },
    create: { fonteCodigo: f.fonteCodigo, classe: f.classe, criadoPor: "SEED" },
  });
}

const impostos = await prisma.deParaBaseImpostoAsps.findMany({ orderBy: { naturezaCodigo: "asc" } });
const fontes = await prisma.deParaFonteClasseAsps.findMany({ orderBy: { fonteCodigo: "asc" } });
console.log(`BASE DE IMPOSTOS (${impostos.length}):`);
for (const d of impostos) console.log(`  ${d.naturezaCodigo}  →  ${d.chave}`);
console.log(`\nFONTE → CLASSE ASPS (${fontes.length}):`);
for (const f of fontes) console.log(`  ${f.fonteCodigo}  →  ${f.classe}`);
console.log(`\n  ⚠️ Seed MÍNIMO. Mapa completo (Portaria 163 / STN 710) = pendência de dado.`);

await prisma.$disconnect();
