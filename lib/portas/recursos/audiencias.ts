import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * V36 — AS AUDIÊNCIAS PÚBLICAS DO PLANEJAMENTO (M02b, TR 5.9.1.1-2), pelo MOLDE. A audiência é criada na lista; as
 * solicitações da comunidade e a situação delas entram pelo detalhe; os documentos, pela aba Anexos.
 */

const ANO = { tipo: "inteiro" as const, minimo: 1900, maximo: 2200 };
const OPCOES_DE_PECA = [
  { valor: "PPA", rotulo: "Plano Plurianual (PPA)" },
  { valor: "LDO", rotulo: "Lei de Diretrizes Orçamentárias (LDO)" },
  { valor: "LOA", rotulo: "Lei Orçamentária Anual (LOA)" },
];
const OPCOES_DE_SITUACAO = [
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "ACOLHIDA", rotulo: "Acolhida" },
  { valor: "NAO_ACOLHIDA", rotulo: "Não acolhida" },
];

export const AUDIENCIAS_PUBLICAS: DefinicaoDeRecurso = definirRecurso({
  nome: "audiencias-publicas",
  rotulo: "Audiências públicas",
  rotuloSingular: "Audiência pública",
  rota: "/planejamento/audiencias",
  descricao:
    "Audiências públicas de elaboração e discussão do PPA, da LDO e da LOA, com as solicitações da comunidade " +
    "(bairro, solicitante e contato, órgão que analisa e situação) e os documentos da audiência.",
  campos: [
    { nome: "exercicio", rotulo: "Exercício da peça", ...ANO, obrigatorio: true, largura: 1, placeholder: "2027", ajuda: "Para o PPA, o primeiro ano do quadriênio." },
    { nome: "peca", rotulo: "Peça discutida", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_PECA },
    { nome: "data", rotulo: "Data da audiência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "local", rotulo: "Local", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "pauta", rotulo: "Pauta", tipo: "textoLongo", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "data", cabecalho: "Data", tipo: "link", ordenavel: true },
    { nome: "peca", cabecalho: "Peça", tipo: "texto" },
    { nome: "exercicio", cabecalho: "Exercício", tipo: "texto" },
    { nome: "local", cabecalho: "Local", tipo: "texto" },
    { nome: "solicitacoes", cabecalho: "Solicitações", tipo: "inteiro" },
    { nome: "semDecisao", cabecalho: "Sem decisão", tipo: "inteiro" },
  ],
  filtros: [
    { nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", largura: 1 },
    { nome: "peca", rotulo: "Peça", tipo: "selecao", opcoes: OPCOES_DE_PECA, largura: 1 },
  ],
  acoes: [
    {
      nome: "solicitacao", rotulo: "Registrar solicitação da comunidade", acaoDoCenso: "CADASTRAR_PPA",
      campos: [
        { nome: "descricao", rotulo: "Solicitação", tipo: "textoLongo", obrigatorio: true, largura: 4 },
        { nome: "bairro", rotulo: "Bairro a ser atendido", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "orgaoId", rotulo: "Órgão responsável pela análise", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "solicitanteNome", rotulo: "Nome do solicitante", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "solicitanteContato", rotulo: "Contato do solicitante", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "Telefone, e-mail ou endereço" },
      ],
    },
    {
      nome: "situacao", rotulo: "Atualizar a situação de uma solicitação", acaoDoCenso: "CADASTRAR_PPA",
      aviso: "Acolher ou não acolher exige o parecer. A situação anterior fica no histórico.",
      campos: [
        { nome: "solicitacaoId", rotulo: "Solicitação", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "situacao", rotulo: "Nova situação", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_SITUACAO },
        { nome: "parecer", rotulo: "Parecer", tipo: "textoLongo", largura: 4 },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_PPA", anexar: "ANEXAR_ARQUIVO" },
  abas: ["dados", "anexos", "historico"],
  donoDoAnexo: "audienciaPublicaId",
});
