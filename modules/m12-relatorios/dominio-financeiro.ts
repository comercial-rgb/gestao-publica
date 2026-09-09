import { toMoney, type Money } from "../../packages/contracts/index.js";
import { serializar, type Dinheiro } from "./dominio.js";

/**
 * DOMAIN do ANEXO 13 — BALANÇO FINANCEIRO (Lei 4.320/64). SEM I/O.
 *
 * ═══ O QUE ESTE DEMONSTRATIVO É ═══
 * O Anexo 12 conta a execução do ORÇAMENTO (empenhado, liquidado, pago). Este
 * conta o CAIXA: o que entrou, o que saiu, e o que sobrou. São perguntas
 * diferentes, e é por isso que os dois usam números diferentes para o MESMO fato.
 *
 * ═══ A RETENÇÃO É A PONTE ENTRE OS DOIS (e é aqui que se vê) ═══
 * Um pagamento de 6.000 com 500 retidos de INSS:
 *   - Anexo 12 (despesa): 6.000 — o BRUTO. A despesa executada é o valor cheio.
 *   - Anexo 13 (caixa):   5.500 saíram do banco, e 500 ENTRARAM como depósito
 *                         restituível (o dinheiro do INSS ficou no caixa do ente).
 * O mesmo 500, contado UMA VEZ em cada demonstrativo, com sinais opostos. Se o
 * Anexo 12 publicasse o líquido, ou se o Anexo 13 esquecesse o ingresso
 * extraorçamentário, os dois deixariam de fechar — e um deles estaria mentindo.
 *
 * ═══ A AMARRAÇÃO ═══
 * TOTAL DOS INGRESSOS == TOTAL DOS DISPÊNDIOS, e o SALDO PARA O EXERCÍCIO
 * SEGUINTE é a linha de equilíbrio:
 *
 *   saldoSeguinte = saldoAnterior + ingressos − dispêndios
 *
 * Mas fechar por construção não prova NADA — qualquer conta fecha se você define a
 * última linha como "o que falta". Por isso o serviço CONFERE o saldo derivado
 * contra o CAIXA REAL apurado pelas partidas do razão (as contas de
 * disponibilidade), e LANÇA se divergir. É essa conferência que faz o
 * demonstrativo valer alguma coisa.
 */

export type NivelLinhaFinanceira =
  | "GRUPO"
  | "FONTE"
  | "ITEM"
  | "EQUILIBRIO"
  | "TOTAL";

export interface LinhaFinanceira {
  /** Código da fonte (ex.: "500"). `null` nas linhas de grupo/item. */
  readonly codigo: string | null;
  readonly rotulo: string;
  readonly nivel: NivelLinhaFinanceira;
  readonly valor: Dinheiro;
}

export interface SaldoEmEspecie {
  /** Caixa apurado pelas partidas no ENCERRAMENTO do exercício anterior. */
  readonly anterior: Dinheiro;
  /** DERIVADO: anterior + ingressos − dispêndios. É a linha de equilíbrio. */
  readonly seguinte: Dinheiro;
  /** O caixa REAL, somado das partidas de disponibilidade do razão. */
  readonly apuradoPelasPartidas: Dinheiro;
}

export interface BalancoFinanceiro {
  readonly anexo: "ANEXO 13 — BALANÇO FINANCEIRO";
  readonly exercicio: number;
  readonly parcial: boolean;
  readonly ingressos: readonly LinhaFinanceira[];
  readonly dispendios: readonly LinhaFinanceira[];
  readonly totalIngressos: Dinheiro;
  readonly totalDispendios: Dinheiro;
  readonly saldoEmEspecie: SaldoEmEspecie;
}

/** Uma linha por fonte, derivada do banco. */
export interface FatoPorFonte {
  readonly codigo: string;
  readonly rotulo: string;
  readonly valor: Money;
}

export interface FatosBalancoFinanceiro {
  readonly exercicio: number;
  readonly parcial: boolean;

  // INGRESSOS
  /** Receita orçamentária ARRECADADA (líquida de anulações), por fonte. */
  readonly receitasPorFonte: readonly FatoPorFonte[];
  /** Inscrição de RP no encerramento DESTE exercício. */
  readonly inscricaoRestosNaoProcessados: Money;
  readonly inscricaoRestosProcessados: Money;
  /** M07: INGRESSO − ESTORNO_INGRESSO no exercício (retenções e cauções). */
  readonly depositosRecebidos: Money;

