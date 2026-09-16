import { analisar, variaveisDaFormula, FormulaInvalidaError } from "../../packages/formula/index.js";
import type { NaturezaDaRubrica, RegimePrevidenciario } from "./dominio.js";

/**
 * ═══ A RUBRICA VERSIONADA E O GRAFO DE DEPENDÊNCIAS (V11 V1.1) ═══
 *
 * O cadastro de rubricas tinha sete naturezas fechadas e nenhuma vigência. Duas consequências
 * medidas no desenho anterior:
 *   · mudar o percentual de uma gratificação REESCREVIA O PASSADO — a folha lia a linha atual da
 *     `Rubrica`, então recalcular março em setembro usava o percentual de setembro;
 *   · tudo que não fosse "percentual do vencimento" tinha de virar lançamento digitado a mão,
 *     porque não havia como o ente ESCREVER a conta dele.
 *
 * Aqui entram a vigência por competência, o regime aplicável, o aprovador e a FÓRMULA. A fórmula
 * é interpretada por `packages/formula` — universo fechado, sem `eval`, sem `new Function` e sem
 * lista negra (`this.constructor.constructor("…")()` atravessa qualquer lista de palavras).
 */

/**
 * ⚠️ O UNIVERSO FECHADO DE VARIÁVEIS. Uma fórmula só enxerga isto e as OUTRAS rubricas. Não há
 * acesso a objeto, propriedade, cadeia de protótipo, chamada dinâmica nem I/O: o avaliador só vê
 * números. Acrescentar variável aqui é decisão de produto, não efeito colateral de um cadastro.
 *
 * ⚠️ NÃO EXISTE `salario_minimo` NEM `teto_do_rgps` NESTA LISTA, e a ausência é deliberada: são
 * valores normativos que mudam por portaria. Eles entram pela tabela do ente (M33 já tem três) ou
 * por uma rubrica própria — nunca como constante nacional embutida no motor.
 */
export const VARIAVEIS_DO_CONTRACHEQUE: Readonly<Record<string, string>> = {
  vencimento_base: "o vencimento-base vigente do vínculo no último dia da competência (M32)",
  gratificacoes: "a soma das gratificações vigentes do vínculo (M32)",
  dias: "os dias do mês fiscal de 30 em que o vínculo esteve ativo e não afastado",
  fator_dias: "dias ÷ 30",
  dependentes_ir: "quantos dependentes do vínculo têm finalidade de imposto de renda",
};

/** O prefixo pelo qual uma fórmula cita OUTRA rubrica, pelo CÓDIGO que aparece no contracheque. */
export const PREFIXO_DE_RUBRICA = "rubrica.";

/**
 * ⚠️ AS NATUREZAS QUE UMA FÓRMULA PODE CITAR. Contribuição, IRRF e salário-família são calculados
 * DEPOIS dos proventos (a base deles é a soma dos proventos), então uma fórmula que os citasse
 * leria um valor que ainda não existe. Recusa nomeada, não zero em silêncio.
 */
export const NATUREZAS_CITAVEIS: readonly NaturezaDaRubrica[] = [
  "VENCIMENTO_BASE",
  "GRATIFICACOES_DO_VINCULO",
  "VALOR_INFORMADO",
  "PERCENTUAL_DO_VENCIMENTO",
  "FORMULA",
];

export class FormulaDaRubricaInvalidaError extends Error {
  constructor(readonly codigo: string, readonly motivo: string) {
    super(`FORMULA-INVALIDA: rubrica ${codigo} — ${motivo}`);
    this.name = "FormulaDaRubricaInvalidaError";
  }
}

export class DependenciaInexistenteError extends Error {
  constructor(readonly codigo: string, readonly dependencia: string) {
    super(`DEPENDENCIA-INEXISTENTE: a fórmula da rubrica ${codigo} cita ${PREFIXO_DE_RUBRICA}${dependencia}, e não existe rubrica com esse código vigente na competência. Nada foi calculado.`);
    this.name = "DependenciaInexistenteError";
  }
}

export class DependenciaPosteriorError extends Error {
  constructor(readonly codigo: string, readonly dependencia: string, readonly natureza: NaturezaDaRubrica) {
    super(`DEPENDENCIA-POSTERIOR: a fórmula da rubrica ${codigo} cita ${PREFIXO_DE_RUBRICA}${dependencia}, que é ${natureza} — essa rubrica é calculada DEPOIS dos proventos, sobre a base que inclui esta. O valor não existe no momento em que a fórmula roda. Nada foi calculado.`);
    this.name = "DependenciaPosteriorError";
  }
}

