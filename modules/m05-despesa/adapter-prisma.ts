import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { travar } from "../../packages/locks/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { LancamentoContabil, Partida } from "../../packages/ledger/index.js";
import {
  criarContaRepositoryPrisma,
  idsUuid,
} from "../m01-core-contabil/adapter-prisma.js";
// M05 -> M06 (nunca o inverso): o pagamento é que tem de respeitar a ordem.
import { criarOrdemCronologicaPrisma } from "../m06-ordem-cronologica/adapter-prisma.js";
// Guard de exercício (M08). Fica num arquivo isolado justamente para não criar
// o ciclo M05 -> M08 -> M05.
import {
  exigirCompetenciaEmExercicioAberto,
  exigirExercicioDaFichaAberto,
} from "../m08-restos-a-pagar/guard-exercicio.js";
import { registrarMovimentoDotacao } from "./dotacao-razao.js";
import { exigirFonteDaFicha } from "./guard-fonte.js";
import { exigirCotaCmd } from "./guard-cmd.js";
import {
  exigirAnulacaoDePagamentoCorrente,
  exigirLiquidacaoCorrente,
  exigirPagamentoCorrente,
} from "../m08-restos-a-pagar/guard-restos.js";
// M07 — a retenção na fonte nasce e morre DENTRO da transação do pagamento.
// Arquivo isolado, como os guards do M08: o M07 não conhece o M05.
import {
  estornarRetencoesDoPagamento,
  registrarRetencoesDoPagamento,
} from "../m07-extraorcamentario/retencao.js";
// A derivação de "é despesa de capital?" é do M10 — reusada, nunca recopiada.
import {
  descricaoDoGrupo,
  ehGrupoDeCapital,
} from "../m10-patrimonial/dominio.js";
// M11 (TR 4.50) — o rol FECHADO dos elementos que SÃO obra. Reusado, nunca recopiado:
// derivar "é obra?" por texto pegaria o elemento 37 ("Locação de Mão-de-Obra").
import { ELEMENTOS_DE_OBRA } from "../m11-licitacoes/obras.js";
// T07 — o guard da ordem de pagamento. Ele NÃO abre transação: roda dentro desta.
import { exigirOrdemAutorizada } from "./ordem-pagamento.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
// M10 — a dívida. A amortização nasce DENTRO do pagamento e morre com ele.
import {
  amortizarNoPagamento,
  estornarAmortizacaoDoPagamento,
} from "../m10-patrimonial/divida.js";
import {
  calcularSaldos,
  type CategoriaOrdemCronologica,
  type CorteTemporal,
  type SaldosFicha,
  type TipoMovimentoDotacao,
  type TotaisPorTipo,
} from "./dominio.js";
import type {
  AnularEmpenhoParams,
  AoAnularLiquidacaoPort,
  ContratoPort,
  DespesaRepositoryPort,
  EmpenharParams,
  EmpenhoResumo,
  LancamentoDaDespesa,
  LiberarReservaParams,
  M05Deps,
  ReservarParams,
} from "./ports.js";

/**
 * ADAPTERS do M05 — a única camada que conhece Prisma.
 *
 * ═══ A REGRA CRÍTICA (INVARIANTE 3) ═══
 * As colunas de saldo da ficha NUNCA são escritas com `saldo = saldo ± valor`.
 * Elas são SEMPRE recalculadas a partir do `SUM(MovimentoDotacao)`, dentro da
 * mesma transação que insere o movimento. Um UPDATE cego perde a corrida entre
 * duas transações concorrentes e o saldo derrapa em silêncio — que é como
 * sistema de orçamento estoura dotação sem ninguém ver.
 *
 * ═══ E A OUTRA (INVARIANTE 5) ═══
 * A checagem "tem saldo?" lê o SUM REAL, não a coluna cache. Confiar no cache
 * para autorizar empenho seria confiar num número que, por definição, pode
 * estar sujo.
 */

/** Qualquer coisa que fale Prisma: o client ou uma transação dele. */
export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * ⚠️ O LOCK PESSIMISTA DA FICHA — leia antes de mexer em qualquer saldo.
 *
 * ═══ O BUG QUE ELE MATA ═══
 * Todo consumo de dotação segue o mesmo desenho: SOMA o razão (`totaisPorTipo`),
 * DECIDE (`exigirSaldo`), GRAVA. Sob READ COMMITTED — o default do Postgres — duas
 * transações concorrentes leem o razão no MESMO estado (cada uma enxerga o que
 * estava commitado quando ELA começou), as duas veem disponível, e as DUAS gravam.
 * Nenhum guard errou; o saldo estourou.
 *
 * A ficha carregava exatamente a corrida que o contrato carregava (fechada em
 * e0e7e9f). Só que a do contrato foi declarada e esta ficou escondida atrás de um
 * `if` que parecia bastar.
 *
 * ═══ O QUE O LOCK FAZ, E O QUE ELE NÃO FAZ ═══
 * `SELECT ... FOR UPDATE` trava a LINHA da ficha até o commit. A segunda transação
 * BLOQUEIA no lock, e só então soma — já enxergando a primeira. O lock protege a
 * LEITURA QUE DECIDE; ele NÃO muda a aritmética (o saldo continua saindo do SUM,
 * nunca do cache) e NÃO muda resultado nenhum em execução serial. É por isso que os
 * 588 testes seguem verdes sem uma expectativa editada.
 *
 * ⚠️ TEM DE VIR ANTES DA SOMA. Travar depois de somar é travar um número velho.
 *
 * ═══ A ORDEM DE AQUISIÇÃO — A ÚNICA, E ELA VALE PARA O REPOSITÓRIO INTEIRO ═══
 *
 *      FICHA(S) → CONTRATO → LIQUIDAÇÃO → INSCRIÇÃO DE RP → DÍVIDA
 *
 * Duas transações que travam os mesmos recursos em ordens DIFERENTES se abraçam e
 * morrem (deadlock). Então a ordem é UMA:
 *   1) as FICHAS, sempre ORDENADAS POR ID (o M03 toca várias num decreto só — sem
 *      a ordenação, dois decretos com as mesmas fichas em ordens diferentes
 *      deadlockariam);
 *   2) o CONTRATO (M11), dentro de `guardsDoContrato`;
 *   3) a LIQUIDAÇÃO (`travarLiquidacoes`) — o `pagar()` decide "pago <= liquidado"
 *      somando dentro da transação, e sem o lock dois pagamentos concorrentes leem
 *      o mesmo já-pago e os dois passam;
 *   4) a INSCRIÇÃO de restos a pagar (M08), que o `pagarRestosAPagar` trava DEPOIS
 *      da liquidação — ele decide sobre as duas;
 *   5) a DÍVIDA (M10), a última, porque é a última a ser tocada no pagamento.
 *
 * Quem tocar dois recursos, trava NESTA ordem. Nenhum caminho do repositório
 * adquire em ordem diversa — e nada deve passar a adquirir.
 */
export async function travarFichas(
  tx: Tx,
  fichaIds: readonly string[]
): Promise<void> {
  await travar(tx, "FichaOrcamentaria", fichaIds);
}

/**
 * O LOCK DA LIQUIDAÇÃO — 3º da ordem.
 *
 * O `pagar()` soma o já-pago (`pagoLiquido`) e decide se o novo pagamento cabe.
 * Sob READ COMMITTED, dois pagamentos concorrentes de 600 contra uma liquidação de
 * 1.000 leem o MESMO já-pago (zero), os dois veem que cabem, e os dois gravam:
 * 1.200 pagos sobre 1.000 liquidados. Nenhum guard errou.
 *
 * Trava a LINHA da liquidação — e é a mesma porta para TODO caminho que decide
 * sobre o saldo dela: `pagar`, `anularLiquidacao` ("já tem pagamento?"),
 * `anularPagamento` e o `pagarRestosAPagar`/`anularPagamentoRestosAPagar` do M08.
 */
export async function travarLiquidacoes(
  tx: Tx,
  liquidacaoIds: readonly string[]
): Promise<void> {
  await travar(tx, "Liquidacao", liquidacaoIds);
}

/**
 * GROUP BY tipo -> total. É o SUM REAL, a fonte da verdade.
 *
 * ⚠️ O CORTE É OBRIGATÓRIO — ver `CorteTemporal` no domínio. Antes de 2026-09-10 esta
 * função somava TUDO e o chamador não tinha como pedir outra coisa; hoje ela exige que
 * o eixo seja declarado, porque somar tudo é uma das três respostas possíveis e não a
 * única.
 */
export async function totaisPorTipo(
  tx: Tx,
  fichaId: string,
  corte: CorteTemporal
): Promise<TotaisPorTipo> {
  // ⚠️ `lte` E NÃO `lt`: "até 30/06" inclui 30/06. Com `lt`, o ato do próprio dia do
  // fechamento ficaria de fora do demonstrativo daquele dia.
  const where =
    corte.eixo === "CORRENTE"
      ? { fichaId }
      : corte.eixo === "COMPETENCIA"
        ? { fichaId, competencia: { lte: corte.ate } }
        : { fichaId, criadoEm: { lte: corte.ate } };

  const linhas = await tx.movimentoDotacao.groupBy({
    by: ["tipo"],
    where,
    _sum: { valor: true },
  });

  const totais: Partial<Record<TipoMovimentoDotacao, Money>> = {};
  for (const l of linhas) {
    totais[l.tipo] = toMoney(l._sum.valor?.toFixed(2) ?? "0.00");
  }
  return totais;
}

/**
 * NO-OP DEFENSIVO, FAIL-CLOSED.
 *
 * Esta função JÁ NÃO CRIA nada. A `DOTACAO_INICIAL` passou a nascer junto com a
 * ficha (adapter do M02, mesma transação). Aqui ela apenas CONFERE, e LANÇA se
 * faltar.
 *
 * Por que virou fail-closed: enquanto criava silenciosamente, ela MASCARAVA
 * fichas nascidas por um caminho errado — a ficha ficava sem dotação, todo
 * relatório mostrava saldo zero, e só na primeira operação de saldo o buraco era
 * tapado. O erro só aparecia no demonstrativo, nunca no código. Agora uma ficha
 * sem dotação estoura na cara de quem tentar mexer nela.
 *
 * PENDÊNCIA: remover a função por completo, depois de confirmar que nenhum
 * caminho cria ficha fora do adapter do M02. Até lá, ela é a rede.
 */
