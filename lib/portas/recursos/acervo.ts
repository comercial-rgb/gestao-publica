import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ OS DESCRITORES DO ACERVO — M10, TR 5.19 ═══
 *
 * A leva anterior entregou os três cadastros de apoio (localizações, motivos de baixa, tipos
 * de incorporação) justamente para que a tela do BEM não nascesse com seletor vazio. Aqui vem
 * o acervo em si — e ele chegou como lote de MODELO mais superfície, não de superfície, por
 * uma medição: **nenhum serviço do domínio criava um `BemPatrimonial`**. `adquirirBem` exige
 * liquidação e `registrarEntradaAvulsa` recebe um bem que já existe; só o seed da POC e os
 * testes criavam bens, por escrita crua.
 *
 * ⚠️ A CLASSE VEM ANTES DO BEM, E ISSO FOI MEDIDO. `ClasseDeBens` tinha ZERO registros no
 * banco de desenvolvimento. Sem o cadastro de classes, o seletor de classe do formulário do
 * bem nasceria desabilitado dizendo "nenhuma opção cadastrada" — mensagem correta apontando a
 * causa errada. É a mesma lição do almoxarifado, agora com número em vez de suspeita.
 *
 * ⚠️ A ROTA DO BEM NÃO É `/patrimonio/bens`. Aquela já existe e é a posição patrimonial por
 * classe, com emissão em PDF. Sobrepor uma tela existente trocaria um demonstrativo por um
 * cadastro sem que ninguém tivesse pedido.
 */

export const CLASSES_DE_BENS: DefinicaoDeRecurso = definirRecurso({
  nome: "classes-de-bens",
  rotulo: "Classes de bens",
  rotuloSingular: "Classe de bens",
  rota: "/patrimonio/classes-de-bens",
  descricao:
    "Como o acervo se agrupa — móveis e imóveis, por natureza — e, para cada grupo, a conta " +
    "do ativo em que os bens daquela classe são registrados na contabilidade.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "1.2.3" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    {
      nome: "especie",
      rotulo: "Espécie",
      tipo: "selecao",
      obrigatorio: true,
      largura: 1,
      // ⚠️ OPÇÕES LITERAIS, e de propósito: a espécie é um rol FECHADO do modelo, não um
      // cadastro do ente. Buscá-la na porta daria a impressão de que o município pode
      // acrescentar uma terceira espécie — e não pode.
      opcoes: [
        { valor: "MOVEL", rotulo: "Móvel" },
        { valor: "IMOVEL", rotulo: "Imóvel" },
      ],
    },
    {
      nome: "contaContabilAtivoId",
      rotulo: "Conta do ativo",
      tipo: "selecao",
      obrigatorio: true,
      largura: 3,
      opcoes: [],
      ajuda: "Onde os bens desta classe entram na contabilidade. Só contas analíticas do ativo.",
    },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "especie", cabecalho: "Espécie", tipo: "texto" },
    { nome: "conta", cabecalho: "Conta do ativo", tipo: "texto" },
    { nome: "bens", cabecalho: "Bens", tipo: "inteiro" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [
    { nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 },
    {
      nome: "especie",
      rotulo: "Espécie",
      tipo: "selecao",
      largura: 1,
      opcoes: [
        { valor: "MOVEL", rotulo: "Móvel" },
        { valor: "IMOVEL", rotulo: "Imóvel" },
      ],
    },
  ],
  acoes: [],
  permissoes: { criar: "CADASTRAR_CLASSE_DE_BENS" },

  // ⚠️ O RECORTE É DECLARADO MESMO SEM O GUARD COBRAR, e essa frase é a pendência inteira.
  // `verificarDefinicao` exige `classesDeConta` quando existe campo chamado — literalmente —
  // `contaContabilId`. A coluna real deste cadastro é `contaContabilAtivoId`, então o guard
  // fica MUDO aqui: eu poderia montar um seletor com as 1.404 contas analíticas de ativo do
  // plano oficial e nada acusaria. Guarda que enumera forma acha só aquela forma.
  // Pendência `RECORTE-DE-CONTA-POR-NOME-LITERAL`.
  classesDeConta: ["1"],

  abas: ["dados", "historico"],
});

