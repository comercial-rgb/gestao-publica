import type { Money } from "../../packages/contracts/index.js";
import type { LancamentoContabil } from "../../packages/ledger/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
// M05 -> M06 (nunca o inverso): quem paga é que precisa respeitar a ordem.
import type { JustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";
// M05 -> M07 (nunca o inverso): quem paga é que retém. Tipo do DOMÍNIO do M07 —
// puro, sem Prisma; a port continua sem conhecer banco.
import type { RetencaoParaPersistir } from "../m07-extraorcamentario/dominio.js";
import type {
  ContaRepositoryPort,
  IdPort,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import type {
  CategoriaOrdemCronologica,
  SaldosFicha,
  TipoEmpenho,
  TotaisEmpenho,
} from "./dominio.js";

/**
 * PORTS do M05. Nenhuma referência a Prisma.
 *
 * ATENÇÃO ao desenho: a checagem de saldo (INVARIANTE 5) e o recálculo do cache
 * (INVARIANTE 3) têm de acontecer DENTRO da mesma transação do INSERT. Por isso
 * as operações da port são GROSSAS (`reservar`, `empenhar`) em vez de finas
 * (`inserirMovimento`, `atualizarSaldo`): uma port fina obrigaria o serviço a
 * orquestrar a transação, e o serviço não pode conhecer transação.
 */

/** Lançamento contábil que acompanha a operação. */
export interface LancamentoDaDespesa {
  readonly id: string;
  readonly numeroControle: string;
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly origemTipo: string;
  readonly origemId?: string | undefined;
  readonly estornoDeId?: string | undefined;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaParaPersistir[];
}

export interface ReservarParams {
  readonly reservaId: string;
  readonly fichaId: string;
  readonly valor: Money;
  readonly historico: string;
  /** M11 — o processo licitatório a que a reserva se vincula (TR 4.41). */
  readonly processoId?: string | undefined;
  readonly criadoPor: string;
}

export interface EmpenharParams {
  readonly empenhoId: string;
  readonly fichaId: string;
  readonly reservaId?: string | undefined;
  readonly subelementoId?: string | undefined;
  /** M11 — o contrato que esta despesa executa. A anulação o COPIA. */
  readonly contratoId?: string | undefined;
  /** M11/M10 (TR 4.49) — a classe de bens que o empenho de capital vai adquirir. */
  readonly classeDeBensId?: string | undefined;
  /** M10 (TR 4.48) — a dívida que este empenho amortiza. */
  readonly dividaId?: string | undefined;
  /** M11 (TR 4.50) — a obra que este empenho executa. Guard UNIDIRECIONAL (elemento 51). */
  readonly obraId?: string | undefined;
  readonly numero: string;
  readonly tipo: TipoEmpenho;
  readonly valor: Money;
  readonly data: Date;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  /**
   * M06 (art. 141) — a liquidação herda.
   *
   * OPCIONAL aqui porque, quando há CONTRATO, quem a resolve é o adapter DENTRO da
   * transação (herança do contrato). Sem contrato, o Zod já a exigiu.
   */
  readonly categoriaOrdemCronologica?: CategoriaOrdemCronologica | undefined;
  readonly criadoPor: string;
}

export interface AnularEmpenhoParams {
  readonly empenhoAnulacaoId: string;
  readonly empenhoOriginalId: string;
  readonly numero: string;
  readonly data: Date;
  readonly historico: string;
  readonly criadoPor: string;
}

export interface LiberarReservaParams {
  readonly reservaLiberacaoId: string;
  readonly reservaOriginalId: string;
  readonly historico: string;
  readonly criadoPor: string;
}

/** Uma divergência entre a coluna cache e o SUM real dos movimentos. */
export interface Divergencia {
  readonly saldo: "autorizado" | "reservado" | "empenhado" | "disponivel";
  /** O que está gravado na coluna. */
  readonly cache: Money;
  /** O que o SUM dos movimentos diz. */
  readonly real: Money;
}

export interface EmpenhoResumo {
  readonly id: string;
  readonly fichaId: string;
  readonly numero: string;
  readonly valor: Money;
  readonly lancamentoId: string;
  readonly estornoDeId: string | null;
  /** DERIVADO da relação — é daqui que sai "já foi anulado?". */
  readonly estornos: readonly string[];
}

/**
 * TR 5.35 — os params da ANULAÇÃO PARCIAL. Um por nível, porque cada um decide contra
 * um saldo diferente (o de baixo): empenho contra o não-liquidado, liquidação contra o
 * não-pago, pagamento contra o pago.
 */
export interface AnularParcialParams {
  /** O id do registro NOVO (a parcial é um FATO, não um UPDATE). */
  readonly anulacaoId: string;
  readonly originalId: string;
  readonly numero: string;
  readonly valor: Money;
  readonly data: Date;
  readonly motivo: string;
  readonly criadoPor: string;
}

/** TR 5.35 — o estorno de uma anulação parcial. O nível diz em qual tabela ela vive. */
export interface EstornarParcialParams {
  readonly estornoId: string;
  readonly anulacaoId: string;
  readonly nivel: 'EMPENHO' | 'LIQUIDACAO' | 'PAGAMENTO';
  readonly numero: string;
  readonly data: Date;
  readonly motivo: string;
  readonly criadoPor: string;
}

export interface DespesaRepositoryPort {
  /**
   * INVARIANTE 3 + 5, numa transação só:
   *   garante DOTACAO_INICIAL -> lê saldo pelo SUM REAL (nunca pelo cache) ->
   *   REJEITA se disponível < valor -> insere ReservaDotacao + MovimentoDotacao
   *   -> RECALCULA as colunas de saldo a partir do SUM.
   * Devolve o id da reserva.
   */
  reservar(params: ReservarParams): Promise<string>;

  /**
   * Idem, para o empenho: + LancamentoContabil balanceado. Se veio de reserva,
   * gera também RESERVA_LIBERADA no valor empenhado.
   */
  empenhar(
    params: EmpenharParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /** Anulação: registro NOVO + EMPENHO_ANULADO + lançamento invertido. */
  anularEmpenho(
    params: AnularEmpenhoParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /** TR 5.35 — anulação PARCIAL (fato novo; ver `AnularParcialParams`). */
  anularEmpenhoParcial(
    params: AnularParcialParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /** Liberação: registro NOVO + RESERVA_LIBERADA. Sem lançamento contábil. */
  liberarReserva(params: LiberarReservaParams): Promise<string>;

  /** Saldos calculados do SUM REAL dos movimentos (nunca do cache). */
  saldosReais(fichaId: string): Promise<SaldosFicha>;

  /** Saldos como estão gravados nas colunas cache. */
  saldosCache(fichaId: string): Promise<SaldosFicha>;

  buscarEmpenho(id: string): Promise<EmpenhoResumo | null>;

  /** O lançamento do empenho, no formato do domínio — para `gerarEstorno`. */
  buscarLancamentoDoEmpenho(empenhoId: string): Promise<LancamentoContabil>;

  // ── BLOCO 2 ───────────────────────────────────────────────────────────────

  /**
   * Liquida. Dentro da transação: lê o SUM REAL do já liquidado, REJEITA se
   * ultrapassar o valor do empenho, insere Liquidacao + LancamentoContabil.
   */
  liquidar(
    params: LiquidarParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /**
   * Paga. Dentro da transação: SUM REAL do já pago da liquidação, TR 5.23
   * (fonte do pagamento == fonte da conta bancária), insere Pagamento +
   * LancamentoContabil.
   */
  pagar(
    params: PagarParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /** Anulação: registro NOVO + lançamento invertido. Original intacto. */
  anularLiquidacao(
    params: AnularLiquidacaoParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  anularLiquidacaoParcial(
    params: AnularParcialParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  anularPagamento(
    params: AnularPagamentoParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  anularPagamentoParcial(
    params: AnularParcialParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /**
   * TR 5.35 — o ESTORNO de uma anulação parcial (ela era um FATO; todo fato se
   * estorna). Restaura o original ao valor de antes, por DERIVAÇÃO: a parcial deixa
   * de estar viva e a soma líquida volta a não descontá-la.
   */
  estornarAnulacaoParcial(
    params: EstornarParcialParams,
    lancamento: LancamentoDaDespesa
  ): Promise<string>;

  /**
   * Totais do empenho pelo SUM REAL — é o que alimenta `statusDoEmpenho()`.
   * `liquidado` e `pago` já vêm LÍQUIDOS das anulações.
   */
  totaisDoEmpenho(empenhoId: string): Promise<TotaisEmpenho | null>;

  buscarLiquidacao(id: string): Promise<LiquidacaoResumo | null>;
  buscarPagamento(id: string): Promise<PagamentoResumo | null>;

  buscarLancamentoDaLiquidacao(id: string): Promise<LancamentoContabil>;
  buscarLancamentoDoPagamento(id: string): Promise<LancamentoContabil>;
}

// ── params do bloco 2 ────────────────────────────────────────────────────────

export interface LiquidarParams {
  readonly liquidacaoId: string;
  readonly empenhoId: string;
  readonly numero: string;
  readonly valor: Money;
  readonly data: Date;
  readonly responsavelAtesto: string;
  readonly notaFiscalChave?: string | undefined;
  readonly notaFiscalNum?: string | undefined;
  readonly notaFiscalSerie?: string | undefined;
  readonly notaFiscalData?: Date | undefined;
  readonly notaFiscalValor?: Money | undefined;
  readonly criadoPor: string;
}

export interface PagarParams {
  readonly pagamentoId: string;
  readonly liquidacaoId: string;
  readonly numero: string;
  /**
   * O BRUTO — sempre. Havendo retenção, o que sai do caixa é menos do que isto,
   * mas o `Pagamento` é registrado pelo bruto: é ele que quita a liquidação,
   * anda a fila do art. 141 e baixa o resto a pagar.
   */
  readonly valor: Money;
  readonly data: Date;
  readonly contaBancaria: string;
  readonly fonteId: string;
  readonly criadoPor: string;
  /**
   * M06 (art. 141, §1º) — só é necessária para pagar FORA da ordem cronológica.
   * Sem ela, pagar quem não é a cabeça da fila é rejeitado (fail-closed).
   */
  readonly justificativaQuebraOrdem?: JustificativaQuebraOrdemInput | undefined;
  /**
   * M07 — as retenções na fonte deste pagamento. Os `MovimentoExtraorcamentario`
   * nascem na MESMA transação do pagamento; as pernas de passivo delas já vêm
   * dentro do `lancamento` (composto). Ausente/vazia = pagamento sem retenção.
   */
  readonly retencoes?: readonly RetencaoParaPersistir[] | undefined;
}

export interface AnularLiquidacaoParams {
  readonly anulacaoId: string;
  readonly liquidacaoOriginalId: string;
  readonly numero: string;
  readonly data: Date;
  readonly criadoPor: string;
}

export interface AnularPagamentoParams {
  readonly anulacaoId: string;
  readonly pagamentoOriginalId: string;
  readonly numero: string;
  readonly data: Date;
  readonly criadoPor: string;
}

export interface LiquidacaoResumo {
  readonly id: string;
  readonly empenhoId: string;
  readonly fichaId: string;
  readonly valor: Money;
  readonly lancamentoId: string;
  readonly estornoDeId: string | null;
  readonly estornos: readonly string[];
}

export interface PagamentoResumo {
  readonly id: string;
  readonly liquidacaoId: string;
  readonly empenhoId: string;
  readonly fichaId: string;
  readonly valor: Money;
  readonly lancamentoId: string;
  readonly estornoDeId: string | null;
  readonly estornos: readonly string[];
}

/**
 * A SITUAÇÃO DE UM CONTRATO, DO PONTO DE VISTA DE QUEM VAI EMPENHAR (M11).
 *
 * ═══ POR QUE ISTO É UM PORT, E NÃO UM IMPORT ═══
 * O M11 precisa do M05 (a soma do empenhado sai do `Empenho`, que é do M05) e o
 * M05 precisa do M11 (vigência e saldo do contrato bloqueiam o empenho). Importar
 * nos dois sentidos é um CICLO. A inversão resolve: o M05 declara o que precisa
 * saber (esta interface) e o M11 implementa. O M05 não conhece contrato nenhum —
 * conhece uma pergunta.
 *
 * Os campos derivados (vigência, valor, empenhado, saldo) vêm PRONTOS: quem os
 * deriva é o dono deles.
 */
export interface SituacaoDoContrato {
  readonly numeroContrato: string;
  readonly processoId: string;
  /** Cadastro ?? evento — a leitura única do M11 (`homologadoEm`). */
  readonly processoHomologado: boolean;
  readonly categoriaOrdemCronologica: CategoriaOrdemCronologica;
  readonly vigenciaInicio: Date;
  /** DERIVADO: vigenciaFimInicial + Σ(dias × sinal). */
  readonly vigenciaFim: Date;
  /** DERIVADO na DATA DO EMPENHO — a pergunta é sempre sobre uma data. */
  readonly vigenteNaData: boolean;
  readonly valorAtualizado: Money;
  readonly empenhadoLiquido: Money;
  /** valorAtualizado − empenhadoLiquido. */
  readonly saldo: Money;
}

export interface ContratoPort {
  /**
   * `null` = o contrato não existe.
   *
   * ⚠️ RECEBE A TRANSAÇÃO DO EMPENHO — e é isso que fecha a janela que o bloco 2
   * deixou declarada. Antes, o port falava com o banco por fora da `tx`: dois
   * empenhos concorrentes liam o mesmo saldo e os DOIS passavam, estourando o
   * contrato. Agora a leitura acontece DENTRO da transação, e a implementação
   * TRAVA a linha do contrato (`FOR UPDATE`) antes de somar — o segundo empenho
   * espera, relê, e vê o primeiro.
   *
   * O preço é este `tx` atravessando a fronteira do port. É um preço honesto: um
   * guard que decide sobre saldo e roda fora da transação não é um guard, é uma
   * sugestão.
   */
  situacaoParaEmpenho(
    tx: TxDaDespesa,
    contratoId: string,
    data: Date
  ): Promise<SituacaoDoContrato | null>;
}

/**
 * O handle da transação, atravessando o port.
 *
 * `unknown` seria mais "puro" e obrigaria um cast na implementação — trocaria uma
 * dependência de TIPO (que some na compilação) por um cast (que some a checagem).
 * O port já existe para falar com o banco; carregar o handle dele é coerente.
 */
export type TxDaDespesa = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * A CASCATA DA ANULAÇÃO DE LIQUIDAÇÃO — a porta que o bloco do almoxarifado pediu.
 *
 * ═══ O FURO QUE ELA FECHA (declarado em e9cf648) ═══
 * A liquidação de material debita o ESTOQUE (o roteiro vem por parâmetro). Anulá-la
 * inverte o razão — e deixava o MOVIMENTO de entrada do almoxarifado VIVO. O material
 * ficava no estoque para sempre, e a amarração razão×movimentos acusava sem que
 * ninguém pudesse consertar.
 *
 * O M05 não sabe (e não deve saber) o que é um almoxarifado. Ele avisa: "esta
 * liquidação foi anulada". Quem sabe o que fazer é o M10 — mesmo desenho do
 * `AoAnularArrecadacaoPort` (M04) e do `ContratoPort` (M11): o dono da PERGUNTA declara
 * a interface; o dono da RESPOSTA a implementa.
 *
 * ⚠️ AUSENTE = FAIL-OPEN, e é correto: um módulo ausente não pode travar o M05. A
 * amarração razão×movimentos segue como rede de fundo.
 */
export interface AoAnularLiquidacaoPort {
  /** A liquidação inteira deixou de valer: desfaça TUDO que ela gerou. */
  aoAnularTotal(tx: TxDaDespesa, liquidacaoId: string): Promise<void>;
  /**
   * A liquidação VALE MENOS agora. Quem gerou fato a partir dela tem de caber no novo
   * líquido — e se NÃO couber, a anulação parcial INTEIRA é rejeitada (nenhum estado
   * intermediário: ou a liquidação encolhe e tudo continua coerente, ou nada acontece).
   */
  aoAnularParcial(
    tx: TxDaDespesa,
    liquidacaoId: string,
    liquidoPosAnulacao: Money
  ): Promise<void>;
}

export interface M05Deps {
  /** ⚠️ A porta da AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). Obrigatória — ver `M01Deps`. */
  readonly autz: AutorizacaoPort;
  readonly contas: ContaRepositoryPort;
  readonly despesa: DespesaRepositoryPort;
  readonly ids: IdPort;
}
