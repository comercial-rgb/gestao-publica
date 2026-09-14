import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ A FOLHA DE PAGAMENTO — M33 (V6 P2.3; TR 5.12.50–5.12.54, 5.12.61–5.12.66, 5.12.79) ═══
 *
 * Quatro recursos: folhas (o cálculo como fato numerado), rubricas, lançamentos e as tabelas do
 * ente. As TABELAS com faixas (contribuição e IRRF) têm linhas — e linhas são entrada de múltiplas
 * linhas, que o molde não monta (limite 2): a criação é a ilha `FormTabela`; os `campos` abaixo
 * descrevem o CABEÇALHO. Tudo o que é situação, total ou vigência é DERIVADO.
 */

export const OPCOES_DE_REGIME = [
  { valor: "RGPS", rotulo: "RGPS — regime geral (INSS)" },
  { valor: "RPPS", rotulo: "RPPS — regime próprio do ente" },
  { valor: "ISENTO", rotulo: "Isento — sem contribuição" },
];

const OPCOES_DE_NATUREZA = [
  { valor: "VENCIMENTO_BASE", rotulo: "Vencimento-base (do vínculo)" },
  { valor: "GRATIFICACOES_DO_VINCULO", rotulo: "Gratificações do vínculo" },
  { valor: "PERCENTUAL_DO_VENCIMENTO", rotulo: "Percentual do vencimento-base" },
  { valor: "VALOR_INFORMADO", rotulo: "Valor informado (lançamento fixo ou variável)" },
  { valor: "CONTRIBUICAO_PREVIDENCIARIA", rotulo: "Contribuição previdenciária (pela tabela do regime)" },
  { valor: "IMPOSTO_DE_RENDA", rotulo: "IRRF (pela tabela vigente)" },
  { valor: "SALARIO_FAMILIA", rotulo: "Salário-família (pela tabela e pelos dependentes)" },
];

const OPCOES_DE_TIPO_DE_RUBRICA = [
  { valor: "PROVENTO", rotulo: "Provento" },
  { valor: "DESCONTO", rotulo: "Desconto" },
];

export const OPCOES_DE_TIPO_DE_TABELA = [
  { valor: "CONTRIBUICAO_RGPS", rotulo: "Contribuição previdenciária — RGPS" },
  { valor: "CONTRIBUICAO_RPPS", rotulo: "Contribuição previdenciária — RPPS" },
  { valor: "IRRF", rotulo: "IRRF" },
  { valor: "SALARIO_FAMILIA", rotulo: "Salário-família" },
];