export const BENS_PATRIMONIAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "bens-patrimoniais",
  rotulo: "Bens patrimoniais",
  rotuloSingular: "Bem patrimonial",
  rota: "/patrimonio/bens-patrimoniais",
  descricao:
    "O acervo do município, bem a bem: o que é, em que classe entra, quando foi adquirido e " +
    "como entrou. O valor não se informa aqui — ele vem dos movimentos patrimoniais.",
  campos: [
    {
      nome: "numeroTombamento",
      rotulo: "Tombamento",
      tipo: "texto",
      obrigatorio: true,
      largura: 1,
      placeholder: "TOMB-0001",
      // ⚠️ INFORMADO, NÃO GERADO — e a ajuda diz isso a quem digita, porque a pergunta
      // "de onde tiro este número?" nasce na primeira vez que alguém abre esta tela.
      ajuda: "A numeração é do município. O sistema não a inventa.",
    },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    {
      nome: "classeDeBensId",
      rotulo: "Classe",
      tipo: "selecao",
      obrigatorio: true,
      largura: 2,
      opcoes: [],
      ajuda: "É a classe que determina em que conta do ativo o bem é registrado.",
    },
    { nome: "dataAquisicao", rotulo: "Data de aquisição", tipo: "data", obrigatorio: true, largura: 1 },
    {
      nome: "tipoDeIncorporacaoId",
      rotulo: "Como entrou",
      tipo: "selecao",
      largura: 2,
      opcoes: [],
      ajuda: "Opcional. Adquirido, recebido em doação, comodato, permuta — conforme o rol do ente.",
    },
  ],
  colunas: [
    { nome: "numeroTombamento", cabecalho: "Tombamento", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "classe", cabecalho: "Classe", tipo: "texto" },
    { nome: "incorporacao", cabecalho: "Como entrou", tipo: "texto" },
    { nome: "dataAquisicao", cabecalho: "Aquisição", tipo: "data", ordenavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Tombamento ou descrição", tipo: "texto", largura: 2 },
    {
      nome: "especie",
      rotulo: "Espécie",
      tipo: "selecao",
      largura: 1,
      opcoes: [
        { valor: "MOVEL", rotulo: "Móvel" },
        { valor: "IMOVEL", rotulo: "Imóvel" },
      ],
    },
  ],
  // ⚠️ QUATRO AÇÕES, UMA POR EIXO — e cada uma leva SÓ o campo que o seu tipo exige.
  //
  // O domínio tem um guard (`CAMPO_OBRIGATORIO_DO_TIPO`) que recusa movimento de LOCALIZACAO
  // sem localização, de RESPONSAVEL sem responsável, e assim por diante — porque um movimento
  // gravável sem o campo APAGARIA o eixo em silêncio: a derivação leria o último movimento do
  // tipo, acharia nulo, e concluiria que o bem não está em lugar nenhum. Um formulário único
  // com os quatro campos convidaria exatamente a essa recusa, quatro vezes em cada três.
  //
  // ⚠️ E OS QUATRO SÃO O MESMO CRACHÁ (`REGISTRAR_MOVIMENTO_DE_GESTAO`), de propósito: a
  // segregação que o edital pede aqui é entre MOVER o bem e AVALIÁ-LO, não entre mover de sala
  // e mudar de responsável. Inventar quatro ações de censo seria inventar segregação que a
  // fonte não pede — e cada uma teria de ser concedida a mão em toda instalação existente.
  acoes: [
    {
      nome: "mover-localizacao",
      rotulo: "Mover de localização",
      acaoDoCenso: "REGISTRAR_MOVIMENTO_DE_GESTAO",
      aviso: "Muda onde o bem está guardado. Não toca a contabilidade — valor é outro eixo.",
      campos: [
        { nome: "localizacaoId", rotulo: "Nova localização", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "dataMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "atribuir-responsavel",
      rotulo: "Atribuir responsável",
      acaoDoCenso: "REGISTRAR_MOVIMENTO_DE_GESTAO",
      aviso: "Quem responde pela guarda do bem a partir desta data. O bem continua sendo do ente.",
      campos: [
        { nome: "responsavelId", rotulo: "Responsável", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "dataMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "registrar-estado",
      rotulo: "Registrar estado de conservação",
      acaoDoCenso: "REGISTRAR_MOVIMENTO_DE_GESTAO",
      campos: [
        // ⚠️ OPÇÕES LITERAIS: o rol é FECHADO no modelo, não é cadastro do ente. Buscá-lo na
        // porta sugeriria que o município pode acrescentar uma sexta conservação.
        {
          nome: "estado", rotulo: "Estado", tipo: "selecao", obrigatorio: true, largura: 2,
          opcoes: [
            { valor: "OTIMO", rotulo: "Ótimo" },
            { valor: "BOM", rotulo: "Bom" },
            { valor: "REGULAR", rotulo: "Regular" },
            { valor: "RUIM", rotulo: "Ruim" },
            { valor: "INSERVIVEL", rotulo: "Inservível" },
          ],
        },
        { nome: "dataMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
    {
      nome: "registrar-situacao",
      rotulo: "Registrar situação física",
      acaoDoCenso: "REGISTRAR_MOVIMENTO_DE_GESTAO",
      campos: [
        {
          nome: "situacao", rotulo: "Situação", tipo: "selecao", obrigatorio: true, largura: 2,
          opcoes: [
            { valor: "EM_USO", rotulo: "Em uso" },
            { valor: "EM_EMPRESTIMO", rotulo: "Em empréstimo" },
            { valor: "EM_LOCACAO", rotulo: "Em locação" },
            { valor: "EM_MANUTENCAO_PREVENTIVA", rotulo: "Em manutenção preventiva" },
            { valor: "EM_MANUTENCAO_CORRETIVA", rotulo: "Em manutenção corretiva" },
            { valor: "EM_DESUSO", rotulo: "Em desuso" },
            { valor: "BAIXADO", rotulo: "Baixado" },
          ],
        },
        { nome: "dataMovimento", rotulo: "Data do fato", tipo: "data", obrigatorio: true, largura: 1 },
        { nome: "motivo", rotulo: "Motivo", tipo: "texto", obrigatorio: true, largura: 3 },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_BEM" },

  // ⚠️ SEM A ABA DE RELACIONADOS, pela mesma razão dos cadastros de apoio: ela exige uma
  // consulta EXISTENTE para onde apontar, e a tela de movimentos do bem ainda não existe.
  // Declarar a aba agora abriria um link para o nada.
  abas: ["dados", "historico"],
});

export const RECURSOS_DO_ACERVO: readonly DefinicaoDeRecurso[] = [
  CLASSES_DE_BENS,
  BENS_PATRIMONIAIS,
];
