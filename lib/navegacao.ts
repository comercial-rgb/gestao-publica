/**
 * O MAPA DE ÁREAS — a navegação do sistema, em RÓTULOS DO USUÁRIO, não códigos de módulo.
 *
 * ⚠️ O servidor público não sabe o que é "M05"; ele sabe o que é "Despesa". A sidebar agrupa por
 * ÁREA FUNCIONAL (a linguagem do ente), e o mapa módulo→área fica escondido aqui. É a mesma
 * disciplina do resto do sistema: a mensagem é para quem lê, não para quem escreveu.
 *
 * Esta é a ÚNICA fonte da estrutura de navegação — a sidebar e o breadcrumb derivam dela.
 */

/**
 * Os slugs das áreas, como UNIÃO e não como `string`.
 *
 * ⚠️ ELE EXISTE PARA QUE `lib/portas/navegacao-permissoes.ts` SEJA CONFERIDO NAS DUAS PONTAS: com
 * `string`, um erro de digitação em "financeiro" produziria uma área que nunca aparece para
 * ninguém, e nada reclamaria. Com a união, o compilador recusa.
 */
export type SlugDeArea =
  | "planejamento"
  | "receita"
  | "despesa"
  | "financeiro"
  | "patrimonio"
  | "licitacoes"
  | "contabilidade"
  | "relatorios"
  | "transparencia"
  | "protocolo"
  | "comunicacao"
  | "cadastros"
  | "transferencias"
  | "divida"
  | "controle-interno"
  | "administracao"
  | "integracoes"
  | "suporte"
  | "pessoal"
  | "folha"
  | "portal-do-servidor"
  | "meus-servicos"
  | "licenciamento";

export interface AreaNav {
  /** O segmento da rota (`/planejamento`). */
  readonly slug: SlugDeArea;
  readonly rotulo: string;
  /** Uma linha do que a área faz — vira o subtítulo da página placeholder. */
  readonly descricao: string;
  /**
   * ⚠️ A ROTA, QUANDO ELA NÃO É `/<slug>` — E POR QUE ISSO PRECISOU EXISTIR (V9 N1).
   *
   * `/transparencia` é do CIDADÃO. É o endereço que um município divulga, que um órgão de
   * controle abre sem conta e que o portal do ente linka — e ele estava ocupado pela LANDING
   * INTERNA da área, atrás de sessão, enquanto as páginas públicas de verdade
   * (`/transparencia/contratos`, `/transparencia/demonstrativos`) viviam soltas no mesmo
   * prefixo, sob outra árvore de layout. Duas donas do mesmo espaço de endereços.
   *
   * ⚠️ E A SAÍDA NÃO PODIA SER TROCAR O `slug`. Ele não é só a URL: é a chave que
   * `lib/portas/navegacao-permissoes.ts` usa para dizer quais áreas cada perfil enxerga.
   * Renomeá-lo mudaria, em silêncio, quem vê o quê — uma alteração de autorização disfarçada
   * de ajuste de rota.
   *
   * Então o slug (a identidade e a permissão) e a rota (o endereço) se separaram. Só quem
   * precisa declara `rota`; o resto continua em `/<slug>`.
   */
  readonly rota?: string;
}

/** O endereço de uma área — `rota` quando declarada, `/<slug>` quando não. */
export function rotaDaArea(a: AreaNav): string {
  return a.rota ?? `/${a.slug}`;
}

export const AREAS: readonly AreaNav[] = [
  { slug: "planejamento", rotulo: "Planejamento", descricao: "PPA, LDO, LOA, fichas orçamentárias, créditos adicionais e programação financeira." },
  { slug: "receita", rotulo: "Receita", descricao: "Previsão, arrecadação, reconhecimento da receita e cadastro tributário." },
  { slug: "despesa", rotulo: "Despesa", descricao: "Empenho, liquidação, pagamento e restos a pagar." },
  { slug: "financeiro", rotulo: "Financeiro", descricao: "Tesouraria, movimentação bancária, conciliação e recolhimento de retenções." },
  { slug: "patrimonio", rotulo: "Patrimônio", descricao: "Bens patrimoniais, almoxarifado, depreciação e termos de responsabilidade." },
  { slug: "licitacoes", rotulo: "Licitações e Contratos", descricao: "Processos licitatórios, compras, contratos, aditivos e obras." },
  { slug: "contabilidade", rotulo: "Contabilidade", descricao: "Plano de contas, lançamentos e parametrização contábil do ente." },
  { slug: "relatorios", rotulo: "Relatórios", descricao: "Livros contábeis, demonstrações, RREO, RGF e relatórios gerenciais." },
  {
    slug: "transparencia",
    rotulo: "Transparência",
    descricao: "Dados abertos do portal e arquivos para a STN e a Receita Federal.",
    // A landing INTERNA da área. O endereço público `/transparencia` é o portal do cidadão.
    rota: "/administracao/transparencia",
  },
  { slug: "protocolo", rotulo: "Protocolo", descricao: "Processos digitais, atendimento ao cidadão, ouvidoria e acesso à informação." },
  { slug: "comunicacao", rotulo: "Comunicação interna", descricao: "Memorandos, ofícios e circulares, com confirmação de leitura e assinatura." },
  { slug: "cadastros", rotulo: "Cadastros", descricao: "Cadastro único de pessoas físicas e jurídicas, credores e representantes." },
  { slug: "transferencias", rotulo: "Transferências", descricao: "Convênios de repasse e consórcios públicos." },
  { slug: "divida", rotulo: "Dívida e precatórios", descricao: "Dívida fundada, dívida ativa e precatórios judiciais." },
  { slug: "controle-interno", rotulo: "Controle interno", descricao: "Auditorias internas, achados, providências e relatório do controle interno." },
  { slug: "administracao", rotulo: "Administração", descricao: "Usuários, perfis de acesso, auditoria de operações e configurações do ente." },
  { slug: "integracoes", rotulo: "Integrações", descricao: "Integrações com o TCE-PB (SAGRES), o Banco do Brasil e demais serviços externos." },
  { slug: "suporte", rotulo: "Suporte", descricao: "Canais de atendimento e prazos de resposta." },
  { slug: "pessoal", rotulo: "Pessoal", descricao: "Servidores, vínculos, cargos, funções e lotações." },
  { slug: "folha", rotulo: "Folha", descricao: "Folha de pagamento: rubricas, tabelas, cálculo, conferência e fechamento." },
  { slug: "portal-do-servidor", rotulo: "Portal do Servidor", descricao: "Seus vínculos, dependentes e contracheques." },
  { slug: "meus-servicos", rotulo: "Meus serviços", descricao: "Acompanhamento das solicitações feitas pela carta de serviços." },
  // ⚠️ V10 T1 — A ÁREA DO FORNECEDOR. Ela aparece no menu de quem tem `CONSULTAR_LICENCIAMENTO`,
  // e ninguém do município tem: a ação é reservada (`ACOES_DO_FORNECEDOR`, M16). Está em AREAS
  // porque o menu deriva daqui — uma tela fora do mapa seria uma rota que a navegação não conhece.
  { slug: "licenciamento", rotulo: "Contrato e módulos", descricao: "Módulos contratados, vigências e histórico do contrato desta implantação." },
];

/** Um relatório navegável (rota + rótulo + uma linha). Fonte ÚNICA da landing e do submenu. */
export interface RelatorioNav {
  readonly href: string;
  readonly numero: string;
  readonly rotulo: string;
  readonly descricao: string;
}

/**
 * Os RREO já implementados — a fonte única da landing (`/relatorios`) e do submenu da sidebar.
 * Adicionar um anexo é acrescentar UMA linha aqui; a navegação e a landing acompanham.
 */
export const RELATORIOS_RREO: readonly RelatorioNav[] = [
  { href: "/relatorios/rreo/anexo1", numero: "Anexo 1", rotulo: "Balanço Orçamentário", descricao: "Receita e despesa do exercício, por natureza (LRF art. 52)." },
  { href: "/relatorios/rreo/anexo2", numero: "Anexo 2", rotulo: "Despesa por Função/Subfunção", descricao: "Execução da despesa por classificação funcional (LRF art. 52, II)." },
  { href: "/relatorios/rreo/anexo3", numero: "Anexo 3", rotulo: "Receita Corrente Líquida", descricao: "RCL dos últimos 12 meses — base dos limites (LRF art. 53, I)." },
  { href: "/relatorios/rreo/anexo4", numero: "Anexo 4", rotulo: "Receitas e Despesas Previdenciárias", descricao: "Regime próprio de previdência: fundos, administração e benefícios do Tesouro (LRF art. 53, II)." },
  { href: "/relatorios/rreo/anexo6", numero: "Anexo 6", rotulo: "Resultado Primário e Nominal", descricao: "Resultado primário e nominal do período (LRF art. 53, III)." },
  { href: "/relatorios/rreo/anexo7", numero: "Anexo 7", rotulo: "Restos a Pagar por Poder e Órgão", descricao: "RP processados e não processados (LRF art. 53, V)." },
  { href: "/relatorios/rreo/anexo8", numero: "Anexo 8", rotulo: "Educação (MDE)", descricao: "Mínimo de 25% e FUNDEB (CF art. 212/212-A)." },
  { href: "/relatorios/rreo/anexo9", numero: "Anexo 9", rotulo: "Operações de Crédito e Despesas de Capital", descricao: "Regra de ouro: operações de crédito contra a despesa de capital (CF art. 167, III; LRF art. 53 §1º I)." },
  { href: "/relatorios/rreo/anexo10", numero: "Anexo 10", rotulo: "Projeção Atuarial do RPPS", descricao: "Projeção de 75 anos do regime próprio, da avaliação atuarial (LRF art. 53 §1º II); só no 6º bimestre." },
  { href: "/relatorios/rreo/anexo11", numero: "Anexo 11", rotulo: "Alienação de Ativos", descricao: "Receitas de alienação e aplicação dos recursos (LRF art. 53 §1º III)." },
  { href: "/relatorios/rreo/anexo12", numero: "Anexo 12", rotulo: "Saúde (ASPS)", descricao: "Aplicação mínima de 15% em saúde (LC 141/2012)." },
  { href: "/relatorios/rreo/anexo13", numero: "Anexo 13", rotulo: "Parcerias Público-Privadas", descricao: "Contratos de PPP e o teto de 5% da RCL (Lei 11.079/2004)." },
  { href: "/relatorios/rreo/anexo14", numero: "Anexo 14", rotulo: "Demonstrativo Simplificado", descricao: "Resumo do RREO: balanço, resultados, restos a pagar, mínimos constitucionais e RCL (LRF art. 48)." },
];