  // DISPÊNDIOS
  /** Despesa EMPENHADA (líquida de anulações), por fonte. */
  readonly despesasPorFonte: readonly FatoPorFonte[];
  /** Pagamentos, NESTE exercício, de RP inscritos em exercícios anteriores. */
  readonly pagamentoRestosNaoProcessados: Money;
  readonly pagamentoRestosProcessados: Money;
  /** M07: DISPENDIO − ESTORNO_DISPENDIO no exercício (repasses e devoluções). */
  readonly depositosPagos: Money;

  // CAIXA
  readonly saldoAnterior: Money;
  /** O caixa REAL no fim da janela, somado das partidas. A prova dos nove. */
  readonly caixaApurado: Money;
}

const zero = () => toMoney("0.00");
const soma = (a: Money, b: Money) => toMoney(a.plus(b));
const sub = (a: Money, b: Money) => toMoney(a.minus(b));

function linha(
  codigo: string | null,
  rotulo: string,
  nivel: NivelLinhaFinanceira,
  valor: Money
): LinhaFinanceira {
  return { codigo, rotulo, nivel, valor: serializar(valor) };
}

function somaFontes(fontes: readonly FatoPorFonte[]): Money {
  return fontes.reduce((acc, f) => soma(acc, f.valor), zero());
}

/**
 * Monta o Anexo 13. PURA — a mesma função serve o banco e o teste.
 *
 * FAIL-CLOSED em dois pontos:
 *  1. o saldo derivado tem de bater com o caixa apurado pelas partidas;
 *  2. os dois totais têm de se igualar.
 * Qualquer um dos dois falhando, o demonstrativo NÃO SAI.
 */
