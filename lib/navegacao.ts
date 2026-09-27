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
  { slug: "planejamento", rotulo: "Planejamento", descricao: "LOA, fichas, créditos adicionais e programação financeira (CMD/MBA)." },
  { slug: "receita", rotulo: "Receita", descricao: "Previsão, arrecadação, reconhecimento pelo fato gerador e dívida ativa." },
  { slug: "despesa", rotulo: "Despesa", descricao: "Empenho, liquidação, pagamento e restos a pagar." },
  { slug: "financeiro", rotulo: "Financeiro", descricao: "Tesouraria, conciliação bancária e ordem cronológica de pagamentos." },
  { slug: "patrimonio", rotulo: "Patrimônio", descricao: "Bens, almoxarifado, dívida consolidada e provisões." },
  { slug: "licitacoes", rotulo: "Licitações e Contratos", descricao: "Processos, contratos, aditivos e obras." },
  { slug: "contabilidade", rotulo: "Contabilidade", descricao: "Plano de contas PCASP e os lançamentos de partidas dobradas que sustentam os livros." },
  { slug: "relatorios", rotulo: "Relatórios", descricao: "Livros obrigatórios, balanços, RREO e demonstrativos fiscais." },
  {
    slug: "transparencia",
    rotulo: "Transparência",
    descricao: "Datasets do portal e exports federais (MSC, MANAD).",
    // A landing INTERNA da área. O endereço público `/transparencia` é o portal do cidadão.
    rota: "/administracao/transparencia",
  },
  { slug: "protocolo", rotulo: "Protocolo", descricao: "Processos digitais: abertura, tramitação entre setores, parecer, readequação, encerramento e arquivamento." },
  { slug: "comunicacao", rotulo: "Comunicação interna", descricao: "Memorandos, ofícios e circulares, com caixas, leitura registrada e assinatura por tipo." },
  { slug: "cadastros", rotulo: "Cadastros", descricao: "Pessoas e credores: o cadastro compartilhado que a despesa, as consignações e a folha usam." },
  { slug: "transferencias", rotulo: "Transferências", descricao: "Convênios de repasse e consórcios públicos — o dinheiro que sai do ente para outro, e o que entra por termo." },
  { slug: "divida", rotulo: "Dívida e precatórios", descricao: "Dívida fundada, precatórios judiciais e a ordem do art. 100 da Constituição." },
  { slug: "controle-interno", rotulo: "Controle interno", descricao: "Auditorias, checklist com base legal, irregularidades e o relatório circunstanciado (CF art. 74)." },
  { slug: "administracao", rotulo: "Administração", descricao: "Usuários, perfis, permissões e registro de operações." },
  { slug: "integracoes", rotulo: "Integrações", descricao: "Central de integrações: SAGRES TXT/JSON, Banco do Brasil e API TCE-PB." },
  { slug: "suporte", rotulo: "Suporte", descricao: "Canais de atendimento e prazos de resposta contratados." },
  { slug: "pessoal", rotulo: "Pessoal", descricao: "Servidores, vínculos e histórico funcional; cargos e lotações do quadro. Cargo, lotação e salário são derivados dos eventos." },
  { slug: "folha", rotulo: "Folha", descricao: "Folha de pagamento: tabelas do ente, rubricas, lançamentos, cálculo com memória por servidor e fechamento." },
  { slug: "portal-do-servidor", rotulo: "Portal do Servidor", descricao: "O que é SEU: vínculos, dependentes e contracheques das folhas fechadas — recortado pela pessoa da sessão." },
  { slug: "meus-servicos", rotulo: "Meus serviços", descricao: "O que você pediu pela carta de serviços — por si ou pela empresa que representa: situação, exigências, documentos e decisão." },
  // ⚠️ V10 T1 — A ÁREA DO FORNECEDOR. Ela aparece no menu de quem tem `CONSULTAR_LICENCIAMENTO`,
  // e ninguém do município tem: a ação é reservada (`ACOES_DO_FORNECEDOR`, M16). Está em AREAS
  // porque o menu deriva daqui — uma tela fora do mapa seria uma rota que a navegação não conhece.
  { slug: "licenciamento", rotulo: "Contrato e módulos", descricao: "O contrato comercial desta implantação: módulos habilitados, vigências, suspensões e o histórico de cada mudança." },
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
  { href: "/relatorios/rreo/anexo6", numero: "Anexo 6", rotulo: "Resultado Primário e Nominal", descricao: "O ente se paga? Receitas e despesas sem a dívida, em caixa (LRF art. 53, III)." },
  { href: "/relatorios/rreo/anexo7", numero: "Anexo 7", rotulo: "Restos a Pagar por Poder e Órgão", descricao: "RP processados e não processados (LRF art. 53, V)." },
  { href: "/relatorios/rreo/anexo8", numero: "Anexo 8", rotulo: "Educação (MDE)", descricao: "Mínimo de 25% e FUNDEB (CF art. 212/212-A)." },
  { href: "/relatorios/rreo/anexo11", numero: "Anexo 11", rotulo: "Alienação de Ativos", descricao: "Receitas de alienação e aplicação dos recursos (LRF art. 53 §1º III)." },
  { href: "/relatorios/rreo/anexo12", numero: "Anexo 12", rotulo: "Saúde (ASPS)", descricao: "Aplicação mínima de 15% em saúde (LC 141/2012)." },
  { href: "/relatorios/rreo/anexo13", numero: "Anexo 13", rotulo: "Parcerias Público-Privadas", descricao: "Contratos de PPP e o teto de 5% da RCL (Lei 11.079/2004)." },
  { href: "/relatorios/rreo/anexo14", numero: "Anexo 14", rotulo: "Demonstrativo Simplificado", descricao: "A capa do RREO: balanço, resultados, restos a pagar, mínimos e RCL — consolidados dos anexos (LRF art. 48)." },
];

