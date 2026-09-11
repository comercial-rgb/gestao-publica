/**
 * LOCKS PESSIMISTAS — e a ORDEM DE AQUISIÇÃO, que aqui deixa de ser um comentário e
 * vira uma INVARIANTE EXECUTÁVEL.
 *
 * ═══ POR QUE ELES EXISTEM ═══
 * Todo consumo de saldo neste sistema segue o mesmo desenho: SOMA o razão, DECIDE,
 * GRAVA. Sob READ COMMITTED (o default do Postgres), duas transações concorrentes
 * leem o razão no MESMO estado — cada uma enxerga o que estava commitado quando ELA
 * começou —, as duas veem saldo, e as DUAS gravam. Nenhum guard errou; o saldo
 * estourou. Já aconteceu com a ficha (6fa5d4e), com o contrato (e0e7e9f) e com a
 * dívida (8d71e2b). O lock faz a segunda transação ESPERAR — e só então somar, já
 * enxergando a primeira.
 *
 * ⚠️ O LOCK TEM DE VIR ANTES DA SOMA. Travar depois de somar é travar um número que
 * já está velho.
 *
 * ═══ ⚠️ POR QUE ADVISORY LOCK, E NÃO `SELECT ... FOR UPDATE` ═══
 * Era `FOR UPDATE` até o papel de runtime existir (ENT01). O Postgres exige privilégio
 * de **UPDATE** para travar uma linha — em TODOS os modos: `FOR UPDATE`, `FOR SHARE` e
 * `FOR KEY SHARE` recusam igual. Medido contra o papel restrito:
 *
 *     SELECT id FROM "Liquidacao" LIMIT 1 FOR SHARE;  -> ERROR: permission denied
 *     SELECT pg_advisory_xact_lock(42, 7);            -> ok
 *
 * E a aplicação NÃO PODE ter UPDATE nestas tabelas: `Empenho`, `Liquidacao`, `Contrato`
 * e `InscricaoRestosAPagar` são append-only, e o ENT00 mediu o preço de o append-only
 * existir só no domínio. A saída não é afrouxar o grant — é usar a primitiva certa.
 *
 * **E ela é a primitiva mais honesta.** `FOR UPDATE` diz ao banco "vou mudar esta linha",
 * e aqui ninguém vai: o que se quer é EXCLUSÃO MÚTUA sobre um id enquanto se soma o
 * razão. `pg_advisory_xact_lock` diz exatamente isso, e nada além. Ela também trava um id
 * cuja linha ainda NÃO EXISTE — o `FOR UPDATE` não travava nada nesse caso, e passava
 * batido.
 *
 * ⚠️ O QUE MUDA, E O QUE NÃO MUDA. O trinco continua morrendo no commit/rollback (é
 * `_xact_`), o Postgres continua detectando deadlock entre eles, e a ordem de aquisição
 * continua sendo a deste arquivo. O que muda: o trinco não é mais oponível a quem NÃO
 * chama `travar()`. Aqui isso não custa nada — a única escrita concorrente possível é a
 * do próprio caso de uso, e não há um único `FOR UPDATE` avulso no repositório (grep:
 * este arquivo era o único sítio de SQL).
 *
 * ⚠️ COLISÃO DE HASH: `hashtext` devolve int4, e dois ids DIFERENTES do MESMO recurso
 * podem cair no mesmo trinco. O efeito é serializar duas operações que poderiam ter
 * corrido juntas — perda de vazão, nunca de correção. O caminho oposto (dois ids que
 * DEVERIAM colidir e não colidem) é o que quebraria, e ele não existe: o hash é função
 * do id.
 *
 * ═══ POR QUE ISTO É UM PACOTE, E NÃO UMA FUNÇÃO NO M05 ═══
 * O M08 (restos a pagar) também decide sobre o saldo de uma LIQUIDAÇÃO — e o M05 já
 * importa o M08 (guards de exercício). Um `m08 → m05` fecharia um CICLO. O lock é
 * uma primitiva de banco, não regra de módulo nenhum: ele mora abaixo de todos.
 *
 * ═══ A ORDEM, E A RAZÃO DE ELA SER CHECADA EM TEMPO DE EXECUÇÃO ═══
 * Duas transações que travam os MESMOS recursos em ordens DIFERENTES se abraçam e
 * morrem (deadlock). Um comentário dizendo "trave nesta ordem" é uma esperança; o
 * `ORDEM_DOS_LOCKS` abaixo é uma REGRA — e a inversão estoura na cara de quem a
 * escrever, no primeiro teste que passar por ali, e não em produção às 3h da manhã
 * com o TCE esperando o balanço.
 */

