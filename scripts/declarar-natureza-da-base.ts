import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { declararNaturezaDaBase, naturezaDaBase } from "../modules/m16-travamento/natureza-da-base.js";

/**
 * DECLARAR A NATUREZA DA BASE (V39-001/002) — ato do operador do servidor, fora da aplicação.
 *
 *   NATUREZA=DEMONSTRACAO MOTIVO="..." DECLARADO_POR=operador@... npx tsx scripts/declarar-natureza-da-base.ts
 *
 * Sem NATUREZA, só mostra a declaração vigente (leitura). Rebaixar uma base OFICIAL para DEMONSTRACAO ou ENSAIO pede
 * CONFIRMAR_REBAIXAMENTO=sim: é o caminho pelo qual dados oficiais passariam a aceitar percurso que grava.
 * Não imprime a URL do banco.
 */

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");
const prisma = criarPrismaClient(url);

try {
  const antes = await naturezaDaBase(prisma);
  console.log(`vigente: ${antes.natureza}${antes.numero === null ? "" : ` (declaração ${String(antes.numero)})`}`);
  const natureza = (process.env["NATUREZA"] ?? "").trim();
  if (natureza !== "") {
    const r = await declararNaturezaDaBase(prisma, {
      natureza,
      motivo: process.env["MOTIVO"] ?? "",
      declaradoPor: process.env["DECLARADO_POR"] ?? "",
      confirmarRebaixamento: process.env["CONFIRMAR_REBAIXAMENTO"] === "sim",
    });
    console.log(`declarada: ${r.natureza} (declaração ${String(r.numero)})`);
  }
} finally {
  await prisma.$disconnect();
}
