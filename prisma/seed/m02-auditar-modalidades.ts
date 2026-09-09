import { MODALIDADES_APLICACAO } from "./dados/natureza-componentes.js";

/**
 * AUDITORIA (somente leitura) — Modalidade de Aplicação do seed vs. a lista
 * oficial da Portaria 163/2001 fornecida na sessão 2d.
 *
 * As modalidades NÃO têm tabela no schema (a NaturezaDespesa guarda
 * `codModalidade` como campo), então a auditoria é contra o const array de
 * prisma/seed/dados/natureza-componentes.ts — que é a fonte da verdade do seed.
 */

/** Anexo II da 163/2001 base — 19 modalidades. */
const ANEXO_II: readonly string[] = [
  "20", "22", "30", "31", "32", "40", "41", "42", "50", "60",
  "70", "71", "72", "80", "90", "91", "93", "94", "99",
];

/**
 * Modalidades de portarias POSTERIORES à 163/2001 base. Não constam do Anexo II
 * fetchado, mas são reais e estão em uso — MANTIDAS por decisão consciente na
 * sessão 2d. Confirmar no MCASP vigente.
 */
const POSTERIORES_MANTIDAS: readonly string[] = ["46", "67", "73"];

const ESPERADO = [...ANEXO_II, ...POSTERIORES_MANTIDAS];

const noSeed = MODALIDADES_APLICACAO.map((m) => m.codigo);
const descricaoPorCodigo = new Map(
  MODALIDADES_APLICACAO.map((m) => [m.codigo, m.descricao])
);

const fantasma = noSeed.filter((c) => !ESPERADO.includes(c));
const faltando = ESPERADO.filter((c) => !noSeed.includes(c));

console.log("AUDITORIA — Modalidade de Aplicação (Portaria 163/2001)\n");
console.log(`  no seed .................... ${noSeed.length}`);
console.log(`  Anexo II (163 base) ........ ${ANEXO_II.length}`);
console.log(`  posteriores mantidas ....... ${POSTERIORES_MANTIDAS.length}`);
console.log(`  esperado (soma) ............ ${ESPERADO.length}\n`);

console.log("  do Anexo II:");
for (const c of ANEXO_II) {
  const ok = noSeed.includes(c) ? "  " : "!!";
  console.log(`   ${ok} ${c}  ${(descricaoPorCodigo.get(c) ?? "AUSENTE").slice(0, 62)}`);
}
console.log("\n  posteriores à 163 base (mantidas conscientemente):");
for (const c of POSTERIORES_MANTIDAS) {
  console.log(`      ${c}  ${(descricaoPorCodigo.get(c) ?? "AUSENTE").slice(0, 62)}`);
}

console.log(`\n(a) FANTASMA — no seed, fora do esperado: ${fantasma.length}`);
for (const c of fantasma) {
  console.log(`      ${c}  ${(descricaoPorCodigo.get(c) ?? "").slice(0, 62)}`);
}
if (fantasma.length === 0) console.log("      (nenhuma)");

console.log(`\n(b) FALTANDO — esperado, ausente no seed: ${faltando.length}`);
for (const c of faltando) console.log(`      ${c}`);
if (faltando.length === 0) console.log("      (nenhuma)");

console.log("\n  REVOGADAS (não podem estar): 35, 45 —> " +
  (noSeed.includes("35") || noSeed.includes("45") ? "PRESENTES! ERRO" : "ausentes, OK"));
