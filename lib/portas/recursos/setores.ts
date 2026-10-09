import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * V37 — O CADASTRO DE SETORES (M21). O setor é o requisitante da requisição de material e da solicitação de compra,
 * o destino da tramitação do protocolo e o centro de custo do rateio — e não havia tela que o cadastrasse: sem um
 * seed, nenhuma requisição e nenhuma solicitação se registravam pela tela. O caso de uso (`criarSetor`) já existia,
 * com a autorização na unidade gestora do setor.
 *
 * ⚠️ A UNIDADE GESTORA VEM DA BUSCA (`unidades-para-setor`), só entre as unidades em que a sessão pode criar setor.
 * Oferecer não é autorizar: o caso de uso confere de novo, na transação.
 */
export const SETORES: DefinicaoDeRecurso = definirRecurso({
  nome: "setores",
  rotulo: "Setores",
  rotuloSingular: "Setor",
  rota: "/protocolo/setores",
  descricao:
    "Setores do ente. O setor requisita material ao almoxarifado, solicita compras, recebe processos do protocolo " +
    "e é o centro de custo dos rateios. O código identifica o setor no ente inteiro e não se reaproveita.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "SEC-EDU",
      ajuda: "Maiúsculas, dígitos e hífen; até 10 caracteres." },
    { nome: "nome", rotulo: "Nome do setor", tipo: "texto", obrigatorio: true, largura: 3, placeholder: "Secretaria de Educação" },
    { nome: "unidadeOrcId", rotulo: "Unidade gestora", tipo: "referencia", catalogo: "unidades-para-setor", obrigatorio: true, largura: 2,
      placeholder: "Código ou nome da unidade" },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "nome", cabecalho: "Setor", tipo: "texto", ordenavel: true },
    { nome: "unidade", cabecalho: "Unidade gestora", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou nome", tipo: "texto", largura: 2, placeholder: "SEC-EDU ou Educação" }],
  acoes: [
    { nome: "desativar", rotulo: "Desativar o setor", acaoDoCenso: "CRIAR_SETOR", irreversivel: false,
      aviso: "O setor deixa de aparecer nas requisições e solicitações novas. O que já foi registrado em nome dele permanece. Pode ser reativado.",
      campos: [] },
    { nome: "reativar", rotulo: "Reativar o setor", acaoDoCenso: "CRIAR_SETOR", irreversivel: false,
      aviso: "O setor volta a aparecer nas requisições e solicitações novas.",
      campos: [] },
    { nome: "lotar", rotulo: "Lotar usuário no setor", acaoDoCenso: "LOTAR_USUARIO_NO_SETOR", irreversivel: false,
      aviso: "O usuário passa a receber os processos e as comunicações deste setor. Só usuários ativos podem ser lotados; setor desativado não recebe lotação nova.",
      campos: [
        { nome: "usuarioIdent", rotulo: "Usuário", tipo: "referencia", catalogo: "usuarios-para-lotacao", obrigatorio: true, largura: 3,
          placeholder: "Nome ou identificador do usuário" },
      ] },
    { nome: "desfazer-lotacao", rotulo: "Desfazer lotação", acaoDoCenso: "LOTAR_USUARIO_NO_SETOR", irreversivel: false,
      aviso: "O usuário deixa de receber os processos e as comunicações deste setor. O que ele já fez em nome do setor permanece registrado. Pode ser lotado de novo.",
      campos: [
        { nome: "usuarioIdent", rotulo: "Usuário lotado", tipo: "referencia", catalogo: "lotados-do-setor", contexto: ["__id"], obrigatorio: true, largura: 3,
          placeholder: "Identificador do usuário" },
      ] },
  ],
  permissoes: { criar: "CRIAR_SETOR" },
  abas: ["dados", "relacionados"],
  relacionados: [
    { rotulo: "Requisições de material", href: "/patrimonio/almoxarifado/requisicoes",
      explicacao: "A requisição ao almoxarifado é feita em nome de um setor." },
    { rotulo: "Solicitações de compra", href: "/licitacoes/solicitacoes",
      explicacao: "A solicitação de compra nasce de um setor solicitante." },
  ],
});
