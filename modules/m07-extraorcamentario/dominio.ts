import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
  type Subsistema,
  type TipoPartida,
} from "../../packages/ledger/index.js";

/**
 * DOMAIN do M07 — SEM I/O. Consignações, retenções e cauções.
 *
 * Dinheiro de TERCEIROS: entra sem ser receita, sai sem ser despesa. Não toca
 * dotação nem a fila do art. 141.
 */

export type TipoMovimentoExtra =
  | "INGRESSO"
  | "DISPENDIO"
  | "ESTORNO_INGRESSO"
  | "ESTORNO_DISPENDIO";

/**
 * ⚠️ A FONTE ÚNICA DO SINAL. Toda soma de movimentos DEVE passar por aqui.
 *
 * O `valor` do movimento é SEMPRE positivo — quem dá o sinal é o tipo. Assim não
 * existe movimento com valor negativo escondendo um estorno.
 *
 * ESTA É A LIÇÃO DO M08. Lá os estornos chegaram depois, e dois `SUM` brutos
 * escaparam: o estorno passou a REDUZIR o saldo em vez de devolvê-lo (345af7d),
 * e depois o mesmo erro se repetiu no outro tipo (4768cff). Aqui os quatro tipos
 * existem desde o dia 1, e o `Record<TipoMovimentoExtra, ...>` força o TypeScript
 * a apontar quem esquecer de tratar um tipo novo.
 */
export const SINAL_MOVIMENTO_EXTRA: Record<TipoMovimentoExtra, 1 | -1> = {
  /** Dinheiro de terceiro entra: o passivo com ele CRESCE. */
  INGRESSO: 1,
  /** Repasse/devolução: o passivo DIMINUI. */
  DISPENDIO: -1,
  /** Desfaz o ingresso: o passivo volta a diminuir. */
  ESTORNO_INGRESSO: -1,
  /** Desfaz o dispêndio: o passivo volta a crescer. */
  ESTORNO_DISPENDIO: 1,
};

export interface MovimentoExtra {
  readonly tipo: TipoMovimentoExtra;
  readonly valor: Money;
}

export interface TotaisExtra {
  readonly ingresso: Money;
  readonly estornoIngresso: Money;
  readonly dispendio: Money;
  readonly estornoDispendio: Money;
  /** ingresso − estornoIngresso. O que de fato entrou. */
  readonly ingressoLiquido: Money;
  /** dispendio − estornoDispendio. O que de fato saiu. */
  readonly dispendioLiquido: Money;
  /**
   * O SALDO devido ao consignatário = ingressoLiquido − dispendioLiquido.
   * É quanto o ente ainda tem de dinheiro que NÃO é dele.
   */
  readonly saldo: Money;
}

/**
 * Os totais de um (tipoConsignacao, credor), com o sinal de cada tipo.
 * PURA — a mesma função serve para o banco e para o teste sem banco.
 */
export function totaisPorConsignatario(
  movimentos: readonly MovimentoExtra[]
): TotaisExtra {
  const zero = toMoney("0.00");
  const por: Record<TipoMovimentoExtra, Money> = {
    INGRESSO: zero,
    DISPENDIO: zero,
    ESTORNO_INGRESSO: zero,
    ESTORNO_DISPENDIO: zero,
  };

  for (const m of movimentos) {
    por[m.tipo] = toMoney(por[m.tipo].plus(m.valor));
  }

  const ingressoLiquido = toMoney(
    por.INGRESSO.minus(por.ESTORNO_INGRESSO)
  );
  const dispendioLiquido = toMoney(
    por.DISPENDIO.minus(por.ESTORNO_DISPENDIO)
  );

  return {
    ingresso: por.INGRESSO,
    estornoIngresso: por.ESTORNO_INGRESSO,
    dispendio: por.DISPENDIO,
    estornoDispendio: por.ESTORNO_DISPENDIO,
    ingressoLiquido,
    dispendioLiquido,
    saldo: toMoney(ingressoLiquido.minus(dispendioLiquido)),
  };
}

