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
  { valor: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", rotulo: "Abatimento do adiantamento do 13º (lido da folha da 1ª parcela)" },
  // ⚠️ V13 — SEM ESTA LINHA A CADEIA DO ADIANTAMENTO SALARIAL NÃO EXISTE PELA INTERFACE, e o
  // defeito é exatamente o `ROTULO-CRU-DO-TIPO-DE-FOLHA` ao contrário: nenhum compilador cobra
  // este array. É a única natureza que o motor MENSAL sabe ler para abater o vale, e o parâmetro
  // do adiantamento RECUSA qualquer outra no papel de abatimento. Faltando aqui, o operador não
  // consegue criar a rubrica, o parâmetro não pode ser cadastrado, e o vale nunca é abatido —
  // tudo isso com o domínio inteiro funcionando e nenhum teste vermelho.
  { valor: "ABATIMENTO_DO_ADIANTAMENTO_SALARIAL", rotulo: "Abatimento do adiantamento salarial (lido da folha do vale da mesma competência)" },
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
  { valor: "MENSAL_COMPLEMENTAR", rotulo: "Mensal complementar (paga a diferença de uma competência já fechada)" },
  { valor: "ADIANTAMENTO_DECIMO_TERCEIRO", rotulo: "Adiantamento do 13º (1ª parcela)" },
  { valor: "DECIMO_TERCEIRO", rotulo: "13º salário (2ª parcela, com abatimento da 1ª)" },
  // ⚠️ V13 — O MESMO ARRAY SEM COMPILADOR. Sem esta linha o tipo existe no domínio, no banco e no
  // motor, e NÃO EXISTE para quem opera: a barra de abrir folha não o oferece, e a lista de
  // folhas mostraria o nome cru do enum. Foi assim que a V11 registrou `ROTULO-CRU-DO-TIPO-DE-FOLHA`
  // duas vezes.
  { valor: "ADIANTAMENTO_SALARIAL", rotulo: "Adiantamento salarial (o vale do mês, abatido na mensal da mesma competência)" },
];

/**
 * V13 — AS DUAS PRÁTICAS DE BASE DO VALE, EM PORTUGUÊS DE QUEM OPERA.
 *
 * ⚠️ E A LISTA NÃO ESGOTA AS REGRAS ADMISSÍVEIS: ela é o que o sistema sabe calcular e verificar.
 * Um ente cuja regra não seja nenhuma das duas recebe pendência explícita
 * (`REGRA-DO-ADIANTAMENTO-SALARIAL-NAO-SUPORTADA`), não um encaixe na mais parecida.
 */
