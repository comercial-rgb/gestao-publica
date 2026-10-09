import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos";

/**
 * ═══ A FICHA ORÇAMENTÁRIA PELA TELA (M02, V6.2 U0 — resolve `CRIAR-FICHA-SEM-TELA`) ═══
 *
 * `CRIAR_FICHA` estava no censo e não tinha superfície; o QDD é só leitura. A ficha de pessoal dos
 * percursos nascia por script, e o pedido é que a operação não dependa disso.
 *
 * ⚠️ A FICHA NASCE SEM CRÉDITO — não há campo de valor, e a ausência é a decisão desta tela. Criar
 * ficha durante a execução não é abrir crédito: a dotação de uma classificação que a LOA não trazia
 * vem por crédito adicional ESPECIAL (Lei 4.320, arts. 41, II, e 42), autorizado por lei e aberto por
 * decreto — Planejamento > Créditos adicionais. Um campo "valor dotado" aqui seria a porta pela qual
 * qualquer um com CRIAR_FICHA criaria saldo sem lei. A carga da LOA com os valores fixados é outro
 * ato, e continua fora desta tela (pendência `CARGA-DA-LOA-PELA-TELA`).
 *
 * ⚠️ OS COMPONENTES SÃO SELETORES REFERENCIADOS: pesquisa no servidor, a UO recortada pelas unidades
 * onde a sessão tem CRIAR_FICHA. O caso de uso do M02 resolve cada código de novo, confere órgão × UO,
 * autoriza NA UO e exige o exercício aberto — dentro da transação.
 */
export const FICHAS: DefinicaoDeRecurso = definirRecurso({
  nome: "fichas",
  rotulo: "Fichas orçamentárias",
  rotuloSingular: "Ficha orçamentária",
  rota: "/planejamento/fichas",
  descricao:
    "Fichas de dotação pela classificação completa (unidade, funcional-programática, natureza e fonte). A ficha é " +
    "criada sem saldo; a dotação provém da LOA ou de crédito adicional, com lei e decreto.",
  campos: [
    { nome: "exercicio", rotulo: "Exercício (só os abertos)", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
    { nome: "numero", rotulo: "Número da ficha no exercício", tipo: "inteiro", obrigatorio: true, largura: 1, minimo: 1, ajuda: "Único no exercício." },
    { nome: "unidadeOrc", rotulo: "Unidade orçamentária", tipo: "referencia", catalogo: "unidades-para-ficha", obrigatorio: true, largura: 2, ajuda: "Unidades em que você tem permissão para criar ficha. O órgão é o da unidade." },
    { nome: "funcao", rotulo: "Função", tipo: "referencia", catalogo: "funcoes", obrigatorio: true, largura: 2 },
    { nome: "subfuncao", rotulo: "Subfunção", tipo: "referencia", catalogo: "subfuncoes", obrigatorio: true, largura: 2 },
    { nome: "programa", rotulo: "Programa", tipo: "referencia", catalogo: "programas", obrigatorio: true, largura: 2 },
    { nome: "acao", rotulo: "Ação (projeto/atividade)", tipo: "referencia", catalogo: "acoes", obrigatorio: true, largura: 2 },
    { nome: "naturezaDespesa", rotulo: "Natureza da despesa", tipo: "referencia", catalogo: "naturezas-de-despesa", obrigatorio: true, largura: 2, ajuda: "Categoria, grupo, modalidade e elemento (6 dígitos)." },
    { nome: "fonte", rotulo: "Fonte de recurso", tipo: "referencia", catalogo: "fontes", obrigatorio: true, largura: 2 },
    { nome: "co", rotulo: "Código de acompanhamento (opcional)", tipo: "referencia", catalogo: "codigos-de-acompanhamento", largura: 2 },
    { nome: "exercicioFonte", rotulo: "Exercício da fonte", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [{ valor: "1", rotulo: "1 — do exercício" }, { valor: "2", rotulo: "2 — de exercícios anteriores" }] },
  ],
  colunas: [
    { nome: "numero", cabecalho: "Ficha", tipo: "link", ordenavel: true },
    { nome: "exercicio", cabecalho: "Exercício", tipo: "inteiro" },
    { nome: "unidade", cabecalho: "Unidade", tipo: "texto" },
    { nome: "funcional", cabecalho: "Funcional-programática", tipo: "texto" },
    { nome: "natureza", cabecalho: "Natureza", tipo: "texto" },
    { nome: "fonte", cabecalho: "Fonte", tipo: "texto" },
    { nome: "autorizado", cabecalho: "Autorizado", tipo: "dinheiro", somavel: true },
    { nome: "disponivel", cabecalho: "Disponível (cache)", tipo: "dinheiro", somavel: true },
  ],
  filtros: [
    { nome: "q", rotulo: "Número, natureza ou unidade", tipo: "texto", largura: 2 },
    { nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", largura: 1 },
  ],
  acoes: [],
  permissoes: { criar: "CRIAR_FICHA" },
  abas: ["dados", "historico", "relacionados"],
  relacionados: [
    { rotulo: "Quadro de detalhamento da despesa", href: "/planejamento/qdd", explicacao: "A dotação inicial, os créditos e a dotação atualizada de todas as fichas." },
    { rotulo: "Créditos adicionais", href: "/planejamento/creditos-adicionais", explicacao: "Onde a ficha criada durante a execução recebe dotação, com lei, decreto e itens de suplementação e anulação." },
    { rotulo: "Cronograma de desembolso e metas de arrecadação", href: "/planejamento/cmd-mba", explicacao: "A cota mensal da despesa e as metas bimestrais da receita do exercício." },
    { rotulo: "Empenhos", href: "/despesa/empenhos", explicacao: "Emitir o empenho: a busca da dotação acha a ficha pelo número, pela classificação ou pelo código reduzido." },
    { rotulo: "Códigos reduzidos do PPA", href: "/planejamento/ppa/codigos-reduzidos", explicacao: "O número curto da combinação de unidade, função, subfunção, programa e ação desta ficha no plano." },
    { rotulo: "Ações do PPA na LOA", href: "/planejamento/loa/vinculo-ppa", explicacao: "A ação do plano que cada ficha executa, e as fichas sem ação correspondente no plano." },
  ],
});