/** O tipo do estorno de cada movimento. Um estorno não se estorna. */
export function tipoDoEstorno(
  tipo: TipoMovimentoExtra
): "ESTORNO_INGRESSO" | "ESTORNO_DISPENDIO" {
  if (tipo === "INGRESSO") return "ESTORNO_INGRESSO";
  if (tipo === "DISPENDIO") return "ESTORNO_DISPENDIO";
  throw new Error(
    `Movimento do tipo ${tipo} JÁ É um estorno — um estorno não se estorna.`
  );
}

// ----------------------------------------------------------------------------
// ROTEIROS CONTÁBEIS — sem conta mágica (padrão do projeto: os códigos PCASP
// vêm por PARÂMETRO).
//
// NENHUM roteiro do M07 tem perna ORÇAMENTÁRIA. Dinheiro de terceiro não é
// receita nem despesa do ente: não passa pelo orçamento. Uma perna orçamentária
// aqui inflaria a execução com dinheiro que não é do município.
// ----------------------------------------------------------------------------

export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}
export type RoteiroContabil = readonly PernaRoteiro[];

/** INGRESSO: o dinheiro entra no caixa e nasce a obrigação de repassá-lo. */
export interface ContasIngressoExtra {
  readonly disponibilidade: string;
  /** Passivo: consignações/cauções a pagar. */
  readonly consignacaoAPagar: string;
}
export function roteiroIngressoExtra(c: ContasIngressoExtra): RoteiroContabil {
  return [
    { conta: c.disponibilidade, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.consignacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
  ];
}

/** DISPÊNDIO: a obrigação é extinta e o dinheiro sai. */
export interface ContasDispendioExtra {
  readonly consignacaoAPagar: string;
  readonly disponibilidade: string;
}
export function roteiroDispendioExtra(c: ContasDispendioExtra): RoteiroContabil {
  return [
    { conta: c.consignacaoAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: c.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
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
const zCredor = z
  .string()
  .trim()
  .min(3, "O credor consignatário precisa de ao menos 3 caracteres");
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo do estorno precisa de ao menos 10 caracteres");

export const zRegistrarIngressoExtraInput = z.object({
  tipoConsignacaoId: z.string().min(1),
  credorConsignatario: zCredor,
  contaBancaria: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zRegistrarDispendioExtraInput = z.object({
  tipoConsignacaoId: z.string().min(1),
  credorConsignatario: zCredor,
  contaBancaria: z.string().min(1),
  /** TR 5.23: tem de casar com a fonte da conta bancária. */
  fonteId: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zEstornarMovimentoExtraInput = z.object({
  movimentoId: z.string().min(1),
  data: z.coerce.date(),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});

/** Uma retenção dentro de um pagamento (bloco 3). */
export const zRetencaoInput = z.object({
  tipoConsignacaoId: z.string().min(1),
  credorConsignatario: zCredor,
  valor: zValorPositivo,
});

export type RegistrarIngressoExtraInput = z.input<
  typeof zRegistrarIngressoExtraInput
>;
export type RegistrarDispendioExtraInput = z.input<
  typeof zRegistrarDispendioExtraInput
>;
export type EstornarMovimentoExtraInput = z.input<
  typeof zEstornarMovimentoExtraInput
>;
export type RetencaoInput = z.input<typeof zRetencaoInput>;
export type RetencaoDados = z.output<typeof zRetencaoInput>;

// ----------------------------------------------------------------------------
// RETENÇÃO NA FONTE — o pagamento COMPOSTO.
//
// ═══ A ANATOMIA ═══
// Pagar 1.000 ao fornecedor retendo 100 de INSS NÃO são dois fatos: é UM.
// O dinheiro do INSS nunca chega ao fornecedor — ele fica no caixa do ente, mas
// já não é dele. Um único lançamento, com as pernas do pagamento e uma perna de
// passivo POR CONSIGNAÇÃO:
//
//   PATRIMONIAL   D obrigação a pagar ....... 1.000   (o BRUTO: a obrigação com
//                 C disponibilidade .........   900    o fornecedor morre inteira)
//                 C consignação a pagar .....   100   (nasce a dívida com o INSS)
//   ORÇAMENTÁRIO  D crédito liquidado ....... 1.000   (a despesa executada é o
//                 C crédito pago ............ 1.000    BRUTO — retenção não é
//                                                      desconto de despesa)
//
// Só a perna do CAIXA muda de valor (vira o líquido). Nenhuma outra é deduzida —
// nem a obrigação, nem o orçamentário. Quem prova que fecha é o motor do ledger,
// sobre o lançamento composto FINAL: ΣD == ΣC dentro de cada subsistema.
//
// ═══ E O QUE ISTO NÃO FAZ ═══
// O `Pagamento` é gravado pelo BRUTO. A fila do art. 141 (M06) e o saldo de RP
// (M08) continuam vendo 1.000 — eles não sabem, e não precisam saber, que houve
// retenção. Registrar o pagamento pelo líquido faria a liquidação nunca quitar,
// a fila nunca andar e o resto a pagar nunca zerar.
// ----------------------------------------------------------------------------

/** Uma retenção + a conta do passivo dela (o roteiro do tipo de consignação). */
export const zRetencaoDoPagamentoInput = zRetencaoInput.extend({
  /**
   * Conta PCASP do passivo deste tipo de consignação. Vem por PARÂMETRO como
   * todo roteiro do projeto — não existe conta mágica escondida no código.
   */
  contaConsignacaoAPagar: z.string().min(1),
});
export type RetencaoDoPagamentoInput = z.input<typeof zRetencaoDoPagamentoInput>;
export type RetencaoDoPagamento = z.output<typeof zRetencaoDoPagamentoInput>;

/** Tudo que o M07 acrescenta a um pagamento. Ausente = pagamento sem retenção. */
export interface RetencoesDoPagamento {
  /**
   * A conta de DISPONIBILIDADE do roteiro do pagamento — a ÚNICA perna cujo
   * valor muda (ela fica com o líquido). Explícita, e não adivinhada do roteiro:
   * errar qual perna é o caixa é errar quem paga a retenção.
   */
  readonly contaDisponibilidade: string;
  readonly retencoes: readonly RetencaoDoPagamentoInput[];
}

/** O que a persistência precisa de uma retenção (a conta já virou perna). */
export interface RetencaoParaPersistir {
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly valor: Money;
}

export interface PagamentoComposto {
  /** O lançamento inteiro, já validado pelo motor (ΣD == ΣC por subsistema). */
  readonly partidas: readonly Partida[];
  /** As pernas do PAGAMENTO — têm dimensão orçamentária (fichaId). */
  readonly partidasPagamento: readonly Partida[];
  /**
   * As pernas de PASSIVO das retenções — SEM ficha. Dinheiro de terceiro não é
   * execução orçamentária da ficha; ele só transita pelo caixa dela.
   */
  readonly partidasRetencao: readonly Partida[];
  readonly retencoes: readonly RetencaoDoPagamento[];
  /** O valor do Pagamento e das pernas não-caixa. */
  readonly valorBruto: Money;
  readonly totalRetido: Money;
  /** bruto − retido: o que de fato sai do caixa para o credor. */
  readonly valorLiquido: Money;
}

/**
 * Compõe o lançamento do pagamento COM retenções. PURA, fail-closed.
 *
 * SEM retenção (lista vazia) o resultado é IDÊNTICO a `comporPartidas(bruto,
 * roteiro)` — mesmas pernas, mesmo valor, mesma ordem. É o que garante que
 * acrescentar o M07 ao `pagar()` não muda um único pagamento existente.
 */
export function comporPagamentoComRetencoes(p: {
  readonly valorBruto: Money;
  readonly roteiro: RoteiroContabil;
  readonly contaDisponibilidade?: string | undefined;
  readonly retencoes: readonly RetencaoDoPagamentoInput[];
}): PagamentoComposto {
  const zero = toMoney("0.00");

  // CAMINHO DE SEMPRE: sem retenção, o roteiro inteiro recebe o bruto.
  if (p.retencoes.length === 0) {
    return {
      partidas: comporPartidas(p.valorBruto, p.roteiro),
      partidasPagamento: comporPartidas(p.valorBruto, p.roteiro),
      partidasRetencao: [],
      retencoes: [],
      valorBruto: p.valorBruto,
      totalRetido: zero,
      valorLiquido: p.valorBruto,
    };
  }

  const retencoes = p.retencoes.map((r) => zRetencaoDoPagamentoInput.parse(r));

  // Duas retenções para o MESMO (tipo, credor) no mesmo pagamento são ambíguas:
  // o saldo do consignatário é por (tipo, credor), e a anulação teria de decidir
  // qual movimento desfaz qual perna. Some as duas e mande uma só.
  const chaves = new Set<string>();
  for (const r of retencoes) {
    const chave = `${r.tipoConsignacaoId}|${r.credorConsignatario}`;
    if (chaves.has(chave)) {
      throw new Error(
        `Retenção DUPLICADA no mesmo pagamento para ${r.credorConsignatario} ` +
          `(tipo ${r.tipoConsignacaoId}). Some as duas numa retenção só.`
      );
    }
    chaves.add(chave);
  }

  if (p.contaDisponibilidade === undefined) {
    throw new Error(
      "Retenção sem `contaDisponibilidade`: é preciso dizer QUAL perna do " +
        "roteiro fica com o líquido."
    );
  }

  const caixa = p.roteiro.filter((x) => x.conta === p.contaDisponibilidade);
  if (caixa.length !== 1) {
    throw new Error(
      `A conta de disponibilidade ${p.contaDisponibilidade} aparece ` +
        `${caixa.length}x no roteiro do pagamento — é preciso EXATAMENTE uma ` +
        `perna de caixa para receber o líquido.`
    );
  }
  const perna = caixa[0]!;
  if (perna.tipo !== "CREDITO" || perna.subsistema !== "PATRIMONIAL") {
    throw new Error(
      `A perna de ${p.contaDisponibilidade} é ${perna.tipo}/${perna.subsistema}: ` +
        `o líquido só sai de uma perna de CAIXA (CREDITO/PATRIMONIAL). Deduzir o ` +
        `orçamentário faria a retenção virar desconto de despesa — e a execução ` +
        `passaria a mentir o valor empenhado.`
    );
  }

  const totalRetido = retencoes.reduce(
    (acc, r) => toMoney(acc.plus(r.valor)),
    zero
  );
  const valorLiquido = toMoney(p.valorBruto.minus(totalRetido));

  // FAIL-CLOSED: reter tudo (ou mais) deixaria a perna do caixa em zero (ou
  // negativa) — e o motor do ledger exige valor > 0 em toda partida. Um
  // pagamento que não paga nada ao credor não é pagamento.
  if (!valorLiquido.greaterThan(0)) {
    throw new Error(
      `As retenções (${totalRetido.toFixed(2)}) consomem o pagamento inteiro ` +
        `(${p.valorBruto.toFixed(2)}): líquido ${valorLiquido.toFixed(2)}. Não ` +
        `sobra nada para o credor — isto não é um pagamento com retenção.`
    );
  }

  // Só o CAIXA muda de valor. As demais pernas ficam no BRUTO — nunca deduzidas.
  const partidasPagamento: readonly Partida[] = p.roteiro.map((x) => ({
    conta: x.conta,
    tipo: x.tipo,
    subsistema: x.subsistema,
    valor: x.conta === p.contaDisponibilidade ? valorLiquido : p.valorBruto,
  }));

  // Uma perna de passivo POR CONSIGNAÇÃO — nunca uma perna só, somada: o razão
  // do M07 é por (tipo, credor), e o lançamento tem de espelhá-lo.
  const partidasRetencao: readonly Partida[] = retencoes.map((r) => ({
    conta: r.contaConsignacaoAPagar,
    tipo: "CREDITO",
    subsistema: "PATRIMONIAL",
    valor: r.valor,
  }));

  // O JUIZ é o motor do ledger, sobre o lançamento COMPOSTO final.
  const partidas = validarLancamento([
    ...partidasPagamento,
    ...partidasRetencao,
  ]);

  return {
    partidas,
    partidasPagamento,
    partidasRetencao,
    retencoes,
    valorBruto: p.valorBruto,
    totalRetido,
    valorLiquido,
  };
}
