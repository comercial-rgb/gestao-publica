import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { tipoDeDocumento } from "../../packages/documento/index.js";
import type { CalculoDaRetencaoParaPersistir } from "./retencao.js";
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
  | "ESTORNO_DISPENDIO"
  /** V26 — o saldo de IR/ISS do próprio Tesouro baixado contra a receita, sem saída de banco. */
  | "APROPRIACAO_COMO_RECEITA";

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
  /** V26 — o imposto do próprio Tesouro sai do passivo para a receita: o passivo DIMINUI, sem dinheiro sair. */
  APROPRIACAO_COMO_RECEITA: -1,
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
  /** V26 — o que foi baixado contra a receita (imposto do próprio Tesouro), sem saída de dinheiro. */
  readonly apropriadoComoReceita: Money;
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
    APROPRIACAO_COMO_RECEITA: zero,
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
    apropriadoComoReceita: por.APROPRIACAO_COMO_RECEITA,
    saldo: toMoney(ingressoLiquido.minus(dispendioLiquido).minus(por.APROPRIACAO_COMO_RECEITA)),
  };
}

/** O tipo do estorno de cada movimento. Um estorno não se estorna. */
export function tipoDoEstorno(
  tipo: TipoMovimentoExtra
): "ESTORNO_INGRESSO" | "ESTORNO_DISPENDIO" {
  if (tipo === "INGRESSO") return "ESTORNO_INGRESSO";
  if (tipo === "DISPENDIO") return "ESTORNO_DISPENDIO";
  if (tipo === "APROPRIACAO_COMO_RECEITA") {
    throw new Error(
      "A baixa do imposto do próprio município contra a receita não se estorna por aqui: ela tem uma guia de receita junto. Nada foi gravado."
    );
  }
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
  /**
   * ⚠️ A FONTE DO INGRESSO, e ela PASSOU A SER OBRIGATÓRIA no ENT03c. O dispêndio já a
   * exigia e a conferia contra o rol da conta; o ingresso não — e o resultado é que a
   * caução entrava sem fonte e o saldo por fonte da tesouraria tinha um balde residual.
   * Ver `MovimentoExtraorcamentario.fonteId` no schema.
   */
  fonteId: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  historico: z.string().min(1),
  criadoPor: z.string().min(1),
  /**
   * V23 — o CPF/CNPJ de quem entregou o valor (SAGRES ReceitaExtra §4.19). Opcional no domínio (há
   * chamadores anteriores); a tela o exige. Quando vem, o dígito verificador é conferido.
   */
  documentoDoContribuinte: z.string().trim().min(1).optional(),
});

/**
 * UMA PARCELA DA COMPOSIÇÃO DO RECOLHIMENTO (C34): quanto deste recolhimento quita aquela
 * retenção. A retenção pode ser de exercício ANTERIOR — é justamente o vínculo que o tribunal lê.
 */
export const zParcelaDoRecolhimento = z.object({
  /** O `MovimentoExtraorcamentario` de tipo INGRESSO que esta parcela quita. */
  ingressoId: z.string().min(1),
  valor: zValorPositivo,
});
export type ParcelaDoRecolhimento = z.infer<typeof zParcelaDoRecolhimento>;

export const zRegistrarDispendioExtraInput = z.object({
  tipoConsignacaoId: z.string().min(1),
  credorConsignatario: zCredor,
  contaBancaria: z.string().min(1),
  /** TR 5.23: tem de casar com a fonte da conta bancária. */
  fonteId: z.string().min(1),
  valor: zValorPositivo,
  data: z.coerce.date(),
  historico: z.string().min(1),
  /** V24 — o CPF/CNPJ de quem recebe o recolhimento (SAGRES DespesaExtra §4.20); a tela o exige. */
  documentoDoFavorecido: z.string().trim().min(1).optional(),
  criadoPor: z.string().min(1),
  /**
   * ⚠️ A COMPOSIÇÃO POR ORIGEM (C34), OPCIONAL NO DOMÍNIO E OBRIGATÓRIA NA TELA.
   *
   * Opcional porque há chamadores anteriores a ela — recolhimentos já gravados não têm
   * composição e inventá-la seria escrever suposição no banco. Obrigatória na tela porque, a
   * partir de agora, todo recolhimento feito por alguém tem de dizer o que quita: a consulta de
   * composição NOMEIA os recolhimentos sem alocação em vez de escondê-los num agregado.
   *
   * Quando informada, ela é EXATA: a soma das parcelas tem de ser o valor do recolhimento. Um
   * recolhimento parcialmente alocado seria o pior dos dois mundos — parece conciliado e não é.
   */
  alocacoes: z.array(zParcelaDoRecolhimento).optional(),
});

