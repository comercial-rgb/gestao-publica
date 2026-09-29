import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { travar, type TxComRaw } from "../../packages/locks/index.js";

/**
 * O NUMERADOR DOS DOCUMENTOS QUE O SISTEMA NUMERA (V22).
 *
 * ═══ POR QUE EXISTE ═══
 * O SAGRES (TCE-PB) recebe o número do empenho, da liquidação e da anulação como NUMÉRICO de 7
 * posições (`adapters/tribunais/tce-pb/sagres/layout-2026v11.ts`). O número que o operador digita
 * continua dele — a tela orienta, o domínio não impõe o formato. Mas o que o SISTEMA gera (o empenho
 * da folha, o empenho e as anulações dos encargos) nascia como texto ("FP/2026-08/DEMO-0001"), e o
 * pacote do dia da folha era recusado.
 *
 * ═══ COMO ═══
 * Cada documento gerado tem uma CHAVE determinística — o texto que antes era gravado como número,
 * precedido da ficha. A chave é reservada uma vez, com o próximo número do exercício acima do MAIOR
 * número numérico já usado em empenho OU liquidação (inclusive os digitados) e nas reservas; a mesma
 * chave devolve sempre o mesmo número. É isso que mantém a retomada idempotente.
 *
 * ═══ ⚠️ UM ESPAÇO SÓ, EMPENHO E LIQUIDAÇÃO ═══
 * A liquidação da folha leva o número do próprio empenho. Com sequenciais separados, a anulação de
 * liquidação reservaria um número que um empenho futuro poderia ter — e a liquidação dele, com o
 * número do empenho, esbarraria na reserva alheia. Num espaço só, número reservado é de um documento só.
 *
 * ═══ ⚠️ NÚMERO RESERVADO SÓ É USADO POR QUEM O RESERVOU (`exigirUsoDoNumero`) ═══
 * A retomada procura o documento pelo número reservado. Se o operador pudesse digitar esse número
 * (o empenho da folha falhou depois da reserva, e ele empenhou à mão com "o próximo número"), a folha
 * reconheceria o empenho ALHEIO como seu e deixaria a despesa sem empenho, em silêncio — defeito
 * achado pela auditoria dos invariantes. Por isso toda gravação de empenho e de liquidação do M05
 * confere, sob o MESMO trinco do numerador, que o número não está reservado para outro documento.
 *
 * ⚠️ A RESERVA VEM ANTES DO DOCUMENTO, e isso é de propósito: se o empenho falha, a próxima tentativa
 * reencontra o mesmo número. Reserva sem documento é número pulado (e protegido), não documento a mais.
 */

/** Todas as reservas moram na mesma espécie: um espaço de números por exercício. */
const ESPECIE = "DOCUMENTO";

/** O maior número que cabe no campo do SAGRES (7 posições). */
export const MAIOR_NUMERO = 9_999_999;

const NUMERICO = /^[0-9]{1,7}$/;

export class NumeradorEsgotadoError extends Error {
  constructor(exercicio: number) {
    super(
      `NUMERADOR-ESGOTADO: o exercício ${exercicio} já usou o número ${MAIOR_NUMERO}, o maior que cabe nas ` +
        `7 posições do SAGRES. Nada foi gravado.`
    );
    this.name = "NumeradorEsgotadoError";
  }
}

export class NumeroReservadoError extends Error {
  constructor(numero: string, exercicio: number, identidade: string) {
    super(
      `NUMERO-RESERVADO: o número ${numero} de ${exercicio} está reservado pelo sistema para o documento ` +
        `${identidade}. Use outro número. Nada foi gravado.`
    );
    this.name = "NumeroReservadoError";
  }
}

/** A chave de um documento gerado: a ficha (a unicidade do empenho é por ficha) e o texto que o identifica. */
export function chaveDoDocumento(fichaId: string, identidade: string): string {
  return `${fichaId}|${identidade}`;
}

/** O texto que identifica o documento, a partir da chave. */
export function identidadeDaChave(chave: string): string {
  return chave.slice(chave.indexOf("|") + 1);
}

function trincoDoExercicio(exercicio: number): string {
  return `${exercicio}:${ESPECIE}`;
}

/**
 * Reserva (ou devolve a já reservada) o número do documento de chave `ficha|identidade`, no exercício
 * da ficha. Idempotente por chave.
 */