/** O tipo mínimo de client transacional: só precisamos rodar SQL cru. */
export interface TxComRaw {
  $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
}

/**
 * Os recursos travávEIS, e a ORDEM em que eles TÊM de ser adquiridos.
 *
 * O número é o POSTO: quem já travou um posto N não pode travar um posto < N na
 * mesma transação. O `Record` exaustivo força quem criar um recurso novo a dizer
 * ONDE ele entra na fila — e é justamente essa decisão que ninguém toma quando a
 * ordem é só um comentário.
 *
 * A ordem sai do CAMINHO NATURAL da despesa: a dotação vem antes do contrato, que
 * vem antes da liquidação, que vem antes do resto a pagar, que vem antes da baixa da
 * dívida. Nenhum caminho do repositório precisa subir a fila de volta.
 */
export const ORDEM_DOS_LOCKS = {
  /**
   * M08 — O EXERCÍCIO, e ele é o PRIMEIRO POSTO porque a VIRADA é a operação mais
   * larga que existe: ela decide sobre o razão INTEIRO de um ano.
   *
   * ⚠️ A CORRIDA É REAL, e ela é a mesma de sempre — SOMA, DECIDE, GRAVA. Tanto a
   * `apurarResultadoDoExercicio` (que soma as classes 3/4 e as zera) quanto a
   * `encerrarControlesOrcamentarios` (que soma as 5/6 e as enterra) leem o saldo,
   * decidem quanto lançar e gravam. Sob READ COMMITTED, duas chamadas concorrentes
   * para o MESMO exercício leem o razão no mesmo estado, as duas veem saldo, e as
   * DUAS gravam — e o saldo não fica zerado: fica INVERTIDO (a dotação zerada duas
   * vezes vira crédito de 100.000 do nada).
   *
   * ⚠️ E A IDEMPOTÊNCIA DERIVADA NÃO SALVA DISSO. Ela é lida do SALDO ("a segunda
   * chamada não acha o que encerrar") — mas isso é sequencial, e a segunda chamada
   * CONCORRENTE ainda enxerga o saldo velho. É exatamente a lição da ficha (6fa5d4e),
   * do contrato (e0e7e9f) e da dívida (8d71e2b): nenhum guard errou; o saldo estourou.
   *
   * Ele vem antes de TUDO: nenhum caminho do repositório trava uma ficha (ou uma
   * liquidação, ou uma inscrição) e SÓ ENTÃO decide sobre o exercício inteiro.
   */
  Exercicio: 1,
  FichaOrcamentaria: 2,
  /**
   * M02 — A COTA DO CMD (TR 4.43). Vem LOGO DEPOIS da ficha, e o motivo é uma corrida que o
   * `travarFichas` NÃO cobre: dois empenhos de fichas DIFERENTES da MESMA fonte travam fichas
   * diferentes e nunca se cruzam — cada um lê o consumido da fonte no mês no mesmo estado, e os
   * DOIS passam, estourando a cota. É a mesma lição da ficha (6fa5d4e) e do contrato (e0e7e9f),
   * num grão novo (fonte × mês). O empenho trava a ficha (2) e SÓ ENTÃO a cota (3) — nenhum
   * caminho sobe a fila de volta.
   */
  CotaCmd: 3,
  /**
   * M03 — a disponibilidade de recurso novo. Vem LOGO DEPOIS da ficha porque é isso
   * que o decreto faz: trava as fichas que vai suplementar e só então decide se a
   * fonte aguenta. `travarFichas` NÃO cobre esta corrida — dois decretos podem
   * suplementar fichas DIFERENTES da mesma fonte e nunca se cruzar, cada um lendo
   * `usado` no mesmo estado e os dois passando.
   */
  DisponibilidadeRecursoNovo: 4,
  Contrato: 5,
  Liquidacao: 6,
  InscricaoRestosAPagar: 7,
  DividaConsolidada: 8,
  /**
   * M04 — O RECONHECIMENTO (TR 5.87). Vem ANTES da dívida ativa porque o caminho natural é
   * reconhecer → arrecadar/inscrever: a arrecadação vinculada e a RECLASSIFICAÇÃO em dívida
   * ativa decidem `Σ baixas <= saldo reconhecido` (soma-decide-grava), e a reclassificação
   * trava o reconhecimento e SÓ ENTÃO move o crédito para a dívida ativa. Nenhum caminho sobe
   * a fila de volta (nada trava a dívida ativa e depois decide sobre o reconhecimento).
   */
  ReceitaReconhecida: 9,
  DividaAtiva: 10,
  /** M10 — o almoxarifado. A ENTRADA decide sobre a LIQUIDAÇÃO primeiro. */
  ClasseDeMaterial: 11,
  /** M10 — as provisões. Ninguém as trava antes de nada. */
  ProvisaoMatematica: 12,
  /**
   * M21 — A SEQUÊNCIA DO PROTOCOLO (ENT02). Último posto: a abertura de processo não
   * trava mais nada depois dele, e nada trava um processo antes de decidir sobre a
   * ficha, o contrato ou a liquidação — protocolo e execução da despesa não se cruzam.
   *
   * ⚠️ A CORRIDA AQUI NÃO É DE SALDO, É DE NÚMERO — e ela é a mesma. Duas aberturas
   * concorrentes no mesmo exercício leem `MAX(numero)` no MESMO estado, as duas
   * calculam o mesmo próximo, e as duas gravam. O `@@unique([exercicioId, numero])`
   * transformaria isso numa violação de constraint — o segundo usuário veria um erro
   * de banco depois de preencher o formulário inteiro, em vez de receber o número 2.
   *
   * O trinco é sobre o EXERCÍCIO (a fila é por exercício), não sobre o processo: o
   * processo ainda não existe quando se decide o número dele.
   */
  SequenciaDeProtocolo: 13,
  /**
   * M23 — A SEQUÊNCIA DO COMUNICADO (ENT02). Mesma corrida do protocolo, num grão
   * diferente: a numeração é por (exercício, tipo, setor remetente), então o id
   * travado é essa TRÍPLICE, não o exercício sozinho.
   *
   * ⚠️ TRAVAR O EXERCÍCIO INTEIRO AQUI SERIA PIOR QUE O BUG. Todo memorando de todo
   * setor passaria pela mesma fila, e a Educação esperaria a Saúde para numerar um
   * documento que não disputa numeração nenhuma com ela.
   */
  SequenciaDeComunicado: 14,
  /**
   * M27 — A SEQUÊNCIA DO CHAMADO DE SUPORTE (ENT02). Único no produto inteiro, e não
   * por entidade: quem atende olha uma fila só, e dois chamados "42" de entidades
   * diferentes na mesma tela é o começo de uma resposta enviada ao cliente errado.
   *
   * ⚠️ A FILA É UMA SÓ, ENTÃO O TRINCO É UM SÓ. O id travado é a constante abaixo —
   * não há eixo por onde repartir a fila sem repartir a numeração junto.
   */
  SequenciaDeChamado: 15,
  /**
   * M09 — A SEQUÊNCIA DO LOTE DE PAGAMENTO (ENT03). Último posto, e ele não sobe a fila:
   * compor um lote não decide sobre ficha, contrato nem liquidação — ele AGRUPA ordens que
   * já foram autorizadas, e a autorização de cada uma já passou por aqueles postos.
   *
   * ⚠️ A CORRIDA É DE NÚMERO, como no protocolo e no comunicado. Duas criações concorrentes
   * no mesmo exercício leem `MAX(numero)` no MESMO estado, calculam o mesmo próximo, e as
   * duas gravam — o `@@unique([exercicioId, numero])` transformaria isso numa violação de
   * constraint na cara do segundo operador, em vez de lhe dar o número 2.
   *
   * O trinco é sobre o EXERCÍCIO (a fila é por exercício), não sobre o lote: o lote ainda
   * não existe quando se decide o número dele.
   */
  SequenciaDeLoteDePagamento: 16,
  /**
   * M09 — A CONTA BANCÁRIA (ENT03a, TR 5.62). Último posto, e ele não sobe a fila.
   *
   * ⚠️ A CORRIDA É SOMA-DECIDE-GRAVA, a mesma da ficha (6fa5d4e) e do contrato
   * (e0e7e9f), num grão novo. O saldo da conta é DERIVADO dos fatos que a moveram —
   * não há linha de saldo para travar com `SELECT ... FOR UPDATE`, e é isso que o
   * mantém honesto. Sob READ COMMITTED, dois saques de 600 numa conta com 1.000 leem
   * ambos "há saldo", os dois gravam, e a conta fecha o dia com −200.
   *
   * Por que o ÚLTIMO posto: quem mexe na conta bancária já autorizou tudo o que
   * precisava antes. O pagamento trava a liquidação (6) e o resto a pagar (7) e só
   * então toca o caixa; nenhum caminho trava a conta e depois decide sobre uma ficha.
   */
  ContaBancaria: 17,
  /**
   * ⚠️ ENT03b — OS TRÊS CADASTROS COM TETO PRÓPRIO. Postos 18, 19 e 20, e eles vêm DEPOIS
   * da conta bancária porque nenhum deles é tocado no caminho do pagamento.
   *
   * A corrida é a mesma de sempre — SOMA, DECIDE, GRAVA — num grão novo cada:
   *
   *   · `Convenio`: duas liberações concorrentes da última parcela leem o mesmo saldo a
   *     liberar, as duas passam, e o ente repassa mais do que o termo autoriza. O saldo é
   *     DERIVADO dos movimentos — não há linha de saldo para travar, e é isso que o mantém
   *     honesto;
   *   · `Precatorio`: dois pagamentos concorrentes leem o mesmo passivo e a MESMA posição na
   *     fila constitucional. A fila é a parte grave: as duas transações veem "sou o próximo",
   *     e as duas pagam — furando a ordem do art. 100 sem que nenhum guard tenha errado;
   *   · `ConsorcioPublico`: dois repasses concorrentes conferem a Σ do exercício contra o
   *     mesmo teto de rateio, os dois passam, e o ente repassa acima do que o art. 8º da Lei
   *     11.107 permite.
   *
   * ⚠️ A ORDEM ENTRE OS TRÊS É ARBITRÁRIA E ISSO NÃO IMPORTA — nenhum caminho do repositório
   * trava dois deles na mesma transação. O que importa é que sejam TODOS depois de 17: um
   * pagamento de precatório trava a liquidação (6) e a conta (17) antes de chegar aqui.
   */
  Convenio: 18,
  Precatorio: 19,
  ConsorcioPublico: 20,

  /**
   * ENT05 — A POSIÇÃO FÍSICA DE ESTOQUE (material × depósito). ÚLTIMO POSTO, e ele não
   * sobe a fila.
   *
   * ⚠️ A CORRIDA É A DE SEMPRE — SOMA, DECIDE, GRAVA. Duas saídas concorrentes do mesmo
   * material no mesmo depósito leem a MESMA posição, as duas veem quantidade suficiente,
   * e as duas gravam: o estoque físico fica NEGATIVO. Nenhum guard errou; a posição
   * estourou. É a lição da ficha (6fa5d4e), do contrato (e0e7e9f) e da dívida (8d71e2b),
   * num grão novo.
   *
   * ⚠️ E ELE VEM DEPOIS DA `ClasseDeMaterial` (posto 11) DE PROPÓSITO: a saída física
   * compõe com o lançamento contábil, que trava a classe. Travar a posição ANTES faria a
   * chamada seguinte inverter a ordem — e o guard de ordem estouraria numa baixa de
   * cinco caixas de luva.
   *
   * A chave é `materialId:depositoId`: travar o material inteiro serializaria depósitos
   * que não disputam nada entre si.
   */
  PosicaoFisicaDeEstoque: 21,
} as const;

