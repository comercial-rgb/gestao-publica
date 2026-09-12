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
const PERCURSO_ACERVO = "scripts/smoke-acervo.ts (21 passos, 0 falhas, 2026-09-12):";

const SMOKE_04 =
  "scripts/smoke-ent03c.ts (41 passos, 0 falhas, 2026-09-11, DUAS execuções — a segunda " +
  "contra o banco já povoado pela primeira, que é o que prova que o percurso não depende " +
  "de banco limpo)";

const PCASP_OFICIAL =
  "prisma/seed/pcasp-oficial.ts semeia as 7.864 contas do `Pcasp_2025.xlsx` publicado pelo " +
  "TCE-PB (sha256 conferido contra docs/oficial/tce-pb/MANIFEST.json antes de qualquer " +
  "leitura; versão e vigência registradas lá). test/pcasp-oficial.test.ts.";

const MAPA: Readonly<Record<string, Marca>> = {
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
  "5.10.1.72": {
    situacao: "PARCIAL",
    evidencia:
      "O CONTROLE EXISTE e é do adapter (INVARIANTE 5): partida em conta sintética é " +
      "recusada, e `opcoesDoCadastro` só oferece analíticas ao formulário. ⚠️ E A MEDIÇÃO " +
      "CONTRA O PLANO REAL MOSTROU QUE O ENTE NÃO CUMPRE: confrontados os 70 códigos que o " +
      "código de produção usa contra o PCASP oficial, 55 são SINTÉTICOS lá — a maioria é " +
      "ancestral de hierarquia e nunca recebe partida, mas cerca de dez estão em ROTEIRO " +
      "(5.2.2.1.1.00.00 da dotação inicial, 8.2.1.1.1.00.00 da DDR, 2.1.3.1.1.00.00 de " +
      "fornecedores). test/contas-contra-o-plano-oficial.test.ts fixa a lista e FALHA se " +
      "ela crescer. A correção muda lançamento já gravado e exige caracterização antes — " +
      "pendência PLANO-DE-CONTAS-FORA-DO-PCASP.",
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
      "com valor, data do fato e quem lançou. ⚠️ FALTA A CONSULTA DO PRÓPRIO EVENTO: não " +
      "há tela onde o usuário veja, ANTES de executar, quais lançamentos uma transação " +
      "vai produzir — é a segunda metade literal da cláusula. Pendência " +
      "CONSULTA-DE-EVENTOS-CONTABEIS.",
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
  "5.10.2.6": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "Vínculo muitos-para-muitos `FonteDaContaBancaria`, em migration aditiva com backfill (a fonte única virou a primeira linha do rol). O movimento VALIDA que a fonte informada está no rol, pela mesma função que os outros quatro sítios da TR 5.23 usam (`exigirFonteNoRolDaConta`). Rol vazio cai para a fonte PADRÃO e recusa qualquer outra. modules/m09-tesouraria/m09-movimentacao.test.ts t18/t19/t20. ADR: docs/adr/ADR-conta-bancaria-com-varias-fontes.md. A TELA mostra o rol por conta, mas o CADASTRO do rol ainda não tem superfície — pendência ROL-DE-FONTES-UI.",
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
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `\`MedicaoDeObra\` com período (dias CIVIS do ente — 31/01 termina às 23:59:59 DELE, e não às 20:59:59), valor medido NO PERÍODO (o acumulado é derivado), responsável técnico e REGISTRO PROFISSIONAL obrigatório. Dois guards distintos: períodos NÃO se sobrepõem, com bordas INCLUSIVAS (m11-medicoes.test.ts t2 — acabar em X e começar em X sobrepõe, que é o caso mais comum), e Σ das medições não passa do valor VIGENTE do contrato (m11-medicoes-integracao.test.ts t1). ⚠️ LIQUIDAR OBRA EXIGE MEDIÇÃO APROVADA, dentro da transação da liquidação: sem medição, com medição pendente, acima do medido ou de OUTRA obra, a liquidação INTEIRA aborta (t4–t6b). Quem mede NÃO aprova (t3). Sem tela.`,
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
    evidencia: `Acesso por senha (scrypt), permissão POR AÇÃO DE NEGÓCIO e por PERFIL, com recorte por unidade gestora — e nega por omissão: sem perfil, o usuário não pode NADA (modules/m16-travamento/autorizacao.ts). O censo é EXAUSTIVO e o grep-teste prova as duas direções: todo serviço de mutação tem ação, e toda ação tem serviço (m16-censo.test.ts, 192 serviços e 185 ações no ENT03b). ${SMOKE_03B}: quem não tem a ação NÃO VÊ o botão, e vê o motivo. ⚠️ A DEFINIÇÃO das permissões — a segunda metade da cláusula — só ficou alcançável no ENT06 item 1: até ali, conceder uma ação a um perfil existia no bootstrap de INSTALAÇÃO (que recusa rodar em banco povoado) e num script de terminal, e uma instalação em operação não tinha caminho nenhum. ${PERCURSO_PERFIS} o administrador cria o perfil pela tela (ele nasce vazio), escolhe a ação POR ÁREA — não numa lista com o censo inteiro —, concede global ou por unidade gestora, e revoga; a ação concedida some da lista ao ser revogada e reaparece marcada como já concedida enquanto vale. A trava contra revogar a ÚLTIMA concessão de CONCEDER_ACAO_A_PERFIL foi exercida PELA TELA e recusou, com o motivo (m16-perfis.test.ts t9 a prova nas duas direções).`,
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
  "5.19.14": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} A consulta de bens por localização, responsável e código do produto não existe porque os três campos não existem. Por tombamento e descrição o dado está no modelo, mas não há tela: a rota /patrimonio/bens é o DEMONSTRATIVO por classe, não a lista de bens.`,
  },
  "5.19.15": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} Cadastramento, classificação (classe), movimentação (onze tipos com roteiro) e baixa existem e estão provados — inclusive que a classe positiva NÃO mascara a baixa de um bem que já não vale (m10-patrimonio.test.ts t5b), que é o erro que um saldo só por classe esconderia. ⚠️ FALTA a LOCALIZAÇÃO, citada no enunciado, e falta a tela de manutenção do cadastro.`,
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
    evidencia: `${CENSO} Depreciação e reavaliação por BEM (o movimento aceita \`bemId\`) com histórico do valor contábil: base 12.000, residual 10%, vida 24 → parcela 450,00 e contábil 11.550,00 (m10-competencia.test.ts t1). A MESMA competência duas vezes é rejeitada e o SELECT prova UM movimento (t2); estornada, ela pode ser refeita, porque quem governa é o SALDO e não uma trava (t3). A alteração a maior e a menor são tipos distintos (\`REAVALIACAO_AUMENTO\`/\`REAVALIACAO_REDUCAO\`), e a redução que estouraria o valor contábil é recusada (t9b). Sem tela.`,
  },
  "5.19.29": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ A SEGUNDA CLÁUSULA FORTE DA SEÇÃO. As rotinas seguem as NBCASP: valor residual e vida útil por classe (\`ParametroAtualizacaoClasse\`), os TRÊS métodos que o MCASP 1.1.5 exige — depreciação para tangíveis, amortização para intangíveis, exaustão para recursos naturais — com roteiro próprio cada um (m10-competencia.test.ts t7), reavaliação nos dois sentidos por NBC TSP 07 (t9) e impairment com o teto do valor contábil (t6). Classe SEM parâmetro é erro nomeado com zero escrita, movimento E lançamento (t8) — fail-closed, nunca "deprecia com o default". Sem tela.`,
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
  "5.19.39": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O estorno por movimento existe, restaura classe E bem com lançamento invertido e valor PRESERVADO (m10-patrimonio.test.ts t8), e estorno de estorno é erro (t8b). Estornada a competência, ela pode ser refeita (m10-competencia.test.ts t3). ⚠️ FALTA o estorno da VIRADA como operação única, porque a virada não existe (5.19.38).`,
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
  "5.17.14": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} O processo se registra com número único, modalidade, objeto e valor licitado (\`ProcessoLicitatorio\`), e contrato em processo NÃO HOMOLOGADO é rejeitado com NADA gravado (m11.test.ts t2). ⚠️ FALTAM a DATA do processo — só existe \`criadoEm\`, que é o instante do registro e não o do fato — e as requisições de compra, que não existem. O ano do processo vive dentro da string do número, não como eixo.`,
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
  "5.17.39": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} ⚠️ ESTA É FORTE. A reserva orçamentária vinculada à licitação existe e o guard é apertado: reserva VINCULADA a licitação exige contrato DAQUELE processo (TR 4.42, m11-integracao.test.ts t6), a categoria do empenho é HERDADA do contrato e divergência é erro — nunca sobrescrita em silêncio (t4) — e o saldo do contrato bloqueia, com a anulação devolvendo por derivação e nunca por flag (t3). ⚠️ FALTA a indicação do recurso no PROCESSO antes do contrato, e falta a liberação da diferença na adjudicação (5.17.77).`,
  },
  "5.17.40": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Não há ata de registro de preços. ⚠️ É a família "naquela data" de novo, e foi nomeada na varredura do ENT03b: saldo de ata é pergunta com eixo TEMPORAL, e construí-la como coluna de saldo repetiria o erro que o contrato já não comete (lá o valor é DERIVADO dos movimentos — m11.test.ts t1). Contraprova em test/censo-de-ausencias.test.ts.`,
  },
  "5.17.41": {
    situacao: "AUSENTE_CONFIRMADO",
    evidencia: `${CENSO} Sem ata não há fiscal nem gestor de ata. O contrato TEM fiscal (\`fiscalNome\`, \`fiscalCpf\`, \`fiscalDesignacao\`); a ata não existe.`,
  },
  "5.17.42": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ A INTEGRAÇÃO COM A CONTABILIDADE É A PARTE MAIS PROVADA DA SEÇÃO. A reserva bloqueia a dotação e o empenho a consome; dois empenhos concorrentes que estourariam o contrato gravam exatamente UM (m11-limites.test.ts t1); empenhar COM contrato sem o M11 ligado às dependências FALHA em vez de passar batido (m11-integracao.test.ts t9); e a vigência bloqueia com a borda passando, o dia seguinte não, e a prorrogação liberando (t2). Sem tela: /licitacoes é uma landing de navegação, não um cadastro.`,
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
  "5.17.64": {
    situacao: "PARCIAL",
    evidencia: `${CENSO} A situação do processo é DERIVADA e nunca uma coluna — \`situacaoDoProcesso(dataHomologacao)\`, e a homologação tem duas verdades confrontadas (cadastro × evento) com o duplo evento barrado (m11-integracao.test.ts t7). ⚠️ MAS O ROL É DE DOIS: aberto e homologado. Faltam anulada (total/parcial), deserta, fracassada, descartada e aguardando — e a homologação PARCIAL, que o enunciado pede, é impossível hoje: \`HomologacaoProcesso\` é do processo inteiro.`,
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
  "5.17.75": {
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia: `${CENSO} ⚠️ O NÚCLEO DA SEÇÃO, E ELE É SÓLIDO. Valor e prazo do contrato são DERIVADOS dos movimentos, nunca colunas de saldo — 115.000 e 31/03/2027 a partir dos aditivos (m11.test.ts t1) — e o corte é pela data do FATO: o aditivo de 2027 não muda o contrato de 2026 (t7). O XOR valor/prazo é barrado pelo Zod nos dois sentidos e pelo CHECK no INSERT direto (t4), o estorno devolve a dimensão CERTA e o duplo estorno é barrado pelo índice (t5). ⚠️ FALTAM publicações e reajuste/apostila. Sem tela.`,
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
    evidencia: `${CENSO} O contrato tem fiscal com nome, CPF e designação (\`fiscalNome\`, \`fiscalCpf\`, \`fiscalDesignacao\`), e a segregação que o fiscal encarna está provada na medição: quem mede NÃO aprova, e aprovar duas vezes é recusado porque a segunda apagaria quem aprovou primeiro (m11-medicoes-integracao.test.ts t3, t3b). ⚠️ FALTA o GESTOR (papel distinto do fiscal) e falta a definição nos ADITIVOS, que o enunciado pede — o fiscal é um por contrato, não um por instrumento.`,
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
  "5.19.2": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): gerarEtiquetaDeBem grava o codigo de barras no bem e e IDEMPOTENTE: a segunda chamada devolve a MESMA etiqueta. Gerar codigo novo faria o leitor deixar de reconhecer a etiqueta ja colada." },
  "5.19.3": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} o bem é cadastrado PELA TELA /patrimonio/bens-patrimoniais, classificado por uma CLASSE — que carrega a espécie, móvel ou imóvel — e identificado por um TIPO DE INCORPORAÇÃO cadastrado no próprio percurso e escolhido no formulário. Após recarga, a listagem traz o bem com a classe e com como ele entrou. ⚠️ Até este lote NADA no domínio criava um BemPatrimonial: adquirirBem exige liquidação (o bem adquirido nasce de despesa liquidada) e registrarEntradaAvulsa recebe um bem que já existe. O serviço cadastrarBem e a ação CADASTRAR_BEM nasceram aqui; modules/m10-patrimonial/m10-acervo.test.ts (11 testes) prova as recusas nomeadas — classe desativada, tombamento repetido, tipo inexistente, sem permissão — e que o cadastro NÃO move o razão.`,
  },
  "5.19.7": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_ACERVO} o tipo de incorporação é cadastrado pela tela e, na MESMA execução, aparece no select do formulário do bem e é ESCOLHIDO — que é exatamente o que a cláusula pede ao dizer "para ser usado no cadastramento dos mesmos". O rol cresce por cadastro do ente, não por enum no código: a tela de tipos e a do bem são as duas pontas do mesmo fato, e o percurso liga uma à outra sem passar pelo banco à mão.`,
  },
  "5.19.10": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): bensSobResponsabilidade deriva os bens de uma pessoa numa data. DERIVA em vez de filtrar por coluna: 'de quem era este bem em dezembro?' e a pergunta que o termo de responsabilidade faz." },
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
  "5.19.23": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A movimentacao FISICA passou a existir (MovimentoDeGestaoDoBem: localizacao, responsavel, estado, situacao, transferencia entre entidades), ao lado da FINANCEIRA que ja existia (MovimentoPatrimonial: agregacao, reavaliacao, depreciacao). Os dois eixos sao separados de proposito, e ha teste contando LancamentoContabil antes e depois para provar que a gestao NAO toca o razao." },
  "5.19.27": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A unidade gestora do bem e derivada da ultima TRANSFERENCIA_ENTRADA; o inventario e POR unidade gestora." },
  "5.19.28": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): transferirBemEntreEntidades gera as DUAS pernas sob um operacaoId, tudo-ou-nada, com viabilidade conferida ANTES de qualquer escrita. Estornar UMA estorna as DUAS - meia transferencia estornada deixaria o bem em duas entidades ou em nenhuma. Bem BAIXADO ou em origem diferente da declarada RECUSA." },
  "5.19.30": {
    situacao: "VALIDADO_LOCALMENTE",
    evidencia: `${PERCURSO_GESTAO_DO_BEM} o motivo de baixa é incluído PELA TELA /patrimonio/motivos-de-baixa, com código e descrição, e a lista o traz APÓS RECARGA. O modelo já estava provado desde o ENT05 — MotivoDeBaixa é TABELA, e um enum no código seria a constante que erra no segundo ente —; o que não existia era superfície, e um cadastro que o servidor municipal não alcança está implementado e não está entregue.`,
  },
  "5.19.36": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): TermoPatrimonial do tipo RESPONSABILIDADE, individual/setorial/por responsavel, com os bens como itens. Emitir o termo REGISTRA o movimento de responsabilidade na mesma transacao: sem isso o termo diria uma coisa e a derivacao do bem outra. Termo sem responsavel RECUSA." },
  "5.19.37": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): TermoPatrimonial do tipo BAIXA, que poe a situacao do bem em BAIXADO pelo mesmo caminho." },
  "5.19.42": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): FormulaDeAvaliacao com expressao INTERPRETADA por avaliador proprio - nunca eval nem Function. A gramatica tem quatro operacoes, parenteses, numeros e um rol FECHADO de seis grandezas do bem; identificador global, chamada de funcao e acesso a propriedade sao INEXPRIMIVEIS, nao bloqueados. Metade do teste e negacao, incluindo o ataque por constructor que derrota sanitizacao por lista negra. Formula invalida nao chega a ser salva." },
  "5.17.2": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material com descricao sucinta e detalhada em db.Text (e o que cumpre 'sem limitacao de caracteres'), grupo/classe/subclasse por auto-relacao, e N-N de unidades de medida COM FATOR DE CONVERSAO. A N-N e literal na clausula ('uma ou mais unidades') e e o que torna aritmetico comprar em caixa e distribuir em unidade - decisao D6. Exatamente uma unidade de estoque, fail-closed." },
  "5.17.3": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): ClassificacaoDeMaterial (consumo, permanente, servico, obra) e CategoriaDeMaterial (perecivel, nao perecivel, estocavel, combustivel) - os dois rois literais da clausula." },
  "5.17.5": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): MarcaAprovada N-N com o material (decisao D7)." },
  "5.17.6": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material.catmat opcional - nem todo material do ente tem correspondente federal, e inventar um seria pior do que nao ter." },
  "5.17.8": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): Material.ativo desabilita o cadastro obsoleto; o servico recusa movimentar material inativo E o historico fica, porque o historico sao os movimentos." },
  "5.17.9": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): MaterialElementoDespesa N-N, e emitirOrdemDeCompra RECUSA quando a ficha traz elemento nao relacionado - e o que 'impedindo' quer dizer. Material SEM relacao nenhuma PASSA, com o motivo declarado: ele nao esta sendo comprado no elemento errado, esta sendo comprado por quem ainda nao parametrizou." },
  "5.17.46": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): PesquisaDePrecos com itens e cotacoes por fornecedor, para estimativa de novas aquisicoes." },
  "5.17.48": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): estatisticasDaPesquisa deriva medio, minimo e maximo das cotacoes. Provado com N=3 a precos diferentes (9, 11, 13 gera min 9, max 13, medio 11): com duas cotacoes media e mediana coincidem, e uma implementacao errada passaria. Item SEM cotacao nao vira zero - ausencia nao e preco." },
  "5.17.51": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): registrarSolicitacaoDeCompra com itens, justificativa e solicitante." },
  "5.17.52": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A situacao (pendente, autorizada, anulada) e DERIVADA dos movimentos. Uma coluna responderia 'autorizada' sem dizer POR QUEM e QUANDO - e e isso que o controle interno cobra quando a compra e questionada." },
  "5.17.53": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): movimentarSolicitacaoDeCompra grava AUTORIZACAO como fato com autor e data. Autorizar duas vezes RECUSA; anular o que esta pendente RECUSA." },
  "5.17.54": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A solicitacao e do SETOR, e a autorizacao e cobrada com escopo de setor - a mesma porta que a tramitacao de processo do M21 usa, sem inventar um segundo eixo de acesso." },
  "5.17.56": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A solicitacao informa os itens e, opcionalmente, o recurso orcamentario pela ficha da ordem que dela nascer." },
  "5.17.96": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra nos tres tipos da clausula: ORDINARIA, GLOBAL e ESTIMATIVA." },
  "5.17.97": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A ordem registra data de emissao e de vencimento, fornecedor, finalidade e recurso orcamentario (ficha) - os dados que a clausula pede para a geracao dos empenhos." },
  "5.17.99": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A alteracao da ordem e possivel enquanto nao ha empenho; com recurso orcamentario declarado, o servico recusa alterar por si e aponta a cascata do empenho." },
  "5.17.100": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): A CASCATA VAI DO EMPENHO PARA A ORDEM, e a clausula fixa essa direcao - que e o oposto do intuitivo. estornarOrdemDeCompra RECUSA quando a ordem tem recurso orcamentario declarado, porque estornar ali deixaria a dotacao comprometida por uma compra cancelada. Tambem recusa com recebimento ja feito: o material entrou. Pendencia nomeada EMPENHO-APONTA-PARA-ORDEM-DE-COMPRA para o vinculo que falta." },
  "5.17.102": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra.desconto, com recusa quando ele passa do total - a ordem ficaria negativa e o fornecedor pagaria ao ente." },
  "5.17.103": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): OrdemDeCompra.consumoImediato marca os produtos que nao passam pela prateleira, para o lancamento de saida ja no empenhamento." },
  "5.17.105": { situacao: "IMPLEMENTADO_NAO_VALIDADO", evidencia: "ENT05 (modelo das tres secoes derrubadas): saldoDaOrdemDeCompra devolve quantidade, recebida, pendente e valor pendente, item a item, com corte por DATA CIVIL. Soma dos recebimentos, nunca coluna (decisao D5) - e receber alem do pedido RECUSA, porque o saldo negativo significaria que o ente aceitou e vai pagar mais do que contratou." },
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

    if (c.situacao === marca.situacao && c.evidencia === marca.evidencia) {
      jaIguais++;
      continue;
    }
    c.situacao = marca.situacao;
    c.evidencia = marca.evidencia;
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
