import { definirRecurso, type DefinicaoDeRecurso } from "../../molde/tipos.js";

/**
 * ═══ O PLANEJAMENTO PLURIANUAL — M02b, V4 §8 (Fila A), conciliado do siafic-cg c04ad5a ═══
 *
 * Quatro recursos do molde: o PLANO (o quadriênio e o que entra nele), o PROGRAMA NO PLANO
 * (indicadores e ações do plano), a ESTRUTURA TEMÁTICA (eixo, área, público-alvo, macroação) e
 * a LDO (o trâmite e os oito anexos da LRF). Tudo é ato do ENTE: nenhuma entidade tem unidade
 * orçamentária, e a leitura é a do Planejamento.
 *
 * ⚠️ AS OPÇÕES QUE VÊM DO BANCO SÃO `opcoes: []` — quem as lê é o Server Component. A
 * aplicação do produto da alienação é CONTEXTUAL (só as alienações DAQUELA LDO): oferecer as de
 * outra LDO seria montar um formulário que o caso de uso vai recusar.
 *
 * ⚠️ METAS FÍSICAS, INDICADORES E O PERCENTUAL DA RCL SÃO TEXTO, NÃO DINHEIRO: o molde só sabe
 * duas casas em `dinheiro`, e "3,5 km", "12,3456 por mil" e "1,200000 da RCL" precisam de seis.
 * A porta aceita vírgula ou ponto e entrega a string decimal ao domínio, que a valida.
 */

const OPCOES_DE_TIPO_DE_ESTRUTURA = [
  { valor: "EIXO", rotulo: "Eixo estruturante" },
  { valor: "AREA", rotulo: "Área temática (desdobra um eixo)" },
  { valor: "PUBLICO", rotulo: "Público-alvo" },
  { valor: "MACROACAO", rotulo: "Macroação" },
] as const;

/**
 * ⚠️ O ROL DO PASSIVO CONTINGENTE (1 a 8 e 99) VEIO DO ENUNCIADO DA ORIGEM, que o leu no manual
 * SIGA v44 — o manual NÃO está transcrito aqui. Por isso os rótulos são só o código: inventar a
 * descrição de cada passivo seria inventar norma. O 99 é "outros" e existe de propósito.
 */
const OPCOES_DE_PASSIVO = ["1", "2", "3", "4", "5", "6", "7", "8"].map((c) => ({ valor: c, rotulo: `Passivo contingente ${c}` })).concat([{ valor: "99", rotulo: "99 — outros" }]);
const OPCOES_DE_APLICACAO = ["1", "2", "3", "4", "5"].map((c) => ({ valor: c, rotulo: `Tipo de aplicação ${c}` }));

const ANO = { tipo: "inteiro" as const, minimo: 1900, maximo: 2200 };

