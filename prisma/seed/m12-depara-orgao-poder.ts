import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { DEPARA_ORGAO_PODER, PODERES } from "./dados/depara-orgao-poder.js";

/**
 * SEED do de-para Órgão → Poder (RREO Anexo 7). IDEMPOTENTE (upsert por `orgaoCodigo`).
 *
 * Fail-closed no gerador (não aqui): órgão sem poder mapeado PARA o Anexo 7 nomeando o órgão.
 * Este seed é o MÍNIMO/convencional; o ente ajusta ao seu cadastro real de órgãos.
 *
 * Uso: npx tsx prisma/seed/m12-depara-orgao-poder.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const d of DEPARA_ORGAO_PODER) {
  if (!PODERES.includes(d.poder)) {
    throw new Error(`Poder inválido "${d.poder}" para o órgão ${d.orgaoCodigo}. Rol: ${PODERES.join(", ")}.`);
  }
  await prisma.deParaOrgaoPoder.upsert({
    where: { orgaoCodigo: d.orgaoCodigo },
    update: { poder: d.poder },
    create: { orgaoCodigo: d.orgaoCodigo, poder: d.poder, criadoPor: "SEED" },
  });
}

const todos = await prisma.deParaOrgaoPoder.findMany({ orderBy: { orgaoCodigo: "asc" } });
console.log(`DE-PARA ÓRGÃO → PODER (${todos.length}):\n`);
for (const d of todos) {
  console.log(`  órgão ${d.orgaoCodigo}  →  ${d.poder}`);
}
console.log(
  `\n  ⚠️ Seed CONVENCIONAL. Os códigos de órgão são dado do ente — ajuste ao cadastro real.\n` +
    `     Órgão com RP e sem poder mapeado FAZ o Anexo 7 parar (fail-closed).`
);

await prisma.$disconnect();
