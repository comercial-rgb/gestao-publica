import { sumMoney, toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somaLiquidaEstornaveis } from "../m08-restos-a-pagar/dominio.js";
import { statusDoEmpenho, type StatusEmpenho } from "./dominio.js";
// A aritmética líquida NÃO nasce de novo aqui — ver o cabeçalho de `comoLinha` lá.
import { comoLinha, liquidoDeUmFato } from "./consultas.js";

/**
 * O DOSSIÊ DE UM EMPENHO — origem, liquidações, retenções, pagamentos, anulações,
 * lançamentos e histórico no MESMO contexto.
 *
 * ═══ POR QUE ISTO É UMA CONSULTA DE MÓDULO, E NÃO UMA TELA QUE FAZ SEIS `findMany` ═══
 * A pergunta que o dossiê responde — "o que aconteceu com este empenho?" — atravessa
 * cinco módulos: a dotação (M02), a execução (M05), a retenção (M07), o razão (M01) e a
 * autoria (M16). Montá-la na página significaria a página conhecer a forma da anulação
 * parcial, o sinal do movimento extraorçamentário e a diferença entre o bruto e o líquido
 * do pagamento. A primeira tela que errasse um desses três mostraria dinheiro que não
 * existe — e mostraria com a autoridade de uma tela de conferência.
 *
 * ═══ ⚠️ AS TRÊS ARMADILHAS QUE ESTA CONSULTA EXISTE PARA NÃO CAIR ═══
 *
 * (1) **A CADEIA TEM TRÊS NÍVEIS, NÃO DOIS.** Um fato pode ser original, anulação total
 *     (`estornoDeId`), anulação PARCIAL (`anulacaoParcialDeId`) ou o estorno de uma
 *     anulação parcial (`estornoDeId` apontando para uma parcial). Tratar `estornoDeId`
 *     como "foi anulado" faria o estorno de uma anulação parcial parecer o cancelamento
 *     do empenho inteiro. Quem separa os quatro é `naturezaDoFato`.
 *
 * (2) **O PAGAMENTO TEM DOIS VALORES, E OS DOIS ESTÃO CERTOS.** O `Pagamento.valor` é o
 *     BRUTO — é ele que extingue a obrigação com o fornecedor e é ele que a fila do
 *     art. 141 vê. O que SAI DO CAIXA é o bruto menos as retenções. Mostrar só um dos
 *     dois é o erro que o cenário de aceite do lote persegue: pagar 1.000 retendo 100
 *     tira 900 do banco, e nenhuma tela pode dizer 1.000 ali.
 *
 * (3) **A RETENÇÃO NÃO É EXECUÇÃO ORÇAMENTÁRIA.** Ela entra como
 *     `MovimentoExtraorcamentario` preso ao pagamento, sem ficha. Somá-la ao liquidado ou
 *     ao pago inflaria a despesa do exercício com dinheiro de terceiro.
 *
 * ═══ SÓ LEITURA ═══
 * Nada aqui grava. O dossiê é a conferência — e uma conferência que escreve deixa de ser
 * conferência.
 */

/** O client OU uma transação dele. */
type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * O QUE UM REGISTRO DA CADEIA É — as quatro naturezas, e nenhuma quinta.
 *
 * ⚠️ `ANULACAO_TOTAL` e `ANULACAO_PARCIAL` NÃO são graus da mesma coisa: a total NEGA o
 * fato (ele passa a valer zero), a parcial o REDUZ (ele continua valendo, por menos).
 * É a distinção que `packages/estornaveis` carrega e a razão de as duas colunas serem
 * separadas no schema.
 */
export type NaturezaDoFato =
  | "ORIGINAL"
  | "ANULACAO_TOTAL"
  | "ANULACAO_PARCIAL"
  | "ESTORNO_DE_ANULACAO_PARCIAL";

/** Uma linha da cadeia de um fato da despesa, com a autoria de quem a criou. */
export interface FatoDaCadeia {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly natureza: NaturezaDoFato;
  /** O fato que este anula ou estorna. Nulo no original. */
  readonly refereSeA: string | null;
  readonly lancamentoId: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
}

/** A forma mínima que `naturezaDoFato` precisa ver. */
interface Encadeavel {
  readonly id: string;
  readonly estornoDeId: string | null;
  readonly anulacaoParcialDeId: string | null;
}

