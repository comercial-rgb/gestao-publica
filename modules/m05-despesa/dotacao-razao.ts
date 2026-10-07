import { toMoney } from "../../packages/contracts/index.js";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import type { TipoMovimentoDotacao } from "./dominio.js";
// ⚠️ O TIPO VEM DO SCHEMA, NÃO DO M03. O M03 depende do M05 (é ele que chama
// `registrarMovimentoDotacao`); importar o tipo de lá fecharia o ciclo. O enum do Prisma é
// a fonte única — redigitar a união aqui criaria a segunda verdade sobre quais tipos existem.
import type { AberturaDoCredito, OrigemRecurso, TipoCredito } from "../../prisma/generated/client/enums.js";
// ⚠️ O EIXO DA DOTAÇÃO ADICIONAL (V11 V8.9) — a decisão do ente sobre QUAL dos dois ramos irmãos
// do plano recebe o crédito adicional. Mora no M05, como o roteiro.
import { eixoVigente, roteiroPorFonteVigente } from "./servico-dotacao-por-fonte.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";

/**
 * O MOVIMENTO DE DOTAÇÃO E A SUA PERNA NO RAZÃO — UM FATO, UMA TRANSAÇÃO.
 *
 * ═══ O FURO QUE ISTO CURA (nomeado em 46dfd5d) ═══
 * Até aqui o razão só conhecia DUAS pernas da dotação: o EMPENHO (D crédito disponível /
 * C crédito empenhado) e o estorno dele. A **LOA**, os **créditos adicionais** e as
 * **reservas** viviam só no `MovimentoDotacao` — nunca tocaram o razão.
 *
 * Consequência, que a MSC expôs ao ser calculada à mão: o CRÉDITO DISPONÍVEL era
 * **debitado** pelo empenho e **nunca creditado** pela dotação. Uma conta CREDORA com
 * saldo DEVEDOR, permanente. O subsistema orçamentário do razão simplesmente NÃO
 * refletia o orçamento — e é exatamente ele que o SICONFI espera povoado.
 *
 * O balancete FECHAVA (todo lançamento é balanceado, um a um), e foi por isso que
 * nenhuma amarração existente pegou. Só uma leitura que compara o RAZÃO com os
 * MOVIMENTOS enxerga um buraco desses — e ela nasce neste bloco (`conferirDotacaoContraRazao`).
 *
 * ═══ FATO PERMUTATIVO DE CONTROLE: as duas pernas são indivisíveis ═══
 * Mesma lição da retenção no `pagar()` (M07) e da operação composta do M04↔M10: quem é
 * dono do fato grava as DUAS pernas, na MESMA transação. Ou as duas, ou nenhuma.
 */

/** O client OU uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ RECORD EXAUSTIVO — quem lança PELO ROTEIRO desta tabela, e quem NÃO.
 *
 * Um tipo novo de movimento de dotação **não compila** até alguém dizer se ele tem perna
 * no razão. Sem isto, o valor novo entraria na ficha e sumiria do razão em silêncio — que
 * é *exatamente* como o furo de 46dfd5d nasceu.
 *
 * O EMPENHO e o EMPENHO_ANULADO respondem `false`, e isso NÃO é "não lançam": eles JÁ
 * lançam, pelo roteiro que o CHAMADOR passa ao `empenhar()`. Um roteiro paralelo aqui os
 * lançaria DUAS VEZES — é a lição da ENTRADA do almoxarifado, que não tem roteiro próprio
 * justamente porque a liquidação já debitou o estoque.
 */
