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
  // ⚠️ V11 V9.1 — SEM ESTA LINHA A CADEIA DO 13º NÃO EXISTE PELA INTERFACE. É a única natureza
  // que o motor do 13º sabe ler para abater a 1ª parcela, e o parâmetro do 13º RECUSA qualquer
  // outra no papel de abatimento. Faltando aqui, o operador não consegue criar a rubrica, o
  // parâmetro não pode ser cadastrado, e a folha de 13º nunca é calculada — tudo isso com o
  // domínio inteiro funcionando e nenhum teste vermelho.
  { valor: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", rotulo: "Abatimento do adiantamento do 13º (1ª parcela)" },
  // ⚠️ V13 — SEM ESTA LINHA A CADEIA DO ADIANTAMENTO SALARIAL NÃO EXISTE PELA INTERFACE, e o
  // defeito é exatamente o `ROTULO-CRU-DO-TIPO-DE-FOLHA` ao contrário: nenhum compilador cobra
  // este array. É a única natureza que o motor MENSAL sabe ler para abater o vale, e o parâmetro
  // do adiantamento RECUSA qualquer outra no papel de abatimento. Faltando aqui, o operador não
  // consegue criar a rubrica, o parâmetro não pode ser cadastrado, e o vale nunca é abatido —
  // tudo isso com o domínio inteiro funcionando e nenhum teste vermelho.
  { valor: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", rotulo: "Abatimento do adiantamento salarial da competência" },
];

const OPCOES_DE_TIPO_DE_RUBRICA = [
  { valor: "PROVENTO", rotulo: "Provento" },
  { valor: "DESCONTO", rotulo: "Desconto" },
];

/**
 * V11 V9.1 — os tipos de folha OFERECIDOS, e a lista é a mesma do enum do domínio de propósito.
 *
 * ⚠️ A FOLHA DE DIFERENÇA DE 13º NÃO ESTÁ AQUI. O item 5.12.50 a enumera e ela não tem motor
 * (depende de `RETIFICACAO-DA-FOLHA`, que não existe). Uma opção que recusa quando escolhida é
 * pior que uma opção ausente: a primeira só falha depois que o operador confiou nela.
 */
export const OPCOES_DE_TIPO_DE_FOLHA = [
  { valor: "MENSAL", rotulo: "Mensal" },
  { valor: "MENSAL_COMPLEMENTAR", rotulo: "Mensal complementar (diferença de competência já fechada)" },
  { valor: "ADIANTAMENTO_DECIMO_TERCEIRO", rotulo: "Adiantamento do 13º (1ª parcela)" },
  { valor: "DECIMO_TERCEIRO", rotulo: "13º salário (2ª parcela, com abatimento da 1ª)" },
  // ⚠️ V13 — O MESMO ARRAY SEM COMPILADOR. Sem esta linha o tipo existe no domínio, no banco e no
  // motor, e NÃO EXISTE para quem opera: a barra de abrir folha não o oferece, e a lista de
  // folhas mostraria o nome cru do enum. Foi assim que a V11 registrou `ROTULO-CRU-DO-TIPO-DE-FOLHA`
  // duas vezes.
  { valor: "ADIANTAMENTO_SALARIAL", rotulo: "Adiantamento salarial (abatido na folha mensal da competência)" },
];

/**
 * V13 — AS DUAS PRÁTICAS DE BASE DO VALE, EM PORTUGUÊS DE QUEM OPERA.
 *
 * ⚠️ E A LISTA NÃO ESGOTA AS REGRAS ADMISSÍVEIS: ela é o que o sistema sabe calcular e verificar.
 * Um ente cuja regra não seja nenhuma das duas recebe pendência explícita
 * (`REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`), não um encaixe na mais parecida.
 */
export const OPCOES_DE_BASE_DO_ADIANTAMENTO_SALARIAL = [
  { valor: "REMUNERACAO_DO_MES_ANTERIOR", rotulo: "Remuneração do mês anterior (apurada na folha fechada)" },
  { valor: "REMUNERACAO_PROJETADA_DO_MES", rotulo: "Remuneração projetada do próprio mês (tabelas vigentes)" },
];

export const OPCOES_DE_ESFERA_DO_ATO = [
  { valor: "MUNICIPAL", rotulo: "Municipal" },
  { valor: "ESTADUAL", rotulo: "Estadual" },
  { valor: "FEDERAL", rotulo: "Federal" },
];

export const OPCOES_DE_TIPO_DE_ATO = [
  { valor: "ESTATUTO_DOS_SERVIDORES", rotulo: "Estatuto dos servidores" },
  { valor: "LEI", rotulo: "Lei" },
  { valor: "LEI_COMPLEMENTAR", rotulo: "Lei complementar" },
  { valor: "LEI_ORGANICA", rotulo: "Lei orgânica" },
  { valor: "DECRETO", rotulo: "Decreto" },
  { valor: "PORTARIA", rotulo: "Portaria" },
  { valor: "INSTRUCAO_NORMATIVA", rotulo: "Instrução normativa" },
  { valor: "RESOLUCAO", rotulo: "Resolução" },
  { valor: "MEDIDA_PROVISORIA", rotulo: "Medida provisória" },
  { valor: "EMENDA_CONSTITUCIONAL", rotulo: "Emenda constitucional" },
  { valor: "CONSTITUICAO", rotulo: "Constituição" },
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
  // ⚠️ O QUE O CÁLCULO PRODUZ DEPENDE DO TIPO, e prometê-lo aqui para os quatro era mentir sobre
  // três (V11 V9.4b). "Um contracheque por vínculo vivo" é verdade na MENSAL e falso na
  // complementar (só quem tem diferença) e nas duas de 13º (só quem alcança avo). O texto por tipo
  // sai de `NATUREZA_DO_TIPO_DE_FOLHA.oQueOCalculoProduz` e chega à barra pela disponibilidade.
  descricao:
    "Folha de pagamento por competência e tipo. Cada cálculo é numerado e guarda a memória de cálculo de cada " +
    "contracheque; um novo cálculo substitui o anterior, que permanece no histórico. Depois de fechada, a folha não " +
    "pode ser recalculada.",
  campos: [
    { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
    {
      nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1,
      opcoes: [...OPCOES_DE_TIPO_DE_FOLHA],
      ajuda:
        "As folhas de 13º são calculadas por avos do exercício e exigem o parâmetro do 13º cadastrado. Há uma de " +
        "cada tipo por ano, e a 2ª parcela abate automaticamente o adiantamento. " +
        // ⚠️ "JÁ PAGO" ERA FALSO, E ERA A PRIMEIRA COISA QUE O OPERADOR LIA (V11 V9.4b). O que a
        // complementar compara é o APURADO em folha FECHADA — `fechamento !== null`, e só isso.
        // Certificação, empenho, liquidação e pagamento não são consultados em lugar nenhum de
        // `calcularFolhaComplementarNaTx`, e o pagamento nem é ato deste módulo. Afirmar "pago"
        // aqui é a mesma doença da memória que dizia "1ª parcela já PAGA" sobre um cálculo que só
        // verificara o fechamento.
        "A mensal complementar apura apenas a diferença, por rubrica, de uma competência cuja folha mensal já foi " +
        "fechada, sem alterar a folha original; não é aceita quando o valor correto é menor que o já apurado. " +
        "Apurar a folha não equivale a empenhar, liquidar ou pagar.",
    },
  ],
  colunas: [
    { nome: "competencia", cabecalho: "Competência", tipo: "link", ordenavel: true },
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto" },
    { nome: "calculos", cabecalho: "Cálculos", tipo: "inteiro" },
    { nome: "contracheques", cabecalho: "Contracheques", tipo: "inteiro" },
    { nome: "liquido", cabecalho: "Líquido (cálculo vigente)", tipo: "dinheiro", somavel: true },
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
      aviso:
        "Calcula com as tabelas vigentes na competência. Faltando tabela, regime previdenciário ou vencimento, o " +
        "cálculo não é realizado e a pendência é informada. Cada cálculo recebe um número e o anterior permanece no " +
        "histórico. Informe a abrangência: a folha inteira ou somente as matrículas relacionadas (esta opção exige " +
        "permissão específica). As matrículas efetivamente calculadas ficam registradas na seção \"Abrangência dos cálculos\".",
      campos: [
        {
          nome: "modoDeSelecao",
          rotulo: "Abrangência do cálculo",
          tipo: "selecao",
          opcoes: [
            { valor: "TODOS_OS_ELEGIVEIS", rotulo: "Todos os elegíveis da competência" },
            { valor: "EXPLICITA", rotulo: "Somente as matrículas informadas abaixo" },
          ],
          largura: 2,
        },
        {
          // ⚠️ MATRÍCULA DIGITADA, E NÃO CAIXA DE SELEÇÃO NA LISTA. A ordem proíbe que a paginação
          // defina quem é calculado, e uma lista paginada com caixas envia o que está VISÍVEL —
          // quem revisa lê "os selecionados" sem ver que são "os da página 1". Texto num campo só
          // é imune por construção: trocar de página não altera uma linha dele.
          nome: "matriculasSelecionadas",
          rotulo: "Matrículas a calcular (uma por linha ou separadas por vírgula)",
          tipo: "textoLongo",
          largura: 4,
        },
        { nome: "motivo", rotulo: "Motivo (opcional; ex.: conferência, correção de lançamento)", tipo: "texto", largura: 4 },
      ],
    },
    {
      nome: "cancelar-calculo", rotulo: "Cancelar o último cálculo", acaoDoCenso: "CANCELAR_CALCULO_DA_FOLHA",
      aviso: "Cancela o cálculo vigente desta folha, com registro do motivo. O cálculo utilizado no fechamento não pode ser cancelado.",
      campos: [{ nome: "motivo", rotulo: "Motivo (mínimo 5 caracteres)", tipo: "texto", obrigatorio: true, largura: 4 }],
    },
    {
      nome: "apropriar", rotulo: "Apropriar (gerar os empenhos)", acaoDoCenso: "APROPRIAR_FOLHA",
      aviso: "Gera os empenhos da folha fechada: os proventos de cada contracheque são agrupados conforme os grupos de empenho, com verificação do saldo da ficha, do exercício aberto e da ordem cronológica de pagamentos. Empenha-se o valor bruto; as retenções são tratadas no pagamento. Se interrompida, a operação pode ser repetida sem duplicar empenhos.",
      campos: [{ nome: "dataDoEmpenho", rotulo: "Data dos empenhos (dentro do exercício aberto)", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "certificar", rotulo: "Certificar (atestar) a folha", acaoDoCenso: "CERTIFICAR_FOLHA",
      aviso:
        "Atesto previsto no art. 63 da Lei 4.320/1964: o responsável designado pelo ente confere a folha fechada e responde " +
        "por ela. Exige designação vigente na data do ato, além da permissão de acesso. Quem calculou ou fechou a folha não " +
        "pode certificá-la. O conteúdo conferido (entidade, competência, cálculo, vínculos e alocações) fica registrado com código de integridade.",
      campos: [{ nome: "data", rotulo: "Data do ato (a designação deve estar vigente nesta data)", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "devolver", rotulo: "Devolver para correção", acaoDoCenso: "CERTIFICAR_FOLHA",
      aviso:
        "Registra a devolução da folha com o motivo e exige a mesma designação da certificação. A devolução não reabre o " +
        "cálculo fechado: a correção é feita por retificação ou folha complementar. Folha já liquidada não pode ser " +
        "devolvida; nesse caso, a correção é feita por anulação da despesa.",
      campos: [
        { nome: "data", rotulo: "Data do ato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "O que o RH precisa corrigir (mínimo 3 caracteres)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "liquidar", rotulo: "Liquidar a folha certificada", acaoDoCenso: "LIQUIDAR_FOLHA",
      aviso:
        "Registra a liquidação de cada empenho da folha, tendo o certificador como responsável pelo atesto. Exige a " +
        "folha certificada e apropriada; quem certificou não pode liquidar. A liquidação da folha dispensa nota fiscal. " +
        "Se interrompida, a operação pode ser repetida sem duplicar liquidações.",
      campos: [{ nome: "data", rotulo: "Data das liquidações", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "fechar", rotulo: "Fechar a folha", acaoDoCenso: "FECHAR_FOLHA",
      aviso: "Fecha o cálculo vigente e registra seu código de integridade. Depois do fechamento, a folha não pode ser recalculada e segue para a contabilidade.",
      irreversivel: true,
      campos: [],
    },
    // ── V6.2 — os ENCARGOS DO EMPREGADOR sobre a folha fechada: apurar, certificar, empenhar, liquidar ──
    {
      nome: "apurar-encargos", rotulo: "Apurar os encargos do empregador", acaoDoCenso: "APURAR_ENCARGOS_DA_FOLHA",
      aviso:
        "Calcula, sobre a folha fechada, os encargos devidos pelo ente por componente (previdência patronal, RAT, outras " +
        "entidades), conforme as versões aprovadas vigentes na competência. Não altera contracheques nem o líquido. " +
        "Componente sem parâmetro aprovado fica sem valor e a apuração é registrada como incompleta. Uma nova apuração, " +
        "após a correção de um parâmetro, gera nova versão com comparativo.",
      campos: [{ nome: "motivo", rotulo: "Motivo (opcional; ex.: portaria corrigida)", tipo: "texto", largura: 4 }],
    },
    {
      nome: "certificar-encargos", rotulo: "Certificar (atestar) os encargos", acaoDoCenso: "CERTIFICAR_ENCARGOS_DA_FOLHA",
      aviso:
        "O atesto dos encargos é distinto do atesto da folha, que não alcança encargos apurados depois dele. Exige " +
        "designação para certificar encargos vigente na data do ato e na data atual. Quem apurou não pode certificar.",
      campos: [{ nome: "data", rotulo: "Data do ato", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "apropriar-encargos", rotulo: "Empenhar os encargos", acaoDoCenso: "APROPRIAR_FOLHA",
      aviso:
        "Empenha, por grupo de empenho dos encargos, a diferença entre a apuração vigente e o valor já empenhado para esta " +
        "folha. A contribuição retida do servidor não é empenhada. A operação pode ser repetida sem duplicar; reduções exigem anulação.",
      campos: [{ nome: "dataDoEmpenho", rotulo: "Data dos empenhos", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "liquidar-encargos", rotulo: "Liquidar os encargos certificados", acaoDoCenso: "LIQUIDAR_FOLHA",
      aviso:
        "Registra a liquidação dos empenhos dos encargos nas contas do grupo (VPD de encargos e encargos a recolher). " +
        "A liquidação não equivale ao recolhimento: a guia e o pagamento são registrados à parte. Quem certificou não pode liquidar.",
      campos: [{ nome: "data", rotulo: "Data das liquidações", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "ajustar-encargos", rotulo: "Ajustar os encargos para baixo", acaoDoCenso: "APROPRIAR_FOLHA", irreversivel: true,
      aviso:
        "Aplica-se quando a apuração vigente certificada é menor que a despesa já reconhecida: anula primeiro a parte " +
        "liquidada e não paga e, em seguida, a parte empenhada e não liquidada. Valores já pagos não são anulados e ficam " +
        "registrados para restituição. A apuração anterior e os contracheques não são alterados. A operação pode ser repetida sem anulação em duplicidade.",
      campos: [
        { nome: "data", rotulo: "Data das anulações", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo (o ato que corrigiu o parâmetro)", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
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
    "Proventos e descontos da folha: origem do valor, incidência na base de contribuição e de IRRF e proporcionalidade " +
    "aos dias trabalhados. Vencimento, gratificações, contribuição, IRRF e salário-família são cadastrados uma única vez cada.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "VENC" },
    { nome: "descricao", rotulo: "Descrição (como aparece no contracheque)", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_TIPO_DE_RUBRICA },
    { nome: "natureza", rotulo: "Natureza (de onde vem o valor)", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: OPCOES_DE_NATUREZA },
    { nome: "percentual", rotulo: "Percentual (para percentual do vencimento; 20 = 20%)", tipo: "texto", largura: 1 },
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
    "Valores informados por matrícula para rubricas de valor informado. O lançamento fixo vale para competências " +
    "consecutivas; o variável, para uma única competência. Para encerrar um lançamento fixo, informe a competência final.",
  campos: [
    { nome: "vinculoId", rotulo: "Matrícula", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "rubricaId", rotulo: "Rubrica (de valor informado)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [
      { valor: "VARIAVEL", rotulo: "Variável (uma competência)" },
      { valor: "FIXO", rotulo: "Fixo (por vigência)" },
    ] },
    { nome: "competenciaInicio", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
    { nome: "competenciaFim", rotulo: "Competência final (lançamento fixo; em branco, sem prazo)", tipo: "texto", largura: 1 },
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
    "Tabelas de contribuição previdenciária por regime (faixas e teto), IRRF (faixas, dedução por dependente, desconto " +
    "simplificado, parcela isenta para maiores de 65 anos e redutor) e salário-família, com vigência por competência e " +
    "fundamentação legal. Sem tabela vigente, a folha não é calculada.",
  campos: [
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: OPCOES_DE_TIPO_DE_TABELA },
    { nome: "competenciaInicio", rotulo: "Vigente desde (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-01" },
    { nome: "competenciaFim", rotulo: "Vigente até (em branco, sem prazo)", tipo: "texto", largura: 1 },
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
    "Define como a folha é empenhada: quais rubricas de provento cada grupo reúne, em qual ficha, com qual categoria da " +
    "ordem cronológica e se o empenho é individual por servidor ou único para o grupo. Cada rubrica pertence a um único " +
    "grupo, o que evita despesa em duplicidade. O grupo também indica as contas da liquidação: a VPD de pessoal e a " +
    "obrigação de pessoal a pagar.",
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
    { nome: "porServidor", rotulo: "Um empenho por servidor (cada servidor é o credor)", tipo: "booleano", largura: 2 },
    { nome: "credorId", rotulo: "Credor do empenho único (quando não for por servidor)", tipo: "selecao", largura: 3, opcoes: [] },
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
        "Indica a VPD debitada e a obrigação de pessoal creditada na liquidação. Sem essas contas, a folha certificada " +
        "não pode ser liquidada. Liquidações já registradas não são alteradas; a definição vale para as próximas.",
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
    "Responsáveis designados pelo ente para certificar a folha, com o ato administrativo e o período de vigência. Sem " +
    "designação vigente na data, a certificação não é realizada; consulta, cálculo e fechamento continuam disponíveis.",
  campos: [
    { nome: "atribuicao", rotulo: "Atribuição", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [{ valor: "CERTIFICAR_FOLHA", rotulo: "Certificar (atestar) a folha" }, { valor: "CERTIFICAR_ENCARGOS_DA_FOLHA", rotulo: "Certificar (atestar) os encargos do empregador" }] },
    { nome: "pessoaId", rotulo: "Responsável (pessoa do cadastro)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "usuarioIdentificador", rotulo: "Usuário de acesso do responsável (a mesma pessoa)", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoDesignacao", rotulo: "Ato que designou (portaria, decreto, delegação)", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "Portaria 45/2026" },
    { nome: "vigenciaInicio", rotulo: "Vigência — início", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "vigenciaFim", rotulo: "Vigência — fim (em branco, sem prazo)", tipo: "data", largura: 1 },
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
        "A revogação vale a partir da data de efeito. A designação permanece no histórico e os atestos já realizados " +
        "continuam válidos; a partir dessa data, ela não autoriza novos atestos.",
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

/**
 * V11 V9.1 — OS PARÂMETROS DO 13º DO ENTE.
 *
 * ⚠️ A LISTA É DO MOLDE; O CADASTRO É ILHA (`FormParametroDo13`), pela mesma razão das tabelas: as
 * rubricas da base são LINHAS (uma lista de seleções), e o molde não monta múltiplas linhas —
 * limite declarado em `components/ui/MODULO-UI.md`. Os `campos` abaixo descrevem o que a ilha
 * grava, para que o descritor não minta sobre a tela.
 *
 * ⚠️ E O QUE ESTA TELA DECIDE É DINHEIRO DE TODO MUNDO. Daí a ação própria
 * `CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO`: quem cadastra a tabela federal do IRRF não é
 * necessariamente quem decide o critério do avo do município.
 */
export const PARAMETROS_DO_DECIMO_TERCEIRO: DefinicaoDeRecurso = definirRecurso({
  nome: "parametros-do-decimo-terceiro",
  rotulo: "Parâmetros do 13º",
  rotuloSingular: "Parâmetro do 13º",
  rota: "/folha/parametros-do-13",
  descricao:
    "Parâmetros do 13º por exercício: dias mínimos para contar um avo, avos no ano, percentual da 1ª parcela, " +
    "incidência de contribuição e imposto, rubricas que compõem a base e o ato que os fundamenta. Informe também a " +
    "situação que o adiantamento deve ter alcançado para ser abatido na 2ª parcela; sem essa informação, o abatimento " +
    "é apenas simulado e a apropriação da folha fica bloqueada. Sem parâmetro, a folha de 13º não é calculada.",
  campos: [
    { nome: "exercicio", rotulo: "Exercício (ano do 13º)", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1900, maximo: 2200 },
    { nome: "diasMinimosDoAvo", rotulo: "Dias mínimos no mês para contar um avo", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1, maximo: 30 },
    { nome: "avosNoExercicio", rotulo: "Avos no exercício", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1, maximo: 12 },
    { nome: "percentualDaPrimeiraParcela", rotulo: "Percentual da 1ª parcela", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "baseDosAvosDoAdiantamento", rotulo: "Avos da 1ª parcela contam até", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoTipo", rotulo: "Tipo do ato", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoNumero", rotulo: "Número do ato", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "atoAno", rotulo: "Ano do ato", tipo: "inteiro", obrigatorio: true, largura: 1 },
    { nome: "atoDispositivo", rotulo: "Dispositivo", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "atoEmenta", rotulo: "Ementa ou transcrição do dispositivo", tipo: "textoLongo", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    // ⚠️ TEXTO, NÃO LINK, e é decisão declarada: não existe `/folha/parametros-do-13/[id]`. Uma
    // coluna `link` faria o molde montar um caminho para uma rota que responde 404 — botão sem
    // handler, que este repositório proíbe. E o detalhe não faz falta: a lista já traz TODOS os
    // campos do parâmetro (avo, percentual, incidências, quantas rubricas na base e o ato por
    // número, ano e dispositivo). Um detalhe aqui só repetiria a linha.
    { nome: "exercicio", cabecalho: "Exercício", tipo: "texto", ordenavel: true },
    { nome: "versao", cabecalho: "Versão", tipo: "inteiro", ordenavel: true },
    { nome: "avo", cabecalho: "Avo", tipo: "texto" },
    { nome: "primeiraParcela", cabecalho: "1ª parcela", tipo: "texto" },
    { nome: "incidencias", cabecalho: "Incidências no 13º", tipo: "texto" },
    { nome: "base", cabecalho: "Rubricas da base", tipo: "inteiro" },
    // ⚠️ V11 V9.3 — A COLUNA EXISTE PARA QUE "NÃO DECLARADO" SEJA VISÍVEL NA LISTA, e não só no
    // detalhe de uma folha que já foi calculada. É o campo que separa apuração de simulação.
    { nome: "criterioDoAbatimento", cabecalho: "Abatimento exige", tipo: "texto" },
    { nome: "ato", cabecalho: "Ato", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Exercício ou ato", tipo: "texto", largura: 2, placeholder: "2026 ou 1.234" },
  ],
  // ⚠️ NENHUMA AÇÃO POR REGISTRO, e é o desenho: o parâmetro é append-only. Não se edita (a
  // correção é a versão seguinte) e não se revoga (as folhas já calculadas citam a versão que as
  // produziu, e sem ela o contracheque deixaria de se explicar). Uma ação "editar" aqui
  // reescreveria a história de uma folha fechada.
  acoes: [],
  abas: ["dados"],
  permissoes: { criar: "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO" },
});

/**
 * ═══ V13 (TR 5.12.50) — OS PARÂMETROS DO ADIANTAMENTO SALARIAL ═══
 *
 * ⚠️ RECURSO PRÓPRIO, E NÃO UMA ABA DO PARÂMETRO DO 13º. Os dois parecem irmãos — mesmo módulo,
 * mesma forma de tela, mesmo tipo de ato — e a granularidade os separa: o do 13º é POR EXERCÍCIO
 * e o do vale é POR COMPETÊNCIA. Uma lista só teria de mostrar dois tipos de linha com chaves
 * diferentes, e a coluna "vigente" significaria coisas diferentes em cada uma.
 *
 * ⚠️ E A PERMISSÃO DE CRIAR É PRÓPRIA (`CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL`): quem
 * transcreve o estatuto não recebe, por isso, o poder de escrever o decreto do mês.
 */
export const PARAMETROS_DO_ADIANTAMENTO_SALARIAL: DefinicaoDeRecurso = definirRecurso({
  nome: "parametros-do-adiantamento-salarial",
  rotulo: "Parâmetros do adiantamento salarial",
  rotuloSingular: "Parâmetro do adiantamento salarial",
  rota: "/folha/parametros-do-adiantamento-salarial",
  descricao:
    "Parâmetros do adiantamento salarial por competência: percentual, base de incidência (remuneração do mês anterior " +
    "ou projetada do próprio mês), rubricas de pagamento e de abatimento na folha mensal, situação que o adiantamento " +
    "deve ter alcançado para ser abatido (fechado, certificado ou pago) e o ato que os fundamenta. Sem parâmetro, a " +
    "folha de adiantamento salarial não é calculada. Para corrigir, cadastre nova versão; os cálculos já realizados " +
    "permanecem vinculados à versão utilizada.",
  campos: [
    { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "percentualDoAdiantamento", rotulo: "Percentual do adiantamento", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "baseDoAdiantamento", rotulo: "O percentual incide sobre", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "estadoMinimoParaAbater", rotulo: "Situação exigida para o abatimento na folha mensal", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoTipo", rotulo: "Tipo do ato", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "atoNumero", rotulo: "Número do ato", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "atoAno", rotulo: "Ano do ato", tipo: "inteiro", obrigatorio: true, largura: 1 },
    { nome: "atoDispositivo", rotulo: "Dispositivo", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "atoEmenta", rotulo: "Ementa ou transcrição do dispositivo", tipo: "textoLongo", obrigatorio: true, largura: 4 },
  ],
  colunas: [
    // ⚠️ TEXTO, NÃO LINK, pela mesma razão declarada no parâmetro do 13º: não existe rota de
    // detalhe, e uma coluna `link` faria o molde montar caminho para um 404 — botão sem handler.
    { nome: "competencia", cabecalho: "Competência", tipo: "texto", ordenavel: true },
    { nome: "versao", cabecalho: "Versão", tipo: "inteiro", ordenavel: true },
    { nome: "percentual", cabecalho: "Percentual", tipo: "texto" },
    { nome: "base", cabecalho: "Incide sobre", tipo: "texto" },
    { nome: "criterioDoAbatimento", cabecalho: "Abatimento exige", tipo: "texto" },
    { nome: "rubricas", cabecalho: "Rubricas (paga / abate)", tipo: "texto" },
    { nome: "ato", cabecalho: "Ato", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Competência ou ato", tipo: "texto", largura: 2, placeholder: "2026-06 ou 1.234" }],
  // ⚠️ NENHUMA AÇÃO POR REGISTRO: o parâmetro é append-only. Não se edita (a correção é a versão
  // seguinte) e não se revoga — as folhas já calculadas citam a versão que as produziu, e sem ela
  // o contracheque deixaria de se explicar. Uma ação "editar" aqui reescreveria a história de uma
  // folha fechada, que é justamente o que a V13 foi construída para impedir.
  acoes: [],
  abas: ["dados"],
  permissoes: { criar: "CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL" },
});

export const RECURSOS_DA_FOLHA: readonly DefinicaoDeRecurso[] = [FOLHAS, RUBRICAS, LANCAMENTOS_DA_FOLHA, TABELAS_DA_FOLHA, GRUPOS_DE_EMPENHO_DA_FOLHA, DESIGNACOES_DA_FOLHA, PARAMETROS_DO_DECIMO_TERCEIRO, PARAMETROS_DO_ADIANTAMENTO_SALARIAL];
