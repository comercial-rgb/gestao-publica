import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * AS CAMPANHAS PUBLICITÁRIAS (V22, M05) — o descritor do cadastro que dá nome ao vínculo da nota
 * de empenho com a campanha publicitária.
 *
 * ⚠️ SÓ CADASTRO, SEM EDIÇÃO: a campanha com empenho vinculado é referência de fato contábil (o
 * runtime não tem UPDATE na tabela). A permissão é a do serviço (`cadastrarCampanhaPublicitaria`
 * -> CADASTRAR_CONTRATO); a leitura é a da despesa (CONSULTAR_DESPESA), cobrada na página.
 */
export const CAMPANHAS_PUBLICITARIAS: DefinicaoDeRecurso = definirRecurso({
  nome: "campanhas-publicitarias",
  rotulo: "Campanhas publicitárias",
  rotuloSingular: "Campanha publicitária",
  rota: "/despesa/campanhas-publicitarias",
  descricao:
    "Campanhas publicitárias do ente, com período e contrato de publicidade, para vincular as notas " +
    "de empenho que as custeiam e acompanhar o empenhado por campanha.",
  campos: [
    {
      nome: "identificador",
      rotulo: "Identificador",
      tipo: "texto",
      obrigatorio: true,
      largura: 1,
      placeholder: "CP-001/2026",
      ajuda: "Código da campanha no controle do ente. Único.",
    },
    { nome: "titulo", rotulo: "Título", tipo: "texto", obrigatorio: true, largura: 3, placeholder: "Campanha de vacinação contra a gripe" },
    {
      nome: "objetivo",
      rotulo: "Objetivo",
      tipo: "textoLongo",
      obrigatorio: true,
      largura: 4,
      ajuda: "O que a campanha comunica e a quem se dirige.",
    },
    { nome: "inicio", rotulo: "Início", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "fim", rotulo: "Fim", tipo: "data", largura: 1, ajuda: "Deixe em branco se ainda não houver data de término." },
    {
      nome: "contratoId",
      rotulo: "Contrato de publicidade",
      tipo: "referencia",
      catalogo: "contratos-para-empenho",
      largura: 2,
      placeholder: "Número do contrato ou contratado",
      ajuda: "O contrato com a agência que executa a campanha (Lei 12.232/2010), quando houver.",
    },
  ],
  colunas: [
    { nome: "identificador", cabecalho: "Identificador", tipo: "texto", ordenavel: true },
    { nome: "titulo", cabecalho: "Título", tipo: "texto", ordenavel: true },
    { nome: "periodo", cabecalho: "Período", tipo: "texto" },
    { nome: "contrato", cabecalho: "Contrato", tipo: "texto" },
    { nome: "empenhos", cabecalho: "Empenhos", tipo: "inteiro" },
    { nome: "empenhado", cabecalho: "Empenhado líquido", tipo: "dinheiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Identificador, título ou objetivo", tipo: "texto", largura: 2, placeholder: "CP-001 ou vacinação" }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_CONTRATO" },
  abas: [],
});