/**
 * A natureza de um fato, resolvida contra o CONJUNTO — e o conjunto é necessário.
 *
 * Um `estornoDeId` preenchido não diz, sozinho, se o que se anulou foi o empenho ou uma
 * anulação parcial dele. Só olhando o PAI se sabe. Por isso a função recebe o índice do
 * conjunto inteiro, e não apenas a linha.
 */
function naturezaDoFato(
  x: Encadeavel,
  porId: ReadonlyMap<string, Encadeavel>
): NaturezaDoFato {
  if (x.anulacaoParcialDeId !== null) return "ANULACAO_PARCIAL";
  if (x.estornoDeId !== null) {
    const pai = porId.get(x.estornoDeId);
    return pai !== undefined && pai.anulacaoParcialDeId !== null
      ? "ESTORNO_DE_ANULACAO_PARCIAL"
      : "ANULACAO_TOTAL";
  }
  return "ORIGINAL";
}

/** Uma retenção na fonte, como ela nasceu: dentro de um pagamento. */
export interface RetencaoDoDossie {
  readonly id: string;
  readonly pagamentoId: string;
  readonly tipoCodigo: string;
  readonly tipoDescricao: string;
  readonly credorConsignatario: string;
  readonly valor: Money;
  readonly data: Date;
  /** INGRESSO = retido. ESTORNO_INGRESSO = a retenção foi desfeita. */
  readonly movimento: string;
  readonly estornoDeId: string | null;
  readonly lancamentoId: string;
  readonly criadoPor: string;
}

export interface PagamentoDoDossie {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  /** O BRUTO — o que extingue a obrigação e o que a fila do art. 141 enxerga. */
  readonly valor: Money;
  /** valor − anulações parciais vivas (0,00 se o pagamento foi anulado por inteiro). */
  readonly pagoLiquido: Money;
  /** Σ das retenções VIVAS deste pagamento (ingressos − estornos de ingresso). */
  readonly totalRetido: Money;
  /** valor − totalRetido: o dinheiro que de fato saiu da conta bancária. */
  readonly saidaDeCaixa: Money;
  readonly contaBancaria: string;
  readonly fonteCodigo: string;
  readonly anulado: boolean;
  readonly cadeia: readonly FatoDaCadeia[];
  readonly retencoes: readonly RetencaoDoDossie[];
}

export interface LiquidacaoDoDossie {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  /** valor − anulações parciais vivas. */
  readonly liquidadoLiquido: Money;
  /** Σ dos pagamentos líquidos (BRUTO — é o que quita a obrigação). */
  readonly pago: Money;
  readonly saldoAPagar: Money;
  readonly responsavelAtesto: string;
  readonly notaFiscalNum: string | null;
  readonly notaFiscalSerie: string | null;
  readonly notaFiscalData: Date | null;
  readonly anulado: boolean;
  readonly cadeia: readonly FatoDaCadeia[];
  readonly pagamentos: readonly PagamentoDoDossie[];
}

/** Uma perna do razão, com a conta por extenso — é assim que se confere. */
export interface PartidaDoDossie {
  readonly contaCodigo: string;
  readonly contaTitulo: string;
  readonly tipo: string;
  readonly subsistema: string;
  readonly valor: Money;
  readonly fichaNumero: number | null;
}

/** O total de um subsistema dentro de UM lançamento. ΣD tem de bater com ΣC. */
export interface TotalDoSubsistema {
  readonly subsistema: string;
  readonly debito: Money;
  readonly credito: Money;
  readonly fecha: boolean;
}

export interface LancamentoDoDossie {
  readonly id: string;
  readonly numeroControle: string;
  readonly dataTransacao: Date;
  readonly historico: string;
  readonly origemTipo: string;
  readonly estornoDeId: string | null;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  readonly partidas: readonly PartidaDoDossie[];
  readonly totais: readonly TotalDoSubsistema[];
}

export interface OrigemDoEmpenho {
  readonly fichaId: string;
  readonly fichaNumero: number;
  readonly exercicio: number;
  readonly orgaoCodigo: string;
  readonly orgaoNome: string;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly funcaoCodigo: string;
  readonly funcaoDescricao: string;
  readonly subfuncaoCodigo: string;
  readonly subfuncaoDescricao: string;
  readonly programaCodigo: string;
  readonly programaDescricao: string;
  readonly acaoCodigo: string;
  readonly acaoDescricao: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  /** O cache da ficha HOJE — não o saldo na data do empenho. A tela tem de dizer isso. */
  readonly saldoDisponivelHoje: Money;
  readonly contratoNumero: string | null;
  readonly contratadoNome: string | null;
  readonly obraDescricao: string | null;
}

