import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * V36 — AS PARCERIAS PÚBLICO-PRIVADAS (TR 5.10.1.87-89), pelo MOLDE. O cadastro é criado na lista; a situação e as
 * parcelas entram pelo detalhe; os documentos, pela aba Anexos; os empenhos vinculados aparecem no resumo do detalhe.
 */

const DINHEIRO = { tipo: "dinheiro" as const, obrigatorio: true, largura: 1 as const };

export const PARCERIAS_PUBLICO_PRIVADAS: DefinicaoDeRecurso = definirRecurso({
  nome: "parcerias-publico-privadas",
  rotulo: "Parcerias público-privadas",
  rotuloSingular: "Parceria público-privada",
  rota: "/licitacoes/ppp",
  descricao:
    "Contratos de parceria público-privada (Lei 11.079/2004): tipo, empresa parceira, objeto, vigência e valores, " +
    "a situação, as parcelas previstas por exercício, os documentos e os empenhos vinculados.",
  campos: [
    { nome: "numero", rotulo: "Número do contrato", tipo: "texto", obrigatorio: true, largura: 1 },
    {
      nome: "tipo", rotulo: "Tipo da parceria", tipo: "selecao", obrigatorio: true, largura: 1,
      opcoes: [{ valor: "PATROCINADA", rotulo: "Concessão patrocinada" }, { valor: "ADMINISTRATIVA", rotulo: "Concessão administrativa" }],
      ajuda: "Lei 11.079/2004, art. 2º, §§ 1º e 2º.",
    },
    { nome: "parceiroPrivado", rotulo: "Empresa parceira", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "objeto", rotulo: "Objeto da parceria", tipo: "textoLongo", obrigatorio: true, largura: 4 },
    { nome: "vigenciaInicio", rotulo: "Início da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "vigenciaFim", rotulo: "Fim da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "valorGlobal", rotulo: "Valor global (R$)", ...DINHEIRO },
    { nome: "contraprestacaoAnual", rotulo: "Contraprestação anual (R$)", ...DINHEIRO, ajuda: "Entra no limite de 5% da receita corrente líquida (Lei 11.079, art. 28)." },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Contrato", tipo: "link", ordenavel: true },
    { nome: "parceiro", cabecalho: "Empresa parceira", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "valorGlobal", cabecalho: "Valor global", tipo: "dinheiro", somavel: true },
  ],
  filtros: [{ nome: "texto", rotulo: "Contrato, empresa ou objeto", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "situacao", rotulo: "Mudar a situação", acaoDoCenso: "CADASTRAR_CONTRATO",
      campos: [
        {
          nome: "situacao", rotulo: "Nova situação", tipo: "selecao", obrigatorio: true, largura: 1,
          opcoes: [
            { valor: "EM_EXECUCAO", rotulo: "Em execução" },
            { valor: "SUSPENSA", rotulo: "Suspensa" },
            { valor: "ENCERRADA", rotulo: "Encerrada" },
            { valor: "RESCINDIDA", rotulo: "Rescindida" },
          ],
        },
        { nome: "data", rotulo: "Desde", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "textoLongo", obrigatorio: true, largura: 4 },
      ],
    },
    {
      nome: "parcelas", rotulo: "Informar parcelas por exercício", acaoDoCenso: "CADASTRAR_CONTRATO",
      aviso: "Uma parcela por linha: ano e valor. Informar de novo um ano substitui o valor vigente; o anterior fica no histórico.",
      campos: [{ nome: "linhas", rotulo: "Parcelas (ano; valor)", tipo: "textoLongo", obrigatorio: true, largura: 4, placeholder: "2027; 1.250.000,00\n2028; 1.300.000,00" }],
    },
  ],
  permissoes: { criar: "CADASTRAR_CONTRATO", anexar: "ANEXAR_ARQUIVO" },
  abas: ["dados", "anexos", "historico"],
  donoDoAnexo: "contratoPppId",
});
