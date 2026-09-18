/**
 * ═══ A POLÍTICA DE PUBLICAÇÃO DE PESSOAL (V11 V4.2) ═══
 *
 * ⚠️ FAIL-CLOSED POR CONSTRUÇÃO. Sem política APROVADA vigente na competência, o demonstrativo
 * individual publica ZERO linhas — nem nome, nem valor. O portal diz que a regra não foi
 * declarada e nomeia o ato que falta. Remuneração nominal é dado pessoal: expô-la sem um ato do
 * ente que a fundamente é uma decisão que ninguém tomou, tomada por omissão.
 *
 * ⚠️ O QUE NÃO PODE SER PUBLICADO NÃO ESTÁ NO TIPO. `ColunaDoDemonstrativo` é o universo fechado
 * do que uma política pode sequer declarar. `NUNCA_PUBLICAVEL` abaixo não é uma lista negra a ser
 * consultada em tempo de execução — lista negra é exatamente o que este repositório proíbe: ela é
 * a DOCUMENTAÇÃO de por que cada item ficou fora do tipo, e o insumo do teste de negação. A
 * proibição é estrutural.
 *
 * ⚠️ A PROJEÇÃO RECONSTRÓI, NÃO FILTRA. `projetarLinhaPublica` monta o objeto de saída percorrendo
 * as colunas DECLARADAS e puxando cada valor por um extrator próprio. Pegar a linha interna e
 * apagar o que não pode é o antipadrão que `lib/portas/bens-publicos.ts` já nomeia: o campo novo,
 * acrescentado meses depois, entra em silêncio. Aqui um campo novo só aparece se alguém o
 * acrescentar ao tipo, escrever o fundamento e a política declará-lo.
 */

export type ColunaDoDemonstrativo =
  | "NOME"
  | "MATRICULA"
  | "CARGO"
  | "LOTACAO"
  | "TIPO_DE_VINCULO"
  | "REGIME_PREVIDENCIARIO"
  | "PROVENTOS"
  | "DESCONTOS"
  | "LIQUIDO";

export interface DescricaoDaColuna {
  readonly rotulo: string;
  /** Por que esta coluna PODE ser declarada publicável — e o que ela expõe. */
  readonly fundamento: string;
}

/**
 * ⚠️ RECORD EXAUSTIVO. Um valor novo no tipo não compila até alguém escrever o rótulo e o
 * fundamento — que é o momento em que a decisão de exposição aparece na revisão, em vez de
 * acontecer. É o mesmo desenho de `EXPOSICAO_DO_BENEFICIARIO`, que cobre os 78 elementos de
 * despesa e não deixa elemento novo passar sem decisão.
 */
export const COLUNAS_DO_DEMONSTRATIVO: Record<ColunaDoDemonstrativo, DescricaoDaColuna> = {
  NOME: {
    rotulo: "Nome",
    fundamento:
      "Identifica nominalmente o servidor. É a coluna mais sensível do conjunto: só o ente pode declará-la, e o ato que a autoriza precisa estar na fundamentação da política.",
  },
  MATRICULA: {
    rotulo: "Matrícula",
    fundamento: "Identificador funcional. Permite acompanhar um vínculo ao longo das competências sem nomear a pessoa.",
  },
  CARGO: { rotulo: "Cargo", fundamento: "O cargo ocupado na competência, do histórico do vínculo — não o de hoje." },
  LOTACAO: { rotulo: "Lotação", fundamento: "A unidade onde o servidor estava lotado na competência." },
  TIPO_DE_VINCULO: { rotulo: "Vínculo", fundamento: "Efetivo, comissionado, temporário. Diz sob que regra a pessoa foi admitida." },
  REGIME_PREVIDENCIARIO: { rotulo: "Regime", fundamento: "RGPS, RPPS ou isento. É informação de regime, não de saúde nem de benefício." },
  PROVENTOS: {
    rotulo: "Proventos",
    fundamento:
      "A SOMA dos proventos do contracheque. Nunca a rubrica a rubrica: o detalhamento revelaria adicionais que descrevem a vida funcional e, em alguns entes, a de saúde.",
  },
  DESCONTOS: {
    rotulo: "Descontos",
    fundamento:
      "A SOMA dos descontos. Nunca a rubrica a rubrica: ali moram pensão alimentícia, plano de saúde e consignações, que são vida privada e não têm finalidade pública.",
  },
  LIQUIDO: {
    rotulo: "Líquido",
    fundamento:
      "Proventos menos descontos. Publicá-lo ao lado dos dois permite conferir a conta; publicá-lo sozinho deixaria a diferença inexplicada.",
  },
};

export const TODAS_AS_COLUNAS: readonly ColunaDoDemonstrativo[] = Object.keys(COLUNAS_DO_DEMONSTRATIVO) as ColunaDoDemonstrativo[];

/**
 * ⚠️ O QUE FICOU FORA DO TIPO, E POR QUÊ. Isto é documentação e insumo de teste — não é consultado
 * em tempo de execução, porque uma lista negra consultada é uma lista negra que se pode esquecer
 * de consultar. Nenhum destes campos é declarável por política nenhuma.
 */