export interface DossieDoEmpenho {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly tipo: string;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly categoriaOrdemCronologica: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;

  /** O BRUTO da nota de empenho. */
  readonly valor: Money;
  /** valor − anulações vivas. */
  readonly empenhadoLiquido: Money;
  readonly anulacoes: Money;
  readonly liquidado: Money;
  /** Pago BRUTO. */
  readonly pago: Money;
  readonly saldoALiquidar: Money;
  readonly saldoAPagar: Money;
  /** Σ das retenções vivas de todos os pagamentos deste empenho. */
  readonly totalRetido: Money;
  /** pago − totalRetido: o que saiu do caixa por causa deste empenho. */
  readonly saidaDeCaixa: Money;
  readonly anulado: boolean;
  readonly status: StatusEmpenho;

  readonly origem: OrigemDoEmpenho;
  readonly cadeia: readonly FatoDaCadeia[];
  readonly liquidacoes: readonly LiquidacaoDoDossie[];
  readonly lancamentos: readonly LancamentoDoDossie[];
}

/**
 * O DOSSIÊ. Devolve `null` quando o id não é de um empenho ORIGINAL.
 *
 * ⚠️ ABRIR UMA ANULAÇÃO COMO SE FOSSE UM EMPENHO seria mostrar um documento com valor
 * positivo, ficha, credor sentinela e nenhuma liquidação — a cara de um empenho novo. O
 * dossiê recusa e diz qual é o original, para a tela poder levar o usuário até lá.
 */
