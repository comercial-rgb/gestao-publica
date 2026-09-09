import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  CLASSES_EDUCACAO,
  FONTE_CLASSE_EDUCACAO,
  FUNDEB_RECEITA,
  PAPEIS_FUNDEB,
} from "./dados/mde-deparas.js";

/**
 * SEED dos de-paras do RREO Anexo 8 (MDE). IDEMPOTENTE. Seed MÍNIMO — mapa completo = pendência.
 * Uso: npx tsx prisma/seed/m12-mde-deparas.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const d of FUNDEB_RECEITA) {
  if (!PAPEIS_FUNDEB.includes(d.papel)) {
    throw new Error(`Papel FUNDEB inválido "${d.papel}" (${d.naturezaCodigo}). Rol: ${PAPEIS_FUNDEB.join(", ")}.`);
  }
  await prisma.deParaFundebReceita.upsert({
    where: { naturezaCodigo: d.naturezaCodigo },
    update: { papel: d.papel },
    create: { naturezaCodigo: d.naturezaCodigo, papel: d.papel, criadoPor: "SEED" },
  });
}
for (const f of FONTE_CLASSE_EDUCACAO) {
  if (!CLASSES_EDUCACAO.includes(f.classe)) {
    throw new Error(`Classe de educação inválida "${f.classe}" (${f.fonteCodigo}). Rol: ${CLASSES_EDUCACAO.join(", ")}.`);
  }
  await prisma.deParaFonteClasseEducacao.upsert({
    where: { fonteCodigo: f.fonteCodigo },
    update: { classe: f.classe },
    create: { fonteCodigo: f.fonteCodigo, classe: f.classe, criadoPor: "SEED" },
  });
}

const receitas = await prisma.deParaFundebReceita.findMany({ orderBy: { naturezaCodigo: "asc" } });
const fontes = await prisma.deParaFonteClasseEducacao.findMany({ orderBy: { fonteCodigo: "asc" } });
console.log(`FUNDEB RECEITA (${receitas.length}):`);
for (const d of receitas) console.log(`  ${d.naturezaCodigo}  →  ${d.papel}`);
console.log(`\nFONTE → CLASSE EDUCAÇÃO (${fontes.length}):`);
for (const f of fontes) console.log(`  ${f.fonteCodigo}  →  ${f.classe}`);
console.log(`\n  ⚠️ Seed MÍNIMO. Mapa completo (Portaria 163 / STN 710) = pendência de dado.`);

await prisma.$disconnect();