export class CicloDeRubricasError extends Error {
  constructor(readonly caminho: readonly string[]) {
    super(`CICLO-DE-RUBRICAS: ${caminho.join(" → ")}. Uma rubrica não pode depender de si mesma, direta ou indiretamente — não há ordem de cálculo possível. Nada foi calculado.`);
    this.name = "CicloDeRubricasError";
  }
}

export class VersaoAmbiguaError extends Error {
  constructor(readonly codigo: string, readonly competencia: string, readonly versoes: readonly number[]) {
    super(`VERSAO-AMBIGUA: a rubrica ${codigo} tem ${versoes.length} versões aprovadas vigentes em ${competencia} (${versoes.join(", ")}). Qual delas vale é decisão de quem aprova, não do motor. Nada foi calculado.`);
    this.name = "VersaoAmbiguaError";
  }
}

export class SemVersaoVigenteError extends Error {
  constructor(readonly codigo: string, readonly competencia: string, readonly regime: RegimePrevidenciario) {
    super(`SEM-VERSAO-VIGENTE: a rubrica ${codigo} não tem versão aprovada vigente em ${competencia} aplicável ao regime ${regime}.`);
    this.name = "SemVersaoVigenteError";
  }
}

export type SituacaoDaVersao = "RASCUNHO" | "APROVADA" | "REVOGADA";
export type AplicabilidadeDeRegime = "TODOS" | RegimePrevidenciario;

export interface VersaoLida {
  readonly id: string;
  readonly versao: number;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly formula: string | null;
  readonly percentual: import("decimal.js").Decimal | null;
  readonly incideContribuicao: boolean;
  readonly incideIrrf: boolean;
  readonly proporcionalAosDias: boolean;
  readonly casasDecimais: number;
  readonly regime: AplicabilidadeDeRegime;
  readonly fundamentacaoLegal: string;
  readonly situacao: SituacaoDaVersao;
}

/**
 * O que a análise de uma fórmula produz. `dependencias` é o que vai para o banco (uma linha por
 * rubrica citada) e o que permite recusar ciclo e referência inexistente ANTES de calcular.
 */
export interface AnaliseDaFormula {
  readonly variaveisDoSistema: readonly string[];
  readonly dependencias: readonly string[];
}

/**
 * Analisa a fórmula de UMA rubrica: sintaxe, universo fechado de variáveis e auto-referência.
 * Não conhece as outras rubricas — quem cruza o grafo é `ordemDeCalculo`.
 */
export function analisarFormulaDaRubrica(codigo: string, formula: string): AnaliseDaFormula {
  const texto = formula.trim();
  if (texto === "") throw new FormulaDaRubricaInvalidaError(codigo, "a fórmula está vazia.");
  try {
    analisar(texto);
  } catch (e) {
    if (e instanceof FormulaInvalidaError) throw new FormulaDaRubricaInvalidaError(codigo, e.message);
    throw e;
  }
  const nomes = variaveisDaFormula(texto);
  const sistema: string[] = [];
  const dependencias: string[] = [];
  for (const nome of nomes) {
    if (nome.startsWith(PREFIXO_DE_RUBRICA)) {
      const alvo = nome.slice(PREFIXO_DE_RUBRICA.length);
      if (alvo === "") throw new FormulaDaRubricaInvalidaError(codigo, `"${nome}" não nomeia rubrica nenhuma depois do ponto.`);
      // ⚠️ AUTO-REFERÊNCIA É CICLO DE COMPRIMENTO 1, e é o caso que mais aparece na tela: o
      // servidor copia a fórmula de uma rubrica para outra e esquece de trocar o código.
      if (alvo === codigo) throw new CicloDeRubricasError([codigo, codigo]);
      dependencias.push(alvo);
      continue;
    }
    if (VARIAVEIS_DO_CONTRACHEQUE[nome] === undefined) {
      throw new FormulaDaRubricaInvalidaError(
        codigo,
        `"${nome}" não é variável do contracheque nem rubrica. Disponíveis: ${Object.keys(VARIAVEIS_DO_CONTRACHEQUE).sort().join(", ")}, ou ${PREFIXO_DE_RUBRICA}CODIGO para citar outra rubrica.`,
      );
    }
    sistema.push(nome);
  }
  return { variaveisDoSistema: [...new Set(sistema)].sort(), dependencias: [...new Set(dependencias)].sort() };
}

