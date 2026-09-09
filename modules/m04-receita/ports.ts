import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { Money } from "../../packages/contracts/index.js";
import type { LancamentoContabil } from "../../packages/ledger/index.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type {
  ContaRepositoryPort,
  IdPort,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import type { ItemResolvido } from "../m02-planejamento/ports.js";

/**
 * PORTS do M04. Nenhuma referência a Prisma.
 *
 * REUSA o que já existe: `ContaRepositoryPort` (M01, plano de contas + regra da
 * conta analítica) e `IdPort` (M01). O que é novo mora aqui.
 */

/**
 * Resolução da classificação da RECEITA. É port próprio do M04 (e não a
 * `ClassificacaoRepositoryPort` do M02) porque o M02 só resolve
 * natureza+fonte para a receita PREVISTA — a arrecadação também tem CO, e
 * acrescentar método à port do M02 obrigaria a mexer no M02.
 * O adapter do M04 DELEGA a parte natureza+fonte ao adapter do M02.
 */
export interface ResolucaoReceitaArrecadada {
  readonly naturezaReceita: ItemResolvido | null;
  readonly fonte: ItemResolvido | null;
  /** `null` tanto quando não foi pedido quanto quando não existe. */
  readonly co: ItemResolvido | null;
}

export interface ReceitaClassificacaoPort {
  resolver(componentes: {
    readonly naturezaReceita: string;
    readonly fonte: string;
    readonly co?: string | undefined;
  }): Promise<ResolucaoReceitaArrecadada>;
}

/** Arrecadação pronta para persistir — componentes já resolvidos em ids. */
export interface ArrecadacaoParaPersistir {
  readonly id: string;
  readonly exercicio: number;
  readonly naturezaReceitaId: string;
  readonly fonteId: string;
  readonly coId?: string | undefined;
  readonly exercicioFonte: number;
  readonly tipo: "ARRECADACAO" | "ANULACAO" | "RETIFICACAO";
  readonly valor: Money;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  readonly estornoDeId?: string | undefined;
  readonly criadoPor: string;
}

/** O lançamento contábil que contabiliza a arrecadação. */
export interface LancamentoDaReceita {
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

/** A arrecadação e sua contabilização, lidas de volta do banco. */
export interface ArrecadacaoPersistida {
  readonly id: string;
  readonly exercicio: number;
  readonly naturezaReceitaId: string;
  readonly naturezaReceitaCodigo: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly coId: string | null;
  readonly exercicioFonte: number;
  readonly tipo: "ARRECADACAO" | "ANULACAO" | "RETIFICACAO";
  readonly valor: Money;
  readonly dataArrecadacao: Date;
  readonly numeroReceita: string;
  readonly lancamentoId: string;
  readonly estornoDeId: string | null;
  /** DERIVADO da relação inversa — é daqui que sai "já foi anulada?". */
  readonly estornos: readonly string[];
  readonly lancamento: LancamentoContabil;
}

/** Confronto arrecadado × previsto. NÃO bloqueia — sinaliza (INVARIANTE 5). */
export interface ConfrontoPrevisao {
  readonly previsto: Money;
  /** Arrecadado LÍQUIDO já registrado (arrecadações menos anulações). */
  readonly acumuladoAnterior: Money;
  /** `acumuladoAnterior` + o valor desta arrecadação. */
  readonly acumuladoComEsta: Money;
  readonly excedeuPrevisao: boolean;
}

export interface ReceitaRepositoryPort {
  /**
   * INVARIANTE 2/3: persiste a arrecadação E o lançamento contábil na MESMA
   * transação, como registros NOVOS. A port não expõe atualizar nem remover.
   * Devolve o id da ReceitaArrecadada.
   */
  persistir(
    arrecadacao: ArrecadacaoParaPersistir,
    lancamento: LancamentoDaReceita
  ): Promise<string>;

  /** Carrega com `estornos` preenchido — é dele que sai "já foi anulada?". */
  buscar(id: string): Promise<ArrecadacaoPersistida | null>;

  /**
   * Soma LÍQUIDA já arrecadada (ARRECADACAO menos ANULACAO) para a natureza no
   * exercício. Usada só para SINALIZAR excesso — nunca para bloquear.
   */
  acumuladoLiquido(
    exercicio: number,
    naturezaReceitaId: string
  ): Promise<Money>;

  /** Total previsto na LOA (M02) para a natureza no exercício. Zero se não há. */
  previsaoTotal(exercicio: number, naturezaReceitaId: string): Promise<Money>;
}

/** O client OU uma transação dele — os ports do M04 servem aos dois. */
export type TxDaReceita = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * CONTAS RESERVADAS — a porta que fecha a ENTRADA LATERAL.
 *
 * ═══ O PROBLEMA ═══
 * A conta do passivo de uma dívida (M10) e a do ativo de uma dívida ativa são
 * geridas por um LIVRO PRÓPRIO: o saldo delas é Σ dos movimentos, e a amarração
 * razão×movimentos exige que as duas leituras batam. Uma arrecadação AVULSA cujo
 * roteiro aponte a perna credora para uma dessas contas mexe no RAZÃO sem mexer nos
 * MOVIMENTOS — e a amarração passa a acusar para sempre.
 *
 * ═══ A INVERSÃO ═══
 * O M04 não sabe (e não deve saber) o que é uma dívida. Ele pergunta: "esta conta é
 * gerida por alguém?". Quem responde é o M10 — o mesmo desenho do `ContratoPort` do
 * M11: o dono da PERGUNTA declara a interface; o dono da RESPOSTA a implementa.
 *
 * ⚠️ AUSENTE = FAIL-OPEN, E ISSO É CORRETO. Sem o port, ninguém reserva nada e o M04
 * segue como sempre. Um módulo AUSENTE não pode travar o M04 — e a amarração
 * razão×movimentos continua de guarda, como detector de fundo.
 */
export interface ContaReservadaPort {
  /**
   * `null` = livre. Preenchido = quem a gere (entra na mensagem de erro).
   *
   * SEM `tx`: é leitura de CADASTRO (quais contas são de dívida), e ela acontece
   * ANTES de qualquer escrita. Carregar a transação aqui só para ler um cadastro
   * empurraria o handle do banco para dentro de um serviço que não tem — e não
   * precisa ter — nenhum.
   */
  quemGere(contaId: string): Promise<string | null>;
}

/**
 * A CASCATA DA ANULAÇÃO — a porta que fecha o caminho de VOLTA.
 *
 * Anular uma arrecadação que quitou dívida ativa (ou que trouxe uma operação de
 * crédito) tem de DESFAZER o que ela fez. Sem isto, o dinheiro volta e a dívida
 * continua baixada: o contribuinte teria "pago" sem ter pago.
 *
 * Roda DENTRO da transação da anulação — é UM fato, não dois. Mesma lição da
 * retenção do M07: quem nasceu junto, morre junto.
 */
export interface AoAnularArrecadacaoPort {
  aoAnular(tx: TxDaReceita, receitaArrecadadaId: string): Promise<void>;
}

export interface M04Deps {
  /** ⚠️ A porta da AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). Obrigatória — ver `M01Deps`. */
  readonly autz: AutorizacaoPort;
  readonly contas: ContaRepositoryPort;
  readonly classificacao: ReceitaClassificacaoPort;
  readonly receitas: ReceitaRepositoryPort;
  readonly ids: IdPort;
  /** M10 — OPCIONAL. Ausente = nenhuma conta é reservada (ver o port). */
  readonly contasReservadas?: ContaReservadaPort | undefined;
}
