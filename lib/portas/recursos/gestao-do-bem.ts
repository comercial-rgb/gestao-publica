import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ OS DESCRITORES DA GESTÃO DO BEM — M10, TR 5.19 ═══
 *
 * O ENT05 modelou a seção inteira e o ENT06 item 0 não chegou a dar tela a ela: 23 cláusulas
 * de 5.19 estão em `IMPLEMENTADO_NAO_VALIDADO` — o serviço existe, tem teste contra banco, e
 * nenhum servidor municipal alcança. Esta leva abre a superfície pelos três cadastros de
 * apoio, que são os que **todo o resto pressupõe**: um bem se move PARA uma localização, se
 * baixa POR um motivo, e entra no acervo POR um tipo de incorporação.
 *
 * ⚠️ A ORDEM NÃO É ARBITRÁRIA, E É A LIÇÃO DO ALMOXARIFADO. Lá, o formulário de material
 * montava com três seletores vazios porque unidade, grupo e classe não tinham tela — e só o
 * percurso de navegador achou. Os cadastros de apoio vêm primeiro para que a tela do BEM,
 * quando vier, não nasça com seletor vazio.
 *
 * ⚠️ O QUE **NÃO** ENTRA NESTA LEVA, E POR QUÊ:
 *
 * 1. **A comissão patrimonial.** `cadastrarComissaoPatrimonial` recebe `membros[]` — e o
 *    molde não tem campo repetidor e não cresce para ganhar um (o limite 2 de
 *    `lib/molde/tipos.ts`). Uma comissão de um membro só não é uma comissão: ela existe para
 *    que mais de uma pessoa responda pela contagem. Fica para a leva do inventário de bens,
 *    que é onde ela é exigida, e lá será escrita à mão. Pendência `COMISSAO-COM-MEMBROS`.
 * 2. **A fórmula de avaliação.** É expressão editável pelo usuário, e isso tem regra própria
 *    (interpretador de universo fechado — nunca `eval` nem lista negra). Superfície para ela
 *    é decisão de desenho, não cadastro.
 * 3. **Abas de anexo e de campos adicionais**, pela mesma razão do almoxarifado: custam
 *    MODELO (uma FK de dono em `Anexo`), e aba vazia ensina que o sistema perdeu o arquivo.
 */

const ABAS_SEM_MODELO_NOVO = ["dados", "historico", "relacionados"] as const;

export const LOCALIZACOES_FISICAS: DefinicaoDeRecurso = definirRecurso({
  nome: "localizacoes-fisicas",
  rotulo: "Localizações físicas",
  rotuloSingular: "Localização física",
  rota: "/patrimonio/localizacoes",
  descricao:
    "Locais físicos dos bens, em estrutura hierárquica: prédio, andar e sala. São usados nas " +
    "transferências e no inventário.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "PRE-01.02" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
    {
      nome: "paiId",
      rotulo: "Localização superior",
      tipo: "selecao",
      largura: 2,
      opcoes: [],
      ajuda: "Em branco para o primeiro nível, como um prédio.",
    },
    {
      nome: "setorId",
      rotulo: "Setor responsável",
      tipo: "selecao",
      largura: 2,
      opcoes: [],
      ajuda: "Opcional. Setor responsável pelos bens guardados neste local.",
    },
    {
      nome: "publicavelNaTransparencia",
      rotulo: "Divulgar esta localização na consulta pública de bens",
      tipo: "booleano",
      largura: 4,
      ajuda:
        "Desmarcado, os bens continuam na consulta pública, mas sem a indicação deste local. " +
        "Recomendado para depósitos, cofres e locais de acesso restrito.",
    },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "pai", cabecalho: "Localização superior", tipo: "texto" },
    { nome: "setor", cabecalho: "Setor", tipo: "texto" },
    { nome: "publicacao", cabecalho: "Consulta pública", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_LOCALIZACAO_FISICA" },
  // ⚠️ SEM A ABA DE RELACIONADOS, e o `verificarDefinicao` foi quem cobrou: declarar a aba
  // sem listar nenhum relacionado é abrir uma aba vazia. A tela de BENS por localização
  // ainda não existe — apontar para ela agora seria link para o nada, que é o mesmo defeito
  // que o percurso do ENT06 pegou em `relacionados` do material.
  abas: ["dados", "historico"],
});

export const MOTIVOS_DE_BAIXA: DefinicaoDeRecurso = definirRecurso({
  nome: "motivos-de-baixa",
  rotulo: "Motivos de baixa",
  rotuloSingular: "Motivo de baixa",
  rota: "/patrimonio/motivos-de-baixa",
  // ⚠️ A CLÁUSULA DE ORIGEM É A TR 5.19.30, e ela fica AQUI, em comentário, e não na
  // descrição que vai para a tela. Número de cláusula em texto renderizado declara
  // atendimento a quem não tem como conferir — o rastro pertence ao código, o rótulo
  // pertence ao negócio. Foi assim que este lote reprovou no portão da primeira vez.
  descricao:
    "Motivos de baixa de bens do acervo, como alienação, doação, inservibilidade ou furto, " +
    "definidos pelo ente.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "BX-01" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_MOTIVO_DE_BAIXA" },
  // ⚠️ SÓ "DADOS", E A DIFERENÇA É DECLARADA. Este cadastro não tem movimento próprio nem
  // relação para listar: a baixa que o usa vive no bem, não aqui. Declarar "histórico" e
  // "relacionados" abriria duas abas vazias — e aba vazia ensina que o sistema perdeu algo.
  abas: ["dados"],
});

export const TIPOS_DE_INCORPORACAO: DefinicaoDeRecurso = definirRecurso({
  nome: "tipos-de-incorporacao",
  rotulo: "Tipos de incorporação",
  rotuloSingular: "Tipo de incorporação",
  rota: "/patrimonio/tipos-de-incorporacao",
  descricao:
    "Formas de incorporação de bens ao acervo, como aquisição, doação, comodato e permuta, " +
    "definidas pelo ente.",
  campos: [
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "INC-01" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 3 },
  ],
  colunas: [
    { nome: "codigo", cabecalho: "Código", tipo: "link", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "bens", cabecalho: "Bens", tipo: "inteiro" },
    { nome: "situacao", cabecalho: "Situação", tipo: "situacao" },
  ],
  filtros: [{ nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_TIPO_DE_INCORPORACAO" },
  // Mesma razão da localização: a aba de relacionados só entra quando houver tela de bens
  // para onde apontar.
  abas: ["dados", "historico"],
});

export const RECURSOS_DA_GESTAO_DO_BEM: readonly DefinicaoDeRecurso[] = [
  LOCALIZACOES_FISICAS,
  MOTIVOS_DE_BAIXA,
  TIPOS_DE_INCORPORACAO,
];
