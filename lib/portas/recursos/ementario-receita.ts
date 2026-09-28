import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * O EMENTÁRIO DA RECEITA (M04) — o descritor do cadastro das naturezas de receita do ente.
 *
 * ⚠️ SÓ CADASTRO, SEM AÇÃO DE DETALHE E SEM EDIÇÃO. O model `NaturezaReceita` não tem versão:
 * reescrever a descrição de uma natureza já arrecadada mudaria o rótulo de toda guia registrada
 * nela. Por isso a lista não tem link para detalhe e não há ação "editar".
 *
 * A permissão é a do serviço (`cadastrarNaturezaReceita` -> PARAMETRIZAR_ROTEIRO_ORCAMENTARIO); a
 * leitura é a da área da receita (CONSULTAR_RECEITA), cobrada na página.
 */
export const EMENTARIO_DA_RECEITA: DefinicaoDeRecurso = definirRecurso({
  nome: "naturezas-de-receita",
  rotulo: "Naturezas de receita",
  rotuloSingular: "Código de natureza de receita",
  rota: "/receita/naturezas",
  descricao:
    "Ementário da receita do ente: os códigos de natureza de receita em que a arrecadação é " +
    "classificada e que os demonstrativos fiscais utilizam.",
  campos: [
    {
      nome: "codigo",
      rotulo: "Código da natureza",
      tipo: "texto",
      obrigatorio: true,
      largura: 1,
      placeholder: "1.1.1.8.01.1.1",
      ajuda:
        "Oito dígitos, com ou sem pontos, conforme a classificação por natureza de receita " +
        "(Portaria Interministerial STN/SOF nº 163/2001).",
    },
    {
      nome: "descricao",
      rotulo: "Descrição",
      tipo: "texto",
      obrigatorio: true,
      largura: 3,
      placeholder: "IPTU – Principal",
      ajuda: "Como consta no ementário da receita do ente.",
    },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "texto", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto", ordenavel: true },
    { nome: "origem", cabecalho: "Origem", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "arrecadacoes", cabecalho: "Guias registradas", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2, placeholder: "1.1.1.8 ou IPTU" }],
  acoes: [],
  permissoes: { criar: "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO" },
  abas: [],
});