export const LANCA_PELO_ROTEIRO_ORCAMENTARIO: Record<TipoMovimentoDotacao, boolean> = {
  DOTACAO_INICIAL: true,
  CREDITO_ADICIONAL: true,
  ANULACAO_CREDITO: true,
  RESERVA: true,
  RESERVA_LIBERADA: true,
  /** JÁ lançado pelo `empenhar()` — o roteiro vem do chamador. */
  EMPENHO: false,
  /** JÁ lançado pelo estorno do empenho. */
  EMPENHO_ANULADO: false,
  /** V21 — a realocação lança pelo roteiro do seu tipo (5.2.2.1.9.02 contra o crédito disponível). */
  REALOCACAO_ACRESCIMO: true,
  REALOCACAO_REDUCAO: true,
  /** V36 — o bloqueio da prévia lança pelo roteiro próprio, parametrizado pelo ente (fail-closed sem ele). */
  BLOQUEIO_DE_PREVIA: true,
  BLOQUEIO_DE_PREVIA_LIBERADO: true,
};

export interface MovimentoDotacaoParams {
  readonly fichaId: string;
  readonly tipo: TipoMovimentoDotacao;
  /** SEMPRE positivo — quem dá o sinal é o tipo (`SINAIS`, no domínio). */
  readonly valor: string;
  readonly origemTipo: string;
  readonly origemId?: string | null | undefined;
  readonly estornoDeId?: string | null | undefined;
  readonly criadoPor: string;
  /**
   * A data do FATO — a COMPETÊNCIA. É ela que corta a MSC, o balancete e, desde
   * o ADR de 2026-09-10, o SALDO POR DATA.
   *
   * ⚠️ ATÉ 2026-09-10 ESTE CAMPO CHEGAVA AO RAZÃO E ERA DESCARTADO NO MOVIMENTO.
   * `movimentoDotacao.create` gravava só `criadoEm`, e por isso "qual era o saldo em
   * 30/06?" respondia pelo instante da DIGITAÇÃO. No banco de desenvolvimento havia
   * doze empenhos de 10/04 gravados em 09/09 — cinco meses de erro, em silêncio.
   * Ver `docs/adr/ADR-competencia-no-movimento-de-dotacao.md`.
   *
   * ⚠️ NÃO INFORMAR TEM PREÇO, E O PREÇO FICA NO DADO. Sem `data`, a competência
   * vira o instante da gravação e a linha nasce com `competenciaDerivada = true`.
   * Isso não é um erro — é o caso honesto da reserva, que não tem data própria — mas
   * é rastreável, e é para ser rastreável que a marca existe.
   */
  readonly data?: Date | undefined;
  readonly historico?: string | undefined;
  /**
   * ⚠️ OBRIGATÓRIO QUANDO `tipo === "CREDITO_ADICIONAL"`, E PROIBIDO NOS DEMAIS (V11 V7.1).
   *
   * O PCASP parte `5.2.2.1.2 DOTAÇÃO ADICIONAL POR TIPO DE CREDITO` em suplementar,
   * especial e extraordinário — contas DIFERENTES. Quem sabe o tipo é a LEI que autorizou
   * (`LeiCredito.tipoCredito`); o chamador o carrega até aqui pelo caminho
   * decreto -> lei, o mesmo que o MANAD (M14) percorre para somar por tipo.
   *
   * NÃO vira coluna de `MovimentoDotacao`: o `ItemCredito` já liga 1-1 o movimento ao
   * decreto e o decreto à lei. Gravá-lo aqui seria a segunda verdade sobre o mesmo crédito,
   * e a primeira divergência apareceria num demonstrativo, meses depois.
   */
  readonly tipoCredito?: TipoCredito | undefined;
  /**
   * ⚠️ OBRIGATÓRIA NO ESPECIAL E NO EXTRAORDINÁRIO, E PROIBIDA NO RESTO (V11 V8.8).
   *
   * O PCASP parte esses dois ramos em ABERTOS e REABERTOS — contas DIFERENTES —, e a CF art. 167
   * § 2º é quem diz qual é qual: o crédito autorizado e aberto no exercício, ou o saldo de um
   * crédito dos últimos quatro meses do exercício anterior, reaberto no seguinte. Até a V8.8 o
   * roteiro não tinha esta dimensão e o REABERTO lançava na conta do ABERTO
   * (`ROTEIRO-SEM-DIMENSAO-DA-ABERTURA`).
   *
   * Quem sabe é o par decreto/lei, e o chamador a DERIVA de lá com
   * `exigirAberturaDoDecreto` (M03) — pelo mesmo caminho por onde o tipo de crédito já vem, e
   * pelo mesmo motivo de não virar coluna: duas verdades sobre o mesmo crédito divergem.
   *
   * ⚠️ O SUPLEMENTAR NÃO A TEM, e isso não é omissão: ele reforça dotação que já existe e morre
   * com o exercício. Aplicá-la a ele inventaria uma classificação que a norma não tem.
   */
  readonly abertura?: AberturaDoCredito | undefined;
  /**
   * ⚠️ A ORIGEM DO RECURSO DO DECRETO — usada SÓ quando o ente registra a dotação adicional pelo
   * eixo POR FONTE (V11 V8.9). No eixo POR TIPO, que é o herdado, ela não é consultada.
   *
   * Não é obrigatória na assinatura de propósito: cobrá-la de todo chamador seria cobrar um dado
   * que o eixo em vigor pode nunca ler. Quem a cobra é o EIXO — e a recusa, quando ele é POR
   * FONTE e ela falta, nomeia o que falta e não grava nada.
   */
  readonly origemDoRecurso?: OrigemRecurso | undefined;
}