/** Os RGF já implementados — fonte única da landing e do submenu. */
export const RELATORIOS_RGF: readonly RelatorioNav[] = [
  { href: "/relatorios/rgf/anexo1", numero: "Anexo 1", rotulo: "Despesa com Pessoal", descricao: "Limite de pessoal por Poder (LRF art. 55, I, 'a'; art. 20)." },
  { href: "/relatorios/rgf/anexo2", numero: "Anexo 2", rotulo: "Dívida Consolidada Líquida", descricao: "DCL sobre a RCL ajustada — limite de 120% do Senado e alerta de 108% (LRF art. 55, I, 'b')." },
  { href: "/relatorios/rgf/anexo3", numero: "Anexo 3", rotulo: "Garantias e Contragarantias", descricao: "Garantias concedidas sobre a RCL ajustada — limite de 22% do Senado e alerta de 19,8% (LRF art. 55, I, 'c')." },
  { href: "/relatorios/rgf/anexo4", numero: "Anexo 4", rotulo: "Operações de Crédito", descricao: "Operações de crédito realizadas — limite de 16% da RCL e alerta de 14,4% (LRF art. 55, I, 'd')." },
  { href: "/relatorios/rgf/anexo5", numero: "Anexo 5", rotulo: "Disponibilidade de Caixa e RP", descricao: "Disponibilidade de caixa por fonte e inscrição de restos a pagar (LRF art. 55, III, a)." },
  { href: "/relatorios/rgf/anexo6", numero: "Anexo 6", rotulo: "Demonstrativo Simplificado", descricao: "Resumo do RGF: pessoal, dívida, garantias e operações de crédito (LRF art. 48)." },
];

/**
 * A EXECUÇÃO DA DESPESA — fonte única da landing de /despesa e do submenu.
 *
 * ⚠️ A FILA DE PAGAMENTOS mora aqui, e não em "Financeiro", embora a ordem cronológica seja
 * assunto de tesouraria: quem entra na fila é a LIQUIDAÇÃO, e o usuário chega nela vindo do
 * empenho que emitiu. Pô-la noutra área obrigaria a atravessar o menu no meio do próprio
 * fluxo de trabalho.
 */
export const EXECUCAO_DESPESA: readonly RelatorioNav[] = [
  { href: "/despesa/solicitacoes-de-empenho", numero: "Solicitações de empenho", rotulo: "Solicitações de Empenho", descricao: "Solicitação da despesa pelo setor e autorização prévia à emissão do empenho." },
  { href: "/despesa/campanhas-publicitarias", numero: "Campanhas", rotulo: "Campanhas Publicitárias", descricao: "Campanhas publicitárias do ente, com período e contrato de publicidade, para o vínculo da nota de empenho." },
  { href: "/despesa/empenhos", numero: "Empenhos", rotulo: "Empenhos", descricao: "Emissão e consulta de empenhos, com saldos a liquidar e a pagar." },
  { href: "/despesa/liquidacoes", numero: "Liquidações", rotulo: "Liquidações", descricao: "Liquidação da despesa com nota fiscal, atesto e comprovantes." },
  { href: "/despesa/ordens", numero: "Ordens de pagamento", rotulo: "Ordens de Pagamento", descricao: "Preparação, autorização e registro das ordens de pagamento." },
  { href: "/despesa/pagamentos", numero: "Fila de pagamentos", rotulo: "Fila de Pagamentos", descricao: "Fila de pagamentos por fonte e categoria (Lei 14.133/2021, art. 141)." },
  { href: "/despesa/ordem-cronologica", numero: "Ordem cronológica", rotulo: "Ordem Cronológica", descricao: "Posição de cada credor na ordem cronológica de pagamentos, por fonte (Lei 14.133/2021, art. 141)." },
  // ⚠️ RESTOS A PAGAR MORA NA DESPESA, e não em "Relatórios": a inscrição é despesa de
  // exercício anterior que continua a ser executada — liquidada, paga, cancelada. O Anexo 7 do
  // RREO LÊ essa posição, mas ler um demonstrativo fiscal não é operar a obrigação.
  { href: "/despesa/restos-a-pagar", numero: "Restos a pagar", rotulo: "Restos a Pagar", descricao: "Execução dos restos a pagar processados e não processados: liquidação, pagamento e cancelamento." },
  // ⚠️ A ASSINATURA MORA NA DESPESA, e não em "Documentos": a pergunta é "a nota de
  // empenho está assinada?", e quem a faz é quem executa a despesa. A FILA, essa sim, é a
  // do ENT02 — reusada, não recriada.
  { href: "/despesa/assinaturas", numero: "Assinaturas", rotulo: "Assinatura dos Documentos", descricao: "Assinatura eletrônica de notas de empenho, liquidações e ordens de pagamento." },
];

/**
 * O PLANEJAMENTO — fonte única da landing de /planejamento e do submenu.
 *
 * ⚠️ QDD e CMD/MBA são LEITURA da LOA já registrada; créditos e reprevisão ESCREVEM. Ficam no mesmo
 * grupo porque o usuário do planejamento os percorre na mesma sessão de trabalho.
 */
/**
 * LICITAÇÕES E CONTRATOS — fonte única do submenu (V4 §8, M11). O processo e o contrato ganharam
 * tela; a obra já tinha. O empenho vinculado ao contrato fica na Despesa.
 */
export const LICITACOES: readonly RelatorioNav[] = [
  { href: "/licitacoes/processos", numero: "Processos", rotulo: "Processos licitatórios", descricao: "Processos licitatórios: modalidade, objeto, homologação e reserva de dotação." },
  { href: "/licitacoes/fiscalizacao", numero: "Fiscalização", rotulo: "Fiscalização de contratos", descricao: "Contratos sob sua gestão ou fiscalização e o registro das ocorrências." },
  { href: "/licitacoes/ordens-de-servico", numero: "OS", rotulo: "Ordens de serviço", descricao: "As ordens de serviço dos contratos que você acompanha: situação, emissão, empenho e o caminho até a medição e a liquidação." },
  { href: "/licitacoes/contratos", numero: "Contratos", rotulo: "Contratos e aditivos", descricao: "Contratos, aditivos, vigência, saldo e empenhos vinculados." },
  { href: "/licitacoes/solicitacoes", numero: "Solicitações", rotulo: "Solicitações de compra", descricao: "Solicitações de compra, com itens, autorização e anulação." },
  { href: "/licitacoes/pesquisas-de-precos", numero: "Preços", rotulo: "Pesquisas de preços", descricao: "Pesquisa de preços por item e fornecedor, com média, mínimo e máximo." },
  { href: "/licitacoes/ordens-de-compra", numero: "Ordens", rotulo: "Ordens de compra", descricao: "Ordens de compra ordinárias, globais e estimativas, com recebimento por item." },
  { href: "/licitacoes/documentos-fiscais", numero: "Notas", rotulo: "Documentos fiscais recebidos", descricao: "Notas fiscais, recibos e CT-e recebidos do fornecedor, com conferência dos itens." },
  { href: "/licitacoes/obras", numero: "Obras", rotulo: "Obras e medições", descricao: "Cadastro de obras e medições que autorizam a liquidação." },
  // V36: os contratos de parceria público-privada (Lei 11.079), com situação, parcelas, documentos e empenhos.
  { href: "/licitacoes/ppp", numero: "PPP", rotulo: "Parcerias público-privadas", descricao: "Contratos de parceria público-privada: situação, parcelas por exercício, documentos e empenhos." },
];

export const PLANEJAMENTO: readonly RelatorioNav[] = [
  // V4 §8 (M02b): as peças que vêm ANTES da LOA.
  { href: "/planejamento/ppa", numero: "PPA", rotulo: "Plano Plurianual", descricao: "Plano Plurianual: programas, indicadores, ações e metas do quadriênio (CF art. 165, § 1º)." },
  { href: "/planejamento/ppa/transferencias", numero: "Transferências", rotulo: "Transferências previstas no PPA", descricao: "O que o ente prevê transferir a cada entidade em cada ano do quadriênio." },
  { href: "/planejamento/ldo", numero: "LDO", rotulo: "Lei de Diretrizes Orçamentárias", descricao: "Lei de Diretrizes Orçamentárias: prioridades e anexos de metas e riscos fiscais." },
  { href: "/planejamento/ppa/codigos-reduzidos", numero: "Reduzidos", rotulo: "Códigos reduzidos da despesa", descricao: "O número curto de cada combinação de unidade, função, subfunção, programa e ação do PPA." },
  { href: "/planejamento/ppa/estrutura", numero: "Estrutura", rotulo: "Estrutura temática do PPA", descricao: "Eixos, áreas temáticas, públicos-alvo e macroações do PPA." },
  // V36: a participação popular na elaboração das peças (LRF art. 48).
  { href: "/planejamento/audiencias", numero: "Audiências", rotulo: "Audiências públicas", descricao: "Audiências públicas do PPA, da LDO e da LOA, com as solicitações da comunidade e os documentos." },
  // V18/C13: a lei que altera a peça já aprovada. O original fica; o vigente é derivado.
  { href: "/planejamento/alteracoes", numero: "Alterações", rotulo: "Alterações do PPA e da LDO", descricao: "Alterações do PPA e da LDO por lei ou decreto, com o valor original e o vigente." },
  { href: "/planejamento/unidades-orcamentarias", numero: "Unidades", rotulo: "Unidades orçamentárias", descricao: "Natureza jurídica, secretário responsável e ato de nomeação de cada unidade orçamentária, com histórico." },
  { href: "/planejamento/programas-e-acoes", numero: "Programas e ações", rotulo: "Programas e ações", descricao: "Objetivo, objetivo da Agenda 2030, meta e unidade de medida dos programas e ações do orçamento, com histórico." },
  { href: "/planejamento/fontes-de-recurso", numero: "Fontes", rotulo: "Fontes de recurso", descricao: "Fontes de recurso e códigos de acompanhamento da tabela oficial da STN, com a natureza de cada fonte." },
  { href: "/planejamento/receita-prevista", numero: "Receita prevista", rotulo: "Receita prevista", descricao: "As linhas da previsão da receita da LOA, com o tipo de cada dedução e o documento de origem." },
  { href: "/planejamento/fichas", numero: "Fichas", rotulo: "Fichas orçamentárias", descricao: "Fichas orçamentárias da LOA pela classificação completa da despesa." },
  { href: "/planejamento/loa", numero: "LOA", rotulo: "Lei Orçamentária Anual", descricao: "Receita prevista, despesa fixada, equilíbrio e anexos da Lei 4.320/64 do exercício." },
  { href: "/planejamento/loa/vinculo-ppa", numero: "PPA e LOA", rotulo: "Ações do PPA na LOA", descricao: "As fichas da LOA que executam cada ação do Plano Plurianual, e as fichas sem ação correspondente no plano." },
  { href: "/planejamento/leis-orcamentarias", numero: "Leis", rotulo: "Projeto e Lei da LOA", descricao: "O projeto enviado ao Legislativo, a lei que o aprovou e os documentos anexos, por exercício." },
  // V29: o orçamento do exercício seguinte, importado de um exercício executado e alterado antes de virar fichas.
  { href: "/planejamento/proposta-orcamentaria", numero: "Proposta", rotulo: "Proposta Orçamentária", descricao: "O orçamento do exercício seguinte a partir das receitas e fichas de um exercício executado, com reajuste e alterações, até gerar as fichas." },
  { href: "/planejamento/emendas", numero: "Emendas", rotulo: "Emendas ao Orçamento", descricao: "Emendas da Câmara ao projeto da lei orçamentária, bloqueio de dotações para emenda e sanção total ou parcial." },
  { href: "/planejamento/emendas-do-plano", numero: "Emendas ao PPA e à LDO", rotulo: "Emendas ao PPA e à LDO", descricao: "Emendas da Câmara ao plano plurianual e às diretrizes orçamentárias, bloqueio de linhas e sanção total ou parcial." },
  { href: "/planejamento/qdd", numero: "QDD", rotulo: "Quadro de Detalhamento da Despesa", descricao: "Quadro de Detalhamento da Despesa: dotação inicial, créditos e dotação atualizada." },
  { href: "/planejamento/cmd-mba", numero: "CMD/MBA", rotulo: "Programação Financeira (CMD/MBA)", descricao: "Cronograma mensal de desembolso e metas bimestrais de arrecadação (LRF arts. 8º e 13)." },
  { href: "/planejamento/creditos-adicionais", numero: "Créditos adicionais", rotulo: "Créditos Adicionais", descricao: "Créditos suplementares, especiais e extraordinários, com leis, decretos e limite legal." },
  { href: "/planejamento/previas", numero: "Prévias", rotulo: "Prévias de alteração orçamentária", descricao: "O crédito adicional antes do decreto: movimentos em lotes, bloqueio das anulações, aprovação, minuta e efetivação." },
  { href: "/planejamento/creditos-adicionais/normas-no-tribunal", numero: "Leis no Tribunal", rotulo: "Leis no Tribunal de Contas", descricao: "O protocolo de cada lei orçamentária no banco de legislação do Tribunal, e as leis publicadas sem ele." },
  { href: "/planejamento/realocacoes", numero: "Realocações", rotulo: "Remanejamento, Transposição e Transferência", descricao: "Movimentação de dotação entre programações autorizada por lei específica, com as fichas cedentes e as recebedoras." },
  { href: "/planejamento/recursos-novos", numero: "Recurso novo", rotulo: "Disponibilidade de Recurso Novo", descricao: "Superávit financeiro, excesso de arrecadação e operações de crédito que lastreiam créditos adicionais (Lei 4.320, art. 43)." },
  { href: "/planejamento/reprevisao", numero: "Reprevisão", rotulo: "Reprevisão da Receita", descricao: "Revisão da previsão de receita ao longo do exercício (LRF art. 12)." },
];

