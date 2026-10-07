import type { Money } from "../../packages/contracts/index.js";
import type { LancamentoContabil } from "../../packages/ledger/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { AutorizacaoPort } from "../m16-travamento/porta.js";
// M05 -> M06 (nunca o inverso): quem paga é que precisa respeitar a ordem.
import type { JustificativaQuebraOrdemInput } from "../m06-ordem-cronologica/dominio.js";
// M05 -> M07 (nunca o inverso): quem paga é que retém. Tipo do DOMÍNIO do M07 —
// puro, sem Prisma; a port continua sem conhecer banco.
import type { RetencaoParaPersistir } from "../m07-extraorcamentario/dominio.js";
import type { CalculoDaRetencaoParaPersistir } from "../m07-extraorcamentario/retencao.js";
import type { RetencaoPropriaParaCompor } from "../m07-extraorcamentario/dominio.js";
import type {
  ContaRepositoryPort,
  IdPort,
  PartidaParaPersistir,
} from "../m01-core-contabil/ports.js";
import type {
  CategoriaOrdemCronologica,
  CorteTemporal,
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
  /** V22 — a chave da reserva do numerador (`numerador.ts`), quando o número foi reservado pelo sistema. */
  readonly chaveDoNumero?: string | undefined;
  readonly reservaId?: string | undefined;
  readonly subelementoId?: string | undefined;
  /** M11 — o contrato que esta despesa executa. A anulação o COPIA. */
  readonly contratoId?: string | undefined;
  /** V5 — a ordem de compra da qual este empenho nasce. A anulação a COPIA. */
  readonly ordemDeCompraId?: string | undefined;
  /** M11/M10 (TR 4.49) — a classe de bens que o empenho de capital vai adquirir. */
  readonly classeDeBensId?: string | undefined;
  /** M10 (TR 4.48) — a dívida que este empenho amortiza. */
  readonly dividaId?: string | undefined;
  /** M11 (TR 4.50) — a obra que este empenho executa. Guard UNIDIRECIONAL (elemento 51). */
  readonly obraId?: string | undefined;
  /** M28 (V22) — o convênio que este empenho executa. VOLUNTÁRIO. A anulação o COPIA. */
  readonly convenioId?: string | undefined;
  /** V22 — a campanha publicitária que este empenho custeia. VOLUNTÁRIO. A anulação a COPIA. */
  readonly campanhaPublicitariaId?: string | undefined;
  /** V36 (TR 5.10.1.89) — a parceria público-privada que o empenho executa. VOLUNTÁRIO. A anulação a COPIA. */
  readonly contratoPppId?: string | undefined;
  /** V32 — o precatório que este empenho paga. VOLUNTÁRIO. A anulação o COPIA. */
  readonly precatorioId?: string | undefined;
  /** V22 — a solicitação autorizada de origem. A anulação NÃO a copia (é origem, não dimensão). */
  readonly solicitacaoDeEmpenhoId?: string | undefined;
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
  /** V22 — a chave da reserva do numerador (`numerador.ts`), quando o número foi reservado pelo sistema. */
  readonly chaveDoNumero?: string | undefined;
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

  /**
   * Saldos calculados do SUM REAL dos movimentos (nunca do cache).
   *
   * ⚠️ `corte` É OBRIGATÓRIO. Ver `CorteTemporal` no domínio: competência e registro
   * respondem perguntas diferentes, e não há resposta correta por omissão.
   */
  saldosReais(fichaId: string, corte: CorteTemporal): Promise<SaldosFicha>;

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
  /** V5 — o documento fiscal recebido que lastreia esta liquidação. A anulação o COPIA. */
  readonly documentoFiscalId?: string | undefined;
  /** M11 (ENT03b) — a medição aprovada, quando o empenho tem obra. Ver `zLiquidarInput`. */
  readonly medicaoId?: string | undefined;
  /** V36 (TR 5.10.1.30) — despesa realizada sem empenho prévio (só informação). */
  readonly despesaSemEmpenhoPrevio?: boolean | undefined;
  /**
   * M10 (ENT06 item 2) — AS ENTRADAS NO ALMOXARIFADO desta liquidação.
   *
   * ⚠️ OPCIONAL NO TIPO E OBRIGATÓRIA NO GUARD quando o elemento é de material. O mesmo
   * desenho da `medicaoId`: quem sabe se ela é exigível é o EMPENHO (pela natureza da
   * despesa), e essa leitura é do adapter, dentro da transação. Torná-la obrigatória aqui
   * quebraria toda liquidação de serviço e de custeio, que não têm entrada nenhuma.
   */
  readonly entradasDeMaterial?: readonly EntradaDeMaterialDaLiquidacao[] | undefined;
  /** V7 M2 U3 — as parcelas recebidas do contrato que esta liquidação consome. Ver `zLiquidarInput`. */
  readonly parcelasDoContrato?: readonly { readonly recebimentoDefinitivoId: string; readonly valor: Money }[] | undefined;
  readonly criadoPor: string;
}

