import { compararPorDiaCivil } from "../../packages/datas/index.js";
import { z } from "zod";
import type { Money } from "../../packages/contracts/index.js";

/**
 * DOMAIN do M06 — SEM I/O. Lei 14.133/2021, art. 141.
 *
 * A FILA É DERIVADA. `ordenarFila` é uma função pura: dado o conjunto de
 * liquidações com saldo a pagar, ela devolve a ordem. Não existe coluna
 * `posicaoNaFila` nem tabela `Fila` — elas mudariam a cada pagamento e virariam
 * mais um cache para derrapar.
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

/** Art. 141, §1º — hipóteses TAXATIVAS. Não existe "outros". */
export const zHipoteseQuebraOrdem = z.enum([
  "I_EMERGENCIA_CALAMIDADE",
  "II_ME_EPP_RISCO",
  "III_SISTEMAS_ESTRUTURANTES",
  "IV_FALENCIA_RECUPERACAO",
  "V_ATIVIDADE_FINALISTICA",
]);
export type HipoteseQuebraOrdem = z.infer<typeof zHipoteseQuebraOrdem>;

/**
 * A justificativa é PRÉVIA (§1º) e serve de prova quando o §2º mandar apurar
 * responsabilidade por preterição. Um texto de 3 palavras não é justificativa —
 * daí o mínimo de 30 caracteres.
 */
export const zJustificativaQuebraOrdemInput = z.object({
  hipotese: zHipoteseQuebraOrdem,
  justificativa: z
    .string()
    .trim()
    .min(30, "A justificativa da quebra de ordem precisa de ao menos 30 caracteres"),
  autorizadoPor: z.string().min(1, "Quem autorizou a quebra é obrigatório"),
});

export type JustificativaQuebraOrdemInput = z.input<
  typeof zJustificativaQuebraOrdemInput
>;
export type JustificativaQuebraOrdemDados = z.output<
  typeof zJustificativaQuebraOrdemInput
>;

/**
 * Uma liquidação candidata a pagamento, do ponto de vista da fila.
 * `saldoAPagar` já vem do SUM real (valor liquidado − pagamentos líquidos).
 */
export interface LiquidacaoNaFila {
  readonly liquidacaoId: string;
  readonly numero: string;
  /** Marco de exigibilidade (art. 141, caput): a liquidação da despesa. */
  readonly dataLiquidacao: Date;
  readonly fonteId: string;
  readonly categoria: CategoriaOrdemCronologica;
  readonly saldoAPagar: Money;
}

/**
 * A ORDEM. Pura, testável sem banco.
 *
 * Ordena por data de liquidação (o marco de exigibilidade do caput). Desempate
 * pelo `numero` da liquidação — duas liquidações no mesmo dia precisam de uma
 * ordem TOTAL, senão a "cabeça da fila" seria ambígua e a regra viraria loteria.
 *
 * NÃO filtra por fonte/categoria: quem faz o recorte é o adapter, que consulta
 * uma fila por vez. Esta função só ordena o que recebe.
 */
export function ordenarFila(
  liquidacoes: readonly LiquidacaoNaFila[]
): readonly LiquidacaoNaFila[] {
  // ⚠️ A COMPARAÇÃO É POR **DIA CIVIL**, e não por instante — e a diferença é o que faz
  // o desempate existir.
  //
  // O art. 141 ordena pela DATA de exigibilidade, e o desempate pelo número da liquidação
  // existe justamente porque duas liquidações do MESMO DIA precisam de uma ordem total.
  // Comparando `getTime()`, duas liquidações do mesmo dia gravadas em horas diferentes
  // **não empatam** — e o desempate pelo número nunca chega a rodar. A ordem cronológica
  // vira a ordem de quem digitou primeiro, que não é a regra e não é auditável.
  //
  // Pior, na virada do dia: uma liquidação de 30/06 às 22:00 (civil) é `2026-07-01T01:00Z`
  // e, pelo instante, ordenaria depois de uma de 01/07 pela manhã — invertendo a fila
  // entre dois dias diferentes. Ver `packages/datas`.
  return [...liquidacoes].sort((a, b) => {
    const porDia = compararPorDiaCivil(a.dataLiquidacao, b.dataLiquidacao);
    if (porDia !== 0) return porDia;
    return a.numero.localeCompare(b.numero);
  });
}

/** Posição (1-based) da liquidação na fila; `null` se ela não está na fila. */
export function posicaoNaFila(
  fila: readonly LiquidacaoNaFila[],
  liquidacaoId: string
): number | null {
  const i = ordenarFila(fila).findIndex((l) => l.liquidacaoId === liquidacaoId);
  return i === -1 ? null : i + 1;
}

/** A cabeça da fila — quem tem de ser paga primeiro. */
export function cabecaDaFila(
  fila: readonly LiquidacaoNaFila[]
): LiquidacaoNaFila | null {
  return ordenarFila(fila)[0] ?? null;
}

/**
 * A regra do art. 141, em forma pura.
 *
 * Pagar a cabeça da fila = ok. Pagar qualquer outra = QUEBRA DE ORDEM, e o §1º
 * só a admite com justificativa prévia numa das hipóteses taxativas.
 *
 * Note que PAGAMENTO PARCIAL NÃO TIRA DA FILA: a liquidação parcialmente paga
 * continua ali, na posição da data ORIGINAL, até ser quitada. Se ela saísse,
 * bastaria pagar R$ 0,01 a cada credor para desmontar a ordem inteira.
 */
export interface ResultadoOrdem {
  readonly ehCabecaDaFila: boolean;
  readonly posicao: number | null;
  /** Quem está sendo preterido, se houver quebra. */
  readonly preterida: LiquidacaoNaFila | null;
}

export function avaliarOrdem(
  fila: readonly LiquidacaoNaFila[],
  liquidacaoId: string
): ResultadoOrdem {
  const ordenada = ordenarFila(fila);
  const posicao = posicaoNaFila(ordenada, liquidacaoId);
  const cabeca = cabecaDaFila(ordenada);

  if (posicao === null) {
    // Não está na fila: ou não tem saldo a pagar, ou não existe. Quem decide o
    // que fazer com isso é o serviço — aqui só se relata.
    return { ehCabecaDaFila: false, posicao: null, preterida: cabeca };
  }

  const ehCabeca = posicao === 1;
  return {
    ehCabecaDaFila: ehCabeca,
    posicao,
    preterida: ehCabeca ? null : cabeca,
  };
}
