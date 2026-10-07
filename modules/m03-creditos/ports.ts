import type { Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { IdPort } from "../m01-core-contabil/ports.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
import type { ItemCreditoDados, OrigemRecurso, TipoItemCredito } from "./dominio.js";

/**
 * PORTS do M03. Sem Prisma.
 *
 * Como no M05, as operações são GROSSAS: `executarCredito` faz tudo numa
 * transação só (checar saldos pelo SUM real, inserir os itens, inserir os
 * MovimentoDotacao, recalcular os caches). Um decreto que grava metade das
 * pernas seria pior que um decreto que não grava nada.
 */

export interface LeiParaPersistir {
  readonly id: string;
  readonly numero: string;
  readonly ano: number;
  readonly tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly valorAutorizado: Money;
  readonly percentualLimite?: string | undefined;
  readonly dataPublicacao: Date;
  readonly criadoPor: string;
}

export interface DecretoParaPersistir {
  readonly id: string;
  readonly leiId: string;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly origemRecurso: OrigemRecurso;
  readonly criadoPor: string;
}

export interface ExecutarCreditoParams {
  readonly decretoId: string;
  readonly itens: readonly (ItemCreditoDados & { readonly itemId: string })[];
  readonly criadoPor: string;
  /**
   * V36 — o que roda NA MESMA transação, logo depois de travar as fichas e antes de ler o decreto: a efetivação da
   * prévia de alteração orçamentária desbloqueia as anulações, cria o decreto e grava o desfecho aqui, para que o
   * crédito e o desbloqueio sejam um ato só (`modules/m03-creditos/previa.ts`). Ausente no decreto digitado.
   */
  readonly preparar?: ((tx: import("../m05-despesa/adapter-prisma.js").Tx) => Promise<void>) | undefined;
  /**
   * V36 — o que roda NA MESMA transação ANTES de travar as fichas: a efetivação da prévia trava a linha da prévia aqui,
   * na mesma ordem (prévia, depois fichas) de todas as outras operações dela, para que nenhuma se abrace com esta.
   */
  readonly antesDeTravar?: ((tx: import("../m05-despesa/adapter-prisma.js").Tx) => Promise<void>) | undefined;
}

export interface AnularCreditoParams {
  readonly decretoId: string;
  readonly data: Date;
  readonly motivo: string;
  readonly criadoPor: string;
  /** ids dos itens de estorno, um por item vivo do decreto. */
  readonly idsEstorno: readonly string[];
}

export interface EncerrarDecretoParams {
  readonly decretoId: string;
  readonly data: Date;
  readonly motivo: string;
  readonly criadoPor: string;
}

export interface DecretoResumo {
  readonly id: string;
  readonly leiId: string;
  readonly numero: string;
  readonly origemRecurso: OrigemRecurso;
  /** DERIVADO da existência de um DecretoEncerramento. */
  readonly encerrado: boolean;
  readonly itensVivos: readonly {
    readonly id: string;
    readonly fichaId: string;
    readonly tipo: TipoItemCredito;
    readonly valor: Money;
    readonly fonteId: string;
  }[];
}

/** O client OU uma transação dele — o port do superávit lê DENTRO da tx do crédito. */
export type TxDoCredito = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ O SUPERÁVIT FINANCEIRO, DERIVADO DOS FATOS — a amarração que faltava (TR 4.37/4.39).
 *
 * ═══ O PROBLEMA ═══
 * A `DisponibilidadeRecursoNovo` é **declarada**: alguém digita "o superávit da fonte
 * 500 foi 3.000" e o sistema acredita. É a única coisa contra a qual o crédito por
 * recurso novo é validado — e ela **não é conferida contra nada**. Um zero a mais na
 * declaração vira crédito adicional sem lastro, e o orçamento cresce contra um
 * dinheiro que nunca existiu. É exatamente o que o art. 43 § 1º III proíbe.
 *
 * ═══ A INVERSÃO ═══
 * O M03 não sabe (e não deve saber) somar receita, pagamento, retenção e restos por
 * fonte — isso é a aritmética do Anexo 14, e ela já existe. Ele só faz a PERGUNTA:
 * "quanto a fonte F tinha de superávit quando o exercício anterior foi encerrado?".
 * Quem responde é o M12, compondo o MESMO `linhasDoSuperavitPorFonte` que o relatório
 * publica. Zero segunda aritmética; a seta aponta só de m12 → m03, e não há ciclo.
 *
 * ═══ `null` NÃO É ZERO ═══
 * `null` = **não há resposta**: o port não foi ligado, ou o exercício anterior ainda
 * não foi ENCERRADO. Zero = a resposta É zero (a fonte não tem superávit), e aí o
 * guard barra. Confundir os dois transformaria um sistema sem o port ligado num
 * sistema que rejeita todo crédito por superávit.
 *
 * Ausente = **fail-open com log** (precedente do `ContaReservadaPort` do M04): um
 * módulo que não está montado não pode paralisar o ente. Mas fail-open é SÓ na
 * ausência: com o port presente e uma resposta na mão, o guard é fail-closed.
 */
export interface SuperavitFinanceiroPort {
  /**
   * O superávit financeiro da fonte no ENCERRAMENTO de `exercicioAnterior`.
   * `null` = sem encerramento apurado — não há corte contra o que conferir.
   */
  superavitDaFonte(
    tx: TxDoCredito,
    fonteId: string,
    exercicioAnterior: number
  ): Promise<Money | null>;
}

/**
 * ⚠️ O EXCESSO DE ARRECADAÇÃO, DERIVADO DOS FATOS (TR 4.37).
 *
 *   excesso = max(0, arrecadado LÍQUIDO na fonte até a data do fato
 *                    − previsão ATUALIZADA da fonte no exercício)
 *
 * ═══ REALIZADO, NÃO TENDÊNCIA ═══
 * O art. 43 § 3º da Lei 4.320 permite considerar a TENDÊNCIA do exercício (projetar o
 * que ainda vai entrar). Isso está deliberadamente FORA: projetar exige um método
 * oficial (o MBA da STN dá mais de um), e escolher um aqui seria INVENTAR o número que
 * autoriza a despesa. O guard usa o que JÁ ENTROU — é o limite mais apertado, e o
 * único que não depende de uma previsão sobre a previsão. Afrouxar isso é uma decisão
 * de política contábil, não de código: quando o método vier, ele entra AQUI, e o
 * chamador não muda.
 *
 * ═══ `null` = FONTE SEM PREVISÃO CADASTRADA ═══
 * E isso NÃO é excesso zero. Sem previsão, `arrecadado − previsto` não é "tudo é
 * excesso" (seria o número mais generoso possível, saído de um dado que falta) nem
 * "zero" (barraria um ente que simplesmente não cadastrou a LOA da fonte). É DADO
 * AUSENTE: fail-open com log, e a pendência nomeada. Excesso ZERO — arrecadou menos do
 * que previu — é uma RESPOSTA, e ela barra.
 */
export interface ExcessoArrecadacaoPort {
  excessoDaFonte(
    tx: TxDoCredito,
    fonteId: string,
    exercicio: number,
    dataDoFato: Date
  ): Promise<Money | null>;
}

/**
 * ⚠️ A OPERAÇÃO DE CRÉDITO, DERIVADA DOS FATOS (TR 4.37).
 *
 * O teto é o que ENTROU no caixa por empréstimo: o arrecadado líquido na fonte cuja
 * natureza tem ORIGEM `OPERACOES_DE_CREDITO` (o 2º dígito, do classificador de
 * ef6f559). Não é o valor do CONTRATO — um contrato assinado de 10 milhões com 2
 * milhões liberados lastreia 2 milhões, e não 10: o art. 43 § 1º fala do recurso, não
 * da promessa dele.
 *
 * ⚠️ FONTE SEM NENHUMA ARRECADAÇÃO DE 2.1 = **ZERO**, NÃO `null`. A diferença é a
 * mesma de cf765b0: `null` é "não há resposta"; zero é uma resposta — e ela barra.
 * Aqui a resposta EXISTE e é zero: a fonte não recebeu empréstimo nenhum, logo não há
 * o que lastrear. Devolver `null` faria o fail-open liberar crédito por operação de
 * crédito num ente que nunca tomou uma.
 */
export interface OperacaoCreditoPort {
  arrecadadoOperacaoCredito(
    tx: TxDoCredito,
    fonteId: string,
    dataDoFato: Date
  ): Promise<Money | null>;
}

/**
 * As três amarrações do recurso novo. Cada uma é OPCIONAL — ausente = fail-open com
 * log (a disponibilidade segue declarada e não conferida).
 */
export interface PortasDoRecursoNovo {
  readonly superavit?: SuperavitFinanceiroPort | undefined;
  readonly excesso?: ExcessoArrecadacaoPort | undefined;
  readonly operacaoCredito?: OperacaoCreditoPort | undefined;
}

export interface CreditoRepositoryPort {
  criarLei(lei: LeiParaPersistir): Promise<string>;
  criarDecreto(decreto: DecretoParaPersistir): Promise<string>;

  /**
   * TUDO numa transação: teto da lei (SUM real), fonte da ficha, saldo
   * disponível das fichas anuladas (SUM real), disponibilidade da fonte (recurso
   * novo), INSERT dos itens + MovimentoDotacao, e recálculo dos caches.
   */
  executarCredito(params: ExecutarCreditoParams): Promise<readonly string[]>;

  /** Anula o decreto inteiro: itens NOVOS invertidos + movimentos inversos. */
  anularCredito(params: AnularCreditoParams): Promise<readonly string[]>;

  encerrarDecreto(params: EncerrarDecretoParams): Promise<string>;

  buscarDecreto(id: string): Promise<DecretoResumo | null>;

  /** Quanto da lei já foi consumido por decretos VIVOS (SUM real). */
  consumidoDaLei(leiId: string): Promise<Money>;

  /**
   * DECLARA a disponibilidade apurada de uma fonte — uma VERSÃO NOVA, nunca um UPDATE.
   *
   * ⚠️ O QUE ELE CONFERE, E POR QUE DENTRO DA TRANSAÇÃO: uma declaração ABAIXO do que já foi
   * usado deixaria, no mesmo instante, decretos vivos apoiados em recurso que a própria
   * declaração diz não existir. O `usado` é SUM real, lido sob o mesmo lock que o crédito toma —
   * lido fora dele, um decreto concorrente entraria entre a leitura e a gravação.
   */
  declararDisponibilidade(params: DeclararDisponibilidadeParams): Promise<DisponibilidadeDeclarada>;
}

export interface DeclararDisponibilidadeParams {
  readonly exercicio: number;
  readonly fonteId: string;
  readonly origem: "SUPERAVIT_FINANCEIRO" | "EXCESSO_ARRECADACAO" | "OPERACAO_CREDITO";
  readonly valor: Money;
  readonly descricao: string;
  readonly criadoPor: string;
}

export interface DisponibilidadeDeclarada {
  readonly id: string;
  readonly versao: number;
  /** O que a versão ANTERIOR dizia — `null` quando esta é a primeira. */
  readonly anterior: Money | null;
  /** Quanto desta fonte já foi consumido por decretos vivos, no instante da declaração. */
  readonly utilizado: Money;
}

export interface M03Deps {
  /** ⚠️ A porta da AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). Obrigatória — ver `M01Deps`. */
  readonly autz: AutorizacaoPort;
  readonly creditos: CreditoRepositoryPort;
  readonly ids: IdPort;
}