export async function reservarNumero(
  prisma: PrismaClient,
  p: { readonly fichaId: string; readonly identidade: string; readonly criadoPor: string }
): Promise<{ readonly numero: string; readonly chave: string }> {
  const ficha = await prisma.fichaOrcamentaria.findUnique({ where: { id: p.fichaId }, select: { exercicio: true } });
  if (ficha === null) throw new Error(`Ficha ${p.fichaId} não existe. Nada foi gravado.`);
  const exercicio = ficha.exercicio;
  const chave = chaveDoDocumento(p.fichaId, p.identidade);
  const onde = { exercicio_especie_chave: { exercicio, especie: ESPECIE, chave } };

  const ja = await prisma.numeroReservado.findUnique({ where: onde, select: { numero: true } });
  if (ja !== null) return { numero: ja.numero, chave };

  return prisma.$transaction(async (tx) => {
    await travar(tx, "NumeradorDoExercicio", [trincoDoExercicio(exercicio)]);
    // Relida sob o trinco: outra execução pode ter reservado a mesma chave entre a leitura e aqui.
    const corrida = await tx.numeroReservado.findUnique({ where: onde, select: { numero: true } });
    if (corrida !== null) return { numero: corrida.numero, chave };

    const linhas = (await tx.$queryRawUnsafe(
      `SELECT GREATEST(
         COALESCE((SELECT MAX(e.numero::bigint) FROM "Empenho" e JOIN "FichaOrcamentaria" f ON f.id = e."fichaId"
                   WHERE f.exercicio = $1 AND e.numero ~ '^[0-9]{1,7}$'), 0),
         COALESCE((SELECT MAX(l.numero::bigint) FROM "Liquidacao" l JOIN "Empenho" e ON e.id = l."empenhoId" JOIN "FichaOrcamentaria" f ON f.id = e."fichaId"
                   WHERE f.exercicio = $1 AND l.numero ~ '^[0-9]{1,7}$'), 0),
         COALESCE((SELECT MAX(r.numero::bigint) FROM "NumeroReservado" r WHERE r.exercicio = $1 AND r.especie = $2), 0)
       )::text AS maior`,
      exercicio,
      ESPECIE
    )) as { maior: string }[];
    const proximo = Number(linhas[0]?.maior ?? "0") + 1;
    if (proximo > MAIOR_NUMERO) throw new NumeradorEsgotadoError(exercicio);
    const numero = String(proximo);
    await tx.numeroReservado.create({ data: { exercicio, especie: ESPECIE, chave, numero, criadoPor: p.criadoPor } });
    return { numero, chave };
  });
}

/** O cliente transacional mínimo que a conferência precisa. */
interface TxDoNumerador extends TxComRaw {
  readonly numeroReservado: PrismaClient["numeroReservado"];
}

/**
 * A CONFERÊNCIA NA GRAVAÇÃO — chamada pelo adapter do M05 DENTRO da transação que grava o empenho ou a
 * liquidação, logo antes do `create` (o trinco do numerador é o último posto da fila).
 *
 * Número de texto: nada a conferir (o numerador só reserva números). Número numérico reservado: só
 * passa quem traz a chave da reserva — ou a liquidação que leva o número do PRÓPRIO empenho, que é a
 * convenção da folha. Chave sem reserva correspondente também é recusada: é o sistema dizendo que
 * reservou um número que não reservou.
 */
export async function exigirUsoDoNumero(
  tx: TxDoNumerador,
  p: {
    readonly exercicio: number;
    readonly numero: string;
    readonly chaveDoNumero?: string | null | undefined;
    /** Só na liquidação: o número do empenho que ela liquida. */
    readonly numeroDoEmpenho?: string | undefined;
  }
): Promise<void> {
  const chave = p.chaveDoNumero ?? null;
  if (!NUMERICO.test(p.numero)) {
    if (chave !== null) throw new Error(`O número ${p.numero} veio com chave de reserva, mas não é numérico. Nada foi gravado.`);
    return;
  }
  await travar(tx, "NumeradorDoExercicio", [trincoDoExercicio(p.exercicio)]);
  const reserva = await tx.numeroReservado.findUnique({
    where: { exercicio_especie_numero: { exercicio: p.exercicio, especie: ESPECIE, numero: p.numero } },
    select: { chave: true },
  });
  if (reserva === null) {
    if (chave !== null) throw new Error(`O número ${p.numero} não está reservado para ${identidadeDaChave(chave)}. Nada foi gravado.`);
    return;
  }
  if (reserva.chave === chave) return;
  if (p.numeroDoEmpenho !== undefined && p.numeroDoEmpenho === p.numero) return;
  throw new NumeroReservadoError(p.numero, p.exercicio, identidadeDaChave(reserva.chave));
}
