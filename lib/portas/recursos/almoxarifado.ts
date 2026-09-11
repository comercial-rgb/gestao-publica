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
    "O cadastro que alimenta o estoque e a compra: unidade de medida, grupo, classe " +
    "contábil e o código CATMAT quando houver. O saldo NÃO mora aqui — ele é derivado " +
    "dos movimentos, e por isso responde a 'quanto havia naquela data'.",
  campos: [
    { nome: "codigo", rotulo: "Código do material", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "MAT-0001" },
    { nome: "descricaoSucinta", rotulo: "Descrição sucinta", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "descricaoDetalhada", rotulo: "Descrição detalhada", tipo: "textoLongo", obrigatorio: true, largura: 4,
      ajuda: "É esta que vai para o termo de referência da compra." },
    { nome: "grupoId", rotulo: "Grupo de material", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "classeDeMaterialId", rotulo: "Classe contábil", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "É por ela que a entrada e a saída movem a conta de estoque no razão." },
    { nome: "classificacao", rotulo: "Classificação", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...CLASSIFICACAO] },
    { nome: "categoria", rotulo: "Categoria", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...CATEGORIA] },
    { nome: "catmat", rotulo: "Código CATMAT", tipo: "texto", largura: 1, placeholder: "268471",
      ajuda: "Catálogo federal de materiais. Opcional: nem todo item municipal tem correspondente." },
    { nome: "controlaLote", rotulo: "Controla lote e validade", tipo: "booleano", largura: 1,
      ajuda: "Marque para material perecível. Com lote, a saída passa a EXIGIR de qual lote sai." },
    { nome: "unidadeDeMedidaId", rotulo: "Unidade de estoque", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "A unidade em que o saldo é contado. Ela entra com fator 1 — é a própria medida do saldo." },
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
      aviso: "O mínimo e o máximo são POR DEPÓSITO — o mesmo material pode ter níveis diferentes em almoxarifados diferentes.",
      campos: [
        { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "quantidadeMinima", rotulo: "Quantidade mínima", tipo: "texto", largura: 1, placeholder: "10" },
        { nome: "quantidadeMaxima", rotulo: "Quantidade máxima", tipo: "texto", largura: 1, placeholder: "100" },
      ] },
    { nome: "relacionar-marca", rotulo: "Aprovar marca", acaoDoCenso: "RELACIONAR_MARCA_AO_MATERIAL",
      aviso: "Marca aprovada restringe o que a compra aceita para este material.",
      campos: [
        { nome: "marcaId", rotulo: "Marca", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
      ] },
    { nome: "relacionar-elemento", rotulo: "Relacionar elemento de despesa", acaoDoCenso: "RELACIONAR_ELEMENTO_AO_MATERIAL",
      aviso: "Sem elemento relacionado, a ordem de compra não sabe em que natureza empenhar.",
      campos: [
        { nome: "naturezaDespesaId", rotulo: "Natureza da despesa", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
      ] },
  ],
  permissoes: { criar: "CADASTRAR_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Posição de estoque deste material",
      href: "/patrimonio/almoxarifado/estoque?material={id}",
      explicacao: "Quem responde 'quanto havia naquela data' é a posição derivada dos movimentos — nunca uma coluna de saldo." },
  ],
});

export const DEPOSITOS: DefinicaoDeRecurso = definirRecurso({
  nome: "depositos",
  rotulo: "Depósitos",
  rotuloSingular: "Depósito",
  rota: "/patrimonio/almoxarifado/depositos",
  descricao:
    "Onde o material fica. O depósito pertence a uma unidade gestora, e é por ela que a " +
    "permissão de movimentar estoque é recortada.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "ALM-01" },
    { nome: "nome", rotulo: "Nome do depósito", tipo: "texto", obrigatorio: true, largura: 3 },
    { nome: "unidadeOrcId", rotulo: "Unidade gestora", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "Quem pode movimentar este depósito é quem tem permissão nesta unidade." },
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
      aviso: "Enquanto vigente, o bloqueio RECUSA entrada, saída e transferência neste depósito. Deixe o fim em branco para bloqueio sem prazo.",
      campos: [
        { nome: "materialId", rotulo: "Material (em branco = o depósito inteiro)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "inicio", rotulo: "Início do bloqueio", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "fim", rotulo: "Fim do bloqueio", tipo: "data", largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ] },
    { nome: "encerrar-bloqueio", rotulo: "Encerrar bloqueio", acaoDoCenso: "ENCERRAR_BLOQUEIO_DE_ESTOQUE",
      aviso: "O bloqueio não é apagado: ganha data de fim, e o período em que ele valeu continua explicando as recusas daquele intervalo.",
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
      explicacao: "A comparação é contra a posição DERIVADA, e por isso ela também responde por uma data passada." },
    { rotulo: "Lotes vencendo neste depósito",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}&aba=validade",
      explicacao: "Só lotes COM SALDO entram: um lote já consumido não vence para ninguém." },
  ],
});