/**
 * O FINANCEIRO — tesouraria: o dinheiro de terceiros no caixa e o confronto banco × razão.
 *
 * ⚠️ A CONCILIAÇÃO mora aqui, e não em "Integrações", embora o extrato chegue pelo canal do Banco
 * do Brasil: a Central responde "o canal está de pé, e em que modo?"; a conciliação responde "o
 * banco e o razão contam a mesma história?". A segunda é pergunta de tesoureiro fechando o mês.
 * A Central APONTA para cá (o card do BB tem ação), e a tela daqui aponta de volta para a Central
 * quando falta extrato — cada lado no seu papel, sem o anel de links que existia antes.
 */
export const FINANCEIRO: readonly RelatorioNav[] = [
  { href: "/financeiro/consignacoes", numero: "Consignações", rotulo: "Consignações", descricao: "Contas contábeis das consignações e retenções na fonte, por tipo." },
  { href: "/financeiro/retencoes-proprias", numero: "Retenções do município", rotulo: "Retenções do próprio município", descricao: "IR e ISS retidos nos pagamentos, que entram como receita do município." },
  { href: "/financeiro/transferencias-entre-ugs", numero: "Transferências entre unidades", rotulo: "Transferências entre unidades gestoras", descricao: "Duodécimo à Câmara, aportes e devoluções entre as unidades do município, com estorno e conciliação." },
  { href: "/financeiro/extraorcamentario", numero: "Extraorçamentário", rotulo: "Extraorçamentário", descricao: "Retenções, consignações e demais ingressos e dispêndios extraorçamentários." },
  { href: "/financeiro/extraorcamentario/recolher", numero: "Recolher consignações", rotulo: "Recolher consignações", descricao: "Recolhimento das retenções do exercício e de exercícios anteriores." },
  { href: "/financeiro/extraorcamentario/sem-titular", numero: "Movimentos sem titular", rotulo: "Movimentos sem titular", descricao: "Ingressos avulsos e recolhimentos em conta sem titular declarado, para atribuir a entidade." },
  { href: "/financeiro/conciliacao", numero: "Conciliação", rotulo: "Conciliação Bancária", descricao: "Conciliação entre o extrato bancário e os lançamentos contábeis." },
  // ⚠️ A CONCILIAÇÃO POR PERÍODO é entrada PRÓPRIA, e não uma aba da de cima. São duas
  // perguntas diferentes: aquela responde "como está agora?"; esta responde "qual foi a
  // conciliação de junho, quem a encerrou, e o que ela deixou para julho?". Foi a
  // distinção que o ADR de 2026-09-10 registrou — e esconder a segunda dentro da primeira
  // faria o fechamento parecer um detalhe de uma tela de consulta.
  { href: "/financeiro/conciliacao/periodo", numero: "Períodos", rotulo: "Conciliação por período", descricao: "Abertura, justificativa de pendências e encerramento da conciliação mensal." },
  { href: "/financeiro/conciliacao/extratos", numero: "Extratos", rotulo: "Extratos importados", descricao: "Os extratos bancários como o banco os mandou, com a situação de cada lançamento e a impressão." },
  { href: "/financeiro/movimentacao", numero: "Movimentação", rotulo: "Movimentação Bancária", descricao: "Depósitos, saques, aplicações, resgates, rendimentos e tarifas bancárias." },
  { href: "/financeiro/cheques", numero: "Cheques", rotulo: "Cheques", descricao: "Cheques emitidos em pagamentos e cheques avulsos numa consulta só, com o registro e o cancelamento do avulso." },
  { href: "/financeiro/lotes", numero: "Lotes", rotulo: "Lotes e Borderô", descricao: "Agrupamento de ordens de pagamento, borderô e baixa pelo retorno bancário." },
];

/**
 * A CONTABILIDADE — o plano de contas e o razão por trás dos livros.
 *
 * ⚠️ Área PRÓPRIA, e não um item de "Relatórios": os livros são a SAÍDA formatada; estas duas telas
 * são a BASE (o plano que classifica e os lançamentos que registram). Quem audita chega por aqui.
 */
export const CONTABILIDADE: readonly RelatorioNav[] = [
  { href: "/contabilidade/ordenadores", numero: "Ordenadores", rotulo: "Ordenadores e responsável pelo sistema", descricao: "Ordenadores de despesa designados por ato e vigência, e o responsável técnico pelo sistema." },
  { href: "/contabilidade/unidades-gestoras", numero: "Unidades gestoras", rotulo: "Unidades gestoras", descricao: "As unidades do município no cadastro do Tribunal de Contas, com código e vigência." },
  { href: "/contabilidade/roteiros-orcamentarios", numero: "Roteiro orçamentário", rotulo: "Roteiro orçamentário", descricao: "Contas contábeis de cada movimento orçamentário: dotação, créditos adicionais, anulação e reserva." },
  { href: "/contabilidade/roteiros-de-restos-a-pagar", numero: "Contas dos restos a pagar", rotulo: "Contas dos restos a pagar", descricao: "Contas contábeis de liquidação, pagamento e cancelamento de restos a pagar." },
  // V11 V9.3 — irmã do roteiro orçamentário, e pela mesma razão: o plano parte 7.2.1.1 por
  // natureza do recurso, e quem diz de que natureza é cada fonte do município é o ente. Sem esta
  // tela a arrecadação era impossível em instalação nova.
  { href: "/contabilidade/natureza-das-fontes", numero: "Natureza das fontes", rotulo: "Natureza das fontes", descricao: "Natureza de cada fonte de recurso e a conta de controle da disponibilidade correspondente." },
  { href: "/contabilidade/contas-da-liquidacao", numero: "Contas da liquidação", rotulo: "Contas da liquidação por elemento", descricao: "Em que cada elemento de despesa se transforma ao ser liquidado: despesa, bem do imobilizado, intangível ou baixa de obrigação." },
  { href: "/contabilidade/contas-da-receita", numero: "Contas da receita", rotulo: "Contas da receita por natureza", descricao: "Em que conta da variação patrimonial cada natureza de receita arrecadada entra." },
  { href: "/contabilidade/plano-de-contas", numero: "Plano de contas", rotulo: "Plano de Contas PCASP", descricao: "Plano de Contas Aplicado ao Setor Público, com natureza do saldo e classificação." },
  { href: "/contabilidade/lancamentos", numero: "Lançamentos", rotulo: "Lançamentos Contábeis", descricao: "Lançamentos em partidas dobradas, com número de controle, histórico e documento de origem." },
  // V11 V3.1 — o número que autoriza crédito adicional por superávit existia só dentro da recusa
  // do guard; aqui ele pode ser perguntado ANTES de o decreto ser escrito.
  { href: "/contabilidade/exportacoes-federais", numero: "Arquivos federais", rotulo: "Matriz de Saldos Contábeis (MSC) e MANAD", descricao: "Matriz de Saldos Contábeis (SICONFI) e MANAD gerados a partir dos lançamentos, para download e conferência." },
  { href: "/contabilidade/exportacoes-federais/responsaveis", numero: "Responsáveis técnicos", rotulo: "Responsáveis técnicos", descricao: "Contabilista e empresa responsáveis pela escrituração informados nos arquivos da Receita Federal." },
  { href: "/contabilidade/exportacoes-federais/classificacao", numero: "Classificação MANAD", rotulo: "Classificação para o arquivo da Receita", descricao: "Tipo das unidades, vínculo das ações ao RPPS, hierarquia das naturezas e forma de escrituração exigidos pelo MANAD." },
  { href: "/contabilidade/superavit", numero: "Superávit", rotulo: "Superávit financeiro por fonte", descricao: "Superávit financeiro apurado, utilizado e disponível, por fonte de recurso." },
  // V19/C05 — o custo por centro fica na CONTABILIDADE, e não em relatórios gerenciais: a
  // apropriação referencia a liquidação e NÃO lança no razão, o que é uma decisão contábil que
  // precisa ficar perto de quem a entende. Quem audita chega por aqui.
  { href: "/contabilidade/custos", numero: "Custo por centro", rotulo: "Custo por centro", descricao: "Apuração de custos por centro de custo, com a composição de cada valor." },
  // V20 — a virada das classes 5 e 6, que a apuracao do resultado NAO faz. Fica na contabilidade
  // porque a decisao ENCERRA/TRANSFERE e contabil, e porque quem audita a virada chega por aqui.
  { href: "/contabilidade/virada-dos-controles", numero: "Virada dos controles", rotulo: "Virada das contas de controle", descricao: "Encerramento do exercício: encerramento ou transferência das contas de controle orçamentário para o exercício seguinte." },
];