/** O § 2º alcança só estes dois — e é o que a partição do plano acompanha. */
const EXIGE_ABERTURA = (
  tipo: TipoMovimentoDotacao,
  tipoCredito: TipoCredito | undefined
): boolean =>
  tipo === "CREDITO_ADICIONAL" && (tipoCredito === "ESPECIAL" || tipoCredito === "EXTRAORDINARIO");

/**
 * Grava o movimento E a perna no razão, na MESMA transação.
 *
 * FAIL-CLOSED: tipo que deve lançar e não tem roteiro = a operação INTEIRA cai. Um
 * movimento de dotação sem perna no razão é a volta do furo — e um roteiro que "quase"
 * existe é pior do que nenhum, porque ele grava metade.
 */
export async function registrarMovimentoDotacao(
  tx: Tx,
  p: MovimentoDotacaoParams
): Promise<{ readonly movimentoId: string }> {
  // ⚠️ A COMPETÊNCIA É DECIDIDA UMA VEZ, AQUI, e a MESMA vai para o movimento e para a
  // perna do razão. Calcular `new Date()` duas vezes daria ao movimento e ao lançamento
  // instantes diferentes por alguns milissegundos — e uma consulta cortada exatamente
  // nessa fronteira veria um sem o outro.
  const competencia = p.data ?? new Date();

  // ⚠️ A CONFERÊNCIA VEM ANTES DO PRIMEIRO `create`, e isso não é estilo. Um movimento
  // gravado antes da guarda fica no banco se a transação for parcial em qualquer caminho
  // futuro, e a tentativa seguinte passa a tropeçar num fato que nunca deveria ter nascido.
  // A regra da casa: conferir pré-condição antes de gravar.
  if (p.tipo === "CREDITO_ADICIONAL" && p.tipoCredito === undefined) {
    throw new Error(
      `CRÉDITO ADICIONAL SEM TIPO DE CRÉDITO. O PCASP parte a dotação adicional por tipo ` +
        `(suplementar, especial, extraordinário) em contas diferentes — sem o tipo não há ` +
        `como dizer em qual conta o crédito entra. Quem sabe é a LEI que autorizou o ` +
        `decreto (LeiCredito.tipoCredito). Nada foi gravado.`
    );
  }
  if (p.tipo !== "CREDITO_ADICIONAL" && p.tipoCredito !== undefined) {
    throw new Error(
      `TIPO DE CRÉDITO em movimento ${p.tipo}. O tipo de crédito só classifica o CRÉDITO ` +
        `ADICIONAL; num movimento de outro tipo ele não tem significado contábil e faria ` +
        `a consulta do roteiro procurar um par que o seed nunca semeia. Nada foi gravado.`
    );
  }

  // ⚠️ AS MESMAS DUAS GUARDAS, PARA A ABERTURA — e antes do primeiro `create`, pela mesma razão.
  if (EXIGE_ABERTURA(p.tipo, p.tipoCredito) && p.abertura === undefined) {
    throw new Error(
      `CRÉDITO ${p.tipoCredito} SEM A ABERTURA. O PCASP parte este ramo em ABERTOS e REABERTOS, ` +
        `em contas diferentes, e quem diz qual é qual é a CF art. 167 § 2º — lida do ano do ` +
        `decreto contra o ano e a data de publicação da lei. Sem ela, o crédito reaberto do ` +
        `exercício seguinte entraria na conta do aberto, que é a diferença que o TCE lê. Nada foi gravado.`
    );
  }
  if (!EXIGE_ABERTURA(p.tipo, p.tipoCredito) && p.abertura !== undefined) {
    throw new Error(
      `ABERTURA em movimento ${p.tipo}${p.tipoCredito === undefined ? "" : ` do tipo ${p.tipoCredito}`}. ` +
        `A reabertura do art. 167 § 2º alcança só o crédito ESPECIAL e o EXTRAORDINÁRIO; aqui ela ` +
        `não tem significado contábil e faria a consulta do roteiro procurar uma chave que o ente ` +
        `não pode nem cadastrar (o CHECK do banco a recusa). Nada foi gravado.`
    );
  }

  // ⚠️ PERÍODO ABERTO, CONFERIDO PELA COMPETÊNCIA — e é um guard NOVO, não uma cópia do
  // que já havia. `exigirExercicioDaFichaAberto` olha o exercício da FICHA; este olha o
  // do FATO. Só os dois juntos fecham a antedatação para exercício encerrado.
  await exigirCompetenciaEmExercicioAberto(
    tx,
    competencia,
    `movimento de dotação ${p.tipo}`
  );

  const mov = await tx.movimentoDotacao.create({
    data: {
      fichaId: p.fichaId,
      tipo: p.tipo,
      valor: p.valor,
      origemTipo: p.origemTipo,
      origemId: p.origemId ?? null,
      estornoDeId: p.estornoDeId ?? null,
      criadoPor: p.criadoPor,
      competencia,
      // Quem não informou a data do fato não tem data do fato: a linha diz isso.
      competenciaDerivada: p.data === undefined,
    },
    select: { id: true },
  });

  if (!LANCA_PELO_ROTEIRO_ORCAMENTARIO[p.tipo]) {
    return { movimentoId: mov.id };
  }

  // ⚠️ V6.2 — A DOTAÇÃO INICIAL ZERO NÃO TEM PERNA NO RAZÃO.
  // A ficha criada DURANTE a execução nasce sem crédito: a dotação dela vem por crédito adicional
  // especial (Lei 4.320, arts. 41, II, e 42), com lei e decreto, e é ESSE movimento que lança. O
  // movimento zero existe para preservar a invariante "ficha ⇒ exatamente uma DOTACAO_INICIAL"
  // (`uq_dotacao_inicial_unica`); duas partidas de valor zero não são fato contábil, só ruído no
  // balancete. A exceção é SÓ deste tipo — `test/ficha-pela-tela.test.ts` conta as partidas de um
  // crédito adicional zero para provar que ela não se alargou. ⚠️ MEDIDO: o funil do razão não recusa
  // partida zero (a validação de valor mora nos chamadores); pendência `MOVIMENTO-DE-DOTACAO-ZERO-NO-RAZAO`.
  if (p.tipo === "DOTACAO_INICIAL" && toMoney(p.valor).isZero()) {
    return { movimentoId: mov.id };
  }

  // ⚠️ A CHAVE É O PAR. `tipoCredito` é NULO para todo movimento que não é crédito
  // adicional, e o índice parcial `uq_roteiro_sem_tipo_de_credito` garante que existe no
  // máximo uma linha com NULL por tipo — sem ele, dois NULL seriam distintos no Postgres e
  // esta leitura dependeria de qual linha o planejador devolvesse.
  //
  // ⚠️ E A VIGENTE É A DE MAIOR VERSÃO (V11 V8.4). O roteiro passou a ser versionado quando o ente
  // ganhou onde trocá-lo pela tela: o razão escriturado ontem foi feito contra o roteiro de
  // ontem, e um `UPDATE` apagaria a resposta para "contra que roteiro este lançamento foi feito?".
  // Ler qualquer versão que não a última classificaria o movimento de hoje pela decisão revogada.
  // ═══ ⚠️ O EIXO DECIDE QUAL TABELA RESPONDE (V11 V8.9) ═══
  //
  // `5.2.2.1.2` (por tipo de crédito) e `5.2.2.1.3` (por fonte) são IRMÃS no plano e descrevem o
  // MESMO crédito por eixos diferentes. Lançar nos dois creditaria o crédito disponível DUAS
  // vezes pelo mesmo decreto — o ente poderia empenhar o dobro do autorizado, e o balancete
  // fecharia igual. Por isso o eixo é UM, e quem o escolhe é o ente
  // (`PoliticaDaDotacaoAdicional`). Ausência de política vale POR_TIPO_DE_CREDITO, que é o que
  // todo banco existente já faz.
  const roteiro =
    p.tipo === "CREDITO_ADICIONAL" && (await eixoVigente(tx)) === "POR_FONTE"
      ? await roteiroPorFonte(tx, p)
      : await tx.roteiroOrcamentario.findFirst({
          where: { tipo: p.tipo, tipoCredito: p.tipoCredito ?? null, abertura: p.abertura ?? null },
          orderBy: { versao: "desc" },
          select: {
            contaDebito: { select: { id: true, codigo: true, analitica: true } },
            contaCredito: { select: { id: true, codigo: true, analitica: true } },
          },
        });

  if (roteiro === null && (p.tipo === "BLOQUEIO_DE_PREVIA" || p.tipo === "BLOQUEIO_DE_PREVIA_LIBERADO")) {
    // V36 — a prévia com anulação é a primeira a cair aqui num ente novo (o roteiro do bloqueio não é semeado, porque a
    // conta é escolha da contabilidade): a mensagem diz o que fazer, em português de quem opera a tela.
    throw new Error(
      "A contabilidade ainda não definiu em que conta o bloqueio da prévia de alteração orçamentária entra. " +
        "Defina-a em Contabilidade, nos roteiros orçamentários (bloqueio da prévia e bloqueio da prévia desfeito). Nada foi gravado."
    );
  }
  if (roteiro === null) {
    const qual =
      p.tipoCredito === undefined
        ? p.tipo
        : `${p.tipo} do tipo ${p.tipoCredito}` +
          (p.abertura === undefined ? "" : `, ${p.abertura}`);
    throw new Error(
      `ROTEIRO ORÇAMENTÁRIO NÃO PARAMETRIZADO para ${qual}. O movimento de dotação ` +
        `TEM perna no razão — sem ela, o subsistema orçamentário volta a não refletir o ` +
        `orçamento (o furo de 46dfd5d: o crédito disponível debitado pelo empenho e ` +
        `nunca creditado pela LOA). Cadastre o RoteiroOrcamentario deste tipo. Nada foi ` +
        `gravado.`
    );
  }

  for (const c of [roteiro.contaDebito, roteiro.contaCredito]) {
    if (!c.analitica) {
      throw new Error(
        `Conta SINTÉTICA ${c.codigo} no roteiro orçamentário de ${p.tipo} — conta ` +
          `sintética não recebe partida.`
      );
    }
  }

  // ⚠️ AS DUAS PERNAS, NO SUBSISTEMA ORÇAMENTÁRIO. O motor do M01 valida ΣD == ΣC por
  // subsistema — um lançamento torto não chega ao banco.
  await lancarNoRazao(tx, {
    id: randomUUID(),
    numeroControle: `DOT-${p.tipo}-${mov.id}`,
    // A MESMA competência do movimento — ver acima.
    dataTransacao: competencia,
    historico: p.historico ?? `${p.tipo} na ficha ${p.fichaId}`,
    origemTipo: p.origemTipo,
    origemId: mov.id,
    // NORMAL: a dotação é um fato do exercício, não uma transferência de encerramento.
    natureza: "NORMAL",
    criadoPor: p.criadoPor,
    partidas: [
      {
        contaId: roteiro.contaDebito.id,
        tipo: "DEBITO",
        subsistema: "ORCAMENTARIO",
        valor: p.valor,
        // ⚠️ A FICHA VAI NA PARTIDA. É a dimensão orçamentária dela — e é ela que o
        // resolver do M14 usa para dizer a fonte, a natureza e a funcional desta linha.
        fichaId: p.fichaId,
      },
      {
        contaId: roteiro.contaCredito.id,
        tipo: "CREDITO",
        subsistema: "ORCAMENTARIO",
        valor: p.valor,
        fichaId: p.fichaId,
      },
    ],
  });

  return { movimentoId: mov.id };
}

