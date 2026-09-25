import { z } from "zod";
import { Decimal, emProsa, toMoney, sumMoney, type Money } from "../../packages/contracts/index.js";
import {
  calcularContribuicao,
  calcularIrrf,
  sha256Canonico,
  zCompetencia,
  type ContrachequeCalculado,
  type LinhaCalculada,
  type RegimePrevidenciario,
  type RubricaLida,
  type TabelaDeContribuicaoLida,
  type TabelaIrrfLida,
} from "./dominio.js";
import {
  zReferenciaNormativaInput,
  type EsferaDoAtoNormativo,
  type EstadoMinimoDoAdiantamento,
  type TipoDeAtoNormativo,
} from "./decimo-terceiro.js";

/**
 * ═══ M33 — O ADIANTAMENTO SALARIAL: O DOMÍNIO PURO (V13, TR 5.12.50) ═══
 *
 * O "vale": o ente paga, no meio do mês, uma parte da remuneração da competência, e a folha
 * MENSAL daquela MESMA competência abate o que o vale adiantou.
 *
 * Função pura sobre `Decimal`: recebe o PARÂMETRO DO ENTE e a BASE já apurada por quem sabe
 * apurá-la, e devolve o contracheque do vale com a memória canônica e o sha256 dela. Nenhum
 * acesso a banco, nenhum relógio.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO DELIBERADAMENTE NÃO SABE ═══
 *
 * Ele não sabe qual é o percentual, não sabe qual é a base, e não sabe que fato torna o vale
 * abatível. Os três são campos de `ParametroLidoDoAdiantamentoSalarial`, e sem parâmetro a
 * chamada nem acontece: o serviço recusa antes, nomeando a competência.
 *
 * A razão não é preciosismo. O TR nomeia a rotina e NÃO fixa percentual nem base — procurado em
 * `docs/edital/`, não localizado. Cravar "40%" aqui seria escrever a norma de um ente dentro do
 * motor de todos eles, e o pior é que ninguém veria: a folha fecharia, o empenho fecharia, a
 * mensal abateria certinho o valor errado, e o total bateria.
 *
 * ═══ ⚠️ E ELE NÃO CALCULA A BASE ═══
 *
 * A base chega PRONTA, de fora, e isso é o desenho: as duas práticas suportadas leem fatos
 * DIFERENTES (uma lê a folha fechada do mês anterior; a outra roda o motor mensal da competência
 * corrente), e as duas leituras são de banco. Trazê-las para cá faria este arquivo deixar de ser
 * puro; reimplementá-las aqui seria a SEGUNDA ARITMÉTICA sobre o mesmo dinheiro, que é o defeito
 * que este repositório existe para não ter.
 */

/**
 * Muda quando a conta muda. A memória cita — o vale de 2026-06 continua reproduzível depois.
 *
 * ⚠️ NASCE EM 1.0.0 e a prosa já é pt-BR: o corte que a V12 U2 fez no motor do 13º
 * ("3000.00" → "3.000,00") não tem equivalente aqui porque não há memória anterior a respeitar.
 */
export const VERSAO_DO_MOTOR_DO_ADIANTAMENTO_SALARIAL = "m33-adiantamento-salarial-1.0.0";

// ═══════════════════════════════════════════════════════════════════════════════
// AS PRÁTICAS SUPORTADAS — E O QUE CADA UMA PRECISA DECLARAR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ESTA LISTA É O QUE O SISTEMA SABE CALCULAR E VERIFICAR — NÃO O UNIVERSO DAS REGRAS
 * ADMISSÍVEIS, e a distinção é a razão de este bloco existir.
 *
 * Um ente cuja regra municipal não seja nenhuma das duas (percentual sobre o vencimento-base
 * apenas, valor fixo em reais por faixa, percentual variável por tempo de serviço, vale limitado
 * ao teto do RGPS...) NÃO recebe um encaixe na mais parecida. Recebe recusa no cadastro, porque
 * o Zod abaixo só aceita estes dois valores, e a pendência tem nome:
 * `REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA` (MODULO.md do M33).
 *
 * Encaixar à força é o defeito mais caro possível aqui: a folha sairia, fecharia, seria empenhada
 * e a mensal abateria — tudo coerente, e todo mês com o valor errado. Nenhuma etapa adiante
 * acusa, porque a aritmética interna fecha. Só o servidor perceberia, no contracheque.
 */
