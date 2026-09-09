import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";

/**
 * DOMAIN do M03 — SEM I/O.
 *
 * O coração daqui é o BALANCEAMENTO DO CRÉDITO POR ANULAÇÃO: é literalmente
 * partida dobrada aplicada à dotação. Se um decreto tira 500 de uma ficha para
 * pôr 500 em outra, o total do orçamento **não muda** — e é isso que a função
 * `validarBalanceamento` garante, POR FONTE (TR 5.111).
 *
 * Por fonte, e não só no total, porque anular fonte 500 para suplementar fonte
 * 540 seria trocar dinheiro carimbado por dinheiro livre — o total fecharia e a
 * vinculação estaria furada.
 */

export type TipoItemCredito = "SUPLEMENTACAO" | "ANULACAO";

export type OrigemRecurso =
  | "ANULACAO"
  | "SUPERAVIT_FINANCEIRO"
  | "EXCESSO_ARRECADACAO"
  | "OPERACAO_CREDITO";

/** Origens que trazem dinheiro NOVO (o total autorizado sobe legitimamente). */
export const ORIGENS_RECURSO_NOVO: readonly OrigemRecurso[] = [
  "SUPERAVIT_FINANCEIRO",
  "EXCESSO_ARRECADACAO",
  "OPERACAO_CREDITO",
] as const;

export function ehRecursoNovo(origem: OrigemRecurso): boolean {
  return ORIGENS_RECURSO_NOVO.includes(origem);
}

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});

export const zTipoCredito = z.enum([
  "SUPLEMENTAR",
  "ESPECIAL",
  "EXTRAORDINARIO",
]);
export const zOrigemRecurso = z.enum([
  "ANULACAO",
  "SUPERAVIT_FINANCEIRO",
  "EXCESSO_ARRECADACAO",
  "OPERACAO_CREDITO",
]);
export const zTipoItemCredito = z.enum(["SUPLEMENTACAO", "ANULACAO"]);

export const zItemCreditoInput = z.object({
  fichaId: z.string().min(1),
  tipo: zTipoItemCredito,
  valor: zValorPositivo,
  /** Fonte desta perna. Tem de bater com a fonte da ficha (checado no adapter). */
  fonteId: z.string().min(1),
});

export const zCriarLeiInput = z.object({
  numero: z.string().min(1),
  ano: z.number().int().min(1900).max(2999),
  tipoCredito: zTipoCredito,
  valorAutorizado: zValorPositivo,
  percentualLimite: z.string().optional(),
  dataPublicacao: z.coerce.date(),
  criadoPor: z.string().min(1),
});

export const zCriarDecretoInput = z.object({
  leiId: z.string().min(1),
  numero: z.string().min(1),
  ano: z.number().int().min(1900).max(2999),
  data: z.coerce.date(),
  origemRecurso: zOrigemRecurso,
  criadoPor: z.string().min(1),
});

export const zExecutarCreditoInput = z.object({
  decretoId: z.string().min(1),
  itens: z.array(zItemCreditoInput).min(1, "Decreto sem itens"),
  criadoPor: z.string().min(1),
});

