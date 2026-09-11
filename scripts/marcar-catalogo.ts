import { readFileSync, writeFileSync } from "node:fs";

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

const CAMINHO =
  process.env["CATALOGO"] ??
  "/Users/winnervinicius/Developer/gestao-publica-execucao/catalogo-execucao.json";

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
const MAPA: Readonly<Record<string, Marca>> = {
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
    situacao: "IMPLEMENTADO_NAO_VALIDADO",
    evidencia:
      "`DividaConsolidada` com identificador, credor, tipo (CONTRATUAL/MOBILIARIA), LEI AUTORIZATIVA (art. 32 da LRF — sem ela não há dívida legal) e conta de passivo por PARÂMETRO. As incorporações posteriores são MOVIMENTOS (`ATUALIZACAO_MONETARIA`), com lançamento próprio por `RoteiroDivida` e idempotência pela competência. modules/m10-patrimonial/m10-divida.test.ts. ⚠️ Sem tela, e o histórico gerencial exigido pelo TCE não foi conferido contra leiaute — pendência DIVIDA-UI.",
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
    evidencia: `Acesso por senha (scrypt), permissão POR AÇÃO DE NEGÓCIO e por PERFIL, com recorte por unidade gestora — e nega por omissão: sem perfil, o usuário não pode NADA (modules/m16-travamento/autorizacao.ts). O censo é EXAUSTIVO e o grep-teste prova as duas direções: todo serviço de mutação tem ação, e toda ação tem serviço (m16-censo.test.ts, 192 serviços e 185 ações no ENT03b). ${SMOKE_03B}: quem não tem a ação NÃO VÊ o botão, e vê o motivo.`,
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