export async function garantirDotacaoInicial(
  tx: Tx,
  fichaId: string,
  _criadoPor: string
): Promise<void> {
  const jaTem = await tx.movimentoDotacao.count({
    where: { fichaId, tipo: "DOTACAO_INICIAL" },
  });
  if (jaTem > 0) return;

  const ficha = await tx.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    select: { id: true },
  });
  if (ficha === null) {
    throw new Error(`Ficha ${fichaId} não encontrada.`);
  }

  throw new Error(
    `Ficha ${fichaId} não tem DOTACAO_INICIAL. Toda ficha deve nascer com a sua ` +
      `(adapter do M02, na mesma transação da criação). Se esta ficha é antiga, ` +
      `rode o backfill: npx tsx prisma/seed/backfill-dotacao-inicial.ts`
  );
}

/**
 * INVARIANTE 3: cache = f(movimentos). Escreve as colunas a partir do SUM —
 * NUNCA incrementando. Chamar SEMPRE dentro da transação, depois do INSERT.
 */
export async function recalcularCache(tx: Tx, fichaId: string): Promise<SaldosFicha> {
  // ⚠️ CORRENTE, e por definição. As quatro colunas de cache da ficha SÃO o saldo de
  // agora — é o que a reconciliação confere contra o SUM. Um cache cortado por
  // competência seria o saldo de uma data guardado como se fosse o de hoje.
  const saldos = calcularSaldos(await totaisPorTipo(tx, fichaId, { eixo: "CORRENTE" }));

  await tx.fichaOrcamentaria.update({
    where: { id: fichaId },
    data: {
      saldoAutorizado: saldos.autorizado.toFixed(2),
      saldoReservado: saldos.reservado.toFixed(2),
      saldoEmpenhado: saldos.empenhado.toFixed(2),
      saldoDisponivel: saldos.disponivel.toFixed(2),
    },
  });

  return saldos;
}

/** INVARIANTE 5: fail-closed de saldo (TR 4.51), contra o SUM REAL. */
/**
 * OS GUARDS DO CONTRATO (M11) — DENTRO DA TRANSAÇÃO DO EMPENHO.
 *
 * Ordem da TR: existe → homologado → vigente → cabe no saldo → herda a categoria →
 * a reserva casa com o processo → a classe de bens (4.49).
 *
 * Devolve a categoria da ordem cronológica que o empenho VAI usar: a informada
 * (sem contrato) ou a HERDADA (com contrato).
 *
 * ⚠️ A LINHA DO CONTRATO É TRAVADA (`FOR UPDATE`) pela implementação do port,
 * ANTES de somar o empenhado. Sem o lock, dois empenhos concorrentes leem o mesmo
 * saldo e os DOIS passam — e o contrato estoura sem que nenhum guard tenha errado.
 */
async function guardsDoContrato(
  tx: Tx,
  contratos: ContratoPort | undefined,
  p: EmpenharParams
): Promise<CategoriaOrdemCronologica> {
  // A reserva pode estar VINCULADA a um processo (TR 4.41) — e isso importa mesmo
  // quando o empenho vem SEM contrato: é justamente esse o caso que a 4.42 barra.
  const processoDaReserva =
    p.reservaId === undefined
      ? null
      : (
          await tx.reservaDotacao.findUnique({
            where: { id: p.reservaId },
            select: { processoId: true },
          })
        )?.processoId ?? null;

  if (p.contratoId === undefined) {
    // ═══ (e) RESERVA VINCULADA EXIGE CONTRATO — TR 4.42 ═══
    if (processoDaReserva !== null) {
      throw new Error(
        `RESERVA VINCULADA A LICITAÇÃO: a reserva ${p.reservaId} está vinculada ao ` +
          `processo ${processoDaReserva}, e a TR 4.42 só a libera "quando houver ` +
          `vinculação com uma licitação e esta informada na emissão da nota de ` +
          `empenho". O empenho ${p.numero} não informou contrato nenhum — informe ` +
          `o contrato daquele processo.`
      );
    }
    // Sem contrato o Zod já garantiu a categoria (não há de quem herdá-la).
    return p.categoriaOrdemCronologica!;
  }

  // FAIL-CLOSED: pediram contrato e o M11 não está ligado. Deixar passar gravaria
  // um `contratoId` que NINGUÉM validou.
  if (contratos === undefined) {
    throw new Error(
      `O empenho ${p.numero} informou o contrato ${p.contratoId}, mas o módulo de ` +
        `contratos (M11) não foi ligado às dependências do M05. Sem ele, vigência ` +
        `e saldo do contrato não seriam checados — e o empenho nasceria com um ` +
        `vínculo que ninguém validou.`
    );
  }

  // ═══ (a) EXISTE, E O PROCESSO DELE ESTÁ HOMOLOGADO ═══
  // (a implementação TRAVA a linha do contrato antes de somar — ver o port)
  const c = await contratos.situacaoParaEmpenho(tx, p.contratoId, p.data);
  if (c === null) {
    throw new Error(`Contrato ${p.contratoId} não existe.`);
  }
  if (!c.processoHomologado) {
    throw new Error(
      `PROCESSO NÃO HOMOLOGADO: o contrato ${c.numeroContrato} pende de ` +
        `homologação do processo ${c.processoId}. Não se empenha contra um ` +
        `contrato cuja licitação ainda não foi homologada.`
    );
  }

  // ═══ (b) VIGENTE NA DATA DO EMPENHO — TR 5.101/5.102 ═══
  if (!c.vigenteNaData) {
    throw new Error(
      `CONTRATO FORA DA VIGÊNCIA: o empenho ${p.numero} é de ` +
        `${p.data.toISOString()}, e o contrato ${c.numeroContrato} vige de ` +
        `${c.vigenciaInicio.toISOString()} a ${c.vigenciaFim.toISOString()} (fim ` +
        `já com as prorrogações). Empenhar fora da vigência é empenhar contra um ` +
        `contrato que não existe naquele dia — prorrogue antes.`
    );
  }

  // ═══ (c) CABE NO SALDO — TR 5.6/5.112 ═══
  if (p.valor.greaterThan(c.saldo)) {
    throw new Error(
      `SALDO DO CONTRATO INSUFICIENTE (${c.numeroContrato}): valor atualizado ` +
        `${c.valorAtualizado.toFixed(2)} − empenhado ` +
        `${c.empenhadoLiquido.toFixed(2)} = saldo ${c.saldo.toFixed(2)}, e o ` +
        `empenho ${p.numero} pede ${p.valor.toFixed(2)}. Faltam ` +
        `${p.valor.minus(c.saldo).toFixed(2)}. Aditive o contrato ou reduza o ` +
        `empenho.`
    );
  }

  // ═══ (d) HERANÇA DA CATEGORIA — nunca sobrescrever calado ═══
  const informada = p.categoriaOrdemCronologica;
  if (informada !== undefined && informada !== c.categoriaOrdemCronologica) {
    throw new Error(
      `CATEGORIA DIVERGENTE DO CONTRATO: o empenho ${p.numero} informou ` +
        `${informada}, mas o contrato ${c.numeroContrato} é ` +
        `${c.categoriaOrdemCronologica}. A fila do art. 141 é POR CATEGORIA — ` +
        `aceitar a do chamador colocaria o pagamento na fila errada, e sobrescrevê-` +
        `la em silêncio esconderia o erro de quem digitou. Corrija o empenho (ou o ` +
        `contrato, se ele é que está errado).`
    );
  }

  // ═══ (e) RESERVA E CONTRATO TÊM DE SER DO MESMO PROCESSO ═══
  if (processoDaReserva !== null && processoDaReserva !== c.processoId) {
    throw new Error(
      `RESERVA DE OUTRA LICITAÇÃO: a reserva ${p.reservaId} está vinculada ao ` +
        `processo ${processoDaReserva}, mas o contrato ${c.numeroContrato} é do ` +
        `processo ${c.processoId}. A reserva foi feita para AQUELA licitação — ` +
        `consumi-la aqui pagaria uma despesa com dinheiro separado para outra.`
    );
  }

  // ═══ (f) O VÍNCULO DE AQUISIÇÃO — TR 4.49 e 5.15 ═══
  await exigirClasseDeBens(tx, p);

  return c.categoriaOrdemCronologica;
}

/**
 * TR 4.48 — EMPENHO DO GRUPO 6 (AMORTIZAÇÃO DA DÍVIDA) TEM DE DIZER QUAL DÍVIDA.
 *
 * A bicondicional é dos DOIS lados: grupo 6 SEM dívida é pagar no escuro (e o
 * demonstrativo da dívida nunca fecha com a despesa); dívida FORA do grupo 6 é um
 * vínculo sem sentido — um empenho de material de expediente não amortiza nada.
 *
 * ⚠️ O grupo 6 é o ÚNICO. Ele é despesa de CAPITAL e NÃO traz bem (a lição do M10:
 * é por isso que ele fica de fora do `ehGrupoDeCapital` da classe de bens). Aqui é o
 * contrário: é o único que exige dívida.
 *
 * Roda SEMPRE — com ou sem contrato. Amortizar dívida não depende de licitação.
 */
const GRUPO_AMORTIZACAO_DIVIDA = "6";

async function exigirVinculoDeDivida(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codNatureza: true, codigoCompleto: true } },
    },
  });
  const grupo = ficha.naturezaDespesa.codNatureza;
  const ehAmortizacao = grupo === GRUPO_AMORTIZACAO_DIVIDA;

  if (ehAmortizacao && p.dividaId === undefined) {
    throw new Error(
      `EMPENHO DE AMORTIZAÇÃO SEM DÍVIDA (TR 4.48): o empenho ${p.numero} é do grupo ` +
        `6 (${descricaoDoGrupo(grupo)}), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto} — ele PAGA uma dívida, e não diz ` +
        `qual. Sem o vínculo, o demonstrativo da dívida consolidada nunca fecha com a ` +
        `despesa executada, e o saldo devedor vira uma opinião. Informe a dívida.`
    );
  }

  if (!ehAmortizacao && p.dividaId !== undefined) {
    throw new Error(
      `VÍNCULO DE DÍVIDA SEM SENTIDO: o empenho ${p.numero} informou a dívida ` +
        `${p.dividaId}, mas é do grupo ${grupo} (${descricaoDoGrupo(grupo)}), não do ` +
        `grupo 6 (Amortização da Dívida). Só se amortiza dívida com despesa de ` +
        `amortização — este empenho pagaria outra coisa e baixaria o saldo devedor.`
    );
  }

  if (p.dividaId !== undefined) {
    const divida = await tx.dividaConsolidada.findUnique({
      where: { id: p.dividaId },
      select: { id: true },
    });
    if (divida === null) {
      throw new Error(`Dívida ${p.dividaId} não existe.`);
    }
  }
}