export const zEncerrarDecretoInput = z.object({
  decretoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zAnularCreditoInput = z.object({
  decretoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: z.string().min(1),
  criadoPor: z.string().min(1),
});

export type ItemCreditoInput = z.input<typeof zItemCreditoInput>;
export type ItemCreditoDados = z.output<typeof zItemCreditoInput>;
export type CriarLeiInput = z.input<typeof zCriarLeiInput>;
export type CriarDecretoInput = z.input<typeof zCriarDecretoInput>;
export type ExecutarCreditoInput = z.input<typeof zExecutarCreditoInput>;
export type EncerrarDecretoInput = z.input<typeof zEncerrarDecretoInput>;
export type AnularCreditoInput = z.input<typeof zAnularCreditoInput>;

/** Soma por tipo, e por fonte dentro de cada tipo. */
export interface TotaisDoCredito {
  readonly suplementado: Money;
  readonly anulado: Money;
  readonly porFonte: ReadonlyMap<
    string,
    { readonly suplementado: Money; readonly anulado: Money }
  >;
}

export function somarItens(itens: readonly ItemCreditoDados[]): TotaisDoCredito {
  const zero = toMoney("0.00");
  let suplementado = zero;
  let anulado = zero;
  const porFonte = new Map<string, { suplementado: Money; anulado: Money }>();

  for (const item of itens) {
    const atual = porFonte.get(item.fonteId) ?? {
      suplementado: zero,
      anulado: zero,
    };
    if (item.tipo === "SUPLEMENTACAO") {
      suplementado = toMoney(suplementado.plus(item.valor));
      atual.suplementado = toMoney(atual.suplementado.plus(item.valor));
    } else {
      anulado = toMoney(anulado.plus(item.valor));
      atual.anulado = toMoney(atual.anulado.plus(item.valor));
    }
    porFonte.set(item.fonteId, atual);
  }

  return { suplementado, anulado, porFonte };
}

/**
 * INVARIANTE 2 — o "partidas dobradas da dotação".
 *
 * Decreto por ANULAÇÃO:
 *   - precisa de ao menos 1 suplementação E 1 anulação;
 *   - Σ(anulações) == Σ(suplementações) NO TOTAL; e
 *   - Σ(anulações) == Σ(suplementações) EM CADA FONTE (TR 5.111).
 *
 * Decreto por RECURSO NOVO:
 *   - não pode ter perna de anulação (o dinheiro vem de fora, não de outra ficha).
 *
 * FAIL-CLOSED: não fecha, lança — nada é gravado.
 */
export function validarBalanceamento(
  origem: OrigemRecurso,
  itens: readonly ItemCreditoDados[]
): TotaisDoCredito {
  const totais = somarItens(itens);

  if (ehRecursoNovo(origem)) {
    const anulacoes = itens.filter((i) => i.tipo === "ANULACAO");
    if (anulacoes.length > 0) {
      throw new Error(
        `Decreto por ${origem} NÃO pode ter perna de anulação: o recurso é ` +
          `novo, não vem de outra ficha. Recebidas ${anulacoes.length} anulação(ões).`
      );
    }
    if (totais.suplementado.lessThanOrEqualTo(0)) {
      throw new Error(`Decreto por ${origem} sem suplementação.`);
    }
    return totais;
  }

  // --- origem ANULACAO ---
  const suplementacoes = itens.filter((i) => i.tipo === "SUPLEMENTACAO");
  const anulacoes = itens.filter((i) => i.tipo === "ANULACAO");

  if (suplementacoes.length === 0 || anulacoes.length === 0) {
    throw new Error(
      `Crédito por anulação exige ao menos 1 suplementação e 1 anulação ` +
        `(recebidas ${suplementacoes.length} suplementação(ões) e ` +
        `${anulacoes.length} anulação(ões)).`
    );
  }

  if (!totais.suplementado.equals(totais.anulado)) {
    throw new Error(
      `Crédito por anulação NÃO FECHA: suplementado ` +
        `${totais.suplementado.toFixed(2)}, anulado ${totais.anulado.toFixed(2)} ` +
        `(diferença ${totais.suplementado.minus(totais.anulado).toFixed(2)}). ` +
        `O total do orçamento não pode mudar num crédito por anulação.`
    );
  }

  // TR 5.111: tem de fechar EM CADA FONTE. Anular fonte carimbada para
  // suplementar fonte livre fecharia no total e furaria a vinculação.
  for (const [fonteId, t] of totais.porFonte) {
    if (!t.suplementado.equals(t.anulado)) {
      throw new Error(
        `TR 5.111 — crédito por anulação não fecha na fonte ${fonteId}: ` +
          `suplementado ${t.suplementado.toFixed(2)}, anulado ` +
          `${t.anulado.toFixed(2)}. Cada fonte tem de fechar sozinha; anular uma ` +
          `fonte para suplementar outra fura a vinculação do recurso.`
      );
    }
  }

  return totais;
}

/** Valida a forma e o balanceamento. Sem I/O. */
export function comporCredito(
  origem: OrigemRecurso,
  input: ExecutarCreditoInput
): {
  readonly itens: readonly ItemCreditoDados[];
  readonly totais: TotaisDoCredito;
} {
  const dados = zExecutarCreditoInput.parse(input);
  const totais = validarBalanceamento(origem, dados.itens);
  return { itens: dados.itens, totais };
}
