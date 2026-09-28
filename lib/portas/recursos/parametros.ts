import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";
import type { CampoDoMolde } from "../../molde/tipos.js";

/**
 * ═══ OS PARÂMETROS DE ATUALIZAÇÃO (depreciação, amortização, exaustão) — M10, V3 pacote 2 ═══
 *
 * ⚠️ O QUE ESTA TELA DESTRAVA. `ParametroAtualizacaoClasse` não tinha serviço nem tela: só
 * seed e teste a escreviam, e `atualizarCompetencia` recusava toda classe sem parâmetro. O
 * contador não tinha onde dizer a vida útil de um veículo.
 *
 * ⚠️ VERSIONADO, NO MOLDE DOS ROTEIROS. Cada definição é uma versão com autor, motivo e
 * vigência derivada; a competência processada guarda a memória de cálculo com a versão que
 * usou. Por isso o detalhe tem a aba "histórico".
 *
 * ⚠️ A LISTA MOSTRA TODAS AS CLASSES ATIVAS, parametrizadas ou não — o que o contador precisa
 * ver é o que falta. O `id` da linha é o id da CLASSE, que existe antes do parâmetro.
 *
 * ⚠️ O RESIDUAL É PEDIDO EM PORCENTO (10 = 10%) e vira fração de seis casas na porta. O
 * domínio só conhece a fração; pedir "0.100000" ao operador é pedir que ele erre.
 */

export const OPCOES_DE_METODO: readonly { readonly valor: string; readonly rotulo: string }[] = [
  { valor: "DEPRECIACAO", rotulo: "Depreciação (bens tangíveis)" },
  { valor: "AMORTIZACAO", rotulo: "Amortização (intangíveis)" },
  { valor: "EXAUSTAO", rotulo: "Exaustão (recursos naturais)" },
];

const CAMPOS_DA_VERSAO: readonly CampoDoMolde[] = [
  {
    nome: "metodo", rotulo: "Método", tipo: "selecao", obrigatorio: true, largura: 2,
    opcoes: OPCOES_DE_METODO,
    ajuda: "MCASP: depreciação para bens tangíveis, amortização para intangíveis e exaustão para recursos naturais.",
  },
  { nome: "vidaUtilMeses", rotulo: "Vida útil (meses)", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1, maximo: 1200 },
  {
    nome: "percentualResidual", rotulo: "Valor residual (%)", tipo: "inteiro", obrigatorio: true, largura: 1,
    minimo: 0, maximo: 99,
    ajuda: "Percentual do valor que não é depreciado. Ex.: 10 = 10%.",
  },
  {
    nome: "vigenteDesde", rotulo: "Vigente desde a competência (AAAA-MM)", tipo: "texto", largura: 2,
    placeholder: "2026-05",
    ajuda:
      "Primeira competência calculada com esta versão. Em branco, vale a partir da competência seguinte " +
      "à última processada. Competências já processadas não são alteradas; para corrigi-las, estorne o " +
      "processamento e processe novamente.",
  },
  {
    nome: "motivo", rotulo: "Motivo da versão", tipo: "texto", obrigatorio: true, largura: 4,
    ajuda: "Justificativa do parâmetro, que ficará registrada no histórico.",
  },
];

export const PARAMETROS_DE_ATUALIZACAO: DefinicaoDeRecurso = definirRecurso({
  nome: "parametros-de-atualizacao",
  rotulo: "Parâmetros de depreciação, amortização e exaustão",
  rotuloSingular: "Parâmetro da classe",
  rota: "/patrimonio/parametros-de-atualizacao",
  descricao:
    "Método, vida útil e valor residual de cada classe de bens, usados na depreciação, amortização " +
    "ou exaustão mensal. Cada definição é registrada como versão, com responsável, motivo e vigência. " +
    "Sem parâmetro, a classe não é atualizada.",
  campos: [
    { nome: "classeDeBensId", rotulo: "Classe de bens", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    ...CAMPOS_DA_VERSAO,
  ],
  colunas: [
    { nome: "classe", cabecalho: "Classe", tipo: "link", ordenavel: true },
    { nome: "metodo", cabecalho: "Método", tipo: "texto" },
    { nome: "vidaUtil", cabecalho: "Vida útil", tipo: "texto" },
    { nome: "residual", cabecalho: "Residual", tipo: "texto" },
    { nome: "versao", cabecalho: "Versão", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Classe (código ou descrição)", tipo: "texto", largura: 2 },
    {
      nome: "situacao",
      rotulo: "Situação",
      tipo: "selecao",
      largura: 1,
      opcoes: [
        { valor: "PARAMETRIZADA", rotulo: "Parametrizada" },
        { valor: "PENDENTE", rotulo: "Sem parâmetro" },
        { valor: "ENCERRADA", rotulo: "Atualização encerrada" },
      ],
    },
  ],
  acoes: [
    {
      nome: "definir",
      rotulo: "Definir nova versão do parâmetro",
      acaoDoCenso: "DEFINIR_PARAMETRO_DE_ATUALIZACAO",
      aviso:
        "A nova versão vale a partir da competência informada (ou da seguinte à última processada). " +
        "As competências já processadas mantêm a versão utilizada.",
      campos: CAMPOS_DA_VERSAO,
    },
    {
      nome: "encerrar",
      rotulo: "Encerrar a atualização desta classe",
      acaoDoCenso: "DEFINIR_PARAMETRO_DE_ATUALIZACAO",
      aviso:
        "Registra uma versão que encerra a atualização da classe; o processamento mensal deixa " +
        "de considerá-la. Para retomar, defina uma nova versão.",
      campos: [
        { nome: "motivo", rotulo: "Motivo do encerramento", tipo: "texto", obrigatorio: true, largura: 4 },
      ],
    },
  ],
  permissoes: { criar: "DEFINIR_PARAMETRO_DE_ATUALIZACAO" },
  abas: ["dados", "historico"],
});