/** Os RGF já implementados — fonte única da landing e do submenu. */
export const RELATORIOS_RGF: readonly RelatorioNav[] = [
  { href: "/relatorios/rgf/anexo1", numero: "Anexo 1", rotulo: "Despesa com Pessoal", descricao: "Limite de pessoal por Poder (LRF art. 55, I, 'a'; art. 20)." },
  { href: "/relatorios/rgf/anexo2", numero: "Anexo 2", rotulo: "Dívida Consolidada Líquida", descricao: "DCL sobre a RCL ajustada — limite de 120% do Senado e alerta de 108% (LRF art. 55, I, 'b')." },
  { href: "/relatorios/rgf/anexo3", numero: "Anexo 3", rotulo: "Garantias e Contragarantias", descricao: "Garantias concedidas sobre a RCL ajustada — limite de 22% do Senado e alerta de 19,8% (LRF art. 55, I, 'c')." },
  { href: "/relatorios/rgf/anexo4", numero: "Anexo 4", rotulo: "Operações de Crédito", descricao: "Operações de crédito realizadas — limite de 16% da RCL e alerta de 14,4% (LRF art. 55, I, 'd')." },
  { href: "/relatorios/rgf/anexo5", numero: "Anexo 5", rotulo: "Disponibilidade de Caixa e RP", descricao: "O que sobra em cada fonte — e se o ente pode inscrever restos a pagar (LRF art. 55, III, 'a')." },
  { href: "/relatorios/rgf/anexo6", numero: "Anexo 6", rotulo: "Demonstrativo Simplificado", descricao: "A capa da gestão fiscal: pessoal, dívida, garantias e operações de crédito — consolidados dos anexos (LRF art. 48)." },
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
  { href: "/despesa/empenhos", numero: "Empenhos", rotulo: "Empenhos", descricao: "Empenhado, liquidado, pago e saldos por empenho." },
  { href: "/despesa/liquidacoes", numero: "Liquidações", rotulo: "Liquidações", descricao: "O marco de exigibilidade da despesa, com o empenho de origem." },
  { href: "/despesa/ordens", numero: "Ordens de pagamento", rotulo: "Ordens de Pagamento", descricao: "Preparar, autorizar, registrar e conferir — as quatro etapas, cada uma com o seu estado real." },
  { href: "/despesa/pagamentos", numero: "Fila de pagamentos", rotulo: "Fila de Pagamentos", descricao: "Ordem cronológica por fonte e categoria (Lei 14.133/2021, art. 141)." },
  { href: "/despesa/ordem-cronologica", numero: "Ordem cronológica", rotulo: "Ordem Cronológica", descricao: "O painel da Lei 14.133: posição, credor, empenho e saldo a pagar, com filtro por fonte (art. 141)." },
  // ⚠️ RESTOS A PAGAR MORA NA DESPESA, e não em "Relatórios": a inscrição é despesa de
  // exercício anterior que continua a ser executada — liquidada, paga, cancelada. O Anexo 7 do
  // RREO LÊ essa posição, mas ler um demonstrativo fiscal não é operar a obrigação.
  { href: "/despesa/restos-a-pagar", numero: "Restos a pagar", rotulo: "Restos a Pagar", descricao: "Despesa inscrita de exercícios anteriores: inscrito, liquidado, pago, cancelado e saldo por inscrição, com liquidação, pagamento, cancelamento e anulações." },
  // ⚠️ A ASSINATURA MORA NA DESPESA, e não em "Documentos": a pergunta é "a nota de
  // empenho está assinada?", e quem a faz é quem executa a despesa. A FILA, essa sim, é a
  // do ENT02 — reusada, não recriada.
  { href: "/despesa/assinaturas", numero: "Assinaturas", rotulo: "Assinatura dos Documentos", descricao: "Empenho, liquidação e ordem de pagamento na fila de assinaturas — ordenada, e só conclui com todos." },
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
  { href: "/licitacoes/processos", numero: "Processos", rotulo: "Processos licitatórios", descricao: "Número, modalidade, objeto e valor licitado; homologação, reserva de dotação e contrato no detalhe." },
  { href: "/licitacoes/fiscalizacao", numero: "Fiscalização", rotulo: "Fiscalização de contratos", descricao: "Os contratos em que você é gestor, fiscal ou recebedor designado; os administradores da fiscalização." },
  { href: "/licitacoes/contratos", numero: "Contratos", rotulo: "Contratos e aditivos", descricao: "Valor e vigência derivados dos aditivos; estorno de aditivo; os empenhos que informaram o contrato." },
  { href: "/licitacoes/solicitacoes", numero: "Solicitações", rotulo: "Solicitações de compra", descricao: "A requisição ao Compras, com itens; autorizar e anular são fatos com data e motivo." },
  { href: "/licitacoes/pesquisas-de-precos", numero: "Preços", rotulo: "Pesquisas de preços", descricao: "Planilha de preços por item e fornecedor; média, mínimo e máximo derivados." },
  { href: "/licitacoes/ordens-de-compra", numero: "Ordens", rotulo: "Ordens de compra", descricao: "Ordinária, global ou estimativa, com itens; o recebimento por item e o saldo a receber derivado." },
  { href: "/licitacoes/documentos-fiscais", numero: "Notas", rotulo: "Documentos fiscais recebidos", descricao: "Nota, recibo ou CT-e do fornecedor, com itens; conferência e cancelamento são fatos. Registrar não liquida." },
  { href: "/licitacoes/obras", numero: "Obras", rotulo: "Obras e medições", descricao: "Cadastro de obras (IN/INSS/DC 100/2003) e as medições que autorizam liquidar." },
];

