import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * AS LEIS ORÇAMENTÁRIAS ANUAIS (V22, M02b) — o descritor do cadastro do ATO: o projeto de lei
 * enviado ao Legislativo, a lei que o aprovou e os anexos.
 *
 * ⚠️ O ORÇAMENTO NÃO É DIGITADO AQUI: as dotações são as fichas, e a consulta /planejamento/loa
 * as consolida (ela aparece em "relacionados"). A permissão é a do serviço (CADASTRAR_LOA); a
 * leitura é a do planejamento (CONSULTAR_PLANEJAMENTO), cobrada nas páginas.
 */
export const LEIS_ORCAMENTARIAS: DefinicaoDeRecurso = definirRecurso({
  nome: "leis-orcamentarias",
  rotulo: "Leis orçamentárias anuais",
  rotuloSingular: "Lei orçamentária anual",
  rota: "/planejamento/leis-orcamentarias",
  descricao:
    "O projeto da Lei Orçamentária Anual enviado ao Legislativo, a lei que o aprovou e os documentos " +
    "anexos, por exercício.",
  campos: [
    { nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", obrigatorio: true, largura: 1, placeholder: "2027" },
    {
      nome: "numeroDoProjeto",
      rotulo: "Número do projeto de lei",
      tipo: "texto",
      obrigatorio: true,
      largura: 1,
      placeholder: "PL 45/2026",
    },
    { nome: "dataDoEnvio", rotulo: "Envio ao Legislativo", tipo: "data", obrigatorio: true, largura: 1 },
    {
      nome: "ementa",
      rotulo: "Ementa",
      tipo: "textoLongo",
      obrigatorio: true,
      largura: 4,
      placeholder: "Estima a receita e fixa a despesa do Município para o exercício de 2027.",
    },
  ],
  colunas: [
    { nome: "exercicio", cabecalho: "Exercício", tipo: "link", ordenavel: true },
    { nome: "projeto", cabecalho: "Projeto de lei", tipo: "texto" },
    { nome: "envio", cabecalho: "Envio", tipo: "data" },
    { nome: "lei", cabecalho: "Lei", tipo: "texto" },
    { nome: "publicacao", cabecalho: "Publicação", tipo: "data" },
    { nome: "anexos", cabecalho: "Anexos", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Exercício, projeto ou lei", tipo: "texto", largura: 2, placeholder: "2027 ou 1.234/2026" }],
  acoes: [
    {
      nome: "registrar-aprovacao",
      rotulo: "Registrar a lei aprovada",
      acaoDoCenso: "CADASTRAR_LOA",
      irreversivel: true,
      aviso: "A lei que aprovou o projeto é registrada uma única vez. Confira o número e as datas no diário oficial.",
      campos: [
        { nome: "numeroDaLei", rotulo: "Número da lei", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "1.234/2026" },
        { nome: "dataDaSancao", rotulo: "Sanção", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "dataDaPublicacao", rotulo: "Publicação", tipo: "data", obrigatorio: true, largura: 1 },
        {
          nome: "veiculoDePublicacao",
          rotulo: "Veículo de publicação",
          tipo: "texto",
          obrigatorio: true,
          largura: 1,
          placeholder: "Diário Oficial do Município",
        },
      ],
    },
  ],
  // A aprovação é registrada uma vez: com a lei já registrada, a ação deixa de ser oferecida (o
  // serviço recusa de qualquer forma — a tela só não oferece o que não cabe).
  acoesPorEstado: true,
  permissoes: { criar: "CADASTRAR_LOA", anexar: "ANEXAR_ARQUIVO" },
  abas: ["dados", "historico", "anexos", "relacionados"],
  donoDoAnexo: "leiOrcamentariaAnualId",
  relacionados: [
    {
      rotulo: "Orçamento consolidado do exercício",
      href: "/planejamento/loa",
      explicacao: "A receita prevista e a despesa fixada por órgão, unidade e função, a partir das fichas do orçamento.",
    },
  ],
});
