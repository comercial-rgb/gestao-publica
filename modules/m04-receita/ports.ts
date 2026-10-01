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
  /**
   * V16/C30 — resolve VÁRIOS códigos de fonte de uma vez (a guia distribuída).
   *
   * ⚠️ EM LOTE, e não uma chamada por parcela: a recusa precisa NOMEAR TODAS as fontes
   * inexistentes de uma vez. Recusar a primeira e calar as outras faria o operador corrigir o
   * formulário três vezes para descobrir três erros que o sistema já conhecia na primeira.
   *
   * Devolve `codigo -> id` apenas das que existem; quem chama compara com o que pediu.
   */
  resolverFontes(codigos: readonly string[]): Promise<ReadonlyMap<string, string>>;
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
  /** V6 P1.2 — a conta bancária declarada (a anulação copia a da original). */
  readonly contaBancariaId?: string | undefined;
  /**
   * V11 V9 — a ENTIDADE CONTÁBIL titular, DERIVADA do titular vigente da conta declarada.
   *
   * ⚠️ A ANULAÇÃO **HERDA** ESTE CAMPO DA GUIA ORIGINAL, e não o re-deriva pela conta. A conta
   * pode ter trocado de titular entre a arrecadação e a anulação; re-derivar faria o estorno
   * sair de uma entidade e a entrada ter sido de outra, e o líquido por entidade deixaria de
   * fechar nas duas — uma ficaria com um crédito que nunca teve, a outra com um débito que
   * nunca fez.
   */
  readonly entidadeTitularId?: string | undefined;
  /**
   * V16/C30 — A DISTRIBUIÇÃO ENTRE FONTES, quando a guia reparte.
   *
   * Vazia (ou ausente) é a guia de fonte única, que continua sendo a maioria: `fonteId` diz tudo
   * o que há para dizer. Quando vem, ela é gravada NA MESMA TRANSAÇÃO da guia e do lançamento —
   * guia distribuída sem as parcelas seria uma guia cujo número por fonte ninguém pode calcular.
   *
   * ⚠️ A ANULAÇÃO **HERDA** ESTAS PARCELAS DA ORIGINAL, pela mesma razão que herda a entidade
   * titular: `ReceitaReprevista` existe, a previsão da LOA muda, e re-derivar a distribuição no
   * dia do estorno desfaria uma distribuição diferente da que entrou.
   */
  readonly distribuicao?: readonly ParcelaPersistidaDeFonte[] | undefined;
}

/** Uma parcela de fonte como ela é gravada (a fonte já resolvida em id). */
export interface ParcelaPersistidaDeFonte {
  readonly fonteId: string;
  readonly exercicioFonte: number;
  readonly valor: Money;
  /** Snapshot: esta (natureza, fonte, exercício da fonte) estava prevista na LOA no ato. */
  readonly previstaNaLoa: boolean;
  readonly fundamento?: string | undefined;
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
  /** V6 P1.2 */
  readonly contaBancariaId: string | null;
  /** V11 V9 — a entidade titular carimbada nesta guia. É o que a anulação HERDA. */
  readonly entidadeTitularId: string | null;
  /** V16/C30 — as parcelas por fonte desta guia. Vazio = guia de fonte única. A anulação as HERDA. */
  readonly distribuicao: readonly ParcelaPersistidaDeFonte[];
  /** V26 — a guia é a receita de uma retenção própria do Tesouro num pagamento. */
  readonly nascidaDeRetencao: boolean;
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

/**
 * V6 P1.2 — A CONTA BANCÁRIA que a guia declara. O M04 não conhece o M09: resolve por código
 * e recebe só o que precisa conferir — a fonte e a conta contábil mapeada.
 */
export interface ContaBancariaResolvida {
  readonly id: string;
  readonly codigo: string;
  readonly fonteCodigo: string;
  readonly contaContabilCodigo: string | null;
  /**
   * V11 V9 — a ENTIDADE TITULAR VIGENTE desta conta, ou `null` quando o ente ainda não a
   * declarou. É daqui que sai o carimbo da guia.
   *
   * ⚠️ `null` NÃO É ERRO, E NÃO SE PEDE ESCOLHA NA TELA. A guia entra NÃO ATRIBUÍDA, e a
   * consulta a mostra assim, em linha própria. Deixar o operador escolher a entidade na guia
   * criaria duas verdades sobre o mesmo dinheiro — a guia sabendo mais do que a conta em que
   * ele entrou —, e a primeira divergência entre as duas não teria como ser resolvida.
   */
  readonly entidadeTitularId: string | null;
}
export interface ContaBancariaPort {
  buscarPorCodigo(codigo: string): Promise<ContaBancariaResolvida | null>;
  /**
   * ⚠️ V16/C30 — A FONTE TEM DE ESTAR NO **ROL** DA CONTA, e isto conserta um buraco que a ADR
   * previu e a arrecadação não seguiu.
   *
   * `ADR-conta-bancaria-com-varias-fontes` (aceita em 2026-09-10) decidiu que uma conta admite
   * VÁRIAS fontes e que **quem manda no guard é o VÍNCULO**, não a coluna `ContaBancaria.fonteId`
   * (que permanece só como fonte PADRÃO). Cinco sítios passaram a usar
   * `exigirFonteNoRolDaConta` — pagamento, ordem de pagamento, movimentação, dispêndio
   * extraorçamentário e pagamento de restos a pagar. A arrecadação ficou de fora porque, naquela
   * data, ela **não tinha conta bancária**; ela ganhou conta na V6 P1.2 e copiou a comparação
   * ANTIGA (`conta.fonteCodigo !== guia.fonte`).
   *
   * O efeito, medido: uma conta multifonte **não recebia** guia da segunda fonte dela — o caso
   * que a decisão veio permitir. E na guia repartida seria pior: dinheiro carimbado numa fonte
   * que aquela conta não comporta.
   *
   * ⚠️ É PORT E NÃO COMPARAÇÃO LOCAL porque a regra (rol vazio cai para a fonte padrão; fonte
   * fora do rol recusa NOMEANDO as permitidas) mora numa função só, `m05/guard-fonte.ts`, e
   * reescrevê-la aqui seria a sexta cópia — a doença que aquele arquivo existe para curar.
   */
  exigirFonteNoRol(
    contaId: string,
    fonteId: string,
    operacao: string
  ): Promise<void>;
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

  /**
   * V16/C30 — AS FONTES QUE A LOA PREVÊ para esta natureza neste exercício.
   *
   * É o "conforme LOA" do C30, e é o que decide se a parcela precisa da autorização nomeada e do
   * fundamento escrito. Lista vazia significa natureza SEM PREVISÃO NENHUMA — e isso não pede
   * autorização extra: excesso de arrecadação é legítimo (INVARIANTE 5), e barrá-lo pararia a
   * arrecadação para cobrar um cadastro.
   *
   * ⚠️ QUEM CONSULTA É O SERVIÇO, NUNCA O CHAMADOR. Se o `previstaNaLoa` viesse pronto de fora,
   * qualquer caminho poderia declarar `true` e saltar a autorização — a guarda passaria a
   * depender da boa-fé de quem a invoca.
   */
  fontesPrevistas(
    exercicio: number,
    naturezaReceitaId: string
  ): Promise<readonly { readonly fonteId: string; readonly exercicioFonte: number }[]>;
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
  /** V6 P1.2 — OPCIONAL. Sem ele, uma guia que DECLARE conta bancária é recusada nomeando. */
  readonly contasBancarias?: ContaBancariaPort | undefined;
}