export const PLANEJAMENTO: readonly RelatorioNav[] = [
  // V4 §8 (M02b): as peças que vêm ANTES da LOA.
  { href: "/planejamento/ppa", numero: "PPA", rotulo: "Plano Plurianual", descricao: "O quadriênio e a lei que o instituiu; programas, indicadores, ações e a receita do plano (CF art. 165 §1º)." },
  { href: "/planejamento/ldo", numero: "LDO", rotulo: "Lei de Diretrizes Orçamentárias", descricao: "O trâmite da LDO, as prioridades e os anexos da LRF (metas e riscos fiscais) em PDF." },
  { href: "/planejamento/ppa/estrutura", numero: "Estrutura", rotulo: "Estrutura temática do PPA", descricao: "Eixos, áreas temáticas, públicos-alvo e macroações — o rol do ente." },
  { href: "/planejamento/fichas", numero: "Fichas", rotulo: "Fichas orçamentárias", descricao: "A dotação pela chave completa; criar ficha nova (sem crédito — a dotação vem de crédito adicional)." },
  { href: "/planejamento/qdd", numero: "QDD", rotulo: "Quadro de Detalhamento da Despesa", descricao: "A dotação de cada ficha pela chave completa: inicial, créditos e dotação atualizada." },
  { href: "/planejamento/cmd-mba", numero: "CMD/MBA", rotulo: "Programação Financeira (CMD/MBA)", descricao: "Cronograma mensal de desembolso e metas bimestrais de arrecadação (LRF art. 8º e 13)." },
  { href: "/planejamento/creditos-adicionais", numero: "Créditos adicionais", rotulo: "Créditos Adicionais", descricao: "Leis autorizadoras e decretos de suplementação e anulação, com o teto da lei." },
  { href: "/planejamento/recursos-novos", numero: "Recurso novo", rotulo: "Disponibilidade de Recurso Novo", descricao: "O lastro do crédito sem anulação: superávit financeiro, excesso de arrecadação e operação de crédito, por fonte (art. 43 § 1º)." },
  { href: "/planejamento/reprevisao", numero: "Reprevisão", rotulo: "Reprevisão da Receita", descricao: "Revisão da previsão de arrecadação ao longo do exercício (LRF art. 12)." },
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
  { href: "/financeiro/consignacoes", numero: "Consignações", rotulo: "Consignações", descricao: "Em que conta do plano a retenção na fonte vira dívida com o consignatário — decisão contábil do ente, com fundamento e histórico. Sem conta decidida, a consignação não é oferecida no pagamento." },
  { href: "/financeiro/extraorcamentario", numero: "Extraorçamentário", rotulo: "Extraorçamentário", descricao: "Consignações, retenções na fonte e recolhimentos — o dinheiro de terceiros no caixa." },
  { href: "/financeiro/conciliacao", numero: "Conciliação", rotulo: "Conciliação Bancária", descricao: "Extrato do banco × razão: correspondências, pendências dos dois lados e a diferença toda nomeada." },
  // ⚠️ A CONCILIAÇÃO POR PERÍODO é entrada PRÓPRIA, e não uma aba da de cima. São duas
  // perguntas diferentes: aquela responde "como está agora?"; esta responde "qual foi a
  // conciliação de junho, quem a encerrou, e o que ela deixou para julho?". Foi a
  // distinção que o ADR de 2026-09-10 registrou — e esconder a segunda dentro da primeira
  // faria o fechamento parecer um detalhe de uma tela de consulta.
  { href: "/financeiro/conciliacao/periodo", numero: "Períodos", rotulo: "Conciliação por período", descricao: "Abrir, justificar o que fica em aberto e encerrar — o período seguinte herda o não resolvido, por referência." },
  { href: "/financeiro/movimentacao", numero: "Movimentação", rotulo: "Movimentação Bancária", descricao: "Depósito, saque, aplicação, resgate, rendimento e tarifa — com saldo por fonte no momento da operação." },
  { href: "/financeiro/lotes", numero: "Lotes", rotulo: "Lotes e Borderô", descricao: "Agrupar ordens autorizadas, fechar, gerar o borderô assinável e baixar pelo retorno do banco." },
];