/** V23 — o motivo do estorno extraorçamentário cabe no leiaute do tribunal (255, uma linha, sem aspas). */
export function exigirMotivoDoEstornoExtra(motivo: string): string {
  const m = motivo.trim();
  if (m.length > 255) {
    throw new Error(
      `O motivo tem ${String(m.length)} caracteres; a prestação de contas ao Tribunal de Contas aceita até 255. ` +
        `Resuma o motivo. Nada foi gravado.`
    );
  }
  if (/[\u0000-\u001f]/.test(m)) throw new Error("Escreva o motivo numa linha só, sem quebra de linha. Nada foi gravado.");
  if (m.includes("'") || m.includes('"')) {
    throw new Error("O motivo não pode ter aspas nem apóstrofo (o arquivo do Tribunal de Contas não aceita). Nada foi gravado.");
  }
  return m;
}

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
  /**
   * V24 — a memória do cálculo (os três tributos, retidos ou não), quando as retenções foram
   * CALCULADAS. Ausente no caminho manual de antes. Gravada na mesma transação do pagamento.
   */
  readonly calculos?: readonly CalculoDaRetencaoParaPersistir[] | undefined;
  /**
   * V26 — AS RETENÇÕES PRÓPRIAS DO TESOURO (IR e ISS do próprio ente): não são consignação. A perna do
   * pagamento credita o CRÉDITO TRIBUTÁRIO (1.1.2.1) que a guia de receita por retenção, na mesma
   * transação, reconhece — o banco sai só pelo líquido. Ausente ou vazio = nenhuma.
   */
  readonly proprias?: readonly RetencaoPropriaParaCompor[] | undefined;
}

/** V26 — os fatos de retenção que podem ser receita própria do Tesouro (CHECK no banco, mesmo rol). */
/**
 * V39-R2 (R2-005, V39-028) — IRRF_PESSOA_FISICA: o IR que o ente retém de fornecedor PESSOA FÍSICA tem identidade
 * própria. Até aqui ele saía gravado como IRRF_FORNECEDOR_PJ (o fato dependia só do tributo), e a classificação (a
 * natureza da receita e as contas) era a da PJ. Agora o fato vem do tributo E do documento do credor no pagamento; a
 * classificação da PF é decisão própria do ente (sem ela, o pagamento é recusado nomeando o cadastro). Os registros
 * antigos ficam como estão: não se reclassifica fato pelo documento de hoje.
 */
export const FATOS_DA_RETENCAO_PROPRIA = ["IRRF_FOLHA", "IRRF_FORNECEDOR_PJ", "IRRF_PESSOA_FISICA", "ISS"] as const;
export type FatoDaRetencaoPropria = (typeof FATOS_DA_RETENCAO_PROPRIA)[number];

/** O rótulo do fato, como o servidor municipal o lê. */
export const ROTULO_DO_FATO_PROPRIO: Readonly<Record<FatoDaRetencaoPropria, string>> = {
  IRRF_FOLHA: "IR retido na folha de pagamento",
  IRRF_FORNECEDOR_PJ: "IR retido de fornecedor pessoa jurídica",
  IRRF_PESSOA_FISICA: "IR retido de fornecedor pessoa física",
  ISS: "ISS retido de prestador de serviço",
};

/**
 * V26 — uma retenção própria, com tudo o que o pagamento e a guia de receita precisam. A classificação
 * (natureza, destinação, contas, titular) foi lida da DECISÃO VIGENTE do ente; nada aqui vem do navegador.
 */
export interface RetencaoPropriaParaCompor {
  readonly fato: FatoDaRetencaoPropria;
  readonly classificacaoId: string;
  readonly valor: Money;
  /** Conta analítica do crédito tributário a receber (1.1.2.1...): a perna do pagamento. */
  readonly contaCredito: string;
  /** Conta analítica da VPA do imposto (4.1.1...): a perna do reconhecimento, na guia. */
  readonly contaVpa: string;
  readonly naturezaReceitaCodigo: string;
  readonly fonteCodigo: string;
  readonly entidadeTitularId: string | null;
  /** Folha: o grupo de empenho cujo IR é retido. */
  readonly grupoDaFolhaId?: string | undefined;
  /** Folha: os contracheques cujo IR este pagamento retém (um por servidor, uma vez). */
  readonly contrachequesDaFolha?: readonly { readonly contrachequeId: string; readonly valor: Money }[] | undefined;
}

