import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";

/**
 * M30 — CONSÓRCIOS PÚBLICOS: a aritmética pura do rateio (Lei 11.107/2005, art. 8º).
 */

export type TipoMovimentoConsorcio =
  | "REPASSE"
  | "DEVOLUCAO"
  | "ESTORNO_REPASSE"
  | "ESTORNO_DEVOLUCAO";

export const SINAL_MOVIMENTO_CONSORCIO: Record<TipoMovimentoConsorcio, 1 | -1> = {
  REPASSE: 1,
  DEVOLUCAO: -1,
  ESTORNO_REPASSE: -1,
  ESTORNO_DEVOLUCAO: 1,
};

export const TIPO_DO_ESTORNO_CONSORCIO: Record<
  TipoMovimentoConsorcio,
  TipoMovimentoConsorcio | null
> = {
  REPASSE: "ESTORNO_REPASSE",
  DEVOLUCAO: "ESTORNO_DEVOLUCAO",
  ESTORNO_REPASSE: null,
  ESTORNO_DEVOLUCAO: null,
};

export interface RateioParaTeto {
  readonly valorDoEnte: Money;
  /** `true` se esta linha é um ADITIVO (aponta para o original). */
  readonly ehAditivo: boolean;
}

/**
 * O TETO DO EXERCÍCIO — a SOMA do contrato original com os aditivos.
 *
 * ⚠️ NÃO É "O ÚLTIMO VALE", e a diferença decide. Um aditivo de SUPRESSÃO (valor negativo, ou
 * uma segunda linha menor) lido como "o último vale" faria o teto virar exatamente o valor da
 * supressão — e o guard do repasse recusaria despesa legítima, ou pior, um aditivo de
 * acréscimo lido assim descartaria o original e o teto CAIRIA.
 *
 * ⚠️ E O ORIGINAL É ÚNICO POR EXERCÍCIO — a trava é do banco
 * (`uq_rateio_original_por_exercicio.sql`), porque dois "originais" de 2026 dobrariam o teto
 * sem que nada acusasse: a soma daria certo e o contrato assinado diria outra coisa.
 */
export function tetoDoExercicio(rateios: readonly RateioParaTeto[]): Money {
  let teto = toMoney("0.00");
  for (const r of rateios) teto = toMoney(teto.plus(r.valorDoEnte));
  return teto;
}

export interface MovimentoParaSaldo {
  readonly tipo: TipoMovimentoConsorcio;
  readonly valor: Money;
}

/** O REPASSADO LÍQUIDO do exercício — Σ pelos sinais. */
export function repassadoLiquido(movimentos: readonly MovimentoParaSaldo[]): Money {
  let total = toMoney("0.00");
  for (const m of movimentos) {
    total =
      SINAL_MOVIMENTO_CONSORCIO[m.tipo] === 1
        ? toMoney(total.plus(m.valor))
        : toMoney(total.minus(m.valor));
  }
  return total;
}

/** Quanto AINDA cabe repassar naquele exercício. */
export function saldoDoRateio(
  rateios: readonly RateioParaTeto[],
  movimentos: readonly MovimentoParaSaldo[]
): Money {
  return toMoney(tetoDoExercicio(rateios).minus(repassadoLiquido(movimentos)));
}

const zDia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "A data é um DIA civil YYYY-MM-DD.");

export const zCadastrarConsorcioInput = z.object({
  identificador: z.string().trim().min(1).max(60),
  denominacao: z.string().trim().min(3),
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ com 14 dígitos, sem máscara."),
  protocoloDeIntencoes: z.string().trim().min(3),
  leiRatificadora: z.string().trim().min(3),
  areaDeAtuacao: z.string().trim().min(3),
  fonteRecursoId: z.string().min(1),
  contaContabilId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type CadastrarConsorcioInput = z.input<typeof zCadastrarConsorcioInput>;

export const zContratoDeRateioInput = z.object({
  consorcioId: z.string().min(1),
  exercicio: z.number().int().min(2000).max(2100),
  valorDoEnte: zMoney,
  diaAssinatura: zDia,
  /** Presente ⇒ é ADITIVO do rateio indicado. */
  aditivoDeId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});
export type ContratoDeRateioInput = z.input<typeof zContratoDeRateioInput>;

export const zMovimentoConsorcioInput = z.object({
  consorcioId: z.string().min(1),
  valor: zMoney,
  /** O exercício DA COTA — explícito, e não derivado da data. Ver o schema. */
  exercicio: z.number().int().min(2000).max(2100),
  diaMovimento: zDia,
  competencia: z.string().regex(/^\d{4}-\d{2}$/),
  empenhoId: z.string().min(1).optional(),
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type MovimentoConsorcioInput = z.input<typeof zMovimentoConsorcioInput>;

export const zEstornarMovimentoConsorcioInput = z.object({
  movimentoId: z.string().min(1),
  diaMovimento: zDia,
  motivo: z.string().trim().min(10),
  criadoPor: z.string().min(1),
});
export type EstornarMovimentoConsorcioInput = z.input<
  typeof zEstornarMovimentoConsorcioInput
>;