export const FOLHAS: DefinicaoDeRecurso = definirRecurso({
  nome: "folhas",
  rotulo: "Folhas de pagamento",
  rotuloSingular: "Folha de pagamento",
  rota: "/folha/folhas",
  descricao:
    "A folha de uma competência. Calcular gera um cálculo NUMERADO com um contracheque por vínculo vivo — memória de " +
    "cálculo e sha256 em cada um; recalcular é o número seguinte; cancelar e fechar são fatos. Fechada, não se recalcula.",
  campos: [
    { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [{ valor: "MENSAL", rotulo: "Mensal" }] },
  ],
  colunas: [
    { nome: "competencia", cabecalho: "Competência", tipo: "link", ordenavel: true },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "calculos", cabecalho: "Cálculos", tipo: "inteiro" },
    { nome: "contracheques", cabecalho: "Contracheques", tipo: "inteiro" },
    { nome: "liquido", cabecalho: "Líquido (último cálculo vivo)", tipo: "dinheiro", somavel: true },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Competência", tipo: "texto", largura: 1, placeholder: "2026" },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1, opcoes: [
      { valor: "SEM_CALCULO", rotulo: "Sem cálculo" },
      { valor: "CALCULADA", rotulo: "Calculada" },
      { valor: "FECHADA", rotulo: "Fechada" },
    ] },
  ],
  // V6.2 U0 — a barra de ações da folha é projetada do estado (`disponibilidadeDaFolha`).
  acoesPorEstado: true,
  acoes: [
    {
      nome: "calcular", rotulo: "Calcular a folha", acaoDoCenso: "CALCULAR_FOLHA",
      aviso: "Calcula todos os vínculos vivos na competência com as tabelas vigentes. Sem tabela, sem regime ou sem vencimento, recusa nomeando. Cada cálculo é numerado; o anterior continua no histórico.",
      campos: [{ nome: "motivo", rotulo: "Motivo (opcional — ex.: conferência, correção de lançamento)", tipo: "texto", largura: 4 }],
    },
    {
      nome: "cancelar-calculo", rotulo: "Cancelar o último cálculo", acaoDoCenso: "CANCELAR_CALCULO_DA_FOLHA",
      aviso: "Cancela o último cálculo VIVO desta folha, como fato com motivo. O cálculo que fechou a folha não se cancela.",
      campos: [{ nome: "motivo", rotulo: "Motivo (mínimo 5 caracteres)", tipo: "texto", obrigatorio: true, largura: 4 }],
    },
    {
      nome: "apropriar", rotulo: "Apropriar (gerar os empenhos)", acaoDoCenso: "APROPRIAR_FOLHA",
      aviso: "Transforma a folha FECHADA em despesa: os proventos de cada contracheque, agrupados pelos grupos de empenho, viram empenhos pelo caminho de sempre (saldo da ficha, exercício aberto, fila do art. 141). Só o bruto é empenhado — as retenções viajam no pagamento. Reexecutar continua de onde parou: a numeração é determinística e não duplica.",
      campos: [{ nome: "dataDoEmpenho", rotulo: "Data dos empenhos (dentro do exercício aberto)", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "certificar", rotulo: "Certificar (atestar) a folha", acaoDoCenso: "CERTIFICAR_FOLHA",
      aviso:
        "O atesto do art. 63 da Lei 4.320: quem o ente DESIGNOU confere a folha fechada e responde por ela. Exige designação " +
        "vigente no dia do ato — o crachá sozinho não basta. Quem calculou ou fechou esta folha não a certifica. Grava o " +
        "manifesto do que foi conferido (entidade, competência, cálculo, vínculos e alocações) com o seu sha256.",
      campos: [{ nome: "data", rotulo: "Data do ato (a designação precisa estar vigente nela)", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "devolver", rotulo: "Devolver para correção", acaoDoCenso: "CERTIFICAR_FOLHA",
      aviso:
        "Recusar é o outro lado de atestar, e exige a mesma designação. A devolução é um FATO com motivo; ela NÃO reabre o " +
        "cálculo fechado — corrigir é retificação ou folha complementar. Folha já liquidada não se devolve: desfazer " +
        "obrigação liquidada é anulação pelo caminho da despesa.",
      campos: [
        { nome: "data", rotulo: "Data do ato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "O que RH precisa corrigir (mínimo 3 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "liquidar", rotulo: "Liquidar a folha certificada", acaoDoCenso: "LIQUIDAR_FOLHA",
      aviso:
        "Reconhece a obrigação de cada empenho desta folha pelo caminho de sempre da despesa, com o certificador no " +
        "responsável pelo atesto. Exige a folha CERTIFICADA e APROPRIADA, e quem certificou não liquida. Nenhuma nota " +
        "fiscal é inventada: a folha não tem nota. Reexecutar continua de onde parou e não duplica.",
      campos: [{ nome: "data", rotulo: "Data das liquidações", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "fechar", rotulo: "Fechar a folha", acaoDoCenso: "FECHAR_FOLHA",
      aviso: "Congela o último cálculo vivo com o seu sha256. Depois disto a folha não se recalcula — é o que vai à contabilidade.",
      irreversivel: true,
      campos: [],
    },
  ],
  permissoes: { criar: "ABRIR_FOLHA" },
  abas: ["dados", "historico"],
});

export const RUBRICAS: DefinicaoDeRecurso = definirRecurso({
  nome: "rubricas",
  rotulo: "Rubricas",
  rotuloSingular: "Rubrica",
  rota: "/folha/rubricas",
  descricao:
    "Proventos e descontos da folha: de onde o valor vem (natureza), se compõe a base de contribuição e de IRRF, e se é " +
    "proporcional aos dias. Vencimento, gratificações, contribuição, IRRF e salário-família existem UMA vez cada.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "VENC" },
    { nome: "descricao", rotulo: "Descrição (como aparece no contracheque)", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_TIPO_DE_RUBRICA },
    { nome: "natureza", rotulo: "Natureza (de onde vem o valor)", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: OPCOES_DE_NATUREZA },
    { nome: "percentual", rotulo: "Percentual (só 'percentual do vencimento'; 20 = 20%)", tipo: "texto", largura: 1 },
    { nome: "ordem", rotulo: "Ordem no contracheque", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1 },
    { nome: "incideContribuicao", rotulo: "Compõe a base da contribuição", tipo: "booleano", largura: 1 },
    { nome: "incideIrrf", rotulo: "Compõe a base do IRRF", tipo: "booleano", largura: 1 },
    { nome: "proporcionalAosDias", rotulo: "Proporcional aos dias (mês de 30)", tipo: "booleano", largura: 1 },
    { nome: "fundamentacaoLegal", rotulo: "Fundamentação legal", tipo: "texto", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "natureza", cabecalho: "Natureza", tipo: "texto" },
    { nome: "incidencias", cabecalho: "Incide em", tipo: "texto" },
    { nome: "ordem", cabecalho: "Ordem", tipo: "inteiro", ordenavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_TIPO_DE_RUBRICA },
  ],
  acoes: [],
  permissoes: { criar: "CADASTRAR_RUBRICA" },
  abas: ["dados"],
});

export const LANCAMENTOS_DA_FOLHA: DefinicaoDeRecurso = definirRecurso({
  nome: "lancamentos-da-folha",
  rotulo: "Lançamentos da folha",
  rotuloSingular: "Lançamento da folha",
  rota: "/folha/lancamentos",
  descricao:
    "Um valor informado para uma rubrica de valor informado de uma matrícula: FIXO vale por competências consecutivas " +
    "(vigência), VARIÁVEL vale numa competência só. Append-only: encerrar um fixo é dizer a competência final.",
  campos: [
    { nome: "vinculoId", rotulo: "Matrícula", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "rubricaId", rotulo: "Rubrica (só as de valor informado)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
      { valor: "VARIAVEL", rotulo: "Variável (uma competência)" },
      { valor: "FIXO", rotulo: "Fixo (por vigência)" },
    ] },
    { nome: "competenciaInicio", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
    { nome: "competenciaFim", rotulo: "Competência final (só fixo; vazio = aberto)", tipo: "texto", largura: 1 },
    { nome: "valor", rotulo: "Valor (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
    { nome: "observacao", rotulo: "Observação", tipo: "texto", largura: 2 },
    { nome: "atoLegal", rotulo: "Ato legal (opcional)", tipo: "texto", largura: 2 },
  ],
  colunas: [
    { nome: "matricula", cabecalho: "Matrícula", tipo: "link" },
    { nome: "servidor", cabecalho: "Servidor", tipo: "texto" },
    { nome: "rubrica", cabecalho: "Rubrica", tipo: "texto" },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "valor", cabecalho: "Valor", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Matrícula ou rubrica", tipo: "texto", largura: 2 },
    { nome: "competencia", rotulo: "Vigente na competência (AAAA-MM)", tipo: "texto", largura: 1 },
  ],
  acoes: [],
  permissoes: { criar: "LANCAR_NA_FOLHA" },
  abas: ["dados"],
});

export const TABELAS_DA_FOLHA: DefinicaoDeRecurso = definirRecurso({
  nome: "tabelas-da-folha",
  rotulo: "Tabelas do ente",
  rotuloSingular: "Tabela do ente",
  rota: "/folha/tabelas",
  descricao:
    "Contribuição previdenciária por regime (faixas e teto), IRRF (faixas, dedução por dependente, desconto simplificado, " +
    "parcela isenta de 65 anos, redutor) e salário-família — cada uma vigente por competência, com a fundamentação legal. " +
    "Nenhum valor mora no código: sem tabela vigente, a folha recusa calcular.",
  campos: [
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_TIPO_DE_TABELA },
    { nome: "competenciaInicio", rotulo: "Vigente desde (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-01" },
    { nome: "competenciaFim", rotulo: "Vigente até (vazio = aberta)", tipo: "texto", largura: 1 },
    { nome: "fundamentacaoLegal", rotulo: "Fundamentação legal (portaria, lei, decreto)", tipo: "texto", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    { nome: "tipo", cabecalho: "Tipo", tipo: "link" },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "resumo", cabecalho: "Resumo", tipo: "texto" },
    { nome: "fundamentacaoLegal", cabecalho: "Fundamentação", tipo: "texto" },
    { nome: "situacao", cabecalho: "Hoje", tipo: "situacao" },
  ],
  filtros: [{ nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 2, opcoes: OPCOES_DE_TIPO_DE_TABELA }],
  acoes: [],
  permissoes: { criar: "CONFIGURAR_TABELAS_DA_FOLHA" },
  abas: ["dados"],
});

export const GRUPOS_DE_EMPENHO_DA_FOLHA: DefinicaoDeRecurso = definirRecurso({
  nome: "grupos-de-empenho",
  rotulo: "Grupos de empenho",
  rotuloSingular: "Grupo de empenho",
  rota: "/folha/grupos-de-empenho",
  descricao:
    "Como a folha vira despesa: quais rubricas de PROVENTO cada grupo empenha, em qual ficha, com qual categoria da ordem " +
    "cronológica, e se o empenho é por servidor (credor = o CPF de cada um) ou um só para o grupo (credor declarado). " +
    "Uma rubrica pertence a um grupo só — em dois, a mesma verba viraria despesa duas vezes. O grupo também declara as " +
    "duas contas patrimoniais da liquidação: a VPD de pessoal que ela debita e a obrigação de pessoal que ela credita.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "FOLHA-VENC" },
    { nome: "descricao", rotulo: "Descrição (vai no histórico do empenho)", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "fichaId", rotulo: "Ficha orçamentária", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
    { nome: "serie", rotulo: "Série do número do empenho (A-Z, 0-9)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "FP" },
    { nome: "tipoEmpenho", rotulo: "Tipo de empenho", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
      { valor: "ORDINARIO", rotulo: "Ordinário" }, { valor: "GLOBAL", rotulo: "Global" }, { valor: "ESTIMATIVO", rotulo: "Estimativo" },
    ] },
    { nome: "categoriaOrdemCronologica", rotulo: "Categoria (art. 141)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [
      { valor: "FORNECIMENTO_BENS", rotulo: "Fornecimento de bens" }, { valor: "LOCACAO", rotulo: "Locação" },
      { valor: "PRESTACAO_SERVICOS", rotulo: "Prestação de serviços" }, { valor: "REALIZACAO_OBRAS", rotulo: "Realização de obras" },
    ] },
    { nome: "porServidor", rotulo: "Um empenho por servidor (credor = o CPF de cada um)", tipo: "booleano", largura: 2 },
    { nome: "credorId", rotulo: "Credor do empenho único (só quando NÃO é por servidor)", tipo: "selecao", largura: 3, opcoes: [] },
    // ⚠️ AS DUAS CONTAS DA LIQUIDAÇÃO. O rol elemento→conta do plano cobre material, serviço e
    // amortização — não a folha —, e a VPD dele é de serviços de terceiros. Quem sabe qual conta
    // é qual é o contador do ente. O recorte (3.1 e 2.1.1, analíticas) é do descritor.
    { nome: "contaVariacaoId", rotulo: "VPD que a liquidação debita (3.1 — pessoal)", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
    { nome: "contaObrigacaoId", rotulo: "Obrigação que a liquidação credita (2.1.1 — pessoal a pagar)", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "ficha", cabecalho: "Ficha", tipo: "texto" },
    { nome: "rubricas", cabecalho: "Rubricas", tipo: "texto" },
    { nome: "como", cabecalho: "Empenho", tipo: "texto" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [
    {
      nome: "definir-contas", rotulo: "Definir as contas da liquidação", acaoDoCenso: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA",
      aviso:
        "A VPD que a liquidação debita e a obrigação de pessoal que ela credita. Sem as duas, a folha certificada não " +
        "liquida — e a recusa nomeia este grupo. As liquidações JÁ gravadas não mudam: elas têm o seu lançamento com as " +
        "contas que valiam no ato; o que se define aqui vale para as próximas.",
      campos: [
        { nome: "contaVariacaoId", rotulo: "VPD que a liquidação debita (3.1 — pessoal)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "contaObrigacaoId", rotulo: "Obrigação que a liquidação credita (2.1.1 — pessoal a pagar)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA" },
  abas: ["dados"],
});

/**
 * ═══ AS DESIGNAÇÕES DA FOLHA (V6.1) — quem o ente pôs para atestar ═══
 *
 * ⚠️ ESTE CADASTRO NÃO CONCEDE PODER SOZINHO, e o texto da tela diz isso. Ele registra o ATO
 * ADMINISTRATIVO do ente (portaria, decreto, delegação) que nomeia o responsável. Certificar
 * exige as DUAS coisas: a ação CERTIFICAR_FOLHA no perfil e uma designação vigente no dia.
 *
 * ⚠️ E NÃO HÁ EDIÇÃO. Revogar é FATO com data de efeito e motivo — alterar a vigência reescreveria
 * o passado, e os atestos praticados sob ela ficariam sem lastro.
 */
export const DESIGNACOES_DA_FOLHA: DefinicaoDeRecurso = definirRecurso({
  nome: "designacoes",
  rotulo: "Designações para o atesto",
  rotuloSingular: "Designação",
  rota: "/folha/designacoes",
  descricao:
    "Quem o ente designou para CERTIFICAR a folha, por qual ato administrativo e de quando até quando. Nenhuma norma " +
    "nacional nomeia um cargo para isso: a atribuição é do município, e o sistema não a escolhe. Sem designação vigente " +
    "no dia, o ato de certificar recusa dizendo o que falta — consultar, calcular e fechar continuam liberados.",
  campos: [
    { nome: "atribuicao", rotulo: "Atribuição", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [{ valor: "CERTIFICAR_FOLHA", rotulo: "Certificar (atestar) a folha" }] },
    { nome: "pessoaId", rotulo: "Responsável (pessoa do cadastro)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "usuarioIdentificador", rotulo: "Conta que ele usa para entrar (tem de ser a MESMA pessoa)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoDesignacao", rotulo: "Ato que designou (portaria, decreto, delegação)", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "Portaria 45/2026" },
    { nome: "vigenciaInicio", rotulo: "Vigência — início", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "vigenciaFim", rotulo: "Vigência — fim (vazio = sem prazo)", tipo: "data", largura: 1 },
    { nome: "substitutoDeId", rotulo: "Substitui a designação de (opcional)", tipo: "selecao", largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "responsavel", cabecalho: "Responsável", tipo: "link", ordenavel: true },
    { nome: "usuario", cabecalho: "Conta", tipo: "texto" },
    { nome: "atoDesignacao", cabecalho: "Ato", tipo: "texto" },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "situacao", cabecalho: "Hoje", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Responsável, conta ou ato", tipo: "texto", largura: 2 },
    { nome: "situacao", rotulo: "Hoje", tipo: "selecao", largura: 1, opcoes: [
      { valor: "VIGENTE", rotulo: "Vigente" },
      { valor: "NAO_VIGENTE", rotulo: "Não vigente" },
    ] },
  ],
  acoes: [
    {
      nome: "revogar", rotulo: "Revogar a designação", acaoDoCenso: "DESIGNAR_NA_FOLHA",
      aviso:
        "A revogação é um FATO com data de efeito: a designação continua no histórico, e os atestos praticados sob ela " +
        "continuam com lastro. A partir do dia do efeito, ela deixa de autorizar novos atestos.",
      irreversivel: true,
      campos: [
        { nome: "dataEfeito", rotulo: "A partir de que dia deixa de valer", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (exoneração, fim da substituição, novo ato)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
  ],
  permissoes: { criar: "DESIGNAR_NA_FOLHA" },
  abas: ["dados", "historico"],
});

export const RECURSOS_DA_FOLHA: readonly DefinicaoDeRecurso[] = [FOLHAS, RUBRICAS, LANCAMENTOS_DA_FOLHA, TABELAS_DA_FOLHA, GRUPOS_DE_EMPENHO_DA_FOLHA, DESIGNACOES_DA_FOLHA];