export const PLANOS_PLURIANUAIS: DefinicaoDeRecurso = definirRecurso({
  nome: "planos-plurianuais",
  rotulo: "Plano Plurianual (PPA)",
  rotuloSingular: "Plano plurianual",
  rota: "/planejamento/ppa",
  descricao:
    "Plano plurianual do quadriênio e a lei que o instituiu (CF, art. 165, § 1º), com os programas, a estratégia e o " +
    "valor previsto de cada um, a receita prevista e a série histórica por exercício.",
  campos: [
    { nome: "anoInicio", rotulo: "Primeiro exercício", ...ANO, obrigatorio: true, largura: 1, placeholder: "2026" },
    { nome: "anoFim", rotulo: "Último exercício", ...ANO, obrigatorio: true, largura: 1, placeholder: "2029", ajuda: "Quatro exercícios, incluindo o primeiro e o último. Ex.: 2026 a 2029." },
    { nome: "leiRef", rotulo: "Lei que instituiu o plano", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "Lei Municipal 1.234/2025" },
    { nome: "dataPublicacao", rotulo: "Data de publicação", tipo: "data", obrigatorio: true, largura: 1 },
  ],
  colunas: [
    { nome: "quadrienio", cabecalho: "Quadriênio", tipo: "link", ordenavel: true },
    { nome: "leiRef", cabecalho: "Lei", tipo: "texto" },
    { nome: "dataPublicacao", cabecalho: "Publicação", tipo: "data" },
    { nome: "programas", cabecalho: "Programas", tipo: "inteiro" },
    { nome: "previsoes", cabecalho: "Previsões de receita", tipo: "inteiro" },
  ],
  filtros: [{ nome: "ano", rotulo: "Vigente no exercício", tipo: "inteiro", largura: 1, placeholder: "2027" }],
  acoes: [
    {
      nome: "programa-no-plano", rotulo: "Incluir programa no plano", acaoDoCenso: "CADASTRAR_PROGRAMA_PPA",
      aviso: "O objetivo vem do cadastro do programa. Neste plano, informe a estratégia e o valor previsto para o quadriênio.",
      campos: [
        { nome: "programaId", rotulo: "Programa", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "areaTematicaId", rotulo: "Área temática", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
        { nome: "publicoAlvoId", rotulo: "Público-alvo", tipo: "selecao", largura: 1, opcoes: [] },
        { nome: "estrategia", rotulo: "Estratégia neste plano", tipo: "textoLongo", largura: 3, ajuda: "Como o programa será executado no quadriênio." },
        { nome: "valorPrevisto", rotulo: "Valor previsto do quadriênio (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1, ajuda: "Limite do programa, independente da soma das ações." },
      ],
    },
    {
      nome: "previsao-de-receita", rotulo: "Prever receita do quadriênio", acaoDoCenso: "CADASTRAR_RECEITA_PPA",
      campos: [
        { nome: "naturezaReceitaId", rotulo: "Natureza da receita", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "fonteId", rotulo: "Fonte de recurso", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
        { nome: "ano", rotulo: "Exercício", ...ANO, obrigatorio: true, largura: 1, ajuda: "Dentro do quadriênio." },
        { nome: "valor", rotulo: "Valor previsto (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
      ],
    },
    {
      nome: "receita-anterior", rotulo: "Registrar receita de exercício anterior", acaoDoCenso: "CADASTRAR_RECEITA_PPA",
      aviso: "Receita realizada em exercício anterior ao plano, que fundamenta a projeção.",
      campos: [
        { nome: "naturezaReceitaId", rotulo: "Natureza da receita", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "ano", rotulo: "Exercício realizado", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "valor", rotulo: "Valor realizado (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_PPA" },
  abas: ["dados", "historico", "relacionados"],
  relacionados: [
    { rotulo: "Programas deste plano", href: "/planejamento/ppa/programas?plano={id}", explicacao: "Cada programa no plano, com os indicadores e as ações que o detalham." },
    { rotulo: "Estrutura temática do PPA", href: "/planejamento/ppa/estrutura", explicacao: "Eixos, áreas temáticas, públicos-alvo e macroações definidos pelo ente." },
  ],
});

export const PROGRAMAS_DO_PPA: DefinicaoDeRecurso = definirRecurso({
  nome: "programas-do-ppa",
  rotulo: "Programas do PPA",
  rotuloSingular: "Programa do plano",
  rota: "/planejamento/ppa/programas",
  descricao:
    "Programas de cada plano plurianual: estratégia, valor previsto, indicadores e ações com produto, meta física e " +
    "meta financeira. O programa é incluído no plano pelo detalhe do PPA.",
  campos: [],
  colunas: [
    { nome: "programa", cabecalho: "Programa", tipo: "link" },
    { nome: "quadrienio", cabecalho: "Plano", tipo: "texto" },
    { nome: "areaTematica", cabecalho: "Área temática", tipo: "texto" },
    { nome: "valorPrevisto", cabecalho: "Valor previsto", tipo: "dinheiro", somavel: true, ordenavel: true },
    { nome: "indicadores", cabecalho: "Indicadores", tipo: "inteiro" },
    { nome: "acoes", cabecalho: "Ações", tipo: "inteiro" },
  ],
  filtros: [
    { nome: "plano", rotulo: "Plano", tipo: "texto", largura: 1, placeholder: "Ano de início" },
    { nome: "q", rotulo: "Programa", tipo: "texto", largura: 2, placeholder: "Código ou descrição" },
  ],
  acoes: [
    {
      nome: "indicador", rotulo: "Registrar indicador do programa", acaoDoCenso: "CADASTRAR_PROGRAMA_PPA",
      campos: [
        { nome: "descricao", rotulo: "Indicador", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "Taxa de mortalidade infantil" },
        { nome: "unidadeMedida", rotulo: "Unidade de medida", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "por mil nascidos vivos" },
        { nome: "situacaoInicial", rotulo: "Situação inicial", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "12,3456", ajuda: "Até seis casas decimais; pode ser negativo." },
        { nome: "situacaoModificada", rotulo: "Situação ao fim do plano", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "9,5" },
      ],
    },
    {
      nome: "acao-do-plano", rotulo: "Incluir ação no programa", acaoDoCenso: "CADASTRAR_PROGRAMA_PPA",
      aviso: "A ação vem do cadastro do planejamento. A classificação aprovada (unidade executora, função e subfunção) é informativa e não altera permissões de acesso.",
      campos: [
        { nome: "acaoId", rotulo: "Ação", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "macroacaoId", rotulo: "Macroação", tipo: "selecao", largura: 1, opcoes: [] },
        { nome: "unidadeExecutoraId", rotulo: "Unidade executora", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
        { nome: "funcaoId", rotulo: "Função", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
        { nome: "subfuncaoId", rotulo: "Subfunção", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [] },
        { nome: "produto", rotulo: "Produto", tipo: "texto", obrigatorio: true, largura: 2, placeholder: "Escola construída" },
        { nome: "unidadeMedida", rotulo: "Unidade de medida", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "unidade" },
        { nome: "regiaoAtendida", rotulo: "Região atendida", tipo: "texto", largura: 1, placeholder: "todo o município" },
        { nome: "metaFisica", rotulo: "Meta física", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "3,5", ajuda: "Até seis casas decimais. Ex.: 3,5 km." },
        { nome: "metaFinanceira", rotulo: "Meta financeira (R$)", tipo: "dinheiro", obrigatorio: true, largura: 1 },
      ],
    },
  ],
  permissoes: {},
  abas: ["dados", "historico"],
});

export const ESTRUTURA_DO_PPA: DefinicaoDeRecurso = definirRecurso({
  nome: "estrutura-do-ppa",
  rotulo: "Estrutura temática do PPA",
  rotuloSingular: "Item da estrutura",
  rota: "/planejamento/ppa/estrutura",
  descricao:
    "Eixos estruturantes, áreas temáticas, públicos-alvo e macroações definidos pelo município no plano que aprova.",
  campos: [
    { nome: "tipo", rotulo: "O que cadastrar", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: [...OPCOES_DE_TIPO_DE_ESTRUTURA] },
    { nome: "codigo", rotulo: "Código", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "01" },
    { nome: "descricao", rotulo: "Descrição", tipo: "texto", obrigatorio: true, largura: 2 },
    { nome: "eixoId", rotulo: "Eixo (para área temática)", tipo: "selecao", largura: 2, opcoes: [], ajuda: "A área temática é vinculada a um eixo; os demais itens não têm vínculo." },
  ],
  colunas: [
    { nome: "tipo", cabecalho: "Tipo", tipo: "texto", ordenavel: true },
    { nome: "codigo", cabecalho: "Código", tipo: "texto", ordenavel: true },
    { nome: "descricao", cabecalho: "Descrição", tipo: "texto" },
    { nome: "eixo", cabecalho: "Eixo", tipo: "texto" },
  ],
  filtros: [
    { nome: "tipo", rotulo: "Tipo", tipo: "selecao", largura: 1, opcoes: OPCOES_DE_TIPO_DE_ESTRUTURA.map((o) => ({ valor: o.valor, rotulo: o.rotulo.split(" (")[0] ?? o.rotulo })) },
    { nome: "q", rotulo: "Código ou descrição", tipo: "texto", largura: 2 },
  ],
  acoes: [],
  permissoes: { criar: "CADASTRAR_ESTRUTURA_PPA" },
  abas: [],
});

const DINHEIRO = { tipo: "dinheiro" as const, obrigatorio: true, largura: 1 as const };
const SINALADO = { tipo: "texto" as const, obrigatorio: true, largura: 1 as const, placeholder: "-50000,00", ajuda: "Pode ser negativo." };

export const LEIS_DE_DIRETRIZES: DefinicaoDeRecurso = definirRecurso({
  nome: "leis-de-diretrizes",
  rotulo: "Lei de Diretrizes Orçamentárias (LDO)",
  rotuloSingular: "LDO",
  rota: "/planejamento/ldo",
  descricao:
    "Lei de diretrizes orçamentárias de cada exercício e sua tramitação (envio ao Legislativo, devolução e sanção), " +
    "com as prioridades e os anexos da LRF: metas anuais, riscos fiscais, renúncia de receita, alienação de bens, " +
    "projeção do RPPS, dívida consolidada e margem de expansão. Os anexos são emitidos em PDF no detalhe.",
  campos: [
    { nome: "exercicio", rotulo: "Exercício", ...ANO, obrigatorio: true, largura: 1, placeholder: "2026" },
    { nome: "inicioVigencia", rotulo: "Início da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "fimVigencia", rotulo: "Fim da vigência", tipo: "data", obrigatorio: true, largura: 1 },
    { nome: "numeroProtocolo", rotulo: "Protocolo no Legislativo", tipo: "texto", largura: 1 },
    { nome: "dataEnvioLegislativo", rotulo: "Envio ao Legislativo", tipo: "data", largura: 1, ajuda: "Deixe em branco enquanto a LDO estiver em elaboração." },
    { nome: "dataDevolucaoExecutivo", rotulo: "Devolução ao Executivo", tipo: "data", largura: 1 },
    { nome: "dataSancao", rotulo: "Sanção", tipo: "data", largura: 1 },
  ],
  colunas: [
    { nome: "exercicio", cabecalho: "Exercício", tipo: "link", ordenavel: true },
    { nome: "vigencia", cabecalho: "Vigência", tipo: "texto" },
    { nome: "situacao", cabecalho: "Trâmite", tipo: "situacao" },
    { nome: "prioridades", cabecalho: "Prioridades", tipo: "inteiro" },
    { nome: "metasAnuais", cabecalho: "Metas anuais", tipo: "inteiro" },
  ],
  filtros: [{ nome: "exercicio", rotulo: "Exercício", tipo: "inteiro", largura: 1 }],
  acoes: [
    {
      nome: "prioridade", rotulo: "Registrar prioridade", acaoDoCenso: "CADASTRAR_PRIORIDADE_LDO",
      campos: [
        { nome: "acaoId", rotulo: "Ação (se já existir na classificação)", tipo: "selecao", largura: 2, opcoes: [] },
        { nome: "descricaoAcao", rotulo: "Descrição da prioridade (conforme a lei)", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "produto", rotulo: "Produto", tipo: "texto", obrigatorio: true, largura: 1 },
        { nome: "unidadeMedida", rotulo: "Unidade de medida", tipo: "texto", obrigatorio: true, largura: 1 },
        { nome: "meta", rotulo: "Meta física", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "12", ajuda: "Até seis casas decimais." },
      ],
    },
    {
      nome: "meta-anual", rotulo: "Registrar meta anual (Anexo de Metas Fiscais)", acaoDoCenso: "CADASTRAR_METAS_FISCAIS_LDO",
      aviso: "O resultado primário é calculado automaticamente: receita primária menos despesa primária.",
      campos: [
        { nome: "ano", rotulo: "Exercício projetado", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "receitaTotal", rotulo: "Receita total (R$)", ...DINHEIRO },
        { nome: "receitaPrimaria", rotulo: "Receita primária (R$)", ...DINHEIRO },
        { nome: "despesaTotal", rotulo: "Despesa total (R$)", ...DINHEIRO },
        { nome: "despesaPrimaria", rotulo: "Despesa primária (R$)", ...DINHEIRO },
        { nome: "resultadoNominal", rotulo: "Resultado nominal (R$)", ...SINALADO },
        { nome: "dividaPublicaConsolidada", rotulo: "Dívida pública consolidada (R$)", ...DINHEIRO },
        { nome: "dividaConsolidadaLiquida", rotulo: "Dívida consolidada líquida (R$)", ...DINHEIRO },
        { nome: "receitaPrimariaPpp", rotulo: "Receita primária de PPP (R$)", ...DINHEIRO },
        { nome: "despesaPrimariaPpp", rotulo: "Despesa primária de PPP (R$)", ...DINHEIRO },
        { nome: "impactoSaldoPpp", rotulo: "Impacto das PPP no saldo (R$)", ...SINALADO },
      ],
    },
    {
      nome: "risco-fiscal", rotulo: "Registrar risco fiscal (Anexo de Riscos Fiscais)", acaoDoCenso: "CADASTRAR_RISCOS_FISCAIS_LDO",
      aviso: "A LRF exige que cada risco seja acompanhado da providência a ser adotada.",
      campos: [
        { nome: "codigoPassivo", rotulo: "Código do passivo contingente", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_PASSIVO },
        { nome: "descricaoPassivo", rotulo: "Passivo", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "valorPassivo", rotulo: "Valor do passivo (R$)", ...DINHEIRO },
        { nome: "descricaoProvidencia", rotulo: "Providência", tipo: "texto", obrigatorio: true, largura: 3 },
        { nome: "valorProvidencia", rotulo: "Valor da providência (R$)", ...DINHEIRO },
      ],
    },
    {
      nome: "renuncia", rotulo: "Registrar renúncia de receita", acaoDoCenso: "CADASTRAR_RENUNCIA_RECEITA_LDO",
      campos: [
        { nome: "descricao", rotulo: "Renúncia", tipo: "texto", obrigatorio: true, largura: 3 },
        { nome: "valor", rotulo: "Valor renunciado (R$)", ...DINHEIRO },
        { nome: "descricaoCompensacao", rotulo: "Compensação", tipo: "texto", obrigatorio: true, largura: 3 },
        { nome: "valorCompensacao", rotulo: "Valor da compensação (R$)", ...DINHEIRO, ajuda: "Pode ser 0,00 quando compensada pelo crescimento da base." },
      ],
    },
    {
      nome: "alienacao", rotulo: "Prever alienação de bem", acaoDoCenso: "CADASTRAR_ALIENACAO_LDO",
      campos: [
        { nome: "descricaoBem", rotulo: "Bem", tipo: "texto", obrigatorio: true, largura: 2 },
        { nome: "valorAlienacao", rotulo: "Valor previsto (R$)", ...DINHEIRO },
        { nome: "numeroLaudo", rotulo: "Laudo de avaliação", tipo: "texto", largura: 1 },
      ],
    },
    {
      nome: "aplicacao-da-alienacao", rotulo: "Declarar aplicação do produto da alienação", acaoDoCenso: "CADASTRAR_ALIENACAO_LDO",
      aviso: "LRF, art. 44: a receita de capital de alienação de bens não pode financiar despesa corrente.",
      campos: [
        { nome: "alienacaoId", rotulo: "Alienação prevista", tipo: "selecao", obrigatorio: true, largura: 2, opcoes: [] },
        { nome: "tipoAplicacao", rotulo: "Tipo de aplicação", tipo: "selecao", obrigatorio: true, largura: 1, opcoes: OPCOES_DE_APLICACAO },
        { nome: "anoAplicacao", rotulo: "Exercício da aplicação", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "descricao", rotulo: "Aplicação", tipo: "texto", obrigatorio: true, largura: 3 },
        { nome: "valor", rotulo: "Valor aplicado (R$)", ...DINHEIRO },
      ],
    },
    {
      nome: "divida-consolidada", rotulo: "Projetar dívida consolidada", acaoDoCenso: "CADASTRAR_METAS_FISCAIS_LDO",
      campos: [
        { nome: "ano", rotulo: "Exercício", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "dividaConsolidada", rotulo: "Dívida consolidada (R$)", ...DINHEIRO },
        { nome: "deducoes", rotulo: "Deduções (R$)", ...DINHEIRO },
        { nome: "receitaCorrenteLiquida", rotulo: "Receita corrente líquida (R$)", ...DINHEIRO },
        { nome: "percentualRcl", rotulo: "Relação com a RCL", tipo: "texto", obrigatorio: true, largura: 1, placeholder: "0,850000", ajuda: "Índice com seis casas decimais. O limite fixado pelo Senado é de 1,2 vez a RCL." },
      ],
    },
    {
      nome: "projecao-rpps", rotulo: "Projetar o RPPS", acaoDoCenso: "CADASTRAR_METAS_FISCAIS_LDO",
      aviso: "O resultado e o saldo podem ser negativos, indicando déficit do RPPS.",
      campos: [
        { nome: "ano", rotulo: "Exercício", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "receitasPrevidenciarias", rotulo: "Receitas previdenciárias (R$)", ...DINHEIRO },
        { nome: "despesasPrevidenciarias", rotulo: "Despesas previdenciárias (R$)", ...DINHEIRO },
        { nome: "resultadoPrevidenciario", rotulo: "Resultado previdenciário (R$)", ...SINALADO },
        { nome: "saldoFinanceiro", rotulo: "Saldo financeiro (R$)", ...SINALADO },
      ],
    },
    {
      nome: "margem-de-expansao", rotulo: "Declarar margem de expansão", acaoDoCenso: "CADASTRAR_METAS_FISCAIS_LDO",
      campos: [
        { nome: "ano", rotulo: "Exercício", ...ANO, obrigatorio: true, largura: 1 },
        { nome: "aumentoPermanenteReceita", rotulo: "Aumento permanente de receita (R$)", ...DINHEIRO },
        { nome: "reducaoPermanenteDespesa", rotulo: "Redução permanente de despesa (R$)", ...DINHEIRO },
        { nome: "novasDespesasObrigatorias", rotulo: "Novas despesas obrigatórias continuadas (R$)", ...DINHEIRO },
      ],
    },
  ],
  permissoes: { criar: "CADASTRAR_LDO" },
  abas: ["dados", "historico", "relacionados"],
  relacionados: [
    { rotulo: "Anexo de Metas Anuais (PDF)", href: "/planejamento/ldo/{id}/anexos/metas-anuais", explicacao: "LRF, art. 4º, § 1º. O resultado primário é calculado a partir das receitas e despesas primárias." },
    { rotulo: "Anexo de Riscos Fiscais (PDF)", href: "/planejamento/ldo/{id}/anexos/riscos-fiscais", explicacao: "LRF, art. 4º, § 3º. Passivos contingentes e providências." },
    { rotulo: "Renúncia de receita (PDF)", href: "/planejamento/ldo/{id}/anexos/renuncia-receita", explicacao: "LRF, art. 4º, § 2º, V." },
    { rotulo: "Alienação de bens e aplicação do produto (PDF)", href: "/planejamento/ldo/{id}/anexos/alienacao-bens", explicacao: "LRF, art. 4º, § 2º, III, e art. 44." },
    { rotulo: "Projeção atuarial do RPPS (PDF)", href: "/planejamento/ldo/{id}/anexos/projecao-rpps", explicacao: "LRF, art. 4º, § 2º, IV, a." },
    { rotulo: "Dívida consolidada (PDF)", href: "/planejamento/ldo/{id}/anexos/divida-consolidada", explicacao: "Estoque projetado e relação com a RCL." },
    { rotulo: "Margem de expansão (PDF)", href: "/planejamento/ldo/{id}/anexos/margem-expansao", explicacao: "LRF, art. 4º, § 2º, V: despesas obrigatórias de caráter continuado." },
    { rotulo: "Prioridades e metas (PDF)", href: "/planejamento/ldo/{id}/anexos/prioridades", explicacao: "As prioridades que entram no próximo orçamento." },
  ],
});