/** Os relatórios GERENCIAIS — consulta livre com export aberto (TR 7.48). */
export const RELATORIOS_GERENCIAIS: readonly RelatorioNav[] = [
  { href: "/relatorios/gerenciais", numero: "Gerenciais", rotulo: "Relatórios Gerenciais", descricao: "Consulta de empenhos por credor e fonte, com exportação em PDF e CSV." },
  { href: "/relatorios/pagamentos", numero: "Pagamentos", rotulo: "Pagamentos Efetuados", descricao: "Pagamentos do período, do exercício e de restos a pagar, com retido e líquido, filtros e agrupamento." },
  { href: "/relatorios/movimento-diario", numero: "Diário", rotulo: "Movimento Diário", descricao: "Receita arrecadada e despesa paga num dia, por natureza, fonte e credor, em PDF." },
  { href: "/relatorios/receita-mensal", numero: "Receita", rotulo: "Receita Mês a Mês", descricao: "Receita arrecadada por fonte, mês a mês, nos três últimos exercícios, com planilha." },
  { href: "/relatorios/credor", numero: "Credor", rotulo: "Ficha do Credor", descricao: "Numa página, os empenhos, o que está a liquidar e a pagar e os pagamentos de um credor." },
];

/** A EXECUÇÃO DA RECEITA — fonte única da landing de /receita e do submenu. */
export const EXECUCAO_RECEITA: readonly RelatorioNav[] = [
  { href: "/receita/arrecadacoes", numero: "Arrecadação", rotulo: "Arrecadação", descricao: "Guias de arrecadação e receita realizada no exercício." },
  { href: "/receita/deducoes", numero: "Deduções", rotulo: "Deduções da receita", descricao: "Retenção do FUNDEB na origem, registrada como dedução da receita arrecadada, com estorno." },
  // V7 B1 — a primeira unidade tributária: cadastrar, parametrizar e SIMULAR (sem lançar nem constituir dívida).
  { href: "/receita/naturezas", numero: "Naturezas", rotulo: "Naturezas de receita", descricao: "Ementário da receita: os códigos em que a arrecadação é classificada." },
  { href: "/receita/naturezas/fontes", numero: "Fontes por natureza", rotulo: "Fontes por natureza da receita", descricao: "Em que fontes a receita de cada natureza se reparte, com percentual, para ratear a previsão." },
  { href: "/receita/imoveis", numero: "Imóveis", rotulo: "Cadastro imobiliário", descricao: "Cadastro imobiliário, proprietários e simulação do imposto." },
  { href: "/receita/parametros-tributarios", numero: "Parâmetros", rotulo: "Parâmetros do tributo", descricao: "Fórmulas, alíquotas e valores dos tributos municipais por exercício." },
];

/** As páginas de ADMINISTRAÇÃO — fonte única da landing e do submenu. */
export const ADMINISTRACAO: readonly RelatorioNav[] = [
  { href: "/administracao/usuarios", numero: "Usuários", rotulo: "Usuários", descricao: "Cadastro de usuários, situação e perfis de acesso." },
  { href: "/administracao/perfis", numero: "Perfis", rotulo: "Perfis e Permissões", descricao: "Perfis de acesso e as permissões de cada um." },
  { href: "/administracao/auditoria", numero: "Auditoria", rotulo: "Auditoria", descricao: "Registro das operações realizadas no sistema." },
  { href: "/administracao/senha", numero: "Senha", rotulo: "Trocar Senha", descricao: "Alteração da própria senha." },
  { href: "/administracao/apresentacao", numero: "Apresentação", rotulo: "Apresentação do ente", descricao: "Nome, brasão, contatos, tema e canais de atendimento do ente." },
  { href: "/administracao/sistema", numero: "Sistema", rotulo: "Sobre o sistema", descricao: "Versão, ambiente e atualizações instaladas." },
];

/**
 * PORTAL DO SERVIDOR (V6 P2.4) — fonte única da landing e do submenu.
 *
 * ⚠️ UMA ENTRADA SÓ, e é decisão: tudo o que o servidor vê de si mesmo cabe numa página (ficha,
 * dependentes, contracheques). Um submenu com três itens que levam a três recortes do mesmo dado
 * seria menu para parecer sistema.
 */
export const PORTAL_DO_SERVIDOR: readonly RelatorioNav[] = [
  { href: "/portal-do-servidor", numero: "Minha ficha", rotulo: "Minha ficha e meus contracheques", descricao: "Seus vínculos, cargo, lotação, dependentes e contracheques." },
];

/**
 * MEUS SERVIÇOS (V6.2 P3) — o acompanhamento do requerente. A carta em si é pública (`/servicos`),
 * fora da área autenticada; aqui mora só o que é da pessoa da sessão ou de quem ela representa hoje.
 */
export const MEUS_SERVICOS: readonly RelatorioNav[] = [
  { href: "/meus-servicos", numero: "Solicitações", rotulo: "Minhas solicitações", descricao: "Solicitações feitas por você ou pela empresa que representa, com situação e decisão." },
  { href: "/servicos", numero: "Carta", rotulo: "Carta de serviços", descricao: "Serviços oferecidos pelo ente, com requisitos, documentos e prazos." },
];

/** FOLHA (M33) — fonte única da landing e do submenu. */
export const FOLHA: readonly RelatorioNav[] = [
  { href: "/folha/folhas", numero: "Folhas", rotulo: "Folhas de pagamento", descricao: "Folha de cada competência: cálculo por servidor, conferência e fechamento." },
  { href: "/folha/agrupamento-no-tribunal", numero: "Agrupamento no Tribunal", rotulo: "Agrupamento da folha no Tribunal", descricao: "O código da remessa de pessoal em cada liquidação da folha, um para um." },
  { href: "/folha/rubricas", numero: "Rubricas", rotulo: "Rubricas", descricao: "Proventos e descontos, com incidências e proporcionalidade." },
  { href: "/folha/lancamentos", numero: "Lançamentos", rotulo: "Lançamentos", descricao: "Lançamentos fixos e variáveis por matrícula." },
  { href: "/folha/tabelas", numero: "Tabelas", rotulo: "Tabelas do ente", descricao: "Tabelas de contribuição previdenciária, IRRF e salário-família por vigência." },
  { href: "/folha/parametros-do-13", numero: "13º", rotulo: "Parâmetros do 13º", descricao: "Regras de cálculo do 13º salário por exercício, com o ato normativo de referência." },
  { href: "/folha/apropriacao-por-competencia", numero: "Apropriação", rotulo: "Apropriação do 13º e das férias", descricao: "Duodécimo mensal do 13º e das férias de cada vínculo pela folha fechada, e o acerto do 13º no fim do ano." },
  { href: "/folha/parametros-do-adiantamento-salarial", numero: "Vale", rotulo: "Parâmetros do adiantamento salarial", descricao: "Regras do adiantamento salarial por competência, com o ato normativo de referência." },
  { href: "/folha/grupos-de-empenho", numero: "Grupos de empenho", rotulo: "Grupos de empenho", descricao: "Agrupamento das rubricas da folha por ficha orçamentária para empenho." },
  { href: "/folha/descontos-retidos", numero: "Descontos retidos", rotulo: "Descontos retidos no pagamento", descricao: "A quem cada desconto do contracheque é devido: previdência, pensão, consignado, retidos no pagamento da folha." },
  { href: "/folha/encargos", numero: "Encargos", rotulo: "Encargos do empregador", descricao: "Encargos patronais por regime previdenciário, com alíquotas e vigências." },
  { href: "/folha/designacoes", numero: "Designações", rotulo: "Designações para o atesto", descricao: "Servidores designados para atestar a folha, com o ato e a vigência." },
  { href: "/folha/esocial", numero: "eSocial", rotulo: "Consistência para o eSocial", descricao: "Verificação dos dados cadastrais exigidos pelo eSocial." },
];

/** PESSOAL (M32) — fonte única da landing e do submenu. */
export const PESSOAL: readonly RelatorioNav[] = [
  { href: "/pessoal/servidores", numero: "Servidores", rotulo: "Servidores", descricao: "Ficha funcional, vínculos, cargo, lotação e histórico do servidor." },
  { href: "/pessoal/cargos", numero: "Cargos", rotulo: "Cargos", descricao: "Quadro de cargos, vagas criadas por lei e vagas ocupadas." },
  { href: "/pessoal/funcoes", numero: "Funções", rotulo: "Funções", descricao: "Funções gratificadas e de confiança, designações e dispensas." },
  { href: "/pessoal/lotacoes", numero: "Lotações", rotulo: "Lotações", descricao: "Estrutura de lotações e unidades orçamentárias correspondentes." },
];

/** Os CADASTROS BASE — fonte única da landing e do submenu. */
/** O PROTOCOLO — fonte única da landing e do submenu. */
export const PROTOCOLO: readonly RelatorioNav[] = [
  { href: "/protocolo/processos", numero: "Processos", rotulo: "Processos digitais", descricao: "Abertura, tramitação, pareceres e arquivamento de processos digitais." },
  { href: "/protocolo/solicitacoes", numero: "Solicitações", rotulo: "Mesa das solicitações", descricao: "Solicitações recebidas pela carta de serviços, por setor e situação." },
  { href: "/protocolo/ouvidoria", numero: "Ouvidoria", rotulo: "Mesa da ouvidoria", descricao: "Manifestações da ouvidoria: triagem, resposta e encerramento." },
  { href: "/protocolo/acesso-a-informacao", numero: "Acesso à informação", rotulo: "Acesso à informação", descricao: "Prazos e regulamentação dos pedidos de acesso à informação (Lei 12.527/2011)." },
  { href: "/protocolo/acesso-a-informacao/pedidos", numero: "Pedidos de acesso", rotulo: "Pedidos de acesso à informação", descricao: "Tramitação, prazos, prorrogação, resposta e recurso de cada pedido de informação." },
  { href: "/protocolo/avaliacoes", numero: "Avaliações", rotulo: "Avaliação dos serviços", descricao: "Avaliação dos serviços pelos cidadãos e moderação das avaliações." },
  { href: "/protocolo/guiches", numero: "Guichês", rotulo: "Atendimento presencial", descricao: "Unidades de atendimento presencial, guichês e agenda de horários." },
  { href: "/protocolo/setores", numero: "Setores", rotulo: "Setores", descricao: "Setores do ente: requisitantes do almoxarifado e das compras, destino dos processos e centros de custo." },
  { href: "/protocolo/servicos", numero: "Carta", rotulo: "Carta de serviços", descricao: "Carta de serviços: formulários, prazos e etapas de cada serviço." },
  { href: "/consulta", numero: "Consulta", rotulo: "Acompanhar processo", descricao: "Consulta pública do andamento de um processo pelo número e código verificador." },
];

/** A COMUNICAÇÃO INTERNA — fonte única da landing e do submenu. */
export const COMUNICACAO: readonly RelatorioNav[] = [
  { href: "/comunicacao/comunicados", numero: "Comunicados", rotulo: "Memorandos, ofícios e circulares", descricao: "Caixas de entrada e saída, rascunhos e arquivo de memorandos, ofícios e circulares." },
];

export const CADASTROS: readonly RelatorioNav[] = [
  { href: "/cadastros/pessoas", numero: "Pessoas", rotulo: "Pessoas e Credores", descricao: "Cadastro de pessoas físicas e jurídicas, credores e histórico de alterações." },
  { href: "/cadastros/representacoes", numero: "Representações", rotulo: "Representações", descricao: "Representantes legais de pessoas jurídicas, com documento e vigência." },
];