/** A família do crédito tributário a receber no PCASP: a perna do pagamento só pode ir para ela. */
export const FAMILIA_DO_CREDITO_TRIBUTARIO = "1.1.2.1.";
/** As famílias da VPA de impostos: sobre a renda (4.1.1.2) e sobre produção e circulação (4.1.1.3). */
export const FAMILIA_DA_VPA_DO_FATO: Readonly<Record<FatoDaRetencaoPropria, string>> = {
  IRRF_FOLHA: "4.1.1.2.",
  IRRF_FORNECEDOR_PJ: "4.1.1.2.",
  IRRF_PESSOA_FISICA: "4.1.1.2.",
  ISS: "4.1.1.3.",
};

/** Os fatos do IR retido de FORNECEDOR (PJ e PF): os que o cálculo do tributo IRRF do pagamento produz. */
export const FATOS_DO_IR_DE_FORNECEDOR: readonly FatoDaRetencaoPropria[] = ["IRRF_FORNECEDOR_PJ", "IRRF_PESSOA_FISICA"];

/**
 * Puro (R2-005): o fato próprio do tributo retido no pagamento de fornecedor. O IR é da PF quando o documento do
 * credor é CPF; da PJ, quando é CNPJ (inclusive alfanumérico) — pelo FORMATO de `packages/documento`, não pelo
 * comprimento. Documento fora dos dois formatos (empenho legado, CPF sem o zero à esquerda) é RECUSADO: não se sabe de
 * quem é o IR, e adivinhar PJ seria gravar a receita na natureza errada. O INSS nunca é próprio.
 */
export function fatoProprioDoTributo(tributo: "IRRF" | "ISS" | "INSS", documentoDoCredor: string): FatoDaRetencaoPropria | null {
  if (tributo === "INSS") return null;
  if (tributo === "ISS") return "ISS";
  const tipo = tipoDeDocumento(documentoDoCredor.replace(/[^0-9A-Za-z]/g, "").toUpperCase());
  if (tipo === "INVALIDO") {
    throw new Error(`O credor tem documento fora do padrão de CPF e de CNPJ (${documentoDoCredor}): não se sabe se o IR retido é de pessoa física ou jurídica. Corrija o credor do empenho. Nada foi gravado.`);
  }
  return tipo === "CPF" ? "IRRF_PESSOA_FISICA" : "IRRF_FORNECEDOR_PJ";
}

/**
 * O que a persistência precisa de uma retenção.
 *
 * ⚠️ A CONTA VEM JUNTO — e ela vem para ser CONFERIDA, não para ser usada. A perna do
 * passivo já foi composta lá em cima, no motor puro, com a conta que o chamador passou.
 * Quem grava confronta essa conta com a do CADASTRO (`TipoConsignacao.contaPassivo`),
 * dentro da transação, e derruba o pagamento inteiro se divergirem.
 *
 * ═══ POR QUE ISSO PRECISA EXISTIR ═══
 * Sem a conferência, `contaConsignacaoAPagar` é um parâmetro livre do chamador: qualquer
 * código que chame `pagar()` — uma rota nova, um worker, um importador — pode fazer o
 * passivo do INSS nascer numa conta de despesa. O lançamento FECHA (é só uma conta
 * credora a mais), o balancete não acusa, e a dívida com o consignatário desaparece do
 * lugar onde alguém a procuraria.
 *
 * Proteger isso só na borda (a porta que monta a tela) não basta: a borda é UMA das
 * entradas. A conferência tem de estar onde toda entrada passa — a transação.
 */
