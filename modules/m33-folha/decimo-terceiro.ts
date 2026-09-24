import { z } from "zod";
import { Decimal, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil } from "../../packages/datas/index.js";
import { idadeEm } from "../m32-pessoal/dominio.js";
import {
  bordasDaCompetencia,
  calcularContribuicao,
  calcularIrrf,
  cenariosParaMemoria,
  diasComputados,
  faixasParaMemoria,
  sha256Canonico,

  type ContrachequeCalculado,
  type LinhaCalculada,
  type RegimePrevidenciario,
  type ResultadoDaContribuicao,
  type ResultadoDoIrrf,
  type RubricaLida,
  type TabelaDeContribuicaoLida,
  type TabelaIrrfLida,
  type VidaFuncionalNaCompetencia,
} from "./dominio.js";
// ⚠️ SÓ O TIPO, e de propósito: `import type` é apagado na compilação, então este arquivo continua
// domínio puro e NÃO passa a depender, em tempo de execução, de `certificacao.ts` — que importa o
// M05, o M01 e o M11. Declarar a união de novo aqui seria a cópia que diverge.
import type { SituacaoDaCertificacao } from "./certificacao.js";

/**
 * ═══ M33 — O 13º SALÁRIO EM DUAS PARCELAS: O DOMÍNIO PURO (V11 V9.1, TR 5.12.50) ═══
 *
 * Função pura sobre Decimal, como o resto do motor: recebe o PARÂMETRO DO ENTE, a vida funcional
 * do vínculo (M32), as rubricas da base já valoradas e as tabelas vigentes, e devolve o
 * contracheque do 13º com a memória canônica e o sha256 dela. Nenhum acesso a banco.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO SABE ═══
 * Ele não sabe que o avo é 1/12, não sabe que quinze dias fazem o mês contar, não sabe que a
 * primeira parcela é metade, e não sabe se o 13º sofre contribuição ou imposto. Os quatro são
 * campos de `ParametroLidoDoDecimoTerceiro`, e sem parâmetro a chamada nem acontece: o serviço
 * recusa antes, nomeando o exercício.
 *
 * A razão não é preciosismo. A Lei 4.090/1962 e a Lei 4.749/1965 governam o contrato CELETISTA;
 * o servidor estatutário recebe gratificação natalina pelo estatuto do MUNICÍPIO, que pode contar
 * o avo de outro jeito. Cravar "15" aqui seria escrever a norma de um ente dentro do motor de
 * todos eles — e o pior é que ninguém veria: a folha fecharia, o total bateria, e a diferença só
 * apareceria num servidor admitido no dia 16.
 *
 * ═══ ⚠️ A MEDIDA DO 13º É O MÊS, NÃO O DIA ═══
 * A folha mensal proporcionaliza por `dias/30` (mês fiscal). O 13º proporcionaliza por
 * `avos/avosNoExercicio`, e o avo é uma decisão BINÁRIA por mês: o mês conta inteiro ou não conta.
 * Por isso este arquivo não reusa `fatorDeDias` — reusa `diasComputados`, doze vezes, para
 * decidir cada mês. Um servidor com 14 dias em março e 14 em abril tem 28 dias e ZERO avos; o
 * mesmo servidor na folha mensal teria quase um mês de vencimento. As duas contas estão certas,
 * e são contas diferentes.
 */

/** Muda quando a conta muda. A memória cita — o 13º de 2026 continua reproduzível depois. */
export const VERSAO_DO_MOTOR_DO_13 = "m33-decimo-terceiro-1.0.0";

const m = (v: Money | Decimal): string => (v instanceof Decimal ? v.toFixed(v.decimalPlaces() > 2 ? v.decimalPlaces() : 2) : String(v));

// ═══════════════════════════════════════════════════════════════════════════════
// ERROS NOMEADOS — cada um diz o que fazer, e nenhum deles conta o que o operador já sabe
// ═══════════════════════════════════════════════════════════════════════════════

export class ParametroDoDecimoTerceiroAusenteError extends Error {
  constructor(exercicio: number) {
    super(
      `PARAMETRO-DO-13-AUSENTE: o exercício ${exercicio} não tem parâmetro do 13º cadastrado. ` +
        `Cadastre-o em Folha > Parâmetros do 13º (dias mínimos do avo, avos no exercício, percentual ` +
        `da 1ª parcela, incidências e o ato que os fundamenta). Nada foi calculado.`
    );
    this.name = "ParametroDoDecimoTerceiroAusenteError";
  }
}

export class BaseDoDecimoTerceiroVaziaError extends Error {
  constructor(exercicio: number) {
    super(
      `BASE-DO-13-VAZIA: o parâmetro do 13º de ${exercicio} não lista nenhuma rubrica na base de ` +
        `cálculo. Sem base, o 13º de todo servidor sairia zero — e um zero calculado é ` +
        `indistinguível de um zero devido. Informe as rubricas da base. Nada foi calculado.`
    );
    this.name = "BaseDoDecimoTerceiroVaziaError";
  }
}

