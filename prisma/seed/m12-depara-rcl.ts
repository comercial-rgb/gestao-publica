import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  DEPARA_RCL_ANEXO3,
  LINHAS_SEM_NATUREZA_ANEXO3,
} from "./dados/depara-rcl-anexo3.js";

/**
 * SEED do de-para da RCL (RREO Anexo 3). IDEMPOTENTE (upsert por `naturezaCodigo`).
 *
 * NÃO tem guard de cardinalidade — o rol OFICIAL do MDF é pendência de dado (as centenas de
 * naturezas da planilha da STN). Este seed é o MÍNIMO que faz o Anexo 3 nomear as sub-linhas que
 * o município usa; o resto cai no fail-open ("Outras da origem") sem sumir.
 *
 * Uso: npx tsx prisma/seed/m12-depara-rcl.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const d of DEPARA_RCL_ANEXO3) {
  await prisma.deParaRclAnexo3.upsert({
    where: { naturezaCodigo: d.naturezaCodigo },
    update: { chaveLinha: d.chaveLinha, tipo: d.tipo },
    create: {
      naturezaCodigo: d.naturezaCodigo,
      chaveLinha: d.chaveLinha,
      tipo: d.tipo,
      criadoPor: "SEED",
    },
  });
}

const todos = await prisma.deParaRclAnexo3.findMany({
  orderBy: [{ tipo: "asc" }, { naturezaCodigo: "asc" }],
});

console.log(`DE-PARA DA RCL (${todos.length}):\n`);
for (const d of todos) {
  console.log(`  ${d.tipo.padEnd(9)} ${d.naturezaCodigo}  →  ${d.chaveLinha}`);
}
console.log(
  `\n  ⚠️ Seed MÍNIMO. O mapa oficial do MDF (15ª ed.) é PENDÊNCIA DE DADO — entra quando o\n` +
    `     plano de receita completo for carregado. Correntes não mapeadas caem em "Outras da\n` +
    `     origem" (fail-open); deduções não mapeadas NÃO deduzem (fail-closed).`
);

// ⚠️ O INTERRUPTOR, NA CARA DE QUEM RODA O SEED. Um mapa que cala sobre a linha que lhe falta é
// indistinguível de um mapa completo — e é assim que "o ente não arrecada IRRF" se confunde com
// "não sabemos qual é o IRRF dele". Ver EMENTARIO-RECEITA-DO-ENTE em dados/depara-rcl-anexo3.ts.
for (const chave of LINHAS_SEM_NATUREZA_ANEXO3) {
  console.log(
    `\n  ⚠️ LINHA SEM NATUREZA: ${chave} — o Anexo 3 sai SEM esta linha.\n` +
      `     Não é "o ente não arrecada": é que o de-para não tem lastro (EMENTARIO-RECEITA-DO-ENTE).`
  );
}

// ⚠️ UPSERT-ONLY: este seed nunca apaga. Se um mapeamento errado já foi gravado num banco, tirá-lo
// da lista NÃO o remove de lá — e o relatório continua saindo errado com o seed "atualizado".
const orfas = todos.filter(
  (d) => !DEPARA_RCL_ANEXO3.some((s) => s.naturezaCodigo === d.naturezaCodigo)
);
if (orfas.length > 0) {
  console.log(
    `\n  ⚠️ ${orfas.length} LINHA(S) NO BANCO QUE NÃO ESTÃO MAIS NESTA LISTA:\n` +
      orfas.map((d) => `       ${d.naturezaCodigo} → ${d.chaveLinha}`).join("\n") +
      `\n     Este seed NÃO as apaga (upsert-only, sem delete). Se são mapeamentos retratados,\n` +
      `     removê-las é ato deliberado, com identidade e trilha — não sai daqui.`
  );
}

await prisma.$disconnect();
