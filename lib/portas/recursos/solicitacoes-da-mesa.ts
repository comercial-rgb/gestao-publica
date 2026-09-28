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
    "Pedidos protocolados pela carta de serviços. Cada pedido tramita como processo digital; nesta tela são " +
    "emitidas exigências ao requerente, registradas as decisões e liberados os documentos de resposta.",
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
      aviso: "O texto é enviado ao requerente exatamente como escrito; não inclua despacho interno, parecer ou nome de servidor. A solicitação aguarda a resposta do requerente para ser decidida.",
      campos: [{ nome: "mensagemAoRequerente", rotulo: "Mensagem ao requerente (o que falta e como enviar)", tipo: "textoLongo", obrigatorio: true, largura: 4 }],
    },
    {
      nome: "decidir", rotulo: "Decidir a solicitação", acaoDoCenso: "DECIDIR_SOLICITACAO_DE_SERVICO", irreversivel: true,
      aviso: "A decisão encerra o processo. O requerente recebe apenas a mensagem; o fundamento interno fica registrado no processo. O deferimento de atualização cadastral gera nova versão do cadastro, desde que o cadastro não tenha sido alterado após o pedido.",
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
