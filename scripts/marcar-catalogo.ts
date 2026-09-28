import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * MARCA `situacao` E `evidencia` NO CATÁLOGO DE EXECUÇÃO — só para o que tem
 * COMPORTAMENTO, TESTE e EVIDÊNCIA.
 *
 * ═══ ⚠️ O PRÓPRIO CATÁLOGO JÁ AVISA, E O AVISO É A REGRA ═══
 *
 *     "Nenhuma clausula muda de situacao por este arquivo.
 *      Comentario de rastreio no codigo nao comprova atendimento."
 *
 * Por isso este arquivo é um SCRIPT com um mapa explícito, e não uma edição manual de
 * 1,1 MB de JSON. Três consequências, e as três importam:
 *
 *   · **cada marcação tem um autor visível** — a linha do mapa, com o arquivo de teste
 *     que a sustenta. Ninguém precisa procurar no diff de um JSON gigante;
 *   · **é idempotente e repetível** — rodar duas vezes dá o mesmo resultado, e rodar
 *     depois de um lote novo só acrescenta o que o lote novo trouxe;
 *   · **ele RECUSA marcação sem evidência.** Uma cláusula marcada com evidência vazia
 *     seria exatamente o que o aviso proíbe: situação sem prova.
 *
 * ═══ ⚠️ O QUE CADA SITUAÇÃO SIGNIFICA AQUI ═══
 * As seis são do próprio catálogo (`situacoes_validas`). O uso que este script faz:
 *
 *   · `VALIDADO_LOCALMENTE` — há teste automatizado **e** o caminho foi exercitado pela
 *     INTERFACE, num smoke de navegador. É o único nível que afirma "funciona de ponta a
 *     ponta nesta máquina";
 *   · `IMPLEMENTADO_NAO_VALIDADO` — há caso de uso e teste de módulo verdes, mas nenhuma
 *     tela exercita o caminho. O motor existe; a superfície não;
 *   · `PARCIAL` — parte do enunciado está atendida e parte não, e a evidência diz qual é
 *     qual;
 *   · `DEPENDENCIA_EXTERNA` — o caminho depende de provedor, convênio ou certificado que
 *     não existe neste ambiente, e o código RECUSA em vez de simular;
 *   · `AUSENTE_CONFIRMADO` — verificado e ausente, com pendência nomeada;
 *   · `NAO_VERIFICADO` — o default. Nada foi olhado, e ninguém deve supor.
 *
 * ⚠️ NA DÚVIDA, O NÍVEL MAIS BAIXO. Uma cláusula marcada acima do que se pode provar
 * inverte o propósito do catálogo: ele passa a esconder o que falta em vez de mostrar.
 *
 * Uso:  npx tsx scripts/marcar-catalogo.ts [--aplicar]
 *       (sem `--aplicar` ele só relata o que faria)
 */

/**
 * ⚠️ O CATÁLOGO MORA NA REPO, E O CAMINHO SAI DESTE ARQUIVO — não do diretório de onde o
 * comando foi chamado, e não de um caminho absoluto de uma máquina.
 *
 * Ele apontava para `/Users/.../gestao-publica-execucao/catalogo-execucao.json`: a MEDIDA
 * vivia fora do código que ela mede. Cada lote pedia dois commits em dois repositórios, e
 * um deles podia ficar para trás sem que nada reclamasse — o catálogo diria "validado" para
 * um commit que a repo não tem, ou o contrário.
 */
const CAMINHO =
  process.env["CATALOGO"] ??
  fileURLToPath(new URL("../docs/edital/catalogo-execucao.json", import.meta.url));

type Situacao =
  | "NAO_VERIFICADO"
  | "AUSENTE_CONFIRMADO"
  | "PARCIAL"
  | "IMPLEMENTADO_NAO_VALIDADO"
  | "VALIDADO_LOCALMENTE"
  | "DEPENDENCIA_EXTERNA";

interface Marca {
  readonly situacao: Situacao;
  readonly evidencia: string;
  /**
   * V4 (§7): a ROTA VERIFICADA, estruturada — papel, contexto, passos, entrada, resultado esperado, resultado
   * obtido, versão do código e artefato/teste. Uma rota dinâmica diz o padrão e como obter um alvo autorizado.
   * Em fonte de infraestrutura, evidência de infraestrutura (não se inventa tela para preencher o campo).
   */
  readonly rota_verificada?: string;
}

/** O smoke que exercita a cadeia do ENT02 pela interface — 43 passos, 0 falhas. */
const SMOKE = "scripts/smoke-ent02.ts (43 passos, 0 falhas, 2026-09-10)";

/**
 * O smoke do ENT03a — os QUATRO percursos da definição de concluído, pela interface, com
 * dado persistido e visível APÓS RECARGA. Duas execuções seguidas, ambas limpas.
 */
const SMOKE_03A = "scripts/smoke-ent03a.ts (28 passos, 0 falhas, 2026-09-10, duas execuções)";

/**
 * O smoke do ENT03b — o MOLDE, exercitado nos quatro cadastros que ele gera: listagem com
 * filtro/ordenação/soma da seleção, formulário de criação, detalhe com as CINCO abas e a
 * barra de ações. Duas execuções seguidas, ambas limpas.
 */
const SMOKE_03B = "scripts/smoke-ent03b.ts (40 passos, 0 falhas, 2026-09-11, duas execuções)";

/**
 * ═══ O MAPA ═══
 *
 * Cada linha é uma afirmação, e ela tem de ser defensável sozinha. A evidência aponta o
 * arquivo e o teste — não o módulo em geral.
 */
/**
 * O CENSO DO ENT03c — a varredura sistemática dos módulos existentes contra o catálogo.
 *
 * ⚠️ ELE NÃO É UMA LEITURA DE CÓDIGO. Cada marcação abaixo que afirma PRESENÇA cita o
 * teste que a sustenta, e todos rodaram no gate deste lote; cada marcação que afirma
 * AUSÊNCIA tem contraprova executável em `test/censo-de-ausencias.test.ts`, que quebra no
 * dia em que a coisa ausente nascer. "Código que existe não é comportamento provado" vale
 * nos dois sentidos: arquivo que falta também não é ausência provada.
 */
const CENSO = "Censo ENT03c (varredura sistemática módulo x catálogo):";

/**
 * ⚠️ O PERCURSO DO ENT06 — E É ELE QUE PROMOVE, NÃO O DESCRITOR.
 *
 * Uma tela gerada pelo molde compila, aparece no `next build` e pode estar inteiramente
 * quebrada: seletor que vem vazio, formulário que grava e lista que não mostra, aviso de
 * sucesso sem persistência. Nenhuma dessas falhas aparece no typecheck nem na suíte de
 * módulo — a suíte prova o DOMÍNIO, e o domínio já estava provado desde o ENT05.
 *
 * `VALIDADO_LOCALMENTE` aqui significa **este percurso exercitou o caminho inteiro pela
 * interface**, e nada menos.
 */
const PERCURSO_ENT06 = "scripts/smoke-ent06.ts (48 passos, 0 falhas, 2026-09-11):";

/**
 * ⚠️ O PERCURSO DOS PERFIS — e ele prova o que faltava para a 5.8.8 ser inteira.
 *
 * A cláusula pede controle de permissões "tanto por usuário quanto por grupo de usuários,
 * com definição das permissões". O ENFORCEMENT já estava provado desde o ENT03b; o que não
 * existia era a DEFINIÇÃO: conceder uma ação a um perfil só acontecia no bootstrap de
 * instalação (que recusa rodar em banco povoado) e num script de terminal. Um administrador
 * municipal não tem terminal.
 */
const PERCURSO_PERFIS = "scripts/smoke-perfis.ts (14 passos, 0 falhas, 2026-09-12):";

/**
 * ⚠️ O PERCURSO DA GESTÃO DO BEM — TRÊS TELAS ENTREGUES, **UMA** CLÁUSULA PROMOVIDA.
 *
 * A desproporção não é falha do lote: é o que o texto do edital diz, lido com honestidade.
 *
 * · Os MOTIVOS DE BAIXA fecham a 5.19.30 inteira — a cláusula pede "a inclusão de motivos de
 *   baixa do bem de acordo com a necessidade da instituição", e é isso, e só isso, que ela
 *   pede. O percurso inclui um pela tela e o encontra após recarga.
 * · Os TIPOS DE INCORPORAÇÃO **não** fecham a 5.19.3 nem a 5.19.7, porque o sujeito das duas
 *   é o CADASTRO DO BEM: "cadastrar bens ... classificando o seu tipo" e "para ser usado no
 *   cadastramento dos mesmos". A tabela configurável é metade da cláusula; a metade que falta
 *   é a tela do bem, que este lote não entregou.
 * · As LOCALIZAÇÕES FÍSICAS não fecham cláusula nenhuma. As quatro de 5.19 que dizem
 *   "localização" (14, 15, 20, 34) pedem CONSULTA, INVENTÁRIO e RELATÓRIO por localização —
 *   nunca o cadastro dela. Ela entra porque tudo o mais a pressupõe, não porque marque.
 *
 * Marcar as três confundiria superfície entregue com cláusula atendida, que é precisamente o
 * erro que este catálogo existe para não cometer.
 */
const PERCURSO_GESTAO_DO_BEM =
  "scripts/smoke-gestao-do-bem.ts (10 passos, 0 falhas, 2026-09-12):";

/**
 * ⚠️ O PERCURSO DO ACERVO — E ELE **EXERCITA** A INCORPORAÇÃO, NÃO SÓ A OFERECE.
 *
 * A primeira versão deste percurso cadastrava o bem sem escolher tipo de incorporação: o
 * select aparecia na tela e ninguém o usava. Isso prova que o formulário MONTOU, e não prova
 * o que as duas cláusulas pedem — "com a identificação do bem se adquirido, recebido em
 * doação, comodato, permuta" (5.19.3) e o tipo "para ser usado no cadastramento dos mesmos"
 * (5.19.7). Marcar assim seria marcar por dedução.
 *
 * O percurso passou a cadastrar o tipo na tela dele, escolhê-lo no formulário do bem, e
 * conferir que a listagem traz o bem COM a origem, depois de recarregada.
 *
 * ⚠️ O QUE ELE **NÃO** PROMOVE, E POR QUÊ — porque entregar duas telas não é atender tudo o
 * que as cita. A 5.19.14 pede consulta ao bem por LOCALIZAÇÃO e RESPONSÁVEL, e a listagem
 * filtra por tombamento, descrição e espécie: continua `AUSENTE_CONFIRMADO`. A 5.19.15 pede
 * movimentação, localização e baixa pela tela, que não existem: continua `PARCIAL`.
 */
const PERCURSO_ACERVO = "scripts/smoke-acervo.ts (25 passos, 0 falhas, 2026-09-12):";

const SMOKE_04 =
  "scripts/smoke-ent03c.ts (41 passos, 0 falhas, 2026-09-11, DUAS execuções — a segunda " +
  "contra o banco já povoado pela primeira, que é o que prova que o percurso não depende " +
  "de banco limpo)";

const PCASP_OFICIAL =
  "prisma/seed/pcasp-oficial.ts semeia as 7.864 contas do `Pcasp_2025.xlsx` publicado pelo " +
  "TCE-PB (sha256 conferido contra docs/oficial/tce-pb/MANIFEST.json antes de qualquer " +
  "leitura; versão e vigência registradas lá). test/pcasp-oficial.test.ts.";

/**
 * ⚠️ O PERCURSO DA ENT10 — E ELE MARCA **UMA** CLÁUSULA, NÃO A SEÇÃO INTEIRA.
 *
 * O lote corrigiu a autorização de leitura em 25 sítios (13 telas e 12 rotas), e isso rende
 * uma cláusula só. A desproporção não é falha: quase todo o trabalho foi **conserto de um
 * furo**, e furo consertado não é item de edital — é dívida paga.
 *
 * A `5.10.2.55` pede "consultar despesa empenhada a pagar por unidade orçamentária", e é o
 * que a tela de empenhos faz: coluna "A pagar" (`saldoAPagar`, derivado de liquidado − pago)
 * e recorte por unidade que agora vem AUTORIZADO. O percurso exercita os dois lados — o
 * administrador global consolidando e o operador restrito confinado à unidade dele.
 *
 * ⚠️ E O QUE O PERCURSO **NÃO** PROVA, DITO JUNTO. Com JavaScript ativo, a ilha
 * `SincronizarContexto` normaliza a URL antes de a página aparecer: pela barra de endereços
 * de um navegador comum, a unidade alheia já não era alcançável. A exposição real eram as
 * ROTAS de exportação (`GET` direto, sem ilha e sem menu), e é por status — 403 e 400 — que
 * o percurso as prova fechadas. Marcar sem dizer isso faria a cláusula parecer maior do que
 * a evidência sustenta.
 */
const PERCURSO_ENT10 = "scripts/smoke-ent10.ts (16 passos, 0 falhas, 2026-09-12):";

const PERCURSO_ENT11 = "scripts/smoke-roteiros.ts (17 passos, 0 falhas, 2026-09-12):";

const PERCURSO_ENT12 = "scripts/smoke-eixo-de-valor.ts (20 passos, 0 falhas, 2026-09-12):";

