import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ AS COMPRAS — M11 (TR 5.17.46–5.17.57 e 5.17.96–5.17.105), V4 §8 Fila A ═══
 *
 * Solicitação de compra, pesquisa de preços e ordem de compra (com o recebimento). Os três têm
 * ITENS — e itens são entradas de múltiplas linhas, que o molde não monta por decisão (limite 2).
 * Por isso cada listagem recebe uma ILHA escrita à mão como formulário de criação
 * (`FormSolicitacao`, `FormPesquisaDePrecos`, `FormOrdemDeCompra`) e o recebimento da ordem é
 * outra ilha no detalhe (`FormRecebimento`). Os `campos` declarados abaixo descrevem o CABEÇALHO
 * (é o que as opções da porta preenchem e o que o guard t20 confere); as linhas são das ilhas.
 *
 * ⚠️ TUDO É DERIVADO: a situação da solicitação vem do último movimento; média, mínimo e máximo da
 * pesquisa vêm das cotações; o saldo a receber da ordem vem de quantidade − Σ recebimentos, item a
 * item. Nenhuma coluna de saldo ou de situação.
 */

const OPCOES_DE_SITUACAO_DA_SOLICITACAO = [
  { valor: "PENDENTE", rotulo: "Pendente" },
  { valor: "AUTORIZADA", rotulo: "Autorizada" },
  { valor: "ANULADA", rotulo: "Anulada" },
];

export const SOLICITACOES_DE_COMPRA: DefinicaoDeRecurso = definirRecurso({
  nome: "solicitacoes-de-compra",
  rotulo: "Solicitações de compra",
  rotuloSingular: "Solicitação de compra",
  rota: "/licitacoes/solicitacoes",
  descricao:
    "A requisição ao Compras: o setor pede os itens com justificativa e solicitante. Autorizar e anular são fatos " +
    "com data, motivo e autor; a situação é o último deles. Da solicitação autorizada nascem a pesquisa de preços e " +
    "a ordem de compra.",
  campos: [
    { nome: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "SC-2026-001" },
    { nome: "setorId", rotulo: "Setor solicitante", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "solicitante", rotulo: "Solicitante", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "justificativa", rotulo: "Justificativa", tipo: "textoLongo", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "setor", cabecalho: "Setor", tipo: "texto" },
    { nome: "data", cabecalho: "Data", tipo: "data", ordenavel: true },
    { nome: "solicitante", cabecalho: "Solicitante", tipo: "texto" },
    { nome: "itens", cabecalho: "Itens", tipo: "inteiro" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou solicitante", tipo: "texto", largura: 2 },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_SITUACAO_DA_SOLICITACAO },
  ],
  acoes: [
    {
      nome: "autorizar", rotulo: "Autorizar a solicitação", acaoDoCenso: "MOVIMENTAR_SOLICITACAO_DE_COMPRA",
      aviso: "Autorizar é um fato com data e motivo; autorizar duas vezes é recusado.",
      campos: [
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "anular", rotulo: "Anular a solicitação", acaoDoCenso: "MOVIMENTAR_SOLICITACAO_DE_COMPRA",
      aviso: "Só a solicitação autorizada se anula; a pendente se deixa pendente.",
      campos: [
        { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
  ],
  permissoes: { criar: "REGISTRAR_SOLICITACAO_DE_COMPRA" },
  abas: ["dados", "historico"],
});

export const PESQUISAS_DE_PRECOS: DefinicaoDeRecurso = definirRecurso({
  nome: "pesquisas-de-precos",
  rotulo: "Pesquisas de preços",
  rotuloSingular: "Pesquisa de preços",
  rota: "/licitacoes/pesquisas-de-precos",
  descricao:
    "A planilha de preços que estima o valor de uma aquisição: itens com quantidade e as cotações por fornecedor. " +
    "Média, mínimo e máximo são derivados das cotações a cada leitura — nunca colunas.",
  campos: [
    { nome: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "PP-2026-001" },
    { nome: "objeto", rotulo: "Objeto", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "data", rotulo: "Data", tipo: "data", obrigatorio: true, largura: 1 },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "objeto", cabecalho: "Objeto", tipo: "texto" },
    { nome: "data", cabecalho: "Data", tipo: "data", ordenavel: true },
    { nome: "itens", cabecalho: "Itens", tipo: "inteiro" },
    { nome: "cotacoes", cabecalho: "Cotações", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Número ou objeto", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "REGISTRAR_PESQUISA_DE_PRECOS" },
  abas: ["dados", "historico"],
});

export const ORDENS_DE_COMPRA: DefinicaoDeRecurso = definirRecurso({
  nome: "ordens-de-compra",
  rotulo: "Ordens de compra",
  rotuloSingular: "Ordem de compra",
  rota: "/licitacoes/ordens-de-compra",
  descricao:
    "A ordem de compra ou serviço — ordinária, global ou estimativa — ao fornecedor, por processo licitatório ou " +
    "dispensa, com os itens e o recurso orçamentário. O recebimento é por item; o saldo a receber é derivado.",
  campos: [
    { nome: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "OC-2026-001" },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
      { valor: "ORDINARIA", rotulo: "Ordinária" },
      { valor: "GLOBAL", rotulo: "Global" },
      { valor: "ESTIMATIVA", rotulo: "Estimativa" },
    ] },
    { nome: "fornecedorId", rotulo: "Fornecedor", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "processoId", rotulo: "Processo licitatório", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "fichaId", rotulo: "Recurso orçamentário (ficha)", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "dataEmissao", rotulo: "Emissão", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "dataVencimento", rotulo: "Vencimento", tipo: "data", largura: 1 },
    { nome: "desconto", rotulo: "Desconto (R$)", tipo: "dinheiro", largura: 1 },
    { nome: "consumoImediato", rotulo: "Consumo imediato", tipo: "booleano", largura: 1 },
    { nome: "finalidade", rotulo: "Finalidade", tipo: "textoLongo", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "fornecedor", cabecalho: "Fornecedor", tipo: "texto" },
    { nome: "dataEmissao", cabecalho: "Emissão", tipo: "data", ordenavel: true },
    { nome: "total", cabecalho: "Total", tipo: "dinheiro", somavel: true },
    { nome: "pendente", cabecalho: "A receber", tipo: "dinheiro", somavel: true },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou fornecedor", tipo: "texto", largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1, opcoes: [
      { valor: "ORDINARIA", rotulo: "Ordinária" },
      { valor: "GLOBAL", rotulo: "Global" },
      { valor: "ESTIMATIVA", rotulo: "Estimativa" },
    ] },
  ],
  acoes: [
    {
      nome: "estornar", rotulo: "Estornar a ordem", acaoDoCenso: "ESTORNAR_ORDEM_DE_COMPRA",
      aviso: "Ordem com recebimento não se estorna (estorne os recebimentos antes); ordem empenhada só se estorna pelo estorno do empenho.",
      irreversivel: true,
      campos: [{ nome: "motivo", rotulo: "Motivo (mínimo 5 caracteres)", tipo: "texto", obrigatorio: true, largura: 4 }],
    },
  ],
  permissoes: { criar: "EMITIR_ORDEM_DE_COMPRA" },
  abas: ["dados", "historico"],
});
