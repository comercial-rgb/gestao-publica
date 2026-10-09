import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ OS DESCRITORES DO ALMOXARIFADO FÍSICO — M10, TR 5.18 ═══
 *
 * O ENT05 deu a estas cláusulas modelo, caso de uso e teste contra banco, e **nenhuma
 * tela**. É por isso que elas entraram como `IMPLEMENTADO_NAO_VALIDADO`: existiam no
 * servidor e nenhum servidor municipal as alcançava. Este lote é a superfície.
 *
 * ⚠️ NENHUM MODELO NOVO AQUI, e duas consequências ficam à vista no descritor:
 *
 * 1. **Sem aba de anexos e sem aba de campos adicionais.** As duas custam MODELO — uma
 *    coluna de dono em `Anexo` e um valor em `CadastroComCamposAdicionais` com a FK
 *    correspondente —, e `verificarDefinicao` recusa declarar a aba sem o modelo, com
 *    razão: aba vazia ensina que o sistema perdeu o arquivo. Fica a pendência
 *    `ANEXO-NOS-CADASTROS-DO-ALMOXARIFADO`.
 *
 *    ⚠️ O QUE **JÁ** ESTÁ LIGADO AO M22, e não precisou de modelo: os termos de abertura e
 *    fechamento do inventário são `Anexo` desde o ENT05 (`termoAberturaId`,
 *    `termoFechamentoId`), então eles já entram na fila de assinaturas.
 *
 * 2. **Formulário de UM item onde o caso de uso recebe array.** `cadastrarMaterial` recebe
 *    `unidades[]` e `registrarRequisicaoDeMaterial` recebe `itens[]`; o molde não tem campo
 *    repetidor e não cresce para ganhar um (limite 2 do `lib/molde/tipos.ts`). A tela cria
 *    o caso de UM, que é o caso comum de um município, e **diz isso no próprio aviso do
 *    formulário** em vez de deixar o operador descobrir. Ver as pendências
 *    `MATERIAL-COM-MULTIPLAS-UNIDADES` e `REQUISICAO-COM-VARIOS-ITENS`.
 */

const ABAS_SEM_MODELO_NOVO = ["dados", "historico", "relacionados"] as const;

const CLASSIFICACAO = [
  { valor: "CONSUMO", rotulo: "Material de consumo" },
  { valor: "PERMANENTE", rotulo: "Material permanente" },
  { valor: "SERVICO", rotulo: "Serviço" },
  { valor: "OBRA", rotulo: "Obra" },
] as const;

const CATEGORIA = [
  { valor: "ESTOCAVEL", rotulo: "Estocável" },
  { valor: "PERECIVEL", rotulo: "Perecível" },
  { valor: "NAO_PERECIVEL", rotulo: "Não perecível" },
  { valor: "COMBUSTIVEL", rotulo: "Combustível" },
] as const;