const MAPA: Readonly<Record<string, Marca>> = {
  // ═══ Sessão noturna V4 — §8 Fila A: as compras pela tela (M11), smoke-compras 20/20 ═══
  "5.17.51": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): registrarSolicitacaoDeCompra com itens, justificativa e solicitante (m11-compras.test.ts). V4 §8: TELA /licitacoes/solicitacoes — ilha com linhas de item; solicitação SEM item é recusada nomeando; a lista recarregada diz PENDENTE (smoke-compras 20/20). ⚠️ A solicitação não se restringe aos itens HOMOLOGADOS de uma licitação — pede qualquer material do cadastro.",
    rota_verificada: "papel: REGISTRAR_SOLICITACAO_DE_COMPRA · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/solicitacoes → ilha (número, setor, data, solicitante, justificativa, itens.0.material/quantidade) → lista filtrada · esperado: sem item é recusada; com item entra e aparece PENDENTE · obtido: 20/20 (scripts/smoke-compras.ts) · artefato: .registro-de-execucao/v4-percursos-3010-rodada7.txt.",
  },
  "5.17.52": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): situacaoDaSolicitacao derivada do último movimento (PENDENTE/AUTORIZADA/ANULADA). V4 §8: a lista mostra e FILTRA a situação derivada e o detalhe a exibe (smoke-compras: PENDENTE → AUTORIZADA após recarregar).",
    rota_verificada: "papel: CONSULTAR_LICITACOES · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/solicitacoes?situacao=PENDENTE|AUTORIZADA|ANULADA · esperado: a coluna Situação e o filtro seguem o último movimento · obtido: 20/20 · artefato: rodada7.",
  },
  "5.17.53": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): movimentarSolicitacaoDeCompra grava AUTORIZACAO como fato com autor e data; autorizar duas vezes RECUSA; anular o pendente RECUSA. V4 §8: ações Autorizar e Anular no detalhe (molde); o percurso autoriza, vê a segunda autorização recusada e a situação virar AUTORIZADA (smoke-compras 20/20).",
    rota_verificada: "papel: MOVIMENTAR_SOLICITACAO_DE_COMPRA · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/solicitacoes/{id} → Autorizar (data, motivo) → Autorizar de novo (recusado) → RECARREGADO: AUTORIZADA · obtido: 20/20 · artefato: rodada7.",
  },
  "5.17.56": {
    situacao: "PARCIAL",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): a solicitacao informa os itens e, opcionalmente, o recurso orcamentario pela ficha da ordem que dela nascer. V4 §8: solicitação e ordem de compra têm tela (a ordem informa processo e ficha). ⚠️ FALTA o vínculo explícito solicitação → ordem/processo (a ordem não aponta para a solicitação que a originou).",
  },
  "5.17.46": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): PesquisaDePrecos com itens e cotacoes por fornecedor (m11-compras.test.ts). V4 §8: TELA /licitacoes/pesquisas-de-precos — ilha com item e até duas cotações por item; o detalhe mostra a estimativa pelo preço médio (Σ quantidade × média) DERIVADA (smoke-compras: média 12.500000, estimativa 125,00).",
    rota_verificada: "papel: REGISTRAR_PESQUISA_DE_PRECOS · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/pesquisas-de-precos → ilha (número, objeto, data, itens.0.material/quantidade, itens.0.cotacoes.0.fornecedor/unitário/origem) → lista → detalhe e histórico · obtido: 20/20 · artefato: rodada7.",
  },
  "5.17.48": {
    situacao: "PARCIAL",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): estatisticasDaPesquisa deriva medio, minimo e maximo das cotacoes (nunca coluna). V4 §8: o detalhe da pesquisa mostra os três por item, derivados a cada leitura (smoke-compras). ⚠️ FALTA a cotação ON-LINE pelo fornecedor (portal) — as cotações são digitadas pelo servidor.",
  },
  "5.17.96": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra nos tres tipos (ORDINARIA, GLOBAL, ESTIMATIVA), por processo ou sem (dispensa). V4 §8: TELA /licitacoes/ordens-de-compra — ilha com tipo, fornecedor, processo (opcional), ficha (opcional), datas, finalidade e itens com unitário; a lista traz total e A RECEBER derivados (smoke-compras 20/20).",
    rota_verificada: "papel: EMITIR_ORDEM_DE_COMPRA · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/ordens-de-compra → ilha (OC ordinária, fornecedor, emissão, finalidade, itens.0 material/quantidade/unitário) → lista filtrada: total 125,00, A RECEBER · obtido: 20/20 · artefato: rodada7.",
  },
  "5.17.97": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): a ordem registra emissao, vencimento, fornecedor, finalidade e o recurso orcamentario (ficha). V4 §8: os mesmos campos na ilha da ordem e no detalhe (smoke-compras 20/20). ⚠️ A geração do empenho A PARTIR da ordem (com parcelas) não existe: o empenho é emitido na tela de empenhos, sem apontar para a ordem (pendência declarada no M11: vínculo empenho × ordem).",
  },
  "5.17.100": {
    situacao: "PARCIAL",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): estornarOrdemDeCompra e fail-closed nos dois sentidos (D12): ordem com recebimento nao se estorna; ordem empenhada so pelo estorno do empenho — e o vinculo empenho × ordem ainda nao existe, entao RECUSA. V4 §8: ação Estornar a ordem no detalhe; o percurso vê a recusa da ordem COM recebimento nomeando (smoke-compras). ⚠️ O estorno dos itens de uma ordem já empenhada e o desbloqueio do empenho não existem.",
  },
  "5.17.105": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "ENT05 (modelo das tres secoes derrubadas): saldoDaOrdemDeCompra devolve quantidade, recebida, pendente e valor pendente, item a item, por soma dos recebimentos. V4 §8: o detalhe da ordem mostra, por item, recebido e pendente DERIVADOS; a ilha de recebimento oferece só os itens pendentes; receber acima do pendente é recusado; o recebimento parcial (4 de 10) deixa pendente 6.0000 após recarregar (smoke-compras 20/20).",
    rota_verificada: "papel: REGISTRAR_RECEBIMENTO_DE_ORDEM · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 743b857, 2026-09-13 · " + "passos: /licitacoes/ordens-de-compra/{id} → Registrar recebimento (data, nota, responsável, itens.0 item/quantidade 11 → recusado; 4 → aceito) → ?aba=historico: pendente 6.0000 e a nota · obtido: 20/20 · artefato: rodada7.",
  },
  // ═══ Sessão noturna V4 — §8 (Fila A: M02b e M11) e §10 (percursos sob next start) ═══
  "5.19.36": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "ENT05: TermoPatrimonial (RESPONSABILIDADE), individual/setorial/por responsável; emitir registra o movimento na " +
      "mesma transação. V3 (pacote 2, unidade 5): tela /patrimonio/termos e PDF pela rota autenticada. V4 (§5): a " +
      "EMISSÃO É CONGELADA na criação (dados + modelo + sha256 canônico), a segunda via reproduz a emissão, a posição " +
      "atual é outro documento e o termo ASSINADO é anexável e conferido (m10-termo-documento.test.ts t4–t7). V4 (§10): " +
      "o percurso que LÊ o texto do PDF (pdf.js) rodou sob next build + next start: 33/33 (smoke-pacote2, rodadas 3 e 4).",
    rota_verificada:
      "papel: EMITIR_TERMO_PATRIMONIAL e CONSULTAR_PATRIMONIO · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /patrimonio/termos → criar → detalhe → PDF emitido (/patrimonio/termos/{id}/pdf) e posição atual (?via=atual) · " +
      "esperado: o PDF emitido traz tombamento, responsável e declaração; a posição atual tem título e nota próprios · " +
      "obtido: 33/33 · artefato: .registro-de-execucao/v4-percursos-3010-rodada3.txt e rodada4 (smoke-pacote2).",
  },
  "5.9.1.6": {
    situacao: "PARCIAL",
    evidencia:
      "V4 §8 (M02b, conciliado do siafic-cg c04ad5a): o programa entra no PLANO com área temática, público-alvo, " +
      "estratégia e valor previsto; o objetivo é o do Programa (M02) e não se repete; indicadores por programa " +
      "(situação inicial e ao fim, seis casas). m02b-plurianual.test.ts; smoke-plurianual 31/31. ⚠️ FALTAM origem, " +
      "diretrizes, fonte de financiamento e gerente responsável — não modelados.",
    rota_verificada:
      "papel: CADASTRAR_PPA / CADASTRAR_PROGRAMA_PPA (escrita) e CONSULTAR_PLANEJAMENTO (leitura) · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /planejamento/ppa → criar plano → detalhe → Incluir programa no plano → /planejamento/ppa/programas/{id} → " +
      "Registrar indicador · esperado: o histórico do programa traz o indicador · obtido: 31/31 (scripts/smoke-plurianual.ts) · " +
      "artefato: .registro-de-execucao/v4-percursos-3010-rodada4.txt e rodada5.",
  },
  "5.9.1.11": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "V4 §8 (M02b): PrevisaoReceitaPpa por natureza, FONTE e ano do quadriênio (@@unique), com o ano conferido contra o " +
      "plano no serviço (fora do quadriênio é recusado nomeando — m02b-plurianual.test.ts t1) e a série histórica anterior " +
      "ao plano (receita realizada, recusada dentro do quadriênio). smoke-plurianual 31/31.",
    rota_verificada:
      "papel: CADASTRAR_RECEITA_PPA · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /planejamento/ppa/{id} → Prever receita do quadriênio (natureza, fonte, ano, valor) e Registrar receita de " +
      "exercício anterior · esperado: a série dentro do quadriênio é recusada nomeando; a anterior entra; o histórico " +
      "recarregado traz as duas · obtido: 31/31 · artefato: .registro-de-execucao/v4-percursos-3010-rodada5.txt.",
  },
  "5.9.1.16": {
    situacao: "PARCIAL",
    evidencia:
      "V4 §8 (M02b): AcaoPpa com produto, unidade de medida, região, META FÍSICA (Decimal 18,6) e META FINANCEIRA por " +
      "ação do plano, com unidade executora, função e subfunção; smoke-plurianual registra a ação com meta 3,5 km. " +
      "⚠️ FALTAM a distribuição das metas POR EXERCÍCIO do PPA (a meta é do quadriênio) e a atualização durante a " +
      "execução — pendência VINCULO-PPA-LOA.",
    rota_verificada:
      "papel: CADASTRAR_PROGRAMA_PPA · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /planejamento/ppa/programas/{id} → Incluir ação no programa · esperado: o histórico traz a ação com " +
      "3.500000 km e a meta financeira · obtido: 31/31 · artefato: .registro-de-execucao/v4-percursos-3010-rodada5.txt.",
  },
  "5.9.2.1": {
    situacao: "PARCIAL",
    evidencia:
      "V4 §8 (M02b): LeiDiretrizesOrcamentarias por exercício (@@unique) com vigência e o TRÂMITE (envio, devolução, " +
      "protocolo, sanção) em ordem conferida por Zod e CHECK; a situação é derivada das datas. smoke-plurianual cadastra " +
      "a LDO e a lista diz NO LEGISLATIVO. ⚠️ FALTAM o grau do plano de contas e o texto jurídico do projeto/lei.",
    rota_verificada:
      "papel: CADASTRAR_LDO · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /planejamento/ldo → criar (exercício, vigência, envio ao Legislativo) → lista filtrada por exercício · " +
      "esperado: a LDO com o trâmite derivado · obtido: 31/31 · artefato: .registro-de-execucao/v4-percursos-3010-rodada5.txt.",
  },
  "5.9.2.5": {
    situacao: "PARCIAL",
    evidencia:
      "V4 §8 (M02b): as PRIORIDADES da LDO relacionam a ação (M02, opcional) com produto, unidade e meta física; as " +
      "metas anuais, riscos, renúncia, alienação/aplicação, dívida, RPPS e margem entram pelo detalhe e saem em oito " +
      "anexos PDF (anexos/ldo.ts, testados por fechamento). ⚠️ FALTA a importação de PPA, LDO ou LOA anteriores — " +
      "pendência PPA-LDO-VERSOES-E-EMENDAS.",
    rota_verificada:
      "papel: CADASTRAR_METAS_FISCAIS_LDO, CADASTRAR_RISCOS_FISCAIS_LDO, CADASTRAR_ALIENACAO_LDO · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /planejamento/ldo/{id} → meta anual (primária > total recusada nomeando; depois aceita), risco fiscal " +
      "(passivo 99), alienação e aplicação do produto → relacionados → PDF de metas anuais e de riscos fiscais " +
      "(/planejamento/ldo/{id}/anexos/{chave}; chave desconhecida é 404) · esperado: o PDF lido por pdf.js traz o exercício, " +
      "o resultado primário derivado (100.000,00), o passivo e a providência · obtido: 31/31 · artefato: rodada5.",
  },
  "5.9.3.45": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "V4 §8 (M02b): RenunciaReceitaLdo com descrição, valor, compensação e valor da compensação (pode ser 0,00, não nulo); " +
      "tela na LDO (ação 'Registrar renúncia de receita') e o anexo de renúncia em PDF (anexoRenunciaReceita, fechamento " +
      "total == Σ linhas testado em m02b-anexos-ldo.test.ts). ⚠️ O percurso de navegador não exercitou a renúncia — " +
      "só metas, riscos e alienação. O relatório do art. 5º, II é o anexo, sem conformidade com o MDF afirmada.",
  },
  "5.9.1.3": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: o PPA não escolhe grau do plano de contas nem nível de orçamento da despesa — a previsão é por natureza e fonte, a ação por produto e metas. Pendência PPA-LDO-VERSOES-E-EMENDAS (modules/m02b-plurianual/MODULO.md)." },
  "5.9.1.13": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: não há projeção de cálculo do total a arrecadar e a gastar por ano do PPA; o que existe é a linha por ano da receita prevista e o valor previsto por programa. Pendência VINCULO-PPA-LOA." },
  "5.9.1.26": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: as metas físicas do PPA existem por ação, mas não há meta REALIZADA nem consulta por ano/ação/produto. Pendência VINCULO-PPA-LOA." },
  "5.9.1.29": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: não há relatório de avaliação dos resultados dos programas (programação × execução física e financeira). Pendência VINCULO-PPA-LOA." },
  "5.9.2.8": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: a prioridade da LDO tem meta física, mas não há meta realizada nem reflexo no PPA. Pendência VINCULO-PPA-LOA." },
  "5.9.2.20": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: não há memória de cálculo da STN; os anexos da LDO são tabelares e não afirmam conformidade com o MDF (modules/m02b-plurianual/MODULO.md)." },
  "5.9.2.21": { situacao: "AUSENTE_CONFIRMADO", evidencia: "V4 §8: idem 5.9.2.20 — sem memória de cálculo, sem relatório dela." },
  "5.9.2.22": {
    situacao: "PARCIAL",
    evidencia:
      "V4 §8 (M02b): /planejamento/ppa/programas lista os programas do plano com filtro por plano e por programa, valor " +
      "previsto somável e o detalhe com indicadores e ações (unidade executora, função, subfunção). ⚠️ É consulta de tela, " +
      "não relatório impresso; não há emissão por entidade nem consolidado (ente único).",
  },
  "5.17.14": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O processo se registra com número único, modalidade, objeto e valor licitado (\`ProcessoLicitatorio\`), e contrato em processo NÃO HOMOLOGADO é rejeitado com NADA gravado (m11.test.ts t2). V4 §8: TELA no molde (/licitacoes/processos) com a hipótese do art. 75 para a dispensa; o percurso cadastra o pregão, tenta contratar antes de homologar e vê a recusa nomeada, homologa, reserva e contrata (smoke-contratacao 18/18). ⚠️ FALTAM a DATA do processo (só \`criadoEm\`), as requisições de compra e as planilhas de preços na tela (pendência COMPRAS-COM-ITENS-NA-TELA).`,
    rota_verificada:
      "papel: CADASTRAR_PROCESSO, HOMOLOGAR_PROCESSO, CADASTRAR_CONTRATO · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /licitacoes/processos → criar (pregão eletrônico, objeto, valor) → lista filtrada diz EM ANDAMENTO → " +
      "detalhe → Cadastrar contrato (recusado: PROCESSO NÃO HOMOLOGADO) → Homologar → RECARREGADO diz HOMOLOGADO → " +
      "Cadastrar contrato · obtido: 18/18 (scripts/smoke-contratacao.ts) · artefato: .registro-de-execucao/v4-percursos-3010-rodada6.txt.",
  },
  "5.17.39": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A reserva orçamentária vinculada à licitação existe e o guard é apertado: reserva VINCULADA a licitação exige contrato DAQUELE processo (TR 4.42, m11-integracao.test.ts t6), a categoria do empenho é HERDADA do contrato e divergência é erro (t4), e o saldo do contrato bloqueia (t3). V4 §8: a reserva é feita PELA TELA do processo (ficha, valor, histórico), a liberação idem, e o EMPENHO informa o contrato e a reserva (selects lidos no servidor; o M11 ligado ao M05) — o histórico do processo mostra a reserva consumida pelo empenho (smoke-contratacao 18/18). ⚠️ FALTA a liberação AUTOMÁTICA da diferença a cada compra (5.17.77): liberar é ato do operador.`,
    rota_verificada:
      "papel: RESERVAR_DOTACAO, LIBERAR_RESERVA, EMPENHAR · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /licitacoes/processos/{id} → Reservar dotação (ficha, 1.000,00) → /despesa/empenhos → Emitir empenho com " +
      "contrato e reserva → /licitacoes/contratos/{id}?aba=historico traz o empenho → /licitacoes/processos/{id}?aba=historico " +
      "diz 'consumido por empenhos 1000.00' · obtido: 18/18 · artefato: rodada6.",
  },
  "5.17.42": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A reserva bloqueia a dotação e o empenho a consome; dois empenhos concorrentes que estourariam o contrato gravam exatamente UM (m11-limites.test.ts t1); empenhar COM contrato sem o M11 ligado FALHA em vez de passar batido (m11-integracao.test.ts t9). V4 §8: reserva e empenho vinculado PELA TELA (smoke-contratacao 18/18). ⚠️ FALTA o desbloqueio AUTOMÁTICO do não utilizado ao finalizar o processo — a liberação é ato do operador (ação 'Liberar reserva não utilizada').`,
  },
  "5.17.64": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A situação do processo é DERIVADA e nunca uma coluna — \`situacaoDoProcesso(homologadoEm(...))\`, cadastro × evento (m11-integracao.test.ts t7). V4 §8: a lista e o detalhe mostram e FILTRAM a situação derivada (EM ANDAMENTO/HOMOLOGADO), e o percurso vê a virada após homologar (smoke-contratacao 18/18). ⚠️ O ROL É DE DOIS: faltam anulada (total/parcial), deserta, fracassada, descartada, suspensa, revogada e a homologação PARCIAL.`,
  },
  "5.17.75": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Valor e prazo do contrato são DERIVADOS dos movimentos (m11.test.ts t1), o corte é pela data do FATO (t7), o XOR valor/prazo é barrado por Zod e CHECK (t4), o estorno devolve a dimensão CERTA (t5). V4 §8: TELA no molde (/licitacoes/contratos): o contrato nasce pelo processo homologado, o detalhe mostra valor atualizado e fim da vigência derivados, o aditivo de prorrogação (30 dias) muda o fim de 28/02/2027 para 30/03/2027 após recarregar, e o estorno do aditivo é ação contextual (smoke-contratacao 18/18). ⚠️ FALTAM publicações e reajuste/apostila.`,
    rota_verificada:
      "papel: CADASTRAR_CONTRATO, REGISTRAR_ADITIVO, ESTORNAR_MOVIMENTO_CONTRATUAL · " + "contexto: banco dos percursos (DATABASE_URL_PERCURSOS), next build + next start em 3010, build 5d7bb39/6aeaa81, 2026-09-13 · " +
      "passos: /licitacoes/processos/{id} → Cadastrar contrato → /licitacoes/contratos/{id} (vigência até 28/02/2027) → " +
      "Registrar aditivo (prorrogação, 30 dias) → RECARREGADO: 30/03/2027 · obtido: 18/18 · artefato: rodada6.",
  },
  // ══ Sessão noturna V4 (§7) — a revisão pedida pela auditoria de 77cbcc9: PARCIAL onde há parte obrigatória faltante ══
  "5.19.14": {
    situacao: "PARCIAL",
    evidencia:
      "V3 pacote 2 (unidade 1): a lista do acervo pesquisa por tombamento, código de barras, descrição, classe, " +
      "localização, responsável (nome ou documento), situação, estado e espécie, com o estado atual derivado em SQL " +
      "(test/acervo-pesquisa.test.ts; percurso smoke-pacote2 30/30 em 2026-09-13). ⚠️ RESSALVA MANTIDA: o critério " +
      "'código do produto' da cláusula NÃO existe — o bem não tem campo de código de produto/catálogo, e não há " +
      "caminho de consulta por ele. Pendência CODIGO-DO-PRODUTO-NO-BEM. Enquanto ela durar, é PARCIAL.",
    rota_verificada:
      "papel: usuário com CONSULTAR_PATRIMONIO (fixture patrimonio@cg.pb.gov.br) · contexto: banco dos percursos " +
      "(DATABASE_URL_PERCURSOS), servidor em 3010 · passos: GET /patrimonio/bens-patrimoniais?q=<tombamento> ; " +
      "?classe=<id> ; ?localizacao=<id> ; ?responsavel=<nome ou documento> ; ?situacao=<valor> · entrada: os filtros " +
      "acima · esperado: a linha do bem com localização, responsável e situação atuais · obtido: 30/30 no " +
      "smoke-pacote2 (scripts/smoke-pacote2.ts, seção 2), 2026-09-13 · versão: 27c15aa..63a3040 · artefato: " +
      ".registro-de-execucao/v3-pacote2-percurso.txt; teste test/acervo-pesquisa.test.ts · rota dinâmica: os ids de " +
      "classe/localização vêm dos seletores da própria tela.",
  },

  "5.19.39": {
    situacao: "PARCIAL",
    evidencia:
      "O estorno por movimento existe (m10-patrimonio.test.ts t8/t8b); estornada a competência, ela pode ser refeita " +
      "(m10-competencia.test.ts t3). V3 (pacote 2, unidade 4): análise de dependências. V4 (§4): a competência tem " +
      "IDENTIDADE DE EXECUÇÃO por classe (ExecucaoDeAtualizacao) e estornar um item desfaz a execução inteira — itens " +
      "e o lançamento único, uma vez (m10-competencia-v4.test.ts t6); a dependência é impacto verificado (t8/t9). " +
      "⚠️ RESSALVA MANTIDA: a VIRADA MENSAL como operação única sobre todas as classes NÃO existe (pendência " +
      "VIRADA-DE-TODAS-AS-CLASSES); o que se estorna é a execução de UMA classe. PARCIAL.",
    rota_verificada:
      "papel: ATUALIZAR_COMPETENCIA_PATRIMONIAL (processar) e ESTORNAR_MOVIMENTO_PATRIMONIAL (estornar) · contexto: " +
      "banco dos percursos, 3010 · passos: /patrimonio/competencia?classe=<id>&competencia=AAAA-MM → prévia item a " +
      "item → Processar → histórico de execuções → 'analisar' → /patrimonio/estornos/valor/{movimentoId} → Estornar · " +
      "entrada: classe com parâmetro vigente e ≥1 bem com valor · esperado: a execução inteira estornada, a " +
      "competência livre de novo · obtido: domínio 9/9 (m10-competencia-v4.test.ts); percurso da tela nova PENDENTE " +
      "· versão: 27ef63f · artefato: .registro-de-execucao/v4-competencia-testes.txt · rota dinâmica: o " +
      "movimentoId vem do link 'analisar' do histórico.",
  },
  "5.10.2.55": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      PERCURSO_ENT10 +
      " a consulta de empenhos mostra o SALDO A PAGAR por empenho (liquidado − pago, " +
      "derivado — não há coluna de status no banco) e recorta por UNIDADE ORÇAMENTÁRIA. O " +
      "recorte passou a vir AUTORIZADO no servidor (`recorteDePagina`, lib/portas/contexto): " +
      "o operador restrito à UG 99001 cai na unidade dele quando omite `?ug=`, é RECUSADO ao " +
      "pedir a UG 01001 com a mensagem nomeando onde ele TEM leitura, e a rota de exportação " +
      "responde 403 em vez do arquivo. O administrador global continua recebendo o " +
      "consolidado e o PDF (anti-regressão: um guard que negasse todos passaria nas demais " +
      "asserções). Decisão provada por 23 asserções puras em test/ui/recorte-autorizado.test.ts " +
      "e TRÊS mutações de conjuntos vermelhos disjuntos; o comportamento ANTERIOR está " +
      "medido em test/caracterizacao/leitura-por-unidade.test.ts.",
  },
  // ══ ENT04 — seeds de produção, shell e navegação ═════════════════════════
  //
  // ⚠️ A CONTAGEM DESTE LOTE É PEQUENA, E O MOTIVO É MEDIÇÃO, NÃO EXECUÇÃO. Os quatro itens
  // do ENT04 são INFRAESTRUTURA (seeds oficiais, casca, guards, ferramenta) — e
  // infraestrutura quase não tem cláusula no catálogo. O cadastro de PROVISÕES, entregue
  // pelo molde e provado pelo smoke, marcou ZERO: as oito cláusulas que dizem "provisão"
  // são todas de FOLHA (férias, 13º, licença-prêmio, seções 5.12), e a provisão contábil
  // do M10 — matemática previdenciária e riscos — não é pedida em cláusula nenhuma.
  // Está registrado em ESTADO-EXECUCAO §19.

  "5.9.3.3": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      PCASP_OFICIAL + " O plano é ÚNICO: uma tabela `ContaPcasp` sem recorte por entidade, " +
      "e a hierarquia (`contaPaiId`) fecha — nenhuma conta com pai inexistente. ⚠️ NÃO " +
      "VALIDADO por tela: não há tela de manutenção do plano, só a consulta em " +
      "app/(areas)/contabilidade/plano-de-contas.",
  },
  /**
   * ⚠️ CONTINUA `PARCIAL` EM V11 V9.3, E DE PROPÓSITO. A rodada corrigiu a ÚLTIMA perna de
   * roteiro que ainda debitava um nó sintético e provou a recusa pela tela — mas a cláusula
   * cobra o controle para TODAS as contas, e a lista de exceções ainda tem cinco entradas.
   * Promover por causa de uma perna seria contar o que encolheu como se fosse o todo.
   */
  "5.10.1.72": {
    situacao: "PARCIAL",
    evidencia:
      "O CONTROLE EXISTE e é do adapter (INVARIANTE 5): partida em conta sintética é " +
      "recusada, e `opcoesDoCadastro` só oferece analíticas ao formulário. ⚠️ E A MEDIÇÃO " +
      "CONTRA O PLANO REAL MOSTROU QUE O ENTE NÃO CUMPRE: confrontados os 70 códigos que o " +
      "código de produção usa contra o PCASP oficial, 55 são SINTÉTICOS lá — a maioria é " +
      "ancestral de hierarquia e nunca recebe partida, mas cerca de dez estão em ROTEIRO. " +
      "test/contas-contra-o-plano-oficial.test.ts fixa a lista (EM_PERNA_DE_ROTEIRO) e FALHA " +
      "se ela crescer. ⚠️ ALCANCE VALIDADO EM V11 V9.3, e só ele: a perna de classe 7 da " +
      "ARRECADAÇÃO deixou de debitar o nó sintético 7.2.1.1.0.00.00 e passou a ser resolvida " +
      "pela natureza da fonte, nas cinco analíticas que o Pcasp_2025.xlsx traz — provado por " +
      "leitura das PARTIDAS PERSISTIDAS (m01-ddr t6/t7, fixture N=2) e pela TELA, no passo 6.0 " +
      "do percurso J9 contra instalação limpa. A entrada saiu de EM_PERNA_DE_ROTEIRO, e antes " +
      "dela a da DDR disponível (8.2.1.1.1.00.00, V9.2) e a de fornecedores " +
      "(2.1.3.1.1.00.00, V9.2). ⚠️ O QUE FALTA, e é o que mantém PARCIAL: cinco pernas " +
      "seguem em conta sintética, cada uma com pendência própria — " +
      "ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS (5.2.2.1.2.00.00), " +
      "CREDITO-ESPECIAL-ABERTO-OU-REABERTO (5.2.2.1.2.02.00 e .03.00), " +
      "ROTEIRO-RESERVA-SEM-CONTA (6.2.2.1.2.00.00) e CONSIGNACAO-CONTA-SINTETICA " +
      "(2.1.8.8.1.01.00). Nenhuma se resolve escolhendo uma filha: as três primeiras são " +
      "decisão do ente, hoje oferecida em /contabilidade/roteiros-orcamentarios.",
  },
  "5.10.1.71": {
    situacao: "PARCIAL",
    evidencia:
      "OS EVENTOS SÃO TABELA, não código: RoteiroOrcamentario, RoteiroDivida, " +
      "RoteiroDividaAtiva, RoteiroProvisao, RoteiroPatrimonial, RoteiroConvenio, " +
      "RoteiroConsorcio, RoteiroPrecatorio, RoteiroEncerramento, RoteiroAlmoxarifado, " +
      "RoteiroReconhecimento e RoteiroResultadoAlienacao — doze, cada um com conta de " +
      "débito e de crédito por parâmetro, e o caso de uso RECUSA sem o roteiro em vez de " +
      "inventar conta (prisma/seed/roteiros-patrimoniais.ts; smoke provou a recusa no " +
      "ENT03c e a aceitação no ENT04). O histórico de cada registro mostra os movimentos " +
      "com valor, data do fato e quem lançou. ⚠️ A SEGUNDA METADE DA CLÁUSULA — consultar, " +
      "ANTES de executar, quais lançamentos uma transação vai produzir — passou a existir " +
      "para a família PATRIMONIAL, e só para ela. " +
      PERCURSO_ENT11 +
      " /patrimonio/roteiros lista os TREZE eventos do bem (parametrizados ou não, porque " +
      "o que falta é o que precisa ser visto) com o par débito/crédito de cada um, e " +
      "/patrimonio/roteiros-de-resultado faz o mesmo para ganho e perda da alienação. A " +
      "parametrização é feita PELA TELA, e as recusas foram exercidas por ela: débito e " +
      "crédito na mesma conta, e evento que já tem roteiro (esta nomeando o par vigente e " +
      "mandando usar a reparametrização, que é ato à parte porque muda a contabilidade dos " +
      "movimentos futuros). A conferência das contas CHAMA O MOTOR do M01 (`comporPartidas`) " +
      "em vez de reescrever a regra das classes — modules/m10-patrimonial/m10-roteiros.test.ts " +
      "(12 testes) prova por DUAS mutações de conjuntos vermelhos disjuntos. ⚠️ E A MEDIÇÃO " +
      "QUE ABRIU O LOTE: RoteiroPatrimonial tinha ZERO linhas e MovimentoPatrimonial " +
      "também — o eixo financeiro inteiro do patrimônio era inalcançável, porque " +
      "`roteiroDoTipo` é fail-closed e nenhum serviço sabia escrever a tabela. ⚠️ CONTINUA " +
      "PARCIAL: os outros DEZ roteiros (orçamentário, dívida, dívida ativa, provisão, " +
      "convênio, consórcio, precatório, encerramento, almoxarifado e reconhecimento) " +
      "seguem sem tela de consulta. Pendência CONSULTA-DE-EVENTOS-CONTABEIS, agora " +
      "reduzida a eles.",
  },
  "5.8.9": {
    situacao: "PARCIAL",
    evidencia:
      "A TROCA DE ENTIDADE E DE EXERCÍCIO É NO CABEÇALHO, sem novo login " +
      "(components/ui/Seletores.tsx sobre lib/portas/contexto.ts), e o seletor oferece " +
      "SÓ as unidades que as permissões do usuário alcançam — fail-closed: sem permissão, " +
      "lista vazia, nunca \"todas\". O exercício selecionado é preservado na troca porque " +
      "os dois vivem no mesmo contexto e viajam na URL. ⚠️ \"ALTERNÂNCIA ENTRE SISTEMAS\" " +
      "NÃO SE APLICA COMO ESCRITO: este é um sistema único com áreas, não uma suíte de " +
      "sistemas separados. Marcar PARCIAL em vez de atendido é a leitura honesta do " +
      "enunciado.",
  },
  "5.9.3.2": {
    situacao: "PARCIAL",
    evidencia:
      "OS CÓDIGOS SÃO OFICIAIS E ESTÃO NO REPOSITÓRIO: as 30 fontes de " +
      "docs/oficial/tce-pb/relacionamento_fonterecursos_co_2026.xlsx (sha256 no MANIFEST), " +
      "com o relacionamento fonte x CO que o leiaute 2026 v1.1 exige. ⚠️ AS DESCRIÇÕES " +
      "NÃO ESTÃO: a seção 5.22 do leiaute do TCE diz, literalmente, que TipoFonteRecursos é " +
      "\"definido pela Secretaria do Tesouro Nacional e disponibilizada pela Matriz de " +
      "Saldos Contábeis\" — e a MSC não está no corpus local. Escrever as descrições de " +
      "memória seria inventar tabela normativa; a única exceção com base textual é o grupo " +
      "FUNDEB (540-543), que o próprio leiaute nomeia. O grupo/especificação/detalhamento " +
      "da STN que a cláusula pede vem da mesma tabela ausente. Pendência " +
      "FONTES-DESCRICAO-STN-MSC.",
  },
  // ── PROMOÇÕES: o que o smoke do ENT04 exercitou de ponta a ponta ─────────

  // ══ ENT03a ═══════════════════════════════════════════════════════════════
  //
  // ⚠️ NENHUMA DELAS É `VALIDADO_LOCALMENTE`, e a razão é uma só: **não há tela**.
  // O motor existe e é testado; a superfície não. Marcar acima disso inverteria o
  // propósito do catálogo — ele passaria a esconder o que falta.

  // ── 5.10.2 MOVIMENTAÇÃO BANCÁRIA (M09, TR 5.62) ──────────────────────────
  //
  // ⚠️ A 5.10.2.6 ERA `AUSENTE_CONFIRMADO` NO LOTE ANTERIOR, e foi essa marcação de
  // AUSÊNCIA que trouxe a decisão para a mesa antes que alguém construísse por cima. É o
  // argumento de marcar ausência: ela expõe lacuna de MODELO, e presença não expõe nada.
  // ⚠️ V16 — PROMOVIDA, e o que a promoveu foi a pendência `ROL-DE-FONTES-UI` FECHADA. O vínculo
  // existia desde 2026-09-10 e o cadastro não tinha tela; enquanto cada conta tinha uma fonte só, a
  // ausência não impedia nada. A guia REPARTIDA entre fontes (C30) a tornou bloqueante: um depósito
  // de duas fontes só entra numa conta que comporte as duas, e o fallback do guard admite UMA.
  // ⚠️ V15/C34-C37 — O RECOLHIMENTO DE UMA SÓ VEZ, COMPOSTO POR ORIGEM. A cláusula pede pagar "de
  // uma só vez as despesas extraorçamentárias geradas através de retenção na liquidação", e é
  // exatamente o que a guia composta faz: uma guia, várias retenções, inclusive de exercícios
  // anteriores, com o vínculo gravado (`AlocacaoDoRecolhimento`) para que o estorno reabra as
  // parcelas certas em vez de devolver uma fatia proporcional de um agregado.
  "5.10.2.37": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "`/financeiro/extraorcamentario/recolher` em dois passos: a obrigação (tipo de consignação × consignatário) e depois de QUAIS retenções sai cada centavo — sem campo de valor total, porque o total É a soma das parcelas (um total à parte criaria duas verdades sobre o mesmo dinheiro). O vínculo é gravado em `AlocacaoDoRecolhimento` na mesma transação, com trinco no posto 30 de `ORDEM_DOS_LOCKS`: sem ele duas guias concorrentes leriam o mesmo \"ainda falta\" e alocariam o dobro sobre a mesma retenção, com o agregado continuando a fechar. A tela do extraorçamentário mostra os QUATRO números SEPARADOS (retido, recolhido, estornado de cada lado) e a conferência por caminho INDEPENDENTE, que DIZ a divergência em vez de exibir um selo — inclusive a coluna \"recolhido sem composição\", que nomeia o recolhimento herdado que reduz o agregado e não reduz nenhuma origem. `modules/m07-extraorcamentario/m07-composicao-do-recolhimento.test.ts` (26/26, fixture N=2 em DOIS exercícios).",
    rota_verificada:
      "papel: papel de runtime com REGISTRAR_DISPENDIO_EXTRA · contexto: clone do banco de percursos, next dev em 3010, 2026-09-27 · passos: /financeiro/extraorcamentario lê os quatro números separados -> /recolher escolhe a obrigação -> compõe 300,00 de uma retenção de 2026 e o resto de outra do exercício seguinte -> pedir além do que UMA origem tem é RECUSADO pelo limite POR ORIGEM (dentro do saldo agregado, para que seja o limite por origem o que se mede) -> a reconciliação fecha: (soma do que cada retenção tem a recolher) − (o que a obrigação deve, agregado) == o recolhimento que não disse de onde saiu · obtido: scripts/smoke-recolhimento-por-origem.ts, 15 passos ok / 0 falhas.",
  },
  // ⚠️ V15/C34-C37 — PARCIAL, com as duas metades ditas.
  "5.10.1.74": {
    situacao: "PARCIAL",
    evidencia:
      "O CADASTRO existe e o recolhimento dos valores retidos é registrado pela tela, composto pelas retenções que ele quita (ver 5.10.2.37), com os lançamentos contábeis na mesma transação e o tipo de consignação trazendo a conta de passivo por DECISÃO VERSIONADA do ente. ⚠️ O QUE FALTA, e são duas coisas: (a) o DOCUMENTO PARA RECOLHIMENTO por guia não é emitido — o PDF de `/financeiro/extraorcamentario` é o demonstrativo da POSIÇÃO (saldos por consignatário, retenções e recolhimentos), não a guia do consignatário; (b) a exigência de EMPENHO DE ORIGEM \"se a rubrica assim o exigir\" não é modelada por rubrica: a retenção nasce dentro do pagamento (que tem empenho), e o recolhimento aponta para as retenções, não para um empenho exigido por parâmetro do TCE.",
    rota_verificada:
      "papel: papel de runtime com REGISTRAR_DISPENDIO_EXTRA · contexto: clone do banco de percursos, next dev em 3010, 2026-09-27 · passos: os mesmos de 5.10.2.37 · obtido: scripts/smoke-recolhimento-por-origem.ts, 15 ok / 0 falhas; a ausência do documento por guia e da exigência por rubrica foi conferida por leitura de `app/(areas)/financeiro/extraorcamentario/pdf/route.ts` e do domínio do M07.",
  },
  // ⚠️ V16 — PARCIAL, e a metade que falta está dita. O ato existe para os DOIS tipos, com
  // autorização, transação e percurso; o que não existe é a DEMONSTRAÇÃO dos dois valores lado a
  // lado NO ATO: uma inscrição é processada OU não processada, e o detalhe mostra a dela. Os dois
  // aparecem na LISTA, uma linha cada. Marcar VALIDADO aqui esconderia justamente o que a cláusula
  // pede a mais.
  "5.10.1.28": {
    situacao: "PARCIAL",
    evidencia:
      "O CANCELAMENTO existe para os dois tipos, com roteiro contábil próprio por evento (`RoteiroRestosAPagar`, versionado e fail-closed: sem as contas informadas a operação é RECUSADA nomeando onde resolver), autorização no servidor e saldo conferido dentro da transação. A tela do ato (`/despesa/restos-a-pagar/[id]`) mostra o TIPO da inscrição (Processado / Não processado) e a composição do saldo em pernas brutas antes do líquido; a lista (`/despesa/restos-a-pagar`) traz uma linha por inscrição, com tipo e saldo, filtrável por tipo. ⚠️ O QUE FALTA: a cláusula pede demonstrar o valor processado E o não processado no MOMENTO do cancelamento; como cada inscrição é de um tipo só, o detalhe demonstra o da inscrição que se cancela — os dois juntos existem na lista, não no ato. modules/m08-restos-a-pagar/m08-roteiro-de-restos.test.ts.",
    rota_verificada:
      "papel: papel de runtime com as ações de restos a pagar · contexto: clone do banco de percursos, next dev em 3010, 2026-09-26 · passos: /despesa/restos-a-pagar/[id] de um resto PROCESSADO → cancelar sem as contas informadas é RECUSADO nomeando a tela de configuração → contas publicadas → o cancelamento é aceito e o saldo cai de 28.000,00 para 23.000,00 → o estorno do cancelamento devolve · obtido: scripts/smoke-restos-a-pagar-operacoes.ts, 23 passos ok / 0 falhas (8.1 a 8.3 e o estorno).",
  },
  "5.10.2.6": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "Vínculo muitos-para-muitos `FonteDaContaBancaria` (migration aditiva com backfill: a fonte única virou a primeira linha do rol) MAIS o CADASTRO em rotina própria, em `/financeiro/contas-bancarias`: um formulário por ato (acrescentar, remover), ação própria `GERIR_ROL_DE_FONTES_DA_CONTA` (censo v33) e três recusas do domínio — a ÚLTIMA fonte não sai (rol vazio não restringe: faz o guard voltar a admitir a fonte PADRÃO, o oposto do pedido), a fonte PADRÃO não sai, e fonte repetida não entra. `modules/m09-tesouraria/m09-rol-de-fontes.test.ts` (6/6) confere o efeito NO GUARD, não na tabela: a fonte acrescentada passa a ser aceita por `exigirFonteNoRolDaConta`, e antes era recusada. \"Esta definição deve ser observada em qualquer movimentação\": são SEIS sítios pela mesma função — pagamento, ordem de pagamento, movimentação bancária, dispêndio extraorçamentário, pagamento de restos a pagar e, desde a V16, a ARRECADAÇÃO (que comparava a coluna `ContaBancaria.fonteId`, a regra de antes da ADR, e por isso recusava guia da segunda fonte de uma conta multifonte). ADR: docs/adr/ADR-conta-bancaria-com-varias-fontes.md.",
    rota_verificada:
      "papel: administrador (papel de runtime `gestao_app`, não o dono do schema) · contexto: clone do banco de percursos (gestao_publica_percursos_v16b) servido por `next dev` na 3010, 2026-09-27 · passos: /financeiro/contas-bancarias diz \"rol não declarado; vale a fonte padrão\" -> acrescentar 540 (a PADRÃO entra junto: \"passa a comportar as fontes 500, 540\") -> acrescentar 700 -> remover 700 (exercita o GRANT DE DELETE do papel de runtime, que nenhum teste pega: a suíte roda como DONO) -> 700 de volta -> remover a PADRÃO é RECUSADO nomeando o motivo · obtido: scripts/smoke-receita-por-fontes.ts, 22 passos ok / 0 falhas (2.1, 5.1 a 5.5).",
  },
  "5.10.2.15": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`registrarMovimentoBancario` grava o `MovimentoBancario` e a perna no razão na MESMA transação — ou as duas, ou nenhuma; não há lapso possível. modules/m09-tesouraria/m09-movimentacao.test.ts t5 confere o par de partidas e t6 a inversão na saída. `MovimentoBancario.lancamentoId` é `@unique`. Sem exercício pela tela.",
  },
  "5.10.2.18": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: registra DEPOSITO e TARIFA pela tela /financeiro/movimentacao, escolhendo conta, fonte e contrapartida, e ambos aparecem na lista APÓS RECARGA. A fonte é DECLARADA (conta multifonte não permite inferi-la). Testes: modules/m09-tesouraria/m09-movimentacao.test.ts, 20 testes.`,
  },
  "5.10.2.19": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: o saque acima do saldo é RECUSADO pela tela nomeando quanto falta ("SALDO INSUFICIENTE ... faltam 999.988.734,00"), e nada fica gravado. O saldo é conferido DENTRO da transação, depois do lock da conta (posto 17) — não antes de abri-la, que deixaria a janela de dois saques concorrentes. m09-movimentacao.test.ts t3; t4 registra a decisão de TARIFA e RENDIMENTO não passarem pelo guard.`,
  },
  "5.10.2.20": {
    situacao: "PARCIAL",
    evidencia:
      "O ESTORNO existe e faz os lançamentos invertidos automaticamente, preservando o valor de cada perna, com motivo obrigatório e recusa de estorno duplo e de estorno-de-estorno (m09-movimentacao.test.ts t9, t10, t11). O que FALTA é a CONSULTA na rotina de inclusão: não há tela de movimentação bancária. Pendência LOTE-UI/MOVIMENTACAO-UI.",
  },

  // ── 5.10 ASSINATURA DIGITAL DA CADEIA DA DESPESA (M05 + M22) ─────────────
  "5.10.1.46": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: em /despesa/assinaturas o documento é gerado, entra na fila do ENT02 e é assinado — o estado aparece APÓS RECARGA. A fila é a MESMA do M22 (a do borderô), não uma paralela; ela é ordenada e só conclui com todos. Testes: modules/m05-despesa/m05-assinatura-da-despesa.test.ts t1 e t4.`,
  },
  "5.10.2.65": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: a ordem de pagamento entra na fila pela tela e é assinada, com o estado visível após recarga. O serviço assinarNaFila RECUSA quem tenta furar a ordem, nomeando quem falta e em que posição — m05-assinatura-da-despesa.test.ts t4 (a negação afirma o MOTIVO, não só o resultado).`,
  },

  // ── 5.10.2 A CONCILIAÇÃO COMO OBJETO DISCRETO (ENT03a) ───────────────────
  "5.10.2.45": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: a pendência manual é incluída pela tela, com motivo obrigatório, e aparece APÓS RECARGA com o motivo. ⚠️ Ela é DECISÃO REGISTRADA, não fato: NÃO gera lançamento contábil — m09-conciliacao-periodo.test.ts t5 prova que o razão não se move. ADR: docs/adr/ADR-conciliacao-como-objeto-discreto.md.`,
  },
  "5.10.2.46": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Pendências automáticas são DERIVADAS (o residual do extrato e do interno), e a "cópia para o período seguinte" é REFERÊNCIA ao conjunto não resolvido da anterior — nunca duplicação: m09-conciliacao-periodo.test.ts t7 prova pelo dado que a contagem de linhas no banco NÃO MUDA ao abrir o período seguinte. Duplicar faria a soma contar a mesma pendência duas vezes. ${SMOKE_03A} exercita abrir → encerrar → abrir o seguinte pela tela.`,
  },
  "5.10.2.47": {
    situacao: "PARCIAL",
    evidencia:
      "A SOMA da seleção existe e é pura (`somarSelecao`), com a mesma conta que a tela mostraria e o serviço cobraria; item repetido é recusado, porque dobraria a soma e faria um vínculo de valor inexistente parecer certo. m09-conciliacao-periodo.test.ts t13/t14/t15/t16. O que FALTA é a superfície: não há tela de seleção múltipla de lançamentos para conciliar com um ou vários registros do extrato. Pendência SELECAO-MULTIPLA-UI.",
  },
  "5.10.2.49": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE_03A}: os dois períodos (o encerrado e o seguinte) aparecem listados APÓS RECARGA, com estado e autoria do encerramento. A leitura conciliacoesDaConta lista da mais recente para a mais antiga — m09-conciliacao-periodo.test.ts t17. A IMPRESSÃO (PDF) da conciliação de período ainda não existe: pendência CONCILIACAO-PERIODO-PDF.`,
  },
  "5.10.2.69": {
    situacao: "PARCIAL",
    evidencia:
      "A ORDEM DE PAGAMENTO entra na fila e é assinável (m05-assinatura-da-despesa.test.ts t1). O COMPROVANTE DE PAGAMENTO não: não há documento canônico de `Pagamento`, e portanto não há o que assinar. Metade do enunciado está atendida e metade não. Pendência COMPROVANTE-PAGAMENTO-DOCUMENTO.",
  },

  // ── 5.10.2 CONCILIAÇÃO — o que já existia, verificado neste lote ─────────
  "5.10.2.48": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "A conciliação PARCIAL já existia e foi verificada: `vincular` aceita um `valor` menor que o do fato, `exigirCapacidade` recusa o que passa do teto, e a conciliação lista apenas o RESIDUAL (`teto − vinculado`), de modo que o já conciliado some da consulta. modules/m09-tesouraria/dominio.ts e conciliacao.ts; testes em m09-conciliacao. Sem exercício pela tela.",
  },

  // ── 5.9 SALDO DE DOTAÇÃO POR DATA (M05, ADR de 2026-09-10) ──────────────
  // Marcado abaixo, junto das cláusulas de execução orçamentária.

  // ── 5.42 PROTOCOLO E PROCESSO DIGITAL (M21/M22) ──────────────────────────
  "5.42.1": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${SMOKE}: abre o processo, tramita, recebe, pede e responde parecer, pede e atende readequação, encerra e arquiva — cada passo recarregando a tela do servidor. Testes: modules/m21-protocolo/m21-protocolo.test.ts.`,
  },
  "5.42.2": {
    situacao: "DEPENDENCIA_EXTERNA",
    evidencia:
      "Não há provedor ICP-Brasil configurado. `estadoDaAssinaturaQualificada()` devolve `disponivel: false` e o caso de uso RECUSA produzir assinatura QUALIFICADA — em vez de gravar uma que pareceria válida na tela. modules/m22-documentos/m22-documentos.test.ts t9. Pendência ASSINATURA-ICP-HSM.",
  },
  "5.42.5": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`Processo.contatoAnonimo` + `Assunto.permiteAnonimo`; o caso de uso exige contato quando não há requerente. modules/m21-protocolo/m21-protocolo.test.ts. Sem exercício pela tela.",
  },
  "5.42.6": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Campo \`finalidade\` (ATENDIMENTO_AO_PUBLICO | INTERNO) preenchido pelo formulário. ${SMOKE}.`,
  },
  "5.42.8": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`RequerenteAdicionalDoProcesso`, com teste em modules/m21-protocolo/m21-protocolo.test.ts. A tela mostra os adicionais mas não os inclui — sem superfície de inclusão.",
  },
  "5.42.9": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "`@@unique([exercicioId, numero])` + trinco `SequenciaDeProtocolo` (packages/locks) contra a corrida de numeração. A sequência reinicia por exercício porque o número é por exercício. modules/m21-protocolo/m21-protocolo.test.ts.",
  },
  "5.42.11": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`Assunto.termoDeAceite` e o guard `aceitouTermo` no caso de uso. modules/m21-protocolo/m21-protocolo.test.ts. A tela publica o termo; o smoke não exercita o caminho de recusa.",
  },
  "5.42.14": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`EtapaDoRoteiro\` copiada para \`EtapaDoProcesso\` no instante da abertura — reconfigurar o assunto depois NÃO mexe em processo já aberto. ${SMOKE} confere o roteiro copiado na tela.`,
  },
  "5.42.15": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`EtapaDoRoteiro.prazoDias`, copiado para a etapa do processo. modules/m21-protocolo/m21-dominio.test.ts. Sem tela de configuração de roteiro.",
  },
  "5.42.16": {
    situacao: "PARCIAL",
    evidencia:
      "`situacaoDePrazo` classifica por faixa (EM_DIA / A_VENCER / VENCIDO) e a contagem começa no RECEBIMENTO, não no trâmite — modules/m21-protocolo/m21-dominio.test.ts. Falta a paralisação automática de processo que estourou o prazo (5.42.44).",
  },
  "5.42.17": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: não há emissão de guia em padrão bancário. `TaxaDoProcesso` registra a taxa e a baixa, sem gerar documento de arrecadação. Pertence ao bloco de arrecadação (5.29). Pendência PROTOCOLO-GUIA-BANCARIA.",
  },
  "5.42.20": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`exigirTaxasEmDia` no caso de uso, dentro da transação. modules/m21-protocolo/m21-protocolo.test.ts t13 e m21-cadastros.test.ts t6.",
  },
  "5.42.22": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "Mesmo guard de 5.42.20, aplicado na tramitação — o guard está no caso de uso, e não há rota de tramitação que não passe por ele. modules/m21-protocolo/m21-protocolo.test.ts t13.",
  },
  "5.42.21": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`registrarNotificacao`/`notificarVarios` (M24) são chamados na tramitação, com alvo por setor ou por usuário. modules/m21-protocolo/m21-protocolo.test.ts. ⚠️ A notificação é INTERNA: e-mail e push são DEPENDENCIA_EXTERNA — ver 5.42.47.",
  },
  "5.42.23": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`Processo.prioridade\` (NORMAL/ALTA/URGENTE), exibida como distintivo na tela. ${SMOKE}.`,
  },
  "5.42.25": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `A situação é DERIVADA dos movimentos (\`situacaoDoProcesso\`) — não há coluna \`situacao\`. Do registro ao arquivamento em ${SMOKE}.`,
  },
  "5.42.26": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`MovimentoDoProcesso\` é append-only e o dossiê traz a cadeia inteira. ${SMOKE} confere o histórico depois do arquivamento.`,
  },
  "5.42.27": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Linha do tempo na tela do processo, mostrando também os movimentos TORNADOS SEM EFEITO — riscados, com quem os desfez. Escondê-los faria a anulação virar um DELETE com outro nome. ${SMOKE}.`,
  },
  "5.42.28": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`MovimentoDeApensamento` (append-only) e `alvosDaMovimentacao`: os apensos vigentes tramitam junto, na MESMA transação. modules/m21-protocolo/m21-protocolo.test.ts.",
  },
  "5.42.29": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`anexarArquivo\` valida tipo e tamanho NO SERVIDOR, calcula SHA-256 e grava fora de pasta pública. A tela do processo tem \`input[type=file]\` e ${SMOKE} sobe o arquivo, baixa por HTTP e confere os bytes.`,
  },
  "5.42.30": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `A permissão do anexo é a DO PROCESSO, resolvida a cada leitura — não uma cópia gravada no dia do envio. Depois da tramitação, origem e destino continuam lendo: modules/m22-documentos/m22-documentos.test.ts t7. ${SMOKE}.`,
  },
  "5.42.32": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Rota \`/documentos/lote?processo=<id>\`: zip com os arquivos que \`baixarAnexo\` entregaria um a um, conferindo o hash de cada um. modules/m22-documentos/m22-documentos.test.ts t18-t20; ${SMOKE} valida a assinatura PK do zip.`,
  },
  "5.42.35": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`tramitar\` aceita setor de destino e, opcionalmente, usuário ("aos cuidados de"). ${SMOKE}.`,
  },
  "5.42.36": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Textos de abertura e movimento são \`String\` sem limite de coluna; a tela usa \`textarea\`. ${SMOKE}.`,
  },
  "5.42.40": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "⚠️ NÃO é exclusão: `tornarMovimentoSemEfeito` grava um movimento NOVO que anula o anterior, e o original continua no histórico, marcado. Excluir de verdade quebraria o append-only. modules/m21-protocolo/m21-protocolo.test.ts.",
  },
  "5.42.44": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: `situacaoDePrazo` CLASSIFICA o prazo, mas nada paralisa o processo automaticamente ao estourá-lo. Não há agendador neste ambiente. Pendência PROTOCOLO-PARALISACAO-AUTOMATICA.",
  },
  "5.42.47": {
    situacao: "DEPENDENCIA_EXTERNA",
    evidencia:
      "`estadoDoEnvioExterno()` devolve indisponível com motivo (MOTIVO_CANAL_INDISPONIVEL): não há provedor de e-mail nem de push. A notificação INTERNA funciona e é gravada. Pendência NOTIFICACAO-EMAIL-PUSH.",
  },
  "5.42.49": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`listarProcessos\` devolve a caixa CALCULADA para quem pergunta, aplicando \`podeVerProcesso\` — a mesma regra do dossiê e do anexo. ${SMOKE}.`,
  },
  "5.42.52": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `O gerenciamento acontece na própria tela de visualização: catorze formulários, cada um com \`data-acao\` e estado próprio. ${SMOKE} exercita trâmite, recebimento, parecer, readequação, encerramento e arquivamento a partir dela.`,
  },
  "5.42.55": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`ehGestor` + permissão global (`unidadeOrcId` nulo) dão visão de todos os processos. modules/m21-protocolo/m21-protocolo.test.ts.",
  },
  "5.42.56": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`Processo.sigiloso\` restringe a visualização aos envolvidos — e a MESMA função (\`podeVerProcesso\`) responde à caixa, ao dossiê, ao anexo e à fonte do designer, para que as quatro não possam divergir. modules/m22-documentos/m22-documentos.test.ts t6/t16/t19. ${SMOKE} confere que a consulta pública não mostra parecer interno.`,
  },
  "5.42.57": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`solicitarReadequacao\`/\`atenderReadequacao\`, com a situação derivada AGUARDANDO_READEQUACAO. ${SMOKE}.`,
  },
  "5.42.58": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`/consulta\` — fora de \`(areas)\`, SEM sessão: número + exercício + código verificador. ${SMOKE} confere que ela funciona sem sessão, que NÃO mostra o parecer interno, e que código errado não revela nada.`,
  },
  "5.42.59": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`solicitarParecer\` notifica o setor de destino; a situação vira AGUARDANDO_PARECER. ${SMOKE}.`,
  },
  "5.42.60": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`responderParecer\` grava \`respondeAId\`, e o seletor da tela só oferece pedidos ainda ABERTOS — oferecer um já respondido faria a pessoa digitar o parecer inteiro para o servidor recusar. ${SMOKE}.`,
  },
  "5.42.63": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: não há ferramenta de fluxograma. O roteiro por assunto (5.42.14) cobre a sequência de etapas, não o desenho gráfico. Pendência PROTOCOLO-FLUXOGRAMA.",
  },
  "5.42.75": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: não há painéis indicadores de processo. Os dados existem e são consultáveis pelo designer de relatórios (5.43), mas o painel em si não foi construído. Pendência PROTOCOLO-PAINEIS.",
  },

  // ── 5.43 (M26 designer de relatórios) ────────────────────────────────────
  "5.43.1": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Designer com fonte de dados, colunas, filtros e expressões. ${SMOKE} cria o modelo, copia, executa em segundo plano e abre o CSV com o campo calculado.`,
  },

  // ══ ENT03b — OS CADASTROS DO MOLDE ═══════════════════════════════════════
  //
  // ⚠️ O QUE `VALIDADO_LOCALMENTE` AFIRMA AQUI: há caso de uso com teste, autorização
  // provada no servidor E o caminho foi exercitado PELA INTERFACE, com dado visível após
  // recarga. O que NÃO afirma: que a parametrização contábil do ente esteja pronta — o
  // roteiro é por tabela e o banco de desenvolvimento ainda não o tem para convênio.

  // ── 5.10.1.66-69 · CONVÊNIOS DE REPASSE (M28) ───────────────────────────
  "5.10.1.66": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Cadastro de \`Convenio\` com papel do ente (CONCEDENTE/CONVENENTE, NOT NULL e sem default — o efeito contábil é OPOSTO nos dois casos), contas por PARÂMETRO (\`contaContabilId\` + \`RoteiroConvenio\` por par tipo×papel) e vínculo ao empenho por \`Empenho.convenioId\`. O vínculo é COBRADO: como concedente, liberar parcela SEM empenho é recusado ("repasse sem empenho é despesa sem dotação") e empenho de OUTRO convênio também — modules/m28-convenios/m28-convenios.test.ts t4 e t4b. ${SMOKE_03B}: o convênio é cadastrado pela tela e aparece após recarga com a situação DERIVADA.`,
  },
  "5.10.1.67": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `A aba de ANEXOS existe no detalhe e \`Anexo.convenioId\` entrou em migration aditiva (uma coluna por tipo de dono — o rol é fechado pela mesma razão do M25: um \`donoTipo\` livre faria o banco deixar de garantir que o registro existe). A aba de RELACIONADOS aponta a consulta dos empenhos com o filtro aplicado, sem recontar (quem soma empenho é o M05). ${SMOKE_03B} abre as duas abas. ⚠️ O UPLOAD por esta tela ainda não foi ligado — pendência ANEXO-DO-MOLDE-UI.`,
  },
  "5.10.1.68": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`aprovarPrestacaoDeContas\` faz o lançamento contábil pelo \`RoteiroConvenio\` (par tipo×papel) na MESMA transação do movimento, e RECUSA aprovar acima do pendente ("dar quitação de dinheiro que não saiu") — m28-convenios.test.ts t1 e t5. Os três saldos são INDEPENDENTES e provados por literal: a liberar, a prestar contas e o glosado (m28-dominio.test.ts t1–t5). ⚠️ Pela TELA a ação existe e é oferecida, mas o banco de desenvolvimento não tem \`RoteiroConvenio\` cadastrado e a tela RECUSA nomeando o que falta — pendência ROTEIROS-ENT03B-PARAMETRIZACAO.`,
  },
  "5.10.1.69": {
    situacao: "PARCIAL",
    evidencia: `O estado do convênio é DERIVADO e distingue PRESTACAO_VENCIDA de EM_EXECUCAO, com precedência da vencida (m28-dominio.test.ts t8 — um convênio com saldo a liberar E prazo vencido aparece como VENCIDO, que é o que o gestor precisa ver ANTES de liberar a próxima parcela). O prazo conta em DIAS CIVIS a partir do fim da vigência, e a resposta não depende da hora do dia (t9). ${SMOKE_03B} vê a situação na listagem. ⚠️ FALTA a consulta dedicada de prestações em atraso com responsável e prazo — pendência CONVENIO-PAINEL-DE-ATRASO.`,
  },

  // ── 5.10.1.77 · CONSÓRCIOS (M30) ────────────────────────────────────────
  "5.10.1.77": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Cadastro de \`ConsorcioPublico\` com área de atuação, protocolo de intenções e lei ratificadora (art. 5º). O repasse só acontece dentro do CONTRATO DE RATEIO do exercício (art. 8º): sem ele a tela RECUSA citando o artigo — provado PELO NAVEGADOR em ${SMOKE_03B}, e por m30-consorcios.test.ts t1. O teto é a SOMA do original com os aditivos, nunca "o último vale" (t3, e m30-rateio.test.ts t2/t3); dois contratos ORIGINAIS do mesmo exercício são recusados pelo índice parcial do banco (t4).`,
  },

  // ── 5.10.1.78-81 · PRECATÓRIOS (M29) ────────────────────────────────────
  "5.10.1.78": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Cadastro de \`Precatorio\` com natureza (ALIMENTAR/COMUM), preferência do §2º, tribunal, ofício requisitório, beneficiário e exercício de pagamento. ⚠️ A DATA DE APRESENTAÇÃO é gravada como DIA CIVIL DO ENTE e é ELA que ordena a fila — não o \`criadoEm\` (m29-precatorios.test.ts t9). ${SMOKE_03B}: cadastrado pela tela e visível após recarga com a classificação do art. 100.`,
  },
  "5.10.1.79": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `INSCRIÇÃO, ATUALIZAÇÃO (juros/correção), CANCELAMENTO e PAGAMENTO, cada um com lançamento por \`RoteiroPrecatorio\` (o pagamento é contabilizado pelo M05 e a baixa nasce DENTRO do \`pagar()\`, na transação dele). A atualização é IDEMPOTENTE pela competência (m29-precatorios.test.ts t6) e inscrever duas vezes é recusado (t7). ⚠️ A baixa pelo pagamento NÃO se estorna sozinha: anula-se o pagamento (t8) — quem nasceu junto, morre junto. Sem exercício pela tela.`,
  },
  "5.10.1.80": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`Empenho.precatorioId\` em migration aditiva, e a aba de RELACIONADOS do detalhe aponta a consulta dos empenhos com o filtro do precatório aplicado — sem recontar. ${SMOKE_03B} abre a aba. A consulta de destino é a gerencial que já existe.`,
  },
  "5.10.1.81": {
    situacao: "PARCIAL",
    evidencia: `O DETALHE mostra o valor requisitado, o saldo devido (Σ dos movimentos, nunca uma coluna) e a aba de HISTÓRICO com cada movimento, as duas datas (fato e registro), o autor, o motivo e a marca de estornado — e a quebra da ordem do art. 100, quando houve, com a justificativa. ${SMOKE_03B} exercita as cinco abas. ⚠️ FALTA o relatório impresso com saldo inicial × movimentações × saldo atual — pendência PRECATORIO-RELATORIO.`,
  },

  // ── 5.11 · CONTROLE INTERNO (M31) ───────────────────────────────────────
  //
  // ⚠️ REGIME DE SUPERFÍCIE, DECLARADO: este módulo NÃO move o razão. Auditoria produz
  // JUÍZO sobre o que os outros fizeram; dar-lhe lançamento seria inventar um fato.
  "5.11.2": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`AuditoriaInterna\` com identificador, objeto, tipo, ÓRGÃO auditado, período (dias civis do ente) e responsável. A ABERTURA é um MOVIMENTO gravado na mesma transação — o estado (aberta/encerrada) é DERIVADO dele, nunca uma coluna (m31-controle-interno.test.ts t1). ${SMOKE_03B}: aberta pela tela e visível após recarga com a situação derivada. ⚠️ O vínculo com PROCESSO DIGITAL e com as INSTRUÇÕES NORMATIVAS não existe — pendência AUDITORIA-VINCULO-PROCESSO.`,
  },
  "5.11.3": {
    situacao: "PARCIAL",
    evidencia: `\`ItemDeChecklist\` com pergunta e BASE LEGAL OBRIGATÓRIA (item sem fundamento é opinião do auditor com aparência de norma — m31-controle-interno.test.ts t9), e \`RespostaDeChecklist\` APPEND-ONLY: "conforme" que vira "não conforme" deixa as DUAS (t2). "Não conforme" e "não aplicável" exigem observação (t3/t3b). ⚠️ FALTAM os GRUPOS e o enquadramento em CATEGORIAS que a cláusula pede — pendência CHECKLIST-GRUPOS.`,
  },
  "5.11.9": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`Anexo.auditoriaId\` em migration aditiva e a aba de ANEXOS no detalhe. ${SMOKE_03B} abre a aba. O upload por esta tela ainda não foi ligado — pendência ANEXO-DO-MOLDE-UI.`,
  },
  "5.11.10": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `\`Irregularidade\` com descrição, gravidade, PROVIDÊNCIA e PRAZO — sem os dois últimos o achado é observação, e observação não se cobra. O prazo vale o DIA INTEIRO no calendário do ente (m31-dominio.test.ts t8). A providência do auditado e a APRECIAÇÃO do auditor são atos SEPARADOS, com crachás distintos, e o mesmo usuário é RECUSADO nas duas pontas (m31-controle-interno.test.ts t6) — quem relata não aprecia. Recusar exige motivo (t6b). ${SMOKE_03B}: o achado é registrado pela tela e aparece após recarga.`,
  },
  "5.11.11": {
    situacao: "PARCIAL",
    evidencia: `\`RelatorioCircunstanciado\` com VERSÃO append-only (refazer é outra linha; a anterior fica, porque é ela que o auditado recebeu) e SHA-256 do texto canônico — o mesmo desenho do borderô e da nota de empenho, e pela mesma razão: a fila do M22 assina um CONTEÚDO. Texto curto é recusado nomeando o tamanho (m31-controle-interno.test.ts t7). ⚠️ FALTAM a emissão pela tela, os QUADROS e o anexo gerado — pendência RELATORIO-CIRCUNSTANCIADO-UI.`,
  },
  "5.11.13": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `Verificado: não há EVENTOS de auditoria (agendamento, notificação, monitoramento), e por isso não há como instaurar auditoria A PARTIR de irregularidade apontada em evento. O que existe é a auditoria instaurada à mão. ⚠️ Marcar a ausência é o que expõe a lacuna: o modelo de EVENTO das 5.11.7/5.11.12 é pré-requisito desta cláusula, e construí-la sem ele produziria um botão que não tem de onde partir. Pendência AUDITORIA-EVENTOS.`,
  },

  // ── 5.21.29 · MEDIÇÃO DE OBRA (M11, ENT03b) ─────────────────────────────
  "5.21.29": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1: além da MedicaoDeObra (período em dia civil, sem sobreposição, responsável técnico e registro), a MEDIÇÃO POR ITENS registra, pelo fiscal designado e vigente, as quantidades medidas em cada item do contrato; V7 M2 U1/U2: a medição da ORDEM DE SERVIÇO registra período e quantidades por item autorizado, segue para os recebimentos e para a liquidação (percurso smoke-ponte-contratual 28/0 em d167c02). V7 M2 U6: a planilha orçamentária da obra existe em versões (smoke-planilha-da-obra 9/0 em d167c02). ⚠️ PARCIAL: a medição do andamento REFERENTE AO QUANTITATIVO DA PLANILHA (a ordem medida pelos serviços da versão aplicável, com acumulado e saldo por serviço) está em construção em V7 M2 U7, ainda sem percurso de navegador; não se marca completa antes dele.",
  },

  // ── 5.38.37 · TRANSPARÊNCIA (consulta de convênios) ─────────────────────
  "5.38.37": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `Verificado: o cadastro de convênios e a aba de anexos existem no sistema INTERNO (5.10.1.66/.67), e o PORTAL DA TRANSPARÊNCIA não os publica. É dataset novo no M13, não reuso de tela — a consulta pública tem recorte e autorização próprios. Pendência TRANSPARENCIA-CONVENIOS.`,
  },

  // ══ O QUE JÁ ESTAVA CONSTRUÍDO E NUNCA FOI MEDIDO ════════════════════════
  //
  // ⚠️ ESTAS NÃO SÃO DO ENT03b — elas são de lotes anteriores, e estavam em
  // `NAO_VERIFICADO` porque ninguém tinha olhado para elas. O catálogo é o único
  // instrumento de medição do projeto: deixar código testado fora dele faz o instrumento
  // mentir para baixo, e um instrumento que mente para baixo esconde tanto quanto o que
  // mente para cima. Cada uma abaixo aponta o teste que a sustenta.

  // ── 5.10.1.82-86 · DÍVIDA FUNDADA (M10, desde o ENT01) ──────────────────
  "5.10.1.82": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      SMOKE_04 +
      " O cadastro, a correção monetária e o histórico foram exercitados PELA TELA: o " +
      "registro reaparece após RECARGA, a correção é ACEITA com o roteiro parametrizado " +
      "(D 3.4.3.1.1.01.00 variações monetárias de dívida contratual interna contra " +
      "C 2.2.2.1.1.02.98 empréstimos internos em contratos — contas reais do PCASP " +
      "oficial) e o movimento aparece no histórico com o valor. No ENT03c este mesmo " +
      "passo provava a RECUSA por falta de roteiro; o ENT04 tirou o motivo da recusa em " +
      "vez de contorná-lo. ⚠️ CONTINUAM FALTANDO o número de parcelas e o comparativo " +
      "previsto x realizado — não há modelo de PARCELA da dívida (5.10.1.84 é " +
      "AUSENTE_CONFIRMADO, pendência DIVIDA-PARCELAS). A cláusula segue atendida só na " +
      "primeira metade, e é por isso que a evidência diz qual.",
  },
  "5.10.1.83": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`Empenho.dividaId` com guard BICONDICIONAL: elemento do grupo 6 (amortização) SEM dívida é rejeitado, e dívida em empenho fora do grupo 6 também — vínculo sem sentido é erro nos dois sentidos. A amortização nasce DENTRO do `pagar()`, na transação dele, PELO BRUTO (a retenção não perdoa parte da dívida: ela muda o credor daquele pedaço). m10-divida.test.ts t1 e t3 (atomicidade: dívida menor que o pagamento aborta o PAGAMENTO INTEIRO).",
  },
  "5.10.1.85": {
    situacao: "PARCIAL",
    evidencia:
      "ATUALIZAÇÃO MONETÁRIA e AMORTIZAÇÃO existem, com lançamento automático e estorno simétrico desde o dia 1 (m10-divida.test.ts). ⚠️ FALTAM o CANCELAMENTO e a TRANSFERÊNCIA DE LONGO PARA CURTO PRAZO — a segunda é reclassificação entre contas de passivo e exige roteiro próprio. Pendência DIVIDA-RECLASSIFICACAO.",
  },
  "5.10.1.84": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: NÃO há modelo de PARCELA da dívida. O que existe são os movimentos (ingresso, atualização, amortização) e o saldo derivado deles — não há cronograma previsto contra o qual comparar o pago. ⚠️ Marcar a ausência é o que expõe a lacuna: o comparativo previsto × pago que a cláusula pede é impossível sem o previsto, e construir o relatório antes do modelo produziria uma coluna sempre vazia. Pendência DIVIDA-PARCELAS.",
  },
  "5.10.1.86": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: não há relatório gerencial de dívida (nem de uma, nem do conjunto). O `saldoDaDividaEm` responde a pergunta por API e é testado, mas nenhuma tela ou impressão o expõe. Pendência DIVIDA-RELATORIO.",
  },

  // ── 5.10.1.87-89 · PARCERIAS PÚBLICO-PRIVADAS (M12) ─────────────────────
  "5.10.1.87": {
    situacao: "PARCIAL",
    evidencia:
      "`ContratoPPP` existe com número, objeto, parceiro privado, vigência, valor global e contraprestação anual — o mínimo para o RREO Anexo 13 existir sem inventar (modules/m12-relatorios/m12-rreo-anexo13.test.ts prova o teto de 5% da RCL). ⚠️ FALTAM o TIPO da parceria e a SITUAÇÃO que a cláusula pede, e não há tela. O próprio schema registra que o layout completo da Tabela 13 é pendência de DADO: ele entra quando houver contrato real para modelar contra, não reconstruído de memória. Pendência PPP-CADASTRO-COMPLETO.",
  },
  "5.10.1.88": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: `Anexo` NÃO tem coluna para `ContratoPPP`. O rol de donos do anexo é fechado por decisão (um `donoTipo` livre faria o banco deixar de garantir que o registro existe), e a PPP não entrou nele no ENT03b — o molde cobriu convênio, precatório, consórcio, obra e auditoria. Custo: uma migration aditiva com a coluna e uma linha no descritor. Pendência PPP-ANEXOS.",
  },
  "5.10.1.89": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia:
      "Verificado: `Empenho` NÃO tem `contratoPppId`. Os vínculos que existem são contrato, dívida, obra, convênio, precatório e consórcio. Mesmo custo e mesma forma do .88. Pendência PPP-VINCULO-EMPENHO.",
  },

  // ── 5.10.1.90 · ENCERRAMENTO E IMUTABILIDADE (M16 + M08) ────────────────
  "5.10.1.90": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "O travamento de competência (M16) impede lançamento em período fechado pela DATA DO FATO — e o corte é pela janela CIVIL do ente, não por UTC: um lançamento de 31/12 às 22:00 escapava da trava de dezembro até o ENT03b (docs/adr/ADR-data-civil-do-ente.md). modules/m16-travamento/m16-travamento.test.ts. A imutabilidade não é só do domínio: o papel de runtime do banco NÃO TEM UPDATE nem DELETE no razão (prisma/papel-runtime.ts, test/papel-runtime.test.ts confronta a lista com os grants REAIS nas duas direções). ⚠️ FALTA a conferência automática de DIVERGÊNCIAS DE SALDO no fechamento mensal — o que existe é `modules/m12-relatorios/consistencia.ts`, que roda sob demanda. Pendência FECHAMENTO-MENSAL-DIVERGENCIAS.",
  },

  // ── 5.10.1.91 · PATRIMÔNIO → CONTABILIDADE (M10) ────────────────────────
  "5.10.1.91": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`MovimentoPatrimonial.lancamentoId` é NOT NULL: não existe movimento de bem sem lançamento contábil — a integração não é uma rotina que roda depois, é a mesma transação. Depreciação, reavaliação e as movimentações físicas passam pelo funil do M01 (modules/m10-patrimonial/). ⚠️ EXAUSTÃO e AMORTIZAÇÃO não foram verificadas em separado. Sem exercício pela tela.",
  },

  // ── 5.10.1.93-95 · ABERTURA DO EXERCÍCIO (M08 + M14) ────────────────────
  "5.10.1.93": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "A MSC de ENCERRAMENTO costura os exercícios: o `beginning_balance` de janeiro do ano seguinte traz o saldo DEPOIS do encerramento, e NÃO traz orçamento morto (modules/m14-exports-federais/m14-msc.test.ts t5). ⚠️ O ENT03b corrigiu a janela da competência da MSC, que era UTC: o encerramento de 31/12 às 23:59:59 CIVIS caía fora da remessa de dezembro e reaparecia como abertura de janeiro — a M3 não fechava. Os conta-correntes da MSC são gravados no próprio lançamento. Sem tela de abertura.",
  },
  "5.10.1.94": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "O exercício seguinte recebe movimento SEM o anterior estar encerrado — não há guard que exija o encerramento, e o guard que existe é o oposto (`exigirExercicioAberto` recusa lançar em exercício ENCERRADO). modules/m08-restos-a-pagar/m08-encerramento-controles.test.ts prova que apurar e encerrar são independentes e sem ordem obrigatória entre si. ⚠️ A marcação é VALIDADO porque a cadeia da despesa de um exercício aberto foi exercitada pela interface nos smokes do ENT02 e do ENT03a.",
  },
  "5.10.1.95": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`estornarEncerramentoControles` e `estornarApuracao` desfazem o encerramento por FATO NOVO (nunca UPDATE), restaurando cada saldo — e os literais provam a restauração conta a conta (m08-encerramento-controles.test.ts t4). Refazer é encerrar de novo depois do estorno. ⚠️ Sem tela: a rotina existe como caso de uso. Pendência ENCERRAMENTO-UI.",
  },

  // ══ 5.8 · OS REQUISITOS GERAIS QUE O MOLDE PASSOU A CUMPRIR ══════════════
  //
  // ⚠️ ESTAS SÃO DO ENT02, E ESTAVAM EM `NAO_VERIFICADO`. Algumas o sistema já cumpria e
  // ninguém tinha medido; outras só passaram a ser verdade quando o MOLDE ligou, numa
  // superfície padrão, o que cada tela religava à mão.

  "5.8.5": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `CAMPOS PERSONALIZADOS por unidade gestora (M25): sete tipos, valor em COLUNA TIPADA (filtro de texto sobre número diria que "900" é maior que "1.000"), append-only e por cadastro. O rol de cadastros é FECHADO e cada valor corresponde a uma FK real — o ENT03b acrescentou cinco (convênio, precatório, consórcio, obra, auditoria). ${SMOKE_03B} abre a aba "Campos adicionais" nos cadastros do molde; ${SMOKE} exercita a definição e o preenchimento no protocolo.`,
  },
  "5.8.8": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `Acesso por senha (scrypt), permissão POR AÇÃO DE NEGÓCIO e por PERFIL, com recorte por unidade gestora, negando por omissão (modules/m16-travamento/autorizacao.ts; censo exaustivo provado por m16-censo.test.ts). ORQUESTRAÇÃO V3 (2026-09-12): a LEITURA passou a ser permissão — dezoito ações CONSULTAR_<ÁREA>, uma por área, concedidas global ou por unidade como qualquer outra; cada tela e rota de (areas) declara a sua leitura (grep-teste test/ui/leitura-exige-acao.test.ts), o escopo é o da ação cobrada e não a união das ações do usuário, o detalhe por id autoriza pelo próprio registro, e as leituras do ente exigem a concessão global. Provado em banco sintético com os seis usuários do pedido (sem permissão, somente leitura, ação A na unidade 1 e B na 2, global numa ação e restrito noutra, revogado, acesso direto por id/URL/exportação — test/leitura-por-acao.test.ts, 9 testes). Perfis: atualização versionada v1 com registro, reaplicação recusada, concorrência (m16-atualizacoes.test.ts, 11 testes) e regra dos quatro olhos: ninguém amplia o próprio crachá (m16-perfis t12, m16-usuarios t3b). Percurso de navegador: scripts/smoke-ent10.ts a reexecutar sob a nova política (pendente nesta unidade).`,
  },
  "5.8.17": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `A LINHA DO TEMPO está DENTRO do cadastro — é a aba "Histórico" do molde, e ela mostra cada movimento com a DATA DO FATO e o INSTANTE DO REGISTRO separados, o autor e o motivo. ⚠️ As duas datas são diferentes de propósito: mostrar só uma faria o movimento de março, lançado em maio, parecer de maio. ${SMOKE_03B} confere as duas na aba de histórico da auditoria (abertura + achado). A fonte é a tabela APPEND-ONLY do próprio registro — nas tabelas deste repositório a auditoria É a tabela.`,
  },
  "5.8.19": {
    situacao: "PARCIAL",
    evidencia: `A história COMPLETA existe e nada se apaga: cada correção é um fato novo apontando o original, e a resposta de checklist que muda deixa as DUAS (m31-controle-interno.test.ts t2). O que a cláusula pede ALÉM disso é o DIFF CAMPO A CAMPO ("novos dados e dados anteriores") — e ele não existe como apresentação. ⚠️ E há uma ausência de MODELO por trás: \`RegistroDeOperacao\` guarda quem, quando, qual ação e o resultado, e NÃO guarda QUAL REGISTRO — "todas as operações sobre este convênio" é pergunta que aquela tabela não responde. Pendência AUDITORIA-SEM-EIXO-DE-REGISTRO.`,
  },
  "5.8.10": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `O designer permite COPIAR um modelo (\`copiarModeloDeRelatorio\`), e a cópia é independente — o original fica inalterado. ${SMOKE} cria o modelo, copia e executa. Testes: modules/m26-designer/m26-designer.test.ts.`,
  },
  "5.8.11": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `A execução do relatório roda EM SEGUNDO PLANO e o usuário continua trabalhando — calcular dentro da requisição faria o navegador esperar. ${SMOKE} dispara a execução, segue navegando e abre o CSV quando ele fica pronto.`,
  },
  "5.8.12": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`distribuirModeloDeRelatorio\` e \`retirarModeloDeRelatorio\` existem, com ação própria no censo cada uma (distribuir e retirar são poderes distintos). modules/m26-designer/m26-designer.test.ts. ⚠️ A distribuição para OUTRAS ENTIDADES não se demonstra: o eixo de município não existe (docs/adr/ADR-eixo-de-municipio.md). Sem exercício pela tela.`,
  },
  "5.8.20": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`escreverAjudaDeRota\` (M27) grava ajuda POR ROTA, e a rota é a chave — a ajuda aparece onde a dúvida acontece, sem abrir chamado. Testes em modules/m27-suporte/. ⚠️ A ajuda das telas do molde ainda não foi escrita: o mecanismo existe, o conteúdo não. Pendência AJUDA-DAS-TELAS-DO-MOLDE.`,
  },
  "5.8.23": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `O papel de runtime do banco NÃO É DONO DAS TABELAS e NÃO TEM UPDATE nem DELETE no razão — o append-only deixou de depender de todo mundo lembrar. A superfície mutável é um CENSO TIPADO (prisma/papel-runtime.ts: \`Usuario.ativo\` por COLUNA, os saldos da ficha, e o DELETE do vínculo de perfil), e test/papel-runtime.test.ts confronta a lista com os GRANTS REAIS do banco nas duas direções: sobra é grant esquecido, falta é privilégio não declarado. ⚠️ O ENT00 mediu o contrário antes disso: \`UPDATE ... -> UPDATE 1\` por SQL cru.`,
  },
  "5.8.16": {
    situacao: "DEPENDENCIA_EXTERNA",
    evidencia: `Verificado: NÃO há custódia de certificado A1 em HSM. O modo \`QUALIFICADA\` existe no enum porque é o destino declarado, e o caso de uso RECUSA produzi-lo, com motivo — um modo que devolvesse "assinado" sem certificado seria uma assinatura FABRICADA, e ela pareceria válida na tela exatamente como a verdadeira. Depende de provedor de custódia contratado. Pendência: item 5 do ENT03a, adiado para o ENT03b e depois para o ENT03c (packages/integracao).`,
  },

  // ══════════════════════════════════════════════════════════════════════════
  // ENT03c · O CENSO DOS MÓDULOS EXISTENTES
  //
  // ⚠️ O QUE A VARREDURA ACHOU, E É O ACHADO DO LOTE: "BASE_FORTE" no mapa de lacunas
  // significa "existe um arquivo com esse nome", e o próprio mapa avisa isso. Medido
  // contra o catálogo, o M10 se parte em dois:
  //
  //   · o ALMOXARIFADO é CONTÁBIL, não FÍSICO — move VALOR por classe de material contra
  //     a conta de estoque do PCASP. Não há quantidade, unidade, depósito, lote nem
  //     validade. Sem quantidade não existe preço médio, saldo físico mínimo nem
  //     inventário: 20 das 25 cláusulas da 5.18 são AUSENTE_CONFIRMADO;
  //   · o PATRIMÔNIO é a CONTABILIDADE do bem, não a GESTÃO dele — tombamento, classe,
  //     valor contábil, depreciação por competência e alienação com resultado, tudo com
  //     lançamento na mesma transação. Não há localização, responsável, estado de
  //     conservação, comissão nem termo.
  //
  // Nos dois casos o MOTOR é bom e está provado; o que falta é o CADASTRO que o alimenta.
  // Essa é a diferença entre "ampliar o que existe" e "construir o que falta", e ela muda
  // o custo do próximo lote. As ausências têm contraprova executável em
  // `test/censo-de-ausencias.test.ts`: o dia em que uma delas nascer, o teste quebra
  // nomeando a cláusula que precisa mudar de situação.
  // ══════════════════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════════════════
  // ENT06 — AS CLÁUSULAS QUE GANHARAM TELA, E SÓ AS QUE O PERCURSO ATRAVESSOU
  //
  // ⚠️ TRÊS, E NÃO QUINZE. A seção 5.18 tinha 15 cláusulas em
  // `IMPLEMENTADO_NAO_VALIDADO`, e este lote deu tela a quase todas. Mas
  // `VALIDADO_LOCALMENTE` afirma que o caminho foi ATRAVESSADO pela interface, e a maior
  // parte dele não pôde ser: **não há tela de ENTRADA de material**.
  //
  // Sem entrada, não entra estoque; sem estoque, não há preço médio a calcular, não há
  // saída a atender, não há transferência a fazer e não há lote a vencer. O percurso
  // tentou atender a requisição e o servidor recusou — corretamente — dizendo "não se
  // entrega o que não há na prateleira".
  //
  // ⚠️ E A ENTRADA NÃO É UMA TELA A MAIS: ela nasce da LIQUIDAÇÃO. `registrarEntradaFisica`
  // aceita `movimentoAlmoxarifadoId`, e o ENT05 mediu que sem essa amarração a classe
  // contábil fica em zero e a saída é recusada. A superfície da entrada atravessa M05 e
  // M10, e é lote próprio. Pendência: `TELA-DE-ENTRADA-DE-MATERIAL`.
  //
  // Promover as outras doze sem percurso seria dizer que um servidor municipal consegue
  // usá-las. Ele consegue cadastrar, requisitar, inventariar e bloquear. Ele não consegue,
  // ainda, pôr material na prateleira.
  // ══════════════════════════════════════════════════════════════════════════
  "5.18.8": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ENT06} a requisição é criada PELA TELA (/patrimonio/almoxarifado/requisicoes), e a lista RECARREGADA a traz persistida com o acompanhamento — "Faltam 10", derivado da diferença entre o solicitado e as saídas vinculadas ao item. Não há coluna de quantidade atendida, de propósito: ela poderia divergir das saídas no primeiro estorno. O detalhe mostra o item, o total solicitado e o não atendido, e o filtro "com saldo a atender" responde por derivação, não por \`where\`.`,
  },
  "5.18.12": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ENT06} abertura e fechamento atravessados pela tela. ⚠️ E O BLOQUEIO FOI VERIFICADO DE FORA DO INVENTÁRIO: aberto o inventário, a LISTA DE DEPÓSITOS — que não sabe nada sobre inventário — passa a dizer que a movimentação daquele depósito está bloqueada; fechado, ela volta a dizer liberada. É isso que prova que o bloqueio é FATO do domínio e não rótulo de uma tela. A contagem é registrada e a divergência é derivada contra a posição NA DATA DE ABERTURA (contou 7 contra posição 0, sobra 7), e a tela diz que divergência não vira ajuste automático.`,
  },
  "5.18.13": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ENT06} o bloqueio é criado pela tela do depósito (por depósito inteiro ou por material), a listagem RECARREGADA passa a dizer "Bloqueada", e — o que importa — a tentativa de movimentar é RECUSADA pelo servidor com a mensagem nomeando o motivo do bloqueio. Encerrado, o bloqueio NÃO some: ele ganha data de fim e o histórico o mantém, porque o período em que ele valeu é o que explica as recusas daquele intervalo.`,
  },

  // ── 5.18 · ALMOXARIFADO (M10) ──────────────────────────────────────────────
  "5.18.5": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não existe consulta de últimas compras para estimativa de custo: não há pesquisa de preços, cotação nem histórico por produto em nenhum dos módulos (grep por \`ultimasCompras|pesquisaDePreco|cotacaoDePreco|precoUltimaCompra\` em prisma/schema, modules, lib e app: zero). O M11 registra o VALOR do contrato, não o preço do item.`,
  },
  "5.18.7": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A entrada NASCE da liquidação — o material entra porque foi recebido e atestado — e uma liquidação pode abastecer VÁRIAS classes sem que a soma passe do que ela liquidou (m10-almoxarifado.test.ts t2). O guard do elemento fecha a porta ao que não é material de consumo: serviço (39) não entra e o 32 é recusado com mensagem de DECISÃO, não de defeito (t9, t10). ⚠️ O QUE FALTA é o ITEM: não há item de ordem de compra nem de empenho no modelo, então "importar sem redigitação dos produtos" não tem de onde importar. O operador digita valor e classe.`,
  },
  "5.18.15": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ ESTA É A CLÁUSULA FORTE DA SEÇÃO, e ela é forte de verdade. A integração com a contabilidade não é uma rotina que roda depois: a saída e os ajustes têm lançamento PRÓPRIO na mesma transação (\`TEM_ROTEIRO_ALMOXARIFADO\`), e a ENTRADA é lançada pelo M05 — deliberadamente, para não lançar o estoque duas vezes. \`conferirAlmoxarifadoContraRazao\` confronta as duas leituras independentes do mesmo saldo, e o t1 as fecha em 3.000,00 com VPD de 2.000,00. No Anexo 14 o estoque entra como ATIVO e a provisão como PASSIVO, e o superávit ignora os dois (t6). Sem tela: o almoxarifado não tem rota em app/.`,
  },
  "5.18.17": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há relatório por produto, nota fiscal ou setor: nenhum dos três é eixo do movimento de almoxarifado. A nota fiscal chega no M20 (importador) e não se liga ao estoque. Contraprova parcial em test/censo-de-ausencias.test.ts (produto/depósito/centro de custo).`,
  },
  "5.18.18": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O relatório financeiro com entradas, saídas e saldo por período existe — é a seção do almoxarifado no demonstrativo 5.86, com os cortes de data civil provados (m10-alienacao.test.ts t6b/t6c). ⚠️ FALTA o recorte por DEPÓSITO: não há depósito no modelo, e o ente que tem três almoxarifados veria os três somados numa linha só.`,
  },
  "5.18.19": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há resumo anual mês a mês do saldo financeiro do estoque. O demonstrativo responde UM período por vez; a série de doze meses com resultado final do ano não existe como consulta nem como relatório.`,
  },
  "5.18.20": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem lote e sem validade (ver 5.18.14) não há relatório de materiais vencidos ou a vencer, e a seleção por almoxarifado/depósito também não tem eixo. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.18.22": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há virada mensal do almoxarifado — nem o conceito de "mês e ano do almoxarifado" como estado do módulo. O corte temporal aqui é a data do FATO em cada movimento, e o fechamento de período é o do M16 (competência), que é do razão inteiro. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.18.23": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há remessa de saída de produtos. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.18.24": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há remessa e não há requisição — logo não há como vincular uma ou mais requisições a uma remessa. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.18.25": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há fluxo de etapas da remessa (separação, conferência, transporte, entrega). ⚠️ E vale registrar o que existe perto disso: o repositório já sabe fazer fluxo com etapas e segregação — a medição de obra prova "quem mede não aprova" (m11-medicoes-integracao.test.ts t3) e a auditoria interna prova "quem relata não aprecia". O padrão existe; a remessa não.`,
  },

  // ── 5.19 · PATRIMÔNIO (M10) ────────────────────────────────────────────────
  "5.19.4": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O bem entra pela LIQUIDAÇÃO de despesa de capital, com movimento e lançamento balanceado na mesma transação (m10-patrimonio.test.ts t1); liquidação de despesa CORRENTE não incorpora bem e o SELECT prova zero (t2); liquidação anulada no M05 também não (t3). ⚠️ FALTA a ORDEM DE COMPRA e falta o ITEM: sem item não há "importação dos itens sem redigitação dos produtos" — o operador informa valor e classe.`,
  },
  "5.19.5": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ A CLÁUSULA PEDE QUE NÃO HAJA DIFERENÇA DE SALDO ENTRE PATRIMÔNIO E CONTABILIDADE, e aqui isso é estrutural, não uma conciliação que roda depois: \`MovimentoPatrimonial.lancamentoId\` é NOT NULL — não existe movimento de bem sem lançamento contábil. A conta vem da CLASSE, e o empenho de capital com contrato exige a classe, com o bem tendo de ser DELA (m11-limites.test.ts t6). Bem de outra classe é rejeitado (m10-patrimonio.test.ts t6). Sem tela de incorporação individual.`,
  },
  "5.19.6": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Incorporar MAIS do que a liquidação é rejeitado (m10-patrimonio.test.ts t4) — o saldo da liquidação governa, e ele é derivado da soma das incorporações, nunca uma flag. ⚠️ FALTA o controle POR ITEM: o modelo não tem itens de empenho nem de ordem de compra, então "não incorporar duas vezes o mesmo item" é uma pergunta sem eixo. O controle é por VALOR, e duas incorporações de metade cada passam.`,
  },
  "5.19.8": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} O mecanismo de campos personalizados EXISTE e está provado (M25, sete tipos, valor em coluna tipada), mas \`BEM\` não está no enum \`CadastroComCamposAdicionais\` — o rol é FECHADO de propósito, e cada valor corresponde a uma FK real. Acrescentar o bem é um valor no enum, uma coluna em \`ValorDeCampoAdicional\` e uma linha no descritor do molde; é barato, e não foi feito.`,
  },
  "5.19.9": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro contínuo nem recebimento em grande quantidade: \`adquirirBem\` cria um bem por chamada, e não há importação em lote nem tela de digitação sequencial.`,
  },
  "5.19.13": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O motor sabe o residual e PARA nele: a última parcela é o RESTO exato e a seguinte é erro (m10-competencia.test.ts t4), e a base cai com baixa e impairment (tN1, tN2) sem alterar o resto quando nada mudou (tN3, regressão). ⚠️ FALTA a CONSULTA que lista os bens que já atingiram o residual — o dado existe em \`valorContabilDoBem\`, e ninguém pergunta isso ao sistema hoje.`,
  },
  "5.19.15": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Cadastramento, classificação (classe), movimentação (onze tipos com roteiro) e baixa existem e estão provados — inclusive que a classe positiva NÃO mascara a baixa de um bem que já não vale (m10-patrimonio.test.ts t5b), que é o erro que um saldo só por classe esconderia. ⚠️ E A BAIXA PASSOU A TER TELA (${PERCURSO_ENT12} ação "Baixar do acervo" no detalhe do bem, com o valor contábil à vista porque o domínio recusa baixa acima dele). A LOCALIZAÇÃO citada no enunciado também tem: cadastro próprio desde o ENT06 (/patrimonio/localizacoes) e a ação "Mover de localização" no detalhe desde o ENT08 — a evidência anterior dizia que faltava, e estava ESTALE. ⚠️ CONTINUA PARCIAL por outro motivo: não há tela de EDIÇÃO do cadastro do bem (só criação e ações), e "manutenção" é palavra do enunciado.`,
  },
  "5.19.18": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há atualização de inventário por grupos (repartição, responsável, conta contábil, classe): não há inventário, e três dos quatro eixos de agrupamento não existem no modelo. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.24": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O histórico do bem existe e é append-only: \`MovimentoPatrimonial\` guarda cada fato com data, valor, motivo, autor e lançamento, o estorno é fato novo apontando o original (t8) e o duplo estorno é barrado pelo índice parcial, inclusive por INSERT direto (t9). O bem soma só o que é dele e a classe soma tudo, inclusive o sintético (t7). ⚠️ FALTAM os ANEXOS: \`Anexo\` não tem \`bemId\` — não há foto nem documento do bem. E falta o inventário na linha do tempo.`,
  },
  "5.19.25": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O vínculo com o empenho existe pela LIQUIDAÇÃO (\`MovimentoPatrimonial.liquidacaoId\`), e a liquidação aponta o empenho — a cadeia é navegável e é a mesma que impede incorporar mais do que se liquidou. ⚠️ FALTA a ORDEM DE COMPRA, que não existe no repositório, e falta a consulta que mostra esse vínculo a partir do bem.`,
  },
  "5.19.26": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} Depreciação e reavaliação por BEM (o movimento aceita \`bemId\`) com histórico do valor contábil: base 12.000, residual 10%, vida 24 → parcela 450,00 e contábil 11.550,00 (m10-competencia.test.ts t1). A MESMA competência duas vezes é rejeitada e o SELECT prova UM movimento (t2); estornada, ela pode ser refeita, porque quem governa é o SALDO e não uma trava (t3). A alteração a maior e a menor são tipos distintos (\`REAVALIACAO_AUMENTO\`/\`REAVALIACAO_REDUCAO\`), e a redução que estouraria o valor contábil é recusada (t9b). Sem tela. ⚠️ V3 (pacote 2): a reavaliação (aumento/redução) e a redução ao valor recuperável ganharam TELA no detalhe do bem (ações 'reavaliar' e 'registrar-impairment', crachás REGISTRAR_REAVALIACAO/REGISTRAR_IMPAIRMENT, classe derivada do bem); o histórico do bem lista os movimentos de valor com motivo, motivo do rol e guia da receita. Sem percurso de navegador ainda (VALOR-DO-BEM-SEM-PERCURSO). PERCURSO (scripts/smoke-pacote2.ts, 30 passos, 0 falhas, banco dos percursos, .registro-de-execucao/v3-pacote2-percurso.txt): parâmetro (24 meses, 10%) gravado pela tela, prévia PRONTA com 450,00 e versão 1, processamento, recarga com 'já processada' e a memória (base 12000.00). Reavaliação e impairment pela tela ainda sem percurso — por isso continua IMPLEMENTADO_NAO_VALIDADO.`,
  },
  "5.19.29": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ A SEGUNDA CLÁUSULA FORTE DA SEÇÃO. As rotinas seguem as NBCASP: valor residual e vida útil por classe (\`ParametroAtualizacaoClasse\`), os TRÊS métodos que o MCASP 1.1.5 exige — depreciação para tangíveis, amortização para intangíveis, exaustão para recursos naturais — com roteiro próprio cada um (m10-competencia.test.ts t7), reavaliação nos dois sentidos por NBC TSP 07 (t9) e impairment com o teto do valor contábil (t6). Classe SEM parâmetro é erro nomeado com zero escrita, movimento E lançamento (t8) — fail-closed, nunca "deprecia com o default". Sem tela. ⚠️ V3 (pacote 2, unidade 3): o parâmetro (método, vida útil, residual) passou a ser VERSIONADO com ação própria e tela (/patrimonio/parametros-de-atualizacao: todas as classes, histórico de versões, definir/encerrar), e o processamento por competência ganhou tela com PRÉVIA e MEMÓRIA DE CÁLCULO (/patrimonio/competencia): a mesma conta de atualizarCompetencia sem escrever, e a memória gravada na mesma transação do movimento (m10-parametros-versoes.test.ts). Sem percurso de navegador ainda (COMPETENCIA-SEM-PERCURSO). PERCURSO (scripts/smoke-pacote2.ts, 30 passos, 0 falhas, banco dos percursos, .registro-de-execucao/v3-pacote2-percurso.txt): parâmetro (24 meses, 10%) gravado pela tela, prévia PRONTA com 450,00 e versão 1, processamento, recarga com 'já processada' e a memória (base 12000.00). Reavaliação e impairment pela tela ainda sem percurso — por isso continua IMPLEMENTADO_NAO_VALIDADO.`,
  },
  "5.19.31": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O designer de relatórios (M26) permite ao usuário montar relatório próprio, copiar modelo e executar em segundo plano, e o PDF sai do demonstrativo patrimonial pela tela (/patrimonio/bens). ⚠️ FALTA a impressão A PARTIR DA CONSULTA de bens, porque a consulta de bens não existe (5.19.14).`,
  },
  "5.19.32": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A integração com a CONTABILIDADE é estrutural (\`lancamentoId\` NOT NULL) e a integração com COMPRAS existe pela cadeia contrato → empenho → liquidação → bem, com a classe herdada do empenho (m11-limites.test.ts t6). ⚠️ FALTAM FROTA e TRIBUTÁRIO: os dois módulos não existem no repositório — a 5.20 e as seções 5.23–5.36 são AUSENTE_CONFIRMADO no mapa de lacunas.`,
  },
  "5.19.33": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há solicitação de transferência de bem nem notificação ao responsável. ⚠️ O mecanismo de NOTIFICAÇÃO existe (M24) e a fila de assinaturas mostra que o repositório sabe fazer pendência com destinatário; o que falta é a solicitação de transferência. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.34": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Dos cinco eixos pedidos — situação, repartição, espécie, localização e data de aquisição — só a data de aquisição existe no modelo. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.35": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O dado existe e é obrigatório: todo movimento do bem tem \`lancamentoId\` NOT NULL, e o razão é consultável pela tela (/relatorios/livros/razao). ⚠️ FALTA o caminho INVERSO que a cláusula pede — partir do bem e ver os lançamentos dele — porque não há tela de gerenciamento do bem individual.`,
  },
  "5.19.38": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O cálculo da competência existe, é idempotente e é exato: a mesma competência duas vezes é rejeitada com SELECT provando um movimento (m10-competencia.test.ts t2), e a parcela para no residual (t4). ⚠️ FALTA a VIRADA em LOTE — hoje se chama \`atualizarCompetencia\` bem a bem, e não há rotina que percorra os bens cuja depreciação começa no mês corrente. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.40": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O demonstrativo patrimonial agrupa por CLASSE DE BENS e por TIPO de movimento, célula a célula por literal, com saldo anterior + ingressos + atualizações = saldo final (m10-alienacao.test.ts t6). ⚠️ FALTAM os outros agrupamentos pedidos — tipo do bem e responsável — porque os campos não existem.`,
  },
  "5.19.41": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há manutenção de bem, prevista ou realizada. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.43": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há concessão de bem imóvel. Depende do módulo Tributário, que é AUSENTE_CONFIRMADO por inteiro. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.44": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há consulta de contratos de concessão de imóveis nem gerência dos itens do contrato — o M11 registra o contrato como valor e prazo derivados de movimentos, sem itens. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.45": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há matrícula de imóvel nem registro da taxa de concessão em receitas diversas a partir dela. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.19.46": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem concessão (5.19.43) não há situação de pagamento de concessão para consultar dentro do patrimônio. Contraprova em test/censo-de-ausencias.test.ts.`,
  },

  // ── 5.11 · CONTROLE INTERNO (M31) — o que o ENT03b deixou sem medir ────────
  "5.11.1": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${CENSO} Acesso por senha (scrypt) com permissão POR AÇÃO DE NEGÓCIO e por perfil, negando por omissão — sem perfil o usuário não pode nada (modules/m16-travamento/autorizacao.ts). A "caracterização do usuário" é o censo de ações: 192 serviços e 185 ações, com grep-teste provando as DUAS direções (m16-censo.test.ts). ${SMOKE_03B} entra nas auditorias com usuário restrito: quem não tem a ação não vê o botão, e vê o motivo.`,
  },
  "5.11.4": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há checklist REUTILIZÁVEL de onde selecionar itens: \`ItemDeChecklist\` pertence a UMA auditoria (\`auditoriaId\` NOT NULL, \`@@unique([auditoriaId, ordem])\`). Cada auditoria escreve os próprios itens do zero — não existe modelo de checklist, e portanto não existe "selecionar apenas os itens que se deseja analisar". Pendência CHECKLIST-GRUPOS. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.11.5": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Incluir itens novos funciona e está provado — o item entra com ordem, pergunta e base legal, e a resposta que muda deixa as DUAS, append-only (m31-controle-interno.test.ts t2). ⚠️ FALTA DUPLICAR: sem checklist como entidade própria (5.11.4) não há o que copiar. Pendência CHECKLIST-GRUPOS.`,
  },
  "5.11.6": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A auditoria se vincula ao ÓRGÃO (\`AuditoriaInterna.orgaoId\`, FK real, com índice), e o órgão é o mesmo do orçamento — não uma segunda tabela de órgãos. ⚠️ FALTA a UNIDADE e falta o CENTRO DE CUSTO, que o enunciado pede explicitamente: nenhum dos dois é eixo da auditoria hoje.`,
  },
  "5.11.7": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há agendamento de auditoria: nem evento, nem data prevista, nem monitoramento, nem cancelamento com justificativa. A auditoria nasce já aberta pelo movimento de ABERTURA. ⚠️ O M24 (notificações) existe e seria o destino natural do "notificar"; o que falta é o agendamento. Pendência AUDITORIA-EVENTOS.`,
  },
  "5.11.8": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há visibilidade configurável por tipo (todos / centro de custo / apenas responsáveis). A autorização do M16 é por AÇÃO e por unidade gestora — ela responde "quem pode abrir auditoria", não "quem pode VER esta auditoria". ⚠️ São perguntas diferentes, e tratar uma como a outra daria acesso de leitura a quem tem acesso de escrita em outro órgão.`,
  },
  "5.11.12": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro de eventos nem de parâmetros do controle interno — é a mesma ausência que sustenta a 5.11.13 (instaurar auditoria a partir de evento), já marcada AUSENTE_CONFIRMADO no ENT03b. Pendência AUDITORIA-EVENTOS.`,
  },
  "5.11.14": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Os anexos existem, com autorização POR REGISTRO (o M22 confere o dono antes de entregar o arquivo), sha256, mime e tamanho, e a auditoria é um dos donos possíveis (\`Anexo.auditoriaId\`). ⚠️ FALTA a GESTÃO que a cláusula pede: não há título, descrição, ano nem tipo no anexo, e portanto não há busca por palavra-chave nem alteração. E EXCLUIR não vai existir: o anexo é append-only por decisão do projeto — a remoção seria um fato novo, não um DELETE.`,
  },

  // ── 5.17 · COMPRAS, LICITAÇÕES E CONTRATOS (M11) ───────────────────────────
  //
  // ⚠️ O M11 TEM O PROCESSO E O CONTRATO; NÃO TEM A COMPRA. A cadeia
  // processo → homologação → contrato → aditivo → empenho → liquidação → medição está
  // construída e é das partes mais bem provadas do repositório. O que não existe é a
  // metade de COMPRAS: produto, proposta, lance, comissão, fornecedor, ordem de compra,
  // ata de registro de preços, plano anual e pesquisa de preços — nenhum deles tem modelo.
  //
  // ⚠️ E O CENSO ACHOU CINCO TABELAS MORTAS. Duas na 5.17 (`ParecerContrato` e
  // `CertidaoFornecedor`) e mais três quando o guard ficou correto
  // (`TipoLancamentoReceitaSagres`, `DeParaContaSiga`, `DeParaFonteSiga`): existem no
  // schema, com os tipos certos, e NENHUMA linha de código escrita à mão as lê ou escreve.
  // É o modo de falha mais perigoso deste inventário — a tabela PARECE atendimento, e quem
  // lê o schema procurando "o sistema registra parecer jurídico?" conclui que sim.
  // Virou guard permanente: test/modelo-sem-caso-de-uso.test.ts.
  "5.17.1": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Da Lei 14.133 estão cumpridos e provados: o rol FECHADO de modalidades, com oito valores e os dois Records cobrindo os seis tipos (m11.test.ts t6); o teto do art. 75 aplicado de forma ESTRITA — 65.492,10 passa e 65.492,11 não (m11-limites.test.ts t2); o limite VIGENTE NA DATA do contrato, com fail-closed quando não há parâmetro, nunca "passa porque falta limite" (t5); e o teto interno mais restritivo VENCENDO o oficial (t3). ⚠️ FALTA o art. 125 (25%/50% de acréscimo e supressão), que é pendência DECLARADA no próprio código (modules/m11-licitacoes/contratos.ts). "Plena conformidade" é enunciado que nenhuma marcação pode afirmar por inteiro.`,
  },
  "5.17.4": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} O mecanismo de campos personalizados existe e está provado (M25, sete tipos, coluna tipada), mas não há PRODUTO para recebê-los e \`PRODUTO\` não está no enum \`CadastroComCamposAdicionais\`, que é fechado por decisão.`,
  },
  "5.17.7": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há imagem de referência de produto. O M22 sabe guardar arquivo com sha256, mime e autorização por registro; o que falta é o produto como dono possível de um anexo.`,
  },
  "5.17.10": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há histórico de aquisições por material: não há produto, não há ordem de compra e não há valor unitário em lugar nenhum do modelo. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.11": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há rol de itens. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.12": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há solicitação de cadastro de produto com aprovação. ⚠️ As duas peças que ela exigiria existem: o M24 notifica de verdade (o trâmite do M21 notifica quem está lotado no destino — m21-protocolo.test.ts t12) e o M21 sabe fazer aprovação por etapa. Falta o produto.`,
  },
  "5.17.13": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro de comissões de licitação, nem pregoeiro, nem leiloeiro, nem o ato que os designa. Contraprova em test/censo-de-ausencias.test.ts.`,
  },

  "5.17.15": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} O número do processo é informado pelo operador; não há sugestão sequencial por modalidade nem anual. ⚠️ O repositório JÁ SABE numerar com segurança: o M21 numera 1/2026, reinicia no exercício seguinte e duas aberturas CONCORRENTES não recebem o mesmo número (m21-protocolo.test.ts t1, t2, t3). O padrão existe e não foi aplicado aqui.`,
  },
  "5.17.16": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} ⚠️ NÃO É SÓ AUSÊNCIA, É IMPEDIMENTO DE MODELO: \`ProcessoLicitatorio.modalidade\` é NOT NULL. Digitar o processo sem modalidade e escolhê-la depois do parecer jurídico é literalmente impossível hoje — exigiria tornar a coluna anulável e decidir o que a homologação faz enquanto ela está vazia.`,
  },
  "5.17.17": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} ⚠️ ACHADO: O MOTOR DE WORKFLOW EXISTE — no M21, e é bom. \`EtapaDoProcesso\` é a CÓPIA do roteiro feita na abertura (mudar o roteiro depois não reescreve o passado — m21-protocolo.test.ts t1), a situação é DERIVADA dos movimentos e nunca uma coluna (m21-dominio.test.ts t1–t8), o prazo conta do RECEBIMENTO e não do envio (t9–t12), quem não está lotado no setor não tramita mesmo tendo a permissão da unidade (t14) e a taxa em aberto bloqueia a tramitação (t13). ⚠️ O QUE FALTA é o VÍNCULO: \`ProcessoLicitatorio\` não se liga a \`Processo\`. A licitação não usa o workflow que o ente já tem.`,
  },
  "5.17.18": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não existe minuta de edital como cadastro, e \`Anexo\` não tem dono do tipo licitação ou contrato — o rol de donos é fechado e cada um é uma FK real. Anexar documento à minuta exigiria as duas coisas.`,
  },
  "5.17.19": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem minuta (5.17.18) não há visualização agrupada dos documentos dela. ⚠️ A classificação de anexo também não existe: \`Anexo\` guarda nome, mime, tamanho, sha256 e origem — não tipo nem classificação.`,
  },
  "5.17.20": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há emissão de edital, ata de sessão, aviso de licitação nem termo de homologação. ⚠️ A HOMOLOGAÇÃO em si existe e é forte — por EVENTO, com as duas verdades (cadastro × evento) confrontadas e o duplo evento barrado (m11-integracao.test.ts t7), e processo sem homologação não vira contrato (t8). O que falta é o DOCUMENTO que a formaliza.`,
  },
  "5.17.21": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} ⚠️ ACHADO DO CENSO — SCHEMA SEM CASO DE USO. \`ParecerContrato\` existe no schema com \`CONTABIL\` entre os quatro tipos, e NENHUMA linha de código escrita à mão escreve ou lê essa tabela (as 57 ocorrências do nome estão todas em prisma/generated/). A tabela PARECE atendimento e não atende nada. Virou guard permanente: test/modelo-sem-caso-de-uso.test.ts. Pendência SCHEMA-SEM-CASO-DE-USO.`,
  },
  "5.17.22": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Mesmo achado da 5.17.21: \`ParecerContrato\` tem \`JURIDICO\` e \`TECNICO\` entre os tipos e nenhum caso de uso os escreve. ⚠️ E há uma segunda distância: o parecer modelado pertence ao CONTRATO, e a cláusula o pede no PROCESSO — que é antes, e é onde o parecer jurídico decide a modalidade (5.17.16). Pendência SCHEMA-SEM-CASO-DE-USO.`,
  },
  "5.17.23": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há recurso nem impugnação do processo, nem julgamento deles. Contraprova parcial em test/censo-de-ausencias.test.ts (comissão, que julgaria).`,
  },
  "5.17.24": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há anulação nem revogação do processo licitatório — nem total nem parcial. \`situacaoDoProcesso\` deriva de \`dataHomologacao\` e conhece exatamente dois estados. ⚠️ A ANULAÇÃO existe e é rigorosa noutro lugar: no empenho, na liquidação e no pagamento, sempre por fato novo append-only, com estorno cruzado e unicidade no banco.`,
  },
  "5.17.25": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há proposta nem classificação de propostas do pregão presencial. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.26": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há lances, nem por lote nem por item, nem tela de sessão. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.27": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem rodada de lances não há negociação ao final dela. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.28": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há julgamento com tratamento diferenciado de ME/EPP (LC 123/2006): não há proposta, não há porte do fornecedor e não há fornecedor. ⚠️ A dispensa por ME-EPP aparece no repositório APENAS como hipótese da justificativa de quebra de ordem cronológica do art. 141 — que é outro instituto, e não julga proposta nenhuma.`,
  },
  "5.17.29": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há participante da licitação, e portanto não há documento de participante. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.30": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há proposta com valor unitário e total, nem quadro comparativo por fornecedor. ⚠️ E vale nomear a razão de fundo: sem ITEM não há valor unitário em lugar nenhum do sistema — a mesma ausência que derruba a 5.18.11 (preço médio) e a 5.19.6 (saldo do item do empenho).`,
  },
  "5.17.31": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há desclassificação de participante. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.32": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há inabilitação de participante nem a convocação do segundo colocado que ela dispara no pregão. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.33": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} A consulta consolidada do processo não existe porque quatro dos cinco dados que ela reúne não existem (lances, requisições, vencedores, propostas). ⚠️ O que EXISTE e é consultável é o relatório de processos licitatórios do 5.103, com cada célula provada por literal e as três linhas de fechamento (m11-limites.test.ts t8, t9) — outra pergunta, respondida bem.`,
  },
  "5.17.34": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Licitação multientidade depende do eixo de ENTIDADE, que não existe no repositório (docs/adr/ADR-eixo-de-municipio.md). O lote de tenancy segue de pé desde o ENT01 — e enquanto ele não vier, "entidade principal e participantes" não tem onde ser modelado.`,
  },
  "5.17.35": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há fluxo de licitação de publicidade, nem sessão de abertura de envelopes, nem julgamento de proposta técnica.`,
  },
  "5.17.36": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há pontuação, índice técnico nem classificação automática por preço e técnica. Contraprova em test/censo-de-ausencias.test.ts (proposta).`,
  },
  "5.17.37": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há comissão para relacionar ao processo nem membros para selecionar. ⚠️ A SEGREGAÇÃO que uma comissão existe para garantir já está provada duas vezes no repositório — "quem mede não aprova" (m11-medicoes-integracao.test.ts t3, t3b) e "quem relata não aprecia" no controle interno. O padrão existe; a comissão não.`,
  },
  "5.17.38": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro de publicações da licitação, com data e veículo. Contraprova em test/censo-de-ausencias.test.ts.`,
  },

  "5.17.40": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há ata de registro de preços. ⚠️ É a família "naquela data" de novo, e foi nomeada na varredura do ENT03b: saldo de ata é pergunta com eixo TEMPORAL, e construí-la como coluna de saldo repetiria o erro que o contrato já não comete (lá o valor é DERIVADO dos movimentos — m11.test.ts t1). Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.41": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ata não há fiscal nem gestor de ata. O contrato TEM fiscal (\`fiscalNome\`, \`fiscalCpf\`, \`fiscalDesignacao\`); a ata não existe.`,
  },

  "5.17.43": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cópia de processo licitatório. ⚠️ O padrão existe no M26: \`copiarModeloDeRelatorio\` copia e a cópia é independente do original, com teste. Aplicá-lo ao processo é trabalho, não descoberta.`,
  },
  "5.17.44": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há credenciamento/chamamento nem definição de cotas. As hipóteses de dispensa modeladas são três (\`POR_VALOR_OBRAS\`, \`POR_VALOR_COMPRAS\`, \`OUTRAS\`), com CHECK no banco que pega o INSERT direto nos dois sentidos (m11-limites.test.ts t7) — e nenhuma delas é credenciamento.`,
  },
  "5.17.45": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há publicação seletiva de dados e documentos do processo na internet. O M13 publica datasets de execução orçamentária; licitação não está entre eles, e não há o que escolher publicar porque itens, certidões e propostas não existem.`,
  },
  "5.17.47": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem coleta de preços não há critério de preço médio, maior ou menor sobre ela. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.49": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há integração entre a licitação e o processo digital: \`ProcessoLicitatorio\` não se liga a \`Processo\` do M21. ⚠️ Os dois lados existem e são bons — falta a ponte, que é uma FK e um caso de uso. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.50": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem o vínculo da 5.17.49 não há compartilhamento automático de anexos entre os dois processos — e \`Anexo\` também não aceita licitação como dono. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.55": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem solicitação de compra não há notificação de nova solicitação. O M24 notifica de verdade e está provado no trâmite do M21 (t12); falta o fato a notificar.`,
  },
  "5.17.57": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem requisição ao Compras não há autorização dela com reserva de recursos. ⚠️ A RESERVA em si existe, é rigorosa e está provada (\`ReservaDotacao\`, m11-integracao.test.ts t6) — o que falta é a requisição que a dispararia.`,
  },
  "5.17.58": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O relatório de processos licitatórios existe e é do tipo OURO — cada célula conferida por literal, com as três linhas de fechamento L1/L2/L3, e a L1 quebrando NOMEANDO o valor se a coluna de aditivos ignorar as supressões (m11-limites.test.ts t8, t9). ⚠️ FALTA "da abertura à conclusão": o relatório mostra o que o modelo tem (processo, contrato, aditivos, empenhos), e abertura de sessão, propostas, recursos e adjudicação não existem.`,
  },
  "5.17.59": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há relação mensal de compras para o TCU (art. 1º, VI, da Lei 9.755/98). As remessas que existem são para tribunais ESTADUAIS (SAGRES/TCE-PB e SIGA/TCM-BA), com leiaute próprio.`,
  },
  "5.17.60": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há proposta por lote nem rateio dela entre subitens. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.61": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A escolha de ASSINANTES existe e é forte: \`FilaDeAssinatura\` com signatários ordenados, e a assinatura da despesa (empenho, liquidação, OP) tem fila própria com teste (modules/m05-despesa/m05-assinatura-da-despesa.test.ts). A geração de PDF existe em toda a série de relatórios. ⚠️ FALTAM os OUTROS FORMATOS (html, doc, xls) e falta a escolha de quantidade de vias — e falta o documento de licitação, que não existe (5.17.20).`,
  },
  "5.17.62": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há integração com o Compras Públicas nem com nenhum provedor de pregão eletrônico. ⚠️ É DEPENDÊNCIA EXTERNA quando existir (credencial, contrato, endpoint), e \`packages/integracao\` — o cofre de credenciais por entidade — está adiado para o ENT03d. Marcada AUSENTE e não DEPENDENCIA_EXTERNA porque não há sequer o lado de cá.`,
  },
  "5.17.63": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A modalidade e o número da licitação VIAJAM na remessa: o leiaute SAGRES 2026v11 carrega \`modalidadeLicitacao\` e \`numLicitacao\` no registro do empenho, com validação e golden (adapters/tribunais/tce-pb/sagres/). ⚠️ O QUE FALTA são os registros PRÓPRIOS de licitação e contrato do leiaute — participantes, propostas, itens, atas — que dependem dos modelos ausentes desta seção.`,
  },

  "5.17.65": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há controles de Registro de Preços do art. 40 da Lei 14.133. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.66": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ata de registro de preços e sem solicitação ao compras, não há controle de entrega das mercadorias licitadas. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.67": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há modelo de edital padrão. ⚠️ O M26 (designer) tem gramática própria, cópia de modelo e execução em segundo plano — é o ponto de partida honesto para modelo de documento, e não foi aplicado a edital.`,
  },
  "5.17.68": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há proposta comercial online. Mesma classe da 5.17.48: exige acesso de TERCEIRO ao sistema, que a arquitetura de acesso atual (todo usuário é servidor, com perfil e unidade gestora) não contempla.`,
  },
  "5.17.69": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há plano anual de licitações. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.70": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem plano anual não há intenção de licitação com centro de custo e compartilhamento. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.71": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há adesão de secretarias a intenção de licitação. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.72": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem intenção e sem produto não há itens da intenção com unidade de medida. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.73": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem intenção não há planilha de preços gerada a partir dela. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.74": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem rol de itens (5.17.11) e sem intenção (5.17.70) não há importação de um no outro. Contraprova em test/censo-de-ausencias.test.ts.`,
  },

  "5.17.76": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ O ALERTA É DOS COMPORTAMENTOS MAIS BEM PROVADOS DO REPOSITÓRIO. A janela é do PRÓPRIO contrato (\`diasAlertaVencimento\`) — 30 dias não alerta o que 90 alertaria — e inclui as duas bordas; VENCIDO NÃO É "A VENCER", e as duas listas são disjuntas; o alerta lê o fim DERIVADO, então prorrogar tira o contrato da janela; a contagem é em DIAS DE CALENDÁRIO e é 0 no próprio dia do vencimento, porque o contrato ainda vale nele; e a resposta NÃO depende da hora em que alguém abriu a tela nem de entrar ou sair do horário de verão (m11-vigencia-alerta.test.ts, 13 casos). Sem tela que a mostre.`,
  },
  "5.17.77": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há adjudicação como ato, e portanto não há liberação da diferença entre o estimado e o vencido. ⚠️ A reserva existe e o saldo é derivado — o que falta é o FATO que dispararia a liberação.`,
  },
  "5.17.78": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há rescisão de contrato: \`TipoMovimentoContratual\` tem seis valores (acréscimo, supressão, prorrogação e os três estornos) e nenhum deles é rescisão. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.79": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Três dos cinco tipos pedidos existem como movimento contratual com efeito real e estorno próprio: acréscimo, supressão (diminuição) e prorrogação — e a visualização do tipo de alteração é o próprio movimento, append-only. ⚠️ FALTAM equilíbrio econômico-financeiro, rescisão e "outros". Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.80": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Aditivos e supressões se registram, e o bloqueio por SALDO é exato: supressão maior que o saldo é rejeitada, IGUAL ao saldo passa e +0,01 depois não (m11.test.ts t3); o acréscimo não pode levar uma dispensa a ALCANÇAR o teto do art. 75 (m11-limites.test.ts t4). ⚠️ FALTA o bloqueio do art. 125 (25% em geral, 50% em reforma de edifício) — é PENDÊNCIA DECLARADA no próprio código (modules/m11-licitacoes/contratos.ts), não um esquecimento.`,
  },
  "5.17.81": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há alteração por equilíbrio econômico-financeiro. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.82": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há apostila. ⚠️ E a distinção importa juridicamente: apostila NÃO é aditivo — ela registra reajuste previsto no contrato, sem alterar o pactuado. Registrá-la como \`ACRESCIMO_VALOR\` faria o sistema declarar um aditivo que não houve, e é isso que o TCE lê. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.83": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1: DesignacaoNoContrato define GESTOR e FISCAL por pessoa e usuário conferidos, ato e vigência derivada, com revogação como fato; quem gere não fiscaliza o mesmo contrato (ACUMULO-DE-GESTOR-E-FISCAL); a designação é o que autoriza os atos do acompanhamento. O campo em texto antigo do fiscal segue como carga anterior. Testes: test/contrato-acompanhado.test.ts d1, f2, f4; percurso smoke-contrato-acompanhado 1.2, 1.3, 7.1, 7.2 (25/0 sobre 5937f41). ⚠️ PARCIAL: a designação é por contrato, não por ADITIVO, que o enunciado também pede.",
  },
  "5.17.84": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro de publicações do contrato. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.85": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O controle de vencimento de CONTRATOS existe e é o da 5.17.76, com as duas listas disjuntas e a janela por contrato. ⚠️ FALTAM os outros dois alvos do enunciado: autorizações de fornecimento (que são ordens de compra, ausentes) e o relatório específico de termos aditivos a vencer.`,
  },
  "5.17.86": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há cadastro de fornecedor nem CRC. ⚠️ O contratado existe como DOIS CAMPOS no contrato (\`contratadoDocumento\`, \`contratadoNome\`), não como entidade — e a normalização do documento já trata o mascarado e o limpo como a MESMA chave, que é o que impede duas empresas iguais (m11-vigencia-alerta.test.ts). O M19 tem cadastro de pessoas; fornecedor não se liga a ele. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.87": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} ⚠️ SCHEMA SEM CASO DE USO — o segundo achado do gênero. \`CertidaoFornecedor\` está no schema com tipo, número, emissão, validade e índice por validade, e NENHUMA linha de código escrita à mão a escreve ou lê (as duas menções fora de prisma/generated/ são comentários). Guard permanente: test/modelo-sem-caso-de-uso.test.ts. Pendência SCHEMA-SEM-CASO-DE-USO.`,
  },
  "5.17.88": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há registro de suspensão ou impedimento de licitar, nem data de reabilitação. ⚠️ É a família "naquela data" outra vez: a pergunta certa é "este fornecedor estava impedido NA DATA da contratação", e um campo booleano responderia só "agora".`,
  },
  "5.17.89": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem caso de uso de certidão (5.17.87) não há controle de validade nem relatório de vencidas e a vencer. ⚠️ E o repositório JÁ SABE fazer exatamente este relatório: a janela de alerta do contrato, com as duas listas disjuntas, é o mesmo problema resolvido.`,
  },
  "5.17.90": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Mesmo caso da 5.17.89: a tabela existe, o comportamento não. Pendência SCHEMA-SEM-CASO-DE-USO.`,
  },
  "5.17.91": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há responsável legal nem sócios do fornecedor — não há fornecedor. ⚠️ O M19 modela pessoa com versões e movimentos de papel; ligar fornecedor a pessoa seria o caminho, e não existe. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.92": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há índices contábeis do fornecedor (liquidez, solvência) nem os saldos que os alimentam. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.93": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há atestado de capacidade técnica. Ele exigiria a lista de produtos/serviços fornecidos à entidade, que depende do item, ausente.`,
  },
  "5.17.94": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} A validade de documento do fornecedor não é verificada na emissão de contrato nem de ordem de compra: a tabela de certidões não tem caso de uso e a ordem de compra não existe. ⚠️ É um guard AUSENTE numa borda de escrita — a classe de lacuna que este projeto trata como mais cara, porque o efeito (contrato emitido) é durável. Pendência SCHEMA-SEM-CASO-DE-USO.`,
  },
  "5.17.95": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há relatório gerencial por fornecedor. O eixo existe no banco (\`Contrato.contratadoDocumento\` tem índice), mas não há consulta nem tela que o use, e ordens de compra não existem.`,
  },
  "5.17.98": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há parcelamento de ordem de compra nem SUBEMPENHO. ⚠️ ACHADO: o leiaute do TCM-BA PEDE o número do subempenho, e o gerador repete o número do empenho porque subempenho não existe aqui (adapters/tribunais/tcm-ba/siga/specs/pag-emp2.ts). A remessa declara um conceito que o modelo não tem — e o comentário no código diz exatamente isso: "branco não equivale".`,
  },
  "5.17.101": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ordem de compra não há retenção nela. ⚠️ As RETENÇÕES existem e são um módulo inteiro (M07 extraorçamentário, com tipos de consignação parametrizados e teste próprio) — só que no PAGAMENTO, que é onde elas acontecem de fato.`,
  },
  "5.17.104": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ata de registro de preços não há como impedir ordem de compra sobre ata vencida. ⚠️ O guard ANÁLOGO existe e é dos melhores do repositório: a vigência do contrato bloqueia o empenho, a borda passa, o dia seguinte não, e a prorrogação libera (m11-integracao.test.ts t2) — a mesma pergunta, respondida para contrato.`,
  },
  "5.17.106": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ordem de compra não há extrato de movimentação dela. Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.107": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há consulta de débitos do contribuinte: o módulo tributário é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). ⚠️ E a consulta de regularidade fiscal do CONTRATADO também não existe pelo outro lado — \`CertidaoFornecedor\` é tabela sem caso de uso (5.17.87).`,
  },
  "5.17.108": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Os dados de contrato que a execução carrega viajam na remessa: o empenho leva modalidade e número da licitação no leiaute SAGRES 2026v11, com validação e arquivo golden (adapters/tribunais/tce-pb/sagres/). ⚠️ FALTAM os registros PRÓPRIOS de contrato do leiaute — aditivos, publicações, fiscais, rescisão — vários deles dependendo de modelos ausentes desta seção.`,
  },
  "5.17.109": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há gestão de parcerias da Lei 13.019/2014 (OSC): nem termo de fomento, nem de colaboração, nem acordo de cooperação, nem chamamento público. ⚠️ O CONVÊNIO de repasse existe desde o ENT03b, com prestação de contas, glosa e três saldos independentes — e é instituto DIFERENTE: convênio entre entes públicos não é parceria com organização da sociedade civil, e tratá-los como o mesmo cadastro produziria prestação de contas com regra errada.`,
  },
  "5.17.110": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há Manifestação de Interesse Social pelo portal. Depende de acesso de terceiro (cidadão/OSC), que a arquitetura de acesso atual não contempla — a mesma raiz da 5.17.48 e da 5.17.68.`,
  },
  "5.17.111": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há menu de parcerias no portal da transparência. O M13 publica datasets de execução orçamentária; parcerias não estão entre eles, e a 5.17.109 é ausente.`,
  },
  "5.17.112": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há agenda pública de licitações. ⚠️ Ela dependeria de eventos datados do processo (sessão de abertura, julgamento), e o processo hoje tem exatamente uma data relevante — a homologação.`,
  },
  "5.17.113": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há relação entre contrato e bem imóvel para concessões — nem itens de contrato aos quais relacionar o bem. É a mesma ausência das cláusulas 5.19.43 a 5.19.46. Contraprova em test/censo-de-ausencias.test.ts.`,
  },

  // ── 5.34 · DÍVIDA ATIVA (M10 — só a rotina contábil) ───────────────────────
  //
  // ⚠️ A SEÇÃO MEDE DUAS COISAS DIFERENTES COM O MESMO NOME. O M10 tem a dívida ativa
  // CONTÁBIL — o art. 39 da Lei 4.320/64, o reconhecimento do ativo, a atualização e a
  // baixa, tudo com lançamento na mesma transação e amarração com o razão. A 5.34 pede o
  // módulo TRIBUTÁRIO: parcelamento, REFIS, execução fiscal, CDA, protesto em cartório,
  // portal do cidadão. São 25 das 28 cláusulas, e nenhuma tem uma linha escrita.
  //
  // ⚠️ E É POR ISSO QUE A TELA DESTE LOTE **NÃO** OFERECE O RECEBIMENTO: recebimento é
  // receita orçamentária e entra pela guia (M04). Uma ação aqui criaria o segundo caminho
  // para o mesmo fato — e o segundo contaria a receita duas vezes, porque a VPA já foi
  // reconhecida na inscrição.
  "5.34.1": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há livro de registro da dívida ativa nem emissão dele." },
  "5.34.2": {
    situacao: "PARCIAL",
    evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). A DATA DE INSCRIÇÃO existe e é a data do FATO (`MovimentoDividaAtiva.dataMovimento`), visível na aba de histórico do cadastro novo deste lote. FALTA o número do LIVRO, que depende da 5.34.1.",
  },
  "5.34.3": {
    situacao: "PARCIAL",
    evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). O ESTORNO da inscrição existe, é fato novo append-only e o duplo estorno é barrado pelo índice parcial (m10-divida-ativa.test.ts t4). FALTA a condicional que a cláusula descreve — \"só se não houve movimentação posterior\": hoje o estorno do RECEBIMENTO é porta fechada, mas o da inscrição não confere o que veio depois.",
  },
  "5.34.4": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há parcelamento nem programa de recuperação fiscal." },
  "5.34.5": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Sem parcelamento não há número máximo de acordos por inscrição." },
  "5.34.6": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há prazo de adesão por modalidade de parcelamento." },
  "5.34.7": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há desconto nem prazo de adesão para pagamento à vista." },
  "5.34.8": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há consulta de parcelamentos, porque não há parcelamento." },
  "5.34.9": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há termo de parcelamento nem responsável pelo ato." },
  "5.34.10": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há portal do cidadão. Ele é de uma classe que o repositório ainda não tem: acesso de TERCEIRO ao sistema — hoje todo usuário é servidor do ente, com perfil e unidade gestora." },
  "5.34.11": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há permissão por modalidade de parcelamento. A autorização do M16 é por AÇÃO DE NEGÓCIO e por unidade gestora, e é boa nisso — mas ela não recorta por parâmetro do ato." },
  "5.34.12": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Sem parcelamento não há cancelamento dele, individual, geral ou automático." },
  "5.34.13": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há método de cancelamento por imputação nem por abatimento proporcional." },
  "5.34.14": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há antecipação de parcelas." },
  "5.34.15": { situacao: "PARCIAL", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). A consulta por DEVEDOR existe desde este lote — a listagem do molde filtra por identificador ou devedor e soma a seleção no servidor. FALTA o recorte por IMÓVEL e por EMPRESA (não há cadastro imobiliário nem mobiliário) e falta a separação administrativa/judicial/cartório, que não é eixo do modelo." },
  "5.34.16": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há contagem de parcelamentos nem dados de ajuizamento." },
  "5.34.17": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). O valor da dívida ativa aqui é UM número por movimento; a decomposição em tributo, correção, multa e juros não existe como eixo. Simular valores futuros exigiria um motor de cálculo tributário, que é o maior vazio do projeto." },
  "5.34.18": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há responsável tributário. O devedor é um par nome/documento no cadastro, não uma relação com o M19." },
  "5.34.19": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há classificação administrativa/judicial/cartório, e portanto não há privilégio por ela." },
  "5.34.20": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há processo de execução fiscal, nem geração em lote." },
  "5.34.21": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Sem execução fiscal não há honorários nem custas." },
  "5.34.22": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há CDA nem petição de dívida ativa." },
  "5.34.23": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há remessa para cartório. Quando existir, será DEPENDENCIA_EXTERNA — depende de convênio com o cartório de protesto." },
  "5.34.24": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Sem remessa a cartório não há desistência nem cancelamento de protesto." },
  "5.34.25": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      SMOKE_04 +
      " A INSCRIÇÃO foi exercitada pela tela e é ACEITA com o roteiro parametrizado " +
      "(D 1.1.2.5.1.01.99 dívida ativa tributária contra C 4.6.3.9.1.00.00 ganho por " +
      "incorporação de ativos — inscrever cria ATIVO, não receita: a receita só ocorre " +
      "no recebimento). O cancelamento acima do saldo é RECUSADO e a recusa NOMEIA o " +
      "saldo derivado real, o que prova que a inscrição persistiu e que o saldo vem dos " +
      "movimentos. Os oito tipos de movimento têm roteiro. ⚠️ A CONSULTA DIÁRIA da " +
      "segunda metade existe POR REGISTRO (aba histórico), não como movimento do dia do " +
      "ente inteiro; e o roteiro é ÚNICO por tipo, então IPTU e ISS caem na mesma conta " +
      "genérica — pendência DIVIDA-ATIVA-SEM-TRIBUTO-NO-ROTEIRO.",
  },
  "5.34.26": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há inscrição automática mensal de débitos em atraso — não há débito de exercício a inscrever, porque não há lançamento tributário." },
  "5.34.27": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há emissão de guia pelo portal do cidadão." },
  "5.34.28": { situacao: "AUSENTE_CONFIRMADO", evidencia: "${CENSO} A dívida ativa que existe é a CONTÁBIL (M10): inscrição, atualização por competência idempotente, cancelamento e recebimento, cada um com roteiro parametrizado e conferência contra o razão. O que esta cláusula pede é do módulo TRIBUTÁRIO — que é AUSENTE_CONFIRMADO por inteiro no mapa de lacunas (seções 5.23–5.36, 562 cláusulas sem código). Não há notificação de débito em PDF nem geração em lote." },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENT05 — O MODELO DAS TRÊS SEÇÕES QUE O CENSO DERRUBOU
  //
  // ⚠️ TODAS ENTRAM COMO `IMPLEMENTADO_NAO_VALIDADO`, E ISSO É A MEDIDA HONESTA. Cada uma
  // tem MODELO, CASO DE USO e TESTE contra banco — mas NENHUMA foi exercitada por tela:
  // o ENT05 foi lote de MODELO, e as telas pelo molde não entraram. `VALIDADO_LOCALMENTE`
  // exige percurso de navegador, e chamá-las de validadas seria dizer que um servidor
  // municipal consegue usá-las hoje. Ele não consegue — não há tela.
  // ═══════════════════════════════════════════════════════════════════════════

  "5.18.1": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): As entradas, saidas e transferencias existem como MOVIMENTO FISICO com quantidade, deposito e lote (MovimentoFisicoDeEstoque). A transferencia e operacao COMPOSTA (par de pernas sob um operacaoId), e a saida move os DOIS eixos na mesma transacao. A 'atualizacao automatica do estoque' NAO virou coluna: a posicao e a soma de (quantidade x sinal) ate uma DATA CIVIL - decisao D1 da varredura, e a propria 5.18.16 a exige ao pedir o saldo ANTERIOR ao periodo." },
  "5.18.2": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): registrarSaidaFisica recusa saida maior que a posicao do material no deposito na data, nomeando o que ha. O atendimento de requisicao confere o saldo NAO ATENDIDO do item antes de gravar." },
  "5.18.3": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): ParametroDeEstoque guarda minimo e maximo POR MATERIAL E POR DEPOSITO (o minimo de luva no almoxarifado central nao e o do posto). materiaisAbaixoDoMinimo compara a POSICAO DERIVADA contra o parametro, e aceita data." },
  "5.18.4": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): CotaDeConsumo por setor, material e competencia AAAA-MM. registrarSaidaFisica recusa quando a soma do mes estoura o limite. A competencia vem da DATA DO FATO: uma retirada de 31/12 as 23h50 civis consome a cota de dezembro, e ha fixture em hora de borda provando isso." },
  "5.18.6": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): registrarRequisicaoDeMaterial cria a requisicao com itens; o atendimento e a saida fisica que aponta para o item." },
  "5.18.9": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Atendimento PARCIAL provado: requisicao de 100, saida de 30, saldo nao atendido de 70. Atender alem do pedido RECUSA." },
  "5.18.10": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): MovimentoFisicoDeEstoque.setorId registra o centro de custo que consumiu - o Setor do M21, cadastro que ja existe." },
  "5.18.11": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): O preco medio e DERIVADO da mesma janela (valor da posicao dividido pela quantidade da posicao) e o preco EFETIVAMENTE aplicado e gravado no movimento de saida. Provado com N=2 a precos diferentes (100 a 5,00 mais 100 a 9,00 gera saida a 7,00, e nao a 9,00). Estoque zerado RECUSA em vez de devolver zero: custo zero atravessaria o razao sem acusar nada." },
  "5.18.14": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): validadeDoEstoqueDoDeposito separa vencidos e a vencer em 30 dias, com fronteira CIVIL: o lote que vence HOJE nao esta vencido. So entram lotes com posicao POSITIVA - listar lote ja consumido mandaria alguem procurar na prateleira o que nao esta la." },
  "5.18.16": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): fichaDeControleDeEstoque devolve os movimentos do periodo E o saldo ANTERIOR a ele. E esta clausula que refuta a coluna de saldo dentro da propria secao." },
  "5.18.21": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Deposito com codigo, nome, unidade gestora e responsavel; a posicao e os bloqueios sao por deposito, e a transferencia entre dois e composta." },
  "5.19.1": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): InventarioDeBens com exercicio, comissao designada, unidade gestora, abertura e fechamento. Irmao - e nao o mesmo - do inventario de ESTOQUE: este exige comissao por portaria." },
  "5.19.2": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} a etiqueta é gerada PELA TELA, no detalhe do bem (ação "gerar-etiqueta", sem campos — o conteúdo é o próprio número de tombamento). Após recarga, o detalhe traz o selo "Etiquetado", que é DERIVADO de codigoDeBarras: o selo aparecendo depois de recarregar é o que separa persistência de estado de componente. ⚠️ E o percurso PRESSIONA O BOTÃO DUAS VEZES: a segunda geração é aceita e o código continua sendo o mesmo tombamento. A idempotência estava provada no domínio desde o ENT05; o que faltava era provar que o BOTÃO não a viola — gerar um código novo faria o leitor deixar de reconhecer a etiqueta já colada na prateleira. A cláusula pede a GERAÇÃO ("permitir a geração de etiquetas com códigos de barras"), não a impressão: o artefato físico, com layout e papel, é outra coisa e não entrou. ⚠️ V3 (pacote 2, unidade 5): a etiqueta ganhou FOLHA IMPRIMÍVEL (/patrimonio/etiquetas?bens=…): individual pelo detalhe do bem, em lote pela seleção da lista; Code 128 em SVG por bwip-js, lido de volta no teste por decodificador PRÓPRIO escrito da especificação (packages/codigo-de-barras/codigo-de-barras.test.ts — inclusive a prova de que uma barra alargada derruba a leitura); fora do ASCII a geração recusa nomeando; imprimir não grava. A folha nova ainda sem percurso (TERMOS-E-ETIQUETAS-SEM-PERCURSO). PERCURSO (scripts/smoke-pacote2.ts, 30 passos, 0 falhas, banco dos percursos, .registro-de-execucao/v3-pacote2-percurso.txt): 'Gerar etiqueta' pela tela (o case do despachante, perdido no bb47320, foi RESTAURADO — a ação caía no default desde o ENT12) e a folha /patrimonio/etiquetas com o SVG do Code 128 do bem.`,
  },
  "5.19.3": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} o bem é cadastrado PELA TELA /patrimonio/bens-patrimoniais, classificado por uma CLASSE — que carrega a espécie, móvel ou imóvel — e identificado por um TIPO DE INCORPORAÇÃO cadastrado no próprio percurso e escolhido no formulário. Após recarga, a listagem traz o bem com a classe e com como ele entrou. ⚠️ Até este lote NADA no domínio criava um BemPatrimonial: adquirirBem exige liquidação (o bem adquirido nasce de despesa liquidada) e registrarEntradaAvulsa recebe um bem que já existe. O serviço cadastrarBem e a ação CADASTRAR_BEM nasceram aqui; modules/m10-patrimonial/m10-acervo.test.ts (11 testes) prova as recusas nomeadas — classe desativada, tombamento repetido, tipo inexistente, sem permissão — e que o cadastro NÃO move o razão.`,
  },
  "5.19.7": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} o tipo de incorporação é cadastrado pela tela e, na MESMA execução, aparece no select do formulário do bem e é ESCOLHIDO — que é exatamente o que a cláusula pede ao dizer "para ser usado no cadastramento dos mesmos". O rol cresce por cadastro do ente, não por enum no código: a tela de tipos e a do bem são as duas pontas do mesmo fato, e o percurso liga uma à outra sem passar pelo banco à mão.`,
  },
  "5.19.10": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `ENT05: bensSobResponsabilidade deriva os bens de uma pessoa numa data (deriva em vez de filtrar por coluna). Orquestração V3, pacote 2 (unidade 1): o que faltava era saber QUEM é o usuário — o vínculo Usuario↔Pessoa passou a existir (explícito, pelo CPF/CNPJ, com motivo, append-only, sem conceder permissão; m16-pessoa-do-usuario.test.ts com homônimos N=2), e a tela /patrimonio/meus-bens mostra os bens pelos quais a pessoa da sessão responde hoje; sem vínculo, diz que está pendente e quem resolve, sem adivinhar pelo nome (test/acervo-pesquisa.test.ts, bloco "meus bens"). Sem percurso de navegador ainda (MEUS-BENS-SEM-PERCURSO). PERCURSO (scripts/smoke-pacote2.ts, 30 passos, 0 falhas, banco dos percursos, .registro-de-execucao/v3-pacote2-percurso.txt): vínculo do usuário à pessoa pelo documento em /administracao/usuarios e /patrimonio/meus-bens listando o bem entregue pelo termo — VALIDADO_LOCALMENTE.`,
  },
  "5.19.11": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} o estado de conservação é registrado PELA TELA, no detalhe do bem (ação "registrar-estado", com data do fato e motivo obrigatórios), e o histórico o traz APÓS RECARGA. A cláusula pede duas coisas — visualizar no cadastro e permitir o CONTROLE —, e controle é ato: o percurso escolhe BOM e confere o resultado, em vez de apenas constatar que o select existe. O estado ATUAL continua sendo derivado do último movimento do tipo (ENT05), e não uma coluna que alguém sobrescreve.`,
  },
  "5.19.12": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} a situação física é registrada PELA TELA (ação "registrar-situacao"), e o percurso escolhe EM_MANUTENCAO_CORRETIVA — que é literalmente um dos exemplos do texto da cláusula ("manutenções preventivas e corretivas"). Depois de recarregar, o histórico traz o movimento com o motivo, E ao lado do movimento de ESTADO: os dois eixos coexistem, que é o que prova que um não sobrescreve o outro. Cada um deriva do último movimento do SEU tipo.`,
  },
  "5.19.16": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): ComissaoPatrimonial com finalidade, ATO QUE DESIGNOU, vigencia e membros ligados a Pessoa do M19. Exatamente UM presidente, fail-closed: zero deixa o termo sem quem o assine na condicao exigida, dois fazem ninguem responder. Abrir inventario com comissao de outra finalidade ou fora da vigencia RECUSA." },
  "5.19.17": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): ContagemDeBem guarda o que a comissao OBSERVOU (encontrado, localizacao, estado); estado e situacao continuam derivados dos movimentos que a contagem gera." },
  "5.19.19": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): registrarContagemDeBem com transferirParaOndeFoiEncontrado move o bem para onde a comissao o achou - e e EXPLICITO, nao implicito: a comissao DECIDE se corrige o cadastro ou se apenas registra a divergencia." },
  "5.19.20": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A contagem registra estado e localizacao OBSERVADOS no momento do inventario, e a comparacao e contra o estado do bem NA DATA DE ABERTURA. E o parenteses da clausula ('no momento do inventario') que exigiu o eixo temporal - decisao D4." },
  "5.19.21": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): inconsistenciasDoInventarioDeBens deriva NAO_ENCONTRADO, LOCAL_DIFERENTE, ESTADO_DIFERENTE e SEM_REGISTRO_ANTERIOR. O ultimo e ACHADO, nao silencio: bem que a comissao encontrou e que o sistema nunca soube onde estava e exatamente o que o primeiro inventario existe para descobrir." },
  "5.19.22": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Termo de abertura e de fechamento como anexo do M22, ligados ao inventario. Fechar sem contagem RECUSA." },
  "5.19.23": {
    situacao: "PARCIAL",
    evidencia:
      "OS DOIS EIXOS EXISTEM E SAO SEPARADOS DE PROPOSITO: o FISICO " +
      "(MovimentoDeGestaoDoBem: localizacao, responsavel, estado, situacao, transferencia " +
      "entre entidades) e o FINANCEIRO (MovimentoPatrimonial), com teste contando " +
      "LancamentoContabil antes e depois para provar que a gestao NAO toca o razao. O eixo " +
      "fisico foi validado por tela no ENT08. " +
      PERCURSO_ENT12 +
      " o eixo FINANCEIRO passou a ter tela: no detalhe do bem, 'Registrar entrada de valor' " +
      "(AVALIACAO_INICIAL ou DOACAO_RECEBIDA) e 'Baixar do acervo' (BAIXA_ALIENACAO ou " +
      "DOACAO_REALIZADA), e o detalhe passou a mostrar o VALOR CONTABIL — derivado dos " +
      "movimentos com o sinal de cada tipo, nunca uma coluna. O percurso prova a cadeia " +
      "inteira: parametriza o roteiro pela tela do ENT11, registra 5.000, ve o valor subir, " +
      "baixa 1.200 e ve cair para 3.800, com os movimentos de valor e os de gestao " +
      "convivendo no mesmo historico sem um apagar o outro. ⚠️ E O TETO DO BEM FOI EXERCIDO " +
      "COM FIXTURE N=2: um segundo bem da MESMA classe, sem valor, enquanto a classe tem " +
      "3.800 — so o teto do BEM pode recusar, e a mensagem o nomeia ('ainda que a classe " +
      "tenha 3800.00'). Com um bem so, os dois tetos valem o mesmo numero e a assercao " +
      "passava por vacuidade; foi assim que a primeira execucao deste percurso ficou verde " +
      "sem provar o guard. ⚠️ CONTINUA PARCIAL: a clausula nomeia agregacao, reavaliacao e " +
      "depreciacao, e nenhuma das tres tem tela — registrarReavaliacao, registrarImpairment " +
      "e atualizarCompetencia seguem sem superficie. Pendencia " +
      "EIXO-DE-VALOR-SEM-REAVALIACAO-NA-TELA.",
  },
  "5.19.27": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A unidade gestora do bem e derivada da ultima TRANSFERENCIA_ENTRADA; o inventario e POR unidade gestora." },
  "5.19.28": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): transferirBemEntreEntidades gera as DUAS pernas sob um operacaoId, tudo-ou-nada, com viabilidade conferida ANTES de qualquer escrita. Estornar UMA estorna as DUAS - meia transferencia estornada deixaria o bem em duas entidades ou em nenhuma. Bem BAIXADO ou em origem diferente da declarada RECUSA." },
  "5.19.30": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_GESTAO_DO_BEM} o motivo de baixa é incluído PELA TELA /patrimonio/motivos-de-baixa, com código e descrição, e a lista o traz APÓS RECARGA. O modelo já estava provado desde o ENT05 — MotivoDeBaixa é TABELA, e um enum no código seria a constante que erra no segundo ente —; o que não existia era superfície, e um cadastro que o servidor municipal não alcança está implementado e não está entregue.`,
  },
  "5.19.37": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `ENT05: TermoPatrimonial do tipo BAIXA, que poe a situacao do bem em BAIXADO pelo mesmo caminho. V3 (pacote 2, unidade 5): a mesma tela e o mesmo PDF do termo de responsabilidade, com a declaração de baixa e as assinaturas (m10-termo-documento.test.ts t2). Sem percurso de navegador ainda.`,
  },
  "5.19.42": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): FormulaDeAvaliacao com expressao INTERPRETADA por avaliador proprio - nunca eval nem Function. A gramatica tem quatro operacoes, parenteses, numeros e um rol FECHADO de seis grandezas do bem; identificador global, chamada de funcao e acesso a propriedade sao INEXPRIMIVEIS, nao bloqueados. Metade do teste e negacao, incluindo o ataque por constructor que derrota sanitizacao por lista negra. Formula invalida nao chega a ser salva." },
  "5.17.2": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material com descricao sucinta e detalhada em db.Text (e o que cumpre 'sem limitacao de caracteres'), grupo/classe/subclasse por auto-relacao, e N-N de unidades de medida COM FATOR DE CONVERSAO. A N-N e literal na clausula ('uma ou mais unidades') e e o que torna aritmetico comprar em caixa e distribuir em unidade - decisao D6. Exatamente uma unidade de estoque, fail-closed." },
  "5.17.3": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): ClassificacaoDeMaterial (consumo, permanente, servico, obra) e CategoriaDeMaterial (perecivel, nao perecivel, estocavel, combustivel) - os dois rois literais da clausula." },
  "5.17.5": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): MarcaAprovada N-N com o material (decisao D7)." },
  "5.17.6": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material.catmat opcional - nem todo material do ente tem correspondente federal, e inventar um seria pior do que nao ter." },
  "5.17.8": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material.ativo desabilita o cadastro obsoleto; o servico recusa movimentar material inativo E o historico fica, porque o historico sao os movimentos." },
  "5.17.9": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): MaterialElementoDespesa N-N, e emitirOrdemDeCompra RECUSA quando a ficha traz elemento nao relacionado - e o que 'impedindo' quer dizer. Material SEM relacao nenhuma PASSA, com o motivo declarado: ele nao esta sendo comprado no elemento errado, esta sendo comprado por quem ainda nao parametrizou." },
  "5.17.54": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A solicitacao e do SETOR, e a autorizacao e cobrada com escopo de setor - a mesma porta que a tramitacao de processo do M21 usa, sem inventar um segundo eixo de acesso." },
  "5.17.99": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A alteracao da ordem e possivel enquanto nao ha empenho; com recurso orcamentario declarado, o servico recusa alterar por si e aponta a cascata do empenho." },
  "5.17.102": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra.desconto, com recusa quando ele passa do total - a ordem ficaria negativa e o fornecedor pagaria ao ente." },
  "5.17.103": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra.consumoImediato marca os produtos que nao passam pela prateleira, para o lancamento de saida ja no empenhamento." },
  // ── V6 P0.1 — identidade configurável do ente (apresentação versionada) ──
  "5.8.1": {
    situacao: "PARCIAL",
    evidencia: "V6 P0.1: a APRESENTAÇÃO do ente é configurável pela tela (/administracao/apresentacao): nome de exibição, órgão, imagem institucional (PNG/JPEG validada pelos bytes), contatos, sítio, tema (conjunto fechado PADRAO/ALTO_CONTRASTE) e canais públicos — versionada, com autor (m16-apresentacao.test.ts, 10 testes; smoke-identidade 45 passos). Relatórios personalizados: designer do M26 (5.8.12). ⚠️ FALTA: customização além da apresentação (campos de tela, fluxos) — não há editor de telas.",
    rota_verificada: "papel: CONFIGURAR_APRESENTACAO_DO_ENTE · contexto: banco dos percursos, next build + next start em 3010, build 4dcd2dd, 2026-09-13 · passos: /administracao/apresentacao → gravar versão (nome, órgão, fornecedor, e-mail, sítio, PNG, canais) → /login, cabeçalho, rodapé, /transparencia/demonstrativos e PDF novo mostram o nome; segunda via de termo emitido inalterada (mesmo sha256) · obtido: 45/45 · artefato: smoke-identidade-4dcd2dd-r4.log.",
  },
  "5.38.46": {
    situacao: "PARCIAL",
    evidencia: "V6 P0.1: /transparencia/demonstrativos (público, sem sessão) exibe o nome de exibição do ente, a imagem institucional vigente e os contatos da apresentação (smoke-identidade 6.6). ⚠️ FALTA o ENDEREÇO do ente (não há campo de endereço na apresentação — pendência ENDERECO-DO-ENTE) e o portal da transparência além dos demonstrativos (5.38).",
  },

  // ── V6 P1.2 — arrecadação × conta bancária × conciliação ──
  // ⚠️ V16 — A SITUAÇÃO NÃO MUDOU, A EVIDÊNCIA MUDOU, E ELA ESTAVA ERRADA DEPOIS DESTA UNIDADE. A
  // frase antiga dizia que o domínio "recusa fonte da conta ≠ fonte da guia" — e essa era a regra de
  // ANTES da ADR da conta multifonte. A arrecadação era o único dos seis sítios que ainda comparava a
  // COLUNA `ContaBancaria.fonteId`, e por isso recusava guia legítima da segunda fonte de uma conta
  // multifonte. Deixar a evidência velha no catálogo seria descrever no inventário um comportamento
  // que o código não tem mais.
  "5.10.2.8": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6 P1.2 + V16: a guia declara a conta bancária que recebeu, e a coerência conferida no domínio é (a) a fonte informada está no ROL da conta — `exigirFonteNoRolDaConta`, a mesma função dos outros cinco sítios da TR 5.23, com o fallback estrito para a fonte PADRÃO quando o rol está vazio — e (b) a conta contábil mapeada da conta bancária É a perna de disponibilidade debitada (m09-atribuicao-de-conta.test.ts t1; m04-distribuicao-por-fonte.test.ts t9/t10, que provam a recusa por fonte fora do rol E a aceitação da segunda fonte de uma conta multifonte). Pela tela: select da conta em /receita/arrecadacoes e em /receita/arrecadacoes/distribuir, com a recusa nomeando as fontes que a conta comporta. ⚠️ A parte 'de acordo com a Portaria vigente' (rol de naturezas oficial) continua sendo o seed de naturezas (M04 pendência).",
    rota_verificada: "papel: REGISTRAR_ARRECADACAO (papel de runtime) · contexto: clone do banco de percursos (gestao_publica_percursos_v16b), next dev em 3010, 2026-09-27 · passos: /receita/arrecadacoes/distribuir → guia repartida 60.000,00 (fonte 500) + 40.000,00 (fonte 540) numa conta cujo rol só comporta a 500 → RECUSA dizendo \"as fontes permitidas nesta conta são: 500\" → o rol da conta recebe a 540 pela tela → a MESMA guia é aceita · obtido: scripts/smoke-receita-por-fontes.ts, 22 ok / 0 falhas (4.3 e 6.1); a corrida anterior por conta única segue em smoke-arrecadacao-conta-c9f1c9f-r1.log.",
  },
  // ⚠️ V16 — E A LEITURA DA CLÁUSULA IMPORTA: ela cobre "os casos em que NÃO há rateio de percentual
  // entre as fontes". Esse é exatamente o que existe — a fonte (ou as fontes) informadas no ato, por
  // VALOR. O rateio por PERCENTUAL declarado no plano de contas da receita (TR 5.9.3.4 e 5.9.3.7) é
  // outro mecanismo e NÃO existe: as duas seguem NAO_VERIFICADO, e esta marcação não as cobre.
  "5.10.2.9": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "A fonte é informada NO ATO do lançamento da receita, e desde a V16 ela pode ser MAIS DE UMA, por VALOR: `FonteDaArrecadacao` guarda uma parcela por (fonte, exercício da fonte) e a conservação do total é do MOTOR DE PARTIDAS DOBRADAS — o roteiro emite uma perna de classe 7 por natureza de fonte, cada uma com a sua fatia, contra uma de classe 8 com o total, e `validarLancamento` exige que o subsistema CONTROLE feche; parcelas que não somam o total não produzem lançamento, logo não produzem guia. Sete leitores por fonte passaram a ler a parcela por UMA função (`modules/m04-receita/parcelas-por-fonte.ts`, fail-closed), inclusive a DDR por fonte (M01) e a `ReceitaOrcamentaria` do SAGRES, que emite uma linha por fonte com o mesmo número de guia (o leiaute §4.16 não tem campo de total). A anulação HERDA as parcelas — o snapshot. `modules/m04-receita/m04-distribuicao-por-fonte.test.ts` (13/13). ⚠️ NÃO cobre o rateio por PERCENTUAL do plano de contas da receita (TR 5.9.3.4/5.9.3.7), que é outro mecanismo e continua ausente.",
    rota_verificada:
      "papel: REGISTRAR_ARRECADACAO e DISTRIBUIR_RECEITA_FORA_DA_PREVISAO (papel de runtime) · contexto: clone do banco de percursos (gestao_publica_percursos_v16b), next dev em 3010, 2026-09-27 · passos: /receita/arrecadacoes/distribuir → a LOA oferece as fontes previstas com o previsto de cada uma → 60.000,00 + 40.000,00 de um depósito de 100.000,00 → a lista mostra \"500 · 60.000,00 / 540 · 40.000,00\" → parcelas que somam 99.000,00 são RECUSADAS dizendo os dois números e a diferença → fonte que a LOA não prevê sem motivo escrito é RECUSADA, com motivo entra → anulada pela tela, a anulação carrega a MESMA repartição · obtido: scripts/smoke-receita-por-fontes.ts, 22 ok / 0 falhas (4.1 a 9.2).",
  },
  // ── V17/C07 — A CONSOLIDAÇÃO E AS ELIMINAÇÕES INTRAGOVERNAMENTAIS ──────────
  //
  // ⚠️ E A PRIMEIRA COISA A DIZER É QUE **O TR NÃO PEDE ELIMINAÇÃO INTRAGOVERNAMENTAL COM ESSAS
  // PALAVRAS**. Medido no catálogo: ZERO cláusulas com "eliminação", "intragovernamental",
  // "intraorçamentária" ou "contraparte". O C07 é um ID da ordem V14, não um número do edital.
  // As duas cláusulas abaixo são as que a capacidade ALCANÇA, e as duas ficam PARCIAIS — porque a
  // metade que falta é a mesma nas duas, e ela é estrutural: o RAZÃO NÃO TEM DIMENSÃO DE ENTIDADE.
  // Marcar qualquer uma delas como atendida renderia número e mentiria.
  "5.10.1.3": {
    situacao: "PARCIAL",
    evidencia:
      "O QUE EXISTE: (a) mais de uma unidade na mesma base — `Orgao`/`UnidadeOrcamentaria` com o tipo oficial do MANAD L400 e CNPJ próprio por unidade, e a autorização por UG (`escopo.ts`) já recorta a escrita; (b) a ENTIDADE CONTÁBIL como cadastro próprio (V11 V9): identidade estável, atributos VERSIONADOS com ato estruturado e conferido, CNPJ e tipo, declaração de titular por conta bancária e atribuição para guia legada; (c) desde a V17, a IDENTIFICAÇÃO INTRAGOVERNAMENTAL e as ELIMINAÇÕES CABÍVEIS: o nível de consolidação do PCASP lido do plano oficial instalado (993 contas INTRA OFSS entre as 7.864, pela âncora de nível 5 que DECLARA o nível — a regra do 5º dígito sozinha marcaria 137 a mais, entre elas a suplementação, a DDR comprometida por empenho e a fonte vinculada, que o sistema escreve todo dia), três pares de eliminação com resíduo (execução orçamentária: receita categoria 7/8 x despesa modalidade 91; variações: VPD intra x VPA intra; saldos recíprocos: ativo intra x passivo intra), a contraparte derivada do CNPJ do credor do empenho contra o CNPJ da entidade cadastrada, e três verificações no relatório de consistência. ⚠️ O QUE FALTA, E É A METADE PEDIDA PELA PALAVRA \"CONTABILIZAÇÃO DISTINTA\": `LancamentoContabil` e `PartidaContabil` NÃO têm dimensão de entidade — logo não existe balancete nem demonstração POR entidade, e portanto não existe a emissão CONSOLIDADA de relatórios anuais e da LRF no sentido de somar entidades e eliminar o que é entre elas. A eliminação entregue é DEMONSTRATIVO (nada se escreve no razão), e é por isso que a visão individual se preserva. Pendências nomeadas: `SUPERAVIT-SEM-ENTIDADE-NAS-QUATRO-PERNAS` e `ROTEIRO-SEM-NIVEL-DE-CONSOLIDACAO` (o caminho de ESCRITA não conhece o nível: a contrapartida da liquidação sai de um mapa por ELEMENTO e a arrecadação credita uma VPA fixa, então nenhuma partida chega às contas INTRA OFSS e os dois pares patrimoniais ficam corretamente em \"sem dado\"). Levantamento: docs/varreduras/varredura-v17-eliminacoes-intragovernamentais.md.",
    rota_verificada:
      "papel: papel de runtime com CONSULTAR_RELATORIOS, REGISTRAR_ARRECADACAO, EMPENHAR e LIQUIDAR · contexto: clone novo do banco de percursos (gestao_publica_percursos_v17c) migrado a HEAD, next dev em 3010, 2026-09-27 · passos: /relatorios/eliminacoes-intra (os três pares dizem \"sem dado\" COM MOTIVO) → duas guias de receita intra pela tela (60.000,00 + 40.000,00, naturezas de categoria 7 diferentes) → dois empenhos na ficha de modalidade 91 (um para o CNPJ da entidade cadastrada, um para credor estranho) → liquidação parcial de 60.000,00 → a tela mostra RESÍDUO de 40.000,00 e o explica → a contraparte do CNPJ cadastrado é nomeada pela entidade e a do estranho é dita NÃO IDENTIFICADA → liquidado o restante, o par passa a ELIMINAR com resíduo 0,00 → as três verificações aparecem em /relatorios/consistencia (anual) · obtido: scripts/smoke-eliminacoes-intra.ts, 23 ok / 0 falhas / 0 não executados; dirigidos modules/m01-core-contabil/m01-consolidacao.test.ts (10/10), modules/m12-relatorios/m12-eliminacoes-intra.test.ts (8/8, N=2 nas duas pontas) e as contagens sobre o arquivo oficial em test/pcasp-oficial.test.ts (6/6).",
  },
  "5.10.1.108": {
    situacao: "PARCIAL",
    evidencia:
      "O BALANCETE DE VERIFICAÇÃO existe e é emitido das contas de receita, despesa e contas contábeis, com saldo e movimento por conta e a prova de que ΣD = ΣC (`modules/m12-relatorios/livros.ts`, tela em /relatorios/livros/balancete, e a verificação BALANCETE_FECHA do relatório de consistência). ⚠️ O QUE FALTA É EXATAMENTE O VERBO DA CLÁUSULA — **CONSOLIDAR** direta e indireta: o razão não tem dimensão de entidade (`LancamentoContabil`/`PartidaContabil`), então não há como emitir o balancete DE UMA entidade nem somar as entidades eliminando o que é entre elas. O que a V17 entregou é o passo anterior e ele é real: as operações INTRAgovernamentais estão identificadas pelo nível de consolidação do PCASP e as eliminações cabíveis estão demonstradas com resíduo em /relatorios/eliminacoes-intra. Mesma pendência estrutural de 5.10.1.3.",
  },
  "5.10.2.7": {
    situacao: "PARCIAL",
    evidencia: "V6 P1.2: cada guia tem UMA conta bancária de contrapartida, coerente com o razão (perna de disponibilidade = contábil da conta). ⚠️ FALTA a inclusão de VÁRIAS receitas num só ato com a mesma contrapartida (entrada em lote); hoje é uma guia por envio.",
  },
  "5.10.2.43": {
    situacao: "PARCIAL",
    evidencia: "ENT03a: /financeiro/conciliacao/periodo mostra numa tela os saldos (extrato, contábil, diferença), as pendências do extrato e do razão, as herdadas e as declaradas. V6 P1.2: mais a seção do legado sem conta bancária com a atribuição pela própria tela e a mensagem de identidade (fecha / quanto sobra) como estado. ⚠️ FALTAM filtros (5.10.2.50) e ordenação por valor (5.10.2.51) na tela.",
  },

  // ── V6 P2.1/P2.2 — pessoal (M32), bloco 1: cadastro e histórico funcional ──
  "5.12.5": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6 P2.1: a ficha do servidor (M32) aponta para a Pessoa FÍSICA canônica do cadastro único (M19) — CPF, nome, endereço e contatos vivem lá; a ficha guarda só o civil próprio (nascimento, sexo, PIS, RG, título, CTPS, filiação). Uma pessoa, uma ficha: PJ, pessoa já servidora e pessoa inexistente são recusadas nomeando (m32-pessoal.test.ts PESSOA-JURIDICA / PESSOA-JA-E-SERVIDOR). Pela tela, o select oferece só as físicas ainda sem ficha, e a recém-cadastrada some da oferta (smoke-pessoal 2.2, 2.5).",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.1": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: o vínculo (matrícula) nasce com data de admissão, tipo (efetivo, comissionado, temporário...), regime jurídico, cargo, lotação e salário base; cargo, lotação e salário de HOJE são derivados dos eventos (smoke-pessoal 3.2–3.3, 4.2; m32-pessoal.test.ts, a promoção de junho não muda maio). ⚠️ FALTAM: data de nomeação e de posse, término do contrato temporário (existe ContratoTrabalho no schema com serviço, SEM tela), horário e local de trabalho, campos adicionais sem customização.",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.6": {
    situacao: "PARCIAL",
    evidencia: "CPF: dígito verificador conferido no cadastro único (M19) — o smoke do pessoal foi RECUSADO com 'o dígito verificador não confere' na primeira execução (smoke-pessoal-a187f89-r1.log) e passou com CPF válido. PIS/PASEP: só formato (11 dígitos, zPis); ⚠️ o dígito verificador do PIS NÃO é conferido.",
  },
  "5.12.8": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: o tipo de vínculo é enum fechado (efetivo, comissionado, temporário, estagiário...) e o regime jurídico é texto livre por vínculo, como a lei do ente o nomeia. ⚠️ Não há CADASTRO de regimes com código da categoria eSocial (bloco 4 — pendência do MODULO M32).",
  },
  "5.12.9": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: /pessoal/servidores filtra por nome, CPF ou matrícula e por situação derivada (sem vínculo, ativo, afastado, desligado). ⚠️ Faltam os demais filtros do item (idade, RG, PIS, título, CTPS, CNH, nacionalidade, tipo sanguíneo, estado civil...) — vários desses campos nem existem na ficha.",
  },
  "5.12.11": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: dependente com parentesco e finalidade (salário-família / imposto de renda), com data de início e baixa automática por idade derivada (limiteIdadeAnos, invalidez permanente sem limite) — m32-pessoal.test.ts; pela tela smoke-pessoal 8.2–8.3. ⚠️ O limite de idade é informado por finalidade, não CONFIGURADO por grau de parentesco numa tabela do ente.",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.14": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: cargo com código, denominação, tipo, vagas fixadas em lei, lei de criação e publicação, carga horária, requisito de ingresso e extinção; vagas ocupadas CONTADAS dos vínculos vivos, com 'com vaga / sem vaga / extinto' derivado (smoke-pessoal 3.4). ⚠️ Faltam: enquadramento, grau de instrução, CBO, salário mensal (o salário é do vínculo), lei de extinção como campo e atribuições individuais.",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.16": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: portaria (tipo, número/ano por exercício, data, ementa) registrada pela ação do detalhe, e o evento do histórico funcional pode nomear a portaria que o fundamenta (HistoricoVinculo.portariaId; m32-pessoal.test.ts). ⚠️ A portaria NÃO é criada automaticamente a partir da movimentação; não há anexos. Sem percurso de navegador pela portaria nesta unidade.",
  },
  "5.12.17": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: anotação na ficha (elogio, advertência, ocorrência...) com tipo, data, título e texto, append-only, com crachá próprio REGISTRAR_ANOTACAO; aparece no histórico (smoke-pessoal 8.1, 8.3). ⚠️ Faltam: ato legal vinculado, multa com lançamento em folha (bloco 2) e anexos (sem storage de arquivos).",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.20": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: mudança de lotação como evento do vínculo (data, destino, motivo, portaria opcional) — a lotação de hoje é derivada; a lotação extinta antes do fato é recusada (m32-pessoal.test.ts). ⚠️ Faltam: tipo de transferência (local de trabalho / centro de custo), deferimento/indeferimento com responsável pela análise.",
  },
  "5.12.46": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: afastamento como evento do vínculo (data, motivo, portaria opcional); a situação derivada passa a AFASTADO e o retorno é outro evento (smoke-pessoal 5.1–5.2). ⚠️ Faltam: motivo tabelado, data final prevista, mês/ano de cálculo e ato legal obrigatório.",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.92": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.2: a segunda matrícula da mesma pessoa é aceita com ALERTA de acumulação nomeando a primeira (smoke-pessoal 6.1), e o detalhe exibe o selo 'N matrículas — confira a acumulação'. ⚠️ Não há RELATÓRIO listando os servidores com dois vínculos.",
    rota_verificada: "papel: rh@percursos.local (perfil PESSOAL — PERCURSO, 15 ações globais; sem CONSULTAR_DESPESA) · contexto: banco dos percursos, next build + next start em 3010, build a187f89, 2026-09-13 · passos: /pessoal/cargos e /pessoal/lotacoes (criar) → /cadastros/pessoas (pessoa física) → /pessoal/servidores (ficha sobre a pessoa; a pessoa some da oferta) → detalhe: admitir, promover, afastar, segunda matrícula (alerta), matrícula repetida (recusa), desligar, anotar, dependente → aba histórico · obtido: smoke-pessoal-a187f89-r4.log, 29/29.",
  },
  "5.12.60": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: "V6 P2.2: o desligamento é TERMINAL (o vínculo desligado não aceita eventos e não é mais oferecido — smoke-pessoal 7.2) e a matrícula é única no ente inteiro (MATRICULA-JA-USADA, 6.2). Reintegração reutilizando a matrícula exigiria um evento REINTEGRACAO que reabra o vínculo — decisão de modelo a tomar antes de construir (pendência REINTEGRACAO-DE-VINCULO no MODULO M32).",
  },

  // ── V6 P2.3 — folha de pagamento (M33), bloco 2: tabelas do ente, cálculo com memória ──
  "5.12.51": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6 P2.3: /folha/folhas/[id]/contracheque/[vinculoId] mostra o pagamento do servidor LINHA A LINHA sem imprimir nada: cada rubrica com valor-base, fator de dias, valor e a conta que a produziu; as faixas percorridas da contribuição; os três cenários do imposto com o que cada um deduziu e o motivo de cada inaplicável; o salário-família com cada dependente considerado; e o sha256 da memória. É a memória GRAVADA no cálculo, não uma recontagem da tela (m33-folha.test.ts: mesmo input, mesmo hash).",
    rota_verificada: "papéis: rh@percursos.local (parametriza, lança e CALCULA) e contabilidade@percursos.local (FECHA) · contexto: banco dos percursos, next build + next start em 3010, build 9f3c512, 2026-09-13 · passos: /folha/tabelas (contribuição RGPS com três faixas e teto, IRRF com faixas e desconto simplificado, salário-família) → /folha/rubricas (VENC, HEXT, PREV, IRRF; a SEGUNDA de vencimento-base é recusada) → admissão com regime previdenciário → /folha/lancamentos (horas extras na competência) → /folha/folhas (abrir, calcular) → contracheque com a memória → recalcular (nº 2), cancelar, fechar pela contabilidade, recalcular recusado · obtido: smoke-folha-9f3c512-r4.log, 46/46.",
  },
  "5.12.52": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6 P2.3: o cálculo é FATO NUMERADO por folha — recalcular é o número seguinte, e o histórico do detalhe traz cada cálculo com data, autor, motivo, contracheques, líquido e o sha256, mais o CANCELAMENTO com autor e motivo (o cálculo cancelado continua no histórico, marcado). Nada é apagado nem reescrito; a folha fechada não se recalcula e o cálculo que a fechou não se cancela (smoke-folha 7.1–7.4, 9.1–9.2). ⚠️ A hora aparece na data do registro; o relógio por extenso não é exibido.",
    rota_verificada: "papéis: rh@percursos.local (parametriza, lança e CALCULA) e contabilidade@percursos.local (FECHA) · contexto: banco dos percursos, next build + next start em 3010, build 9f3c512, 2026-09-13 · passos: /folha/tabelas (contribuição RGPS com três faixas e teto, IRRF com faixas e desconto simplificado, salário-família) → /folha/rubricas (VENC, HEXT, PREV, IRRF; a SEGUNDA de vencimento-base é recusada) → admissão com regime previdenciário → /folha/lancamentos (horas extras na competência) → /folha/folhas (abrir, calcular) → contracheque com a memória → recalcular (nº 2), cancelar, fechar pela contabilidade, recalcular recusado · obtido: smoke-folha-9f3c512-r4.log, 46/46.",
  },
  "5.12.53": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: cada verba do contracheque guarda a CONTA que a produziu em texto ('vencimento-base vigente 3000.00 x 19/30 dias', 'RGPS: base 3250.00 → faixas 1000.00x0.0750 + 2000.00x0.0900 + 250.00x0.1400 = 290.00') e os valores retornados, em `LinhaDoContracheque.memoria` e na tela. ⚠️ A 'fórmula da verba' do TR é fórmula CONFIGURÁVEL pelo ente (5.12.62); aqui a conta vem da NATUREZA da rubrica, que é um conjunto fechado — não há editor de fórmula.",
    rota_verificada: "papéis: rh@percursos.local (parametriza, lança e CALCULA) e contabilidade@percursos.local (FECHA) · contexto: banco dos percursos, next build + next start em 3010, build 9f3c512, 2026-09-13 · passos: /folha/tabelas (contribuição RGPS com três faixas e teto, IRRF com faixas e desconto simplificado, salário-família) → /folha/rubricas (VENC, HEXT, PREV, IRRF; a SEGUNDA de vencimento-base é recusada) → admissão com regime previdenciário → /folha/lancamentos (horas extras na competência) → /folha/folhas (abrir, calcular) → contracheque com a memória → recalcular (nº 2), cancelar, fechar pela contabilidade, recalcular recusado · obtido: smoke-folha-9f3c512-r4.log, 46/46.",
  },
  "5.12.54": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: o contracheque diz, por linha, se ela compõe a base da contribuição e a do IRRF, e mostra as duas bases consolidadas; a incidência é parametrizada na rubrica. ⚠️ FALTA a CONSULTA por folha (a lista de quais proventos e descontos sofreram incidência em cada folha calculada) — hoje só se vê contracheque a contracheque.",
  },
  "5.12.50": {
    situacao: "PARCIAL",
    evidencia:
      "V11 V9.4c: a clausula tem DUAS metades, e as duas passaram a ter percurso de navegador — mas NENHUMA das " +
      "duas esta inteira, e a clausula NAO foi promovida. " +
      "(1) OS TIPOS DE FOLHA: QUATRO dos NOVE que o item enumera existem e foram exercitados pela tela de ponta a " +
      "ponta — MENSAL (V6 P2.3), ADIANTAMENTO DE 13o (1a parcela) e 13o SALARIO (V11 V9.2, este abatendo aquele por " +
      "vinculo) e MENSAL COMPLEMENTAR (V11 V9.4b). A complementar recalcula a competencia com o cadastro de hoje, " +
      "subtrai o que as folhas FECHADAS dela ja apuraram e paga a DIFERENCA por RUBRICA, sem reabrir a folha " +
      "original: vira contracheque so quem tem diferenca, e vira linha so a rubrica que mudou. Medido na tela: " +
      "calculo n.1 com 1 contracheque para 2 vinculos vivos; segundo achado absorvido pelo RECALCULO da folha ainda " +
      "ABERTA no calculo n.2, com liquido 720,00 (500-50 mais 300-30) e o adicional de M-1 permanecendo 500,00 e " +
      "nunca 1.000,00 — o recalculo NAO repete o ja reconhecido. Recusas exercitadas pela tela: diferenca NEGATIVA, " +
      "competencia sem mensal fechada, e a SEGUNDA folha complementar na mesma competencia, que e RECUSADA hoje " +
      "(`@@unique([competencia, tipo])`, mensagem FOLHA-JA-ABERTA). " +
      "⚠️ V13 — O QUINTO TIPO GANHOU MOTOR, E A CLAUSULA NAO SE MOVE POR ISSO. ADIANTAMENTOS SALARIAIS (o vale do " +
      "mes) existe como TIPO DE FOLHA PROPRIO, com parametro do ente versionado POR COMPETENCIA (percentual, base, " +
      "as duas rubricas, o estado minimo para abater e o ato), motor por vinculo e ABATIMENTO na folha MENSAL da " +
      "mesma competencia. Provado com banco em `modules/m33-folha/m33-adiantamento-salarial.test.ts` (19 casos, " +
      "N=2 com bases diferentes, esperados calculados A MAO; duas mutacoes dirigidas confirmaram que a suite " +
      "ACUSA, revertidas com checksum). A tela do parametro existe e esta no menu da folha. ⚠️ MAS NAO HA PERCURSO " +
      "DE NAVEGADOR: a rodada V13 foi proibida de rodar `next build` e navegador pela condicao da maquina, e sem " +
      "percurso nao se promove nada — pendencia `ADIANTAMENTO-SALARIAL-SEM-PERCURSO-DE-NAVEGADOR`. E MESMO COM O " +
      "PERCURSO A CLAUSULA NAO FECHARIA: ela enumera NOVE tipos, e nascer um enum novo nao e atender edital. " +
      "⚠️ FALTAM QUATRO DOS NOVE, nominalmente: RESCISAO, RENDIMENTOS ACUMULADOS, FERIAS e " +
      "DIFERENCA DE 13o. Pendencias `FOLHAS-NAO-MENSAIS`, `RETIFICACAO-DA-FOLHA` (de que a diferenca de 13o " +
      "depende) e `SEGUNDA-COMPLEMENTAR-NA-MESMA-COMPETENCIA` no MODULO do M33. " +
      "(2) OS FILTROS DE FUNCIONARIOS: os OITO eixos do enunciado existem, tem ponta de entrada e foram exercitados " +
      "pela tela — matricula, nome, cargo, regime, local de trabalho, centro de custo, funcao e data de admissao. " +
      "'Regime' e entregue como DOIS eixos (juridico e previdenciario) porque sao dois, e o percurso afirma o " +
      "cruzamento inverso: celetista no RPPS. O nome acha pelo CIVIL e pelo NOME SOCIAL (Lei 14.164/2021). Cargo, " +
      "lotacao, funcao e regime previdenciario sao DERIVADOS por data de referencia, e a CELULA deriva na mesma data " +
      "do filtro. A conjuncao e sobre o MESMO vinculo. Funcao e centro de custo ganharam cadastro e designacao pela " +
      "tela em V11 V9.4c; antes disso tinham filtro e nenhuma porta de entrada, e o filtro devolvia vazio para " +
      "sempre. " +
      "⚠️⚠️ A DISTINCAO QUE IMPEDIA A PROMOCAO, E O QUE MUDOU NA V12: o item prende 'permitindo filtrar os " +
      "funcionarios' a ROTINA DE CALCULO, e ate a V11 V9.4c o que havia era so CONSULTA filtrada (tela " +
      "/pessoal/servidores, M32). O RECORTE DO CALCULO nao tinha superficie: o motor cobrava a acao desde a V11 V9.5, " +
      "mas a porta lia so `motivo` e nunca repassava a selecao, nenhuma tela lia a abrangencia, e NENHUM perfil tinha " +
      "SELECIONAR_VINCULOS_DA_FOLHA — capacidade construida e inalcancavel. " +
      "A V12 R5 ligou a cadeia: o formulario de calcular DECLARA o modo (a folha inteira, ou so as matriculas " +
      "escritas), a porta resolve e recusa nomeando (SELECAO-EXPLICITA-SEM-MATRICULA, SELECAO-CONTRADITORIA, " +
      "MATRICULA-NAO-ENCONTRADA), a abrangencia efetiva de cada calculo ficou CONSULTAVEL com o motivo de cada " +
      "ausencia, e a acao chega aos perfis pela atualizacao versionada 29 — que NAO deriva de CALCULAR_FOLHA, para " +
      "nao desfazer a segregacao no ato de instala-la. " +
      "⚠️ A CLAUSULA CONTINUA PARCIAL, e a razao agora e UMA so: QUATRO TIPOS DE NOVE. A metade dos filtros passou " +
      "a ter consulta E recorte de calculo, ambos exercitados pela tela; a metade dos tipos segue devendo cinco.",
    rota_verificada:
      "DOIS percursos, dois artefatos, dois bancos descartaveis, ambos em 2026-09-24. " +
      "(1) MENSAL COMPLEMENTAR — artefato SHA completo d163d217df477cd90c7b12182d5f1a04c770d49b (/release confirma " +
      "d163d21), banco gestao_publica_percursos_v7m1_compl_verde clonado por execucao, next build + next start em " +
      "3014, papeis rh@percursos.local (abre e CALCULA), contabilidade@percursos.local (FECHA) e " +
      "tesouraria@percursos.local (ator NEGATIVO, sem CONSULTAR_FOLHA). Passos: mensal aberta, calculada e FECHADA " +
      "(2.700,00 e 1.800,00 por contracheque) → lancamento do primeiro achado → complementar aberta e calculada → " +
      "memoria POR RUBRICA nomeando a folha e o calculo de origem do delta → segundo achado absorvido pelo " +
      "recalculo → fechamento → resumo em PDF intitulado pelo TIPO → recusas. Obtido: smoke-complementar-da-folha " +
      "62 ok / 0 falhas, exit=0 lido do arquivo, .registro-de-execucao/percurso-da-complementar-verde-definitivo-*.log. " +
      "O par vermelho->verde esta registrado: 46 ok/14 falhas e 49 ok/11 falhas contra o artefato 6fa0d62 SEM " +
      "conserto, antes dos sete consertos de superficie. " +
      "(2) EIXOS DE CONSULTA — artefato SHA completo 838227a95a52cf88a01ff05a8411c773f8d367df (/release confirma " +
      "838227a), banco gestao_publica_percursos_v7m1_eixos_b clonado por execucao, next start em 3016, papeis " +
      "rh@percursos.local (CONSULTAR_PESSOAL) e tesouraria@percursos.local (ator NEGATIVO, fora do censo de " +
      "test/usuarios-teste.ts, com quatro consultas vizinhas e nenhuma delas a vigiada). Passos: os oito eixos com " +
      "par acha/nao-traz → nome civil e social → conjuncao sobre o mesmo vinculo → data de referencia em tres tempos " +
      "com a celula derivando na data do filtro → designacao e DISPENSA de funcao, com 'Exercendo hoje' DERIVADO → " +
      "paginacao com 4.900 de volume (total 4900 nas DUAS paginas, uniao sem repetidos) → o TETO de 5.000 " +
      "(total 5054) recusando como ESTADO da tela, dizendo quantos alcancou, o que fazer e que NAO truncou, com o " +
      "caminho rapido ainda respondendo → autorizacao pareada com controle POSITIVO do ator negativo. Obtido: " +
      "smoke-servidores-eixos 53 ok / 0 falhas, exit=0 lido do arquivo, " +
      ".registro-de-execucao/percurso-dos-eixos-de-servidor-2-*.log. Isto fecha " +
      "`PESSOAL-RECUSA-DO-TETO-SEM-PERCURSO`, cuja guarda anterior era INERTE (casava com o texto-fonte do page.tsx; " +
      "a mutacao MUT-H deixou 26 testes verdes com o ramo desligado). " +
      "(3) SELECAO NO CALCULO — V12 R5, contra o HEAD 32c7beb, banco gestao_publica_percursos_v12_r5 clonado por " +
      "execucao, next build + next start em 3012, papeis rh@percursos.local (CALCULA e RECORTA) e " +
      "contabilidade@percursos.local (FECHA). Passos: o formulario DECLARA o modo e recebe matriculas, e NAO tem " +
      "campo por vinculo — a afirmacao pela AUSENCIA, que e o que impede a paginacao de definir quem entra → as tres " +
      "recusas da declaracao → calculo n.1 EXPLICITO {A,B} e n.2 EXPLICITO {C,D} → a abrangencia mostrando cada " +
      "calculo com EXATAMENTE os seus, e o MODO gravado → FECHAR RECUSA nomeando M-A e M-B, oferecendo as DUAS " +
      "saidas → saida 1, recalcular com a selecao ACUMULADA e fechar → saida 2, noutra folha, CANCELAR os calculos " +
      "que processaram A e B, os cancelados seguindo visiveis e marcados, e o fechamento passando sem eles → com a " +
      "lista de servidores NOUTRA PAGINA, o calculado e o DECLARADO, e os nao declarados nao entram. " +
      "Obtido: smoke-selecao-no-calculo 31 ok / 0 falhas, exit=0 lido do arquivo. " +
      "⚠️ A PROVA POR MUTACAO DESTE PERCURSO NAO FECHOU: a mutacao escolhida (a porta validando a declaracao e NAO " +
      "a repassando ao motor) foi aplicada e confirmada no alvo por checksum e por texto, mas as duas corridas " +
      "morreram em `Runtime.callFunctionOn timed out` ANTES da primeira assercao, com 75 MB livres e 5,7 GB de 7 GB " +
      "de swap em uso. Saturacao de maquina nao e aprovacao nem defeito: o resultado e INEXISTENTE, nao " +
      "desconhecido, e o percurso esta VERDE e ainda NAO PROVADO COMO ACUSADOR. " +
      "⚠️ NAO EXERCITADO: os cinco tipos de folha que faltam.",
  },
  "5.12.61": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: "V6 P2.3: o salário-família é calculado automaticamente pela tabela vigente do ente e pelos dependentes com a finalidade SALARIO_FAMILIA, com a idade medida no PRIMEIRO dia da competência (quem faz 14 anos no dia 20 recebe o mês inteiro), invalidez permanente sem limite de idade e renda máxima que zera o benefício — cada dependente com o motivo da inelegibilidade (m33-folha.test.ts, 4 testes). ⚠️ NÃO HÁ PERCURSO DE NAVEGADOR: o servidor do percurso ganha acima da renda máxima e não tem dependente com a finalidade.",
  },
  "5.12.62": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: cada rubrica declara se incide em IRRF e na contribuição, e de onde vem o valor (natureza), inclusive percentual do vencimento-base. ⚠️ FALTAM a FÓRMULA editável pelo ente e a diferenciação POR REGIME — a natureza é um conjunto fechado e vale para todos os regimes. Fórmula editável exigiria interpretador com universo fechado (regra do repositório: nunca `eval`).",
  },
  "5.12.63": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: a incidência na base da contribuição é parametrizada por rubrica, e a tabela aplicada depende do regime previdenciário do vínculo na competência. ⚠️ FALTAM o FGTS (não há base nem recolhimento) e a incidência diferenciada por previdência/regime na mesma rubrica.",
  },
  "5.12.65": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: lançamento VARIÁVEL por matrícula e competência, com observação, para rubricas de valor informado (/folha/lancamentos; smoke-folha 4.1–4.2, e a linha entra no contracheque somando à base). ⚠️ FALTA o lançamento COLETIVO (por lote de funcionários).",
    rota_verificada: "papéis: rh@percursos.local (parametriza, lança e CALCULA) e contabilidade@percursos.local (FECHA) · contexto: banco dos percursos, next build + next start em 3010, build 9f3c512, 2026-09-13 · passos: /folha/tabelas (contribuição RGPS com três faixas e teto, IRRF com faixas e desconto simplificado, salário-família) → /folha/rubricas (VENC, HEXT, PREV, IRRF; a SEGUNDA de vencimento-base é recusada) → admissão com regime previdenciário → /folha/lancamentos (horas extras na competência) → /folha/folhas (abrir, calcular) → contracheque com a memória → recalcular (nº 2), cancelar, fechar pela contabilidade, recalcular recusado · obtido: smoke-folha-9f3c512-r4.log, 46/46.",
  },
  "5.12.66": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3: lançamento FIXO por vigência (competência inicial e final, esta opcional), com observação e ATO LEGAL, por matrícula. Append-only: encerrar um fixo é dizer a competência final, nunca apagar. ⚠️ FALTA o lançamento COLETIVO.",
  },
  "5.12.79": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: "V6 P2.3: quem tem mais de uma matrícula no ente é UMA pessoa para a contribuição RGPS (bases somadas, teto aplicado uma vez, rateio proporcional com o centavo no último) e UMA fonte pagadora para o IRRF (rendas somadas, dependentes e deduções contados uma vez, imposto rateado pela renda). RPPS e isento não agregam a contribuição. A memória de cada contracheque diz que o valor foi IMPOSTO pela acumulação e por quê (m33-folha.test.ts, fixture N=2: duas matrículas de 5.000 pagam 477,50 + 477,50 em vez de 535 + 535). ⚠️ Sem percurso de navegador: no banco dos percursos não há servidor com duas matrículas vivas na mesma competência.",
  },
  "5.12.37": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: "V6 P2.3: há desconto por LANÇAMENTO informado (fixo ou variável), que serve para uma parcela avulsa, mas NÃO há cadastro de desconto parcelado nem de empréstimo consignado: nada controla número de parcelas, saldo devedor, banco ou quitação. Marcado ausente para que a presença do desconto genérico não seja lida como atendimento — pendência `CONSIGNACOES-E-MARGEM` no MODULO do M33.",
  },
  "5.12.83": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: "V6 P2.3: não há cálculo de margem consignável — nem percentual configurável, nem escolha entre líquido e bruto, nem verbas que deduzem da margem, nem desconto dos empréstimos existentes (que também não existem, 5.12.37). O contracheque calcula o líquido; margem é outra conta, e inventá-la a partir de um percentual embutido seria código no código.",
  },

  // ── V6 P2.4 — portal do servidor ──
  "5.39.23": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.4: o servidor entra com a PRÓPRIA conta em /portal-do-servidor e vê os contracheques das folhas já FECHADAS, cada um com a conta de cada rubrica e a impressão digital (sha256) do cálculo — autoatendimento sem pedir nada ao RH. O recorte é a pessoa da sessão (vínculo explícito usuário → pessoa, pelo CPF): a porta não recebe id de servidor, e pedir a folha certa com outra conta devolve vazio (test/portal-do-servidor.test.ts, fixture N=2 com homônimas). ⚠️ FALTAM: a EMISSÃO em PDF (o contracheque é tela), e a configuração da entidade sobre o que liberar por tipo de folha e regime (5.12.108).",
    rota_verificada: "papéis: rh@percursos.local (admite), admin@cg.pb.gov.br (cria a conta e vincula pela CPF), contabilidade@percursos.local (fecha) e servidor@percursos.local (o próprio servidor) · contexto: banco dos percursos, next build + next start em 3010, build 259af64, 2026-09-13 · passos: pessoa e ficha → admissão com regime → dependente → vínculo da conta à pessoa PELO CPF → folha calculada → ANTES do fechamento o portal não mostra contracheque → fechamento pela contabilidade → /portal-do-servidor mostra a ficha e a competência → contracheque com a conta de cada linha e o sha256 → negativas: a servidora não abre a folha nem o pessoal, e id de folha alheia responde não encontrado · obtido: ver ESTADO §57.",
  },
  "5.12.108": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: "V6 P2.4: o portal libera o contracheque por um critério SÓ — a folha estar FECHADA —, e esse critério é do sistema, não configurável. Não há liberação por tipo de folha e regime, nem data futura de liberação, nem liberação antes do encerramento. Marcado ausente para que a existência do portal não seja lida como atendimento desta configuração.",
  },
  "5.39.25": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.4: o portal lista os contracheques do servidor por competência, com proventos, descontos e líquido — é a ficha financeira dele, na tela. ⚠️ FALTAM o filtro por período e a IMPRESSÃO (não há PDF), que é o que o item pede.",
  },

  // ── V6 P2.3b — a apropriação contábil da folha ──
  "5.12.71": {
    situacao: "PARCIAL",
    evidencia: "V6 P2.3b + V6.1: a folha FECHADA vira despesa sem digitação e, certificada, vira OBRIGAÇÃO LIQUIDADA. O GRUPO DE EMPENHO (cadastro do ente) diz quais rubricas de provento empenham em qual ficha, com qual categoria do art. 141, se o empenho é por servidor (credor = o CPF de cada um) ou um só para o grupo, e (V6.1) quais são as DUAS contas patrimoniais da liquidação — o rol elemento→conta do M01 não cobre o elemento 11 e a VPD dele é de serviços de terceiros, que lançaria a remuneração como serviço contratado. Apropriar chama o `empenhar` e liquidar chama o `liquidar`, os dois do M05: mesmo roteiro contábil, mesma trava de ficha, mesmo exercício, mesma fila do art. 141, nenhuma contabilidade paralela. Só o BRUTO é empenhado; a numeração é determinística e o `@@unique` do elo impede a duplicação; a execução interrompida diz onde parou. PERCORRIDO PELA INTERFACE de ponta a ponta em 14/09/2026 (smoke-atesto-da-folha 37/37 e smoke-apropriacao-da-folha 16/16, build af292c2): 13 empenhos e 13 liquidações numa competência, por cinco papéis distintos. Testes: m33-apropriacao 13 e m33-certificacao 37, N=2; ADR-apropriacao-da-folha-nao-atomica.md. V6.2: os ENCARGOS DO EMPREGADOR entram pela mesma via — apuração numerada sobre o cálculo fechado (versão do parâmetro aprovada por outra pessoa), atesto próprio, empenho SÓ da diferença ainda não empenhada por grupo e liquidação pelo M05 (m33-encargos.test.ts 12, N=2; percurso smoke-encargos-da-folha por seis papéis: na execução U1 25 ok e 2 falhas — a aprovação silenciosa, corrigida em 47a7f5a e confirmada no build 2ddb109 —; na reexecução U2 os passos 3.7/3.8 falharam por estado residual da execução anterior na MESMA competência, não por comportamento). ⚠️ CONTINUA PARCIAL: anulação do empenho dos encargos quando a apuração diminui não existe (REDUCAO-DE-ENCARGO-EMPENHADO recusa), o recolhimento/guia não existe, e a ordem de pagamento e o pagamento seguem sendo atos do M05/M09.",
  },
  "5.12.72": {
    situacao: "PARCIAL",
    evidencia: "V6.2: /folha/folhas/[id]/resumo?formato=csv|pdf entrega a planilha da folha FECHADA por regime e lotação com vínculos, bruto, descontos, líquido e o PATRONAL do ente (apuração vigente dos encargos), com a linha de total somada em Decimal — lib/portas/recursos/resumo-da-folha.ts; test/ui/resumo-da-folha.test.ts (4, o PDF lido por pdf.js independente); percurso smoke-encargos-da-folha 3.6 (CSV pela sessão da contabilidade) e a negativa da servidora. ⚠️ CONTINUA PARCIAL: não há quebra por NATUREZA DE DESPESA nem por conta contábil — a planilha é da folha, não do razão.",
    rota_verificada: "papéis: contabilidade@percursos.local (baixa o resumo), servidor@percursos.local (negativa) · contexto: banco dos percursos v62, next build + next start em 3010 · passos: folha 2026-12 fechada e apurada → /folha/folhas/[id]/resumo?formato=csv → cabeçalho Bruto;Descontos;Líquido;Patronal (ente) e linha TOTAL → a servidora pedindo a mesma URL é recusada · obtido: ver ESTADO, seção V6.2.",
  },
  "5.12.73": {
    situacao: "PARCIAL",
    evidencia: "V6.2: o resumo da folha (CSV/PDF) separa por REGIME (RGPS, RPPS) o valor patronal apurado para o ente e os descontos dos contracheques; o detalhe da folha mostra a apuração dos encargos por componente com base, alíquota da versão aprovada, situação (calculado, zero calculado, não aplicável, parâmetro ausente) e fundamento (m33-encargos-motor.test.ts 16, m33-encargos.test.ts 12). ⚠️ PARCIAL: a coluna de descontos é o total do contracheque (inclui IRRF e consignações), não o valor RETIDO da contribuição previdenciária isolado — o relatório auxiliar 'retido × patronal' por contribuição ainda não existe.",
  },
  "5.39.103": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6.2 P3: /protocolo/servicos cadastra o serviço (endereço público, título, categoria, público, tipo e o assunto do protocolo que o executa) e as VERSÕES com descrição, requisitos, documentos, canais, custo quando declarado, prazo SÓ com fundamento e o formulário em vocabulário fechado; a versão só aparece na carta depois de publicada, e a publicação copia as etapas do roteiro real do assunto. /servicos/[slug] mostra ao público, sem login, a última versão publicada; rascunho responde 404. Testes: modules/m21-protocolo/m21-carta.test.ts t1/t2 (versão publicada imutável, pedido fica na versão em que foi feito, prazo sem fundamento e campo fora do cadastro recusados) e test/carta-de-servicos.test.ts t1 (sem id interno na projeção pública).",
    rota_verificada: "papéis: carta@percursos.local (configura) e visitante sem sessão · contexto: banco dos percursos v62, next build + next start em 3010, build 2ddb109, 2026-09-14 · passos: criar serviço pelo molde → versão pela ilha (a de atualização cadastral com campo 'renda' é recusada nomeando) → publicar pela barra (a barra passa a dizer que não há rascunho) → sem sessão /servicos lista os publicados e não o rascunho → /servicos/[slug] com prazo, fundamento e etapas → rascunho 404 · obtido: smoke-carta-de-servicos 61 passos, 0 falhas (passos 2.x e 3.x).",
  },
  "5.39.104": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V6.2 P3 + V7 M1 U4/U6: a carta de serviços é PÚBLICA (/servicos, filtro por público) e carrega todos os serviços com versão publicada; cada serviço diz, lido da versão publicada (cuja exigência de conta sai da natureza do serviço), se o pedido é 'com a sua conta' ou 'sem conta nem identificação', com acesso direto — /meus-servicos/solicitar/[slug] (sem sessão leva ao login e volta) ou /ouvidoria/[slug] para a manifestação sem conta. Testes: m21-carta.test.ts, carta-de-servicos.test.ts t1 (exigeAutenticacao na lista), ouvidoria-e-avaliacao.test.ts. O passo 9.12b nasceu com a prova de que acusa: no build anterior, sem a indicação, falhou ('ausente'); no candidato, passou.",
    rota_verificada: "papéis: visitante sem sessão, cidada-a@percursos.local, mesa@percursos.local, representante@percursos.local · contexto: cópia isolada do banco dos percursos atualizada (gestao_publica_percursos_v7m1_m21), next build do SHA completo 2d7a9cd servido pelo papel de runtime gestao_app na porta 3012, 2026-09-15 · passos: /servicos sem sessão → a ouvidoria marcada 'sem conta' e o requerimento 'com a sua conta' → pedido pela tela → /ouvidoria registra sem conta · obtido: smoke-carta-de-servicos 84 passos, 0 falhas (build 5937f41 com o mesmo runner: 83/1, só 9.12b).",
  },

  // ── V7 M1 U4 e M2.1 · ouvidoria sem conta, avaliação dos serviços, contrato acompanhado ──
  "5.39.6": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V7 M1 U4: serviço da carta de natureza MANIFESTACAO_ANONIMA (a exigência de conta sai da natureza, e a versão só se publica com assunto que permite anônimo e é sigiloso por padrão). /ouvidoria/[slug] registra sem conta: processo sigiloso sem requerente, entrada no setor da ouvidoria, protocolo e código de acompanhamento mostrados uma vez (só o sha256 fica no banco, fora da URL, página sem referer), cota por hora por origem. A mesa da ouvidoria (TRIAR_MANIFESTACAO_DE_OUVIDORIA) vê só com lotação no setor; triagem é anotação interna; resposta conclusiva encerra o processo. Testes: test/ouvidoria-e-avaliacao.test.ts (10), test/runtime/contrato-runtime-ouvidoria.test.ts. ⚠️ Não há encaminhamento a outro setor (OUVIDORIA-ENCAMINHAMENTO-A-OUTRO-SETOR) nem antiabuso externo (5.39.102).",
    rota_verificada: "papéis: visitante sem sessão, mesa@percursos.local (consulta do protocolo sem lotação), administrador lotado no setor de entrada · contexto: cópia isolada do banco dos percursos atualizada para o candidato 5937f41 (gestao_publica_percursos_v7m1_m21), next build do SHA completo servido pelo papel de runtime gestao_app na porta 3012, 2026-09-15 · passos: /ouvidoria sem sessão lista o canal → registrar sem conta → código errado não mostra nada → com o código: 'recebida', sem relato → a mesa sem lotação não vê → a ouvidoria vê, tria e responde → o manifestante lê a resposta pelo código · obtido: smoke-carta-de-servicos 83 passos, 0 falhas (9.12–9.21).",
  },
  "5.39.105": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V7 M1 U4: metodologia de avaliação versionada (escala com rótulos, período, descrição do método); o requerente avalia o ATENDIMENTO de solicitação decidida, e só enquanto é titular (avaliar de novo é revisão encadeada, não segundo voto); o visitante sem conta dá OPINIÃO GERAL sobre o serviço (cookie de avaliador, cota por hora). As três dimensões pedidas — satisfação com o serviço, qualidade do atendimento, cumprimento de prazos — com nota e a descrição opcional. O resultado público separa atendimento comprovado de opinião geral, na janela da metodologia por dia civil do ente, sem a descrição (privada) e declarando as removidas pela moderação (MODERAR_AVALIACAO_DE_SERVICO, com motivo ABUSO ou DADOS_PESSOAIS). Testes: test/ouvidoria-e-avaliacao.test.ts (a1–a5, borda de dia civil). ⚠️ Sem limiar mínimo de respostas para publicar a média (AVALIACAO-SEM-LIMIAR-DE-PUBLICACAO).",
    rota_verificada: "papéis: carta@percursos.local (metodologia), cidada-a@percursos.local (atendida), visitante sem sessão (opinião), administrador (moderação) · contexto: cópia isolada do banco dos percursos atualizada para o candidato 5937f41 (gestao_publica_percursos_v7m1_m21), next build do SHA completo servido pelo papel de runtime gestao_app na porta 3012, 2026-09-15 · passos: metodologia pela tela → A avalia a solicitação decidida nas três dimensões e descrição → avaliar de novo é revisão → visitante opina → resultado público separado, sem descrição → moderação remove com motivo → o resultado informa a remoção · obtido: smoke-carta-de-servicos 83 passos, 0 falhas (2.7, 2.8, 9.6–9.11).",
  },
  "5.39.102": {
    situacao: "DEPENDENCIA_EXTERNA",
    evidencia: "V7 M1 U4: os atos sem login (manifestação de ouvidoria e opinião sobre o serviço) têm COTA LOCAL por hora por origem (EnvioPublicoSemConta; 5 manifestações e 10 opiniões) — isso é limitação de volume, NÃO reCAPTCHA. O reCAPTCHA depende de chave do provedor, que este ambiente não tem, e nada no sistema declara a verificação como conectada. Pendência ANTIABUSO-EXTERNO-NAO-CONECTADO.",
  },
  "5.21.22": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V7 M2.1: OcorrenciaDeFiscalizacao registrada pelo FISCAL designado e vigente no contrato (na data do fato e hoje), com tipo (conformidade, não conformidade, atraso, impedimento, outro), descrição, data não futura, vínculo opcional à ordem de fiscalização, evidências pelo M22 e encaminhamento ao gestor; o gestor designado dá a resolução, uma por ocorrência. Outro setor com as mesmas ações de perfil e sem designação é recusado nomeando a designação; contrato fora de vigência recusa. Tudo append-only para o papel de runtime. Testes: test/contrato-acompanhado.test.ts (f1–f4), test/runtime/contrato-runtime-fiscalizacao.test.ts.",
    rota_verificada: "papéis: gestora-contrato@, fiscal-contrato@, outro-setor-contrato@percursos.local, administrador e visitante · contexto: cópia isolada do banco dos percursos atualizada para o candidato 5937f41 (gestao_publica_percursos_v7m1_m21), next build do SHA completo servido pelo papel de runtime gestao_app na porta 3012, 2026-09-15 · passos: designar gestora e fiscal pela tela → a gestora programa → o fiscal registra ocorrência com evidência e encaminha → recarregada aparece aguardando o gestor → outro setor não recebe formulário e lê o motivo → a gestora resolve → a projeção pública não leva a ocorrência → revogado, o fiscal perde o formulário · obtido: smoke-contrato-acompanhado 25 passos, 0 falhas.",
  },
  "5.21.23": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1: a ocorrência informa o tipo, descreve o ocorrido e anexa documentos e imagens pelo M22 (evidência baixável só por quem consulta licitações; o visitante não baixa). ⚠️ PARCIAL: o tipo é uma lista fechada do sistema, não um cadastro prévio do ente; e não há 'copiar os anexos da fiscalização' — a ordem de fiscalização não tem anexos próprios. Testes: test/contrato-acompanhado.test.ts f1; percurso smoke-contrato-acompanhado 3.1–3.2 e 6.3.",
  },
  "5.21.3": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1: o gestor designado programa a fiscalização (OrdemDeFiscalizacao) para um fiscal designado do contrato, com a data prevista e o objetivo; a data precisa cair na vigência do fiscal e do contrato. A agenda aparece no dossiê do contrato. ⚠️ PARCIAL: sem HORÁRIO e sem as visões de calendário mensal, semanal e diária. Testes: test/contrato-acompanhado.test.ts f1, f3; percurso smoke-contrato-acompanhado 2.1.",
  },
  "5.21.16": {
    situacao: "PARCIAL",
    evidencia: "V7 M2 U0.1 (acesso-da-fiscalizacao.ts): a visão de FISCALIZAÇÃO do contrato (agenda, ocorrências, evidências, termos provisórios, decisões, motivos) só alcança quem tem designação vigente HOJE naquele contrato (gestor, fiscal, recebedor definitivo) ou definição vigente de administrador da fiscalização; permissão global de outra área não concede; revogada a designação, o alcance cai e os atos anteriores continuam com autor. Os ATOS exigem a designação na transação (outro setor com as mesmas ações recebe SEM-DESIGNACAO-*). Testes: test/acesso-da-fiscalizacao.test.ts (AC01–AC04, AC06; duas mutações acusadas), test/ordem-de-servico-e-recebimentos.test.ts. Percurso smoke-ponte-contratual no candidato 8ed0806 (28/0) e d167c02 (28/0): 4.2, 5.0, 9.1–9.3 e 10.2 negativos. ⚠️ PARCIAL por decisão registrada: os DADOS do contrato (itens, saldos, valores medidos, recebidos e liquidados, termos que lastreiam a liquidação) continuam lidos pela projeção FINANCEIRA (leitura de licitações/despesa ou ato de empenhar/liquidar/pagar), que a execução financeira precisa; o literal 'apenas fiscais e gestores' vale para a fiscalização, não para o cadastro contratual.",
    rota_verificada: "papéis: gestora-contrato@, fiscal-contrato@, recebedor-contrato@, outro-setor-contrato@percursos.local, contabilidade@ e visitante · contexto: clone descartável gestao_publica_percursos_v7m2_reparo, next build do SHA completo d167c02 servido pelo papel de runtime na porta 3012, 2026-09-15 · passos: a gestora emite a ordem → o fiscal mede e recebe provisoriamente → o fiscal NÃO recebe em definitivo (motivo) → outro setor com a ação e sem designação não recebe o formulário → outro setor (lê licitações) vê a projeção financeira sem agenda, ocorrência nem motivo → pela URL direta não baixa o termo provisório (404) → o visitante não baixa o termo definitivo · obtido: 28 passos, 0 falhas (logs em .registro-de-execucao/pacote-v7-m2/c-d167c02/20-percurso-ponte.log).",
  },
  "5.21.17": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: "V7 M2 U0.1: AdministradorDaFiscalizacao — definição e revogação como fatos com ato e vigência (DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO); o administrador vigente alcança a visão de fiscalização de QUALQUER contrato e a lista /licitacoes/fiscalizacao mostra todos; a ação dá o poder de definir, não o alcance (o administrador da plataforma define a si mesmo, com registro). Testes: test/acesso-da-fiscalizacao.test.ts AC03 (e a mutação 'administrador sem vigência' acusada). ⚠️ Nenhum percurso de navegador exercitou a definição do administrador pela tela.",
  },
  "5.21.18": {
    situacao: "PARCIAL",
    evidencia: "V7 M2 U4/U5: quem alcança o contrato vê em /licitacoes/contratos/[id] os dados cadastrais, os itens com original, contratado hoje e unitário vigente, os aditivos (movimentos e aditivos por itens com antes e depois), as ordens de serviço emitidas com autorizado, medido, recebido e liquidado, e os termos em PDF; na fiscalização, as evidências das ocorrências e das medições. Testes: test/ordem-de-servico-e-recebimentos.test.ts, test/aditivo-por-itens.test.ts; percursos smoke-ponte-contratual (1.1, 7.2, 10.1) e smoke-aditivo-por-itens (4.1) em d167c02. ⚠️ PARCIAL: o contrato não tem anexos PRÓPRIOS (instrumento assinado, garantias) na tela, e as COMPRAS (ordens de compra) não se ligam ao contrato — a ordem de compra do M11 compras não informa contrato (ORDEM-DE-SERVICO-DE-MATERIAL).",
  },
  "5.21.26": {
    situacao: "PARCIAL",
    evidencia: "V7 M2 U6: a planilha orçamentária da OBRA é cadastrada por importação com prévia, confirmada em versões com vigência, data-base e referência de preços declaradas, e opcionalmente declara o contrato de execução; cada serviço se liga explicitamente a um item do contrato. Testes: test/planilha-orcamentaria.test.ts (PL01–PL07), test/runtime/contrato-runtime-planilha.test.ts; percurso smoke-planilha-da-obra em d167c02 (9/0). ⚠️ PARCIAL: o controle dos quantitativos EXECUTADOS pela planilha (medição da ordem pelos serviços) está em construção (V7 M2 U7) e ainda sem percurso de navegador.",
  },
  "5.21.27": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V7 M2 U6: a versão da planilha guarda grupos (hierarquia pelo código) e serviços com descrição, unidade, quantidade (4 casas), preço unitário e total calculado uma vez por linha (grupo = soma dos serviços); o total declarado no arquivo fica ao lado, e divergências exigem ciência expressa. Testes: test/planilha-orcamentaria.test.ts PL01 (grupos, serviços, fórmula sem execução, totais e divergências contra valores calculados à mão), PL02 (erros por linha), packages/planilha/xls.test.ts. Candidato 8ed0806: o passo 2.2 falhou por mensagem ausente (versão gravada; 3.1 a mostrou) — corrigido em d167c02.",
    rota_verificada: "papéis: engenharia-obras@percursos.local e gestora-contrato@percursos.local · contexto: clone descartável gestao_publica_percursos_v7m2_reparo, next build do SHA completo d167c02 servido pelo papel de runtime na porta 3012, 2026-09-15 · passos: a engenharia importa o .xlsx → a prévia mostra 4 serviços, 2 divergências e as linhas → confirmar sem ciência é recusado mantendo o digitado → com ciência a versão 1 é confirmada (6 linhas, R$ 5.102,89) → a versão mostra total, grupos e as divergências cientes → a gestora vê as versões sem o formulário · obtido: smoke-planilha-da-obra 9 passos, 0 falhas; capturas da lista, prévia e versão em 360/768/1366/1440 sem transbordo (c-d167c02/23-capturas-da-planilha.log).",
  },
  "5.21.28": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: "V7 M2 U6: importação de .xlsx (lerXlsxDetalhado) e de .xls Excel 97-2003 (lerXls: OLE2/CFB + BIFF8) reconhecidos pela assinatura do conteúdo, com todos os grupos e serviços, sem digitação; fórmulas não executadas (vale o valor gravado), macros só reportadas; Excel 5/95, arquivo protegido e não-planilha recusados nomeando o motivo. O leitor .xls é testado contra um gravador independente. Testes: packages/planilha/xls.test.ts (XL01–XL03), test/planilha-orcamentaria.test.ts PL01 (o mesmo orçamento em .xlsx e .xls dá a mesma análise). ⚠️ Limite pela tela: 1 MB (PLANILHA-ACIMA-DE-1-MB-PELA-TELA); o domínio aceita 5 MB.",
    rota_verificada: "papel: engenharia-obras@percursos.local · contexto: clone descartável gestao_publica_percursos_v7m2_reparo, next build do SHA completo d167c02 pelo papel de runtime, 2026-09-15 · passos: importa orcamento.xlsx → prévia R$ 5.102,89 → confirma → importa orcamento.xls do mesmo orçamento → a prévia dá o mesmo total e as mesmas divergências → um arquivo que não é planilha é recusado nomeando o motivo · obtido: smoke-planilha-da-obra 1.2, 3.2 e 4.1 ok (9/0).",
  },
  "5.38.4": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1/U4/U5: /transparencia/contratos e /transparencia/contratos/[id] publicam, sem sessão e campo a campo, identificação, vigência derivada, valores, aditivos (inclusive por itens, com antes e depois), responsáveis vigentes por nome e ato, ordens de serviço emitidas com período, autorizado e recebido em definitivo e a execução física aprovada — sem ocorrência, motivo, verificação, termo, conta ou CPF. Testes: test/contrato-acompanhado.test.ts (projeção pública), test/acesso-da-fiscalizacao.test.ts AC05; percursos smoke-ponte-contratual 9.4/10.2 e smoke-aditivo-por-itens 5.1 em d167c02. ⚠️ PARCIAL: convênios (TRANSPARENCIA-CONVENIOS, 5.38.37), compras diretas, licitações, entradas e saídas de estoque, bens patrimoniais e frota NÃO têm consulta pública.",
  },
  "5.21.19": {
    situacao: "PARCIAL",
    evidencia: "V7 M2.1: o fiscal designado registra o que verificou como ocorrência vinculada ao contrato (e, opcionalmente, à ordem de fiscalização). ⚠️ PARCIAL: não há vínculo a uma COMPRA (ordem de fornecimento) do contrato para acompanhar entrega de material. Testes: test/contrato-acompanhado.test.ts f1; percurso smoke-contrato-acompanhado 3.1.",
  },
  "5.12.102": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: "V6 P2.2: não há serviço de troca de matrícula; a matrícula é a chave de negócio do vínculo e é única no ente. Trocá-la exigiria histórico da matrícula anterior (pendência TROCA-DE-MATRICULA no MODULO M32).",
  },

  // ═══ V10 T2 (N5) — O LANÇAMENTO TRIBUTÁRIO E A CERTIDÃO ═══
  //
  // ⚠️ AS CINCO SÃO `PARCIAL`, E NENHUMA SOBE DISSO. Cada cláusula desta seção pede várias
  // coisas; o que existe é uma parte de cada uma, e a evidência diz qual é qual. Marcar
  // `IMPLEMENTADO_NAO_VALIDADO` esconderia o que falta, que é o oposto do que o catálogo serve.
  "5.29.23": {
    situacao: "PARCIAL",
    evidencia:
      "V10 T2: a solicitação, a análise e a emissão das TRÊS espécies (negativa, positiva e positiva com efeito de negativa) existem, com decisão humana registrada, validade vinda de configuração versionada e emissão CONGELADA (conteúdo + sha256). Testes: test/certidao.test.ts C3–C4 (21/21). Telas: /receita/certidoes. " +
      "⚠️ PARCIAL, e por três motivos nomeados: (1) NÃO há documento PDF — a emissão congela o conteúdo e a conferência é pela chave, sem arquivo (CERTIDAO-SEM-DOCUMENTO-PDF); (2) a COBERTURA da base fiscal é incompleta: dívida ativa, parcelamento e cadastro econômico/ISS estão FORA DO ALCANCE, e por isso o sistema NÃO emite negativa sozinho — exige declaração escrita de quem assina (DIVIDA-ATIVA-SEM-PESSOA); (3) a exigibilidade suspensa (art. 206 do CTN) não é modelada: quem escolhe 'positiva com efeito de negativa' é a pessoa que analisa.",
  },
  "5.29.22": {
    situacao: "PARCIAL",
    evidencia:
      "V10 T2: existe configuração VERSIONADA de certidão, com validade em dias corridos e fundamento legal obrigatório, e sem ela a emissão é RECUSADA (nada de prazo padrão no código). Teste: test/certidao.test.ts C4 'SEM CONFIGURAÇÃO de validade'. Tela: /receita/certidoes. " +
      "⚠️ PARCIAL, e o que falta é a maior parte do enunciado: não há cadastro de FINALIDADES de certidão, não há validade POR ESPÉCIE (a configuração é uma só, global), não há controle de visibilidade no portal do cidadão nem de restrição por finalidade, e não há cadastro de formulários exibidos no ato da emissão.",
  },
  "5.29.24": {
    situacao: "PARCIAL",
    evidencia:
      "V10 T2: a consulta de todas as solicitações e certidões emitidas existe, com situação, espécie, validade, titular e a cobertura de cada base consultada. Tela: /receita/certidoes. " +
      "⚠️ PARCIAL: não há ativar/desativar uma certidão emitida, e não há reimpressão de documento (não há documento — ver 5.29.23). Decidir duas vezes o mesmo pedido é RECUSADO, e o caminho para uma situação nova é um pedido novo (test/certidao.test.ts C4 'decidir duas vezes').",
  },
  "5.29.25": {
    situacao: "PARCIAL",
    evidencia:
      "V10 T2: há serviço público de consulta de autenticidade — /consulta/certidao, SEM sessão —, com chave de 64 hex de randomBytes (não enumerável), devolvendo só protocolo, espécie, titular com documento MASCARADO, emissão, validade e vigência; nunca o extrato de débitos. Chave inválida e chave inexistente respondem IGUAL. Testes: test/certidao.test.ts C5 (5 casos). " +
      "⚠️ PARCIAL: não há QR Code, porque não há documento impresso onde imprimi-lo (CERTIDAO-SEM-DOCUMENTO-PDF). A chave é digitada, não lida por câmera.",
  },
  "5.29.50": {
    situacao: "PARCIAL",
    evidencia:
      "V10 T2: cada lançamento tributário congela a MEMÓRIA do cálculo — a fórmula do ente, o fundamento, a versão do cadastro, a versão da tabela e cada variável com o seu valor e a sua ORIGEM (cadastro, atributo do imóvel ou parâmetro da tabela) — e a tela a mostra, com a impressão digital (sha256) do que foi congelado. Atualizar a tabela depois NÃO muda o lançamento: test/lancamento-tributario.test.ts B1 'a memória é CONGELADA'. Tela: /receita/lancamentos/[loteId]. " +
      "⚠️ PARCIAL: não há impressão da memória em documento, e correção monetária, multa e juros por parcela NÃO são modelados — o que se depura é o cálculo do lançamento, não o da parcela vencida.",
  },

  // ═══ V11 V8 — A AGENDA DO GUICHÊ ═══
  "5.39.92": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia:
      "V11 V8 + V8.1: o atendimento presencial tem agenda E o CIDADÃO marca sozinho, sem conta. A contratante ORGANIZA pela tela (/protocolo/guiches): unidade, guichê, que serviços da carta cada guichê atende, se cada um aceita marcação PELA INTERNET (`false` por padrão — nada vai ao portal por acidente), a oferta de horários por dia da semana com duração e CAPACIDADE, e os dias em que a unidade não abre. A agenda de cada dia (/protocolo/guiches/[id]) marca, confirma a presença, remarca, cancela e registra o atendimento realizado. O portal do cidadão (/agendamento e /agendamento/acompanhar) lista só o que o ente abriu, oferece os horários com vaga, marca, devolve um código de acompanhamento que aparece UMA vez, consulta e cancela. " +
      "⚠️ MARCAR É CONSUMO DE SALDO, e os DOIS caminhos disputam a mesma capacidade sob o MESMO trinco do lugar (guiche:dia:hora), tomado ANTES da contagem. ⚠️ NÃO HÁ EXPEDIENTE PADRÃO: sem oferta publicada o guichê não oferece horário nenhum e a marcação é RECUSADA nomeando a ausência. ⚠️ O PORTAL NÃO TOCA O CADASTRO DE PESSOAS: o titular é DECLARADO (CPF digitado não é autenticação, e casar pelo documento vazaria quem já é conhecido do município); a identificação acontece no guichê, e a agenda interna mostra a marcação como 'pela internet, dados a conferir'. O segredo do cidadão é guardado só por hash — o `codigo`, que aparece na agenda interna, NÃO cancela. Defesas do caminho público: serviço aberto ao portal, quota por origem e UM atendimento vivo por documento e serviço, este sob trinco próprio (posto 29). " +
      "Testes: modules/m21-protocolo/m21-guiche.test.ts (26/26), m21-guiche-portal.test.ts (19/19), m21-guiche-dominio.test.ts (19/19, verde também sob TZ +14 e -9) e test/ui/guiche-formularios.test.tsx (13/13); dezessete mutações provadas entre os três arquivos.",
    rota_verificada:
      "papel: CONFIGURAR_AGENDA_DO_GUICHE (organizar), RESERVAR_ATENDIMENTO_NO_GUICHE (marcar e remarcar), REGISTRAR_ATENDIMENTO_NO_GUICHE (confirmar e registrar), CONSULTAR_PROTOCOLO (ler) e NENHUM no portal do cidadão — que é o ponto · " +
      "contexto: banco de INSTALAÇÃO LIMPA (gestao_publica_instalacao_v7m2_v81, 197 migrations, atualização de permissões v26), next build + servir-percursos em 3010, 2026-09-20 · " +
      "passos: /protocolo/guiches → abrir unidade → criar guichê → habilitar o serviço → publicar 08:00-10:00 de 30 min com 1 lugar → agenda do dia: marcar, confirmar, remarcar, registrar → fechar o dia → ABRIR o serviço à internet → SAIR DA SESSÃO → /agendamento: escolher, ver horários, marcar, guardar o código → /agendamento/acompanhar: consultar e cancelar · " +
      "esperado: o guichê recém-criado DIZ que não atende nada e não tem horário; o horário LOTADO some do select; remarcar LIBERA o horário de origem; fechar o dia é recusado nomeando quantas pessoas ainda esperam; o serviço só aparece no portal depois de o ente o abrir; o portal marca SEM sessão, o segredo aparece uma vez com aviso, a marcação chega à agenda interna marcada como declarada, código errado e inexistente respondem IGUAL, o mesmo documento não marca duas vezes o mesmo serviço, e o cancelamento fica com o autor PORTAL-DO-CIDADAO · " +
      "obtido: 44/44 passos, 0 falhas (scripts/smoke-guiche.ts), na QUARTA corrida contra o mesmo banco — idempotente · " +
      "artefato: .registro-de-execucao/percurso-guiche-v81d-2026-09-20T03-29-45-245Z.log.",
  },

  // ═══ V11 V7.3 — A DISPONIBILIDADE DE RECURSO NOVO TEM TELA ═══
  "5.10.1.48": {
    situacao: "PARCIAL",
    evidencia:
      "V11 V7.3: a tela /planejamento/recursos-novos mostra, POR FONTE e por origem (superávit financeiro, excesso de arrecadação, operação de crédito), o valor DECLARADO, o já UTILIZADO e o saldo DISPONÍVEL, mais os decretos que consumiram cada fonte. ⚠️ ZERO SEGUNDA ARITMÉTICA: o utilizado sai da MESMA função (usadoDaDisponibilidade) que o guard do crédito subtrai dentro da transação que grava o decreto — uma tela que somasse por conta própria anunciaria saldo que o guard recusa. A declaração é VERSIONADA: corrigir a apuração cria versão e não apaga o número contra o qual um decreto já foi aprovado. Testes: modules/m03-creditos/m03-declaracao-de-disponibilidade.test.ts (12/12, quatro mutações provadas: apagar a anterior, remover o piso do já usado, ler a versão errada, remover o distinct da consulta) e test/ui/FormDeclaracao.test.tsx (9/9). " +
      "⚠️ PARCIAL, e por dois motivos nomeados: (1) a consulta NÃO é 'por entidade e consolidada' — a apuração é do ENTE, por fonte, e não há recorte por unidade gestora nem soma consolidada de entidades (DISPONIBILIDADE-SEM-RECORTE-POR-ENTIDADE); (2) o valor do superávit é DECLARADO por quem apurou, com a explicação de onde saiu, e não derivado do balanço patrimonial do exercício anterior pelo próprio sistema — a amarração contra os FATOS do encerramento existe só no crédito por superávit (SuperavitFinanceiroPort), não nesta consulta.",
    rota_verificada:
      "papel: DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO (declarar) e CONSULTAR_PLANEJAMENTO (ler) · " +
      "contexto: banco de INSTALAÇÃO LIMPA criado do zero nesta corrida (gestao_publica_instalacao_v7m2_v73, 194 migrations), next build + servir-percursos em 3010, 2026-09-19 · " +
      "passos: /planejamento/recursos-novos → declarar 100.000,00 na fonte 500 por excesso de arrecadação → redeclarar 120.000,00 → decreto suplementar de 7.500,00 em /planejamento/creditos-adicionais · " +
      "esperado: a primeira declaração se anuncia como primeira; a segunda confirma dizendo que substituiu 100.000,00; a tela mostra UMA linha (a vigente, marcada v2); as DUAS versões continuam no banco; quem não tem a ação é recusado pelo SERVIDOR nomeando-a · " +
      "obtido: 29/29 passos, 0 falhas (scripts/smoke-credito-adicional.ts) · " +
      "artefato: .registro-de-execucao/percurso-credito-v73-final-2026-09-19T23-13-34-501Z.log.",
  },
};