/**
 * O DESIGNER — fonte única da landing e do submenu.
 *
 * ⚠️ ELE FICA EM RELATÓRIOS, MAS NÃO É UM RELATÓRIO LEGAL. RREO, RGF e balanços têm
 * fórmula fixada em lei; o designer é a capacidade de o usuário montar o que ninguém
 * previu. Ficam na mesma área porque é onde o usuário procura — e a descrição diz a
 * diferença em voz alta.
 */
export const RELATORIOS_DESIGNER: readonly RelatorioNav[] = [
  { href: "/relatorios/designer", numero: "Designer", rotulo: "Modelos do usuário", descricao: "Relatórios personalizados montados pelo próprio ente." },
];

/** Os livros obrigatórios com página — fonte única da landing. */
export const RELATORIOS_LIVROS: readonly RelatorioNav[] = [
  { href: "/relatorios/livros/diario", numero: "Diário", rotulo: "Livro Diário", descricao: "Livro Diário com todos os lançamentos em ordem cronológica." },
  { href: "/relatorios/livros/razao", numero: "Razão", rotulo: "Razão Analítico", descricao: "Razão de uma conta, com saldo anterior, movimentos e saldo final." },
  { href: "/relatorios/livros/balancete", numero: "Balancete", rotulo: "Balancete de Verificação", descricao: "Saldos e movimentos por conta, com a conferência de débitos e créditos." },
  { href: "/relatorios/livros/balancete-por-fonte", numero: "Balancete por fonte", rotulo: "Balancete por Fonte de Recursos", descricao: "Saldos e movimentos de cada conta separados pela fonte de recursos, com resumo por fonte." },
  { href: "/relatorios/limite-do-legislativo", numero: "Limite do Legislativo", rotulo: "Limite do Legislativo", descricao: "Limite do repasse à Câmara (CF art. 29-A), duodécimo e repasses até o dia 20." },
  { href: "/relatorios/consistencia", numero: "Consistência", rotulo: "Relatório de Consistência", descricao: "Verificação da consistência entre os demonstrativos antes do envio aos órgãos de controle." },
  { href: "/relatorios/eliminacoes-intra", numero: "Eliminações", rotulo: "Eliminações Intragovernamentais", descricao: "Operações entre unidades do próprio ente, excluídas na consolidação." },
  { href: "/relatorios/atualizacoes-orcamentarias", numero: "Atualizações", rotulo: "Atualizações Orçamentárias", descricao: "Créditos adicionais por ficha, decreto, fonte e unidade gestora." },
];

/**
 * AS DEMONSTRAÇÕES CONTÁBEIS anuais da Lei 4.320 — fonte única da landing.
 *
 * Não confundir com os anexos do RREO/RGF: aqueles são o recorte bimestral/quadrimestral da STN,
 * com funções próprias. Estes quatro são os demonstrativos dos arts. 102 a 105 e a DVP.
 */
export const RELATORIOS_DEMONSTRACOES: readonly RelatorioNav[] = [
  { href: "/relatorios/demonstracoes/balanco-orcamentario", numero: "Anexo 12", rotulo: "Balanço Orçamentário", descricao: "Receita prevista e realizada, despesa fixada e executada (Lei 4.320, art. 102)." },
  { href: "/relatorios/demonstracoes/balanco-financeiro", numero: "Anexo 13", rotulo: "Balanço Financeiro", descricao: "Ingressos, dispêndios e saldos de caixa do exercício (Lei 4.320, art. 103)." },
  { href: "/relatorios/demonstracoes/balanco-patrimonial", numero: "Anexo 14 da Lei 4.320", rotulo: "Balanço Patrimonial", descricao: "Ativo, passivo e patrimônio líquido, com o quadro financeiro e permanente (Lei 4.320, art. 105)." },
  { href: "/relatorios/demonstracoes/variacoes-patrimoniais", numero: "Anexo 15", rotulo: "Variações Patrimoniais", descricao: "Variações patrimoniais aumentativas e diminutivas e o resultado do exercício." },
  { href: "/relatorios/demonstracoes/divida-fundada", numero: "Anexo 16", rotulo: "Dívida Fundada", descricao: "Dívida fundada interna e externa: saldo anterior, contratação, atualização, amortização e saldo seguinte (Lei 4.320, art. 98)." },
  { href: "/relatorios/demonstracoes/divida-flutuante", numero: "Anexo 17", rotulo: "Dívida Flutuante", descricao: "Restos a pagar, serviços da dívida, depósitos e débitos de tesouraria (Lei 4.320, art. 92)." },
  { href: "/relatorios/demonstracoes/conferencia-de-caixa", numero: "Caixa", rotulo: "Conferência de Caixa e Bancos", descricao: "Saldo de cada conta bancária em 31/12 contra o extrato, para a prestação de contas anual." },
  { href: "/relatorios/demonstracoes/fluxos-de-caixa", numero: "DFC", rotulo: "Fluxos de Caixa", descricao: "Ingressos e desembolsos das atividades operacionais, de investimento e de financiamento, e a geração líquida de caixa." },
  { href: "/relatorios/demonstracoes/dmpl", numero: "DMPL", rotulo: "Mutações do Patrimônio Líquido", descricao: "Evolução do patrimônio líquido no exercício, coluna por grupo do PL e linha pelo par do lançamento (MCASP, Parte V, item 7)." },
  { href: "/relatorios/demonstracoes/notas-explicativas", numero: "NE", rotulo: "Notas Explicativas", descricao: "Informações gerais, políticas contábeis, detalhamento e outras informações, com os temas que o manual manda divulgar." },
];

/** Uma relação entre relatórios — a rota do parente + POR QUE eles se falam (a identidade testada). */
export interface RelacaoRelatorio {
  readonly href: string;
  readonly rotulo: string;
  readonly motivo: string;
}

/**
 * O MAPA DAS RELAÇÕES entre os RREO — as identidades que os testes já provam, viradas navegação.
 * Cada aresta é um "por que estes dois números têm de bater". Fonte única do rodapé "Ver também".
 */
export const RELACOES_RREO: Record<string, readonly RelacaoRelatorio[]> = {
  "/relatorios/rreo/anexo1": [
    { href: "/relatorios/rreo/anexo2", rotulo: "Anexo 2 — Despesa por Função", motivo: "A despesa por função soma o mesmo total do balanço orçamentário." },
  ],
  "/relatorios/rreo/anexo2": [
    { href: "/relatorios/rreo/anexo1", rotulo: "Anexo 1 — Balanço Orçamentário", motivo: "O total da despesa por função fecha com o subtotal de despesa do balanço." },
    { href: "/relatorios/rreo/anexo7", rotulo: "Anexo 7 — Restos a Pagar", motivo: "Os RP não processados nascem da despesa empenhada e não liquidada." },
  ],
  "/relatorios/rreo/anexo3": [
    { href: "/relatorios/rreo/anexo12", rotulo: "Anexo 12 — Saúde (ASPS)", motivo: "A RCL e a base de impostos partem do mesmo razão de receita." },
    { href: "/relatorios/rreo/anexo8", rotulo: "Anexo 8 — Educação (MDE)", motivo: "A base dos mínimos usa a mesma receita de impostos." },
  ],
  "/relatorios/rreo/anexo7": [
    { href: "/relatorios/rreo/anexo2", rotulo: "Anexo 2 — Despesa por Função", motivo: "A inscrição de RP (coluna f) vem da despesa empenhada do Anexo 2." },
  ],
  "/relatorios/rreo/anexo8": [
    { href: "/relatorios/rreo/anexo12", rotulo: "Anexo 12 — Saúde (ASPS)", motivo: "O mesmo motor de base de impostos, com mínimos e partições diferentes." },
    { href: "/relatorios/rreo/anexo3", rotulo: "Anexo 3 — RCL", motivo: "As cota-partes brutas saem do mesmo razão de receita." },
  ],
  "/relatorios/rreo/anexo12": [
    { href: "/relatorios/rreo/anexo3", rotulo: "Anexo 3 — RCL", motivo: "A base ASPS e a RCL partem do mesmo razão de receita de impostos." },
    { href: "/relatorios/rreo/anexo8", rotulo: "Anexo 8 — Educação (MDE)", motivo: "O mesmo motor de base alimenta os dois demonstrativos." },
  ],
};

/** Acha a área de um pathname (`/despesa/empenhos` → a área "despesa"). `null` no dashboard. */
export function areaDaRota(pathname: string): AreaNav | null {
  // ⚠️ AS ROTAS DECLARADAS VÊM PRIMEIRO, E POR PREFIXO MAIS LONGO. `/administracao/transparencia`
  // e `/administracao` casam as duas com a mesma rota; quem manda é a mais específica. Sem esta
  // ordem, a landing interna da transparência apareceria como se fosse da Administração.
  const declaradas = AREAS.filter((a) => a.rota !== undefined).sort(
    (x, y) => (y.rota as string).length - (x.rota as string).length
  );
  const casada = declaradas.find(
    (a) => pathname === a.rota || pathname.startsWith(`${a.rota as string}/`)
  );
  if (casada !== undefined) return casada;

  const seg = pathname.split("/").filter(Boolean)[0];
  if (seg === undefined) return null;
  // ⚠️ E uma área com `rota` própria NÃO responde mais pelo seu segmento: `/transparencia` é o
  // portal público, e devolver a área interna aqui traria a sidebar de volta para cima dele.
  return AREAS.find((a) => a.slug === seg && a.rota === undefined) ?? null;
}

/** Todos os itens navegáveis (rota → rótulo), fonte única do rótulo acentuado do breadcrumb. */
const ITENS_NAVEGAVEIS: readonly RelatorioNav[] = [
  ...RELATORIOS_RREO,
  ...RELATORIOS_RGF,
  ...RELATORIOS_LIVROS,
  ...RELATORIOS_GERENCIAIS,
  ...EXECUCAO_DESPESA,
  ...EXECUCAO_RECEITA,
  ...ADMINISTRACAO,
  ...PLANEJAMENTO,
  ...CONTABILIDADE,
  ...FINANCEIRO,
];

/**
 * O rótulo do usuário para uma rota EXATA (`/receita/arrecadacoes` → "Arrecadação"). É o que o
 * breadcrumb usa para não exibir o segmento cru sem acento ("Arrecadacoes"). `null` se não houver
 * rótulo mapeado — aí o breadcrumb capitaliza o segmento como antes.
 */
export function rotuloDaRota(href: string): string | null {
  const area = AREAS.find((a) => rotaDaArea(a) === href);
  if (area !== null && area !== undefined) return area.rotulo;
  return ITENS_NAVEGAVEIS.find((i) => i.href === href)?.rotulo ?? null;
}

/**
 * OS CADASTROS DO MOLDE (ENT03b) — e eles são declarados AQUI, uma vez.
 *
 * ⚠️ A NAVEGAÇÃO NÃO É DERIVADA DO DESCRITOR, e a decisão é deliberada. O descritor sabe a
 * ROTA, mas não sabe onde ela pertence na cabeça de quem usa o sistema: "convênios" e
 * "consórcios" são a mesma área para o operador (o dinheiro que atravessa a fronteira do
 * ente) e módulos diferentes para o código. Derivar a sidebar do descritor faria a árvore da
 * navegação seguir a árvore dos módulos — que é exatamente o que o cabeçalho deste arquivo
 * recusa.
 */