export type RecursoTravavel = keyof typeof ORDEM_DOS_LOCKS;

/**
 * O POSTO MAIS ALTO já travado por cada transação.
 *
 * `WeakMap` porque a chave é o próprio client transacional: quando a transação
 * morre, a entrada some sozinha. Nenhum estado global, nenhuma limpeza.
 */
const postoAtingido = new WeakMap<object, number>();

/**
 * Trava as linhas indicadas, na ordem certa — e RECUSA a inversão.
 *
 * Os ids são ORDENADOS antes de travar: duas transações que precisam das mesmas
 * duas fichas em ordens diferentes deadlockariam entre si (o M03 toca várias fichas
 * num decreto só). Dentro do mesmo posto, a ordem é a do id.
 */
export async function travar(
  tx: TxComRaw,
  recurso: RecursoTravavel,
  ids: readonly string[]
): Promise<void> {
  if (ids.length === 0) return;

  const posto = ORDEM_DOS_LOCKS[recurso];
  const jaAtingido = postoAtingido.get(tx as object) ?? 0;

  if (posto < jaAtingido) {
    const antes = (Object.keys(ORDEM_DOS_LOCKS) as RecursoTravavel[]).find(
      (r) => ORDEM_DOS_LOCKS[r] === jaAtingido
    );
    throw new Error(
      `INVERSÃO NA ORDEM DE LOCK: esta transação já travou ${antes} (posto ` +
        `${jaAtingido}) e agora tenta travar ${recurso} (posto ${posto}). Duas ` +
        `transações que adquirem os mesmos recursos em ordens diferentes se abraçam ` +
        `e morrem (deadlock) — e o deadlock não aparece em teste serial: ele aparece ` +
        `em produção, sob carga. A ordem é ` +
        `${Object.keys(ORDEM_DOS_LOCKS).join(" → ")}. Trave ${recurso} ANTES de ` +
        `${antes}.`
    );
  }
  postoAtingido.set(tx as object, posto);

  // A CHAVE DO LOCK: (posto do recurso, hash do id). O posto é único por recurso —
  // ele já é a fila de aquisição —, então ele serve de espaço de nomes: uma ficha e
  // uma liquidação de mesmo id não disputam o mesmo trinco.
  //
  // O id vai PARAMETRIZADO; o posto vem do Record, nunca da entrada do usuário.
  for (const id of [...new Set(ids)].sort()) {
    // O `1 AS travado` embrulha a chamada porque `pg_advisory_xact_lock` devolve
    // `void`, e o driver do Prisma não desserializa esse tipo. A subconsulta é
    // avaliada normalmente — o trinco é adquirido —, e o que sobe é um int.
    await tx.$queryRawUnsafe(
      "SELECT 1 AS travado FROM (SELECT pg_advisory_xact_lock($1::int4, hashtext($2)::int4)) AS trinco",
      posto,
      id
    );
  }
}