export interface PagarParams {
  readonly pagamentoId: string;
  /** V36 (TR 5.10.2.42) — o cheque emitido neste pagamento: número e valor de face (o líquido). */
  readonly cheque?: { readonly numero: string; readonly valor: Money } | undefined;
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
   * M29 (ENT03b · CF art. 100) — A JUSTIFICATIVA DA QUEBRA DA ORDEM **CONSTITUCIONAL**, e ela
   * é SEPARADA da do art. 141.
   *
   * ⚠️ A PRIMEIRA VERSÃO REUSAVA `justificativaQuebraOrdem`, com o argumento de que o
   * pagamento é um ato só e a razão dele é uma. O argumento caiu no primeiro teste: aquele
   * campo exige uma `hipotese` de um ROL FECHADO da Lei 14.133 (emergência/calamidade, ME-EPP
   * em risco, sistemas estruturantes, falência/recuperação, atividade finalística) — e
   * NENHUMA delas cobre os casos do art. 100 (acordo homologado nos autos, sequestro de verba
   * determinado pelo tribunal). Reusar obrigaria o operador a declarar uma hipótese FALSA para
   * conseguir pagar, e a declaração falsa ficaria gravada com a mesma aparência das
   * verdadeiras.
   *
   * ⚠️ SÓ TEXTO, E NÃO UM ROL. O rol das hipóteses de preterição do art. 100 não está
   * modelado — pendência nomeada `PRECATORIO-HIPOTESE-DE-QUEBRA`. Inventá-lo aqui seria
   * fabricar um rol normativo, que é pior que não ter nenhum.
   */
  readonly justificativaOrdemConstitucional?: string | undefined;
  /**
   * T07 — a ordem que autorizou o pagamento. O adapter confere, DENTRO da transação,
   * que ela está AUTORIZADA, é da mesma liquidação, tem o valor exato e ainda não foi
   * consumida. Ausente = pagamento sem ordem (o caminho de sempre).
   */
  readonly ordemDePagamentoId?: string | undefined;
  /**
   * M07 — as retenções na fonte deste pagamento. Os `MovimentoExtraorcamentario`
   * nascem na MESMA transação do pagamento; as pernas de passivo delas já vêm
   * dentro do `lancamento` (composto). Ausente/vazia = pagamento sem retenção.
   */
  readonly retencoes?: readonly RetencaoParaPersistir[] | undefined;
  /** V24 — a memória do cálculo das retenções (os três tributos), quando foram calculadas. */
  readonly calculosDaRetencao?: readonly CalculoDaRetencaoParaPersistir[] | undefined;
  /**
   * V26 — as retenções PRÓPRIAS do Tesouro (IR e ISS do ente): a guia de receita por retenção e o elo nascem
   * na MESMA transação, como ÚLTIMA perna dela. As pernas do crédito tributário já vêm no `lancamento`.
   */
  readonly retencoesProprias?: readonly RetencaoPropriaParaCompor[] | undefined;
}

export interface AnularLiquidacaoParams {
  readonly anulacaoId: string;
  readonly liquidacaoOriginalId: string;
  readonly numero: string;
  readonly data: Date;
  /** V23 — o motivo que a tela exige; gravado em `Liquidacao.motivo` (SAGRES §4.11). */
  readonly motivo: string;
  readonly criadoPor: string;
}

export interface AnularPagamentoParams {
  readonly anulacaoId: string;
  readonly pagamentoOriginalId: string;
  readonly numero: string;
  readonly data: Date;
  /** V21 — o motivo que a tela exige; gravado em `Pagamento.motivo` (SAGRES §4.13). */
  readonly motivo: string;
  readonly criadoPor: string;
}