export const NUNCA_PUBLICAVEL: Readonly<Record<string, string>> = {
  dependentes: "Nome, CPF, parentesco e data de nascimento de terceiros que não são parte da relação funcional.",
  planoDeSaude: "A finalidade PLANO_SAUDE de um dependente é fato de saúde, protegido em qualquer leitura da LGPD.",
  pensaoAlimenticia: "Desconto individualizado que revela decisão judicial de família.",
  invalidezPermanente: "Fato de saúde do dependente.",
  memoriaDeCalculo:
    "Contracheque.memoria carrega dependentes NOMINADOS do salário-família, a contagem de dependentes do IRRF e o marcador de maior de 65 anos. O demonstrativo público não tem memória: ela se reconstrói, não se filtra.",
  baseContribuicao: "Tributação individual do servidor.",
  contribuicao: "Tributação individual do servidor.",
  baseIrrf: "Tributação individual do servidor.",
  irrf: "Tributação individual do servidor.",
  rubricaARubrica: "O detalhe por rubrica expõe pensão, saúde e consignação; só as somas são publicáveis.",
  documento: "CPF do servidor. Dado pessoal sem finalidade pública neste demonstrativo.",
  dataNascimento: "Dado pessoal; permite inferir idade e proximidade de aposentadoria.",
  nomeMae: "Filiação — dado de identificação usado em fraude.",
  nomePai: "Filiação — dado de identificação usado em fraude.",
  endereco: "Localiza fisicamente a pessoa.",
  rgNumero: "Documento de identificação.",
  pisPasep: "Documento de identificação.",
  tituloEleitor: "Documento de identificação.",
  ctpsNumero: "Documento de identificação.",
  fotoCaminho: "Imagem da pessoa.",
  anotacaoFuncional: "Advertência, suspensão e ocorrência são penalidade e acidente de trabalho.",
  motivoDoAfastamento: "A causa de um afastamento é, quase sempre, fato de saúde.",
  avaliacaoDeDesempenho: "Juízo individual sobre a pessoa.",
  sha256: "O hash é do objeto INTERNO; publicá-lo ao lado de um objeto diferente seria prova que não confere.",
};

export type SituacaoDaPolitica = "RASCUNHO" | "APROVADA" | "REVOGADA";

export interface PoliticaLida {
  readonly id: string;
  readonly versao: number;
  readonly competenciaInicio: string;
  readonly competenciaFim: string | null;
  readonly fundamentacaoLegal: string;
  readonly situacao: SituacaoDaPolitica;
  readonly colunas: readonly ColunaDoDemonstrativo[];
}

export class PoliticaAmbiguaError extends Error {
  constructor(readonly competencia: string, readonly versoes: readonly number[]) {
    super(
      `POLITICA-AMBIGUA: ${versoes.length} políticas aprovadas vigem em ${competencia} (${versoes.join(", ")}). Qual delas vale é decisão de quem aprova, não do sistema. Nada foi publicado.`,
    );
    this.name = "PoliticaAmbiguaError";
  }
}

/**
 * A política que vale na competência. `null` = NENHUMA — e nulo NÃO é "publicar o básico":
 * é não publicar nada, com o motivo dito.
 */
export function escolherPoliticaVigente(politicas: readonly PoliticaLida[], competencia: string): PoliticaLida | null {
  const vigentes = politicas.filter(
    (p) =>
      p.situacao === "APROVADA" &&
      p.competenciaInicio <= competencia &&
      (p.competenciaFim === null || p.competenciaFim >= competencia),
  );
  if (vigentes.length === 0) return null;
  if (vigentes.length > 1) throw new PoliticaAmbiguaError(competencia, vigentes.map((p) => p.versao).sort((a, b) => a - b));
  return vigentes[0] ?? null;
}

/** Tudo que o servidor tem internamente. NADA daqui vai à tela sem passar pelo extrator da coluna. */
export interface LinhaBrutaDePessoal {
  readonly nome: string;
  readonly matricula: string;
  readonly cargo: string;
  readonly lotacao: string;
  readonly tipoDeVinculo: string;
  readonly regimePrevidenciario: string;
  readonly proventos: string;
  readonly descontos: string;
  readonly liquido: string;
}

/**
 * ⚠️ UM EXTRATOR POR COLUNA, E ELE É A ÚNICA PORTA DE SAÍDA. Record exaustivo: coluna nova não
 * compila até alguém escrever de onde ela vem. E porque a saída é MONTADA a partir desta tabela,
 * um campo novo em `LinhaBrutaDePessoal` — ou em qualquer coisa que a alimente — não tem por onde
 * vazar: ele simplesmente não é lido.
 */
const EXTRATOR: Record<ColunaDoDemonstrativo, (l: LinhaBrutaDePessoal) => string> = {
  NOME: (l) => l.nome,
  MATRICULA: (l) => l.matricula,
  CARGO: (l) => l.cargo,
  LOTACAO: (l) => l.lotacao,
  TIPO_DE_VINCULO: (l) => l.tipoDeVinculo,
  REGIME_PREVIDENCIARIO: (l) => l.regimePrevidenciario,
  PROVENTOS: (l) => l.proventos,
  DESCONTOS: (l) => l.descontos,
  LIQUIDO: (l) => l.liquido,
};

/**
 * Monta a linha pública com as colunas DECLARADAS, nesta ordem canônica. Devolve pares
 * ordenados — e não um objeto com todas as chaves e algumas vazias, que deixaria o consumidor
 * livre para "preencher depois".
 */
export function projetarLinhaPublica(
  bruta: LinhaBrutaDePessoal,
  colunas: readonly ColunaDoDemonstrativo[],
): readonly { readonly coluna: ColunaDoDemonstrativo; readonly rotulo: string; readonly valor: string }[] {
  const declaradas = new Set(colunas);
  return TODAS_AS_COLUNAS.filter((c) => declaradas.has(c)).map((c) => ({
    coluna: c,
    rotulo: COLUNAS_DO_DEMONSTRATIVO[c].rotulo,
    valor: EXTRATOR[c](bruta),
  }));
}