export async function dossieDoEmpenho(
  prisma: Tx,
  empenhoId: string
): Promise<DossieDoEmpenho | { readonly redirecionarPara: string } | null> {
  const e = await prisma.empenho.findUnique({
    where: { id: empenhoId },
    select: {
      id: true,
      numero: true,
      data: true,
      tipo: true,
      valor: true,
      credorCpfCnpj: true,
      historico: true,
      categoriaOrdemCronologica: true,
      criadoEm: true,
      criadoPor: true,
      lancamentoId: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      contrato: { select: { numeroContrato: true, contratadoNome: true } },
      obra: { select: { descricao: true } },
      ficha: {
        select: {
          id: true,
          numero: true,
          exercicio: true,
          saldoDisponivel: true,
          orgao: { select: { codigo: true, nome: true } },
          unidadeOrc: { select: { codigo: true, descricao: true } },
          funcao: { select: { codigo: true, nome: true } },
          subfuncao: { select: { codigo: true, nome: true } },
          programa: { select: { codigo: true, descricao: true } },
          acao: { select: { codigo: true, descricao: true } },
          naturezaDespesa: { select: { codigoCompleto: true, descricao: true } },
          fonte: { select: { codigo: true, descricao: true } },
        },
      },
    },
  });
  if (e === null) return null;

  // Uma anulação NÃO é um empenho: leva-se o usuário ao original em vez de fingir.
  const paiDaAnulacao = e.anulacaoParcialDeId ?? e.estornoDeId;
  if (paiDaAnulacao !== null) return { redirecionarPara: paiDaAnulacao };

  // ── A CADEIA DO EMPENHO ───────────────────────────────────────────────────
  // Os filhos diretos (anulação total e parcial) e os filhos DELES (o estorno da
  // parcial). Dois níveis abaixo do original: é o que a cadeia real tem.
  const filhos = await prisma.empenho.findMany({
    where: {
      OR: [
        { estornoDeId: e.id },
        { anulacaoParcialDeId: e.id },
        { estornoDe: { anulacaoParcialDeId: e.id } },
      ],
    },
    orderBy: [{ criadoEm: "asc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      lancamentoId: true,
      criadoEm: true,
      criadoPor: true,
    },
  });

  const universoEmpenho = [
    { ...e, valor: e.valor },
    ...filhos,
  ].map(comoLinha);
  const cadeiaEmpenho = montarCadeia(
    [
      {
        id: e.id,
        numero: e.numero,
        data: e.data,
        valor: e.valor,
        estornoDeId: e.estornoDeId,
        anulacaoParcialDeId: e.anulacaoParcialDeId,
        lancamentoId: e.lancamentoId,
        criadoEm: e.criadoEm,
        criadoPor: e.criadoPor,
      },
      ...filhos,
    ]
  );

  const empenhadoLiquido = liquidoDeUmFato(e.id, universoEmpenho);
  const valor = toMoney(e.valor.toFixed(2));
  const anulacoes = valor.minus(empenhadoLiquido);

  // ── LIQUIDAÇÕES, PAGAMENTOS E RETENÇÕES ───────────────────────────────────
  const liqs = await prisma.liquidacao.findMany({
    where: { empenhoId: e.id },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      responsavelAtesto: true,
      notaFiscalNum: true,
      notaFiscalSerie: true,
      notaFiscalData: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      lancamentoId: true,
      criadoEm: true,
      criadoPor: true,
      estornos: { select: { id: true } },
    },
  });

  const universoLiq = liqs.map(comoLinha);
  const liqPorId = new Map(liqs.map((l) => [l.id, l] as const));
  const liqsOriginais = liqs.filter(
    (l) => l.estornoDeId === null && l.anulacaoParcialDeId === null
  );

  const pags = await prisma.pagamento.findMany({
    where: { liquidacao: { empenhoId: e.id } },
    orderBy: [{ data: "asc" }, { numero: "asc" }],
    select: {
      id: true,
      numero: true,
      data: true,
      valor: true,
      contaBancaria: true,
      liquidacaoId: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      lancamentoId: true,
      criadoEm: true,
      criadoPor: true,
      estornos: { select: { id: true } },
      fonte: { select: { codigo: true } },
    },
  });
  const universoPag = pags.map(comoLinha);

  const movimentos = await prisma.movimentoExtraorcamentario.findMany({
    where: { pagamentoId: { in: pags.map((p) => p.id) } },
    orderBy: [{ criadoEm: "asc" }],
    select: {
      id: true,
      pagamentoId: true,
      credorConsignatario: true,
      valor: true,
      data: true,
      tipo: true,
      estornoDeId: true,
      lancamentoId: true,
      criadoPor: true,
      tipoConsignacao: { select: { codigo: true, descricao: true } },
    },
  });

  const retencoesPorPagamento = new Map<string, RetencaoDoDossie[]>();
  for (const m of movimentos) {
    if (m.pagamentoId === null) continue;
    const lista = retencoesPorPagamento.get(m.pagamentoId) ?? [];
    lista.push({
      id: m.id,
      pagamentoId: m.pagamentoId,
      tipoCodigo: m.tipoConsignacao.codigo,
      tipoDescricao: m.tipoConsignacao.descricao,
      credorConsignatario: m.credorConsignatario,
      valor: toMoney(m.valor.toFixed(2)),
      data: m.data,
      movimento: m.tipo,
      estornoDeId: m.estornoDeId,
      lancamentoId: m.lancamentoId,
      criadoPor: m.criadoPor,
    });
    retencoesPorPagamento.set(m.pagamentoId, lista);
  }

  const pagsPorLiquidacao = new Map<string, PagamentoDoDossie[]>();
  const pagsOriginais = pags.filter(
    (p) => p.estornoDeId === null && p.anulacaoParcialDeId === null
  );
  for (const p of pagsOriginais) {
    const retencoes = retencoesPorPagamento.get(p.id) ?? [];
    const totalRetido = retidoVivo(retencoes);
    const bruto = toMoney(p.valor.toFixed(2));
    const lista = pagsPorLiquidacao.get(p.liquidacaoId) ?? [];
    lista.push({
      id: p.id,
      numero: p.numero,
      data: p.data,
      valor: bruto,
      pagoLiquido: liquidoDeUmFato(p.id, universoPag),
      totalRetido,
      saidaDeCaixa: bruto.minus(totalRetido),
      contaBancaria: p.contaBancaria,
      fonteCodigo: p.fonte.codigo,
      anulado: p.estornos.length > 0,
      cadeia: montarCadeia(
        [p, ...pags.filter((x) => x.estornoDeId === p.id || x.anulacaoParcialDeId === p.id)]
      ),
      retencoes,
    });
    pagsPorLiquidacao.set(p.liquidacaoId, lista);
  }

  const liquidacoes: LiquidacaoDoDossie[] = liqsOriginais.map((l) => {
    const pagamentosDaLiq = pagsPorLiquidacao.get(l.id) ?? [];
    // ⚠️ O PAGO da liquidação é o BRUTO — é ele que quita a obrigação. A retenção não
    // reduz o que se deve ao fornecedor; ela troca o CREDOR de parte da dívida.
    const pago = somaLiquidaEstornaveis(
      pags.filter((p) => p.liquidacaoId === l.id).map(comoLinha)
    );
    const liquidadoLiquido = liquidoDeUmFato(l.id, universoLiq);
    return {
      id: l.id,
      numero: l.numero,
      data: l.data,
      valor: toMoney(l.valor.toFixed(2)),
      liquidadoLiquido,
      pago,
      saldoAPagar: liquidadoLiquido.minus(pago),
      responsavelAtesto: l.responsavelAtesto,
      notaFiscalNum: l.notaFiscalNum,
      notaFiscalSerie: l.notaFiscalSerie,
      notaFiscalData: l.notaFiscalData,
      anulado: l.estornos.length > 0,
      cadeia: montarCadeia(
        [l, ...liqs.filter((x) => x.estornoDeId === l.id || x.anulacaoParcialDeId === l.id)]
      ),
      pagamentos: pagamentosDaLiq,
    };
  });

  // ⚠️ ANULADO É A EXISTÊNCIA DO ESTORNO TOTAL, não `empenhadoLiquido == 0`. Um empenho
  // reduzido a zero por anulações PARCIAIS sucessivas continua vivo: ele pode receber uma
  // nova anulação, e o estorno dele ainda não foi emitido.
  const anulado = filhos.some((f) => f.estornoDeId === e.id);

  const liquidado = sumMoney(liquidacoes.map((l) => l.liquidadoLiquido));
  const pago = sumMoney(liquidacoes.map((l) => l.pago));
  const totalRetido = sumMoney(
    liquidacoes.flatMap((l) => l.pagamentos.map((p) => p.totalRetido))
  );

  // ── O RAZÃO DE TODA A CADEIA ──────────────────────────────────────────────
  // Todo fato da despesa é 1-1 com um lançamento; o movimento extraorçamentário
  // COMPARTILHA o lançamento do pagamento que o gerou (a retenção é perna do mesmo
  // ato). O `Set` é o que impede o lançamento composto de aparecer duas vezes.
  const idsDeLancamento = new Set<string>([
    ...cadeiaEmpenho.map((f) => f.lancamentoId),
    ...liqs.map((l) => l.lancamentoId),
    ...pags.map((p) => p.lancamentoId),
    ...movimentos.map((m) => m.lancamentoId),
  ]);
  const lancamentos = await lancamentosComPartidas(prisma, [...idsDeLancamento]);

  return {
    id: e.id,
    numero: e.numero,
    data: e.data,
    tipo: e.tipo,
    credorCpfCnpj: e.credorCpfCnpj,
    historico: e.historico,
    categoriaOrdemCronologica: e.categoriaOrdemCronologica,
    criadoEm: e.criadoEm,
    criadoPor: e.criadoPor,
    valor,
    empenhadoLiquido,
    anulacoes,
    liquidado,
    pago,
    saldoALiquidar: empenhadoLiquido.minus(liquidado),
    saldoAPagar: liquidado.minus(pago),
    totalRetido,
    saidaDeCaixa: pago.minus(totalRetido),
    anulado,
    status: statusDoEmpenho({ empenhado: empenhadoLiquido, liquidado, pago, anulado }),
    origem: {
      fichaId: e.ficha.id,
      fichaNumero: e.ficha.numero,
      exercicio: e.ficha.exercicio,
      orgaoCodigo: e.ficha.orgao.codigo,
      orgaoNome: e.ficha.orgao.nome,
      unidadeCodigo: e.ficha.unidadeOrc.codigo,
      unidadeNome: e.ficha.unidadeOrc.descricao,
      funcaoCodigo: e.ficha.funcao.codigo,
      funcaoDescricao: e.ficha.funcao.nome,
      subfuncaoCodigo: e.ficha.subfuncao.codigo,
      subfuncaoDescricao: e.ficha.subfuncao.nome,
      programaCodigo: e.ficha.programa.codigo,
      programaDescricao: e.ficha.programa.descricao,
      acaoCodigo: e.ficha.acao.codigo,
      acaoDescricao: e.ficha.acao.descricao,
      naturezaCodigo: e.ficha.naturezaDespesa.codigoCompleto,
      naturezaDescricao: e.ficha.naturezaDespesa.descricao,
      fonteCodigo: e.ficha.fonte.codigo,
      fonteDescricao: e.ficha.fonte.descricao,
      saldoDisponivelHoje: toMoney(e.ficha.saldoDisponivel.toFixed(2)),
      contratoNumero: e.contrato?.numeroContrato ?? null,
      contratadoNome: e.contrato?.contratadoNome ?? null,
      obraDescricao: e.obra?.descricao ?? null,
    },
    cadeia: cadeiaEmpenho,
    liquidacoes,
    lancamentos,
  };
}

