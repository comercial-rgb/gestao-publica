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
 * dívida (8d71e2b). `SELECT ... FOR UPDATE` trava a LINHA e faz a segunda transação
 * ESPERAR — e só então somar, já enxergando a primeira.
 *
 * ⚠️ O LOCK TEM DE VIR ANTES DA SOMA. Travar depois de somar é travar um número que
 * já está velho.
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

  // O nome da tabela vem do Record (nunca da entrada do usuário) — o id vai
  // PARAMETRIZADO.
  for (const id of [...new Set(ids)].sort()) {
    await tx.$queryRawUnsafe(
      `SELECT id FROM "${recurso}" WHERE id = $1 FOR UPDATE`,
      id
    );
  }
}
