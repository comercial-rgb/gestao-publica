import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import {
  validarLancamento,
  type Partida,
  type Subsistema,
  type TipoPartida,
} from "../../packages/ledger/index.js";
import { zJustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";

/**
 * DOMAIN do M08 — SEM I/O. A aritmética dos restos a pagar (Lei 4.320/64,
 * art. 36).
 *
 * Tudo aqui é FUNÇÃO dos SUMs. Nenhum saldo é lido de coluna.
 */

export type TipoRestosAPagar = "PROCESSADO" | "NAO_PROCESSADO";
export type TipoMovimentoRestosAPagar =
  | "PAGAMENTO"
  | "CANCELAMENTO"
  | "ESTORNO_PAGAMENTO"
  | "ESTORNO_CANCELAMENTO";

/**
 * O SINAL de cada tipo de movimento de RP. O `valor` é SEMPRE positivo — quem dá
 * o sinal é o tipo. Assim não existe movimento com valor negativo escondendo um
 * estorno.
 *
 * Os ESTORNO_* somam: eles DEVOLVEM saldo à inscrição. Sem eles, a baixa
 * (pagamento ou cancelamento) seria irreversível, e o saldo de RP ficaria errado
 * PARA MENOS — o sistema acharia que baixou algo que foi desfeito.
 *
 * ⚠️ ESTE MAPA É A FONTE ÚNICA DO SINAL. Qualquer soma de movimentos que NÃO o
 * consulte está errada — foi assim que o bug do estorno de pagamento se escondeu
 * (ver commit 345af7d). Se você acrescentar um tipo, acrescente aqui PRIMEIRO e
 * deixe o TypeScript apontar o que quebrou.
 */
export const SINAL_MOVIMENTO_RP: Record<TipoMovimentoRestosAPagar, 1 | -1> = {
  PAGAMENTO: -1,
  CANCELAMENTO: -1,
  ESTORNO_PAGAMENTO: 1,
  ESTORNO_CANCELAMENTO: 1,
};

/** O retrato de um empenho no momento do encerramento. Todos vêm de SUM. */
export interface SituacaoDoEmpenho {
  readonly empenhoId: string;
  readonly numero: string;
  /** Valor do empenho, líquido de anulação (0 se o empenho foi anulado). */
  readonly empenhado: Money;
  /** SUM das liquidações vivas. */
  readonly liquidado: Money;
  /** SUM dos pagamentos vivos. */
  readonly pago: Money;
}

export interface InscricaoCalculada {
  readonly empenhoId: string;
  readonly tipo: TipoRestosAPagar;
  readonly valorInscrito: Money;
}

/**
 * O CÁLCULO DAS INSCRIÇÕES (art. 36).
 *
 *   PROCESSADO     = liquidado − pago      (a despesa existe, falta pagar)
 *   NAO_PROCESSADO = empenhado − liquidado (o compromisso existe, falta a despesa)
 *
 * Um empenho pode gerar AS DUAS: a parte liquidada e não paga vira processado; a
 * parte empenhada e não liquidada vira não processado. Só entra o que for > 0.
 *
 * Empenho quitado (pago == empenhado) não gera inscrição nenhuma — que é
 * exatamente o ponto: só sobra o que ficou pendente na virada do ano.
 */
export function calcularInscricoes(
  s: SituacaoDoEmpenho
): readonly InscricaoCalculada[] {
  const inscricoes: InscricaoCalculada[] = [];

  const processado = toMoney(s.liquidado.minus(s.pago));
  if (processado.greaterThan(0)) {
    inscricoes.push({
      empenhoId: s.empenhoId,
      tipo: "PROCESSADO",
      valorInscrito: processado,
    });
  }

  const naoProcessado = toMoney(s.empenhado.minus(s.liquidado));
  if (naoProcessado.greaterThan(0)) {
    inscricoes.push({
      empenhoId: s.empenhoId,
      tipo: "NAO_PROCESSADO",
      valorInscrito: naoProcessado,
    });
  }

  return inscricoes;
}

/**
 * Saldo de uma inscrição = valorInscrito − Σ(movimentos, com o sinal do tipo).
 *
 * PAGAMENTO e CANCELAMENTO reduzem: um porque a obrigação foi honrada, o outro
 * porque deixou de existir. ESTORNO_PAGAMENTO devolve — a obrigação voltou a
 * existir.
 */
export function saldoDaInscricao(
  valorInscrito: Money,
  movimentos: readonly {
    readonly tipo: TipoMovimentoRestosAPagar;
    readonly valor: Money;
  }[]
): Money {
  const baixado = movimentos.reduce((acc, m) => {
    const sinal = SINAL_MOVIMENTO_RP[m.tipo];
    // sinal -1 = baixa (soma ao "baixado"); +1 = devolução (subtrai)
    return sinal === -1 ? toMoney(acc.plus(m.valor)) : toMoney(acc.minus(m.valor));
  }, toMoney("0.00"));

  return toMoney(valorInscrito.minus(baixado));
}

/**
 * ⚠️ A ARITMÉTICA DO SALDO DE RP, EM FORMA PURA. FONTE ÚNICA.
 *
 * Quem precisar dos totais de uma inscrição — o próprio M08, o M12 (relatórios),
 * quem vier — passa por AQUI. Não existe segunda implementação: uma cópia com
 * um sinal trocado é exatamente o bug do 345af7d nascendo de novo, agora num
 * relatório que vai para o TCE.
 *
 * O M08 lê os movimentos do banco e chama esta função; o M12 lê os movimentos
 * ATÉ UMA DATA DE CORTE e chama a MESMA função. A aritmética é uma só; o recorte
 * é de quem lê.
 */
export interface MovimentoDaInscricao {
  readonly tipo: TipoMovimentoRestosAPagar;
  readonly valor: Money;
}

export interface TotaisRP {
  /** Pago BRUTO (soma dos PAGAMENTO). */
  readonly pago: Money;
  readonly estornoPagamento: Money;
  /** Cancelado BRUTO (soma dos CANCELAMENTO). */
  readonly cancelado: Money;
  readonly estornoCancelamento: Money;
  /** pago − estornoPagamento. O que de fato saiu do caixa. */
  readonly pagoLiquido: Money;
  /** cancelado − estornoCancelamento. A obrigação que de fato morreu. */
  readonly canceladoLiquido: Money;
  /** pagoLiquido + canceladoLiquido. O que saiu da inscrição. */
  readonly baixaLiquida: Money;
}

export function totaisDosMovimentos(
  movimentos: readonly MovimentoDaInscricao[]
): TotaisRP {
  const zero = toMoney("0.00");
  const por: Record<TipoMovimentoRestosAPagar, Money> = {
    PAGAMENTO: zero,
    ESTORNO_PAGAMENTO: zero,
    CANCELAMENTO: zero,
    ESTORNO_CANCELAMENTO: zero,
  };

  for (const m of movimentos) {
    por[m.tipo] = toMoney(por[m.tipo].plus(m.valor));
  }

  const pagoLiquido = toMoney(por.PAGAMENTO.minus(por.ESTORNO_PAGAMENTO));
  const canceladoLiquido = toMoney(
    por.CANCELAMENTO.minus(por.ESTORNO_CANCELAMENTO)
  );

  return {
    pago: por.PAGAMENTO,
    estornoPagamento: por.ESTORNO_PAGAMENTO,
    cancelado: por.CANCELAMENTO,
    estornoCancelamento: por.ESTORNO_CANCELAMENTO,
    pagoLiquido,
    canceladoLiquido,
    baixaLiquida: toMoney(pagoLiquido.plus(canceladoLiquido)),
  };
}

/**
 * ⚠️ A SOMA LÍQUIDA MUDOU DE CASA — virou `packages/estornaveis`.
 *
 * Ela nasceu aqui, e o M06 tinha uma CÓPIA dela (`pagoLiquido`), porque `m06 → m08`
 * seria um ciclo. A anulação PARCIAL (TR 5.35) obrigaria a ensinar o caso novo às
 * DUAS — e duas cópias da mesma soma é o 345af7d esperando. Agora a soma é UMA e mora
 * abaixo de todos. O M08 REEXPORTA; nenhum chamador precisou mudar.
 */
export { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
export type { LinhaEstornavel } from "../../packages/estornaveis/index.js";

/**
 * QUANTO AINDA DÁ PARA LIQUIDAR (ou CANCELAR) de uma inscrição NÃO PROCESSADA.
 *
 *   = valorInscrito − cancelamentos − liquidações feitas APÓS a inscrição
 *
 * NÃO desconta pagamentos: um RPNP só é pago DEPOIS de liquidado, e a
 * liquidação já saiu daqui. Descontar os dois seria contar a mesma baixa duas
 * vezes.
 *
 * É por isso que uma inscrição NP tem DUAS medidas, e elas são diferentes de
 * propósito:
 *   - esta (o que ainda pode virar despesa);
 *   - `saldoDaInscricao` (o razão contábil: quanto da obrigação ainda existe).
 * Liquidar um RPNP não extingue a obrigação — só a qualifica para pagamento.
 */
export function saldoParaLiquidar(
  valorInscrito: Money,
  cancelamentos: Money,
  liquidacoesPosInscricao: Money
): Money {
  return toMoney(
    valorInscrito.minus(cancelamentos).minus(liquidacoesPosInscricao)
  );
}

// ----------------------------------------------------------------------------
// ROTEIROS CONTÁBEIS DO RP — sem conta mágica (padrão do projeto: os códigos
// PCASP vêm por PARÂMETRO; a Matriz de Eventos passará a fornecê-los).
//
// NENHUM roteiro de RP tem perna ORÇAMENTÁRIA — e isso é o ponto:
// RP não consome dotação do exercício corrente. A dotação do ano que fechou já
// foi consumida pelo empenho. Pôr uma perna orçamentária aqui seria gastar duas
// vezes o mesmo dinheiro.
// ----------------------------------------------------------------------------

export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}
export type RoteiroContabil = readonly PernaRoteiro[];

/** LIQUIDAÇÃO de RPNP: a despesa é incorrida e a obrigação passa a existir. */
export interface ContasLiquidacaoRP {
  readonly variacaoDiminutiva: string;
  readonly restosAPagarProcessados: string;
}
/**
 * ⚠️ AS PERNAS DE DDR ATRAVESSAM A VIRADA — e é por isso que elas existem AQUI.
 *
 * ═══ A REGRA DE INTEGRIDADE, E O QUE ELA IMPLICA PARA O RP ═══
 * O orçamento é ANUAL: em 31/12 o crédito não empenhado caduca (CF art. 167, II), e o
 * `encerrarControlesOrcamentarios` enterra as classes 5 e 6. **A DDR não.** Ela é
 * controle de DINHEIRO, não de crédito — e o dinheiro de um resto a pagar não caduca
 * junto com o orçamento dele: ele continua comprometido com aquele credor, naquela
 * fonte, até sair.
 *
 * Isso é visível no próprio encerramento: `saldosDeControle(tx, { classes: ["5","6"] })`
 * — a varredura NUNCA vê a classe 8. A DDR comprometida nasce no exercício N e é
 * consumida no N+1, N+2… pelo pagamento do RP. Se ela fosse encerrada junto, o dinheiro
 * reapareceria como disponível em 01/01 e o ente poderia empenhá-lo de novo — enquanto
 * ainda deve o resto a pagar do ano anterior.
 *
 * ⚠️ E É POR ISSO QUE ESTES DOIS ROTEIROS FORAM TOCADOS numa fatia que declarou este
 * arquivo intocável. A alternativa seria um `roteiroPagamentoRestos` próprio no M01 — e
 * aí o mesmo ato teria DOIS donos de roteiro, que é exatamente o que a 7.2 consertou.
 * "Um dono por roteiro" venceu "intocável de sessão". Registrado no MODULO.md do M08.
 */
export function roteiroLiquidacaoRestos(
  c: ContasLiquidacaoRP
): RoteiroContabil {
  return [
    { conta: c.variacaoDiminutiva, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    {
      conta: c.restosAPagarProcessados,
      tipo: "CREDITO",
      subsistema: "PATRIMONIAL",
    },
    // CONTROLE: liquidar o RPNP move o dinheiro de "comprometido por empenho" (que veio
    // do exercício anterior e atravessou a virada) para "comprometido por liquidação".
    { conta: "8.2.1.1.2.01.00", tipo: "DEBITO", subsistema: "CONTROLE" },
    { conta: "8.2.1.1.3.01.00", tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}

/** PAGAMENTO de RP: a obrigação é extinta e o dinheiro sai do caixa. */
export interface ContasPagamentoRP {
  readonly restosAPagarProcessados: string;
  readonly disponibilidade: string;
}
export function roteiroPagamentoRestos(c: ContasPagamentoRP): RoteiroContabil {
  return [
    {
      conta: c.restosAPagarProcessados,
      tipo: "DEBITO",
      subsistema: "PATRIMONIAL",
    },
    { conta: c.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    // CONTROLE: o dinheiro do RP processado sai — comprometido por liquidação → utilizada.
    // A comprometida veio da liquidação do exercício ANTERIOR e atravessou a virada
    // (ver o comentário de `roteiroLiquidacaoRestos`): o encerramento só toca 5 e 6.
    { conta: "8.2.1.1.3.01.00", tipo: "DEBITO", subsistema: "CONTROLE" },
    { conta: "8.2.1.1.4.01.00", tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}

/**
 * CANCELAMENTO de RP: a obrigação deixa de existir SEM saída de caixa. O ente
 * fica com um ganho patrimonial — daí o crédito em variação AUMENTATIVA. É o que
 * distingue cancelar de pagar: no cancelamento o dinheiro não sai.
 */
export interface ContasCancelamentoRP {
  readonly restosAPagar: string;
  readonly variacaoAumentativa: string;
}
export function roteiroCancelamentoRestos(
  c: ContasCancelamentoRP
): RoteiroContabil {
  return [
    { conta: c.restosAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    {
      conta: c.variacaoAumentativa,
      tipo: "CREDITO",
      subsistema: "PATRIMONIAL",
    },
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

export const zLiquidarRestosInput = z.object({
  empenhoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  responsavelAtesto: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
});

export const zPagarRestosInput = z.object({
  liquidacaoId: z.string().min(1),
  numero: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  contaBancaria: z.string().min(1),
  /** TR 5.23: tem de casar com a fonte da conta bancária. */
  fonteId: z.string().min(1),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
  /** M06 (art. 141) — vale para RP também. */
  justificativaQuebraOrdem: zJustificativaQuebraOrdemInput.optional(),
});

export const zCancelarRestosInput = z.object({
  inscricaoId: z.string().min(1),
  valor: zValorPositivo,
  motivo: z
    .string()
    .trim()
    .min(10, "O motivo do cancelamento precisa de ao menos 10 caracteres"),
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});

export const zAnularPagamentoRestosInput = z.object({
  pagamentoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  motivo: z
    .string()
    .trim()
    .min(10, "O motivo da anulação precisa de ao menos 10 caracteres"),
  criadoPor: z.string().min(1),
});

export type AnularPagamentoRestosInput = z.input<
  typeof zAnularPagamentoRestosInput
>;

export const zAnularCancelamentoRestosInput = z.object({
  /** O MovimentoRestosAPagar(CANCELAMENTO) a desfazer. */
  movimentoId: z.string().min(1),
  numero: z.string().min(1),
  data: z.coerce.date(),
  motivo: z
    .string()
    .trim()
    .min(10, "O motivo da anulação precisa de ao menos 10 caracteres"),
  criadoPor: z.string().min(1),
});

export type AnularCancelamentoRestosInput = z.input<
  typeof zAnularCancelamentoRestosInput
>;

export type LiquidarRestosInput = z.input<typeof zLiquidarRestosInput>;
export type PagarRestosInput = z.input<typeof zPagarRestosInput>;
export type CancelarRestosInput = z.input<typeof zCancelarRestosInput>;