/**
 * O ROTEIRO DO EIXO POR FONTE — a conta sai da ORIGEM do recurso do decreto (V11 V8.9).
 *
 * ⚠️ RECUSA COM MOTIVO quando a origem não veio. Sob este eixo ela é o discriminador da conta:
 * sem ela não há o que consultar, e um `null` silencioso escolheria uma linha qualquer.
 */
async function roteiroPorFonte(
  tx: Tx,
  p: MovimentoDotacaoParams
): Promise<{
  readonly contaDebito: { readonly id: string; readonly codigo: string; readonly analitica: boolean };
  readonly contaCredito: { readonly id: string; readonly codigo: string; readonly analitica: boolean };
} | null> {
  if (p.origemDoRecurso === undefined) {
    throw new Error(
      `CRÉDITO ADICIONAL SEM A ORIGEM DO RECURSO. O ente registra a dotação adicional pelo eixo ` +
        `POR FONTE, e neste eixo é a ORIGEM do decreto (superávit, excesso, anulação, operação ` +
        `de crédito) que diz em qual conta o crédito entra. Quem sabe é o DECRETO ` +
        `(DecretoCredito.origemRecurso). Nada foi gravado.`
    );
  }
  const r = await tx.roteiroDaDotacaoPorFonte.findFirst({
    where: { origem: p.origemDoRecurso },
    orderBy: { versao: "desc" },
    select: {
      contaDebito: { select: { id: true, codigo: true, analitica: true } },
      contaCredito: { select: { id: true, codigo: true, analitica: true } },
    },
  });
  if (r === null) {
    throw new Error(
      `ROTEIRO POR FONTE NÃO PARAMETRIZADO para a origem ${p.origemDoRecurso}. O ente registra a ` +
        `dotação adicional pelo eixo POR FONTE (5.2.2.1.3), e esta origem ainda não tem contas ` +
        `decididas. Publique-o em /contabilidade/roteiros-orcamentarios. Nada foi gravado.`
    );
  }
  return r;
}

