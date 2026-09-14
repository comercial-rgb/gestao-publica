import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos";

/**
 * ═══ A CARTA DE SERVIÇOS — a configuração (M21, V6.2 P3) ═══
 *
 * O serviço é a identidade estável (endereço público, título, público, tipo e o ASSUNTO do protocolo que
 * o executa). O conteúdo e o formulário vivem em VERSÕES, cadastradas no detalhe (o formulário é uma
 * lista de campos — ilha, limite 2 do molde) e publicadas por um ato próprio. Publicada, a versão não
 * muda; a carta mostra a última publicada, e o pedido fica na versão em que foi feito.
 *
 * ⚠️ O QUE A CARTA MOSTRA É O QUE EXECUTA: as etapas publicadas são copiadas do roteiro do assunto no
 * ato da publicação. Não há desenho de fluxo à parte.
 */
export const OPCOES_DE_PUBLICO = [
  { valor: "CIDADAO", rotulo: "Cidadão" },
  { valor: "FORNECEDOR", rotulo: "Fornecedor" },
  { valor: "SERVIDOR", rotulo: "Servidor" },
] as const;

export const OPCOES_DE_TIPO_DE_SERVICO = [
  { valor: "REQUERIMENTO_ADMINISTRATIVO", rotulo: "Requerimento administrativo" },
  { valor: "ATUALIZACAO_CADASTRAL", rotulo: "Atualização cadastral (só campos do cadastro de pessoa)" },
  { valor: "COMPLEMENTO_DE_FORNECEDOR", rotulo: "Complemento documental de fornecedor (só por representação)" },
] as const;

export const SERVICOS_DA_CARTA: DefinicaoDeRecurso = definirRecurso({
  nome: "servicos-da-carta",
  rotulo: "Carta de serviços",
  rotuloSingular: "Serviço da carta",
  rota: "/protocolo/servicos",
  descricao:
    "O que o ente oferece ao público pela internet. Cada serviço aponta para um assunto do protocolo (roteiro, sigilo e " +
    "termo vêm dele); o conteúdo e o formulário são versionados, e só a versão publicada aparece na carta.",
  campos: [
    { nome: "titulo", rotulo: "Título do serviço", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "slug", rotulo: "Endereço público (minúsculas e hífen)", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "atualizar-cadastro", ajuda: "Vira /servicos/<endereço>. Não muda entre versões." },
    { nome: "categoria", rotulo: "Categoria", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "publico", rotulo: "Público", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...OPCOES_DE_PUBLICO] },
    { nome: "tipo", rotulo: "Tipo de serviço", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [...OPCOES_DE_TIPO_DE_SERVICO] },
    { nome: "assuntoId", rotulo: "Assunto do protocolo que executa o serviço", tipo: "selecao", obrigatorio: true, largura: 4, opcoes: [] },
  ],
  colunas: [
    { nome: "titulo", cabecalho: "Serviço", tipo: "link" },
    { nome: "endereco", cabecalho: "Endereço público", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "publicada", cabecalho: "Versão publicada", tipo: "texto" },
    { nome: "rascunho", cabecalho: "Rascunho", tipo: "texto" },
    { nome: "solicitacoes", cabecalho: "Solicitações", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Título ou endereço", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "publicar-versao", rotulo: "Publicar uma versão", acaoDoCenso: "CONFIGURAR_CARTA_DE_SERVICOS", irreversivel: true,
      aviso: "Publicada, a versão não muda e passa a ser a da carta. As etapas mostradas ao público são copiadas agora do roteiro do assunto. Pedidos já feitos continuam na versão deles.",
      campos: [{ nome: "versaoId", rotulo: "Versão em rascunho", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] }],
    },
  ],
  acoesPorEstado: true,
  permissoes: { criar: "CONFIGURAR_CARTA_DE_SERVICOS" },
  abas: ["dados", "historico"],
});