// ═══════════════════════════════════════════════════════════════════════════

interface Clausula {
  id: string;
  situacao: string;
  evidencia: string;
  [k: string]: unknown;
}

interface Catalogo {
  situacoes_validas: readonly string[];
  clausulas: Clausula[];
  [k: string]: unknown;
}

function main(): void {
  const aplicar = process.argv.includes("--aplicar");
  const cat = JSON.parse(readFileSync(CAMINHO, "utf8")) as Catalogo;

  const porId = new Map(cat.clausulas.map((c) => [c.id, c]));
  const problemas: string[] = [];
  let mudadas = 0;
  let jaIguais = 0;

  for (const [id, marca] of Object.entries(MAPA)) {
    const c = porId.get(id);

    // ⚠️ CLÁUSULA INEXISTENTE É ERRO, não silêncio. Um id digitado errado marcaria nada e
    // o placar diria que está tudo certo — o pior resultado possível para um inventário.
    if (c === undefined) {
      problemas.push(`cláusula ${id} não existe no catálogo`);
      continue;
    }
    if (!cat.situacoes_validas.includes(marca.situacao)) {
      problemas.push(`${id}: situação "${marca.situacao}" não é válida`);
      continue;
    }
    // ⚠️ SEM EVIDÊNCIA NÃO SE MARCA — é literalmente o aviso do catálogo.
    if (marca.evidencia.trim().length < 40) {
      problemas.push(`${id}: evidência ausente ou curta demais para provar alguma coisa`);
      continue;
    }

    const rota = marca.rota_verificada ?? (c["rota_verificada"] as string | undefined) ?? "";
    if (c.situacao === marca.situacao && c.evidencia === marca.evidencia && (c["rota_verificada"] ?? "") === rota) {
      jaIguais++;
      continue;
    }
    c.situacao = marca.situacao;
    c.evidencia = marca.evidencia;
    c["rota_verificada"] = rota;
    mudadas++;
  }

  if (problemas.length > 0) {
    console.error("\n⚠️ PROBLEMAS NO MAPA — nada foi gravado:\n");
    for (const p of problemas) console.error(`  · ${p}`);
    process.exit(1);
  }

  const placar: Record<string, number> = {};
  for (const c of cat.clausulas) {
    placar[c.situacao] = (placar[c.situacao] ?? 0) + 1;
  }

  console.log(`\nCatálogo: ${cat.clausulas.length} cláusulas.`);
  console.log(`Mapa: ${Object.keys(MAPA).length} marcações (${mudadas} a mudar, ${jaIguais} já iguais).\n`);
  for (const [s, n] of Object.entries(placar).sort((a, b) => b[1] - a[1])) {
    const pct = ((n / cat.clausulas.length) * 100).toFixed(1);
    console.log(`  ${s.padEnd(28)} ${String(n).padStart(5)}  (${pct}%)`);
  }

  const verificadas = cat.clausulas.length - (placar["NAO_VERIFICADO"] ?? 0);
  console.log(
    `\n⚠️ ${verificadas} de ${cat.clausulas.length} cláusulas verificadas ` +
      `(${((verificadas / cat.clausulas.length) * 100).toFixed(1)}%). ` +
      `As outras ${placar["NAO_VERIFICADO"] ?? 0} continuam NAO_VERIFICADO — e isso é ` +
      `informação, não lacuna do script: ninguém olhou para elas ainda.\n`
  );

  if (!aplicar) {
    console.log("(simulação — rode com `--aplicar` para gravar)\n");
    return;
  }
  writeFileSync(CAMINHO, `${JSON.stringify(cat, null, 2)}\n`);
  console.log(`gravado em ${CAMINHO}\n`);
}

main();