export const BASES_DO_ADIANTAMENTO_SALARIAL = ["REMUNERACAO_DO_MES_ANTERIOR", "REMUNERACAO_PROJETADA_DO_MES"] as const;
export type BaseDoAdiantamentoSalarial = (typeof BASES_DO_ADIANTAMENTO_SALARIAL)[number];

/**
 * O QUE CADA OPÇÃO SIGNIFICA, EM FATOS — e o `Record` é EXAUSTIVO de propósito: uma base nova
 * não compila até alguém escrever as quatro coisas que a ordem V13 exige dela.
 *
 * ⚠️ `fundamentoAplicavel` NÃO É A NORMA, E ISSO É O PONTO. Ele descreve o que o ato do ente
 * precisa DIZER para que a opção seja a escolha certa — não afirma que alguma lei manda escolhê-la.
 * A norma fica no `ato` do parâmetro, transcrita pelo ente; este campo é a pergunta que a tela faz
 * ao operador antes de ele escolher.
 *
 * ⚠️ VIGÊNCIA e APROVAÇÃO não moram aqui porque não são propriedades da OPÇÃO: são propriedades
 * da ESCOLHA. Vigência = `(competencia, versao)` do parâmetro, append-only. Aprovação = a ação
 * própria `CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL` mais o `criadoPor` gravado na versão.
 */
export interface SemanticaDaBase {
  /** O rótulo de negócio — o que a tela mostra onde apareceria o nome cru do enum. */
  readonly rotulo: string;
  /** O FATO que a base lê, dito em termos do banco, sem adjetivo. */
  readonly semantica: string;
  /** O que o ato do ente precisa dizer para que esta seja a opção certa. */
  readonly fundamentoAplicavel: string;
  /** O que acontece com quem não tem base — e por que isso não é exclusão silenciosa. */
  readonly quemFicaDeFora: string;
}