/**
 * ═══ O ESTORNO EXATO DE UM MOVIMENTO DE DOTAÇÃO (V21) ═══
 *
 * Um movimento NOVO, do tipo inverso (é o `SINAIS` do domínio que devolve o saldo), com
 * `estornoDeId` apontando o original — e, no razão, o ESTORNO do lançamento original: as MESMAS
 * contas, lados trocados, `estornoDeId` apontando o lançamento de origem.
 *
 * ⚠️ POR QUE NÃO SE LANÇA PELO ROTEIRO DO TIPO INVERSO. O acréscimo de uma realocação entra em
 * 5.2.2.1.9.02.01 ACRÉSCIMO; a redução, em 5.2.2.1.9.02.09 (-) REDUÇÃO. Desfazer um acréscimo pelo
 * roteiro da redução zeraria o crédito disponível e deixaria AS DUAS analíticas infladas pelo mesmo
 * valor — o pai fecharia, e o balancete por analítica diria que houve um acréscimo e uma redução
 * que nunca existiram. Estorno é o inverso do fato, não outro fato.
 *
 * ⚠️ SÓ PARA OS TIPOS DE `INVERSO_NO_ESTORNO`. Os demais já têm o seu caminho de desfazer (o
 * crédito adicional pelo M03, o empenho pelo M05), e estendê-los para cá é decisão de cada um.
 */
