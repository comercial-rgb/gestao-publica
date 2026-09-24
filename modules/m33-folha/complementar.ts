import { Decimal, sumMoney, toMoney, type Money } from "../../packages/contracts/index.js";
import {
  sha256Canonico,
  type ContrachequeCalculado,
  type LinhaCalculada,
  type NaturezaDaRubrica,
  type TipoDeRubrica,
} from "./dominio.js";

/**
 * ═══ M33 — A FOLHA MENSAL COMPLEMENTAR (V11 V9.4, TR 5.12.50) ═══
 *
 * "Pagar o que faltou" numa competência cuja folha MENSAL já FECHOU. Domínio PURO: nada aqui lê
 * banco, nada aqui grava.
 *
 * ⚠️ ELA NÃO É A RETIFICAÇÃO, E A DISTÂNCIA ENTRE AS DUAS É O DESENHO INTEIRO.
 * "Corrigir maio" e "pagar o que faltou em maio" são coisas diferentes:
 *
 *   · a RETIFICAÇÃO substituiria o cálculo fechado de maio por outro — e isso exige reabrir o que
 *     este módulo declara irreversível nas duas pontas (`calcularFolha` recusa folha fechada e
 *     `cancelarCalculoDaFolha` recusa o cálculo que fechou). Continua não existindo, e continua
 *     nomeada: `RETIFICACAO-DA-FOLHA`;
 *   · a COMPLEMENTAR não toca em maio. Ela recalcula a competência com o cadastro de HOJE, subtrai
 *     o que as folhas fechadas daquela competência JÁ apuraram, e paga a DIFERENÇA como fato novo,
 *     numa folha própria, com contracheque próprio e memória própria. O contracheque de maio
 *     continua byte a byte como estava, e é isso que a torna possível sem reabrir nada.
 *
 * ⚠️ O DELTA É POR RUBRICA, NÃO POR TOTAL, e a razão é operacional, não estética. Um total pagaria
 * a diferença sem dizer de QUE verba ela é: o empenho não saberia em qual grupo (portanto em qual
 * ficha) ela entra, a contribuição patronal não saberia se incide, e o servidor receberia uma
 * linha "diferença" que nenhuma memória explica. O grupo de empenho é "quais RUBRICAS, em qual
 * ficha" — sem a rubrica, a apropriação não tem o que agrupar.
 *
 * ⚠️ CONTRIBUIÇÃO E IMPOSTO TAMBÉM SÃO DELTA, e isso é consequência da mesma regra, não exceção a
 * ela: o motor mensal recalcula os dois sobre a base CORRIGIDA (progressiva, com teto, com
 * agregação por pessoa), e o que a complementar retém é o que falta reter. Reter de novo o cheio
 * cobraria duas vezes; não reter nada deixaria a diferença sem imposto.
 *   ⚠️ LIMITE DECLARADO, e ele é normativo: isto é REGIME DE COMPETÊNCIA — a diferença de maio é
 *   tributada como se tivesse sido paga em maio. A regra federal de rendimento recebido
 *   acumuladamente (regime de caixa, tributação no mês do pagamento) NÃO foi levantada e não está
 *   implementada; o item 5.12.50 a enumera como "rendimentos acumulados", que é TIPO PRÓPRIO de
 *   folha e continua ausente. Fica nomeado como `IRRF-DO-COMPLEMENTAR-EM-REGIME-DE-CAIXA` e a
 *   memória de todo contracheque complementar DIZ por escrito qual dos dois foi aplicado, em vez
 *   de deixar o servidor deduzir do silêncio.
 */

const m = (v: Money | Decimal): string => v.toFixed(2);

export const VERSAO_DO_MOTOR_COMPLEMENTAR = "m33-complementar-1";

/**
 * A regra de tributação que este motor aplica, ESCRITA na memória de todo contracheque.
 *
 * ⚠️ UMA CONSTANTE E NÃO UMA FRASE SOLTA porque ela vai ao `sha256` canônico: o dia em que alguém
 * implementar o regime de caixa, o digesto dos contracheques NOVOS muda e os antigos continuam
 * dizendo, verificavelmente, sob que regra foram apurados.
 */