export const REQUISICOES_DE_MATERIAL: DefinicaoDeRecurso = definirRecurso({
  nome: "requisicoes-de-material",
  rotulo: "Requisições de material",
  rotuloSingular: "Requisição",
  rota: "/patrimonio/almoxarifado/requisicoes",
  descricao:
    "O setor pede, o almoxarifado atende — e o atendimento pode ser PARCIAL. O que falta " +
    "atender é derivado da diferença entre o solicitado e as saídas já vinculadas ao item.",
  campos: [
    { nome: "numero", rotulo: "Número da requisição", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "REQ-2026-001" },
    { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "setorId", rotulo: "Setor requisitante", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "dataRequisicao", rotulo: "Data da requisição", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "solicitante", rotulo: "Solicitante", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "materialId", rotulo: "Material", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [],
      ajuda: "Esta tela cria requisição de UM item. Requisição com vários itens é pendência nomeada." },
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
      aviso: "A saída consome o estoque pelo PREÇO MÉDIO da posição no depósito, e o preço aplicado fica gravado no movimento. Atendimento parcial é normal: repita a ação até zerar o saldo.",
      campos: [
        { nome: "itemDeRequisicaoId", rotulo: "Item a atender", tipo: "selecao", obrigatorio: true, largura: 3, opcoes: [] },
        { nome: "quantidade", rotulo: "Quantidade a entregar", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "5" },
        { nome: "dataMovimento", rotulo: "Data da saída", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "loteId", rotulo: "Lote (obrigatório em material com lote)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 2 },
      ] },
  ],
  permissoes: { criar: "REGISTRAR_REQUISICAO_DE_MATERIAL" },
  abas: [...ABAS_SEM_MODELO_NOVO],
  relacionados: [
    { rotulo: "Posição do depósito desta requisição",
      href: "/patrimonio/almoxarifado/estoque?deposito={id}",
      explicacao: "Antes de atender, é a posição derivada que diz se há saldo — e o servidor recusa se não houver." },
  ],
});

export const INVENTARIOS_DE_ESTOQUE: DefinicaoDeRecurso = definirRecurso({
  nome: "inventarios-de-estoque",
  rotulo: "Inventários de estoque",
  rotuloSingular: "Inventário",
  rota: "/patrimonio/almoxarifado/inventarios",
  descricao:
    "Enquanto aberto, o inventário BLOQUEIA a movimentação do depósito — é isso que torna " +
    "a contagem comparável com a posição. A divergência é derivada: contado menos posição.",
  campos: [
    { nome: "depositoId", rotulo: "Depósito", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
    { nome: "dataAbertura", rotulo: "Data de abertura", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "termoAberturaId", rotulo: "Termo de abertura", tipo: "selecao", largura: 2, opcoes: [],
      ajuda: "O termo é um documento do M22 — ele entra na fila de assinaturas como qualquer outro." },
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
      aviso: "A contagem grava o que foi CONTADO. A divergência contra a posição é derivada na hora de ler — o inventário não guarda saldo.",
      campos: [
        { nome: "materialId", rotulo: "Material", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "loteId", rotulo: "Lote", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "quantidadeContada", rotulo: "Quantidade contada", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "0" },
      ] },
    { nome: "fechar", rotulo: "Fechar inventário", acaoDoCenso: "FECHAR_INVENTARIO_DE_ESTOQUE", irreversivel: true,
      aviso: "Fechar LIBERA a movimentação do depósito. As divergências apuradas não viram ajuste automático — ajuste é movimento próprio, com motivo.",
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
      explicacao: "É contra ela que a contagem é comparada — e ela responde pela data de abertura, não só por hoje." },
  ],
});

export const RECURSOS_DO_ALMOXARIFADO: readonly DefinicaoDeRecurso[] = [
  MATERIAIS,
  DEPOSITOS,
  REQUISICOES_DE_MATERIAL,
  INVENTARIOS_DE_ESTOQUE,
];