export interface LiquidacaoResumo {
  readonly id: string;
  readonly empenhoId: string;
  readonly fichaId: string;
  readonly valor: Money;
  readonly lancamentoId: string;
  readonly estornoDeId: string | null;
  /** V33 — a linha da ANULAÇÃO PARCIAL também é uma `Liquidacao`; ela não se paga. */
  readonly anulacaoParcialDeId?: string | null;
  readonly estornos: readonly string[];
  /**
   * V24 — a(s) conta(s) de OBRIGAÇÃO que a liquidação creditou (perna patrimonial credora da classe 2).
   * É ela que o pagamento extingue — e não uma conta escolhida por quem paga.
   */
  readonly obrigacoes: readonly string[];
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

/**
 * A ENTRADA FÍSICA que acompanha a entrada contábil — opcional dentro dela.
 *
 * ⚠️ O EIXO CONTÁBIL BASTA PARA FECHAR A AMARRAÇÃO; o físico é o que dá quantidade, lote e
 * preço médio. Um ente que ainda não controla depósito liquida material com o eixo contábil
 * só, e a conta de estoque continua explicada por um movimento. Exigir o físico aqui
 * impediria de liquidar quem não tem almoxarifado montado.
 */
export interface EntradaFisicaDaLiquidacao {
  readonly materialId: string;
  readonly depositoId: string;
  readonly quantidade: Money;
  readonly valorUnitario: Money;
  readonly unidadeDeMedidaId?: string | undefined;
  readonly loteIdentificacao?: string | undefined;
  readonly loteValidade?: Date | undefined;
  /** V4 (§6): o recebimento da ordem de compra que esta entrada CONSOME (não duplica). */
  readonly recebimentoDeItemId?: string | undefined;
}

/**
 * UMA CLASSE de material abastecida por esta liquidação.
 *
 * ⚠️ É LISTA, E NÃO UM CAMPO — uma nota traz papel e traz toner, e as duas classes contábeis
 * são diferentes. Foi a impossibilidade de exigir a SOMA EXATA com chamadas separadas (uma
 * por classe, cada uma numa transação) que o `MODULO.md` do M10 registrou como furo
 * conhecido: a primeira chamada de 3.000 numa liquidação de 5.000 não tinha como falhar.
 * Com o ato composto, a soma é conferível — e é exigida.
 */
export interface EntradaDeMaterialDaLiquidacao {
  readonly classeDeMaterialId: string;
  readonly valor: Money;
  readonly fisica?: EntradaFisicaDaLiquidacao | undefined;
}

/**
 * A ENTRADA NO ALMOXARIFADO QUE NASCE DA LIQUIDAÇÃO — o espelho do `AoAnularLiquidacaoPort`.
 *
 * ═══ ⚠️ O FURO QUE ELA FECHA, E ELE ESTAVA DECLARADO COMO PENDÊNCIA ═══
 * O rol do M01 manda o elemento 30 (material de consumo) debitar ESTOQUE: a despesa não
 * some, vira ativo. Mas o estoque tem dono — o M10 —, e enquanto liquidar e dar entrada
 * fossem atos SEPARADOS, liquidar material deixaria o razão com estoque que nenhum movimento
 * explica. `conferirAlmoxarifadoContraRazao` passaria a acusar divergência para sempre.
 *
 * A porta recusava, com a pendência `LIQUIDACAO-MATERIAL-ALMOXARIFADO` nomeada — e recusar
 * era o certo enquanto o ato não fosse um só. Este port é o ato virando um só: o M05 não
 * sabe o que é um almoxarifado, e não precisa; ele avisa "esta liquidação é de material, e
 * estas são as classes", dentro da MESMA transação.
 *
 * ⚠️ E AQUI ELE É FAIL-CLOSED, AO CONTRÁRIO DO PORT DA ANULAÇÃO. Lá, port ausente é
 * fail-open e está certo: um módulo ausente não pode travar o M05, e a amarração segue como
 * rede de fundo. Aqui, port ausente com elemento 30 significaria gravar exatamente o furo
 * que a pendência existe para impedir. Quem liquida material sem o M10 ligado é recusado.
 */
export interface AoLiquidarMaterialPort {
  /**
   * Registra, na transação da liquidação, as entradas de almoxarifado dela.
   *
   * A soma das entradas TEM de igualar o valor liquidado — é a exigência que só o ato
   * composto torna possível.
   */
  aoLiquidarMaterial(
    tx: TxDaDespesa,
    p: {
      readonly liquidacaoId: string;
      readonly valorDaLiquidacao: Money;
      readonly dataMovimento: Date;
      readonly entradas: readonly EntradaDeMaterialDaLiquidacao[];
      readonly criadoPor: string;
    }
  ): Promise<void>;
}

export interface M05Deps {
  /** ⚠️ A porta da AUTORIZAÇÃO (M16 · TR 4.56 · 6.4/6.5). Obrigatória — ver `M01Deps`. */
  readonly autz: AutorizacaoPort;
  readonly contas: ContaRepositoryPort;
  readonly despesa: DespesaRepositoryPort;
  readonly ids: IdPort;
}