export const REGIME_DE_TRIBUTACAO_DA_COMPLEMENTAR =
  "REGIME DE COMPETENCIA: contribuicao e IRRF recalculados sobre a base corrigida da propria " +
  "competencia, e retido o que falta reter. NAO e o regime de caixa dos rendimentos recebidos " +
  "acumuladamente (tributacao no mes do pagamento), que e tipo proprio de folha (5.12.50) e nao " +
  "existe neste sistema.";

/** Uma parcela do que já foi apurado: de que folha, de que cálculo, quanto. */
export interface ParcelaDoJaApurado {
  readonly folhaTipo: string;
  readonly competencia: string;
  readonly calculoNumero: number;
  readonly valor: Money;
}

/** O que as folhas FECHADAS da competência já apuraram numa rubrica, para um vínculo. */
export interface ApuracaoAnteriorDaRubrica {
  readonly total: Money;
  /**
   * ⚠️ AS PARCELAS VÃO À MEMÓRIA, NUNCA SÓ O TOTAL. Esta rodada inteira foi sobre memória que
   * afirma o que não verificou: "já apurado 1.000,00" é indistinguível de um número inventado se
   * o documento não disser de QUE folha e de QUE cálculo ele saiu. O servidor confere o próprio
   * pagamento por este documento, e ele vai lacrado em sha256.
   */
  readonly parcelas: readonly ParcelaDoJaApurado[];
}

/** A identidade de uma rubrica — o bastante para nomeá-la numa recusa e para gravar a linha. */
export interface IdentidadeDaRubrica {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
  readonly tipo: TipoDeRubrica;
  readonly natureza: NaturezaDaRubrica;
  readonly ordem: number;
}

export interface EntradaDaComplementar {
  readonly competencia: string;
  readonly matricula: string;
  /**
   * O contracheque CORRETO da competência, recalculado AGORA pelo motor mensal — o mesmo
   * `calcularContracheque`, com a mesma agregação por pessoa. Não há motor novo aqui: a
   * complementar é aritmética sobre o motor que já existe.
   */
  readonly correto: ContrachequeCalculado;
  /** O já apurado, por `rubricaId`. Rubrica ausente do mapa = nada apurado nela. */
  readonly jaApurado: ReadonlyMap<string, ApuracaoAnteriorDaRubrica>;
  /**
   * Identidade de toda rubrica citada — inclusive as que aparecem SÓ no já apurado. Sem isto uma
   * rubrica paga em maio e removida do cadastro depois seria recusada por `id`, e o operador
   * receberia um cuid em vez de um código.
   */
  readonly identidadeDaRubrica: ReadonlyMap<string, IdentidadeDaRubrica>;
}

/**
 * ⚠️ O MURO: DIFERENÇA NEGATIVA É RECUSA, NUNCA CRÉDITO E NUNCA ZERO.
 *
 * É o mesmo muro de `ABATIMENTO-MAIOR-QUE-O-13` e o mesmo que `planoDoGrupo` (`encargos.ts`)
 * enuncia em prosa: *"nunca um clamp silencioso a zero, nunca um empenho negativo"*. Se o correto
 * é MENOR que o já apurado, o ente pagou a mais — e isso não é assunto de uma folha que se chama
 * "pagar o que faltou":
 *
 *   · num PROVENTO, o servidor recebeu a mais e deve ao erário. Reposição é ato próprio, com rito
 *     próprio, e não existe aqui;
 *   · num DESCONTO, o ente reteve a MENOS do que devia — reter agora a diferença que falta é o
 *     caso normal e passa. O caso recusado é o inverso: o correto ser menor, isto é, ter-se
 *     retido a MAIS em maio. Devolver desconto indevido também é ato próprio.
 *
 * Em nenhum dos dois a saída é seguir com zero: um clamp faria a complementar pagar a diferença
 * das outras rubricas e calar sobre a que não fecha, com os totais batendo.
 */