export const SEMANTICA_DA_BASE: Readonly<Record<BaseDoAdiantamentoSalarial, SemanticaDaBase>> = {
  REMUNERACAO_DO_MES_ANTERIOR: {
    rotulo: "Remuneração do mês anterior (o que a folha fechada dele apurou)",
    semantica:
      "A base é a soma dos PROVENTOS que o vínculo teve na folha MENSAL FECHADA da competência " +
      "anterior. Nada é recalculado: lê-se o que aquela folha apurou. Sem a mensal anterior fechada, " +
      "o cálculo RECUSA nomeando a competência — projetar por conta própria trocaria a regra que o " +
      "ente declarou por outra.",
    fundamentoAplicavel:
      "O ato do ente fixa o vale sobre a remuneração JÁ PAGA, e não sobre a do mês corrente. É a " +
      "escolha de quem paga o vale antes de saber o que o mês vai render.",
    quemFicaDeFora:
      "Quem foi admitido na própria competência não tem folha anterior e não recebe vale: não há " +
      "fato anterior a ler, e arbitrar um seria inventar a base. A ausência é registrada no fato de " +
      "abrangência do cálculo, não é um descarte mudo.",
  },
  REMUNERACAO_PROJETADA_DO_MES: {
    rotulo: "Remuneração projetada da própria competência (motor mensal, tabelas vigentes)",
    semantica:
      "A base é a soma dos PROVENTOS que a competência CORRENTE produziria hoje, pelo motor mensal " +
      "inteiro — mesmas tabelas vigentes, mesmas versões de rubrica, mesma proporcionalidade de " +
      "dias, mesma agregação por pessoa. Nenhuma conta nova.",
    fundamentoAplicavel:
      "O ato do ente fixa o vale sobre a remuneração DO PRÓPRIO MÊS. É a escolha de quem quer que " +
      "admissão, desligamento e mudança de vencimento dentro da competência já apareçam no vale.",
    quemFicaDeFora:
      "Quem o motor mensal não alcança na competência (admitido depois do fim, desligado antes do " +
      "início) fica de fora COM MOTIVO NOMEADO — os mesmos motivos que a folha mensal já registra.",
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// AS RECUSAS
// ═══════════════════════════════════════════════════════════════════════════════

export class ParametroDoAdiantamentoSalarialAusenteError extends Error {
  constructor(competencia: string) {
    super(
      `PARAMETRO-DO-ADIANTAMENTO-SALARIAL-AUSENTE: a competência ${competencia} não tem parâmetro do ` +
        `adiantamento salarial cadastrado, e sem ele não há percentual, não há base e não há critério ` +
        `de abatimento — o vale sairia com os números de quem escreveu o motor. ` +
        `O QUE FAZER: cadastre o parâmetro de ${competencia} em Folha > Parâmetros do adiantamento ` +
        `salarial, com o percentual, a base, as duas rubricas, o estado mínimo para abater e o ato do ` +
        `ente que fundamenta tudo isso. O sistema não preenche nada disso sozinho. Nada foi calculado.`
    );
    this.name = "ParametroDoAdiantamentoSalarialAusenteError";
  }
}

export class BaseDoAdiantamentoSalarialAusenteError extends Error {
  constructor(matricula: string, competencia: string, porque: string) {
    super(
      `BASE-DO-ADIANTAMENTO-SALARIAL-AUSENTE: a matrícula ${matricula} não tem base para o vale de ` +
        `${competencia} — ${porque}. Nada foi calculado.`
    );
    this.name = "BaseDoAdiantamentoSalarialAusenteError";
  }
}

/**
 * ⚠️ AS DUAS RECUSAS DO ABATIMENTO NA MENSAL MORAM EM `dominio.ts`, NÃO AQUI, E A RAZÃO É
 * MECÂNICA, NÃO ESTÉTICA.
 *
 * `AbatimentoDoAdiantamentoSalarialMaiorQueARemuneracaoError` e
 * `RubricaDoAbatimentoSalarialAusenteError` são lançadas DENTRO de `calcularContracheque`, que é o
 * motor MENSAL. Se elas nascessem neste arquivo, `dominio.ts` teria de IMPORTAR UM VALOR daqui —
 * e este arquivo já importa valores de lá (`calcularContribuicao`, `calcularIrrf`,
 * `sha256Canonico`). Um ciclo de VALOR entre dois módulos ES não é erro de compilação: é uma
 * classe que chega `undefined` em tempo de execução, num `throw`, e o erro que aparece não fala
 * do assunto nenhum. O que `dominio.ts` importa daqui é só TIPO, e tipo é apagado na compilação.
 *
 * Elas continuam sendo parte desta unidade; o que muda é o arquivo em que a classe é declarada.
 */

export class RubricaDoAdiantamentoSalarialSemVersaoError extends Error {
  constructor(codigo: string, regime: string, competencia: string) {
    super(
      `RUBRICA-DO-ADIANTAMENTO-SALARIAL-SEM-VERSAO: a rubrica ${codigo}, que o parâmetro de ` +
        `${competencia} indica como o provento do vale, não tem versão vigente para o regime ${regime} ` +
        `nessa competência. Sem versão, não há incidências nem arredondamento declarados — e o motor ` +
        `não inventa nenhum dos dois. Nada foi calculado.`
    );
    this.name = "RubricaDoAdiantamentoSalarialSemVersaoError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// O PARÂMETRO LIDO
// ═══════════════════════════════════════════════════════════════════════════════

export interface ParametroLidoDoAdiantamentoSalarial {
  readonly id: string;
  readonly competencia: string;
  readonly versao: number;
  readonly percentualDoAdiantamento: Decimal;
  readonly baseDoAdiantamento: BaseDoAdiantamentoSalarial;
  readonly estadoMinimoParaAbater: EstadoMinimoDoAdiantamento;
  readonly ato: {
    readonly esfera: EsferaDoAtoNormativo;
    readonly tipo: TipoDeAtoNormativo;
    readonly numero: string;
    readonly ano: number;
    readonly dispositivo: string;
    readonly ementa: string;
  };
}

/** O retrato do ato que autoriza o abatimento, para a memória do contracheque MENSAL. */
export interface ProcedenciaDoAbatimentoSalarial {
  /** A competência da folha de adiantamento — sempre a mesma da mensal, e a redundância é proposital. */
  readonly competencia: string;
  readonly folhaId: string;
  readonly calculoNumero: number;
  readonly situacaoDaCertificacao: string;
  /** A versão do parâmetro que APUROU o vale — não a vigente agora. Ver `MEMORIA-HISTORICA`. */
  readonly versaoDoParametro: number;
  readonly estadoExigido: EstadoMinimoDoAdiantamento;
  readonly estadoVerificado: EstadoMinimoDoAdiantamento;
  /** O ato do ente que declarou o critério, como ele estava quando o vale foi apurado. */
  readonly ato: string;
}

/**
 * O QUE O MOTOR MENSAL RECEBE PARA ABATER UM VÍNCULO. Opcional na entrada do contracheque: a
 * esmagadora maioria das competências não tem vale, e exigir a chave faria toda folha mensal do
 * ente precisar declarar uma ausência.
 */
export interface AbatimentoDoAdiantamentoSalarial {
  readonly rubrica: RubricaLida;
  readonly valor: Money;
  readonly procedencia: ProcedenciaDoAbatimentoSalarial;
}

// ═══════════════════════════════════════════════════════════════════════════════
// O CONTRACHEQUE DO VALE
// ═══════════════════════════════════════════════════════════════════════════════

export interface EntradaDoAdiantamentoSalarial {
  readonly competencia: string;
  readonly parametro: ParametroLidoDoAdiantamentoSalarial;
  readonly vinculo: { readonly id: string; readonly matricula: string; readonly regime: RegimePrevidenciario };
  /**
   * A BASE, JÁ APURADA POR QUEM SABE APURÁ-LA — e a explicação vem junto, porque é ela que vai à
   * memória e permite ao contracheque se explicar anos depois.
   */
  readonly base: { readonly valor: Money; readonly explicacao: string };
  readonly rubricaDoAdiantamento: RubricaLida;
  /** Os dias computados na competência, para a folha registrar a medida que o tipo declara. */
  readonly diasComputados: number;
  /**
   * ⚠️ AS TABELAS VIGENTES CHEGAM MESMO SEM RETENÇÃO NENHUMA, e não é desperdício.
   *
   * `ContrachequeCalculado` carrega `ResultadoDaContribuicao` e `ResultadoDoIrrf` completos, e
   * esses objetos citam a TABELA e a FUNDAMENTAÇÃO que os produziram. Fabricar um resultado com
   * `tabelaId: null` aqui seria inventar um retrato; passar a tabela real com base ZERO produz o
   * retrato verdadeiro — "esta é a tabela que valia, e a base foi zero porque o vale não retém".
   *
   * ⚠️ E `calcularContribuicao` RECUSA tabela nula fora do regime ISENTO (`dominio.ts`), então
   * inventá-la nem era possível: o chamador é quem tem de ter recusado antes.
   */
  readonly tabelas: {
    readonly contribuicao: TabelaDeContribuicaoLida | null;
    readonly irrf: TabelaIrrfLida;
  };
}

/**
 * CALCULA O CONTRACHEQUE DO ADIANTAMENTO SALARIAL DE UM VÍNCULO.
 *
 *   1. valor = base × percentual do parâmetro, arredondado a 2 casas;
 *   2. UMA linha, de PROVENTO, na rubrica que o parâmetro declara;
 *   3. totais, memória canônica e sha256.
 *
 * ═══ ⚠️ O VALE NÃO SOFRE CONTRIBUIÇÃO NEM IMPOSTO NESTE SISTEMA ═══
 *
 * E isto é ARITMÉTICA INTERNA, não norma afirmada — a diferença importa, porque uma norma
 * afirmada aqui seria inventada. O raciocínio é fechado e conferível:
 *
 *   · o abatimento na mensal é um DESCONTO que NÃO reduz base de contribuição nem de IRRF (a
 *     rubrica é recusada no cadastro se declarar qualquer incidência);
 *   · logo a folha MENSAL da competência calcula contribuição e imposto sobre a remuneração
 *     INTEIRA do mês, o vale incluído;
 *   · se o vale também retivesse, a mesma base seria tributada duas vezes, e a mensal teria de
 *     CREDITAR o já retido — o que exigiria um critério normativo que não foi levantado.
 *
 * A memória DIZ isso com todas as letras, em vez de o operador deduzir do silêncio. Fica nomeado
 * como `INCIDENCIA-NO-ADIANTAMENTO-SALARIAL` no MODULO do M33: se um ente precisar que o vale
 * retenha, é unidade própria, com o critério do crédito na mensal levantado antes.
 */
export function calcularContrachequeDoAdiantamentoSalarial(e: EntradaDoAdiantamentoSalarial): ContrachequeCalculado {
  if (e.base.valor.lte(0)) {
    throw new BaseDoAdiantamentoSalarialAusenteError(e.vinculo.matricula, e.competencia, `a base apurada é ${emProsa(e.base.valor.toFixed(2))}`);
  }

  const pct = e.parametro.percentualDoAdiantamento;
  const valor = toMoney(e.base.valor.times(pct));

  const r = e.rubricaDoAdiantamento;
  const linha: LinhaCalculada = {
    rubricaId: r.id,
    codigo: r.codigo,
    descricao: r.descricao,
    tipo: r.tipo,
    natureza: r.natureza,
    ordem: r.ordem,
    valorBase: e.base.valor,
    fator: pct,
    valor,
    // ⚠️ AS INCIDÊNCIAS SAÍDAS DA RUBRICA, e não `false` cravado: quem declara é a versão vigente.
    // O que este motor garante é que NADA é retido aqui (não há linha de contribuição nem de
    // IRRF), e a memória abaixo afirma isso; mentir sobre as incidências DA RUBRICA seria outra
    // coisa, e apareceria na complementar, que compara rubrica a rubrica.
    incideContribuicao: r.incideContribuicao,
    incideIrrf: r.incideIrrf,
    memoria:
      `${e.base.explicacao}; adiantamento = ${pct.times(100).toFixed(2).replace(".", ",")}% × ` +
      `${emProsa(e.base.valor.toFixed(2))} = ${emProsa(valor.toFixed(2))}. ` +
      `Sem contribuição e sem IRRF nesta folha: a mensal de ${e.competencia} tributa a remuneração ` +
      `INTEIRA do mês (o abatimento é desconto que não reduz base), e reter aqui tributaria duas vezes.`,
  };

  const linhas: readonly LinhaCalculada[] = [linha];
  const proventos = sumMoney(linhas.filter((l) => l.tipo === "PROVENTO").map((l) => l.valor));
  const descontos = sumMoney(linhas.filter((l) => l.tipo === "DESCONTO").map((l) => l.valor));
  const liquido = toMoney(proventos.minus(descontos));

  // ⚠️ AS ESTRUTURAS DE CONTRIBUIÇÃO E IRRF EXISTEM COM BASE ZERO, e não são omitidas: o
  // `ContrachequeCalculado` é o mesmo contrato dos outros motores, e um `null` aqui obrigaria
  // cada leitor (tela, certificação, apropriação, complementar) a tratar mais um caso.
  const contribuicao = calcularContribuicao({ regime: e.vinculo.regime, base: toMoney(0), tabela: e.tabelas.contribuicao });
  const irrf = calcularIrrf({
    rendaTributavel: toMoney(0),
    contribuicao: toMoney(0),
    dependentes: 0,
    pensaoAlimenticia: toMoney(0),
    // ⚠️ `false` porque a base é ZERO e a isenção do maior de 65 é uma DEDUÇÃO sobre renda: com
    // renda zero ela não muda nada. Ler a data de nascimento aqui pediria mais um campo de
    // entrada para produzir exatamente o mesmo resultado.
    maior65: false,
    tabela: e.tabelas.irrf,
  });

  const memoria: Record<string, unknown> = {
    motor: VERSAO_DO_MOTOR_DO_ADIANTAMENTO_SALARIAL,
    competencia: e.competencia,
    vinculo: { id: e.vinculo.id, matricula: e.vinculo.matricula, regime: e.vinculo.regime },
    /**
     * ⚠️ O BLOCO `parametro` É O QUE TORNA O ABATIMENTO DA MENSAL POSSÍVEL SEM FK, e é também o
     * que faz "alteração de parâmetro não reescreve cálculo fechado" ser verdade por construção.
     *
     * A mensal da mesma competência lê daqui a VERSÃO que apurou o vale, e carrega ESSA versão
     * para conferir o critério — nunca a vigente agora. Sem este bloco, um ente que cadastrasse a
     * versão 2 entre o vale e a mensal faria a mensal abater sob um critério que ninguém aplicou.
     */
    parametro: {
      id: e.parametro.id,
      versao: e.parametro.versao,
      competencia: e.parametro.competencia,
      percentualDoAdiantamento: pct.toFixed(4),
      baseDoAdiantamento: e.parametro.baseDoAdiantamento,
      estadoMinimoParaAbater: e.parametro.estadoMinimoParaAbater,
      ato: `${e.parametro.ato.tipo} ${e.parametro.ato.numero}/${e.parametro.ato.ano}, ${e.parametro.ato.dispositivo}`,
    },
    base: { valor: e.base.valor.toFixed(2), explicacao: e.base.explicacao, pratica: e.parametro.baseDoAdiantamento },
    /**
     * ⚠️ A DECLARAÇÃO DE QUE ISTO NÃO É A REMUNERAÇÃO DO MÊS — lida pela tela do contracheque
     * (`memoria-do-contracheque.ts`). Sem ela, a tela mostraria "30/30 dias" num documento que
     * mede PERCENTUAL sobre base monetária, que é a mesma mentira que este módulo já registrou
     * duas vezes (a folha de 13º e a complementar).
     */
    natureza: "ADIANTAMENTO_SALARIAL_NAO_E_A_REMUNERACAO_DA_COMPETENCIA",
    regimeDeTributacao: "SEM_RETENCAO_NESTA_FOLHA",
    medida: {
      unidade: "PERCENTUAL",
      explicacao: `${pct.times(100).toFixed(2).replace(".", ",")}% da base declarada pelo parâmetro (versão ${e.parametro.versao})`,
    },
    linhas: [
      {
        codigo: linha.codigo,
        descricao: linha.descricao,
        tipo: linha.tipo,
        natureza: linha.natureza,
        valorBase: linha.valorBase.toFixed(2),
        fator: linha.fator.toFixed(6),
        valor: linha.valor.toFixed(2),
        incideContribuicao: linha.incideContribuicao,
        incideIrrf: linha.incideIrrf,
        memoria: linha.memoria,
        versaoDaRubrica: r.versao,
        fundamentacao: r.fundamentacaoLegal,
      },
    ],
    totais: {
      proventos: proventos.toFixed(2),
      descontos: descontos.toFixed(2),
      liquido: liquido.toFixed(2),
      baseContribuicao: "0.00",
      contribuicao: "0.00",
      baseIrrf: "0.00",
      irrf: "0.00",
    },
  };

  return {
    vinculoId: e.vinculo.id,
    regime: e.vinculo.regime,
    diasComputados: e.diasComputados,
    linhas,
    totais: {
      proventos,
      descontos,
      liquido,
      baseContribuicao: toMoney(0),
      contribuicao: toMoney(0),
      baseIrrf: toMoney(0),
      irrf: toMoney(0),
    },
    contribuicao,
    irrf,
    salarioFamilia: null,
    memoria,
    sha256: sha256Canonico(memoria),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A ENTRADA DO CADASTRO
// ═══════════════════════════════════════════════════════════════════════════════

const zAutor = z.string().min(1);

export const zCadastrarParametroDoAdiantamentoSalarialInput = zReferenciaNormativaInput.extend({
  competencia: zCompetencia,
  /**
   * ⚠️ MAIOR QUE ZERO, e o CHECK do banco repete. Um vale de 0% produziria uma folha inteira de
   * contracheques de zero, que fecha, empenha e liquida sem nada acusar — e o operador sairia
   * convencido de que pagou. Quem não paga vale não cadastra parâmetro.
   */
  percentualDoAdiantamento: z
    .union([z.string(), z.number(), z.instanceof(Decimal)])
    .transform((v) => new Decimal(v))
    .refine((d) => d.gt(0) && d.lte(1), "percentual maior que 0 e até 1 (0.4 = 40%)"),
  baseDoAdiantamento: z.enum(BASES_DO_ADIANTAMENTO_SALARIAL),
  /**
   * ⚠️ OBRIGATÓRIO, SEM `optional()` E SEM DEFAULT — e é aqui que ele difere do campo equivalente
   * do 13º, que nasceu nulável.
   *
   * Lá o nulo era o estado REAL dos parâmetros já gravados: eles foram cadastrados quando a
   * pergunta não existia, e inventar `FECHADO` para eles seria afirmar que o ente declarou o que
   * ninguém lhe perguntou. Aqui não há linha anterior nenhuma — a tabela nasce vazia nesta
   * rodada —, então exigir a declaração não quebra passado e fecha a porta do abatimento que é
   * simulação sem ninguém perceber que é.
   *
   * ⚠️ E O `default("FECHADO")` QUE SERIA CÔMODO É EXATAMENTE O QUE NÃO SE PODE ESCREVER: fechar
   * não é pagar, e um default aqui faria o sistema declarar, em nome do município, que congelar o
   * cálculo basta para descontar do servidor.
   */
  estadoMinimoParaAbater: z.enum(["FECHADO", "CERTIFICADO", "PAGO"]),
  rubricaDoAdiantamentoId: z.string().min(1),
  rubricaDoAbatimentoId: z.string().min(1),
  criadoPor: zAutor,
});
export type CadastrarParametroDoAdiantamentoSalarialInput = z.input<typeof zCadastrarParametroDoAdiantamentoSalarialInput>;
