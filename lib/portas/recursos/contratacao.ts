import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";
import { MODALIDADES } from "../../../modules/m11-licitacoes/dominio.js";

/**
 * ═══ A CONTRATAÇÃO — M11, V4 §8 (Fila A): o processo licitatório e o contrato ═══
 *
 * O M11 tinha os serviços (processo, homologação, contrato, aditivo, estorno) e nenhuma tela: um
 * servidor municipal não alcançava. Dois recursos do molde: o PROCESSO (cadastro; homologar,
 * reservar dotação, liberar reserva e contratar como ações do detalhe) e o CONTRATO (entra pelo
 * processo; aditivo e estorno de movimento no detalhe). O empenho vinculado ao contrato e à
 * reserva é feito na tela de empenhos, que ganhou os dois vínculos.
 *
 * ⚠️ TUDO É DERIVADO: a situação do processo vem da homologação (cadastrada ou evento), o valor e
 * a vigência do contrato vêm dos movimentos, o saldo da reserva vem dos empenhos que a consomem.
 * Nenhuma coluna de saldo ou de situação — e a porta não soma por conta própria: chama o M11.
 *
 * ⚠️ AS OPÇÕES CONTEXTUAIS: a reserva a liberar é DESTE processo; o movimento a estornar é DESTE
 * contrato. Oferecer os dos outros seria montar um formulário que o domínio recusa.
 */

export const OPCOES_DE_MODALIDADE = Object.entries(MODALIDADES).map(([valor, m]) => ({ valor, rotulo: `${m.nome} (${m.base})` }));

const OPCOES_DE_HIPOTESE = [
  { valor: "POR_VALOR_OBRAS", rotulo: "Por valor — obras e serviços de engenharia (art. 75, I)" },
  { valor: "POR_VALOR_COMPRAS", rotulo: "Por valor — compras e demais serviços (art. 75, II)" },
  { valor: "OUTRAS", rotulo: "Outras hipóteses do art. 75" },
];

const OPCOES_DE_CATEGORIA = [
  { valor: "FORNECIMENTO_BENS", rotulo: "Fornecimento de bens" },
  { valor: "LOCACAO", rotulo: "Locação" },
  { valor: "PRESTACAO_SERVICOS", rotulo: "Prestação de serviços" },
  { valor: "REALIZACAO_OBRAS", rotulo: "Realização de obras" },
];

const OPCOES_DE_SITUACAO_DO_PROCESSO = [
  { valor: "EM_ANDAMENTO", rotulo: "Em andamento" },
  { valor: "HOMOLOGADO", rotulo: "Homologado" },
];

