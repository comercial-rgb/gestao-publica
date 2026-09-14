import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos";

/**
 * ═══ A MESA DAS SOLICITAÇÕES DA CARTA (M21, V6.2 P3) ═══
 *
 * O que chegou pela carta de serviços, com a situação que o PROCESSO deriva e a que o REQUERENTE vê.
 * A mesa emite exigência (a mensagem vai ao requerente), decide (mensagem ao requerente separada do
 * fundamento interno) e disponibiliza documento de resposta. Tramitar, receber e pedir parecer
 * continuam no processo digital — a solicitação É um processo, e não há segunda tramitação.
 *
 * ⚠️ A BARRA É PROJETADA PELO ESTADO: exigência pendente trava a decisão; decidida, as duas somem
 * como ato possível e aparecem como situação. Quem decide continua sendo o caso de uso.
 */
export const OPCOES_DA_SITUACAO_NA_MESA = [
  { valor: "RECEBIDA", rotulo: "Aguardando recebimento" },
  { valor: "EM_ANALISE", rotulo: "Em análise" },
  { valor: "AGUARDANDO_VOCE", rotulo: "Aguardando o requerente" },
  { valor: "DEFERIDA", rotulo: "Deferida" },
  { valor: "INDEFERIDA", rotulo: "Indeferida" },
  { valor: "ENCERRADA", rotulo: "Encerrada sem decisão" },
] as const;

export const SOLICITACOES_DA_MESA: DefinicaoDeRecurso = definirRecurso({
  nome: "solicitacoes-da-mesa",
  rotulo: "Mesa das solicitações",
  rotuloSingular: "Solicitação",
  rota: "/protocolo/solicitacoes",
  descricao:
    "Os pedidos protocolados pela carta de serviços. Cada um é um processo digital: tramitar, receber e pedir parecer " +
    "acontecem no processo; aqui a mesa emite exigência ao requerente, decide e libera documento de resposta.",
  campos: [],
  colunas: [
    { nome: "protocolo", cabecalho: "Protocolo", tipo: "link" },
    { nome: "servico", cabecalho: "Serviço (versão)", tipo: "texto" },
    { nome: "titular", cabecalho: "Titular", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "texto" },
    { nome: "setor", cabecalho: "Onde está", tipo: "texto" },
    { nome: "protocoladaEm", cabecalho: "Protocolada em", tipo: "texto" },
  ],
  filtros: [
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", opcoes: [...OPCOES_DA_SITUACAO_NA_MESA], largura: 2 },
    { nome: "q", rotulo: "Protocolo, serviço ou titular", tipo: "texto", largura: 2 },
  ],
  acoes: [
    {
      nome: "emitir-exigencia", rotulo: "Emitir exigência ao requerente", acaoDoCenso: "DECIDIR_SOLICITACAO_DE_SERVICO",
      aviso: "O texto vai ao requerente como está escrito — sem despacho interno, parecer ou nome de servidor. Enquanto não houver resposta, a solicitação não é decidida.",
      campos: [{ nome: "mensagemAoRequerente", rotulo: "Mensagem ao requerente (o que falta e como enviar)", tipo: "textoLongo", obrigatorio: true, largura: 4 }],
    },
    {
      nome: "decidir", rotulo: "Decidir a solicitação", acaoDoCenso: "DECIDIR_SOLICITACAO_DE_SERVICO", irreversivel: true,
      aviso: "A decisão encerra o processo. A mensagem é o que o requerente lê; o fundamento interno fica no processo e não é mostrado a ele. Deferir uma atualização cadastral cria a versão nova do cadastro — e recusa se o cadastro mudou desde o pedido.",
      campos: [
        { nome: "resultado", rotulo: "Resultado", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [{ valor: "DEFERIDA", rotulo: "Deferida" }, { valor: "INDEFERIDA", rotulo: "Indeferida" }] },
        { nome: "mensagemAoRequerente", rotulo: "Mensagem ao requerente", tipo: "textoLongo", obrigatorio: true, largura: 3 },
        { nome: "fundamentoInterno", rotulo: "Fundamento interno (não é mostrado ao requerente)", tipo: "textoLongo", obrigatorio: true, largura: 4 },
      ],
    },
  ],
  acoesPorEstado: true,
  permissoes: {},
  abas: ["dados", "historico"],
});
