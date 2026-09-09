/**
 * O MAPA DE ÁREAS — a navegação do sistema, em RÓTULOS DO USUÁRIO, não códigos de módulo.
 *
 * ⚠️ O servidor público não sabe o que é "M05"; ele sabe o que é "Despesa". A sidebar agrupa por
 * ÁREA FUNCIONAL (a linguagem do ente), e o mapa módulo→área fica escondido aqui. É a mesma
 * disciplina do resto do sistema: a mensagem é para quem lê, não para quem escreveu.
 *
 * Esta é a ÚNICA fonte da estrutura de navegação — a sidebar e o breadcrumb derivam dela.
 */

export interface AreaNav {
  /** O segmento da rota (`/planejamento`). */
  readonly slug: string;
  readonly rotulo: string;
  /** Uma linha do que a área faz — vira o subtítulo da página placeholder. */
  readonly descricao: string;
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
  { slug: "transparencia", rotulo: "Transparência", descricao: "Datasets do portal e exports federais (MSC, MANAD)." },
  { slug: "administracao", rotulo: "Administração", descricao: "Usuários, perfis, permissões e registro de operações." },
  { slug: "integracoes", rotulo: "Integrações", descricao: "Central de integrações: SAGRES TXT/JSON, Banco do Brasil e API TCE-PB." },
  { slug: "suporte", rotulo: "Suporte", descricao: "Canais de atendimento e prazos de resposta contratados (TR 4.20.9)." },
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
  { href: "/despesa/empenhos", numero: "Empenhos", rotulo: "Empenhos", descricao: "Empenhado, liquidado, pago e saldos por empenho (TR 5.17)." },
  { href: "/despesa/liquidacoes", numero: "Liquidações", rotulo: "Liquidações", descricao: "O marco de exigibilidade da despesa, com o empenho de origem (TR 5.21)." },
  { href: "/despesa/pagamentos", numero: "Fila de pagamentos", rotulo: "Fila de Pagamentos", descricao: "Ordem cronológica por fonte e categoria (Lei 14.133/2021, art. 141)." },
  { href: "/despesa/ordem-cronologica", numero: "Ordem cronológica", rotulo: "Ordem Cronológica", descricao: "O painel da Lei 14.133: posição, credor, empenho e saldo a pagar, com filtro por fonte (art. 141)." },
];

/**
 * O PLANEJAMENTO — fonte única da landing de /planejamento e do submenu.
 *
 * ⚠️ QDD e CMD/MBA são LEITURA da LOA já registrada; créditos e reprevisão ESCREVEM. Ficam no mesmo
 * grupo porque o usuário do planejamento os percorre na mesma sessão de trabalho.
 */
export const PLANEJAMENTO: readonly RelatorioNav[] = [
  { href: "/planejamento/qdd", numero: "QDD", rotulo: "Quadro de Detalhamento da Despesa", descricao: "A dotação de cada ficha pela chave completa: inicial, créditos e dotação atualizada (TR 4.20–4.40)." },
  { href: "/planejamento/cmd-mba", numero: "CMD/MBA", rotulo: "Programação Financeira (CMD/MBA)", descricao: "Cronograma mensal de desembolso e metas bimestrais de arrecadação (LRF art. 8º e 13)." },
  { href: "/planejamento/creditos-adicionais", numero: "Créditos adicionais", rotulo: "Créditos Adicionais", descricao: "Decretos de suplementação e anulação, com o teto da lei (TR 4.20–4.40)." },
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
  { href: "/financeiro/extraorcamentario", numero: "Extraorçamentário", rotulo: "Extraorçamentário", descricao: "Consignações, retenções na fonte e recolhimentos — o dinheiro de terceiros no caixa (TR 5.39–5.49)." },
  { href: "/financeiro/conciliacao", numero: "Conciliação", rotulo: "Conciliação Bancária", descricao: "Extrato do banco × razão: correspondências, pendências dos dois lados e a diferença toda nomeada (TR 5.50–5.60)." },
];