export const PROCESSOS_LICITATORIOS: DefinicaoDeRecurso = definirRecurso({
  nome: "processos-licitatorios",
  rotulo: "Processos licitatórios",
  rotuloSingular: "Processo licitatório",
  rota: "/licitacoes/processos",
  descricao:
    "O processo de contratação (Lei 14.133/2021): número, modalidade, objeto e valor licitado; a dispensa leva a " +
    "hipótese do art. 75. Homologar, reservar a dotação e contratar são atos do detalhe. A situação é derivada da " +
    "homologação — não há coluna de status.",
  campos: [
    { nome: "numeroProcesso", rotulo: "Número do processo", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026/001" },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_MODALIDADE },
    { nome: "valorLicitado", rotulo: "Valor licitado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1, ajuda: "A estimativa que o certame disputa; o contrato sai do lance." },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 3 },
    { nome: "hipoteseDispensa", rotulo: "Hipótese de dispensa (só para DISPENSA)", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_HIPOTESE, ajuda: "Contratação direta sem base legal é a primeira coisa que o TCE procura." },
    { nome: "dataHomologacao", rotulo: "Data da homologação (se já homologado)", tipo: "data", largura: 1, ajuda: "Em branco: homologa-se depois, pelo detalhe." },
  ],
  colunas: [
    { nome: "numeroProcesso", cabecalho: "Processo", tipo: "link", ordenavel: true },
    { nome: "modalidade", cabecalho: "Modalidade", tipo: "texto" },
    { nome: "objeto", cabecalho: "Objeto", tipo: "texto" },
    { nome: "valorLicitado", cabecalho: "Valor licitado", tipo: "dinheiro", somavel: true, ordenavel: true },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
    { nome: "contratos", cabecalho: "Contratos", tipo: "inteiro" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou objeto", tipo: "texto", largura: 2 },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_MODALIDADE.map((o) => ({ valor: o.valor, rotulo: o.rotulo.split(" (")[0] ?? o.rotulo })) },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_SITUACAO_DO_PROCESSO },
  ],
  acoes: [
    {
      nome: "homologar", rotulo: "Homologar o processo", acaoDoCenso: "HOMOLOGAR_PROCESSO",
      aviso: "A homologação é um FATO com data e autor; homologar duas vezes é recusado. Sem ela não há o que contratar.",
      campos: [{ nome: "data", rotulo: "Data da homologação", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "reservar", rotulo: "Reservar dotação para este processo", acaoDoCenso: "RESERVAR_DOTACAO",
      aviso: "A reserva bloqueia o valor na ficha e fica VINCULADA ao processo: só um empenho com contrato deste processo a consome.",
      campos: [
        { nome: "fichaId", rotulo: "Ficha (dotação)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "valor", rotulo: "Valor reservado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "historico", rotulo: "Histórico", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "reserva para o pregão 2026/001" },
      ],
    },
    {
      nome: "liberar-reserva", rotulo: "Liberar reserva não utilizada", acaoDoCenso: "LIBERAR_RESERVA",
      aviso: "Liberar devolve à ficha o que a reserva ainda bloqueia; a reserva original fica no razão, com a liberação apontando para ela.",
      campos: [
        { nome: "reservaId", rotulo: "Reserva", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "historico", rotulo: "Histórico", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "liberação do saldo não contratado" },
      ],
    },
    {
      nome: "contratar", rotulo: "Cadastrar contrato deste processo", acaoDoCenso: "CADASTRAR_CONTRATO",
      aviso: "Só processo HOMOLOGADO recebe contrato; a vigência não começa antes da homologação, e a dispensa por valor confere o teto vigente.",
      campos: [
        { nome: "numeroContrato", rotulo: "Número do contrato", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "CT-2026-001" },
        { nome: "contratadoDocumento", rotulo: "CPF/CNPJ do contratado", tipo: "cpfCnpj", obrigatorio: true, largura: 1 },
        { nome: "contratadoNome", rotulo: "Contratado", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "valorInicial", rotulo: "Valor inicial (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "vigenciaInicio", rotulo: "Início da vigência", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "vigenciaFimInicial", rotulo: "Fim da vigência", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "categoriaOrdemCronologica", rotulo: "Categoria (ordem cronológica, art. 141)", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_CATEGORIA },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_PROCESSO" },
  abas: ["dados", "historico", "relacionados"],
  relacionados: [
    { rotulo: "Contratos deste processo", href: "/licitacoes/contratos?processo={id}", explicacao: "Cada contrato com o valor e a vigência atualizados pelos aditivos." },
    { rotulo: "Empenhos vinculados", href: "/despesa/empenhos", explicacao: "O empenho informa o contrato (e a reserva) deste processo na emissão — é o que libera a reserva vinculada." },
  ],
});

export const CONTRATOS: DefinicaoDeRecurso = definirRecurso({
  nome: "contratos",
  rotulo: "Contratos",
  rotuloSingular: "Contrato",
  rota: "/licitacoes/contratos",
  descricao:
    "O contrato de cada processo homologado. Valor atualizado e fim da vigência são DERIVADOS dos aditivos " +
    "(acréscimo, supressão, prorrogação); corrigir um aditivo é estorná-lo. O contrato entra pelo detalhe do processo.",
  campos: [],
  colunas: [
    { nome: "numeroContrato", cabecalho: "Contrato", tipo: "link", ordenavel: true },
    { nome: "processo", cabecalho: "Processo", tipo: "texto" },
    { nome: "contratadoNome", cabecalho: "Contratado", tipo: "texto" },
    { nome: "valorAtualizado", cabecalho: "Valor atualizado", tipo: "dinheiro", somavel: true },
    { nome: "vigenciaFim", cabecalho: "Fim da vigência", tipo: "data" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou contratado", tipo: "texto", largura: 2 },
    { nome: "processo", rotulo: "Processo", tipo: "texto", largura: 1, placeholder: "número ou id" },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: [{ valor: "VIGENTE", rotulo: "Vigente" }, { valor: "ENCERRADO", rotulo: "Encerrado" }] },
  ],
  acoes: [
    {
      nome: "aditivo", rotulo: "Registrar aditivo", acaoDoCenso: "REGISTRAR_ADITIVO",
      aviso: "Um aditivo fala de UMA dimensão: valor (acréscimo ou supressão) OU prazo (dias). Supressão acima do saldo não empenhado é recusada.",
      campos: [
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "ACRESCIMO_VALOR", rotulo: "Acréscimo de valor" },
          { valor: "SUPRESSAO_VALOR", rotulo: "Supressão de valor" },
          { valor: "PRORROGACAO_PRAZO", rotulo: "Prorrogação de prazo" },
        ] },
        { nome: "valor", rotulo: "Valor (R$) — só para acréscimo/supressão", tipo: "dinheiro", largura: 1 },
        { nome: "dias", rotulo: "Dias — só para prorrogação", tipo: "inteiro", largura: 1, minimo: 1, maximo: 3650 },
        { nome: "data", rotulo: "Data do aditivo", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "numeroAditivo", rotulo: "Número do aditivo", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "TA-01" },
        { nome: "motivo", rotulo: "Motivo (mínimo 10 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "estornar-movimento", rotulo: "Estornar aditivo", acaoDoCenso: "ESTORNAR_MOVIMENTO_CONTRATUAL",
      aviso: "O estorno é outro movimento, com sinal contrário, apontando para o original. Um estorno não se estorna.",
      campos: [
        { nome: "movimentoId", rotulo: "Aditivo a estornar", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "data", rotulo: "Data do estorno", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (mínimo 10 caracteres)", tipo: "texto", obrigatorio: true, largura: 1 },
      ],
    },
  ],
  permissoes: {},
  abas: ["dados", "historico"],
});