/**
 * A CONTABILIDADE — o plano de contas e o razão por trás dos livros.
 *
 * ⚠️ Área PRÓPRIA, e não um item de "Relatórios": os livros são a SAÍDA formatada; estas duas telas
 * são a BASE (o plano que classifica e os lançamentos que registram). Quem audita chega por aqui.
 */
export const CONTABILIDADE: readonly RelatorioNav[] = [
  { href: "/contabilidade/roteiros-orcamentarios", numero: "Roteiro orçamentário", rotulo: "Roteiro orçamentário", descricao: "Em que contas do plano cada movimento de dotação lança — dotação inicial, crédito adicional por tipo, anulação, reserva. Decisão contábil do ente, versionada e com fundamento; sem roteiro o movimento é recusado." },
  { href: "/contabilidade/roteiros-de-restos-a-pagar", numero: "Contas dos restos a pagar", rotulo: "Contas dos restos a pagar", descricao: "Em que contas cada ato de restos a pagar lança — liquidação do não processado, pagamento, cancelamento do processado e do não processado. Versionada e com motivo registrado; operação sem contas informadas é recusada." },
  // V11 V9.3 — irmã do roteiro orçamentário, e pela mesma razão: o plano parte 7.2.1.1 por
  // natureza do recurso, e quem diz de que natureza é cada fonte do município é o ente. Sem esta
  // tela a arrecadação era impossível em instalação nova.
  { href: "/contabilidade/natureza-das-fontes", numero: "Natureza das fontes", rotulo: "Natureza das fontes", descricao: "De que natureza é cada fonte de recurso — ordinária, vinculada, extraorçamentária, de compensação financeira ou outra. É ela que diz em qual conta do controle da disponibilidade a arrecadação entra; fonte sem natureza declarada tem a arrecadação recusada." },
  { href: "/contabilidade/plano-de-contas", numero: "Plano de contas", rotulo: "Plano de Contas PCASP", descricao: "As contas por classe, com natureza do saldo e a posição de cada uma (STN/PCASP)." },
  { href: "/contabilidade/lancamentos", numero: "Lançamentos", rotulo: "Lançamentos Contábeis", descricao: "As partidas dobradas, com nº de controle, histórico e o caminho até o documento de origem." },
  // V11 V3.1 — o número que autoriza crédito adicional por superávit existia só dentro da recusa
  // do guard; aqui ele pode ser perguntado ANTES de o decreto ser escrito.
  { href: "/contabilidade/superavit", numero: "Superávit", rotulo: "Superávit financeiro por fonte", descricao: "O apurado nos fatos, o declarado, o já utilizado em créditos e o que ainda cabe, fonte a fonte." },
];

/** Os relatórios GERENCIAIS — consulta livre com export aberto (TR 7.48). */
export const RELATORIOS_GERENCIAIS: readonly RelatorioNav[] = [
  { href: "/relatorios/gerenciais", numero: "Gerenciais", rotulo: "Relatórios Gerenciais", descricao: "Consulta de empenhos com filtro por credor e fonte, exportável em PDF e CSV." },
];

/** A EXECUÇÃO DA RECEITA — fonte única da landing de /receita e do submenu. */
export const EXECUCAO_RECEITA: readonly RelatorioNav[] = [
  { href: "/receita/arrecadacoes", numero: "Arrecadação", rotulo: "Arrecadação", descricao: "Guias do exercício e receita realizada líquida." },
  // V7 B1 — a primeira unidade tributária: cadastrar, parametrizar e SIMULAR (sem lançar nem constituir dívida).
  { href: "/receita/imoveis", numero: "Imóveis", rotulo: "Cadastro imobiliário", descricao: "Imóveis com histórico de cadastro, pessoas vinculadas e simulação com memória." },
  { href: "/receita/parametros-tributarios", numero: "Parâmetros", rotulo: "Parâmetros do tributo", descricao: "A fórmula e os valores do município, por exercício e vigência, com fundamento." },
];