/**
 * O RETIDO QUE AINDA VALE — ingressos menos estornos de ingresso.
 *
 * ⚠️ NÃO É `Σ valor`. O `MovimentoExtraorcamentario.valor` é SEMPRE positivo; quem dá o
 * sinal é o `tipo`. Somar bruto faria uma retenção estornada CONTAR DUAS VEZES, e a saída
 * de caixa apareceria menor do que foi — exatamente o erro que o estorno do lote persegue
 * na direção oposta.
 */
function retidoVivo(retencoes: readonly RetencaoDoDossie[]): Money {
  let total = toMoney("0.00");
  for (const r of retencoes) {
    if (r.movimento === "INGRESSO") total = total.plus(r.valor);
    else if (r.movimento === "ESTORNO_INGRESSO") total = total.minus(r.valor);
  }
  return total;
}

/** Ordena a cadeia por criação e resolve a natureza de cada linha contra o conjunto. */
function montarCadeia(
  linhas: readonly {
    readonly id: string;
    readonly numero: string;
    readonly data: Date;
    readonly valor: { toFixed: (n: number) => string };
    readonly estornoDeId: string | null;
    readonly anulacaoParcialDeId: string | null;
    readonly lancamentoId: string;
    readonly criadoEm: Date;
    readonly criadoPor: string;
  }[]
): readonly FatoDaCadeia[] {
  const porId = new Map(linhas.map((l) => [l.id, l] as const));
  return [...linhas]
    .sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime())
    .map((l) => ({
      id: l.id,
      numero: l.numero,
      data: l.data,
      valor: toMoney(l.valor.toFixed(2)),
      natureza: naturezaDoFato(l, porId),
      refereSeA: l.anulacaoParcialDeId ?? l.estornoDeId,
      lancamentoId: l.lancamentoId,
      criadoEm: l.criadoEm,
      criadoPor: l.criadoPor,
    }));
}