export interface RetencaoParaPersistir {
  readonly tipoConsignacaoId: string;
  readonly credorConsignatario: string;
  readonly valor: Money;
  /** A conta usada na perna de passivo. Conferida contra o cadastro na gravação. */
  readonly contaConsignacaoAPagar: string;
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
  /** V26 — as pernas do crédito tributário das retenções próprias. SEM ficha, como as do passivo. */
  readonly partidasProprias: readonly Partida[];
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
  readonly proprias?: readonly RetencaoPropriaParaCompor[] | undefined;
}): PagamentoComposto {
  const zero = toMoney("0.00");
  const proprias = p.proprias ?? [];

  // CAMINHO DE SEMPRE: sem retenção, o roteiro inteiro recebe o bruto.
  if (p.retencoes.length === 0 && proprias.length === 0) {
    return {
      partidas: comporPartidas(p.valorBruto, p.roteiro),
      partidasPagamento: comporPartidas(p.valorBruto, p.roteiro),
      partidasRetencao: [],
      partidasProprias: [],
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
  const fatos = new Set<string>();
  for (const r of proprias) {
    if (fatos.has(r.fato)) {
      throw new Error(`Retenção própria DUPLICADA no mesmo pagamento (${ROTULO_DO_FATO_PROPRIO[r.fato]}). Some as duas numa só. Nada foi gravado.`);
    }
    fatos.add(r.fato);
    if (!r.valor.greaterThan(0)) {
      throw new Error(`A retenção própria (${ROTULO_DO_FATO_PROPRIO[r.fato]}) tem de ser maior que zero. Nada foi gravado.`);
    }
    // A perna do pagamento extingue o CRÉDITO TRIBUTÁRIO que a guia reconhece — nunca um passivo, nunca o
    // banco. Uma conta fora da família faria o lançamento fechar e o imposto sumir do lugar dele.
    if (!r.contaCredito.startsWith(FAMILIA_DO_CREDITO_TRIBUTARIO)) {
      throw new Error(`A conta ${r.contaCredito} não é de crédito tributário a receber (${FAMILIA_DO_CREDITO_TRIBUTARIO}...): a retenção própria (${ROTULO_DO_FATO_PROPRIO[r.fato]}) não pode sair por ela. Nada foi gravado.`);
    }
    if (!r.contaVpa.startsWith(FAMILIA_DA_VPA_DO_FATO[r.fato])) {
      throw new Error(`A conta ${r.contaVpa} não é da VPA do imposto (${FAMILIA_DA_VPA_DO_FATO[r.fato]}...) para ${ROTULO_DO_FATO_PROPRIO[r.fato]}. Nada foi gravado.`);
    }
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

  const totalRetido = [...retencoes.map((r) => toMoney(r.valor)), ...proprias.map((r) => r.valor)].reduce(
    (acc, v) => toMoney(acc.plus(v)),
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

  // V26 — uma perna por retenção própria, no crédito tributário que a guia de receita reconhece.
  const partidasProprias: readonly Partida[] = proprias.map((r) => ({
    conta: r.contaCredito,
    tipo: "CREDITO",
    subsistema: "PATRIMONIAL",
    valor: r.valor,
  }));

  // O JUIZ é o motor do ledger, sobre o lançamento COMPOSTO final.
  const partidas = validarLancamento([
    ...partidasPagamento,
    ...partidasRetencao,
    ...partidasProprias,
  ]);

  return {
    partidas,
    partidasPagamento,
    partidasRetencao,
    partidasProprias,
    retencoes,
    valorBruto: p.valorBruto,
    totalRetido,
    valorLiquido,
  };
}

/**
 * ═══ A VIGÊNCIA DE UM TIPO DE CONSIGNAÇÃO — UMA REGRA, UM DONO (V11 V8.16) ═══
 *
 * A conta e a situação de um tipo deixaram de ser colunas editáveis na V8.3: passaram a ser um
 * FATO append-only (`DecisaoDoTipoDeConsignacao`). A regra de leitura é uma só — **a decisão
 * vigente manda; sem decisão, valem as colunas antigas** (os tipos que o seed criou antes) — e
 * estava escrita à mão em dois lugares. Faltava no terceiro.
 *
 * ⚠️ E O TERCEIRO ERA O QUE IMPORTAVA: `listarTiposConsignacao`, que é quem a TELA DE PAGAMENTO
 * consulta para compor a perna do passivo. O ente trocava a conta pela tela, a tela de consignações
 * mostrava a conta nova, e o pagamento continuava compondo na conta velha — "Conta sintética não
 * recebe partida", quatro passos adiante, acusando a tela de pagamento. O percurso da cadeia da
 * despesa é quem pegou.
 *
 * Duas leituras com critérios diferentes sobre o mesmo dado sempre divergem; esta função existe
 * para que não haja duas.
 */
export function vigenciaDoTipoDeConsignacao(
  /** As colunas antigas do próprio tipo. */
  legado: { readonly ativo: boolean; readonly contaPassivoCodigo: string | null },
  /** A decisão de maior `criadoEm`, se houver. */
  decisao: { readonly ativo: boolean; readonly contaPassivoCodigo: string | null } | undefined
): { readonly ativo: boolean; readonly contaPassivoCodigo: string | null } {
  if (decisao === undefined) return { ativo: legado.ativo, contaPassivoCodigo: legado.contaPassivoCodigo };
  return { ativo: decisao.ativo, contaPassivoCodigo: decisao.contaPassivoCodigo };
}