/**
 * TR 4.49/5.15 — EMPENHO DE CAPITAL COM CONTRATO TEM DE DIZER O QUE COMPRA.
 *
 * A derivação de "é capital?" é a do M10 (`ehGrupoDeCapital`, 2º dígito da natureza)
 * — REUSADA, não recopiada. E o grupo 6 (amortização da dívida) fica de fora
 * de propósito: ele é capital e NÃO traz bem nenhum (a lição do M10 — capital sem
 * bem existe, e exigir classe dele travaria o pagamento da dívida).
 *
 * ⚠️ SÓ EXIGE QUANDO HÁ CONTRATO: o escopo do TR é a cadeia LICITATÓRIA
 * (licitação → contrato → empenho → bem). Uma aquisição fora de contrato (doação
 * incorporada, dação em pagamento) não passa por aqui — está no MODULO.md.
 */
async function exigirClasseDeBens(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codNatureza: true, codigoCompleto: true } },
    },
  });
  const grupo = ficha.naturezaDespesa.codNatureza;

  if (!ehGrupoDeCapital(grupo)) {
    return; // custeio não compra bem; o grupo 6 é capital SEM bem
  }

  if (p.classeDeBensId === undefined) {
    throw new Error(
      `EMPENHO DE CAPITAL SEM CLASSE DE BENS (TR 4.49/5.15): o empenho ${p.numero} ` +
        `é do grupo ${grupo} (${descricaoDoGrupo(grupo)}), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto}, e executa um contrato — mas não ` +
        `diz QUE CLASSE DE BEM vai adquirir. Sem isso, o bem entra no patrimônio ` +
        `sem que ninguém consiga ligá-lo ao contrato que o comprou, e o ` +
        `levantamento por classe (5.15) não fecha com a despesa de capital. ` +
        `Informe a classe de bens.`
    );
  }

  const classe = await tx.classeDeBens.findUnique({
    where: { id: p.classeDeBensId },
    select: { id: true, codigo: true, ativa: true },
  });
  if (classe === null) {
    throw new Error(`Classe de bens ${p.classeDeBensId} não existe.`);
  }
  if (!classe.ativa) {
    throw new Error(
      `Classe de bens ${classe.codigo} está INATIVA — não se empenha aquisição ` +
        `numa classe que o ente desativou.`
    );
  }
}

/**
 * TR 4.50 — EMPENHO DE OBRA TEM DE DIZER QUAL OBRA.
 *
 * O gatilho é o ELEMENTO da despesa (51 — "Obras e Instalações"), pelo Record FECHADO
 * `ELEMENTOS_DE_OBRA` do M11. Ele é fechado porque o rol oficial tem uma armadilha
 * literal: o elemento **37** chama-se "Locação de Mão-de-**Obra**" e não é obra nenhuma.
 * Qualquer derivação por texto o pegaria.
 *
 * ═══ ⚠️ E ELE É **UNIDIRECIONAL** — a diferença deliberada para o 4.48 ═══
 * O guard da dívida é BICONDICIONAL: dívida fora do grupo 6 é vínculo sem sentido, e ele
 * recusa os dois lados. Aqui NÃO:
 *
 *   · elemento 51 SEM obra                -> REJEITA (é o furo que o TR 4.50 fecha);
 *   · obra num empenho de OUTRO elemento  -> **PERMITIDO**.
 *
 * A instalação elétrica de uma escola pode vir, legitimamente, no elemento 39 — e o ente
 * tem todo o direito de rastreá-la na obra. Proibir o vínculo voluntário obrigaria quem
 * quer rastrear a MENTIR na classificação da despesa, que é o oposto do que se quer. Um
 * vínculo a mais não corrompe soma nenhuma; um vínculo a menos deixa a obra invisível
 * para a Receita.
 *
 * Roda SEMPRE — com ou sem contrato. Uma obra por administração direta não tem contrato,
 * e nem por isso deixa de ter matrícula CEI e retenção previdenciária.
 */
async function exigirVinculoDeObra(tx: Tx, p: EmpenharParams): Promise<void> {
  const ficha = await tx.fichaOrcamentaria.findUniqueOrThrow({
    where: { id: p.fichaId },
    select: {
      naturezaDespesa: { select: { codElemento: true, codigoCompleto: true } },
    },
  });
  const elemento = ficha.naturezaDespesa.codElemento;

  if (ELEMENTOS_DE_OBRA[elemento] === true && p.obraId === undefined) {
    throw new Error(
      `EMPENHO DE OBRA SEM OBRA (TR 4.50): o empenho ${p.numero} é do elemento ` +
        `${elemento} ("Obras e Instalações"), natureza ` +
        `${ficha.naturezaDespesa.codigoCompleto} — ele CONSTRÓI alguma coisa, e não diz ` +
        `o quê. Sem o vínculo, a obra não aparece no registro L800 do MANAD (obras e ` +
        `serviços sujeitos à RETENÇÃO PREVIDENCIÁRIA), que é exatamente o que a ` +
        `fiscalização da Receita vem procurar no arquivo — e o ente entrega um MANAD ` +
        `sem a parte que interessa. Informe a obra. ` +
        `(O rol de elementos de obra é FECHADO: {${Object.keys(ELEMENTOS_DE_OBRA).join(", ")}}. ` +
        `O elemento 37, "Locação de Mão-de-Obra", NÃO é obra — é pessoal.)`
    );
  }

  if (p.obraId === undefined) return;

  const obra = await tx.obra.findUnique({
    where: { id: p.obraId },
    select: { id: true, identificador: true, ativa: true },
  });
  if (obra === null) {
    throw new Error(`Obra ${p.obraId} não existe.`);
  }
  if (!obra.ativa) {
    throw new Error(
      `Obra ${obra.identificador} está INATIVA — não se empenha despesa numa obra que ` +
        `o ente encerrou.`
    );
  }
}

function exigirSaldo(disponivel: Money, valor: Money, fichaId: string): void {
  if (valor.greaterThan(disponivel)) {
    throw new Error(
      `Saldo insuficiente na ficha ${fichaId}: disponível ` +
        `${disponivel.toFixed(2)}, solicitado ${valor.toFixed(2)}.`
    );
  }
}

async function criarLancamento(
  tx: Tx,
  l: LancamentoDaDespesa
): Promise<void> {
  const contaIds = [...new Set(l.partidas.map((p) => p.contaId))];
  const contas = await tx.contaPcasp.findMany({
    where: { id: { in: contaIds } },
    select: { id: true, codigo: true, analitica: true },
  });
  if (contas.length !== contaIds.length) {
    throw new Error(`Conta(s) inexistente(s) no PCASP ao persistir ${l.numeroControle}.`);
  }
  const sinteticas = contas.filter((c) => !c.analitica);
  if (sinteticas.length > 0) {
    throw new Error(
      `Conta sintética não recebe partida: ${sinteticas.map((c) => c.codigo).join(", ")}.`
    );
  }

  await lancarNoRazao(tx, {
    id: l.id,
    numeroControle: l.numeroControle,
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    origemTipo: l.origemTipo,
    origemId: l.origemId ?? null,
    estornoDeId: l.estornoDeId ?? null,
    criadoPor: l.criadoPor,
    partidas: l.partidas.map((p) => ({
      contaId: p.contaId,
      tipo: p.tipo,
      subsistema: p.subsistema,
      valor: p.valor.toFixed(2),
      fichaId: p.fichaId ?? null,
    })),
  });
}

/**
 * O estorno espelha o original PERNA POR PERNA — inclusive a ficha de cada uma.
 *
 * ═══ POR QUE NÃO BASTA O `gerarEstorno` ═══
 * O motor puro inverte débito/crédito, mas ele não conhece `fichaId`: quem
 * resolve as contas é o serviço, e ele carimba a MESMA ficha em toda perna. Num
 * pagamento COM RETENÇÃO (M07) isso estaria errado — as pernas de passivo do
 * consignatário não têm dimensão orçamentária (dinheiro de terceiro não é
 * execução da ficha, ele só transita pelo caixa dela), e o estorno delas passaria
 * a ter. A mesma conta de consignação apareceria ora com ficha, ora sem, e
 * qualquer relatório por ficha somaria dinheiro que não é do município.
 *
 * Então a ficha de cada perna do estorno é COPIADA do original. Para um pagamento
 * sem retenção isto é um no-op: todas as pernas já tinham a ficha do empenho.
 */
async function espelharFichaDoOriginal(
  tx: Tx,
  lancamentoOriginalId: string,
  l: LancamentoDaDespesa
): Promise<LancamentoDaDespesa> {
  const partidasOriginais = await tx.partidaContabil.findMany({
    where: { lancamentoId: lancamentoOriginalId },
    select: { contaId: true, fichaId: true },
  });

  const fichaPorConta = new Map<string, string | null>();
  for (const po of partidasOriginais) {
    const visto = fichaPorConta.get(po.contaId);
    // Fail-closed: a mesma conta com fichas diferentes no mesmo lançamento
    // tornaria o espelho ambíguo. Não acontece hoje — e se passar a acontecer,
    // que estoure aqui, e não num relatório seis meses depois.
    if (visto !== undefined && visto !== po.fichaId) {
      throw new Error(
        `Lançamento ${lancamentoOriginalId}: a conta ${po.contaId} tem pernas ` +
          `com fichas DIFERENTES — o estorno não tem como espelhar a dimensão ` +
          `orçamentária delas.`
      );
    }
    fichaPorConta.set(po.contaId, po.fichaId);
  }

  return {
    ...l,
    partidas: l.partidas.map((p) => {
      const ficha = fichaPorConta.get(p.contaId);
      if (ficha === undefined) {
        throw new Error(
          `Estorno do lançamento ${lancamentoOriginalId}: a perna na conta ` +
            `${p.contaId} não existe no original.`
        );
      }
      return {
        contaId: p.contaId,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: p.valor,
        ...(ficha !== null ? { fichaId: ficha } : {}),
      };
    }),
  };
}