/** As páginas de ADMINISTRAÇÃO — fonte única da landing e do submenu. */
export const ADMINISTRACAO: readonly RelatorioNav[] = [
  { href: "/administracao/usuarios", numero: "Usuários", rotulo: "Usuários", descricao: "Identidades, estado e perfis." },
  { href: "/administracao/perfis", numero: "Perfis", rotulo: "Perfis e Permissões", descricao: "O que cada perfil concede — o censo do M16." },
  { href: "/administracao/auditoria", numero: "Auditoria", rotulo: "Auditoria", descricao: "Registro de operações da borda." },
  { href: "/administracao/senha", numero: "Senha", rotulo: "Trocar Senha", descricao: "Troca a própria senha — revoga as sessões abertas." },
  { href: "/administracao/apresentacao", numero: "Apresentação", rotulo: "Apresentação do ente", descricao: "Nome de exibição, imagem institucional, contatos, tema e canais — versionado, com autor." },
  { href: "/administracao/sistema", numero: "Sistema", rotulo: "Sobre o sistema", descricao: "Proveniência do build, ambiente e as atualizações de permissões instaladas." },
];

/**
 * PORTAL DO SERVIDOR (V6 P2.4) — fonte única da landing e do submenu.
 *
 * ⚠️ UMA ENTRADA SÓ, e é decisão: tudo o que o servidor vê de si mesmo cabe numa página (ficha,
 * dependentes, contracheques). Um submenu com três itens que levam a três recortes do mesmo dado
 * seria menu para parecer sistema.
 */
export const PORTAL_DO_SERVIDOR: readonly RelatorioNav[] = [
  { href: "/portal-do-servidor", numero: "Minha ficha", rotulo: "Minha ficha e meus contracheques", descricao: "Seus vínculos com cargo, lotação e situação de hoje, seus dependentes e os contracheques das folhas já fechadas." },
];

/**
 * MEUS SERVIÇOS (V6.2 P3) — o acompanhamento do requerente. A carta em si é pública (`/servicos`),
 * fora da área autenticada; aqui mora só o que é da pessoa da sessão ou de quem ela representa hoje.
 */
export const MEUS_SERVICOS: readonly RelatorioNav[] = [
  { href: "/meus-servicos", numero: "Solicitações", rotulo: "Minhas solicitações", descricao: "Os pedidos protocolados por você ou pela empresa que você representa, com a situação, as exigências e a decisão." },
  { href: "/servicos", numero: "Carta", rotulo: "Carta de serviços", descricao: "Os serviços que o ente oferece, com requisitos, documentos, prazo e fundamento — e o formulário para pedir." },
];

/** FOLHA (M33) — fonte única da landing e do submenu. */
export const FOLHA: readonly RelatorioNav[] = [
  { href: "/folha/folhas", numero: "Folhas", rotulo: "Folhas de pagamento", descricao: "A folha de cada competência: cálculo numerado com memória por servidor, cancelamento e fechamento como fatos." },
  { href: "/folha/rubricas", numero: "Rubricas", rotulo: "Rubricas", descricao: "Proventos e descontos: natureza, incidências e proporcionalidade aos dias." },
  { href: "/folha/lancamentos", numero: "Lançamentos", rotulo: "Lançamentos", descricao: "Valores fixos (por vigência) e variáveis (por competência) informados por matrícula." },
  { href: "/folha/tabelas", numero: "Tabelas", rotulo: "Tabelas do ente", descricao: "Contribuição previdenciária por regime, IRRF e salário-família, vigentes por competência, com a fundamentação legal." },
  { href: "/folha/parametros-do-13", numero: "13º", rotulo: "Parâmetros do 13º", descricao: "Por exercício: quantos dias fazem um mês contar um avo, quantos avos tem o ano, o percentual da 1ª parcela, se o 13º sofre contribuição e imposto, e quais rubricas compõem a base — com o ato que fundamenta, por número, ano e dispositivo. Sem parâmetro, a folha de 13º recusa calcular." },
  { href: "/folha/parametros-do-adiantamento-salarial", numero: "Vale", rotulo: "Parâmetros do adiantamento salarial", descricao: "Por competência: o percentual do vale, sobre que base ele incide (a remuneração do mês anterior ou a projetada do próprio mês), qual rubrica paga e qual abate na folha mensal, e qual estado o vale precisa ter alcançado para ser abatido — fechado, certificado ou pago. Com o ato que fundamenta, por número, ano e dispositivo. Sem parâmetro, a folha de adiantamento salarial recusa calcular." },
  { href: "/folha/grupos-de-empenho", numero: "Grupos de empenho", rotulo: "Grupos de empenho", descricao: "Como a folha vira despesa: quais rubricas empenham em qual ficha, e se o empenho é por servidor ou um só para o grupo." },
  { href: "/folha/encargos", numero: "Encargos", rotulo: "Encargos do empregador", descricao: "Os encargos que o ente deve sobre a folha, por regime: versões com alíquota, base, teto e fundamento, aprovadas por outra pessoa." },
  { href: "/folha/designacoes", numero: "Designações", rotulo: "Designações para o atesto", descricao: "Quem o ente designou para certificar a folha, por qual ato administrativo e até quando. Sem designação vigente, o atesto recusa." },
  { href: "/folha/esocial", numero: "eSocial", rotulo: "Consistência para o eSocial", descricao: "O que o cadastro ainda não tem para atender o leiaute registrado do eSocial. Não gera, não assina e não transmite arquivo: sem o leiaute oficial obtido, a consulta recusa e diz o que falta." },
];