export const MATERIAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "materiais",
  rotulo: "Materiais",
  rotuloSingular: "Material",
  rota: "/patrimonio/almoxarifado/materiais",
  descricao:
    "Catálogo de materiais utilizado no estoque e nas compras: unidade de medida, grupo, classe " +
    "contábil e código CATMAT, quando houver. O saldo é apurado a partir das movimentações e pode " +
    "ser consultado em qualquer data.",
  campos: [
    { nome: "codigo", rotulo: "Código do material", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "MAT-0001" },
    { nome: "descricaoSucinta", rotulo: "Descrição sucinta", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "descricaoDetalhada", rotulo: "Descrição detalhada", tipo: "textoLongo", obrigatorio: true, largura: 4,
      ajuda: "Descrição utilizada no termo de referência da compra." },
    { nome: "grupoId", rotulo: "Grupo de material", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "classeDeMaterialId", rotulo: "Classe contábil", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "Define a conta de estoque movimentada nas entradas e saídas." },
    { nome: "classificacao", rotulo: "Classificação", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...CLASSIFICACAO] },
    { nome: "categoria", rotulo: "Categoria", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...CATEGORIA] },
    { nome: "catmat", rotulo: "Código CATMAT", tipo: "texto", largura: 1, placeholder: "268471",
      ajuda: "Catálogo de materiais do Governo Federal. Opcional." },
    { nome: "controlaLote", rotulo: "Controla lote e validade", tipo: "booleano", largura: 1,
      ajuda: "Marque para material perecível. Nesse caso, cada saída deve indicar o lote." },
    { nome: "unidadeDeMedidaId", rotulo: "Unidade de estoque", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "Unidade em que o saldo é controlado (fator 1)." },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricaoSucinta", cabecalho: "Descrição", tipo: "texto" },
    { nome: "grupo", cabecalho: "Grupo", tipo: "texto" },
    { nome: "classificacao", cabecalho: "Classificação", tipo: "texto" },
    { nome: "unidade", cabecalho: "Unidade", tipo: "texto" },
    { nome: "catmat", cabecalho: "CATMAT", tipo: "texto" },
    { nome: "lote", cabecalho: "Lote", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Código, descrição ou CATMAT", tipo: "texto", largura: 2, placeholder: "MAT-0001 ou papel A4" },
    { nome: "classificacao", rotulo: "Classificação", tipo: "selecao", largura: 1, opcoes: [...CLASSIFICACAO] },
    { nome: "categoria", rotulo: "Categoria", tipo: "selecao", largura: 1, opcoes: [...CATEGORIA] },
  ],
  acoes: [
    { nome: "definir-parametro", rotulo: "Definir mínimo e máximo", acaoDoCenso: "DEFINIR_PARAMETRO_DE_ESTOQUE",
      aviso: "Os níveis mínimo e máximo são definidos por depósito; o mesmo material pode ter níveis diferentes em cada almoxarifado.",
      campos: [
        { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "quantidadeMinima", rotulo: "Quantidade mínima", tipo: "texto", largura: 1, placeholder: "10" },
        { nome: "quantidadeMaxima", rotulo: "Quantidade máxima", tipo: "texto", largura: 1, placeholder: "100" },
      ] },
    { nome: "relacionar-marca", rotulo: "Aprovar marca", acaoDoCenso: "RELACIONAR_MARCA_AO_MATERIAL",
      // ⚠️ ACHADO DESTE LOTE, e ele fica NO CÓDIGO e não na tela. Nenhum caso de uso do
      // repositório CRIA uma `MarcaAprovada`: o ENT05 modelou a tabela e a relação
      // `MaterialMarca`, e o serviço que cadastra a marca não existe. Enquanto não
      // existir, este seletor vem vazio e o molde o mostra desabilitado — comportamento
      // correto para um campo sem opção. Pendência `CADASTRO-DE-MARCA-APROVADA`.
      //
      // O aviso ABAIXO é o que o servidor municipal lê, e por isso fala a língua dele:
      // sem identificador interno, sem nome de lote, sem emoji.
      aviso:
        "A marca aprovada restringe o que a compra aceita para este material. " +
        "Se a lista estiver vazia, ainda não há marca cadastrada.",
      campos: [
        { nome: "marcaId", rotulo: "Marca", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
      ] },
    { nome: "relacionar-elemento", rotulo: "Relacionar elemento de despesa", acaoDoCenso: "RELACIONAR_ELEMENTO_AO_MATERIAL",
      aviso: "O elemento de despesa relacionado define a natureza em que a ordem de compra é empenhada.",
      campos: [
        { nome: "naturezaDespesaId", rotulo: "Natureza da despesa", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Posição de estoque deste material",
      href: "/patrimonio/almoxarifado/estoque?material={id}",
      explicacao: "Saldo do material por depósito, apurado a partir das movimentações, em qualquer data." },
  ],
});

export const DEPOSITOS: DefinicaoDeRecurso = definirRecurso({
  nome: "depositos",
  rotulo: "Depósitos",
  rotuloSingular: "Depósito",
  rota: "/patrimonio/almoxarifado/depositos",
  descricao:
    "Locais de guarda dos materiais. Cada depósito pertence a uma unidade gestora, que define " +
    "quem pode movimentar o estoque.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "ALM-01" },
    { nome: "nome", rotulo: "Nome do depósito", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "unidadeOrcId", rotulo: "Unidade gestora", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "Podem movimentar este depósito os usuários com permissão nesta unidade." },
    { nome: "responsavelId", rotulo: "Responsável", tipo: "selecao", largura: 2, opcoes: [] },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "nome", cabecalho: "Depósito", tipo: "texto" },
    { nome: "unidade", cabecalho: "Unidade gestora", tipo: "texto" },
    { nome: "responsavel", cabecalho: "Responsável", tipo: "texto" },
    { nome: "situacao", cabecalho: "Movimentação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Código ou nome", tipo: "texto", largura: 2, placeholder: "ALM-01 ou Almoxarifado central" },
  ],
  acoes: [
    { nome: "bloquear", rotulo: "Bloquear movimentação", acaoDoCenso: "BLOQUEAR_ESTOQUE", irreversivel: false,
      aviso: "Enquanto vigente, o bloqueio impede entradas, saídas e transferências neste depósito. Deixe o fim em branco para bloqueio sem prazo.",
      campos: [
        { nome: "materialId", rotulo: "Material (em branco, todo o depósito)", tipo: "referencia", catalogo: "materiais-do-almoxarifado", largura: 2, placeholder: "Código, CATMAT ou descrição" },
        { nome: "inicio", rotulo: "Início do bloqueio", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "fim", rotulo: "Fim do bloqueio", tipo: "data", largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
    { nome: "encerrar-bloqueio", rotulo: "Encerrar bloqueio", acaoDoCenso: "ENCERRAR_BLOQUEIO_DE_ESTOQUE",
      aviso: "O bloqueio recebe data de fim e permanece no histórico do depósito.",
      campos: [
        { nome: "bloqueioId", rotulo: "Bloqueio vigente", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
        { nome: "fim", rotulo: "Encerrar em", tipo: "data", obrigatorio: true, largura: 1 },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_DEPOSITO" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Materiais abaixo do mínimo neste depósito",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}&aba=minimos",
      explicacao: "Materiais com saldo abaixo do nível mínimo, inclusive em data passada." },
    { rotulo: "Lotes vencendo neste depósito",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}&aba=validade",
      explicacao: "Somente lotes com saldo são considerados." },
  ],
});

export const REQUISICOES_DE_MATERIAL: DefinicaoDeRecurso = definirRecurso({
  nome: "requisicoes-de-material",
  rotulo: "Requisições de material",
  rotuloSingular: "Requisição",
  rota: "/patrimonio/almoxarifado/requisicoes",
  descricao:
    "Requisições de material dos setores ao almoxarifado. O atendimento pode ser parcial; o saldo " +
    "a atender é a diferença entre o solicitado e as saídas já registradas para o item.",
  campos: [
    { nome: "numero", rotulo: "Número da requisição", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "REQ-2026-001" },
    { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "setorId", rotulo: "Setor requisitante", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "dataRequisicao", rotulo: "Data da requisição", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "solicitante", rotulo: "Solicitante", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "materialId", rotulo: "Material", tipo: "referencia", catalogo: "materiais-do-almoxarifado", obrigatorio: true, largura: 2,
      placeholder: "Código, CATMAT ou descrição", ajuda: "Cada requisição registrada nesta tela contém um único item." },
    { nome: "quantidade", rotulo: "Quantidade solicitada", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "12" },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Número", tipo: "link", ordenavel: true },
    { nome: "dataRequisicao", cabecalho: "Data", tipo: "data", ordenavel: true },
    { nome: "deposito", cabecalho: "Depósito", tipo: "texto" },
    { nome: "setor", cabecalho: "Setor", tipo: "texto" },
    { nome: "solicitante", cabecalho: "Solicitante", tipo: "texto" },
    { nome: "atendimento", cabecalho: "Atendimento", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Número ou solicitante", tipo: "texto", largura: 2, placeholder: "REQ-2026 ou Maria" },
    { nome: "deposito", rotulo: "Depósito", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "pendentes", rotulo: "Situação", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "PENDENTES", rotulo: "Com saldo a atender" },
        { valor: "ATENDIDAS", rotulo: "Totalmente atendidas" },
      ] },
  ],
  acoes: [
    { nome: "atender", rotulo: "Atender requisição", acaoDoCenso: "REGISTRAR_SAIDA_FISICA",
      aviso: "A saída é valorizada pelo preço médio do material no depósito, registrado no movimento. O atendimento pode ser parcial: repita a ação até atender todo o solicitado.",
      campos: [
        { nome: "itemDeRequisicaoId", rotulo: "Item a atender", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
        { nome: "quantidade", rotulo: "Quantidade a entregar", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "5" },
        { nome: "dataMovimento", rotulo: "Data da saída", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "loteId", rotulo: "Lote (obrigatório para material controlado por lote)", tipo: "referencia", catalogo: "lotes-da-requisicao", contexto: ["itemDeRequisicaoId"], largura: 2, placeholder: "Identificação do lote" },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
  ],
  permissoes: { criar: "REGISTRAR_REQUISICAO_DE_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Posição do depósito desta requisição",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}",
      explicacao: "Saldo disponível no depósito; sem saldo, o atendimento não é realizado." },
  ],
});

export const INVENTARIOS_DE_ESTOQUE: DefinicaoDeRecurso = definirRecurso({
  nome: "inventarios-de-estoque",
  rotulo: "Inventários de estoque",
  rotuloSingular: "Inventário",
  rota: "/patrimonio/almoxarifado/inventarios",
  descricao:
    "Inventário físico por depósito. Enquanto aberto, a movimentação do depósito fica bloqueada. " +
    "A divergência é a diferença entre a quantidade contada e o saldo registrado.",
  campos: [
    { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "dataAbertura", rotulo: "Data de abertura", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "termoAberturaId", rotulo: "Termo de abertura", tipo: "selecao", largura: 2, opcoes: [],
      ajuda: "O termo é incluído no acervo de documentos e segue para assinatura." },
  ],
  colunas: [
    { nome: "deposito", cabecalho: "Depósito", tipo: "link" },
    { nome: "dataAbertura", cabecalho: "Aberto em", tipo: "data", ordenavel: true },
    { nome: "dataFechamento", cabecalho: "Fechado em", tipo: "data" },
    { nome: "contagens", cabecalho: "Contagens", tipo: "inteiro" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "deposito", rotulo: "Depósito", tipo: "selecao", largura: 2, opcoes: [] },
    { nome: "situacao", rotulo: "Situação", tipo: "selecao", largura: 1,
      opcoes: [
        { valor: "ABERTO", rotulo: "Aberto" },
        { valor: "FECHADO", rotulo: "Fechado" },
      ] },
  ],
  acoes: [
    { nome: "contar", rotulo: "Registrar contagem", acaoDoCenso: "REGISTRAR_CONTAGEM_DE_INVENTARIO",
      aviso: "Registra a quantidade contada. A divergência em relação ao saldo é calculada na consulta.",
      campos: [
        { nome: "materialId", rotulo: "Material", tipo: "referencia", catalogo: "materiais-do-almoxarifado", obrigatorio: true, largura: 2, placeholder: "Código, CATMAT ou descrição" },
        { nome: "loteId", rotulo: "Lote", tipo: "referencia", catalogo: "lotes-do-inventario", contexto: ["materialId", "__id"], largura: 2, placeholder: "Identificação do lote" },
        { nome: "quantidadeContada", rotulo: "Quantidade contada", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "0" },
      ] },
    { nome: "fechar", rotulo: "Fechar inventário", acaoDoCenso: "FECHAR_INVENTARIO_DE_ESTOQUE", irreversivel: true,
      aviso: "O fechamento libera a movimentação do depósito. As divergências não geram ajuste automático; o ajuste é registrado como movimento próprio, com motivo.",
      campos: [
        { nome: "dataFechamento", rotulo: "Data de fechamento", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "termoFechamentoId", rotulo: "Termo de fechamento", tipo: "selecao", largura: 2, opcoes: [] },
      ] },
  ],
  permissoes: { criar: "ABRIR_INVENTARIO_DE_ESTOQUE" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Posição do depósito inventariado",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}",
      explicacao: "Saldo na data de abertura, usado na comparação com a contagem." },
  ],
});

/**
 * ═══ OS TRÊS CADASTROS DE APOIO ═══
 *
 * ⚠️ ELES NÃO SÃO ENFEITE: SEM OS TRÊS, O FORMULÁRIO DE MATERIAL NÃO MONTA. Medido no banco
 * de desenvolvimento durante este lote — `ClasseDeMaterial`, `GrupoDeMaterial` e
 * `UnidadeDeMedida` estavam todos em ZERO, e os três são campo obrigatório de
 * `cadastrarMaterial`. A tela de material renderizava o seletor desabilitado dizendo o
 * motivo (o molde faz isso), o que é honesto e inútil: não havia por onde criar a opção.
 *
 * Os três têm caso de uso e ação de censo desde o ENT05. O que faltava era descritor.
 */

export const CLASSES_DE_MATERIAL: DefinicaoDeRecurso = definirRecurso({
  nome: "classes-de-material",
  rotulo: "Classes de material",
  rotuloSingular: "Classe de material",
  rota: "/patrimonio/almoxarifado/classes",
  descricao:
    "Vincula os materiais à contabilidade: a classe define a conta de estoque movimentada nas " +
    "entradas e saídas.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "3.0.10" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "contaContabilId", rotulo: "Conta de estoque", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [],
      ajuda: "Conta do ativo circulante em que o valor do estoque desta classe é registrado." },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "conta", cabecalho: "Conta de estoque", tipo: "texto" },
    { nome: "materiais", cabecalho: "Materiais", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  // ⚠️ AS CLASSES DO PCASP SÃO DECLARADAS porque o campo é `contaContabilId`, e
  // `verificarDefinicao` cobra. `["1"]` é o ativo: estoque é ativo circulante, e oferecer
  // as 6.074 analíticas do plano faria o seletor mandar 400 KB e ainda deixar escolher uma
  // conta de despesa onde o domínio exige ativo.
  classesDeConta: ["1"],
  permissoes: { criar: "CADASTRAR_CLASSE_DE_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Materiais desta classe",
      href: "/patrimonio/almoxarifado/materiais?q={id}",
      explicacao: "Os materiais desta classe utilizam a conta de estoque definida nela." },
  ],
});

