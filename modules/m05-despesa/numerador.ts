import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { travar } from "../../packages/locks/index.js";

/**
 * O NUMERADOR DOS DOCUMENTOS QUE O SISTEMA NUMERA (V22).
 *
 * ═══ POR QUE EXISTE ═══
 * O SAGRES (TCE-PB) recebe o número do empenho, da liquidação e da anulação como NUMÉRICO de 7
 * posições (`adapters/tribunais/tce-pb/sagres/layout-2026v11.ts`). O número que o operador digita
 * continua dele — a tela orienta, o domínio não impõe. Mas o que o SISTEMA gera (o empenho da folha,
 * o empenho e as anulações dos encargos) nascia como texto ("FP/2026-08/DEMO-0001"), e o pacote do
 * dia da folha era recusado.
 *
 * ═══ COMO ═══
 * Cada documento gerado tem uma CHAVE determinística — o texto que antes era gravado como número,
 * precedido da ficha. A chave é reservada uma vez, com o próximo número do exercício acima do MAIOR
 * número numérico já usado na espécie (inclusive os digitados), e a mesma chave devolve sempre o
 * mesmo número. É isso que mantém a retomada idempotente: quem procurava o documento pelo número
 * determinístico continua procurando, só que pelo número reservado.
 *
 * ⚠️ A RESERVA VEM ANTES DO DOCUMENTO, e isso é de propósito: se o empenho falha depois dela, a
 * próxima tentativa reencontra o mesmo número. Uma reserva sem documento é um número pulado, não um
 * documento a mais.
 *
 * ⚠️ O NÚMERO DIGITADO NÃO PASSA POR AQUI. Um operador que digite, ao mesmo tempo, exatamente o
 * próximo número pode colidir com a folha numa ficha diferente — a unicidade do empenho é por ficha.
 * O risco é o de hoje com dois operadores; está nomeado no MODULO do M05.
 */

export type EspecieDeNumero = "EMPENHO" | "LIQUIDACAO";

/** O maior número que cabe no campo do SAGRES (7 posições). */
export const MAIOR_NUMERO = 9_999_999;

export class NumeradorEsgotadoError extends Error {
  constructor(exercicio: number, especie: EspecieDeNumero) {
    super(
      `NUMERADOR-ESGOTADO: o exercício ${exercicio} já usou o número ${MAIOR_NUMERO} na espécie ${especie}, ` +
        `o maior que cabe nas 7 posições do SAGRES. Nada foi gravado.`
    );
    this.name = "NumeradorEsgotadoError";
  }
}

/** A chave de um documento gerado: a ficha (a unicidade do documento é por ficha) e o texto que o identifica. */
export function chaveDoDocumento(fichaId: string, identidade: string): string {
  return `${fichaId}|${identidade}`;
}

/**
 * Reserva (ou devolve a já reservada) o número do documento de chave `chave`, no exercício da ficha.
 * Idempotente por chave. O número é o próximo acima do maior número numérico já usado na espécie —
 * nos documentos gravados E nas reservas.
 */
export async function reservarNumero(
  prisma: PrismaClient,
  p: { readonly fichaId: string; readonly especie: EspecieDeNumero; readonly identidade: string; readonly criadoPor: string }
): Promise<string> {
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { id: p.fichaId }, select: { exercicio: true } });
  if (ficha === null) throw new Error(`Ficha ${p.fichaId} não existe. Nada foi gravado.`);
  const exercicio = ficha.exercicio;
  const chave = chaveDoDocumento(p.fichaId, p.identidade);

  const ja = await prisma.numeroReservado.findUnique({ where: { exercicio_especie_chave: { exercicio, especie: p.especie, chave } }, select: { numero: true } });
  if (ja !== null) return ja.numero;

  return prisma.$transaction(async (tx) => {
    await travar(tx, "NumeradorDoExercicio", [`${exercicio}:${p.especie}`]);
    // Relida sob o trinco: outra execução pode ter reservado a mesma chave entre a leitura e aqui.
    const corrida = await tx.numeroReservado.findUnique({ where: { exercicio_especie_chave: { exercicio, especie: p.especie, chave } }, select: { numero: true } });
    if (corrida !== null) return corrida.numero;

    const tabela = p.especie === "EMPENHO" ? `"Empenho"` : `"Liquidacao"`;
    const ligacao =
      p.especie === "EMPENHO"
        ? `JOIN "FichaOrcamentaria" f ON f.id = d."fichaId"`
        : `JOIN "Empenho" e ON e.id = d."empenhoId" JOIN "FichaOrcamentaria" f ON f.id = e."fichaId"`;
    const linhas = (await tx.$queryRawUnsafe(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(d.numero::bigint) FROM ${tabela} d ${ligacao} WHERE f.exercicio = $1 AND d.numero ~ '^[0-9]{1,7}$'), 0),
         COALESCE((SELECT MAX(r.numero::bigint) FROM "NumeroReservado" r WHERE r.exercicio = $1 AND r.especie = $2), 0)
       )::text AS maior`,
      exercicio,
      p.especie
    )) as { maior: string }[];
    const proximo = Number(linhas[0]?.maior ?? "0") + 1;
    if (proximo > MAIOR_NUMERO) throw new NumeradorEsgotadoError(exercicio, p.especie);
    const numero = String(proximo);
    await tx.numeroReservado.create({ data: { exercicio, especie: p.especie, chave, numero, criadoPor: p.criadoPor } });
    return numero;
  });
}

/** O número já reservado para a chave, sem reservar (reconhecimento de documento gravado). */
export async function numeroJaReservado(
  prisma: PrismaClient,
  p: { readonly fichaId: string; readonly especie: EspecieDeNumero; readonly identidade: string }
): Promise<string | null> {
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { id: p.fichaId }, select: { exercicio: true } });
  if (ficha === null) return null;
  const r = await prisma.numeroReservado.findUnique({
    where: { exercicio_especie_chave: { exercicio: ficha.exercicio, especie: p.especie, chave: chaveDoDocumento(p.fichaId, p.identidade) } },
    select: { numero: true },
  });
  return r?.numero ?? null;
}