/** PESSOAL (M32) — fonte única da landing e do submenu. */
export const PESSOAL: readonly RelatorioNav[] = [
  { href: "/pessoal/servidores", numero: "Servidores", rotulo: "Servidores", descricao: "A ficha do servidor sobre a pessoa do cadastro único; vínculos com cargo, lotação e salário derivados dos eventos." },
  { href: "/pessoal/cargos", numero: "Cargos", rotulo: "Cargos", descricao: "O quadro: vagas fixadas em lei e vagas ocupadas contadas a cada leitura." },
  { href: "/pessoal/funcoes", numero: "Funções", rotulo: "Funções", descricao: "A atribuição EXERCIDA, distinta do cargo: designada e dispensada por movimentação, com data de efeito." },
  { href: "/pessoal/lotacoes", numero: "Lotações", rotulo: "Lotações", descricao: "A árvore de lotações, com a unidade orçamentária quando houver." },
];

/** Os CADASTROS BASE — fonte única da landing e do submenu. */
/** O PROTOCOLO — fonte única da landing e do submenu. */
export const PROTOCOLO: readonly RelatorioNav[] = [
  { href: "/protocolo/processos", numero: "Processos", rotulo: "Processos digitais", descricao: "Abertura, tramitação entre setores, parecer, readequação, encerramento e arquivamento — com a situação derivada dos movimentos." },
  { href: "/protocolo/solicitacoes", numero: "Solicitações", rotulo: "Mesa das solicitações", descricao: "Os pedidos que chegaram pela carta de serviços: quantos aguardam recebimento, análise, resposta do requerente e decisão, por setor." },
  { href: "/protocolo/ouvidoria", numero: "Ouvidoria", rotulo: "Mesa da ouvidoria", descricao: "Manifestações recebidas sem conta: triagem interna, resposta ao manifestante pelo código de acompanhamento e encerramento. Sigilosas." },
  { href: "/protocolo/acesso-a-informacao", numero: "Acesso à informação", rotulo: "Acesso à informação", descricao: "O prazo que o ente promete a quem pede informação, a norma federal que o fixa e a regulamentação local, versionados por vigência. Sem configuração publicada, o pedido corre e o sistema não promete data." },
  { href: "/protocolo/acesso-a-informacao/pedidos", numero: "Pedidos de acesso", rotulo: "Pedidos de acesso à informação", descricao: "O rito de cada pedido: para onde foi, o prazo pela norma que valia quando ele entrou, prorrogação motivada, resposta classificada e recurso. O que o requerente lê fica separado do que instrui o processo." },
  { href: "/protocolo/avaliacoes", numero: "Avaliações", rotulo: "Avaliação dos serviços", descricao: "A escala e o método em versões, e a moderação das avaliações por abuso ou dado pessoal, com motivo." },
  { href: "/protocolo/guiches", numero: "Guichês", rotulo: "Atendimento presencial", descricao: "Unidades, guichês, o que cada um atende e a oferta de horários com capacidade. Um horário só existe se tiver sido publicado — não há expediente padrão. Separada da agenda da fiscalização." },
  { href: "/protocolo/servicos", numero: "Carta", rotulo: "Carta de serviços", descricao: "O que o ente oferece ao público: serviço, versão do formulário, prazo com fundamento e as etapas copiadas do roteiro real." },
  { href: "/consulta", numero: "Consulta", rotulo: "Acompanhar processo", descricao: "Consulta pelo número e pelo código verificador, SEM SENHA — fora da área autenticada, porque quem a usa é o requerente." },
];

/** A COMUNICAÇÃO INTERNA — fonte única da landing e do submenu. */
export const COMUNICACAO: readonly RelatorioNav[] = [
  { href: "/comunicacao/comunicados", numero: "Comunicados", rotulo: "Memorandos, ofícios e circulares", descricao: "Caixas de entrada, saída, rascunhos, favoritos e arquivados — calculadas para quem olha." },
];

export const CADASTROS: readonly RelatorioNav[] = [
  { href: "/cadastros/pessoas", numero: "Pessoas", rotulo: "Pessoas e Credores", descricao: "Uma pessoa, vários papéis. Cadastro append-only: alterar cria versão, e o histórico fica." },
  { href: "/cadastros/representacoes", numero: "Representações", rotulo: "Representações", descricao: "Quem age em nome de uma pessoa jurídica: a conta de uma pessoa física, o documento que fundamenta, a vigência e a revogação." },
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
  { href: "/relatorios/designer", numero: "Designer", rotulo: "Modelos do usuário", descricao: "Relatórios desenhados pela entidade, com campos calculados por gramática segura e execução em segundo plano." },
];

