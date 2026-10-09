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
    "Processos de contratação (Lei 14.133/2021): número, modalidade, objeto e valor licitado; na dispensa, a " +
    "hipótese do art. 75. A homologação, a reserva de dotação e o contrato são registrados no detalhe do processo.",
  campos: [
    { nome: "numeroProcesso", rotulo: "Número do processo", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026/001" },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_MODALIDADE },
    { nome: "valorLicitado", rotulo: "Valor licitado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1, ajuda: "Valor estimado da contratação; o valor do contrato resulta da proposta vencedora." },
    { nome: "objeto", rotulo: "Objeto", tipo: "textoLongo", obrigatorio: true, largura: 3 },
    { nome: "hipoteseDispensa", rotulo: "Hipótese de dispensa (somente para dispensa)", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_HIPOTESE, ajuda: "Fundamento legal da contratação direta." },
    { nome: "dataHomologacao", rotulo: "Data da homologação (se já homologado)", tipo: "data", largura: 1, ajuda: "Em branco, a homologação pode ser registrada depois, no detalhe do processo." },
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
      aviso: "A homologação é registrada com data e responsável e só pode ser feita uma vez. O contrato depende da homologação.",
      campos: [{ nome: "data", rotulo: "Data da homologação", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "reservar", rotulo: "Reservar dotação para este processo", acaoDoCenso: "RESERVAR_DOTACAO",
      aviso: "A reserva bloqueia o valor na ficha e fica vinculada ao processo; somente empenho de contrato deste processo pode utilizá-la.",
      campos: [
        { nome: "fichaId", rotulo: "Ficha (dotação)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "valor", rotulo: "Valor reservado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
        { nome: "historico", rotulo: "Histórico", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "reserva para o pregão 2026/001" },
        { nome: "data", rotulo: "Data da reserva", tipo: "data", obrigatorio: true, largura: 1,
          ajuda: "A reserva tem de caber no disponível desta data, e o empenho por ela não pode ser anterior." },
      ],
    },
    {
      nome: "liberar-reserva", rotulo: "Liberar reserva não utilizada", acaoDoCenso: "LIBERAR_RESERVA",
      aviso: "Devolve à ficha o saldo ainda reservado. A reserva original permanece registrada, vinculada à liberação.",
      campos: [
        { nome: "reservaId", rotulo: "Reserva", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "historico", rotulo: "Histórico", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "liberação do saldo não contratado" },
      ],
    },
    {
      nome: "contratar", rotulo: "Cadastrar contrato deste processo", acaoDoCenso: "CADASTRAR_CONTRATO",
      aviso: "Somente processo homologado pode receber contrato. A vigência não pode começar antes da homologação, e a dispensa por valor observa o limite vigente.",
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
    { rotulo: "Empenhos vinculados", href: "/despesa/empenhos", explicacao: "Empenhos emitidos com contrato deste processo, que utilizam a reserva vinculada." },
  ],
});

export const CONTRATOS: DefinicaoDeRecurso = definirRecurso({
  nome: "contratos",
  rotulo: "Contratos",
  rotuloSingular: "Contrato",
  rota: "/licitacoes/contratos",
  descricao:
    "Contratos dos processos homologados. O valor atualizado e o fim da vigência consideram os aditivos (acréscimo, " +
    "supressão e prorrogação); a correção de um aditivo é feita por estorno. O contrato é registrado no detalhe do processo.",
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
    { nome: "processo", rotulo: "Processo", tipo: "texto", largura: 1, placeholder: "Número do processo" },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: [{ valor: "VIGENTE", rotulo: "Vigente" }, { valor: "ENCERRADO", rotulo: "Encerrado" }] },
  ],
  acoes: [
    {
      nome: "aditivo", rotulo: "Registrar aditivo", acaoDoCenso: "REGISTRAR_ADITIVO",
      aviso: "Cada aditivo trata de valor (acréscimo ou supressão) ou de prazo (dias). A supressão não pode superar o saldo não empenhado.",
      campos: [
        { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
          { valor: "ACRESCIMO_VALOR", rotulo: "Acréscimo de valor" },
          { valor: "SUPRESSAO_VALOR", rotulo: "Supressão de valor" },
          { valor: "PRORROGACAO_PRAZO", rotulo: "Prorrogação de prazo" },
        ] },
        { nome: "valor", rotulo: "Valor (R$), para acréscimo ou supressão", tipo: "dinheiro", largura: 1 },
        { nome: "dias", rotulo: "Dias, para prorrogação", tipo: "inteiro", largura: 1, minimo: 1, maximo: 3650 },
        { nome: "data", rotulo: "Data do aditivo", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "numeroAditivo", rotulo: "Número do aditivo", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "TA-01" },
        { nome: "motivo", rotulo: "Motivo (mínimo 10 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "estornar-movimento", rotulo: "Estornar aditivo", acaoDoCenso: "ESTORNAR_MOVIMENTO_CONTRATUAL",
      aviso: "O estorno é registrado como novo movimento, com sinal contrário, vinculado ao original. Um estorno não pode ser estornado.",
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