/**
 * ⚠️ ESTE ERRO É UM CASO REAL, NÃO UMA DEFENSIVA. Quem recebeu a 1ª parcela em junho e foi
 * desligado em agosto tem 13º de 8 avos e adiantamento calculado sobre mais: o abatimento fica
 * MAIOR que o 13º, e o líquido daria negativo. Pagar negativo não existe; o que existe é
 * reposição ao erário, que é outro ato, com outro rito, e este sistema não o tem. Recusar
 * nomeando a matrícula é a única saída honesta — ver `ABATIMENTO-MAIOR-QUE-O-13` no MODULO.
 */
export class AbatimentoMaiorQueODecimoTerceiroError extends Error {
  constructor(matricula: string, decimoTerceiro: Money, adiantamento: Money) {
    super(
      `ABATIMENTO-MAIOR-QUE-O-13: a matrícula ${matricula} tem 13º de ${m(decimoTerceiro)} e já ` +
        `recebeu ${m(adiantamento)} de adiantamento — o líquido ficaria negativo. Isso é valor a ` +
        `repor ao erário, que é ato próprio e não existe neste sistema; a folha não pode pagar ` +
        `menos que zero. Trate a matrícula fora desta folha. Nada foi calculado.`
    );
    this.name = "AbatimentoMaiorQueODecimoTerceiroError";
  }
}

/**
 * ⚠️ RECUSAR AQUI É O PONTO. Sem a rubrica do abatimento, a 2ª parcela pagaria o 13º INTEIRO a
 * quem já recebeu metade — e nada acusaria: os totais fechariam, o empenho fecharia, e o ente
 * pagaria uma vez e meia a folha de dezembro.
 */
export class RubricaDoAbatimentoAusenteError extends Error {
  constructor(matricula: string, adiantamento: Money) {
    super(
      `RUBRICA-DO-ABATIMENTO-AUSENTE: a matrícula ${matricula} recebeu ${m(adiantamento)} de ` +
        `adiantamento e o parâmetro do exercício não resolve a rubrica de abatimento. Calcular ` +
        `assim pagaria o 13º inteiro a quem já recebeu a 1ª parcela. Nada foi calculado.`
    );
    this.name = "RubricaDoAbatimentoAusenteError";
  }
}

/**
 * ⚠️ A BASE NÃO PODE ENCOLHER EM SILÊNCIO. Se uma rubrica da base não tem versão vigente para o
 * regime daquele vínculo, somar as outras e seguir pagaria 13º menor a quem tem regime próprio —
 * e o total da folha fecharia. O erro nomeia a rubrica, o regime e a competência.
 */
export class RubricaDaBaseSemVersaoError extends Error {
  constructor(codigo: string, regime: string, competencia: string) {
    super(
      `RUBRICA-DA-BASE-SEM-VERSAO: a rubrica ${codigo}, que o parâmetro lista na base do 13º, não ` +
        `tem versão aprovada vigente em ${competencia} para o regime ${regime}. Somar as demais ` +
        `pagaria 13º menor a quem tem esse regime, e o total da folha fecharia mesmo assim. ` +
        `Aprove a versão antes de calcular. Nada foi calculado.`
    );
    this.name = "RubricaDaBaseSemVersaoError";
  }
}

export class RubricaDaParcelaSemVersaoError extends Error {
  constructor(codigo: string, regime: string, competencia: string) {
    super(
      `RUBRICA-DO-13-SEM-VERSAO: a rubrica ${codigo}, que carrega a parcela do 13º, não tem versão ` +
        `aprovada vigente em ${competencia} para o regime ${regime}. Sem ela não há linha onde pagar. ` +
        `Aprove a versão antes de calcular. Nada foi calculado.`
    );
    this.name = "RubricaDaParcelaSemVersaoError";
  }
}