export function montarBalancoFinanceiro(
  f: FatosBalancoFinanceiro
): BalancoFinanceiro {
  // ── INGRESSOS ────────────────────────────────────────────────────────────
  const receitaTotal = somaFontes(f.receitasPorFonte);

  // Linha do layout, hoje SEMPRE zero: o modelo não tem transferência financeira
  // entre órgãos/entidades do mesmo ente (não há model para ela). A linha existe
  // porque o layout a tem — ver PENDÊNCIA no MODULO.md. Zerada, não omitida.
  const transferenciasRecebidas = zero();

  const extraRecebidos = soma(
    soma(f.inscricaoRestosNaoProcessados, f.inscricaoRestosProcessados),
    f.depositosRecebidos
  );
  const outrosRecebimentos = zero();

  const ingressos: LinhaFinanceira[] = [
    linha(null, "RECEITAS ORÇAMENTÁRIAS", "GRUPO", receitaTotal),
    ...f.receitasPorFonte.map((x) => linha(x.codigo, x.rotulo, "FONTE", x.valor)),
    linha(
      null,
      "TRANSFERÊNCIAS FINANCEIRAS RECEBIDAS",
      "GRUPO",
      transferenciasRecebidas
    ),
    linha(
      null,
      "RECEBIMENTOS EXTRAORÇAMENTÁRIOS",
      "GRUPO",
      soma(extraRecebidos, outrosRecebimentos)
    ),
    // A INSCRIÇÃO de RP é ingresso extraorçamentário: a despesa foi empenhada
    // (e já saiu do Anexo 12 pela empenhada), mas o dinheiro NÃO saiu do caixa —
    // ele ficou, comprometido com o credor. Sem esta linha o balanço não fecha.
    linha(
      null,
      "Inscrição de Restos a Pagar Não Processados",
      "ITEM",
      f.inscricaoRestosNaoProcessados
    ),
    linha(
      null,
      "Inscrição de Restos a Pagar Processados",
      "ITEM",
      f.inscricaoRestosProcessados
    ),
    // M07: o dinheiro de terceiro que ENTROU (retenção na fonte, caução).
    linha(
      null,
      "Depósitos Restituíveis e Valores Vinculados",
      "ITEM",
      f.depositosRecebidos
    ),
    linha(null, "Outros Recebimentos Extraorçamentários", "ITEM", outrosRecebimentos),
    linha(null, "SALDO EM ESPÉCIE DO EXERCÍCIO ANTERIOR", "GRUPO", f.saldoAnterior),
  ];

  const totalIngressos = soma(
    soma(soma(receitaTotal, transferenciasRecebidas), extraRecebidos),
    soma(outrosRecebimentos, f.saldoAnterior)
  );

  // ── DISPÊNDIOS ───────────────────────────────────────────────────────────
  // PELA EMPENHADA — não pela paga. É o empenho que consome o crédito, e o que
  // dele não virou caixa vira RESTO A PAGAR (que entrou nos ingressos acima).
  // A identidade que faz o balanço fechar:
  //   empenhado = pago em caixa + retido + inscrito em RP
  const despesaTotal = somaFontes(f.despesasPorFonte);
  const transferenciasConcedidas = zero();

  const extraPagos = soma(
    soma(f.pagamentoRestosNaoProcessados, f.pagamentoRestosProcessados),
    f.depositosPagos
  );
  const outrosPagamentos = zero();

  const dispendiosSemSaldo = soma(
    soma(despesaTotal, transferenciasConcedidas),
    soma(extraPagos, outrosPagamentos)
  );

  // A LINHA DE EQUILÍBRIO.
  const saldoSeguinte = sub(totalIngressos, dispendiosSemSaldo);

  const dispendios: LinhaFinanceira[] = [
    linha(null, "DESPESAS ORÇAMENTÁRIAS", "GRUPO", despesaTotal),
    ...f.despesasPorFonte.map((x) => linha(x.codigo, x.rotulo, "FONTE", x.valor)),
    linha(
      null,
      "TRANSFERÊNCIAS FINANCEIRAS CONCEDIDAS",
      "GRUPO",
      transferenciasConcedidas
    ),
    linha(
      null,
      "PAGAMENTOS EXTRAORÇAMENTÁRIOS",
      "GRUPO",
      soma(extraPagos, outrosPagamentos)
    ),
    linha(
      null,
      "Pagamento de Restos a Pagar Não Processados",
      "ITEM",
      f.pagamentoRestosNaoProcessados
    ),
    linha(
      null,
      "Pagamento de Restos a Pagar Processados",
      "ITEM",
      f.pagamentoRestosProcessados
    ),
    // M07: o dinheiro de terceiro que SAIU (repasse ao consignatário, devolução
    // de caução). Simétrico do ingresso — e é essa simetria que o teste prova.
    linha(
      null,
      "Depósitos Restituíveis e Valores Vinculados",
      "ITEM",
      f.depositosPagos
    ),
    linha(null, "Outros Pagamentos Extraorçamentários", "ITEM", outrosPagamentos),
    linha(
      null,
      "SALDO EM ESPÉCIE PARA O EXERCÍCIO SEGUINTE",
      "EQUILIBRIO",
      saldoSeguinte
    ),
  ];

  const totalDispendios = soma(dispendiosSemSaldo, saldoSeguinte);

  // ═══ A CONFERÊNCIA QUE DÁ SENTIDO AO RESTO ═══
  // O saldo seguinte é DERIVADO (anterior + ingressos − dispêndios). Fechar por
  // construção não prova nada: qualquer conta fecha se a última linha for "o que
  // falta". A prova é bater com o CAIXA REAL do razão — as partidas nas contas de
  // disponibilidade. Se divergir, ou o demonstrativo esqueceu um fluxo, ou o razão
  // tem lançamento que ninguém explicou. Nos dois casos, o Anexo 13 NÃO SAI.
  if (!saldoSeguinte.equals(f.caixaApurado)) {
    throw new Error(
      `Anexo 13 NÃO FECHA CONTRA O CAIXA: o saldo derivado é ` +
        `${serializar(saldoSeguinte)} (anterior ${serializar(f.saldoAnterior)} + ` +
        `ingressos ${serializar(totalIngressos)} − dispêndios ` +
        `${serializar(dispendiosSemSaldo)}), mas o caixa apurado pelas partidas ` +
        `de disponibilidade é ${serializar(f.caixaApurado)} — diferença de ` +
        `${serializar(sub(saldoSeguinte, f.caixaApurado))}. Ou falta um fluxo no ` +
        `demonstrativo, ou há lançamento em conta de caixa que nenhum fluxo ` +
        `explica. O balanço financeiro não sai enquanto os dois não baterem.`
    );
  }

  // Redundante por construção — e é DE PROPÓSITO: se algum dia uma linha nova
  // entrar num total e esquecer o outro, é aqui que aparece.
  if (!totalIngressos.equals(totalDispendios)) {
    throw new Error(
      `Anexo 13 NÃO FECHA: ingressos ${serializar(totalIngressos)} != dispêndios ` +
        `${serializar(totalDispendios)}.`
    );
  }

  return {
    anexo: "ANEXO 13 — BALANÇO FINANCEIRO",
    exercicio: f.exercicio,
    parcial: f.parcial,
    ingressos,
    dispendios,
    totalIngressos: serializar(totalIngressos),
    totalDispendios: serializar(totalDispendios),
    saldoEmEspecie: {
      anterior: serializar(f.saldoAnterior),
      seguinte: serializar(saldoSeguinte),
      apuradoPelasPartidas: serializar(f.caixaApurado),
    },
  };
}
