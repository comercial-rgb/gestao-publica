import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
  type Subsistema,
  type TipoPartida,
} from "../../packages/ledger/index.js";
// M05 -> M06 (nunca o inverso).
import { zJustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";

/**
 * DOMAIN do M05 — SEM I/O.
 *
 * Aqui mora a aritmética do saldo. Ela é PURA de propósito: dado o conjunto de
 * movimentos, os saldos são uma FUNÇÃO deles. A coluna no banco é só cache, e a
 * reconciliação existe justamente para provar que o cache = f(movimentos).
 */

export type TipoMovimentoDotacao =
  | "DOTACAO_INICIAL"
  | "CREDITO_ADICIONAL"
  | "ANULACAO_CREDITO"
  | "RESERVA"
  | "RESERVA_LIBERADA"
  | "EMPENHO"
  | "EMPENHO_ANULADO";

export const TIPOS_MOVIMENTO: readonly TipoMovimentoDotacao[] = [
  "DOTACAO_INICIAL",
  "CREDITO_ADICIONAL",
  "ANULACAO_CREDITO",
  "RESERVA",
  "RESERVA_LIBERADA",
  "EMPENHO",
  "EMPENHO_ANULADO",
] as const;

/**
 * Em qual saldo cada tipo entra, e com que sinal. O `valor` do movimento é
 * SEMPRE positivo — é este mapa que dá o sinal. Assim não existe movimento com
 * valor negativo escondendo uma anulação.
 */
const SINAIS: Record<
  TipoMovimentoDotacao,
  { readonly saldo: "autorizado" | "reservado" | "empenhado"; readonly sinal: 1 | -1 }
> = {
  DOTACAO_INICIAL: { saldo: "autorizado", sinal: 1 },
  CREDITO_ADICIONAL: { saldo: "autorizado", sinal: 1 },
  ANULACAO_CREDITO: { saldo: "autorizado", sinal: -1 },
  RESERVA: { saldo: "reservado", sinal: 1 },
  RESERVA_LIBERADA: { saldo: "reservado", sinal: -1 },
  EMPENHO: { saldo: "empenhado", sinal: 1 },
  EMPENHO_ANULADO: { saldo: "empenhado", sinal: -1 },
};

/** Total por tipo, como sai de um GROUP BY no banco. */
export type TotaisPorTipo = Readonly<Partial<Record<TipoMovimentoDotacao, Money>>>;

export interface SaldosFicha {
  readonly autorizado: Money;
  readonly reservado: Money;
  readonly empenhado: Money;
  /** autorizado − reservado − empenhado */
  readonly disponivel: Money;
}

/**
 * Os saldos são uma FUNÇÃO dos movimentos. Pura, sem banco, testável sozinha —
 * e é exatamente esta função que a reconciliação usa para conferir o cache.
 */
export function calcularSaldos(totais: TotaisPorTipo): SaldosFicha {
  const zero = toMoney("0.00");
  const acc = { autorizado: zero, reservado: zero, empenhado: zero };

  for (const tipo of TIPOS_MOVIMENTO) {
    const total = totais[tipo];
    if (total === undefined) continue;
    const { saldo, sinal } = SINAIS[tipo];
    acc[saldo] =
      sinal === 1 ? toMoney(acc[saldo].plus(total)) : toMoney(acc[saldo].minus(total));
  }

  return {
    autorizado: acc.autorizado,
    reservado: acc.reservado,
    empenhado: acc.empenhado,
    disponivel: toMoney(
      acc.autorizado.minus(acc.reservado).minus(acc.empenhado)
    ),
  };
}

// ----------------------------------------------------------------------------
// STATUS DO EMPENHO — DERIVADO, não coluna.
//
// Um `status` gravado no empenho não sobrevive ao append-only: para andar de
// EMPENHADO a LIQUIDADO seria preciso dar UPDATE nele. Então não gravamos — o
// estado é uma função dos SUMs.
// ----------------------------------------------------------------------------

export type StatusEmpenho =
  | "EMPENHADO"
  | "PARCIAL_LIQUIDADO"
  | "LIQUIDADO"
  | "PARCIAL_PAGO"
  | "PAGO"
  | "ANULADO";

export interface TotaisEmpenho {
  /** Valor do empenho. */
  readonly empenhado: Money;
  readonly liquidado: Money;
  readonly pago: Money;
  readonly anulado: boolean;
}

export function statusDoEmpenho(t: TotaisEmpenho): StatusEmpenho {
  if (t.anulado) return "ANULADO";

  const totalmenteLiquidado = t.liquidado.greaterThanOrEqualTo(t.empenhado);
  const totalmentePago =
    t.pago.greaterThanOrEqualTo(t.empenhado) && t.empenhado.greaterThan(0);

  if (totalmentePago) return "PAGO";
  if (t.pago.greaterThan(0)) return "PARCIAL_PAGO";
  if (totalmenteLiquidado) return "LIQUIDADO";
  if (t.liquidado.greaterThan(0)) return "PARCIAL_LIQUIDADO";
  return "EMPENHADO";
}

// ----------------------------------------------------------------------------
// Roteiro contábil do empenho — sem conta mágica (mesmo padrão do M04).
// ----------------------------------------------------------------------------

export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}
export type RoteiroContabil = readonly PernaRoteiro[];