export const INVERSO_NO_ESTORNO: Partial<Record<TipoMovimentoDotacao, TipoMovimentoDotacao>> = {
  REALOCACAO_ACRESCIMO: "REALOCACAO_REDUCAO",
  REALOCACAO_REDUCAO: "REALOCACAO_ACRESCIMO",
};

export async function estornarMovimentoDotacao(
  tx: Tx,
  p: {
    readonly movimentoId: string;
    /** A data do FATO do estorno — a competência do movimento novo e do lançamento. */
    readonly data: Date;
    readonly origemTipo: string;
    readonly origemId: string;
    readonly historico: string;
    readonly criadoPor: string;
  }
): Promise<{ readonly movimentoId: string }> {
  const original = await tx.movimentoDotacao.findUnique({
    where: { id: p.movimentoId },
    select: { id: true, fichaId: true, tipo: true, valor: true, estornoDeId: true },
  });
  if (original === null) {
    throw new Error(`Movimento de dotação ${p.movimentoId} não encontrado. Nada foi gravado.`);
  }
  const inverso = INVERSO_NO_ESTORNO[original.tipo];
  if (inverso === undefined) {
    throw new Error(
      `O movimento ${original.tipo} não se estorna por aqui: ele tem o seu próprio caminho de ` +
        `desfazer. Nada foi gravado.`
    );
  }
  if (original.estornoDeId !== null) {
    throw new Error(`O movimento ${p.movimentoId} já é um estorno — não se estorna um estorno. Nada foi gravado.`);
  }
  const jaEstornado = await tx.movimentoDotacao.findFirst({
    where: { estornoDeId: original.id },
    select: { id: true },
  });
  if (jaEstornado !== null) {
    throw new Error(`O movimento ${p.movimentoId} já foi estornado. Nada foi gravado.`);
  }

  // O lançamento que o movimento original produziu. Sem ele não há o que estornar no razão — e
  // gravar o movimento inverso sem a perna seria reabrir o furo de 46dfd5d pelo lado do estorno.
  const lancamento = await tx.lancamentoContabil.findFirst({
    where: { origemId: original.id, estornoDeId: null },
    select: {
      id: true,
      partidas: { select: { contaId: true, tipo: true, subsistema: true, valor: true, fichaId: true } },
    },
  });
  if (lancamento === null) {
    throw new Error(
      `O movimento ${p.movimentoId} (${original.tipo}) não tem lançamento no razão para estornar. ` +
        `Nada foi gravado.`
    );
  }

  // ⚠️ PERÍODO ABERTO PELA COMPETÊNCIA DO ESTORNO — antes do primeiro `create`.
  await exigirCompetenciaEmExercicioAberto(tx, p.data, `estorno de movimento de dotação ${original.tipo}`);

  const mov = await tx.movimentoDotacao.create({
    data: {
      fichaId: original.fichaId,
      tipo: inverso,
      valor: original.valor,
      origemTipo: p.origemTipo,
      origemId: p.origemId,
      estornoDeId: original.id,
      criadoPor: p.criadoPor,
      competencia: p.data,
      competenciaDerivada: false,
    },
    select: { id: true },
  });

  await lancarNoRazao(tx, {
    id: randomUUID(),
    numeroControle: `DOT-EST-${original.tipo}-${mov.id}`,
    dataTransacao: p.data,
    historico: p.historico,
    origemTipo: p.origemTipo,
    origemId: mov.id,
    natureza: "NORMAL",
    estornoDeId: lancamento.id,
    criadoPor: p.criadoPor,
    partidas: lancamento.partidas.map((x) => ({
      contaId: x.contaId,
      tipo: x.tipo === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const),
      subsistema: x.subsistema,
      valor: x.valor.toFixed(2),
      fichaId: x.fichaId,
    })),
  });

  return { movimentoId: mov.id };
}