export class DiferencaNegativaNaComplementarError extends Error {
  constructor(
    matricula: string,
    rubrica: IdentidadeDaRubrica,
    competencia: string,
    correto: Money,
    jaApurado: Money
  ) {
    const oQueSeria =
      rubrica.tipo === "PROVENTO"
        ? `O servidor RECEBEU A MAIS: isso é valor a repor ao erário, que é ato próprio, com rito próprio, e não existe neste sistema.`
        : `O ente RETEVE A MAIS: devolver desconto indevido é ato próprio e não existe neste sistema.`;
    super(
      `COMPLEMENTAR-COM-DIFERENCA-NEGATIVA: na competência ${competencia}, a matrícula ${matricula} ` +
        `tem ${m(correto)} de correto na rubrica ${rubrica.codigo} (${rubrica.descricao}) e ` +
        `${m(jaApurado)} já apurados em folha fechada — diferença de ${m(toMoney(correto.minus(jaApurado)))}. ` +
        `${oQueSeria} ` +
        `A folha mensal COMPLEMENTAR paga o que faltou; ela não cobra de volta, não credita negativo e ` +
        `não segue abatendo zero — seguir com zero pagaria as outras rubricas e calaria sobre esta, com ` +
        `os totais fechando. Trate esta matrícula fora desta folha. Nada foi calculado.`
    );
    this.name = "DiferencaNegativaNaComplementarError";
  }
}

/** O que a complementar produziu para um vínculo — ou `null` quando não há diferença nenhuma. */
export interface ContrachequeComplementar extends ContrachequeCalculado {
  /** Quantas rubricas de fato têm diferença (as de delta zero não viram linha). */
  readonly rubricasComDiferenca: number;
}

/**
 * O CONTRACHEQUE COMPLEMENTAR DE UM VÍNCULO — a diferença, rubrica a rubrica.
 *
 * Ordem:
 *   1. a UNIÃO das rubricas: as do recálculo correto MAIS as que só existem no já apurado. Iterar
 *      só pelo correto deixaria passar, em silêncio, uma rubrica paga em maio e que hoje não é mais
 *      devida — exatamente o caso que tem de RECUSAR;
 *   2. delta = correto − já apurado, por rubrica. Negativo recusa nomeando a matrícula e a rubrica;
 *   3. delta ZERO não vira linha. Uma linha de 0,00 no contracheque diria "esta rubrica foi paga
 *      agora, no valor de zero", que é falso: ela foi paga em maio, por inteiro;
 *   4. nenhum delta ⇒ `null`. Contracheque de zero não é contracheque: é contracheque que não
 *      existe, e gravá-lo faria a lista de quem recebeu complementar mentir. (Mesma decisão do
 *      13º com zero avo.)
 *
 * ⚠️ `contribuicao`, `irrf` e `salarioFamilia` SÃO OS DO RECÁLCULO INTEGRAL, e não deltas. Eles
 * existem para EXPLICAR (faixas percorridas, teto, cenário do IRRF) a conta de onde o delta saiu;
 * quem carrega o delta é `totais`. Estão documentados aqui porque um leitor que somasse
 * `contribuicao.valor` dos contracheques complementares acharia a contribuição do mês inteiro.
 */