/** Os livros obrigatórios com página — fonte única da landing. */
export const RELATORIOS_LIVROS: readonly RelatorioNav[] = [
  { href: "/relatorios/livros/diario", numero: "Diário", rotulo: "Livro Diário", descricao: "Todos os lançamentos, em ordem cronológica estável." },
  { href: "/relatorios/livros/razao", numero: "Razão", rotulo: "Razão Analítico", descricao: "O razão de uma conta, com saldo corrente linha a linha." },
  { href: "/relatorios/livros/balancete", numero: "Balancete", rotulo: "Balancete de Verificação", descricao: "Saldo e movimento por conta; prova que ΣD = ΣC (art. 50)." },
  { href: "/relatorios/consistencia", numero: "Consistência", rotulo: "Relatório de Consistência", descricao: "As identidades dos demonstrativos, conferidas num lugar só — o diagnóstico pré-envio." },
  { href: "/relatorios/atualizacoes-orcamentarias", numero: "Atualizações", rotulo: "Atualizações Orçamentárias", descricao: "Todo movimento de crédito adicional, por ficha, decreto, fonte e UG." },
];

/**
 * AS DEMONSTRAÇÕES CONTÁBEIS anuais da Lei 4.320 — fonte única da landing.
 *
 * Não confundir com os anexos do RREO/RGF: aqueles são o recorte bimestral/quadrimestral da STN,
 * com funções próprias. Estes quatro são os demonstrativos dos arts. 102 a 105 e a DVP.
 */
export const RELATORIOS_DEMONSTRACOES: readonly RelatorioNav[] = [
  { href: "/relatorios/demonstracoes/balanco-orcamentario", numero: "Anexo 12", rotulo: "Balanço Orçamentário", descricao: "Receita prevista e realizada, despesa fixada e executada (art. 102)." },
  { href: "/relatorios/demonstracoes/balanco-financeiro", numero: "Anexo 13", rotulo: "Balanço Financeiro", descricao: "Ingressos e dispêndios por fonte, e o saldo em espécie (art. 103)." },
  { href: "/relatorios/demonstracoes/balanco-patrimonial", numero: "Anexo 14", rotulo: "Balanço Patrimonial", descricao: "Ativo, passivo e patrimônio líquido, com o quadro do art. 105." },
  { href: "/relatorios/demonstracoes/variacoes-patrimoniais", numero: "Anexo 15", rotulo: "Variações Patrimoniais", descricao: "Variações aumentativas e diminutivas, e o resultado patrimonial." },
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
  { href: "/transferencias/convenios", numero: "Convênios", rotulo: "Convênios de Repasse", descricao: "Termos em que o ente concede ou recebe: saldo a liberar, pendente de prestação de contas e glosado, cada um a sua conta." },
  { href: "/transferencias/consorcios", numero: "Consórcios", rotulo: "Consórcios Públicos", descricao: "Rateio anual, aditivos e repasses — o repasse só acontece dentro do contrato do exercício." },
];

export const DIVIDA: readonly RelatorioNav[] = [
  { href: "/divida/precatorios", numero: "Precatórios", rotulo: "Precatórios Judiciais", descricao: "A fila do art. 100: alimentar antes de comum, a preferência do §2º, depois a data de apresentação." },
  { href: "/divida/fundada", numero: "Dívida fundada", rotulo: "Dívida Fundada", descricao: "A dívida consolidada da LRF: ingresso pela receita, amortização pela despesa, e só a atualização monetária nasce no cadastro." },
  { href: "/divida/ativa", numero: "Dívida ativa", rotulo: "Dívida Ativa", descricao: "O crédito do ente contra o contribuinte (art. 39 da Lei 4.320/64): inscrição, atualização, cancelamento — o recebimento entra pela receita." },
];

/**
 * ⚠️ ENT06 — O ALMOXARIFADO FÍSICO GANHOU TELA. Até aqui a seção 5.18 tinha modelo, caso de
 * uso e teste contra banco, e nenhuma rota: existia no servidor e nenhum servidor municipal
 * a alcançava. Estas quatro entradas são o que muda isso — e entram AQUI, numa lista só,
 * porque é dela que saem ao mesmo tempo o hub da área e o índice da busca global.
 */