export const TRANSFERENCIAS: readonly RelatorioNav[] = [
  { href: "/transferencias/convenios", numero: "Convênios", rotulo: "Convênios de Repasse", descricao: "Convênios concedidos e recebidos: liberações, prestação de contas e glosas." },
  { href: "/transferencias/consorcios", numero: "Consórcios", rotulo: "Consórcios Públicos", descricao: "Contratos de rateio, aditivos e repasses aos consórcios públicos." },
];

export const DIVIDA: readonly RelatorioNav[] = [
  { href: "/divida/precatorios", numero: "Precatórios", rotulo: "Precatórios Judiciais", descricao: "Ordem de pagamento de precatórios judiciais (CF art. 100)." },
  { href: "/divida/fundada", numero: "Dívida fundada", rotulo: "Dívida Fundada", descricao: "Dívida consolidada: contratação, amortização e atualização monetária." },
  { href: "/relatorios/divida", numero: "Relatório da dívida", rotulo: "Relatório e parcelas da dívida", descricao: "Saldos de todas as dívidas fundadas e as parcelas informadas ao lado do amortizado." },
  { href: "/divida/ativa", numero: "Dívida ativa", rotulo: "Dívida Ativa", descricao: "Inscrição, atualização e cancelamento da dívida ativa (Lei 4.320, art. 39)." },
  { href: "/divida/ativa/perdas", numero: "Perdas", rotulo: "Ajuste para Perdas da Dívida Ativa", descricao: "Perda esperada declarada com a metodologia, e a apuração que lança a diferença na conta redutora." },
];

/**
 * ⚠️ ENT06 — O ALMOXARIFADO FÍSICO GANHOU TELA. Até aqui a seção 5.18 tinha modelo, caso de
 * uso e teste contra banco, e nenhuma rota: existia no servidor e nenhum servidor municipal
 * a alcançava. Estas quatro entradas são o que muda isso — e entram AQUI, numa lista só,
 * porque é dela que saem ao mesmo tempo o hub da área e o índice da busca global.
 */
export const ALMOXARIFADO: readonly RelatorioNav[] = [
  { href: "/patrimonio/almoxarifado/classes", numero: "Classes", rotulo: "Classes de Material", descricao: "Classes de material e as contas contábeis de estoque correspondentes." },
  { href: "/patrimonio/almoxarifado/grupos", numero: "Grupos", rotulo: "Grupos de Material", descricao: "Grupos e subgrupos do catálogo de materiais." },
  { href: "/patrimonio/almoxarifado/unidades", numero: "Unidades", rotulo: "Unidades de Medida", descricao: "Unidades de medida do estoque." },
  { href: "/patrimonio/almoxarifado/roteiros", numero: "Roteiros", rotulo: "Roteiros contábeis do almoxarifado", descricao: "Contas de débito e de crédito da saída por consumo e dos ajustes de inventário." },
  { href: "/patrimonio/almoxarifado/materiais", numero: "Materiais", rotulo: "Materiais", descricao: "Catálogo de materiais, com classe contábil, CATMAT e estoque mínimo e máximo." },
  { href: "/patrimonio/almoxarifado/depositos", numero: "Depósitos", rotulo: "Depósitos", descricao: "Depósitos, unidade gestora responsável e bloqueios de movimentação." },
  { href: "/patrimonio/almoxarifado/estoque", numero: "Posição", rotulo: "Posição de Estoque", descricao: "Posição de estoque em qualquer data, com preço médio e lotes a vencer." },
  { href: "/patrimonio/almoxarifado/requisicoes", numero: "Requisições", rotulo: "Requisições de Material", descricao: "Requisições de material dos setores e o atendimento total ou parcial." },
  { href: "/patrimonio/almoxarifado/inventarios", numero: "Inventários", rotulo: "Inventários de Estoque", descricao: "Inventário de estoque, com bloqueio da movimentação durante a contagem." },
];

/**
 * ⚠️ ENT06 — OS CADASTROS DE APOIO DA GESTÃO DO BEM (TR 5.19). Mesma razão da lista acima:
 * é dela que saem, ao mesmo tempo, o hub da área e o índice da busca global. Repetir os
 * itens no hub criaria duas verdades sobre o que existe nesta área.
 *
 * São os três que TODO o resto de 5.19 pressupõe: um bem se move PARA uma localização, sai
 * do acervo POR um motivo, e entra nele POR um tipo de incorporação.
 */
export const GESTAO_DO_BEM: readonly RelatorioNav[] = [
  { href: "/patrimonio/localizacoes", numero: "Localizações", rotulo: "Localizações Físicas", descricao: "Prédios, andares e salas, com o setor responsável pela guarda dos bens." },
  { href: "/patrimonio/motivos-de-baixa", numero: "Motivos", rotulo: "Motivos de Baixa", descricao: "Motivos de baixa de bens: alienação, doação, inservibilidade, furto e outros." },
  { href: "/patrimonio/tipos-de-incorporacao", numero: "Incorporação", rotulo: "Tipos de Incorporação", descricao: "Formas de incorporação de bens: aquisição, doação, comodato e permuta." },
];

/**
 * ⚠️ ENT07 — O ACERVO. Mesma razão das duas listas acima: é dela que saem, ao mesmo tempo, o
 * hub da área e o índice da busca global.
 *
 * A CLASSE vem antes do BEM na lista porque vem antes na prática: o formulário do bem pede
 * uma classe, e sem classe cadastrada o seletor nasce vazio.
 */
export const ACERVO: readonly RelatorioNav[] = [
  { href: "/patrimonio/classes-de-bens", numero: "Classes", rotulo: "Classes de Bens", descricao: "Classes de bens móveis e imóveis e a conta contábil de cada uma." },
  { href: "/patrimonio/bens-patrimoniais", numero: "Acervo", rotulo: "Bens Patrimoniais", descricao: "Cadastro de bens patrimoniais: classe, aquisição, incorporação e valor." },
  { href: "/patrimonio/incorporacoes", numero: "Incorporados", rotulo: "Bens Incorporados e a Incorporar", descricao: "Liquidações de capital com o já incorporado e o que falta incorporar, e os bens incorporados, com filtros da dotação." },
  { href: "/patrimonio/meus-bens", numero: "Meus bens", rotulo: "Bens sob minha responsabilidade", descricao: "Bens sob sua responsabilidade." },
  { href: "/patrimonio/frota", numero: "Frota", rotulo: "Frota", descricao: "Veículos e máquinas, dono e locador, situação no mês e abastecimento." },
  { href: "/patrimonio/frota/multas", numero: "Multas", rotulo: "Multas de Trânsito", descricao: "Multas dos veículos da frota: auto, infração, valor, infrator e baixa, com o controle contábil." },
  { href: "/patrimonio/farmacias", numero: "Farmácias", rotulo: "Farmácias Públicas", descricao: "Farmácias públicas, responsável técnico e estoque de medicamentos do mês." },
];

/**
 * ⚠️ ENT11 — O EIXO FINANCEIRO DO PATRIMÔNIO. Mesma razão das três listas acima: é dela que
 * saem, ao mesmo tempo, o hub da área e o índice da busca global.
 *
 * ⚠️ E ELAS VÊM ANTES DE TUDO O MAIS NA PRÁTICA, ainda que apareçam depois na lista. Sem
 * roteiro parametrizado, `roteiroDoTipo` RECUSA todo movimento de valor — avaliação,
 * reavaliação, depreciação, baixa. Com zero linhas na tabela, o acervo inteiro podia ser
 * cadastrado e nenhum bem podia receber um centavo.
 */
export const ROTEIROS_CONTABEIS: readonly RelatorioNav[] = [
  { href: "/patrimonio/roteiros", numero: "Roteiros", rotulo: "Roteiros Contábeis do Patrimônio", descricao: "Contas contábeis de aquisição, reavaliação, depreciação e baixa de bens." },
  { href: "/patrimonio/roteiros-de-resultado", numero: "Resultado", rotulo: "Roteiros do Resultado da Alienação", descricao: "Contas contábeis de ganho e perda na alienação de bens." },
  { href: "/patrimonio/parametros-de-atualizacao", numero: "Parâmetros", rotulo: "Parâmetros de Depreciação", descricao: "Método, vida útil e valor residual para depreciação, por classe." },
  { href: "/patrimonio/termos", numero: "Termos", rotulo: "Termos Patrimoniais", descricao: "Termos de responsabilidade e de baixa, emitidos em PDF." },
  { href: "/patrimonio/competencia", numero: "Competência", rotulo: "Processamento por Competência", descricao: "Cálculo mensal de depreciação, amortização e exaustão, com prévia antes do lançamento." },
];

export const CONTROLE_INTERNO: readonly RelatorioNav[] = [
  { href: "/controle-interno/auditorias", numero: "Auditorias", rotulo: "Auditorias Internas", descricao: "Auditorias internas: roteiro com base legal, achados, providências e relatório." },
];

// ═════════════════════════════════════════════════════════════════════════════════════════════
// O MENU DO CONTADOR (V31) — as abas como o contador público procura, sobre as MESMAS rotas.
// ═════════════════════════════════════════════════════════════════════════════════════════════

/** Um item do menu: a rota existente e o nome que o contador reconhece. */
export interface ItemDoMenu {
  readonly href: string;
  readonly rotulo: string;
}

export interface GrupoDoMenu {
  readonly rotulo: string;
  readonly itens: readonly ItemDoMenu[];
}

export interface AbaDoMenu {
  readonly id: string;
  readonly rotulo: string;
  readonly grupos: readonly GrupoDoMenu[];
}

const deLista = (lista: readonly RelatorioNav[]): readonly ItemDoMenu[] => lista.map((r) => ({ href: r.href, rotulo: r.rotulo }));

/**
 * ⚠️ O MENU ORGANIZA, NÃO CRIA. Cada item aponta para uma tela que já existe, com o serviço, a
 * permissão e os fatos dela. A mesma operação aparece em mais de uma aba quando o contador a procura
 * por mais de um caminho (a ficha é LOA no planejamento e dotação na despesa) — é atalho, não cópia.
 *
 * ⚠️ E A VISIBILIDADE NÃO É DECIDIDA AQUI. Um item aparece se a ÁREA da rota dele (`areaDaRota`) está
 * entre as que o servidor liberou para o usuário (`areasVisiveis`, a mesma tabela que `autorizar`
 * lê). Nenhuma permissão nova, nenhuma permissão a menos: só outra arrumação. A tela, ao abrir, ainda
 * confere a própria ação. `test/ui/menu-do-contador.test.ts` prova que todo item tem página e área.
 *
 * ⚠️ AS TELAS QUE SÓ SE ALCANÇAVAM PELA URL ganharam entrada aqui: contas bancárias, entidades,
 * lançamento da receita, certidões, receita por entidade, distribuição por fontes, importadores,
 * SAGRES e Tribunal de Contas, captura, provisões, etiquetas e a posição de bens por classe.
 */