/**
 * Escolhe a versão que vale para a competência e o regime do vínculo.
 *
 * ⚠️ REGIME É DO VÍNCULO, NÃO DA PESSOA. A mesma pessoa pode ter matrícula estatutária e contrato
 * temporário; uma regra do RGPS não se aplica ao estatutário só porque é a mesma pessoa. Uma
 * versão com regime específico tem PRECEDÊNCIA sobre `TODOS` — é assim que o ente escreve
 * "para todo mundo é X, para o RPPS é Y" sem ter de duplicar a rubrica.
 */
export function escolherVersaoVigente(
  codigo: string,
  versoes: readonly VersaoLida[],
  competencia: string,
  regime: RegimePrevidenciario,
): VersaoLida | null {
  const vigentes = versoes.filter(
    (v) =>
      v.situacao === "APROVADA" &&
      v.competenciaInicio <= competencia &&
      (v.competenciaFim === null || v.competenciaFim >= competencia) &&
      (v.regime === "TODOS" || v.regime === regime),
  );
  if (vigentes.length === 0) return null;
  const especificas = vigentes.filter((v) => v.regime !== "TODOS");
  const candidatas = especificas.length > 0 ? especificas : vigentes;
  if (candidatas.length > 1) throw new VersaoAmbiguaError(codigo, competencia, candidatas.map((v) => v.versao).sort((a, b) => a - b));
  return candidatas[0] ?? null;
}

export interface NoDoGrafo {
  readonly codigo: string;
  readonly natureza: NaturezaDaRubrica;
  readonly ordem: number;
  /** Vazio para quem não é FORMULA. */
  readonly dependencias: readonly string[];
}

/**
 * A ordem em que as rubricas podem ser calculadas: toda dependência antes de quem depende.
 *
 * Kahn com desempate DETERMINÍSTICO (ordem do contracheque, depois código): duas execuções da
 * mesma folha produzem a mesma sequência, e portanto a mesma memória e o mesmo sha256. Um
 * `Set` iterado na ordem de inserção passaria nos testes e mudaria o hash quando o cadastro
 * mudasse de ordem sem mudar de conteúdo.
 */
export function ordemDeCalculo(nos: readonly NoDoGrafo[]): readonly NoDoGrafo[] {
  const porCodigo = new Map(nos.map((n) => [n.codigo, n]));
  for (const n of nos) {
    for (const d of n.dependencias) {
      const alvo = porCodigo.get(d);
      if (alvo === undefined) throw new DependenciaInexistenteError(n.codigo, d);
      if (!NATUREZAS_CITAVEIS.includes(alvo.natureza)) throw new DependenciaPosteriorError(n.codigo, d, alvo.natureza);
    }
  }

  const comparar = (a: NoDoGrafo, b: NoDoGrafo): number => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo);
  const restantes = new Map(nos.map((n) => [n.codigo, [...n.dependencias]]));
  const saida: NoDoGrafo[] = [];
  const prontos = new Set<string>();

  while (saida.length < nos.length) {
    const disponiveis = [...restantes.entries()]
      .filter(([, deps]) => deps.every((d) => prontos.has(d)))
      .map(([c]) => porCodigo.get(c)!)
      .sort(comparar);
    if (disponiveis.length === 0) {
      // ⚠️ SOBROU GENTE E NINGUÉM ESTÁ PRONTO: há ciclo. O caminho é reconstruído para a
      // mensagem — dizer "há um ciclo" sem dizer QUAL não ajuda quem tem trinta rubricas.
      throw new CicloDeRubricasError(caminhoDoCiclo([...restantes.keys()], porCodigo));
    }
    for (const n of disponiveis) {
      saida.push(n);
      prontos.add(n.codigo);
      restantes.delete(n.codigo);
    }
  }
  return saida;
}

/** Acha um ciclo concreto entre os nós que sobraram, para a mensagem de recusa. */
function caminhoDoCiclo(codigos: readonly string[], porCodigo: ReadonlyMap<string, NoDoGrafo>): readonly string[] {
  const inicio = [...codigos].sort()[0]!;
  const visitados = new Map<string, number>();
  const caminho: string[] = [];
  let atual = inicio;
  for (;;) {
    const jaEm = visitados.get(atual);
    if (jaEm !== undefined) return [...caminho.slice(jaEm), atual];
    visitados.set(atual, caminho.length);
    caminho.push(atual);
    const proximo = (porCodigo.get(atual)?.dependencias ?? []).filter((d) => codigos.includes(d)).sort()[0];
    if (proximo === undefined) return caminho;
    atual = proximo;
  }
}