export function calcularContrachequeComplementar(e: EntradaDaComplementar): ContrachequeComplementar | null {
  const idsDoCorreto = e.correto.linhas.map((l) => l.rubricaId);
  const idsSoNoApurado = [...e.jaApurado.keys()].filter((id) => !idsDoCorreto.includes(id));
  const todosOsIds = [...idsDoCorreto, ...idsSoNoApurado];

  const linhaPorId = new Map<string, LinhaCalculada>(e.correto.linhas.map((l) => [l.rubricaId, l]));

  const linhas: LinhaCalculada[] = [];
  const detalhe: Record<string, unknown>[] = [];

  for (const rubricaId of todosOsIds) {
    const doCorreto = linhaPorId.get(rubricaId) ?? null;
    const anterior = e.jaApurado.get(rubricaId) ?? null;
    const identidade = e.identidadeDaRubrica.get(rubricaId);
    if (identidade === undefined) {
      /**
       * ⚠️ FAIL-CLOSED, E NÃO "PULA ESTA RUBRICA". Uma rubrica sem identidade é o serviço tendo
       * deixado de montar o mapa — e pular produziria um complementar a MENOS, com os totais
       * fechando. Este repositório já pagou três defeitos dessa família neste módulo.
       */
      throw new Error(
        `COMPLEMENTAR-RUBRICA-SEM-IDENTIDADE: a rubrica ${rubricaId} aparece no cálculo de ` +
          `${e.competencia} da matrícula ${e.matricula} e não foi resolvida. Calcular assim pagaria ` +
          `uma diferença a menos sem que nada acusasse. Nada foi calculado.`
      );
    }

    const correto = doCorreto === null ? toMoney(0) : doCorreto.valor;
    const apurado = anterior === null ? toMoney(0) : anterior.total;
    const delta = toMoney(correto.minus(apurado));

    if (delta.lt(0)) throw new DiferencaNegativaNaComplementarError(e.matricula, identidade, e.competencia, correto, apurado);

    detalhe.push({
      codigo: identidade.codigo,
      descricao: identidade.descricao,
      tipo: identidade.tipo,
      natureza: identidade.natureza,
      correto: m(correto),
      jaApurado: m(apurado),
      diferenca: m(delta),
      procedencia:
        anterior === null
          ? []
          : anterior.parcelas.map((p) => ({ folha: p.folhaTipo, competencia: p.competencia, calculo: p.calculoNumero, valor: m(p.valor) })),
      memoriaDoRecalculo: doCorreto === null ? "a rubrica não entra no recálculo desta competência" : doCorreto.memoria,
    });

    if (delta.isZero()) continue;

    linhas.push({
      rubricaId,
      codigo: identidade.codigo,
      descricao: identidade.descricao,
      tipo: identidade.tipo,
      natureza: identidade.natureza,
      ordem: identidade.ordem,
      /**
       * ⚠️ `valorBase` É O CORRETO E `fator` É 1: a linha da complementar vale a DIFERENÇA, e o
       * valor de que ela é diferença fica visível ao lado em vez de sumir na memória. Um `fator`
       * fracionário aqui seria inventar uma proporcionalidade que não existe — a proporcionalidade
       * dos dias já foi aplicada dentro do recálculo integral.
       */
      valorBase: correto,
      fator: new Decimal(1),
      valor: delta,
      incideContribuicao: doCorreto?.incideContribuicao ?? false,
      incideIrrf: doCorreto?.incideIrrf ?? false,
      memoria:
        `DIFERENÇA da competência ${e.competencia}: correto recalculado ${m(correto)} − já apurado ` +
        `${m(apurado)}` +
        (anterior === null || anterior.parcelas.length === 0
          ? ` (nenhuma folha fechada desta competência apurou esta rubrica para esta matrícula)`
          : ` (${anterior.parcelas.map((p) => `${p.folhaTipo} de ${p.competencia}, cálculo nº ${p.calculoNumero}: ${m(p.valor)}`).join("; ")})`) +
        ` = ${m(delta)}. ` +
        (doCorreto === null ? "" : `Como o correto foi apurado: ${doCorreto.memoria}`),
    });
  }

  if (linhas.length === 0) return null;

  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  const proventos = sumMoney(ordenadas.filter((l) => l.tipo === "PROVENTO").map((l) => l.valor));
  const descontos = sumMoney(ordenadas.filter((l) => l.tipo === "DESCONTO").map((l) => l.valor));
  const liquido = toMoney(proventos.minus(descontos));

  /**
   * ⚠️ AS BASES SÃO AS DO RECÁLCULO INTEGRAL, E OS VALORES SÃO OS DELTAS — e os dois moram no
   * mesmo objeto de propósito. `baseContribuicao` é a base CORRIGIDA da competência (é sobre ela
   * que a contribuição foi recalculada); `contribuicao` é o que falta reter. Guardar a base do
   * delta seria guardar um número que nenhuma tabela produziu.
   */
  const contribuicaoDelta = somaDaNatureza(ordenadas, "CONTRIBUICAO_PREVIDENCIARIA");
  const irrfDelta = somaDaNatureza(ordenadas, "IMPOSTO_DE_RENDA");

  const totais = {
    proventos,
    descontos,
    liquido,
    baseContribuicao: e.correto.totais.baseContribuicao,
    contribuicao: contribuicaoDelta,
    baseIrrf: e.correto.totais.baseIrrf,
    irrf: irrfDelta,
  };

  const memoria: Record<string, unknown> = {
    motor: VERSAO_DO_MOTOR_COMPLEMENTAR,
    tipo: "MENSAL_COMPLEMENTAR",
    competencia: e.competencia,
    vinculo: { id: e.correto.vinculoId, matricula: e.matricula, regime: e.correto.regime },
    /**
     * ⚠️ A NATUREZA, ESCRITA, PORQUE O DOCUMENTO NÃO PODE DEIXAR DEDUZIR. Sem esta frase, um
     * contracheque complementar de 200,00 é indistinguível de um contracheque mensal de 200,00 —
     * e o servidor concluiria que ganhou 200,00 no mês.
     */
    natureza:
      "DIFERENCA. Este contracheque NAO e a remuneracao da competencia: e o que faltou pagar nela, " +
      "rubrica a rubrica, depois que a folha mensal fechou. A folha mensal original NAO foi " +
      "reaberta nem corrigida — o contracheque dela continua valendo, e a soma dos dois e o total " +
      "devido pela competencia.",
    regimeDeTributacao: REGIME_DE_TRIBUTACAO_DA_COMPLEMENTAR,
    diasComputados: e.correto.diasComputados,
    rubricas: detalhe,
    totais: {
      correto: { proventos: m(e.correto.totais.proventos), descontos: m(e.correto.totais.descontos), liquido: m(e.correto.totais.liquido) },
      jaApurado: {
        proventos: m(somaApurada(e, "PROVENTO")),
        descontos: m(somaApurada(e, "DESCONTO")),
      },
      diferenca: { proventos: m(proventos), descontos: m(descontos), liquido: m(liquido) },
    },
    /**
     * ⚠️ O RECÁLCULO INTEGRAL VAI INTEIRO À MEMÓRIA, e o custo é deliberado. É ele que explica de
     * onde saiu o "correto": tabelas usadas com fundamentação, faixas percorridas, cenário do
     * IRRF, dependentes, dias. Sem ele, "correto = 2.500,00" é uma afirmação sem lastro dentro do
     * documento que deveria dar o lastro.
     */
    recalculoIntegral: e.correto.memoria,
  };

  return {
    vinculoId: e.correto.vinculoId,
    regime: e.correto.regime,
    diasComputados: e.correto.diasComputados,
    linhas: ordenadas,
    totais,
    contribuicao: e.correto.contribuicao,
    irrf: e.correto.irrf,
    salarioFamilia: e.correto.salarioFamilia,
    memoria,
    sha256: sha256Canonico(memoria),
    rubricasComDiferenca: ordenadas.length,
  };
}

function somaDaNatureza(linhas: readonly LinhaCalculada[], natureza: NaturezaDaRubrica): Money {
  return sumMoney(linhas.filter((l) => l.natureza === natureza).map((l) => l.valor));
}

/** O já apurado somado por tipo de rubrica — só para a memória; o cálculo é sempre por rubrica. */
function somaApurada(e: EntradaDaComplementar, tipo: TipoDeRubrica): Money {
  const valores: Money[] = [];
  for (const [rubricaId, a] of e.jaApurado) {
    if (e.identidadeDaRubrica.get(rubricaId)?.tipo === tipo) valores.push(a.total);
  }
  return sumMoney(valores);
}