/**
 * A CONTABILIDADE — o plano de contas e o razão por trás dos livros.
 *
 * ⚠️ Área PRÓPRIA, e não um item de "Relatórios": os livros são a SAÍDA formatada; estas duas telas
 * são a BASE (o plano que classifica e os lançamentos que registram). Quem audita chega por aqui.
 */
export const CONTABILIDADE: readonly RelatorioNav[] = [
  { href: "/contabilidade/plano-de-contas", numero: "Plano de contas", rotulo: "Plano de Contas PCASP", descricao: "As contas por classe, com natureza do saldo e a posição de cada uma (STN/PCASP)." },
  { href: "/contabilidade/lancamentos", numero: "Lançamentos", rotulo: "Lançamentos Contábeis", descricao: "As partidas dobradas, com nº de controle, histórico e o caminho até o documento de origem." },
];

/** Os relatórios GERENCIAIS — consulta livre com export aberto (TR 7.48). */
export const RELATORIOS_GERENCIAIS: readonly RelatorioNav[] = [
  { href: "/relatorios/gerenciais", numero: "Gerenciais", rotulo: "Relatórios Gerenciais", descricao: "Consulta de empenhos com filtro por credor e fonte, exportável em PDF e CSV (TR 7.48)." },
];

/** A EXECUÇÃO DA RECEITA — fonte única da landing de /receita e do submenu. */
export const EXECUCAO_RECEITA: readonly RelatorioNav[] = [
  { href: "/receita/arrecadacoes", numero: "Arrecadação", rotulo: "Arrecadação", descricao: "Guias do exercício e receita realizada líquida (TR 4.59)." },
];

/** As páginas de ADMINISTRAÇÃO — fonte única da landing e do submenu. */
export const ADMINISTRACAO: readonly RelatorioNav[] = [
  { href: "/administracao/usuarios", numero: "Usuários", rotulo: "Usuários", descricao: "Identidades, estado e perfis (TR 4.55)." },
  { href: "/administracao/perfis", numero: "Perfis", rotulo: "Perfis e Permissões", descricao: "O que cada perfil concede — o censo do M16 (TR 4.56)." },
  { href: "/administracao/auditoria", numero: "Auditoria", rotulo: "Auditoria", descricao: "Registro de operações da borda (TR 6.1-6.3)." },
  { href: "/administracao/senha", numero: "Senha", rotulo: "Trocar Senha", descricao: "Troca a própria senha — revoga as sessões abertas." },
];

/** Os livros obrigatórios com página — fonte única da landing. */
export const RELATORIOS_LIVROS: readonly RelatorioNav[] = [
  { href: "/relatorios/livros/diario", numero: "Diário", rotulo: "Livro Diário", descricao: "Todos os lançamentos, em ordem cronológica estável." },
  { href: "/relatorios/livros/razao", numero: "Razão", rotulo: "Razão Analítico", descricao: "O razão de uma conta, com saldo corrente linha a linha." },
  { href: "/relatorios/livros/balancete", numero: "Balancete", rotulo: "Balancete de Verificação", descricao: "Saldo e movimento por conta; prova que ΣD = ΣC (art. 50)." },
  { href: "/relatorios/consistencia", numero: "Consistência", rotulo: "Relatório de Consistência", descricao: "As identidades dos demonstrativos, conferidas num lugar só — o diagnóstico pré-envio (TR 5.128–5.131 · 7.27)." },
  { href: "/relatorios/atualizacoes-orcamentarias", numero: "Atualizações", rotulo: "Atualizações Orçamentárias", descricao: "Todo movimento de crédito adicional, por ficha, decreto, fonte e UG (TR 4.40)." },
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
  const seg = pathname.split("/").filter(Boolean)[0];
  if (seg === undefined) return null;
  return AREAS.find((a) => a.slug === seg) ?? null;
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
  const area = AREAS.find((a) => `/${a.slug}` === href);
  if (area !== null && area !== undefined) return area.rotulo;
  return ITENS_NAVEGAVEIS.find((i) => i.href === href)?.rotulo ?? null;
}