/**
 * ORÇAMENTÁRIO: D crédito disponível / C crédito empenhado.
 * O empenho não gera fato patrimonial (não há despesa incorrida ainda) — quem
 * gera é a LIQUIDAÇÃO. Por isso o roteiro é só orçamentário.
 */
export interface ContasEmpenho {
  readonly creditoDisponivel: string;
  readonly creditoEmpenhado: string;
}

export function roteiroEmpenho(c: ContasEmpenho): RoteiroContabil {
  return [
    { conta: c.creditoDisponivel, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoEmpenhado, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/**
 * LIQUIDAÇÃO — aqui, sim, nasce o fato patrimonial: a despesa foi incorrida e a
 * obrigação com o fornecedor existe.
 *
 * PATRIMONIAL:  D variação patrimonial diminutiva / C obrigação a pagar
 * ORÇAMENTÁRIO: D crédito empenhado                / C crédito liquidado
 */
export interface ContasLiquidacao {
  readonly variacaoDiminutiva: string;
  readonly obrigacaoAPagar: string;
  readonly creditoEmpenhado: string;
  readonly creditoLiquidado: string;
}

export function roteiroLiquidacao(c: ContasLiquidacao): RoteiroContabil {
  return [
    { conta: c.variacaoDiminutiva, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: c.creditoEmpenhado, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoLiquidado, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/**
 * PAGAMENTO — a obrigação é extinta e o dinheiro sai do caixa.
 *
 * PATRIMONIAL:  D obrigação a pagar  / C disponibilidade
 * ORÇAMENTÁRIO: D crédito liquidado  / C crédito pago
 */
export interface ContasPagamento {
  readonly obrigacaoAPagar: string;
  readonly disponibilidade: string;
  readonly creditoLiquidado: string;
  readonly creditoPago: string;
}

export function roteiroPagamento(c: ContasPagamento): RoteiroContabil {
  return [
    { conta: c.obrigacaoAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: c.creditoLiquidado, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: c.creditoPago, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
  ];
}

/** Aplica o valor a cada perna e submete ao motor puro (fail-closed). */
export function comporPartidas(
  valor: Money,
  roteiro: RoteiroContabil
): readonly Partida[] {
  return validarLancamento(
    roteiro.map((p) => ({
      conta: p.conta,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor,
    }))
  );
}

// ----------------------------------------------------------------------------
// Entrada
// ----------------------------------------------------------------------------

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});

export const zTipoEmpenho = z.enum(["ORDINARIO", "GLOBAL", "ESTIMATIVO"]);
export type TipoEmpenho = z.infer<typeof zTipoEmpenho>;

/**
 * M06 — Lei 14.133/2021, art. 141: a ordem cronológica é por FONTE, subdividida
 * nestas 4 categorias de contrato. OBRIGATÓRIO no empenho, sem default: a
 * liquidação herda a categoria dele, e é ela que define em qual fila o pagamento
 * entra. Um default silencioso misturaria a fila de obras com a de bens.
 */
export const zCategoriaOrdemCronologica = z.enum([
  "FORNECIMENTO_BENS",
  "LOCACAO",
  "PRESTACAO_SERVICOS",
  "REALIZACAO_OBRAS",
]);
export type CategoriaOrdemCronologica = z.infer<
  typeof zCategoriaOrdemCronologica
>;

export const zReservarDotacaoInput = z.object({
  fichaId: z.string().min(1),
  valor: zValorPositivo,
  historico: z.string().min(1),
  /**
   * M11 (TR 4.41/4.42): a reserva pode nascer VINCULADA a um processo
   * licitatório — e aí o empenho que a consome TEM de informar um contrato desse
   * mesmo processo.
   *
   * Substitui a antiga `licitacaoId`: uma STRING sem FK, que o serviço ESCREVIA e
   * ninguém NUNCA leu. Uma coluna que só se escreve não é um vínculo — é um
   * comentário caro. Foi DROPADA (ver a migration do DROP).
   */
  processoId: z.string().min(1).optional(),
  criadoPor: z.string().min(1),
});

export const zEmpenharInput = z
  .object({
    fichaId: z.string().min(1),
    /** Se veio de uma reserva, o empenho a consome (gera RESERVA_LIBERADA). */
    reservaId: z.string().min(1).optional(),
    /** Opcional: o Subelemento (M02) ainda não tem seed real. */
    subelementoId: z.string().min(1).optional(),
    /**
     * M11 — o contrato que esta despesa executa (TR 5.6/5.101/5.102/5.112).
     * Ausente = despesa sem contrato (diária, folha, sentença): caminho de sempre.
     */
    contratoId: z.string().min(1).optional(),
    /**
     * M11/M10 (TR 4.49/5.15) — a classe de bens que este empenho vai adquirir.
     * OBRIGATÓRIA quando o empenho é de CAPITAL (grupos 4/5) E tem contrato; o
     * guard vive no adapter (precisa ler a natureza da ficha).
     */
    classeDeBensId: z.string().min(1).optional(),
    /**
     * M11 (TR 4.50) — a OBRA que este empenho executa.
     * OBRIGATÓRIA quando o elemento é de obra (51); o guard vive no adapter (precisa ler
     * a natureza da ficha). PERMITIDA fora dele — o vínculo voluntário não é erro.
     */
    obraId: z.string().min(1).optional(),
    /**
     * M10 (TR 4.48) — a DÍVIDA que este empenho amortiza. OBRIGATÓRIA no grupo 6 e
     * PROIBIDA fora dele; o guard vive no adapter (precisa ler a natureza da ficha).
     */
    dividaId: z.string().min(1).optional(),
    numero: z.string().min(1),
    tipo: zTipoEmpenho,
    valor: zValorPositivo,
    data: z.coerce.date(),
    credorCpfCnpj: z.string().min(11, "CPF/CNPJ inválido"),
    historico: z.string().min(1),
    /**
     * M06 (art. 141): define em qual fila o pagamento entra.
     *
     * ⚠️ CONTINUA OBRIGATÓRIA SEM CONTRATO. Só é opcional QUANDO HÁ CONTRATO — e
     * aí ela é HERDADA dele. Torná-la opcional para todos traria de volta
     * exatamente o que o comentário do schema proíbe: um empenho sem categoria
     * escolhida, caindo em silêncio numa fila qualquer.
     */
    categoriaOrdemCronologica: zCategoriaOrdemCronologica.optional(),
    criadoPor: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.contratoId === undefined && v.categoriaOrdemCronologica === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["categoriaOrdemCronologica"],
        message:
          "Empenho SEM contrato precisa da categoria da ordem cronológica (art. " +
          "141): não há de quem herdá-la, e um default a faria virar " +
          "FORNECIMENTO_BENS em silêncio — a fila de obras se misturaria com a de " +
          "bens sem ninguém perceber.",
      });
    }
  });

export const zAnularEmpenhoInput = z.object({
  empenhoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zLiberarReservaInput = z.object({
  reservaId: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zLiquidarInput = z.object({
  empenhoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  responsavelAtesto: z.string().min(1, "Responsável pelo atesto é obrigatório"),
  notaFiscalChave: z.string().min(1).optional(),
  notaFiscalNum: z.string().min(1).optional(),
  notaFiscalSerie: z.string().min(1).optional(),
  notaFiscalData: z.coerce.date().optional(),
  notaFiscalValor: zValorPositivo.optional(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zPagarInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  /** Código da ContaBancaria de onde sai o dinheiro. */
  contaBancaria: z.string().min(1),
  /** TR 5.23: tem de casar com a fonte da conta bancária. */
  fonteId: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
  /**
   * M06 (art. 141, §1º) — SÓ é necessária para pagar fora da ordem cronológica.
   * Pagar a cabeça da fila não exige nada. Pagar outra sem isto = rejeitado.
   */
  justificativaQuebraOrdem: zJustificativaQuebraOrdemInput.optional(),
});

export const zAnularLiquidacaoInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zAnularPagamentoInput = z.object({
  pagamentoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export type LiquidarInput = z.input<typeof zLiquidarInput>;
export type PagarInput = z.input<typeof zPagarInput>;
export type AnularLiquidacaoInput = z.input<typeof zAnularLiquidacaoInput>;
export type AnularPagamentoInput = z.input<typeof zAnularPagamentoInput>;

export type ReservarDotacaoInput = z.input<typeof zReservarDotacaoInput>;
export type EmpenharInput = z.input<typeof zEmpenharInput>;
export type AnularEmpenhoInput = z.input<typeof zAnularEmpenhoInput>;
export type LiberarReservaInput = z.input<typeof zLiberarReservaInput>;

/** Compõe o empenho: forma (Zod) + partidas balanceadas (motor puro). Sem I/O. */
export function comporEmpenho(
  input: EmpenharInput,
  roteiro: RoteiroContabil
): {
  readonly dados: z.output<typeof zEmpenharInput>;
  readonly partidas: readonly Partida[];
} {
  const dados = zEmpenharInput.parse(input);
  return { dados, partidas: comporPartidas(dados.valor, roteiro) };
}