export const MENU_DO_CONTADOR: readonly AbaDoMenu[] = [
  {
    id: "planejamento",
    rotulo: "Planejamento",
    grupos: [
      { rotulo: "PPA", itens: [
        { href: "/planejamento/ppa", rotulo: "Plano Plurianual" },
        { href: "/planejamento/ppa/transferencias", rotulo: "Transferências previstas no PPA" },
        { href: "/planejamento/ppa/programas", rotulo: "Programas, objetivos e metas" },
        { href: "/planejamento/ppa/estrutura", rotulo: "Estrutura temática" },
        { href: "/planejamento/ppa/codigos-reduzidos", rotulo: "Códigos reduzidos da despesa" },
        { href: "/planejamento/audiencias", rotulo: "Audiências públicas" },
        { href: "/planejamento/programas-e-acoes", rotulo: "Programas e ações do orçamento" },
      ] },
      { rotulo: "LDO", itens: [
        { href: "/planejamento/ldo", rotulo: "Diretrizes, prioridades, metas e anexos" },
        { href: "/planejamento/alteracoes", rotulo: "Alterações do PPA e da LDO" },
      ] },
      { rotulo: "LOA", itens: [
        { href: "/planejamento/loa", rotulo: "Lei Orçamentária Anual" },
        { href: "/planejamento/loa/vinculo-ppa", rotulo: "Ações do PPA na LOA" },
        { href: "/planejamento/receita-prevista", rotulo: "Receitas previstas" },
        { href: "/planejamento/fichas", rotulo: "Fichas e dotações" },
        { href: "/planejamento/unidades-orcamentarias", rotulo: "Unidades orçamentárias" },
        { href: "/planejamento/fontes-de-recurso", rotulo: "Fontes de recurso" },
        { href: "/planejamento/leis-orcamentarias", rotulo: "Projeto de lei e aprovação" },
      ] },
      { rotulo: "Próximo exercício", itens: [
        { href: "/planejamento/proposta-orcamentaria", rotulo: "Preparar o próximo exercício (proposta)" },
        { href: "/planejamento/emendas", rotulo: "Emendas ao projeto" },
        { href: "/planejamento/emendas-do-plano", rotulo: "Emendas ao PPA e à LDO" },
        { href: "/planejamento/comparacao-de-exercicios", rotulo: "Comparação de exercícios" },
      ] },
      { rotulo: "Detalhamento e programação", itens: [
        { href: "/planejamento/qdd", rotulo: "QDD — detalhamento da despesa" },
        { href: "/planejamento/cmd-mba", rotulo: "Programação financeira (CMD e MBA)" },
      ] },
      { rotulo: "Conferências e relatórios", itens: [
        { href: "/relatorios/consistencia", rotulo: "Conferência de consistência" },
        { href: "/relatorios/atualizacoes-orcamentarias", rotulo: "Atualizações orçamentárias" },
      ] },
    ],
  },
  {
    id: "despesa",
    rotulo: "Orçamento e Despesa",
    grupos: [
      { rotulo: "Dotações", itens: [
        { href: "/planejamento/qdd", rotulo: "Dotações e saldos" },
        { href: "/planejamento/fichas", rotulo: "Fichas orçamentárias" },
      ] },
      { rotulo: "Solicitações e reservas", itens: [
        { href: "/despesa/solicitacoes-de-empenho", rotulo: "Solicitação e autorização de empenho" },
        { href: "/licitacoes/processos", rotulo: "Reserva de dotação do processo" },
      ] },
      { rotulo: "Alterações orçamentárias", itens: [
        { href: "/planejamento/creditos-adicionais", rotulo: "Créditos adicionais" },
        { href: "/planejamento/previas", rotulo: "Prévias de alteração orçamentária" },
        { href: "/planejamento/realocacoes", rotulo: "Remanejamento, transposição e transferência" },
        { href: "/planejamento/recursos-novos", rotulo: "Recursos para créditos adicionais" },
        { href: "/contabilidade/superavit", rotulo: "Superávit financeiro por fonte" },
        { href: "/planejamento/creditos-adicionais/normas-no-tribunal", rotulo: "Leis no Tribunal de Contas" },
      ] },
      { rotulo: "Execução", itens: [
        { href: "/despesa/empenhos", rotulo: "Empenhos" },
        { href: "/despesa/liquidacoes", rotulo: "Liquidações" },
        { href: "/despesa/a-pagar", rotulo: "A pagar por credor" },
        { href: "/despesa/em-liquidacao", rotulo: "Empenhos e restos em liquidação" },
        { href: "/despesa/anulacoes", rotulo: "Anulações e estornos" },
        { href: "/licitacoes/documentos-fiscais", rotulo: "Documentos fiscais" },
        { href: "/despesa/assinaturas", rotulo: "Assinatura dos documentos" },
        { href: "/despesa/campanhas-publicitarias", rotulo: "Campanhas publicitárias" },
        { href: "/despesa/adiantamentos", rotulo: "Diárias e suprimento de fundos" },
      ] },
      { rotulo: "Restos a pagar", itens: [
        { href: "/despesa/restos-a-pagar", rotulo: "Restos a pagar" },
      ] },
    ],
  },
  {
    id: "receitas",
    rotulo: "Receitas",
    grupos: [
      { rotulo: "Classificação e previsão", itens: [
        { href: "/receita/naturezas", rotulo: "Naturezas de receita" },
        { href: "/receita/naturezas/fontes", rotulo: "Fontes por natureza da receita" },
        { href: "/planejamento/receita-prevista", rotulo: "Previsão da receita" },
        { href: "/planejamento/reprevisao", rotulo: "Reestimativa da receita (reprevisão)" },
      ] },
      { rotulo: "Arrecadação", itens: [
        { href: "/receita/arrecadacoes", rotulo: "Arrecadação, anulação e estorno" },
        { href: "/receita/deducoes", rotulo: "Deduções da receita (FUNDEB)" },
        { href: "/receita/arrecadacoes/distribuir", rotulo: "Distribuição por fontes" },
        { href: "/financeiro/retencoes-proprias", rotulo: "Receitas de retenções" },
      ] },
      { rotulo: "Acompanhamento", itens: [
        { href: "/receita/por-entidade", rotulo: "Arrecadação por entidade" },
      ] },
    ],
  },
  {
    // V38 — a contadora estranhou o cadastro imobiliário e as certidões no meio da arrecadação: são gestão tributária,
    // com reflexo contábil (a inscrição em dívida ativa nasce do reconhecimento da receita). Mesmas rotas e permissões.
    id: "tributos",
    rotulo: "Tributos",
    grupos: [
      { rotulo: "Cadastro e lançamento", itens: [
        { href: "/receita/imoveis", rotulo: "Cadastro imobiliário" },
        { href: "/receita/parametros-tributarios", rotulo: "Parâmetros dos tributos" },
        { href: "/receita/lancamentos", rotulo: "Lançamento de tributos" },
      ] },
      { rotulo: "Cobrança e certidões", itens: [
        { href: "/divida/ativa", rotulo: "Dívida ativa" },
        { href: "/receita/certidoes", rotulo: "Certidões de débitos" },
      ] },
    ],
  },
  {
    id: "tesouraria",
    rotulo: "Tesouraria",
    grupos: [
      { rotulo: "Contas e disponibilidades", itens: [
        { href: "/financeiro/contas-bancarias", rotulo: "Contas bancárias" },
        { href: "/financeiro/movimentacao", rotulo: "Movimentação bancária" },
        { href: "/financeiro/cheques", rotulo: "Cheques" },
      ] },
      { rotulo: "Pagamentos", itens: [
        { href: "/despesa/ordens", rotulo: "Ordens de pagamento" },
        { href: "/despesa/pagamentos", rotulo: "Fila de pagamentos" },
        { href: "/despesa/ordem-cronologica", rotulo: "Ordem cronológica" },
        { href: "/financeiro/lotes", rotulo: "Lotes, borderô e retorno do banco" },
      ] },
      { rotulo: "Transferências", itens: [
        { href: "/financeiro/transferencias-entre-ugs", rotulo: "Entre unidades gestoras" },
        { href: "/transferencias/convenios", rotulo: "Convênios" },
        { href: "/transferencias/consorcios", rotulo: "Consórcios" },
      ] },
      { rotulo: "Conciliação", itens: [
        { href: "/financeiro/conciliacao", rotulo: "Conciliação bancária" },
        { href: "/financeiro/conciliacao/periodo", rotulo: "Conciliação por período" },
        { href: "/financeiro/conciliacao/extratos", rotulo: "Extratos importados" },
      ] },
      { rotulo: "Consultas", itens: [
        { href: "/relatorios/gerenciais", rotulo: "Consulta por credor e fonte" },
        { href: "/relatorios/pagamentos", rotulo: "Pagamentos efetuados" },
        { href: "/relatorios/credor", rotulo: "Ficha do credor" },
        { href: "/relatorios/movimento-diario", rotulo: "Movimento diário" },
        { href: "/relatorios/receita-mensal", rotulo: "Receita mês a mês" },
      ] },
    ],
  },
  {
    id: "extraorcamentario",
    rotulo: "Extraorçamentário",
    grupos: [
      { rotulo: "Movimento", itens: [
        { href: "/financeiro/extraorcamentario", rotulo: "Ingressos, dispêndios e estornos" },
        { href: "/financeiro/extraorcamentario/recolher", rotulo: "Recolhimentos, inclusive de exercícios anteriores" },
        { href: "/financeiro/extraorcamentario/sem-titular", rotulo: "Movimentos sem titular" },
      ] },
      { rotulo: "Consignações e retenções", itens: [
        { href: "/financeiro/consignacoes", rotulo: "Consignações" },
        { href: "/folha/descontos-retidos", rotulo: "Descontos retidos na folha" },
      ] },
    ],
  },
  {
    id: "contratacoes",
    rotulo: "Contratações",
    grupos: [
      { rotulo: "Demandas", itens: [
        { href: "/licitacoes/solicitacoes", rotulo: "Solicitações de compra" },
        { href: "/licitacoes/pesquisas-de-precos", rotulo: "Pesquisas de preços" },
      ] },
      { rotulo: "Procedimentos", itens: [
        { href: "/licitacoes/processos", rotulo: "Licitações e contratações diretas" },
      ] },
      { rotulo: "Contratos", itens: [
        { href: "/licitacoes/contratos", rotulo: "Contratos e alterações" },
        { href: "/licitacoes/ordens-de-compra", rotulo: "Ordens de fornecimento" },
      ] },
      { rotulo: "Execução e fiscalização", itens: [
        { href: "/licitacoes/fiscalizacao", rotulo: "Fiscalização" },
        { href: "/licitacoes/ordens-de-servico", rotulo: "Ordens de serviço" },
        { href: "/licitacoes/obras", rotulo: "Obras e medições" },
        { href: "/licitacoes/ppp", rotulo: "Parcerias público-privadas" },
        { href: "/licitacoes/documentos-fiscais", rotulo: "Recebimento de notas" },
      ] },
    ],
  },
  {
    id: "pessoal",
    rotulo: "Pessoal e Folha",
    grupos: [
      { rotulo: "Cadastro", itens: deLista(PESSOAL) },
      { rotulo: "Parâmetros", itens: [
        { href: "/folha/rubricas", rotulo: "Rubricas" },
        { href: "/folha/tabelas", rotulo: "Tabelas" },
        { href: "/folha/parametros-do-13", rotulo: "Parâmetros do 13º" },
        { href: "/folha/parametros-do-adiantamento-salarial", rotulo: "Parâmetros do adiantamento" },
        { href: "/folha/encargos", rotulo: "Encargos do empregador" },
      ] },
      { rotulo: "Folha", itens: [
        { href: "/folha/lancamentos", rotulo: "Eventos e lançamentos" },
        { href: "/folha/folhas", rotulo: "Cálculo, conferência e fechamento" },
        { href: "/folha/designacoes", rotulo: "Designações para o atesto" },
        { href: "/folha/esocial", rotulo: "Consistência para o eSocial" },
      ] },
      { rotulo: "Apropriação e pagamento", itens: [
        { href: "/folha/grupos-de-empenho", rotulo: "Grupos de empenho" },
        { href: "/folha/agrupamento-no-tribunal", rotulo: "Agrupamento no Tribunal" },
      ] },
    ],
  },
  {
    id: "patrimonio",
    rotulo: "Patrimônio e Estoque",
    grupos: [
      { rotulo: "Bens", itens: [
        { href: "/patrimonio/bens-patrimoniais", rotulo: "Bens e incorporações" },
        { href: "/patrimonio/bens", rotulo: "Posição por classe" },
        { href: "/patrimonio/incorporacoes", rotulo: "Incorporados e a incorporar" },
        { href: "/patrimonio/classes-de-bens", rotulo: "Classes de bens" },
        { href: "/patrimonio/tipos-de-incorporacao", rotulo: "Tipos de incorporação" },
        { href: "/patrimonio/etiquetas", rotulo: "Etiquetas" },
      ] },
      { rotulo: "Localização e responsabilidade", itens: [
        { href: "/patrimonio/localizacoes", rotulo: "Localizações" },
        { href: "/patrimonio/meus-bens", rotulo: "Bens sob minha responsabilidade" },
        { href: "/patrimonio/termos", rotulo: "Termos" },
      ] },
      { rotulo: "Mensuração e baixa", itens: [
        { href: "/patrimonio/competencia", rotulo: "Depreciação por competência" },
        { href: "/patrimonio/parametros-de-atualizacao", rotulo: "Parâmetros de depreciação" },
        { href: "/patrimonio/provisoes", rotulo: "Provisões" },
        { href: "/patrimonio/motivos-de-baixa", rotulo: "Motivos de baixa" },
      ] },
      { rotulo: "Estoque", itens: deLista(ALMOXARIFADO) },
      { rotulo: "Integração contábil", itens: [
        { href: "/patrimonio/roteiros", rotulo: "Roteiros contábeis" },
        { href: "/patrimonio/roteiros-de-resultado", rotulo: "Resultado da alienação" },
      ] },
      { rotulo: "Frota e farmácias", itens: [
        { href: "/patrimonio/frota", rotulo: "Frota" },
        { href: "/patrimonio/frota/multas", rotulo: "Multas de trânsito" },
        { href: "/patrimonio/farmacias", rotulo: "Farmácias públicas" },
      ] },
    ],
  },
  {
    id: "contabilidade",
    rotulo: "Contabilidade",
    grupos: [
      { rotulo: "Plano e configurações", itens: [
        { href: "/contabilidade/plano-de-contas", rotulo: "Plano de contas" },
        { href: "/contabilidade/roteiros-orcamentarios", rotulo: "Roteiro orçamentário" },
        { href: "/contabilidade/roteiros-de-restos-a-pagar", rotulo: "Contas dos restos a pagar" },
        { href: "/contabilidade/contas-da-liquidacao", rotulo: "Contas da liquidação" },
        { href: "/contabilidade/contas-da-receita", rotulo: "Contas da receita" },
        { href: "/contabilidade/roteiros-patrimoniais", rotulo: "Roteiros de precatórios, convênios e adiantamentos" },
      ] },
      { rotulo: "Lançamentos e livros", itens: [
        { href: "/contabilidade/lancamentos", rotulo: "Lançamentos, documentos de origem e lançamento manual" },
        ...deLista(RELATORIOS_LIVROS.filter((l) => l.href.startsWith("/relatorios/livros/"))),
      ] },
      { rotulo: "Demonstrações contábeis", itens: deLista(RELATORIOS_DEMONSTRACOES) },
      { rotulo: "Conferências", itens: [
        { href: "/relatorios/consistencia", rotulo: "Conferência de consistência" },
        { href: "/financeiro/conciliacao", rotulo: "Conciliação bancária" },
      ] },
      { rotulo: "Encerramento e abertura", itens: [
        { href: "/contabilidade/fechamento-mensal", rotulo: "Fechamento mensal" },
        { href: "/despesa/restos-a-pagar", rotulo: "Inscrição de restos e encerramento" },
        { href: "/contabilidade/virada-dos-controles", rotulo: "Virada das contas de controle" },
        { href: "/contabilidade/implantacao-de-saldos", rotulo: "Implantação de saldos" },
      ] },
      { rotulo: "Consolidação, custos e dívida", itens: [
        { href: "/relatorios/eliminacoes-intra", rotulo: "Operações intragovernamentais" },
        { href: "/contabilidade/custos", rotulo: "Custos" },
        { href: "/divida/fundada", rotulo: "Dívida fundada" },
        { href: "/relatorios/divida", rotulo: "Relatório e parcelas da dívida" },
        { href: "/divida/precatorios", rotulo: "Precatórios" },
      ] },
    ],
  },
  {
    id: "prestacao",
    rotulo: "Prestação de Contas",
    grupos: [
      { rotulo: "RREO (Siconfi)", itens: deLista(RELATORIOS_RREO) },
      { rotulo: "RGF (Siconfi)", itens: deLista(RELATORIOS_RGF) },
      { rotulo: "Tribunal de Contas", itens: [
        { href: "/integracoes/sagres", rotulo: "SAGRES — remessa e validação" },
        { href: "/integracoes/tce", rotulo: "Plano do Tribunal e situação do envio" },
        { href: "/folha/agrupamento-no-tribunal", rotulo: "Folha no Tribunal" },
      ] },
      { rotulo: "Arquivos e integrações", itens: [
        { href: "/contabilidade/exportacoes-federais", rotulo: "Matriz de Saldos Contábeis (MSC) e MANAD" },
        { href: "/integracoes", rotulo: "Central de integrações" },
        { href: "/integracoes/captura", rotulo: "Captura de documentos" },
      ] },
      { rotulo: "Relatórios do ente", itens: [
        ...deLista(RELATORIOS_GERENCIAIS),
        ...deLista(RELATORIOS_DESIGNER),
      ] },
    ],
  },
  {
    id: "cadastros",
    rotulo: "Cadastros e Administração",
    grupos: [
      { rotulo: "Ente e unidades", itens: [
        { href: "/administracao/apresentacao", rotulo: "Ente" },
        { href: "/contabilidade/entidades", rotulo: "Entidades" },
        { href: "/contabilidade/unidades-gestoras", rotulo: "Unidades gestoras" },
        { href: "/planejamento/unidades-orcamentarias", rotulo: "Órgãos e unidades orçamentárias" },
      ] },
      { rotulo: "Credores", itens: deLista(CADASTROS) },
      { rotulo: "Classificações e fontes", itens: [
        { href: "/planejamento/fontes-de-recurso", rotulo: "Fontes de recurso" },
        { href: "/contabilidade/natureza-das-fontes", rotulo: "Natureza das fontes" },
        { href: "/receita/naturezas", rotulo: "Naturezas de receita" },
        { href: "/receita/naturezas/fontes", rotulo: "Fontes por natureza da receita" },
        { href: "/contabilidade/exportacoes-federais/classificacao", rotulo: "Classificação para a Receita" },
      ] },
      { rotulo: "Responsáveis e acesso", itens: [
        { href: "/contabilidade/ordenadores", rotulo: "Ordenadores e responsáveis" },
        { href: "/contabilidade/exportacoes-federais/responsaveis", rotulo: "Responsáveis técnicos" },
        { href: "/administracao/usuarios", rotulo: "Usuários" },
        { href: "/administracao/perfis", rotulo: "Perfis e permissões" },
        { href: "/administracao/senha", rotulo: "Trocar senha" },
      ] },
      { rotulo: "Importações e histórico", itens: [
        { href: "/integracoes/importadores", rotulo: "Importações" },
        { href: "/administracao/auditoria", rotulo: "Histórico de operações" },
        { href: "/administracao/sistema", rotulo: "Sobre o sistema" },
      ] },
    ],
  },
];

