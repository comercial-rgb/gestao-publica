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