/**
 * `contratos` é OPCIONAL: quem não usa o M11 constrói o adapter sem ele, e o
 * caminho sem contrato segue idêntico. Quem informa `contratoId` num empenho e
 * NÃO ligou o port recebe erro — nunca um vínculo não validado.
 */
export function criarDespesaRepositoryPrisma(
  prisma: PrismaClient,
  contratos?: ContratoPort,
  aoAnularLiquidacao?: AoAnularLiquidacaoPort
): DespesaRepositoryPort {
  // M05 -> M06, nunca o inverso. Quem paga é que precisa respeitar a ordem.
  const ordem = criarOrdemCronologicaPrisma(prisma);

  return {
    async reservar(p: ReservarParams): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // 1º LOCK: a ficha. ANTES da soma — ver `travarFichas`.
        await travarFichas(tx, [p.fichaId]);

        // M08 — fail-closed: exercício da ficha tem de estar aberto.
        await exigirExercicioDaFichaAberto(tx, p.fichaId, "reserva de dotação");
        await garantirDotacaoInicial(tx, p.fichaId, p.criadoPor);

        // INVARIANTE 5: saldo do SUM REAL, dentro da transação E sob o lock.
        // ⚠️ CORRENTE: o guard pergunta "há dinheiro disponível AGORA para reservar?".
        // Cortado por competência, ele ignoraria um crédito adicional já concedido e
        // recusaria uma reserva legítima; cortado por registro, o mesmo.
        const saldos = calcularSaldos(await totaisPorTipo(tx, p.fichaId, { eixo: "CORRENTE" }));
        exigirSaldo(saldos.disponivel, p.valor, p.fichaId);

        const reserva = await tx.reservaDotacao.create({
          data: {
            id: p.reservaId,
            fichaId: p.fichaId,
            valor: p.valor.toFixed(2),
            historico: p.historico,
            processoId: p.processoId ?? null,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // A RESERVA CONSOME O DISPONÍVEL — e agora isso aparece no razão (D disponível /
        // C reservado). Sem esta perna, o disponível do razão ignoraria o reservado e a
        // amarração A1-orc não fecharia.
        await registrarMovimentoDotacao(tx, {
          fichaId: p.fichaId,
          tipo: "RESERVA",
          valor: p.valor.toFixed(2),
          origemTipo: "RESERVA",
          origemId: reserva.id,
          criadoPor: p.criadoPor,
          // ⚠️ A ReservaDotacao NÃO TEM coluna de data (só `criadoEm`) — a data do FATO
          // aqui É a da criação. Declarado: quando a reserva ganhar data própria, ela
          // entra aqui e o corte da MSC passa a segui-la.
        });

        // INVARIANTE 3: cache recalculado do SUM.
        await recalcularCache(tx, p.fichaId);

        return reserva.id;
      });
    },

    async empenhar(
      p: EmpenharParams,
      lancamento: LancamentoDaDespesa
    ): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ ORDEM DE AQUISIÇÃO: FICHA primeiro, CONTRATO depois (dentro de
        // `guardsDoContrato`). Inverter aqui é abrir um deadlock — ver `travarFichas`.
        await travarFichas(tx, [p.fichaId]);

        // M08 — fail-closed: não se empenha em exercício encerrado. Despesa de
        // exercício encerrado vira restos a pagar, não empenho novo.
        await exigirExercicioDaFichaAberto(tx, p.fichaId, "empenho");
        // ⚠️ E a data do PRÓPRIO empenho: `p.data` vem de fora. Sem isto, um empenho
        // datado de 20/12 do exercício encerrado entraria com a ficha do ano aberto.
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "empenho");
        await garantirDotacaoInicial(tx, p.fichaId, p.criadoPor);

        // ⚠️ CORRENTE — mesmo motivo do guard da reserva, logo acima.
        const saldos = calcularSaldos(await totaisPorTipo(tx, p.fichaId, { eixo: "CORRENTE" }));

        // Empenho vindo de reserva NÃO precisa de disponível novo: o valor já
        // está retido em `reservado`, e ele será liberado agora. O que se exige
        // é que a reserva cubra o empenho.
        if (p.reservaId !== undefined) {
          const reserva = await tx.reservaDotacao.findUnique({
            where: { id: p.reservaId },
            select: { id: true, fichaId: true, valor: true, empenhos: true, estornos: true },
          });
          if (reserva === null) {
            throw new Error(`Reserva ${p.reservaId} não encontrada.`);
          }
          if (reserva.fichaId !== p.fichaId) {
            throw new Error(
              `Reserva ${p.reservaId} é de outra ficha (${reserva.fichaId}).`
            );
          }
          if (reserva.estornos.length > 0) {
            throw new Error(`Reserva ${p.reservaId} já foi liberada.`);
          }
          if (reserva.empenhos.length > 0) {
            throw new Error(`Reserva ${p.reservaId} já foi empenhada.`);
          }
          const valorReserva = toMoney(reserva.valor.toFixed(2));
          if (p.valor.greaterThan(valorReserva)) {
            throw new Error(
              `Empenho (${p.valor.toFixed(2)}) excede a reserva ` +
                `${p.reservaId} (${valorReserva.toFixed(2)}).`
            );
          }
        } else {
          // Empenho direto: consome disponível.
          exigirSaldo(saldos.disponivel, p.valor, p.fichaId);
        }

        // M02 (TR 4.43) — a LIMITAÇÃO DE EMPENHO pelo CMD. OPT-IN: no-op se o exercício não
        // ativou a limitação (o default, e o que preserva a regressão). A cota é o posto 3 —
        // travada DEPOIS da ficha (posto 2). Ver `exigirCotaCmd`.
        await exigirCotaCmd(tx, { fichaId: p.fichaId, valor: p.valor, data: p.data });

        // M11 — DENTRO da transação: vigência, saldo do contrato (com a linha
        // travada), herança da categoria, reserva×processo e classe de bens.
        const categoria = await guardsDoContrato(tx, contratos, p);

        // M10 (TR 4.48) — o vínculo com a dívida. Roda com ou sem contrato.
        await exigirVinculoDeDivida(tx, p);

        // M11 (TR 4.50) — o vínculo com a OBRA. Roda com ou sem contrato: uma obra por
        // administração direta não tem contrato, e nem por isso deixa de ter CEI.
        await exigirVinculoDeObra(tx, p);

        await criarLancamento(tx, lancamento);

        const empenho = await tx.empenho.create({
          data: {
            id: p.empenhoId,
            fichaId: p.fichaId,
            subelementoId: p.subelementoId ?? null,
            // M11 — a dimensão contrato. A anulação copia este campo (ver abaixo).
            contratoId: p.contratoId ?? null,
            // M11/M10 (TR 4.49) — o que este empenho promete adquirir.
            classeDeBensId: p.classeDeBensId ?? null,
            // M10 (TR 4.48) — a dívida que este empenho amortiza.
            dividaId: p.dividaId ?? null,
            // M11 (TR 4.50) — a obra que este empenho executa. A anulação a COPIA.
            obraId: p.obraId ?? null,
            numero: p.numero,
            tipo: p.tipo,
            valor: p.valor.toFixed(2),
            data: p.data,
            credorCpfCnpj: p.credorCpfCnpj,
            historico: p.historico,
            // HERDADA do contrato quando há contrato (guardsDoContrato).
            categoriaOrdemCronologica: categoria,
            lancamentoId: lancamento.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        await tx.movimentoDotacao.create({
          data: {
            fichaId: p.fichaId,
            tipo: "EMPENHO",
            valor: p.valor.toFixed(2),
            origemTipo: "EMPENHO",
            origemId: empenho.id,
            criadoPor: p.criadoPor,
            // ⚠️ A COMPETÊNCIA É A DATA DO EMPENHO — a MESMA que foi gravada em
            // `Empenho.data` logo acima. Era exatamente esta simetria que faltava:
            // o empenho tinha data do fato e o movimento dele, não.
            competencia: p.data,
          },
        });

        // Veio de reserva: libera o valor empenhado da retenção.
        if (p.reservaId !== undefined) {
          await tx.reservaEmpenho.create({
            data: { reservaId: p.reservaId, empenhoId: empenho.id },
          });
          await registrarMovimentoDotacao(tx, {
            fichaId: p.fichaId,
            tipo: "RESERVA_LIBERADA",
            valor: p.valor.toFixed(2),
            origemTipo: "EMPENHO_DE_RESERVA",
            origemId: empenho.id,
            estornoDeId: p.reservaId,
            criadoPor: p.criadoPor,
            data: p.data,
          });
        }

        await recalcularCache(tx, p.fichaId);
        return empenho.id;
      });
    },

    async anularEmpenho(
      p: AnularEmpenhoParams,
      lancamento: LancamentoDaDespesa
    ): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.empenho.findUnique({
          where: { id: p.empenhoOriginalId },
          select: {
            id: true,
            fichaId: true,
            valor: true,
            categoriaOrdemCronologica: true,
            contratoId: true,
            obraId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Empenho ${p.empenhoOriginalId} não encontrado.`);
        }

        // ⚠️ GUARD NOVO (ADR de 2026-09-10). A anulação DEVOLVE crédito à ficha, e o
        // movimento dela carrega `p.data` como competência. Datada dentro de um
        // exercício encerrado, ela alteraria um saldo cujos demonstrativos já foram
        // publicados. Anular despesa de exercício encerrado é operação de restos a
        // pagar, não de empenho.
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "anulação de empenho");
        // Recheck na tx: a garantia dura é o índice único parcial.
        if (original.estornos.length > 0) {
          throw new Error(`Empenho ${p.empenhoOriginalId} já foi anulado.`);
        }

        // A anulação DEVOLVE saldo — ela não pode estourar nada, e por isso não
        // decide nada sobre o disponível. Mas ela GRAVA e RECALCULA o cache da
        // ficha: sem o lock, uma anulação e um empenho concorrentes recalculariam
        // o cache a partir de SUMs diferentes e o último a escrever venceria — o
        // cache ficaria mentindo até a próxima operação. Trava-se pela MESMA porta,
        // na MESMA ordem.
        await travarFichas(tx, [original.fichaId]);

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.empenho.create({
          data: {
            id: p.empenhoAnulacaoId,
            fichaId: original.fichaId,
            numero: p.numero,
            tipo: "ORDINARIO",
            valor: original.valor,
            data: p.data,
            credorCpfCnpj: "ANULACAO",
            historico: p.historico,
            // a anulação herda a categoria do empenho original
            categoriaOrdemCronologica: original.categoriaOrdemCronologica,
            // ⚠️ E HERDA O CONTRATO (M11). Sem isto, a soma do empenhado por
            // contrato veria o empenho original e NÃO veria a anulação dele — o
            // contrato ficaria eternamente empenhado, e o saldo nunca voltaria.
            contratoId: original.contratoId,
            // ⚠️ A OBRA TAMBÉM É COPIADA — mesma razão do contrato: sem isso, a soma por
            // OBRA veria o empenho e não veria a anulação dele, e a obra ficaria
            // eternamente empenhada no L800.
            obraId: original.obraId,
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        await tx.movimentoDotacao.create({
          data: {
            fichaId: original.fichaId,
            tipo: "EMPENHO_ANULADO",
            valor: original.valor,
            origemTipo: "EMPENHO_ANULADO",
            origemId: anulacao.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
            // A competência é a data da ANULAÇÃO, não a do empenho original: a
            // anulação é um fato NOVO, e é no mês dela que o crédito volta.
            competencia: p.data,
          },
        });

        await recalcularCache(tx, original.fichaId);
        return anulacao.id;
      });
    },


    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE EMPENHO.
     *
     * O guard é o SALDO DE BAIXO: só se anula o que ainda NÃO foi liquidado. Anular
     * abaixo do liquidado deixaria despesa reconhecida sem empenho que a cubra.
     *
     * A ficha recupera o valor POR DERIVAÇÃO: um MovimentoDotacao EMPENHO_ANULADO com
     * o valor PARCIAL. Nenhuma escrita de saldo, e NENHUM tipo novo no enum — o Record
     * de sinais já sabia o que fazer com ele.
     */
    async anularEmpenhoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.empenho.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            fichaId: true,
            numero: true,
            valor: true,
            contratoId: true,
            obraId: true,
            classeDeBensId: true,
            dividaId: true,
            categoriaOrdemCronologica: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Empenho ${p.originalId} não encontrado.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(
            `Empenho ${p.originalId} JÁ É uma anulação — não se anula uma anulação.`
          );
        }
        if (original.estornos.length > 0) {
          throw new Error(
            `Empenho ${original.numero} já foi anulado INTEIRO — não há o que anular ` +
              `parcialmente.`
          );
        }

        // LOCK: a FICHA (posto 1) — decide-se sobre saldo, trava-se antes de somar.
        await travarFichas(tx, [original.fichaId]);
        await exigirExercicioDaFichaAberto(tx, original.fichaId, "anulação parcial");
        await exigirCompetenciaEmExercicioAberto(tx, p.data, "anulação parcial");

        // ═══ O GUARD: o SALDO A LIQUIDAR ═══
        const empenhado = await empenhadoLiquidoDoEmpenho(tx, original.id);
        const liquidado = await liquidadoLiquido(tx, original.id);
        const aLiquidar = toMoney(empenhado.minus(liquidado));

        if (p.valor.greaterThan(aLiquidar)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O SALDO A LIQUIDAR do empenho ` +
              `${original.numero}: empenhado líquido ${empenhado.toFixed(2)} − ` +
              `liquidado ${liquidado.toFixed(2)} = ${aLiquidar.toFixed(2)}, e a ` +
              `anulação pede ${p.valor.toFixed(2)}. Anular abaixo do liquidado ` +
              `deixaria despesa reconhecida sem empenho que a cubra — anule a ` +
              `liquidação primeiro.`
          );
        }

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.empenho.create({
          data: {
            id: p.anulacaoId,
            fichaId: original.fichaId,
            numero: p.numero,
            tipo: "ORDINARIO",
            valor: p.valor.toFixed(2),
            data: p.data,
            credorCpfCnpj: "ANULACAO_PARCIAL",
            historico: p.motivo,
            categoriaOrdemCronologica: original.categoriaOrdemCronologica,
            // ⚠️ COPIA as dimensões: sem isso, a soma por CONTRATO veria o empenho e
            // não veria a redução dele (a lição do bloco 2 do M11).
            contratoId: original.contratoId,
            classeDeBensId: original.classeDeBensId,
            dividaId: original.dividaId,
            // M11 (TR 4.50) — idem: a redução tem de ser visível na soma por obra.
            obraId: original.obraId,
            lancamentoId: lancamento.id,
            // ⚠️ NÃO é estornoDeId: a parcial REDUZ, não NEGA.
            anulacaoParcialDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // A ficha recupera o valor POR DERIVAÇÃO.
        await tx.movimentoDotacao.create({
          data: {
            fichaId: original.fichaId,
            tipo: "EMPENHO_ANULADO",
            valor: p.valor.toFixed(2),
            origemTipo: "ANULACAO_PARCIAL_EMPENHO",
            origemId: anulacao.id,
            criadoPor: p.criadoPor,
            // Data da anulação parcial — o fato novo que reduz.
            competencia: p.data,
          },
        });

        await recalcularCache(tx, original.fichaId);
        return anulacao.id;
      });
    },

    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE LIQUIDAÇÃO.
     *
     * Guard: o saldo NÃO PAGO. E a CASCATA (M10): quem gerou fato a partir desta
     * liquidação (a entrada no almoxarifado) tem de caber no NOVO líquido — senão a
     * anulação INTEIRA é rejeitada, sem estado intermediário.
     */
    async anularLiquidacaoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // LOCK: a LIQUIDAÇÃO (posto 3).
        await travarLiquidacoes(tx, [p.originalId]);

        const original = await tx.liquidacao.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            empenhoId: true,
            numero: true,
            valor: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Liquidação ${p.originalId} não encontrada.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(`Liquidação ${p.originalId} JÁ É uma anulação.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Liquidação ${original.numero} já foi anulada INTEIRA.`);
        }
        await exigirLiquidacaoCorrente(tx, original.empenhoId);

        const liquidado = await liquidoDaLiquidacao(tx, original.id);
        const pago = await pagoLiquido(tx, original.id);
        const naoPago = toMoney(liquidado.minus(pago));

        if (p.valor.greaterThan(naoPago)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O SALDO NÃO PAGO da liquidação ` +
              `${original.numero}: liquidado líquido ${liquidado.toFixed(2)} − pago ` +
              `${pago.toFixed(2)} = ${naoPago.toFixed(2)}, e a anulação pede ` +
              `${p.valor.toFixed(2)}. Anular abaixo do pago deixaria o fornecedor com ` +
              `dinheiro que a despesa já não reconhece — anule o pagamento primeiro.`
          );
        }

        // ═══ A CASCATA (M10) — DENTRO da transação, ANTES de gravar ═══
        // Se as entradas de almoxarifado não couberem no novo líquido, NADA acontece.
        if (aoAnularLiquidacao !== undefined) {
          await aoAnularLiquidacao.aoAnularParcial(
            tx,
            original.id,
            toMoney(liquidado.minus(p.valor))
          );
        }

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.liquidacao.create({
          data: {
            id: p.anulacaoId,
            empenhoId: original.empenhoId,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            responsavelAtesto: "ANULACAO_PARCIAL",
            lancamentoId: lancamento.id,
            anulacaoParcialDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return anulacao.id;
      });
    },

    /**
     * TR 5.35 — ANULAÇÃO PARCIAL DE PAGAMENTO.
     *
     * ⚠️ AS DUAS PORTAS FECHADAS (guards ANTES de tudo):
     *  · pagamento COM RETENÇÃO (M07): o lançamento é COMPOSTO — o caixa levou o
     *    líquido, a obrigação morreu pelo bruto, e o retido virou passivo do
     *    consignatário. Reduzi-lo em parte exigiria decidir de QUEM sai o pedaço
     *    anulado (do fornecedor ou do INSS), e essa resposta não está em lugar nenhum.
     *  · pagamento que AMORTIZOU DÍVIDA (M10): a amortização nasceu junto e teria de
     *    encolher junto — e "encolher uma amortização" é um fato que ninguém definiu.
     * Nos dois casos: anule o pagamento INTEIRO e refaça-o pelo valor certo.
     */
    async anularPagamentoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.pagamento.findUnique({
          where: { id: p.originalId },
          select: {
            id: true,
            liquidacaoId: true,
            numero: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            estornoDeId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
            retencoes: { select: { id: true } },
            movimentosDivida: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Pagamento ${p.originalId} não encontrado.`);
        }
        if (original.estornoDeId !== null || original.anulacaoParcialDeId !== null) {
          throw new Error(`Pagamento ${p.originalId} JÁ É uma anulação.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Pagamento ${original.numero} já foi anulado INTEIRO.`);
        }

        // ═══ PORTA FECHADA 1: RETENÇÃO (M07) ═══
        if (original.retencoes.length > 0) {
          throw new Error(
            `ANULAÇÃO PARCIAL DE PAGAMENTO COM RETENÇÃO É PROIBIDA ` +
              `(${original.numero}): o lançamento é COMPOSTO — o caixa levou o ` +
              `líquido, a obrigação morreu pelo bruto, e o retido virou passivo do ` +
              `consignatário. Reduzi-lo em parte exigiria decidir de QUEM sai o pedaço ` +
              `anulado (do fornecedor ou do consignatário), e essa resposta não está ` +
              `em lugar nenhum. Anule o pagamento INTEIRO e refaça-o pelo valor certo.`
          );
        }

        // ═══ PORTA FECHADA 2: AMORTIZAÇÃO DE DÍVIDA (M10) ═══
        if (original.movimentosDivida.length > 0) {
          throw new Error(
            `ANULAÇÃO PARCIAL DE PAGAMENTO QUE AMORTIZOU DÍVIDA É PROIBIDA ` +
              `(${original.numero}): a amortização nasceu DENTRO deste pagamento e ` +
              `teria de encolher junto — e "encolher uma amortização" é um fato que ` +
              `ninguém definiu. Anule o pagamento INTEIRO (a amortização é estornada ` +
              `junto, na mesma transação) e refaça-o pelo valor certo.`
          );
        }

        // LOCK: a LIQUIDAÇÃO (posto 3) — decide-se sobre o pago dela.
        await travarLiquidacoes(tx, [original.liquidacaoId]);
        await exigirAnulacaoDePagamentoCorrente(tx, original.id);

        const pagoDoFato = await liquidoDoPagamento(tx, original.id);
        if (p.valor.greaterThan(pagoDoFato)) {
          throw new Error(
            `ANULAÇÃO PARCIAL MAIOR QUE O PAGAMENTO ${original.numero}: ele vale ` +
              `${pagoDoFato.toFixed(2)} (já líquido de outras anulações parciais), e a ` +
              `anulação pede ${p.valor.toFixed(2)}.`
          );
        }

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.pagamento.create({
          data: {
            id: p.anulacaoId,
            liquidacaoId: original.liquidacaoId,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            contaBancaria: original.contaBancaria,
            fonteId: original.fonteId,
            lancamentoId: lancamento.id,
            anulacaoParcialDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return anulacao.id;
      });
    },


    /**
     * TR 5.35 — O ESTORNO DE UMA ANULAÇÃO PARCIAL.
     *
     * A parcial era um FATO — e todo fato se estorna. O estorno usa `estornoDeId`
     * (ele NEGA a parcial inteira), e as duas colunas passam a conviver dizendo coisas
     * diferentes: `anulacaoParcialDeId` REDUZ; `estornoDeId` NEGA.
     *
     * O original volta ao valor de antes POR DERIVAÇÃO: a parcial deixa de estar viva,
     * e `packages/estornaveis` para de descontá-la. Nenhuma escrita no original.
     */
    async estornarAnulacaoParcial(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // ⚠️ GUARD NOVO (ADR de 2026-09-10) — o estorno RECONSOME dotação, com `p.data`
        // como competência. Mesma razão da anulação: não se mexe em exercício encerrado.
        await exigirCompetenciaEmExercicioAberto(
          tx,
          p.data,
          "estorno de anulação parcial"
        );

        if (p.nivel === "EMPENHO") {
          const parcial = await tx.empenho.findUnique({
            where: { id: p.anulacaoId },
            select: {
              id: true,
              fichaId: true,
              numero: true,
              valor: true,
              contratoId: true,
              obraId: true,
              classeDeBensId: true,
              dividaId: true,
              categoriaOrdemCronologica: true,
              anulacaoParcialDeId: true,
              estornos: { select: { id: true } },
            },
          });
          if (parcial === null || parcial.anulacaoParcialDeId === null) {
            throw new Error(
              `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de empenho.`
            );
          }
          if (parcial.estornos.length > 0) {
            throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
          }

          // LOCK: a ficha — restaurar o empenho CONSOME dotação de novo.
          await travarFichas(tx, [parcial.fichaId]);
          // ⚠️ CORRENTE: restaurar o empenho consome dotação AGORA.
          const saldos = calcularSaldos(await totaisPorTipo(tx, parcial.fichaId, { eixo: "CORRENTE" }));
          const valor = toMoney(parcial.valor.toFixed(2));
          exigirSaldo(saldos.disponivel, valor, parcial.fichaId);

          await criarLancamento(tx, lancamento);

          const estorno = await tx.empenho.create({
            data: {
              id: p.estornoId,
              fichaId: parcial.fichaId,
              numero: p.numero,
              tipo: "ORDINARIO",
              valor: parcial.valor,
              data: p.data,
              credorCpfCnpj: "ESTORNO_ANULACAO_PARCIAL",
              historico: p.motivo,
              categoriaOrdemCronologica: parcial.categoriaOrdemCronologica,
              contratoId: parcial.contratoId,
              classeDeBensId: parcial.classeDeBensId,
              dividaId: parcial.dividaId,
              lancamentoId: lancamento.id,
              estornoDeId: parcial.id,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });

          // A dotação volta a ser consumida — derivação, nunca escrita de saldo.
          await tx.movimentoDotacao.create({
            data: {
              fichaId: parcial.fichaId,
              tipo: "EMPENHO",
              valor: parcial.valor,
              origemTipo: "ESTORNO_ANULACAO_PARCIAL_EMPENHO",
              origemId: estorno.id,
              estornoDeId: parcial.id,
              criadoPor: p.criadoPor,
              // Data do ESTORNO. A dotação volta a ser consumida no mês em que se
              // estornou, não naquele em que se anulou.
              competencia: p.data,
            },
          });

          await recalcularCache(tx, parcial.fichaId);
          return estorno.id;
        }

        if (p.nivel === "LIQUIDACAO") {
          const parcial = await tx.liquidacao.findUnique({
            where: { id: p.anulacaoId },
            select: {
              id: true,
              empenhoId: true,
              numero: true,
              valor: true,
              anulacaoParcialDeId: true,
              estornos: { select: { id: true } },
            },
          });
          if (parcial === null || parcial.anulacaoParcialDeId === null) {
            throw new Error(
              `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de liquidação.`
            );
          }
          if (parcial.estornos.length > 0) {
            throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
          }
          await travarLiquidacoes(tx, [parcial.anulacaoParcialDeId]);

          await criarLancamento(tx, lancamento);
          const estorno = await tx.liquidacao.create({
            data: {
              id: p.estornoId,
              empenhoId: parcial.empenhoId,
              numero: p.numero,
              valor: parcial.valor,
              data: p.data,
              responsavelAtesto: "ESTORNO_ANULACAO_PARCIAL",
              lancamentoId: lancamento.id,
              estornoDeId: parcial.id,
              criadoPor: p.criadoPor,
            },
            select: { id: true },
          });
          return estorno.id;
        }

        const parcial = await tx.pagamento.findUnique({
          where: { id: p.anulacaoId },
          select: {
            id: true,
            liquidacaoId: true,
            numero: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            anulacaoParcialDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (parcial === null || parcial.anulacaoParcialDeId === null) {
          throw new Error(
            `${p.anulacaoId} não é uma ANULAÇÃO PARCIAL de pagamento.`
          );
        }
        if (parcial.estornos.length > 0) {
          throw new Error(`Anulação parcial ${parcial.numero} já foi estornada.`);
        }
        await travarLiquidacoes(tx, [parcial.liquidacaoId]);

        await criarLancamento(tx, lancamento);
        const estorno = await tx.pagamento.create({
          data: {
            id: p.estornoId,
            liquidacaoId: parcial.liquidacaoId,
            numero: p.numero,
            valor: parcial.valor,
            data: p.data,
            contaBancaria: parcial.contaBancaria,
            fonteId: parcial.fonteId,
            lancamentoId: lancamento.id,
            estornoDeId: parcial.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return estorno.id;
      });
    },

    async liberarReserva(p: LiberarReservaParams): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.reservaDotacao.findUnique({
          where: { id: p.reservaOriginalId },
          select: {
            id: true,
            fichaId: true,
            valor: true,
            estornos: { select: { id: true } },
            empenhos: { select: { empenhoId: true } },
          },
        });
        if (original === null) {
          throw new Error(`Reserva ${p.reservaOriginalId} não encontrada.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Reserva ${p.reservaOriginalId} já foi liberada.`);
        }
        if (original.empenhos.length > 0) {
          throw new Error(
            `Reserva ${p.reservaOriginalId} já foi empenhada — não há o que liberar.`
          );
        }

        // Devolve saldo, mas grava e recalcula o cache — mesmo motivo da anulação.
        await travarFichas(tx, [original.fichaId]);

        const liberacao = await tx.reservaDotacao.create({
          data: {
            id: p.reservaLiberacaoId,
            fichaId: original.fichaId,
            valor: original.valor,
            historico: p.historico,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        await registrarMovimentoDotacao(tx, {
          fichaId: original.fichaId,
          tipo: "RESERVA_LIBERADA",
          valor: original.valor.toFixed(2),
          origemTipo: "RESERVA_LIBERADA",
          origemId: liberacao.id,
          estornoDeId: original.id,
          criadoPor: p.criadoPor,
          // idem: a liberação não tem data própria.
        });

        await recalcularCache(tx, original.fichaId);
        return liberacao.id;
      });
    },

    async saldosReais(
      fichaId: string,
      corte: CorteTemporal
    ): Promise<SaldosFicha> {
      return calcularSaldos(await totaisPorTipo(prisma, fichaId, corte));
    },

    async saldosCache(fichaId: string): Promise<SaldosFicha> {
      const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({
        where: { id: fichaId },
        select: {
          saldoAutorizado: true,
          saldoReservado: true,
          saldoEmpenhado: true,
          saldoDisponivel: true,
        },
      });
      return {
        autorizado: toMoney(f.saldoAutorizado.toFixed(2)),
        reservado: toMoney(f.saldoReservado.toFixed(2)),
        empenhado: toMoney(f.saldoEmpenhado.toFixed(2)),
        disponivel: toMoney(f.saldoDisponivel.toFixed(2)),
      };
    },

    async buscarEmpenho(id: string): Promise<EmpenhoResumo | null> {
      const e = await prisma.empenho.findUnique({
        where: { id },
        select: {
          id: true,
          fichaId: true,
          numero: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
        },
      });
      if (e === null) return null;
      return {
        id: e.id,
        fichaId: e.fichaId,
        numero: e.numero,
        valor: toMoney(e.valor.toFixed(2)),
        lancamentoId: e.lancamentoId,
        estornoDeId: e.estornoDeId,
        estornos: e.estornos.map((x) => x.id),
      };
    },

    async buscarLancamentoDoEmpenho(
      empenhoId: string
    ): Promise<LancamentoContabil> {
      const e = await prisma.empenho.findUniqueOrThrow({
        where: { id: empenhoId },
        select: {
          lancamento: {
            select: {
              id: true,
              numeroControle: true,
              dataTransacao: true,
              historico: true,
              estornoDeId: true,
              estornos: { select: { id: true } },
              partidas: {
                select: {
                  tipo: true,
                  subsistema: true,
                  valor: true,
                  conta: { select: { codigo: true } },
                },
              },
            },
          },
        },
      });

      const l = e.lancamento;
      const partidas: readonly Partida[] = l.partidas.map((p) => ({
        conta: p.conta.codigo,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: toMoney(p.valor.toFixed(2)),
      }));

      return {
        id: l.id,
        numeroControle: l.numeroControle,
        partidas,
        dataTransacao: l.dataTransacao,
        historico: l.historico,
        ...(l.estornoDeId !== null ? { estornoDeId: l.estornoDeId } : {}),
        estornos: l.estornos.map((x) => x.id),
      };
    },

    // ── BLOCO 2 ─────────────────────────────────────────────────────────────

    async liquidar(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const empenho = await tx.empenho.findUnique({
          where: { id: p.empenhoId },
          select: {
            id: true,
            valor: true,
            estornoDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (empenho === null) {
          throw new Error(`Empenho ${p.empenhoId} não encontrado.`);
        }
        if (empenho.estornos.length > 0) {
          throw new Error(`Empenho ${p.empenhoId} está ANULADO — não se liquida.`);
        }
        if (empenho.estornoDeId !== null) {
          throw new Error(`Empenho ${p.empenhoId} É uma anulação — não se liquida.`);
        }

        // M08 — empenho de exercício encerrado saiu do orçamento corrente:
        // ele se liquida por liquidarRestosAPagar(), não aqui.
        await exigirLiquidacaoCorrente(tx, p.empenhoId);

        // INVARIANTE 3: limite lido do SUM REAL, dentro da transação.
        const empenhado = toMoney(empenho.valor.toFixed(2));
        const jaLiquidado = await liquidadoLiquido(tx, p.empenhoId);
        const depois = toMoney(jaLiquidado.plus(p.valor));

        if (depois.greaterThan(empenhado)) {
          throw new Error(
            `Liquidação excede o empenho ${p.empenhoId}: empenhado ` +
              `${empenhado.toFixed(2)}, já liquidado ${jaLiquidado.toFixed(2)}, ` +
              `solicitado ${p.valor.toFixed(2)}.`
          );
        }

        await criarLancamento(tx, lancamento);

        const liq = await tx.liquidacao.create({
          data: {
            id: p.liquidacaoId,
            empenhoId: p.empenhoId,
            numero: p.numero,
            valor: p.valor.toFixed(2),
            data: p.data,
            responsavelAtesto: p.responsavelAtesto,
            notaFiscalChave: p.notaFiscalChave ?? null,
            notaFiscalNum: p.notaFiscalNum ?? null,
            notaFiscalSerie: p.notaFiscalSerie ?? null,
            notaFiscalData: p.notaFiscalData ?? null,
            notaFiscalValor: p.notaFiscalValor?.toFixed(2) ?? null,
            lancamentoId: lancamento.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        return liq.id;
      });
    },

    async pagar(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // 3º LOCK da ordem: a LIQUIDAÇÃO, ANTES de somar o já-pago.
        await travarLiquidacoes(tx, [p.liquidacaoId]);

        const liq = await tx.liquidacao.findUnique({
          where: { id: p.liquidacaoId },
          select: {
            id: true,
            valor: true,
            estornoDeId: true,
            estornos: { select: { id: true } },
          },
        });
        if (liq === null) {
          throw new Error(`Liquidação ${p.liquidacaoId} não encontrada.`);
        }
        if (liq.estornos.length > 0) {
          throw new Error(`Liquidação ${p.liquidacaoId} está ANULADA — não se paga.`);
        }

        // M08 — pagamento de despesa de exercício encerrado é pagamento de
        // RESTOS A PAGAR: ele baixa a inscrição, não a dotação.
        await exigirPagamentoCorrente(tx, p.liquidacaoId);

        // TR 5.23 — a fonte do pagamento TEM de casar com a fonte da conta.
        const conta = await tx.contaBancaria.findUnique({
          where: { codigo: p.contaBancaria },
          select: { id: true, codigo: true, fonteId: true },
        });
        if (conta === null) {
          throw new Error(
            `Conta bancária "${p.contaBancaria}" não cadastrada.`
          );
        }
        if (conta.fonteId !== p.fonteId) {
          throw new Error(
            `TR 5.23 — fonte do pagamento (${p.fonteId}) diverge da fonte da ` +
              `conta bancária "${p.contaBancaria}" (${conta.fonteId}). ` +
              `Pagar recurso de uma fonte com dinheiro de outra é desvio.`
          );
        }

        // ...E O OUTRO ELO DA CORRENTE: a fonte da FICHA que autorizou a despesa. O
        // guard da conta sozinho deixava pagar uma despesa da fonte 500 com dinheiro do
        // FUNDEB — bastava usar a conta do FUNDEB, e os dois "casavam". Ver `guard-fonte`.
        await exigirFonteDaFicha(tx, p.liquidacaoId, p.fonteId);

        // T07 — A ORDEM DE PAGAMENTO, quando houver. DENTRO da transação e antes de
        // gravar: entre conferir e gravar, outra transação poderia consumir a mesma
        // autorização — e a `@unique` em `ordemDePagamentoId` é a rede final, mas uma
        // rede que estoura com erro de constraint em vez de mensagem de negócio.
        //
        // ⚠️ ANTES DO TETO DA LIQUIDAÇÃO, de propósito. Pagar duas vezes contra a MESMA
        // ordem também estoura o teto — mas "excede a liquidação" manda o operador
        // procurar o valor, e o problema era outro: a autorização já tinha sido usada.
        // O guard mais específico fala primeiro.
        if (p.ordemDePagamentoId !== undefined) {
          await exigirOrdemAutorizada(tx, {
            ordemId: p.ordemDePagamentoId,
            liquidacaoId: p.liquidacaoId,
            valor: p.valor,
          });
        }

        // Limite: SUM REAL do já pago, dentro da transação.
        const liquidado = toMoney(liq.valor.toFixed(2));
        const jaPago = await pagoLiquido(tx, p.liquidacaoId);
        const depois = toMoney(jaPago.plus(p.valor));

        if (depois.greaterThan(liquidado)) {
          throw new Error(
            `Pagamento excede a liquidação ${p.liquidacaoId}: liquidado ` +
              `${liquidado.toFixed(2)}, já pago ${jaPago.toFixed(2)}, ` +
              `solicitado ${p.valor.toFixed(2)}.`
          );
        }

        // M06 — ORDEM CRONOLÓGICA (Lei 14.133/2021, art. 141).
        // DENTRO da transação e ANTES de gravar: se a ordem for quebrada sem
        // justificativa, nada existe — nem pagamento, nem lançamento, nem
        // movimento. Se houver justificativa, ela é gravada aqui, atomicamente
        // com o pagamento: um não pode existir sem o outro (§2º).
        await ordem.validarOrdemCronologica(
          tx,
          p.liquidacaoId,
          p.justificativaQuebraOrdem
        );

        // O lançamento COMPOSTO: as pernas do pagamento (caixa = líquido) já vêm
        // com as pernas de passivo das retenções. O motor do ledger validou o
        // conjunto (ΣD == ΣC por subsistema) antes de qualquer I/O.
        await criarLancamento(tx, lancamento);

        const pag = await tx.pagamento.create({
          data: {
            id: p.pagamentoId,
            liquidacaoId: p.liquidacaoId,
            numero: p.numero,
            // BRUTO: a liquidação quita pelo bruto, a fila anda pelo bruto.
            valor: p.valor.toFixed(2),
            data: p.data,
            contaBancaria: p.contaBancaria,
            fonteId: p.fonteId,
            lancamentoId: lancamento.id,
            ...(p.ordemDePagamentoId !== undefined
              ? { ordemDePagamentoId: p.ordemDePagamentoId }
              : {}),
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // M07 — o razão do consignatário, na MESMA transação. Se qualquer
        // retenção falhar (tipo inativo, por exemplo), o pagamento INTEIRO
        // não existe.
        if (p.retencoes !== undefined && p.retencoes.length > 0) {
          await registrarRetencoesDoPagamento(tx, {
            pagamentoId: pag.id,
            lancamentoId: lancamento.id,
            contaBancariaId: conta.id,
            data: p.data,
            historico: lancamento.historico,
            criadoPor: p.criadoPor,
            retencoes: p.retencoes,
          });
        }

        // ═══ M10 (TR 4.48) — A AMORTIZAÇÃO, NA MESMA TRANSAÇÃO ═══
        // Se o empenho aponta para uma dívida, pagar É amortizar. Pelo BRUTO: a
        // retenção não perdoa parte da dívida — ela muda o credor daquele pedaço.
        // Se a dívida não cobrir o valor, o PAGAMENTO INTEIRO aborta: não existe
        // "pagou mas não amortizou". (Mesmo desenho da retenção do M07.)
        const dividaDoEmpenho = await tx.liquidacao.findUniqueOrThrow({
          where: { id: p.liquidacaoId },
          select: { empenho: { select: { dividaId: true } } },
        });
        if (dividaDoEmpenho.empenho.dividaId !== null) {
          await amortizarNoPagamento(tx, {
            dividaId: dividaDoEmpenho.empenho.dividaId,
            pagamentoId: pag.id,
            valorBruto: p.valor,
            data: p.data,
            numeroPagamento: p.numero,
            criadoPor: p.criadoPor,
          });
        }

        return pag.id;
      });
    },

    async anularLiquidacao(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        // MESMA PORTA que o `pagar()`: aqui se decide "esta liquidação já tem
        // pagamento?". Sem o lock, anular e pagar concorrentes passariam os dois —
        // o pagamento ficaria órfão de uma liquidação anulada.
        await travarLiquidacoes(tx, [p.liquidacaoOriginalId]);

        const original = await tx.liquidacao.findUnique({
          where: { id: p.liquidacaoOriginalId },
          select: {
            id: true,
            empenhoId: true,
            valor: true,
            data: true,
            responsavelAtesto: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Liquidação ${p.liquidacaoOriginalId} não encontrada.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Liquidação ${p.liquidacaoOriginalId} já foi anulada.`);
        }

        // Sem ÓRFÃO: não se anula liquidação que já tem pagamento vivo.
        const pago = await pagoLiquido(tx, original.id);
        if (pago.greaterThan(0)) {
          throw new Error(
            `Liquidação ${p.liquidacaoOriginalId} tem ${pago.toFixed(2)} já ` +
              `PAGO — anule o pagamento primeiro. Anular a liquidação sob um ` +
              `pagamento deixaria o pagamento órfão.`
          );
        }

        await criarLancamento(tx, lancamento);

        const anulacao = await tx.liquidacao.create({
          data: {
            id: p.anulacaoId,
            empenhoId: original.empenhoId,
            numero: p.numero,
            valor: original.valor,
            data: p.data,
            responsavelAtesto: original.responsavelAtesto,
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // ═══ A CASCATA (M10) — DENTRO da mesma transação ═══
        // A liquidação deixou de valer: TUDO que ela gerou tem de ser desfeito AGORA.
        // Sem isto, o razão inverte (o estoque volta a zero) e o MOVIMENTO de entrada
        // do almoxarifado fica VIVO — o material eterno na prateleira, e a amarração
        // razão×movimentos acusando sem que ninguém possa consertar. Era o furo
        // declarado em e9cf648.
        if (aoAnularLiquidacao !== undefined) {
          await aoAnularLiquidacao.aoAnularTotal(tx, original.id);
        }

        return anulacao.id;
      });
    },

    async anularPagamento(p, lancamento): Promise<string> {
      return prisma.$transaction(async (tx) => {
        const original = await tx.pagamento.findUnique({
          where: { id: p.pagamentoOriginalId },
          select: {
            id: true,
            liquidacaoId: true,
            valor: true,
            contaBancaria: true,
            fonteId: true,
            lancamentoId: true,
            estornos: { select: { id: true } },
          },
        });
        if (original === null) {
          throw new Error(`Pagamento ${p.pagamentoOriginalId} não encontrado.`);
        }
        if (original.estornos.length > 0) {
          throw new Error(`Pagamento ${p.pagamentoOriginalId} já foi anulado.`);
        }

        // A anulação MEXE no já-pago da liquidação (grava um Pagamento de estorno).
        // Mesma porta, mesma ordem: sem o lock, uma anulação e um pagamento
        // concorrentes decidiriam sobre um saldo que o outro está mudando.
        await travarLiquidacoes(tx, [original.liquidacaoId]);

        // M08 — anular aqui um pagamento de RP deixaria o
        // MovimentoRestosAPagar órfão e o saldo da inscrição errado PARA MENOS.
        await exigirAnulacaoDePagamentoCorrente(tx, p.pagamentoOriginalId);

        await criarLancamento(
          tx,
          await espelharFichaDoOriginal(tx, original.lancamentoId, lancamento)
        );

        const anulacao = await tx.pagamento.create({
          data: {
            id: p.anulacaoId,
            liquidacaoId: original.liquidacaoId,
            numero: p.numero,
            valor: original.valor,
            data: p.data,
            contaBancaria: original.contaBancaria,
            fonteId: original.fonteId,
            lancamentoId: lancamento.id,
            estornoDeId: original.id,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });

        // ═══ M07 — A ANULAÇÃO DESFAZ A RETENÇÃO JUNTO ═══
        // O lançamento de estorno acima JÁ inverteu as pernas de passivo (o
        // `gerarEstorno` inverte todas as pernas do lançamento composto), então a
        // contabilidade fecharia sem isto — e é exatamente aí que o bug se
        // esconderia: o RAZÃO do M07 continuaria dizendo que o ente deve ao
        // consignatário, de um pagamento que não existe mais.
        //
        // Também é aqui que o "repasse já feito" BLOQUEIA a anulação: se o
        // dinheiro do consignatário já saiu, desfazer o ingresso deixaria o saldo
        // dele negativo. Estorne o repasse primeiro.
        await estornarRetencoesDoPagamento(tx, {
          pagamentoOriginalId: original.id,
          lancamentoEstornoId: lancamento.id,
          data: p.data,
          motivo: `Anulação do pagamento (${p.numero}).`,
          criadoPor: p.criadoPor,
        });

        // M10 — SIMETRIA COMPLETA: a amortização nasceu dentro do pagamento e morre
        // com ele, na MESMA transação. Sem isto, anular o pagamento devolveria o
        // dinheiro ao caixa e deixaria a dívida baixada — o ente teria quitado uma
        // parcela que nunca pagou.
        await estornarAmortizacaoDoPagamento(tx, {
          pagamentoOriginalId: original.id,
          data: p.data,
          motivo: `Anulação do pagamento (${p.numero}).`,
          criadoPor: p.criadoPor,
        });

        return anulacao.id;
      });
    },

    async totaisDoEmpenho(empenhoId) {
      const e = await prisma.empenho.findUnique({
        where: { id: empenhoId },
        select: { id: true, valor: true, estornos: { select: { id: true } } },
      });
      if (e === null) return null;

      return {
        empenhado: toMoney(e.valor.toFixed(2)),
        liquidado: await liquidadoLiquido(prisma, empenhoId),
        pago: await pagoDoEmpenho(prisma, empenhoId),
        anulado: e.estornos.length > 0,
      };
    },

    async buscarLiquidacao(id) {
      const l = await prisma.liquidacao.findUnique({
        where: { id },
        select: {
          id: true,
          empenhoId: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
          empenho: { select: { fichaId: true } },
        },
      });
      if (l === null) return null;
      return {
        id: l.id,
        empenhoId: l.empenhoId,
        fichaId: l.empenho.fichaId,
        valor: toMoney(l.valor.toFixed(2)),
        lancamentoId: l.lancamentoId,
        estornoDeId: l.estornoDeId,
        estornos: l.estornos.map((x) => x.id),
      };
    },

    async buscarPagamento(id) {
      const p = await prisma.pagamento.findUnique({
        where: { id },
        select: {
          id: true,
          liquidacaoId: true,
          valor: true,
          lancamentoId: true,
          estornoDeId: true,
          estornos: { select: { id: true } },
          liquidacao: {
            select: { empenhoId: true, empenho: { select: { fichaId: true } } },
          },
        },
      });
      if (p === null) return null;
      return {
        id: p.id,
        liquidacaoId: p.liquidacaoId,
        empenhoId: p.liquidacao.empenhoId,
        fichaId: p.liquidacao.empenho.fichaId,
        valor: toMoney(p.valor.toFixed(2)),
        lancamentoId: p.lancamentoId,
        estornoDeId: p.estornoDeId,
        estornos: p.estornos.map((x) => x.id),
      };
    },

    async buscarLancamentoDaLiquidacao(id) {
      const l = await prisma.liquidacao.findUniqueOrThrow({
        where: { id },
        select: { lancamentoId: true },
      });
      return lancamentoDoDominio(prisma, l.lancamentoId);
    },

    async buscarLancamentoDoPagamento(id) {
      const p = await prisma.pagamento.findUniqueOrThrow({
        where: { id },
        select: { lancamentoId: true },
      });
      return lancamentoDoDominio(prisma, p.lancamentoId);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BLOCO 2 — liquidação e pagamento.
//
// Mesma disciplina: os limites são lidos do SUM REAL, DENTRO da transação.
// `liquidado` e `pago` já saem LÍQUIDOS das anulações (uma anulação é um
// registro NOVO com estornoDeId apontando para o original; ela conta negativo).
// ═══════════════════════════════════════════════════════════════════════════

/** SUM líquido: soma os originais e subtrai os que foram estornados. */
async function liquidadoLiquido(
  tx: Tx,
  empenhoId: string
): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    where: { empenhoId },
    // TR 5.35: a ANULAÇÃO PARCIAL reduz a liquidação — ela não a zera.
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  // A aritmética é UMA (packages/estornaveis). Esta era a TERCEIRA cópia dela.
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O líquido de UMA liquidação (já descontadas as suas anulações parciais). */
async function liquidoDaLiquidacao(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.liquidacao.findMany({
    where: { OR: [{ id }, { anulacaoParcialDeId: id }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O líquido de UM pagamento (já descontadas as suas anulações parciais). */
async function liquidoDoPagamento(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.pagamento.findMany({
    where: { OR: [{ id }, { anulacaoParcialDeId: id }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

/** O empenhado líquido de UM empenho (já descontadas as parciais dele). */
async function empenhadoLiquidoDoEmpenho(tx: Tx, id: string): Promise<Money> {
  const linhas = await tx.empenho.findMany({
    where: { OR: [{ id }, { anulacaoParcialDeId: id }] },
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });
  return somaLiquidaEstornaveis(
    linhas.map((l) => ({
      id: l.id,
      valor: toMoney(l.valor.toFixed(2)),
      estornoDeId: l.estornoDeId,
      anulacaoParcialDeId: l.anulacaoParcialDeId,
    }))
  );
}

async function pagoLiquido(tx: Tx, liquidacaoId: string): Promise<Money> {
  const linhas = await tx.pagamento.findMany({
    where: { liquidacaoId },
    // TR 5.35: a ANULAÇÃO PARCIAL reduz o pagamento — ela não o zera.
    select: {
      id: true,
      valor: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
    },
  });

  // A aritmética é UMA (packages/estornaveis) — aqui só se escolhe o recorte.
  return somaLiquidaEstornaveis(
    linhas.map((p) => ({
      id: p.id,
      valor: toMoney(p.valor.toFixed(2)),
      estornoDeId: p.estornoDeId,
      anulacaoParcialDeId: p.anulacaoParcialDeId,
    }))
  );
}

/** Total pago de um EMPENHO = soma do pago de todas as suas liquidações vivas. */
async function pagoDoEmpenho(tx: Tx, empenhoId: string): Promise<Money> {
  const liquidacoes = await tx.liquidacao.findMany({
    where: { empenhoId, estornoDeId: null },
    select: { id: true, estornos: { select: { id: true } } },
  });

  let total = toMoney("0.00");
  for (const l of liquidacoes) {
    if (l.estornos.length > 0) continue; // liquidação anulada
    total = toMoney(total.plus(await pagoLiquido(tx, l.id)));
  }
  return total;
}

async function lancamentoDoDominio(
  tx: Tx,
  lancamentoId: string
): Promise<LancamentoContabil> {
  const l = await tx.lancamentoContabil.findUniqueOrThrow({
    where: { id: lancamentoId },
    select: {
      id: true,
      numeroControle: true,
      dataTransacao: true,
      historico: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      partidas: {
        select: {
          tipo: true,
          subsistema: true,
          valor: true,
          conta: { select: { codigo: true } },
        },
      },
    },
  });

  const partidas: readonly Partida[] = l.partidas.map((p) => ({
    conta: p.conta.codigo,
    tipo: p.tipo,
    subsistema: p.subsistema,
    valor: toMoney(p.valor.toFixed(2)),
  }));

  return {
    id: l.id,
    numeroControle: l.numeroControle,
    partidas,
    dataTransacao: l.dataTransacao,
    historico: l.historico,
    ...(l.estornoDeId !== null ? { estornoDeId: l.estornoDeId } : {}),
    estornos: l.estornos.map((x) => x.id),
  };
}

export function criarM05Deps(
  prisma: PrismaClient,
  contratos?: ContratoPort,
  aoAnularLiquidacao?: AoAnularLiquidacaoPort
): M05Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    contas: criarContaRepositoryPrisma(prisma),
    despesa: criarDespesaRepositoryPrisma(prisma, contratos, aoAnularLiquidacao),
    ids: idsUuid,
  };
}