/**
 * AS ÁREAS QUE NÃO SÃO DA CONTABILIDADE (protocolo, comunicação, controle interno, portal do
 * servidor...) continuam no menu, numa aba própria — reorganizar para o contador não pode sumir com a
 * tela de quem não é contador.
 */
const AREAS_FORA_DO_MENU_CONTABIL: readonly SlugDeArea[] = [
  "protocolo",
  "comunicacao",
  "controle-interno",
  "transparencia",
  "portal-do-servidor",
  "meus-servicos",
  "suporte",
  "licenciamento",
];

export const ABA_OUTRAS_AREAS: AbaDoMenu = {
  id: "outras",
  rotulo: "Outras áreas",
  grupos: [
    {
      rotulo: "Outras áreas",
      itens: AREAS.filter((a) => AREAS_FORA_DO_MENU_CONTABIL.includes(a.slug)).map((a) => ({ href: rotaDaArea(a), rotulo: a.rotulo })),
    },
  ],
};

/** O menu inteiro, recortado pelas áreas que o servidor liberou. Abas e grupos vazios somem. */
export function menuVisivel(areasVisiveis: readonly string[] | undefined): readonly AbaDoMenu[] {
  const pode = (href: string): boolean => {
    if (areasVisiveis === undefined) return true;
    const area = areaDaRota(href);
    return area !== null && areasVisiveis.includes(area.slug);
  };
  return [...MENU_DO_CONTADOR, ABA_OUTRAS_AREAS]
    .map((aba) => ({
      ...aba,
      grupos: aba.grupos
        .map((g) => ({ ...g, itens: g.itens.filter((i) => pode(i.href)) }))
        .filter((g) => g.itens.length > 0),
    }))
    .filter((aba) => aba.grupos.length > 0);
}

/**
 * A ABA DA ROTA ATUAL: a que tem o item de prefixo mais longo casando com o caminho. Uma rota com
 * atalho em duas abas (as fichas) abre a primeira que a declara — a casa natural dela.
 */
export function abaDaRota(pathname: string, abas: readonly AbaDoMenu[]): string | null {
  let melhor: { id: string; tamanho: number } | null = null;
  for (const aba of abas) {
    for (const g of aba.grupos) {
      for (const i of g.itens) {
        if ((pathname === i.href || pathname.startsWith(`${i.href}/`)) && (melhor === null || i.href.length > melhor.tamanho)) {
          melhor = { id: aba.id, tamanho: i.href.length };
        }
      }
    }
  }
  return melhor?.id ?? null;
}
