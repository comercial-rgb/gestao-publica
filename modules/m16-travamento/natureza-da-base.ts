import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * A NATUREZA DA BASE (V39-001/002) — a base é OFICIAL, de DEMONSTRAÇÃO ou de ENSAIO, pela declaração no banco.
 *
 * ⚠️ O QUE ISTO SUBSTITUI. Os percursos que gravam decidiam pela marca "(base fictícia)" no nome de exibição: texto
 * de apresentação, que se reconfigura. Agora a decisão vem da declaração vigente (a de maior número), lida no servidor.
 *
 * ⚠️ FAIL-CLOSED. Sem declaração, ou com valor fora do conjunto, a base é NAO_DECLARADA, e NAO_DECLARADA não admite
 * ensaio. Uma base oficial nunca passa a aceitar percurso por falta de registro.
 */

export const NATUREZAS_DA_BASE = ["OFICIAL", "DEMONSTRACAO", "ENSAIO"] as const;
export type NaturezaDeclarada = (typeof NATUREZAS_DA_BASE)[number];
export type NaturezaDaBase = NaturezaDeclarada | "NAO_DECLARADA";

/** Puro: a base admite percurso que grava e parâmetro sintético? Só demonstração e ensaio. */
export function baseAdmiteEnsaio(natureza: NaturezaDaBase): boolean {
  return natureza === "DEMONSTRACAO" || natureza === "ENSAIO";
}

/** Puro: o texto lido do banco vira a natureza, ou NAO_DECLARADA quando não pertence ao conjunto. */
export function naturezaLida(bruto: string | null | undefined): NaturezaDaBase {
  return (NATUREZAS_DA_BASE as readonly string[]).includes(bruto ?? "") ? (bruto as NaturezaDeclarada) : "NAO_DECLARADA";
}

/** A declaração vigente: a de maior número. */
export async function naturezaDaBase(prisma: Pick<PrismaClient, "declaracaoDaNaturezaDaBase">): Promise<{ readonly natureza: NaturezaDaBase; readonly numero: number | null; readonly declaradoEm: Date | null }> {
  const d = await prisma.declaracaoDaNaturezaDaBase.findFirst({ orderBy: { numero: "desc" }, select: { natureza: true, numero: true, declaradoEm: true } });
  if (d === null) return { natureza: "NAO_DECLARADA", numero: null, declaradoEm: null };
  return { natureza: naturezaLida(d.natureza), numero: d.numero, declaradoEm: d.declaradoEm };
}

/**
 * DECLARAR a natureza — ato do operador do servidor (script) ou da semente da base fictícia; a aplicação não chama.
 * Rebaixar uma base OFICIAL exige `confirmarRebaixamento`: é o caminho pelo qual dados oficiais passariam a aceitar
 * percurso que grava.
 */
export async function declararNaturezaDaBase(
  prisma: PrismaClient,
  entrada: { readonly natureza: string; readonly motivo: string; readonly declaradoPor: string; readonly confirmarRebaixamento?: boolean },
): Promise<{ readonly numero: number; readonly natureza: NaturezaDeclarada }> {
  const natureza = naturezaLida(entrada.natureza);
  if (natureza === "NAO_DECLARADA") throw new Error(`Natureza "${entrada.natureza}" não existe. Use OFICIAL, DEMONSTRACAO ou ENSAIO.`);
  if (entrada.motivo.trim() === "") throw new Error("A declaração da natureza da base exige o motivo.");
  if (entrada.declaradoPor.trim() === "") throw new Error("A declaração da natureza da base exige quem declara.");
  return prisma.$transaction(async (tx) => {
    const atual = await tx.declaracaoDaNaturezaDaBase.findFirst({ orderBy: { numero: "desc" }, select: { natureza: true, numero: true } });
    if (atual !== null && naturezaLida(atual.natureza) === "OFICIAL" && natureza !== "OFICIAL" && entrada.confirmarRebaixamento !== true) {
      throw new Error("A base está declarada OFICIAL. Declará-la de demonstração ou de ensaio pede confirmação explícita do rebaixamento.");
    }
    const numero = (atual?.numero ?? 0) + 1;
    await tx.declaracaoDaNaturezaDaBase.create({ data: { numero, natureza, motivo: entrada.motivo.trim(), declaradoPor: entrada.declaradoPor.trim() } });
    return { numero, natureza };
  });
}