export const ALMOXARIFADO: readonly RelatorioNav[] = [
  { href: "/patrimonio/almoxarifado/classes", numero: "Classes", rotulo: "Classes de Material", descricao: "A amarração entre o eixo físico e o contábil: é a classe que diz em que conta de estoque a entrada e a saída batem no razão." },
  { href: "/patrimonio/almoxarifado/grupos", numero: "Grupos", rotulo: "Grupos de Material", descricao: "A árvore que organiza o catálogo — um grupo pode ter grupo pai, e é assim que 'Expediente' fica dentro de 'Consumo'." },
  { href: "/patrimonio/almoxarifado/unidades", numero: "Unidades", rotulo: "Unidades de Medida", descricao: "A medida em que o saldo é contado. Sem ela o material não se cadastra: somar caixas com unidades produz um número sem significado." },
  { href: "/patrimonio/almoxarifado/materiais", numero: "Materiais", rotulo: "Materiais", descricao: "Unidade de estoque, grupo, classe contábil e CATMAT — mais o mínimo e o máximo por depósito. O saldo não mora aqui: ele é derivado dos movimentos." },
  { href: "/patrimonio/almoxarifado/depositos", numero: "Depósitos", rotulo: "Depósitos", descricao: "Onde o material fica, sob qual unidade gestora e com qual responsável — e os bloqueios que recusam movimentação enquanto vigem." },
  { href: "/patrimonio/almoxarifado/estoque", numero: "Posição", rotulo: "Posição de Estoque", descricao: "Quanto havia de cada material, num depósito, NUMA DATA — com preço médio, mínimo e máximo, e os lotes vencidos e a vencer. É a pergunta que refuta uma coluna de saldo: coluna só sabe responder 'agora'." },
  { href: "/patrimonio/almoxarifado/requisicoes", numero: "Requisições", rotulo: "Requisições de Material", descricao: "O setor pede, o almoxarifado atende — e o atendimento pode ser parcial. O que falta é a diferença entre o solicitado e as saídas vinculadas." },
  { href: "/patrimonio/almoxarifado/inventarios", numero: "Inventários", rotulo: "Inventários de Estoque", descricao: "Enquanto aberto, bloqueia a movimentação do depósito — é isso que torna a contagem comparável com a posição na data de abertura." },
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
  { href: "/patrimonio/localizacoes", numero: "Localizações", rotulo: "Localizações Físicas", descricao: "Onde o bem fica, em árvore: prédio, andar, sala — com o setor que responde pela guarda. É para cá que a transferência move o bem, e é por aqui que o inventário sabe onde procurar." },
  { href: "/patrimonio/motivos-de-baixa", numero: "Motivos", rotulo: "Motivos de Baixa", descricao: "Por que um bem sai do acervo: alienação, doação, inservível, furto. O rol é do ente e se cadastra aqui — não é uma lista fechada no sistema." },
  { href: "/patrimonio/tipos-de-incorporacao", numero: "Incorporação", rotulo: "Tipos de Incorporação", descricao: "Como o bem entrou: adquirido, doação, comodato, permuta. Doação e compra produzem lançamentos diferentes, e é o tipo que explica a entrada." },
];

/**
 * ⚠️ ENT07 — O ACERVO. Mesma razão das duas listas acima: é dela que saem, ao mesmo tempo, o
 * hub da área e o índice da busca global.
 *
 * A CLASSE vem antes do BEM na lista porque vem antes na prática: o formulário do bem pede
 * uma classe, e sem classe cadastrada o seletor nasce vazio.
 */
export const ACERVO: readonly RelatorioNav[] = [
  { href: "/patrimonio/classes-de-bens", numero: "Classes", rotulo: "Classes de Bens", descricao: "Como o acervo se agrupa — móveis e imóveis — e, para cada grupo, a conta do ativo em que os bens daquela classe são registrados na contabilidade." },
  { href: "/patrimonio/bens-patrimoniais", numero: "Acervo", rotulo: "Bens Patrimoniais", descricao: "O acervo bem a bem: o que é, em que classe entra, quando foi adquirido e como entrou. O valor não se informa aqui — ele vem dos movimentos patrimoniais." },
  { href: "/patrimonio/meus-bens", numero: "Meus bens", rotulo: "Bens sob minha responsabilidade", descricao: "Os bens pelos quais VOCÊ responde hoje — derivados do último movimento de responsável de cada bem, para o usuário vinculado a uma pessoa do cadastro." },
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
  { href: "/patrimonio/roteiros", numero: "Roteiros", rotulo: "Roteiros Contábeis do Patrimônio", descricao: "Em que par de contas do PCASP cada evento do bem bate na contabilidade — aquisição, reavaliação, depreciação, baixa. Evento sem roteiro não é registrado: o sistema recusa em vez de escolher a conta." },
  { href: "/patrimonio/roteiros-de-resultado", numero: "Resultado", rotulo: "Roteiros do Resultado da Alienação", descricao: "O ganho e a perda apurados na venda do bem. Não mexem no ativo — ele já saiu pela baixa —, e por isso têm roteiro separado dos eventos do bem." },
  { href: "/patrimonio/parametros-de-atualizacao", numero: "Parâmetros", rotulo: "Parâmetros de Depreciação", descricao: "Método, vida útil e valor residual de cada classe, em versões com autor, motivo e vigência. A competência processada guarda a memória de cálculo com a versão que usou." },
  { href: "/patrimonio/termos", numero: "Termos", rotulo: "Termos Patrimoniais", descricao: "O termo de responsabilidade (individual, setorial ou por responsável) e o de baixa. Emitir registra o movimento de cada bem; o papel sai em PDF pelo detalhe." },
  { href: "/patrimonio/competencia", numero: "Competência", rotulo: "Processamento por Competência", descricao: "A depreciação, amortização ou exaustão do mês, por classe: prévia com a memória de cálculo antes de lançar, e o histórico do que já foi processado." },
];

export const CONTROLE_INTERNO: readonly RelatorioNav[] = [
  { href: "/controle-interno/auditorias", numero: "Auditorias", rotulo: "Auditorias Internas", descricao: "Roteiro com base legal, achados com providência e prazo, e o relatório circunstanciado que se assina." },
];