export const OPCOES_DE_BASE_DO_ADIANTAMENTO_SALARIAL = [
  { valor: "REMUNERACAO_DO_MES_ANTERIOR", rotulo: "A remuneração do mês anterior (o que a folha fechada dele apurou)" },
  { valor: "REMUNERACAO_PROJETADA_DO_MES", rotulo: "A remuneração projetada do próprio mês (motor mensal, tabelas vigentes)" },
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
    "A folha de uma competência, por TIPO. Calcular gera um cálculo NUMERADO, com memória e sha256 em cada " +
    "contracheque; recalcular é o número seguinte; cancelar e fechar são fatos. Fechada, não se recalcula. " +
    "QUEM vira contracheque depende do tipo, e a tela de cada folha diz o que o cálculo dela produz.",
  campos: [
    { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "2026-05" },
    {
      nome: "tipo", rotulo: "Tipo", tipo: "selecao", obrigatorio: true, largura: 1,
      opcoes: [...OPCOES_DE_TIPO_DE_FOLHA],
      ajuda:
        "As duas folhas de 13º medem por AVO do exercício, não por dia do mês, e exigem o parâmetro do " +
        "exercício cadastrado. Só existe uma de cada por ano; a de 13º abate automaticamente o adiantamento. " +
        // ⚠️ "JÁ PAGO" ERA FALSO, E ERA A PRIMEIRA COISA QUE O OPERADOR LIA (V11 V9.4b). O que a
        // complementar compara é o APURADO em folha FECHADA — `fechamento !== null`, e só isso.
        // Certificação, empenho, liquidação e pagamento não são consultados em lugar nenhum de
        // `calcularFolhaComplementarNaTx`, e o pagamento nem é ato deste módulo. Afirmar "pago"
        // aqui é a mesma doença da memória que dizia "1ª parcela já PAGA" sobre um cálculo que só
        // verificara o fechamento.
        "A MENSAL COMPLEMENTAR recalcula uma competência cuja mensal já foi fechada e apura só a DIFERENÇA, " +
        "rubrica a rubrica: ela não reabre nem corrige a folha original, e recusa quando o correto é menor " +
        "que o já APURADO em folha fechada. Apurar não é empenhar, liquidar nem pagar.",
    },
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
      aviso:
        "Calcula com as tabelas vigentes. Sem tabela, sem regime ou sem vencimento, recusa nomeando. Cada cálculo é " +
        "numerado; o anterior continua no histórico. A ABRANGÊNCIA é declarada: ou a folha inteira, ou as matrículas " +
        "que você escrever — e recortar quem entra exige a ação SELECIONAR_VINCULOS_DA_FOLHA, que é separada de calcular. " +
        "O que o cálculo de fato alcançou fica gravado e visível na seção \"Abrangência dos cálculos\".",
      campos: [
        {
          nome: "modoDeSelecao",
          rotulo: "Quem entra neste cálculo (declare — o sistema não deduz)",
          tipo: "selecao",
          opcoes: [
            { valor: "TODOS_OS_ELEGIVEIS", rotulo: "Todos os elegíveis da competência" },
            { valor: "EXPLICITA", rotulo: "Só as matrículas declaradas abaixo" },
          ],
          largura: 2,
        },
        {
          // ⚠️ MATRÍCULA DIGITADA, E NÃO CAIXA DE SELEÇÃO NA LISTA. A ordem proíbe que a paginação
          // defina quem é calculado, e uma lista paginada com caixas envia o que está VISÍVEL —
          // quem revisa lê "os selecionados" sem ver que são "os da página 1". Texto num campo só
          // é imune por construção: trocar de página não altera uma linha dele.
          nome: "matriculasSelecionadas",
          rotulo: "Matrículas (uma por linha, ou separadas por vírgula) — só quando o modo for EXPLÍCITO",
          tipo: "textoLongo",
          largura: 4,
        },
        { nome: "motivo", rotulo: "Motivo (opcional — ex.: conferência, correção de lançamento)", tipo: "texto", largura: 4 },
      ],
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
    // ── V6.2 — os ENCARGOS DO EMPREGADOR sobre a folha fechada: apurar, certificar, empenhar, liquidar ──
    {
      nome: "apurar-encargos", rotulo: "Apurar os encargos do empregador", acaoDoCenso: "APURAR_ENCARGOS_DA_FOLHA",
      aviso:
        "Calcula, sobre o cálculo FECHADO, o que o ENTE deve por componente (previdência patronal, RAT, outras entidades…), " +
        "com as versões APROVADAS vigentes na competência. Não muda contracheque nem líquido. Componente sem parâmetro " +
        "aprovado fica AUSENTE — nunca zero — e a apuração fica incompleta. Apurar de novo, depois de corrigir um " +
        "parâmetro, é uma nova versão com comparativo.",
      campos: [{ nome: "motivo", rotulo: "Motivo (opcional — ex.: portaria corrigida)", tipo: "texto", largura: 4 }],
    },
    {
      nome: "certificar-encargos", rotulo: "Certificar (atestar) os encargos", acaoDoCenso: "CERTIFICAR_ENCARGOS_DA_FOLHA",
      aviso:
        "O atesto dos ENCARGOS é outro objeto: o da folha salarial não alcança encargos apurados depois dele. Exige designação " +
        "vigente com a atribuição de certificar os encargos, no dia do ato e hoje. Quem apurou não certifica.",
      campos: [{ nome: "data", rotulo: "Data do ato", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "apropriar-encargos", rotulo: "Empenhar os encargos", acaoDoCenso: "APROPRIAR_FOLHA",
      aviso:
        "Empenha, por grupo de empenho dos encargos, o que a apuração vigente pede MENOS o que já foi empenhado para esta " +
        "folha. Nunca empenha a contribuição retida do servidor. Reexecutar continua de onde parou; redução exige anulação.",
      campos: [{ nome: "dataDoEmpenho", rotulo: "Data dos empenhos", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "liquidar-encargos", rotulo: "Liquidar os encargos certificados", acaoDoCenso: "LIQUIDAR_FOLHA",
      aviso:
        "Reconhece a obrigação dos empenhos dos encargos com as contas do grupo (VPD de encargos e encargos a recolher). " +
        "Liquidar não é recolher: a guia e o pagamento são atos próprios. Quem certificou não liquida.",
      campos: [{ nome: "data", rotulo: "Data das liquidações", tipo: "data", obrigatorio: true, largura: 1 }],
    },
    {
      nome: "ajustar-encargos", rotulo: "Ajustar os encargos para baixo", acaoDoCenso: "APROPRIAR_FOLHA", irreversivel: true,
      aviso:
        "Quando a apuração vigente (certificada) pede MENOS do que a despesa já reconhece: anula pela despesa a parte liquidada e " +
        "não paga, depois a parte do empenho não liquidada; o que já foi PAGO não se anula e fica registrado para restituição. " +
        "A apuração anterior e o contracheque não mudam. Reexecutar continua de onde parou, sem anular duas vezes.",
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
    "(vigência), VARIÁVEL vale numa competência só. Nada é reescrito: encerrar um fixo é dizer a competência final.",
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
    { nome: "atribuicao", rotulo: "Atribuição", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [{ valor: "CERTIFICAR_FOLHA", rotulo: "Certificar (atestar) a folha" }, { valor: "CERTIFICAR_ENCARGOS_DA_FOLHA", rotulo: "Certificar (atestar) os encargos do empregador" }] },
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
    "Por exercício, o que o ENTE declara para o 13º: quantos dias fazem um mês contar um avo, quantos avos tem o ano, " +
    "o percentual da 1ª parcela, se o 13º sofre contribuição e imposto, quais rubricas compõem a base — e o ato que " +
    "fundamenta tudo isso, com número, ano e dispositivo. Sem parâmetro, a folha de 13º recusa calcular e diz o exercício. " +
    "Declara também QUAL ESTADO o adiantamento precisa ter alcançado para ser abatido na 2ª parcela — sem essa " +
    "declaração o 13º ainda calcula, mas como simulação, e a apropriação da folha fica bloqueada.",
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
    "Por competência, o que o ENTE declara para o adiantamento salarial (o vale do mês): o percentual, sobre que base " +
    "ele incide (a remuneração do mês anterior, ou a projetada do próprio mês), qual rubrica paga e qual abate na folha " +
    "mensal, QUAL ESTADO o vale precisa ter alcançado para ser abatido — fechado, certificado ou pago —, e o ato que " +
    "fundamenta tudo isso. Sem parâmetro, a folha de adiantamento salarial recusa calcular e diz a competência. " +
    "Corrigir é cadastrar a versão seguinte: as folhas já calculadas citam na memória a versão que as produziu, e é " +
    "ESSA versão que a mensal lê para abater — cadastrar a seguinte não reescreve nenhum cálculo fechado.",
  campos: [
    { nome: "competencia", rotulo: "Competência (AAAA-MM)", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "percentualDoAdiantamento", rotulo: "Percentual do adiantamento", tipo: "texto", obrigatorio: true, largura: 1 },
    { nome: "baseDoAdiantamento", rotulo: "O percentual incide sobre", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "estadoMinimoParaAbater", rotulo: "Para ser abatido na mensal, o vale precisa estar", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
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