export const GRUPOS_DE_MATERIAL: DefinicaoDeRecurso = definirRecurso({
  nome: "grupos-de-material",
  rotulo: "Grupos de material",
  rotuloSingular: "Grupo de material",
  rota: "/patrimonio/almoxarifado/grupos",
  descricao:
    "Estrutura hierárquica do catálogo de materiais. Um grupo pode estar subordinado a outro, " +
    "como 'Expediente' dentro de 'Consumo'.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "01.02" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "paiId", rotulo: "Grupo pai", tipo: "selecao", largura: 2, opcoes: [],
      ajuda: "Em branco para grupo de primeiro nível." },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "pai", cabecalho: "Grupo pai", tipo: "texto" },
    { nome: "materiais", cabecalho: "Materiais", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_GRUPO_DE_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Materiais deste grupo",
      href: "/patrimonio/almoxarifado/materiais?q={id}",
      explicacao: "O grupo organiza o catálogo; a conta contábil é definida pela classe." },
  ],
});

export const UNIDADES_DE_MEDIDA: DefinicaoDeRecurso = definirRecurso({
  nome: "unidades-de-medida",
  rotulo: "Unidades de medida",
  rotuloSingular: "Unidade de medida",
  rota: "/patrimonio/almoxarifado/unidades",
  descricao:
    "Unidades em que o saldo dos materiais é controlado. Todo material exige unidade de medida.",
  campos: [
    { nome: "sigla", rotulo: "Sigla", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "UN" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3, placeholder: "Unidade" },
  ],
  colunas: [
    { nome: "sigla", cabecalho: "Sigla", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "materiais", cabecalho: "Materiais", tipo: "inteiro" },
  ],
  filtros: [{ nome: "q", rotulo: "Sigla ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_UNIDADE_DE_MEDIDA" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Materiais que usam esta unidade",
      href: "/patrimonio/almoxarifado/materiais?q={id}",
      explicacao: "A unidade de estoque tem fator 1, pois é a medida do saldo." },
  ],
});

export const RECURSOS_DO_ALMOXARIFADO: readonly DefinicaoDeRecurso[] = [
  CLASSES_DE_MATERIAL,
  GRUPOS_DE_MATERIAL,
  UNIDADES_DE_MEDIDA,
  MATERIAIS,
  DEPOSITOS,
  REQUISICOES_DE_MATERIAL,
  INVENTARIOS_DE_ESTOQUE,
];