export class ReferenciaNormativaIncoerenteError extends Error {
  constructor(motivo: string) {
    super(
      `ATO-INCOERENTE: a referência do ato não confere — ${motivo}. O parâmetro do 13º decide ` +
        `quanto cada servidor recebe; ele exige o ato que o fundamenta, com número, ano e ` +
        `dispositivo, não uma frase. Nada foi gravado.`
    );
    this.name = "ReferenciaNormativaIncoerenteError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O ATO, ESTRUTURADO — e a conferência é de COERÊNCIA, não de comprimento
// ═══════════════════════════════════════════════════════════════════════════════

export type EsferaDoAtoNormativo = "FEDERAL" | "ESTADUAL" | "MUNICIPAL";

export type TipoDeAtoNormativo =
  | "CONSTITUICAO"
  | "EMENDA_CONSTITUCIONAL"
  | "LEI_COMPLEMENTAR"
  | "LEI"
  | "LEI_ORGANICA"
  | "ESTATUTO_DOS_SERVIDORES"
  | "MEDIDA_PROVISORIA"
  | "DECRETO"
  | "INSTRUCAO_NORMATIVA"
  | "PORTARIA"
  | "RESOLUCAO";

export interface ReferenciaNormativa {
  readonly esfera: EsferaDoAtoNormativo;
  readonly tipo: TipoDeAtoNormativo;
  readonly numero: string;
  readonly ano: number;
  readonly dispositivo: string;
  readonly ementa: string;
}

/**
 * CONFERE A REFERÊNCIA DO ATO — e a conferência que importa é a que um CHECK de comprimento não
 * faz.
 *
 * ⚠️ "conforme a legislação vigente" TEM 29 CARACTERES. Passaria por `min(20)`, por `min(25)` e
 * por qualquer piso que alguém escolhesse; e não permite a ninguém conferir nada. O que torna uma
 * citação conferível é o par (ato identificado, dispositivo) — daí as quatro perguntas abaixo.
 *
 * ⚠️ E O ANO SE COMPARA PELA DATA CIVIL DO ENTE, nunca por UTC. Em 31/12 às 23h30 no fuso do
 * município, o UTC já virou o ano — e um ato datado do ano seguinte passaria por meia hora por
 * ano. `anoCivil` (packages/datas) é a régua; `agora` entra por parâmetro para que o teste possa
 * fixar a hora de borda em vez de esperar dezembro.
 */
export function conferirReferenciaNormativa(r: ReferenciaNormativa, agora: Date): void {
  const numero = r.numero.trim();
  if (!/[0-9]/.test(numero)) {
    throw new ReferenciaNormativaIncoerenteError(`o número "${r.numero}" não tem nenhum dígito, e todo ato é identificado por um número`);
  }
  const anoDoEnte = anoCivil(agora);
  if (r.ano > anoDoEnte) {
    throw new ReferenciaNormativaIncoerenteError(`o ato é do ano ${r.ano} e no ente ainda é ${anoDoEnte} — um ato do futuro não fundamenta nada hoje`);
  }
  if (r.ano < 1800) {
    throw new ReferenciaNormativaIncoerenteError(`o ano ${r.ano} não é plausível para um ato administrativo brasileiro`);
  }
  const dispositivo = r.dispositivo.trim();
  if (dispositivo.length < 3 || !/[0-9A-Za-zÀ-ÿ]/.test(dispositivo)) {
    throw new ReferenciaNormativaIncoerenteError(`o dispositivo "${r.dispositivo}" não identifica onde no ato a regra está (ex.: "art. 2º, § 1º")`);
  }
  // Três palavras: uma palavra é rótulo ("férias"), não citação. O mesmo piso está no CHECK do
  // banco — aqui para dizer o motivo ao operador, lá para que nenhum outro caminho escape.
  if (r.ementa.trim().split(/\s+/).filter((p) => p.length > 0).length < 3) {
    throw new ReferenciaNormativaIncoerenteError(`a ementa "${r.ementa.trim()}" tem menos de três palavras — transcreva o dispositivo ou a ementa do ato`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// OS AVOS — o mês conta inteiro ou não conta
// ═══════════════════════════════════════════════════════════════════════════════

export interface AvoDoMes {
  readonly mes: string;
  readonly dias: number;
  readonly conta: boolean;
  readonly explicacao: string;
}

export interface ResultadoDosAvos {
  readonly avos: number;
  readonly primeiroMes: string;
  readonly ultimoMes: string;
  readonly diasMinimos: number;
  readonly meses: readonly AvoDoMes[];
}

/**
 * OS AVOS DO EXERCÍCIO, mês a mês, com o motivo de cada um contar ou não.
 *
 * ⚠️ A DECISÃO É BINÁRIA E POR MÊS. `diasComputados` (o mesmo do motor mensal — admissão,
 * desligamento e afastamento reduzem, dias sobrepostos contam uma vez) roda doze vezes; o mês
 * conta um avo quando os dias computados alcançam `diasMinimos`. Somar os dias do ano e dividir
 * por 30 daria outro número, e seria outra regra — a que o TR não pede.
 *
 * ⚠️ E ELE DEVOLVE OS DOZE MESES, não só o total. O total sozinho é indefensável: o servidor que
 * recebeu 8/12 quer saber quais quatro meses não contaram, e o controle interno quer conferir sem
 * recalcular. É o que vai para a memória do contracheque.
 */
export function avosDoExercicio(
  vida: VidaFuncionalNaCompetencia,
  p: { readonly exercicio: number; readonly ultimoMes: string; readonly diasMinimos: number }
): ResultadoDosAvos {
  const primeiroMes = `${p.exercicio}-01`;
  const meses: AvoDoMes[] = [];
  for (let mes = 1; mes <= 12; mes += 1) {
    const competencia = `${p.exercicio}-${String(mes).padStart(2, "0")}`;
    if (competencia > p.ultimoMes) break;
    const d = diasComputados(vida, competencia);
    const conta = d.dias >= p.diasMinimos;
    meses.push({
      mes: competencia,
      dias: d.dias,
      conta,
      explicacao: conta
        ? `${d.explicacao} — alcança o mínimo de ${p.diasMinimos}, conta 1 avo`
        : `${d.explicacao} — abaixo do mínimo de ${p.diasMinimos}, não conta avo`,
    });
  }
  return {
    avos: meses.filter((x) => x.conta).length,
    primeiroMes,
    ultimoMes: p.ultimoMes,
    diasMinimos: p.diasMinimos,
    meses,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CONTRACHEQUE DO 13º
// ═══════════════════════════════════════════════════════════════════════════════

export type BaseDosAvosDoAdiantamento = "ATE_A_COMPETENCIA" | "EXERCICIO_INTEIRO";

export interface ParametroLidoDoDecimoTerceiro {
  readonly id: string;
  readonly exercicio: number;
  readonly versao: number;
  readonly diasMinimosDoAvo: number;
  readonly avosNoExercicio: number;
  readonly percentualDaPrimeiraParcela: Decimal;
  readonly baseDosAvosDoAdiantamento: BaseDosAvosDoAdiantamento;
  readonly decimoTerceiroSofreContribuicao: boolean;
  readonly decimoTerceiroSofreIrrf: boolean;
  readonly ato: ReferenciaNormativa;
}

/** Uma rubrica da base, já valorada INTEGRAL (sem avos) para este vínculo. */
export interface ParcelaDaBase {
  readonly codigo: string;
  readonly descricao: string;
  readonly natureza: string;
  readonly valor: Money;
  readonly memoria: string;
}

/**
 * A PROCEDÊNCIA DO ABATIMENTO — o fato verificado sobre a folha de adiantamento, no instante do
 * cálculo da 2ª parcela.
 *
 * ⚠️ `situacaoDaCertificacao` entra por PARÂMETRO e o tipo vem por `import type`, que o compilador
 * apaga: este arquivo é domínio PURO e não pode arrastar `certificacao.ts`, que importa M05, M01 e
 * M11. Copiar a união aqui seria a segunda cópia que este repositório já pagou para não ter.
 */
export interface ProcedenciaDoAbatimento {
  /** A competência da folha de adiantamento (ex.: "2026-06"). */
  readonly competencia: string;
  /** O número do cálculo que FECHOU aquela folha — é dele que os valores foram lidos. */
  readonly calculoNumero: number;
  /** A situação da certificação daquele cálculo, derivada no instante deste cálculo. */
  readonly situacaoDaCertificacao: SituacaoDaCertificacao;
  /**
   * A versão do parâmetro do 13º que apurou a 1ª parcela.
   *
   * ⚠️ O SERVIÇO JÁ RECUSOU se ela divergir da vigente (`PARAMETRO-TROCADO-ENTRE-AS-PARCELAS`),
   * então aqui ela sempre bate com `parametro.versao`. Vai à memória assim mesmo, porque é o que
   * torna a igualdade CONFERÍVEL por quem lê o contracheque depois, sem precisar acreditar que a
   * guarda rodou.
   */
  readonly versaoDoParametro: number;
}

export interface EntradaDoDecimoTerceiro {
  readonly parcela: "ADIANTAMENTO" | "DECIMO_TERCEIRO";
  readonly competencia: string;
  readonly parametro: ParametroLidoDoDecimoTerceiro;
  readonly vinculo: { readonly id: string; readonly matricula: string; readonly regime: RegimePrevidenciario; readonly dataNascimento: Date };
  readonly avos: ResultadoDosAvos;
  readonly base: readonly ParcelaDaBase[];
  /** A rubrica que carrega a parcela (13º ou adiantamento, conforme `parcela`). */
  readonly rubricaDaParcela: RubricaLida;
  /** A rubrica do abatimento — só na 2ª parcela, e só quando houve adiantamento. */
  readonly rubricaDoAbatimento: RubricaLida | null;
  /**
   * O provento do adiantamento APURADO no cálculo que FECHOU a folha de adiantamento deste
   * vínculo; zero quando não houve.
   *
   * ⚠️ O NOME DIZ O FATO, E O FATO NÃO É "PAGO". Este campo chamou-se `adiantamentoPago` até a
   * V11 V9.2, e a memória do contracheque dizia "1ª parcela já paga". O único fato que o serviço
   * verifica é `FolhaDePagamento.fechamento !== null` (`servico.ts`, a recusa
   * `ADIANTAMENTO-NAO-FECHADO`). Entre FECHADA e PAGA há, neste mesmo módulo, a certificação (que
   * pode ser DEVOLVIDA), a apropriação/empenho e a liquidação — e o pagamento nem é ato do M33
   * (`ORDENAR-E-PAGAR-A-FOLHA`). Afirmar "pago" no documento com que o servidor confere o próprio
   * contracheque é mentir no documento, e a memória vai lacrada em sha256: a mentira fica
   * carimbada. O nome novo não muda um centavo; muda o que o sistema AFIRMA.
   */
  readonly adiantamentoApuradoEmFolhaFechada: Money;
  /**
   * DE ONDE veio o abatimento, como fato datável — nulo quando não há adiantamento no exercício.
   *
   * ⚠️ ISTO ACRESCENTA FATO, NÃO REGRA. A situação da certificação do adiantamento NÃO decide
   * nada aqui: o cálculo abate do mesmo jeito, porque o critério normativo de elegibilidade do
   * abatimento não está levantado (`ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE`, MODULO). O que ela
   * faz é deixar no contracheque o que sustenta o desconto, para que um adiantamento fechado e
   * DEVOLVIDO para correção — que nunca vai ser liquidado nem pago — não seja abatido em silêncio.
   */
  readonly procedenciaDoAbatimento: ProcedenciaDoAbatimento | null;
  readonly rubricaDaContribuicao: RubricaLida;
  readonly rubricaDoIrrf: RubricaLida;
  readonly dependentesIr: number;
  readonly pensaoAlimenticia: Money;
  readonly tabelas: {
    readonly contribuicao: TabelaDeContribuicaoLida | null;
    readonly irrf: TabelaIrrfLida;
  };
}

export interface ContrachequeDoDecimoTerceiro extends ContrachequeCalculado {
  readonly avosComputados: number;
}

/**
 * CALCULA O CONTRACHEQUE DE UMA PARCELA DO 13º.
 *
 * Ordem:
 *   1. base integral = Σ das rubricas que o PARÂMETRO lista (vencimento, gratificações,
 *      percentuais — nunca lançamento, ver a recusa da média no serviço);
 *   2. 13º apurado = base × avos ÷ avosNoExercicio;
 *   3. a parcela: no ADIANTAMENTO, × percentual do parâmetro, SEM contribuição e SEM imposto; no
 *      13º, o valor integral, com contribuição e imposto se o parâmetro disser que incidem;
 *   4. o ABATIMENTO do que a 1ª parcela APUROU — não "pagou" (só na 2ª; ver
 *      `adiantamentoApuradoEmFolhaFechada`);
 *   5. totais, memória canônica e sha256.
 *
 * ⚠️ A 1ª PARCELA NÃO SOFRE CONTRIBUIÇÃO NEM IMPOSTO NESTE SISTEMA, e a memória DIZ isso com
 * todas as letras, em vez de o operador deduzir do silêncio. É limite declarado, não norma
 * afirmada: se ela sofresse, a 2ª teria de abater o que já foi retido, e o critério desse
 * abatimento é normativo e não foi levantado (`INCIDENCIA-NA-PRIMEIRA-PARCELA` no MODULO).
 */
export function calcularContrachequeDoDecimoTerceiro(e: EntradaDoDecimoTerceiro): ContrachequeDoDecimoTerceiro {
  if (e.base.length === 0) throw new BaseDoDecimoTerceiroVaziaError(e.parametro.exercicio);

  const baseIntegral = sumMoney(e.base.map((b) => b.valor));
  const fator = new Decimal(e.avos.avos).div(e.parametro.avosNoExercicio);
  const decimoApurado = toMoney(baseIntegral.times(fator));
  const eAdiantamento = e.parcela === "ADIANTAMENTO";
  const valorDaParcela = eAdiantamento
    ? toMoney(decimoApurado.times(e.parametro.percentualDaPrimeiraParcela))
    : decimoApurado;

  const linhas: LinhaCalculada[] = [];
  const empurrar = (r: RubricaLida, valor: Money, memoria: string): void => {
    linhas.push({
      rubricaId: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, natureza: r.natureza,
      ordem: r.ordem, valorBase: valor, fator: new Decimal(1), valor,
      incideContribuicao: r.incideContribuicao, incideIrrf: r.incideIrrf, memoria,
    });
  };

  const explicacaoDosAvos =
    `${e.avos.avos}/${e.parametro.avosNoExercicio} avos de ${m(baseIntegral)} ` +
    `(base: ${e.base.map((b) => `${b.codigo} ${m(b.valor)}`).join(" + ")}) = ${m(decimoApurado)}`;

  empurrar(
    e.rubricaDaParcela,
    valorDaParcela,
    eAdiantamento
      ? `${explicacaoDosAvos}; 1ª parcela = ${e.parametro.percentualDaPrimeiraParcela.times(100).toFixed(2)}% × ${m(decimoApurado)} = ${m(valorDaParcela)}`
      : explicacaoDosAvos
  );

  // ── contribuição e imposto: só na 2ª parcela, e só se o parâmetro disser que incidem ──
  const incideContrib = !eAdiantamento && e.parametro.decimoTerceiroSofreContribuicao;
  const incideIr = !eAdiantamento && e.parametro.decimoTerceiroSofreIrrf;

  const contribuicaoCalculada: ResultadoDaContribuicao = calcularContribuicao({
    regime: e.vinculo.regime,
    base: incideContrib ? valorDaParcela : toMoney(0),
    tabela: e.tabelas.contribuicao,
  });
  if (incideContrib && contribuicaoCalculada.valor.gt(0)) {
    empurrar(
      e.rubricaDaContribuicao,
      contribuicaoCalculada.valor,
      `${contribuicaoCalculada.regime} sobre o 13º: base ${m(contribuicaoCalculada.base)}` +
        `${contribuicaoCalculada.tetoAplicado ? ` (teto sobre ${m(contribuicaoCalculada.baseAntesDoTeto)})` : ""}` +
        ` → faixas ${contribuicaoCalculada.faixas.map((f) => `${m(f.baseNaFaixa)}×${f.aliquota}`).join(" + ") || "—"} = ${m(contribuicaoCalculada.valor)}`
    );
  }

  const referencia = bordasDaCompetencia(e.competencia).inicio;
  const maior65 = idadeEm(e.vinculo.dataNascimento, referencia) >= 65;
  const irrfCalculado: ResultadoDoIrrf = calcularIrrf({
    rendaTributavel: incideIr ? valorDaParcela : toMoney(0),
    contribuicao: incideContrib ? contribuicaoCalculada.valor : toMoney(0),
    dependentes: e.dependentesIr,
    pensaoAlimenticia: e.pensaoAlimenticia,
    maior65,
    tabela: e.tabelas.irrf,
  });
  if (incideIr && irrfCalculado.valor.gt(0)) {
    empurrar(
      e.rubricaDoIrrf,
      irrfCalculado.valor,
      `cenário ${irrfCalculado.cenario} sobre o 13º: renda ${m(valorDaParcela)} − deduções → base ${m(irrfCalculado.base)} = ${m(irrfCalculado.valor)}`
    );
  }

  // ── o abatimento da 1ª parcela ──
  if (!eAdiantamento && e.adiantamentoApuradoEmFolhaFechada.gt(0)) {
    if (e.rubricaDoAbatimento === null) {
      throw new RubricaDoAbatimentoAusenteError(e.vinculo.matricula, e.adiantamentoApuradoEmFolhaFechada);
    }
    if (e.adiantamentoApuradoEmFolhaFechada.gt(valorDaParcela)) {
      throw new AbatimentoMaiorQueODecimoTerceiroError(e.vinculo.matricula, valorDaParcela, e.adiantamentoApuradoEmFolhaFechada);
    }
    const p = e.procedenciaDoAbatimento;
    empurrar(
      e.rubricaDoAbatimento,
      e.adiantamentoApuradoEmFolhaFechada,
      `1ª parcela APURADA na folha de adiantamento FECHADA` +
        (p === null ? "" : ` de ${p.competencia} (cálculo nº ${p.calculoNumero}; certificação ${p.situacaoDaCertificacao})`) +
        `, exercício ${e.parametro.exercicio}: ${m(e.adiantamentoApuradoEmFolhaFechada)}. ` +
        `⚠️ O que se verificou foi o FECHAMENTO daquela folha, não o seu pagamento: liquidar e ` +
        `pagar são atos próprios (M05/M09) e não são consultados aqui.`
    );
  }

  const ordenadas = [...linhas].sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
  const proventos = sumMoney(ordenadas.filter((l) => l.tipo === "PROVENTO").map((l) => l.valor));
  const descontos = sumMoney(ordenadas.filter((l) => l.tipo === "DESCONTO").map((l) => l.valor));
  const liquido = toMoney(proventos.minus(descontos));
  const totais = {
    proventos, descontos, liquido,
    baseContribuicao: contribuicaoCalculada.base,
    contribuicao: incideContrib ? contribuicaoCalculada.valor : toMoney(0),
    baseIrrf: irrfCalculado.base,
    irrf: incideIr ? irrfCalculado.valor : toMoney(0),
  };

  const memoria: Record<string, unknown> = {
    motor: VERSAO_DO_MOTOR_DO_13,
    parcela: e.parcela,
    competencia: e.competencia,
    exercicio: e.parametro.exercicio,
    vinculo: { id: e.vinculo.id, matricula: e.vinculo.matricula, regime: e.vinculo.regime },
    parametro: {
      id: e.parametro.id,
      versao: e.parametro.versao,
      diasMinimosDoAvo: e.parametro.diasMinimosDoAvo,
      avosNoExercicio: e.parametro.avosNoExercicio,
      percentualDaPrimeiraParcela: e.parametro.percentualDaPrimeiraParcela.toFixed(4),
      baseDosAvosDoAdiantamento: e.parametro.baseDosAvosDoAdiantamento,
      decimoTerceiroSofreContribuicao: e.parametro.decimoTerceiroSofreContribuicao,
      decimoTerceiroSofreIrrf: e.parametro.decimoTerceiroSofreIrrf,
      ato: {
        esfera: e.parametro.ato.esfera, tipo: e.parametro.ato.tipo, numero: e.parametro.ato.numero,
        ano: e.parametro.ato.ano, dispositivo: e.parametro.ato.dispositivo, ementa: e.parametro.ato.ementa,
      },
    },
    avos: {
      computados: e.avos.avos,
      de: e.parametro.avosNoExercicio,
      diasMinimos: e.avos.diasMinimos,
      primeiroMes: e.avos.primeiroMes,
      ultimoMes: e.avos.ultimoMes,
      meses: e.avos.meses.map((x) => ({ mes: x.mes, dias: x.dias, conta: x.conta, explicacao: x.explicacao })),
    },
    base: {
      integral: m(baseIntegral),
      rubricas: e.base.map((b) => ({ codigo: b.codigo, descricao: b.descricao, natureza: b.natureza, valor: m(b.valor), memoria: b.memoria })),
    },
    apurado: m(decimoApurado),
    parcelaPaga: m(valorDaParcela),
    adiantamentoAbatido: m(e.adiantamentoApuradoEmFolhaFechada),
    /**
     * ⚠️ O QUE SUSTENTA O DESCONTO, ESCRITO — e o que NÃO sustenta, também.
     *
     * Sem esta chave, "abatido 990,41" é indistinguível de "990,41 saíram do caixa para este
     * servidor". Saíram do CÁLCULO que fechou a folha de adiantamento, e mais nada foi conferido.
     * A situação da certificação entra como FATO datado; ela não decide nada neste cálculo, e o
     * `motivo` abaixo diz isso para que ninguém a leia como se decidisse.
     */
    procedenciaDoAbatimento:
      eAdiantamento || e.procedenciaDoAbatimento === null
        ? null
        : {
            folhaDeAdiantamento: e.procedenciaDoAbatimento.competencia,
            calculoNumero: e.procedenciaDoAbatimento.calculoNumero,
            situacaoDaCertificacao: e.procedenciaDoAbatimento.situacaoDaCertificacao,
            // ⚠️ A MESMA RÉGUA, CONFERÍVEL NO PAPEL. Esta versão é a que apurou a 1ª parcela, e o
            // serviço recusou o cálculo se ela divergisse de `parametro.versao` acima. Quem lê o
            // contracheque compara os dois números e vê a identidade — sem precisar confiar que
            // a guarda rodou.
            versaoDoParametroDoAdiantamento: e.procedenciaDoAbatimento.versaoDoParametro,
            fatoVerificado: "FECHAMENTO_DA_FOLHA_DE_ADIANTAMENTO",
            motivo:
              "o abatimento é condicionado ao FECHAMENTO da folha de adiantamento, e a nada mais: " +
              "certificação, empenho, liquidação e pagamento NÃO são consultados. A situação da " +
              "certificação está aqui como fato, não como condição — o critério normativo de qual " +
              "estado torna o adiantamento abatível não foi levantado e está declarado no MODULO " +
              "como ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE. Uma folha FECHADA e DEVOLVIDA para " +
              "correção nunca será liquidada nem paga, e mesmo assim foi abatida aqui.",
          },
    incidencias: eAdiantamento
      ? {
          contribuicao: false,
          irrf: false,
          // ⚠️ A MEMÓRIA DIZ O LIMITE. Sem esta linha, "sem contribuição" na 1ª parcela seria
          // indistinguível de "a tabela não achou nada a descontar".
          motivo:
            "a 1ª parcela não sofre contribuição nem imposto neste sistema — limite declarado " +
            "(INCIDENCIA-NA-PRIMEIRA-PARCELA), não regra afirmada: a 2ª parcela teria de abater o " +
            "que já foi retido, e esse critério é normativo e não foi levantado",
        }
      : { contribuicao: incideContrib, irrf: incideIr, motivo: "declaradas no parâmetro do exercício" },
    linhas: ordenadas.map((l) => ({
      codigo: l.codigo, descricao: l.descricao, tipo: l.tipo, natureza: l.natureza,
      valorBase: m(l.valorBase), fator: l.fator.toFixed(6), valor: m(l.valor),
      incideContribuicao: l.incideContribuicao, incideIrrf: l.incideIrrf, memoria: l.memoria,
    })),
    /**
     * ⚠️ AS FAIXAS E OS CENÁRIOS VÃO À MEMÓRIA — V11 V9.2, e isto é ADICIONAR FATO VERIFICADO,
     * não regra nova: o motor JÁ percorre as faixas (`aplicarFaixas`, `toMoney` por faixa) e JÁ
     * avalia os três cenários do imposto; ele só não estava REGISTRANDO o que usou.
     *
     * "Contribuição = 380,00" sem as faixas não é memória, é um número. Memória é o documento com
     * que o servidor confere o próprio pagamento e com que o controle interno confere sem
     * recalcular — e era exatamente isso que faltava ao 13º enquanto sobrava ao mensal.
     *
     * ⚠️ E A FORMA É A MESMA DO MENSAL, pelas mesmas funções (`faixasParaMemoria`,
     * `cenariosParaMemoria`). Duas montagens da mesma coisa divergem — foi assim que a tela do
     * contracheque passou a responder 500 em todo contracheque de 13º, com os três typechecks
     * verdes por cima. `calculada`/`aplicada` são iguais aqui porque o 13º não tem imposição por
     * acumulação; escrever as duas mantém UMA forma para quem lê.
     */
    contribuicao: incideContrib
      ? {
          regime: contribuicaoCalculada.regime,
          base: m(contribuicaoCalculada.base),
          baseAntesDoTeto: m(contribuicaoCalculada.baseAntesDoTeto),
          tetoAplicado: contribuicaoCalculada.tetoAplicado,
          calculada: m(contribuicaoCalculada.valor),
          aplicada: m(contribuicaoCalculada.valor),
          faixas: faixasParaMemoria(contribuicaoCalculada.faixas),
          tabela: contribuicaoCalculada.tabelaId,
          fundamentacao: contribuicaoCalculada.fundamentacao,
        }
      : null,
    irrf: incideIr
      ? {
          rendaTributavel: m(valorDaParcela),
          base: m(irrfCalculado.base),
          calculado: m(irrfCalculado.valor),
          aplicado: m(irrfCalculado.valor),
          cenario: irrfCalculado.cenario,
          maior65,
          dependentes: e.dependentesIr,
          cenarios: cenariosParaMemoria(irrfCalculado.cenarios),
          tabela: irrfCalculado.tabelaId,
          fundamentacao: irrfCalculado.fundamentacao,
        }
      : null,
    totais: {
      proventos: m(proventos), descontos: m(descontos), liquido: m(liquido),
      baseContribuicao: m(totais.baseContribuicao), contribuicao: m(totais.contribuicao),
      baseIrrf: m(totais.baseIrrf), irrf: m(totais.irrf),
    },
  };

  return {
    vinculoId: e.vinculo.id,
    regime: e.vinculo.regime,
    // ⚠️ ZERO DIAS, E O ZERO É DECLARADO: a medida desta folha é o avo. O CHECK
    // `ck_contracheque_avos_ou_dias` do banco exige exatamente isso quando `avosComputados` vem.
    diasComputados: 0,
    avosComputados: e.avos.avos,
    linhas: ordenadas,
    totais,
    contribuicao: contribuicaoCalculada,
    irrf: irrfCalculado,
    salarioFamilia: null,
    memoria,
    sha256: sha256Canonico(memoria),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ZOD — o que entra pela tela
// ═══════════════════════════════════════════════════════════════════════════════

const zAutor = z.string().min(1);

export const zReferenciaNormativaInput = z.object({
  atoEsfera: z.enum(["FEDERAL", "ESTADUAL", "MUNICIPAL"]),
  atoTipo: z.enum([
    "CONSTITUICAO", "EMENDA_CONSTITUCIONAL", "LEI_COMPLEMENTAR", "LEI", "LEI_ORGANICA",
    "ESTATUTO_DOS_SERVIDORES", "MEDIDA_PROVISORIA", "DECRETO", "INSTRUCAO_NORMATIVA",
    "PORTARIA", "RESOLUCAO",
  ]),
  atoNumero: z.string().trim().min(1, "o número do ato"),
  atoAno: z.coerce.number().int(),
  atoDispositivo: z.string().trim().min(1, "o dispositivo do ato"),
  atoEmenta: z.string().trim().min(1, "a ementa ou a transcrição do dispositivo"),
});

export const zCadastrarParametroDoDecimoTerceiroInput = zReferenciaNormativaInput.extend({
  exercicio: z.coerce.number().int().min(1900).max(2200),
  diasMinimosDoAvo: z.coerce.number().int().min(1).max(30),
  avosNoExercicio: z.coerce.number().int().min(1).max(12),
  percentualDaPrimeiraParcela: z
    .union([z.string(), z.number(), z.instanceof(Decimal)])
    .transform((v) => new Decimal(v))
    .refine((d) => d.gte(0) && d.lte(1), "percentual entre 0 e 1 (0.5 = 50%)"),
  baseDosAvosDoAdiantamento: z.enum(["ATE_A_COMPETENCIA", "EXERCICIO_INTEIRO"]),
  decimoTerceiroSofreContribuicao: z.coerce.boolean(),
  decimoTerceiroSofreIrrf: z.coerce.boolean(),
  rubricaDoDecimoTerceiroId: z.string().min(1),
  rubricaDoAdiantamentoId: z.string().min(1),
  rubricaDoAbatimentoId: z.string().min(1),
  rubricasDaBase: z.array(z.string().min(1)).min(1, "ao menos uma rubrica na base do 13º"),
  criadoPor: zAutor,
});
export type CadastrarParametroDoDecimoTerceiroInput = z.input<typeof zCadastrarParametroDoDecimoTerceiroInput>;
