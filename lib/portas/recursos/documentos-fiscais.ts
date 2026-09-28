import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * O DOCUMENTO FISCAL RECEBIDO — M11, V5 Fila A.
 *
 * A criação (cabeçalho + itens) e a importação de XML são ilhas: o molde não monta
 * linhas. Conferir e cancelar são fatos do molde no detalhe. Situação e saldo a
 * liquidar são derivados dos movimentos e das liquidações.
 *
 * Registrar a nota NÃO produz estoque, liquidação nem pagamento. Importar XML é
 * validação estrutural local — não é autorização fiscal.
 */

const OPCOES_DE_MODELO = [
  { valor: "NFE", rotulo: "NF-e" },
  { valor: "NFCE", rotulo: "NFC-e" },
  { valor: "NF_AVULSA", rotulo: "Nota avulsa" },
  { valor: "CTE", rotulo: "CT-e" },
  { valor: "RPS", rotulo: "RPS" },
  { valor: "RECIBO", rotulo: "Recibo" },
  { valor: "OUTRO", rotulo: "Outro" },
];

const OPCOES_DE_SITUACAO = [
  { valor: "REGISTRADO", rotulo: "Registrado" },
  { valor: "CONFERIDO", rotulo: "Conferido" },
  { valor: "CANCELADO", rotulo: "Cancelado" },
  { valor: "SUBSTITUIDO", rotulo: "Substituído" },
];

export const DOCUMENTOS_FISCAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "documentos-fiscais",
  rotulo: "Documentos fiscais recebidos",
  rotuloSingular: "Documento fiscal recebido",
  rota: "/licitacoes/documentos-fiscais",
  descricao:
    "Notas fiscais, recibos e CT-e recebidos dos fornecedores, com os itens. A conferência e o cancelamento são " +
    "registrados separadamente. O registro do documento não dá entrada em estoque nem liquida a despesa.",
  campos: [
    { nome: "emitenteId", rotulo: "Emitente", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "modelo", rotulo: "Modelo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_MODELO },
    { nome: "serie", rotulo: "Série", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "1" },
    { nome: "numero", rotulo: "Número", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "1234" },
    { nome: "dataEmissao", rotulo: "Emissão", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "dataRecebimento", rotulo: "Recebimento", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "chaveAcesso", rotulo: "Chave de acesso (quando houver)", tipo: "texto", largura: 2, placeholder: "44 dígitos" },
    { nome: "ordemId", rotulo: "Ordem de compra", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "contratoId", rotulo: "Contrato", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "empenhoId", rotulo: "Empenho", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "valorBruto", rotulo: "Bruto (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
    { nome: "valorDescontos", rotulo: "Descontos (R$)", tipo: "dinheiro", largura: 1 },
    { nome: "valorAcrescimos", rotulo: "Acréscimos (R$)", tipo: "dinheiro", largura: 1 },
    { nome: "valorTotal", rotulo: "Total (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "modelo", cabecalho: "Modelo", tipo: "texto" },
    { nome: "emitente", cabecalho: "Emitente", tipo: "texto" },
    { nome: "dataRecebimento", cabecalho: "Recebimento", tipo: "data", ordenavel: true },
    { nome: "total", cabecalho: "Total", tipo: "dinheiro", somavel: true },
    { nome: "aLiquidar", cabecalho: "A liquidar", tipo: "dinheiro", somavel: true },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número, série ou emitente", tipo: "texto", largura: 2 },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_SITUACAO },
    { nome: "modelo", rotulo: "Modelo", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_MODELO },
  ],
  acoesPorEstado: true,
  acoes: [
    {
      nome: "conferir",
      rotulo: "Conferir o documento",
      acaoDoCenso: "CONFERIR_DOCUMENTO_FISCAL",
      aviso:
        "Registra a conferência com data e motivo, sem validar a autorização fiscal do documento. Não se aplica a documento já conferido, cancelado ou substituído.",
      campos: [
        { nome: "data", rotulo: "Data da conferência", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (mínimo 5 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "cancelar",
      rotulo: "Cancelar o documento",
      acaoDoCenso: "CANCELAR_DOCUMENTO_FISCAL",
      irreversivel: true,
      aviso:
        "O cancelamento é registrado e o documento original permanece no histórico. Não se aplica a documento vinculado a recebimento ou liquidação ativos.",
      campos: [
        { nome: "data", rotulo: "Data do cancelamento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (mínimo 5 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
  ],
  permissoes: { criar: "REGISTRAR_DOCUMENTO_FISCAL" },
  abas: ["dados", "historico"],
});