/** Os lançamentos e as pernas deles, com o total por subsistema já conferido. */
async function lancamentosComPartidas(
  prisma: Tx,
  ids: readonly string[]
): Promise<readonly LancamentoDoDossie[]> {
  if (ids.length === 0) return [];

  const linhas = await prisma.lancamentoContabil.findMany({
    where: { id: { in: [...ids] } },
    orderBy: [{ dataTransacao: "asc" }, { criadoEm: "asc" }],
    select: {
      id: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      origemTipo: true,
      estornoDeId: true,
      criadoEm: true,
      criadoPor: true,
      partidas: {
        orderBy: [{ subsistema: "asc" }, { tipo: "asc" }],
        select: {
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true, nome: true } },
          ficha: { select: { numero: true } },
        },
      },
    },
  });

  return linhas.map((l) => {
    const partidas: PartidaDoDossie[] = l.partidas.map((p) => ({
      contaCodigo: p.conta.codigo,
      contaTitulo: p.conta.nome,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: toMoney(p.valor.toFixed(2)),
      fichaNumero: p.ficha?.numero ?? null,
    }));

    // ⚠️ O FECHAMENTO É POR SUBSISTEMA, NÃO POR LANÇAMENTO. Um lançamento com
    // ΣD == ΣC no total pode ter o orçamentário aberto e o patrimonial compensando —
    // e aí o razão fecha enquanto os dois subsistemas estão errados. Quem valida na
    // gravação é o motor do ledger; aqui a conferência é MOSTRADA, para quem lê poder
    // conferir o que o motor afirmou.
    const subsistemas = [...new Set(partidas.map((p) => p.subsistema))].sort();
    const totais: TotalDoSubsistema[] = subsistemas.map((s) => {
      const debito = sumMoney(
        partidas.filter((p) => p.subsistema === s && p.tipo === "DEBITO").map((p) => p.valor)
      );
      const credito = sumMoney(
        partidas.filter((p) => p.subsistema === s && p.tipo === "CREDITO").map((p) => p.valor)
      );
      return { subsistema: s, debito, credito, fecha: debito.equals(credito) };
    });

    return {
      id: l.id,
      numeroControle: l.numeroControle,
      dataTransacao: l.dataTransacao,
      historico: l.historico,
      origemTipo: l.origemTipo,
      estornoDeId: l.estornoDeId,
      criadoEm: l.criadoEm,
      criadoPor: l.criadoPor,
      partidas,
      totais,
    };
  });
}
