import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { SUBFUNCOES } from "./dados/subfuncoes.js";

/**
 * AUDITORIA (somente leitura) — compara `Subfuncao` no banco contra a lista
 * oficial da Portaria 42/1999 consolidada.
 *
 * NÃO grava nada, NÃO apaga nada. Só reporta:
 *   (a) FALTANDO         — no oficial, ausente no banco
 *   (b) FANTASMA         — no banco, ausente no oficial (candidata a remoção;
 *                          pode ser subfunção local legítima — DECIDIR, não apagar)
 *   (c) NOME DIVERGENTE  — código nos dois, nome difere (o oficial vence)
 *
 * Uso: npx tsx prisma/seed/m02-auditar-subfuncoes.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

const noBanco = await prisma.subfuncao.findMany({
  select: { codigo: true, nome: true },
  orderBy: { codigo: "asc" },
});

const oficialPorCodigo = new Map(SUBFUNCOES.map((s) => [s.codigo, s.nome]));
const bancoPorCodigo = new Map(noBanco.map((s) => [s.codigo, s.nome]));

const faltando = SUBFUNCOES.filter((s) => !bancoPorCodigo.has(s.codigo));

const fantasma = noBanco.filter((s) => !oficialPorCodigo.has(s.codigo));

const divergente = noBanco
  .filter((s) => oficialPorCodigo.has(s.codigo))
  .map((s) => ({
    codigo: s.codigo,
    noBanco: s.nome,
    oficial: oficialPorCodigo.get(s.codigo)!,
  }))
  .filter((d) => d.noBanco !== d.oficial);

console.log("AUDITORIA — Subfuncao vs Portaria 42/1999 consolidada\n");
console.log(`  no banco ....... ${noBanco.length}`);
console.log(`  no oficial ..... ${SUBFUNCOES.length}\n`);

console.log(`(a) FALTANDO — ${faltando.length}`);
for (const s of faltando) console.log(`      ${s.codigo}  ${s.nome}`);
if (faltando.length === 0) console.log("      (nenhuma)");

console.log(`\n(b) FANTASMA — ${fantasma.length}  [NÃO serão apagadas sem decisão]`);
for (const s of fantasma) console.log(`      ${s.codigo}  ${s.nome}`);
if (fantasma.length === 0) console.log("      (nenhuma)");

console.log(`\n(c) NOME DIVERGENTE — ${divergente.length}`);
for (const d of divergente) {
  console.log(`      ${d.codigo}  banco="${d.noBanco}"  ->  oficial="${d.oficial}"`);
}
if (divergente.length === 0) console.log("      (nenhuma)");

// A subfunção 151 já apareceu escrita "Defesa Área" (sem o E) em fontes por aí.
const s151 = bancoPorCodigo.get("151");
console.log(
  `\n  Checagem pontual — Subfuncao 151: ` +
    (s151 === undefined
      ? "AUSENTE no banco"
      : s151 === "Defesa Aérea"
        ? `"${s151}" OK`
        : `"${s151}" ERRADO (esperado "Defesa Aérea")`)
);

await prisma.$disconnect();
