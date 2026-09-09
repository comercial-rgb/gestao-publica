import type { AcaoDoSistema } from "./acoes.js";
import { autorizar, type Tx } from "./autorizacao.js";

/**
 * M16 — O ESCOPO DO FATO: DE ONDE SAI A UNIDADE GESTORA. TR 6.5.
 *
 * ═══ ⚠️ O CENSO DA UG, E ELE É UM FATO DE SCHEMA — NÃO UMA OPINIÃO ═══
 * `unidadeOrcId` existe em **UMA** entidade do sistema inteiro: `FichaOrcamentaria`
 * (m02-planejamento.prisma). Não há UG em conta bancária, contrato, processo, bem, classe de
 * material, dívida, provisão nem receita.
 *
 * Daí a consequência, e ela é fechada: **ou a UG do fato vem de uma ficha — por um caminho de
 * FKs que este arquivo percorre — ou o fato não tem UG, e é ato do ENTE.** Não existe terceira
 * via, e por isso não existe "UG default": inventá-la seria carimbar uma unidade num fato que
 * não pertence a nenhuma.
 *
 * ⚠️ E ÓRGÃO NÃO É UNIDADE GESTORA. A obra (M11) tem `orgaoId`, e a tentação de usá-lo é
 * grande. Mas um órgão TEM VÁRIAS UGs — conceder "cadastrar obra na UG-A" a partir do órgão
 * daria, na prática, poder sobre as irmãs dela. A obra fica no escopo do ENTE.
 *
 * ═══ ⚠️ POR QUE UM ALVO INEXISTENTE DEVOLVE `undefined`, E NÃO ESTOURA ═══
 * `ugDaLiquidacao(tx, "não-existe")` NÃO lança. Devolve `undefined` — "não sei onde é aqui".
 *
 * Porque quem tem de reclamar do id que não existe é o SERVIÇO, com a mensagem DELE
 * (`Liquidação X não encontrada.`) — é ela que o usuário conhece e é ela que os testes de
 * negócio provam. Se o resolvedor estourasse primeiro, toda mensagem de "não encontrado" do
 * repositório viraria um erro de autorização, e o rollout teria reescrito, de lado, meia
 * centena de literais de negócio que ninguém pediu para mexer.
 *
 * Nada escapa por esse `undefined`: sem UG conhecida, só a permissão GLOBAL autoriza — e uma
 * linha adiante o serviço estoura no seu próprio guard de existência, sem gravar nada.
 */

/**
 * O ESCOPO DE UM FATO. Um caso por CAMINHO até a ficha — não um por serviço: `liquidar`,
 * `anularLiquidacao` e `anularLiquidacaoParcial` andam todos por `{ liquidacao }`.
 */
export type EscopoDoFato =
  /** O ato não pertence a unidade nenhuma (fechar o mês, encerrar o exercício, cadastrar um
   *  contrato). Só a permissão GLOBAL o autoriza. */
  | "ENTE"
  /** A UG já resolvida — `criarFicha` (a UG É o objeto do ato) e os itens de crédito. */
  | { readonly ug: string | undefined }
  /** N UGs de uma vez: o decreto que suplementa a Saúde E a Educação. TODAS têm de passar. */
  | { readonly ugs: readonly string[] }
  /** N fichas — o crédito adicional toca uma por item, e elas podem ser de UGs diferentes. */
  | { readonly fichas: readonly string[] }
  | { readonly ficha: string }
  | { readonly reserva: string }
  | { readonly empenho: string }
  | { readonly liquidacao: string }
  | { readonly pagamento: string }
  | { readonly inscricaoRp: string }
  | { readonly movimentoRp: string }
  /** Entrada de almoxarifado: nasce de liquidação (tem UG) — mas ajuste e saída, não. */
  | { readonly movimentoAlmoxarifado: string }
  /** Aquisição de bem: `liquidacaoId` é OPCIONAL — a UG segue o fato, e some quando ele não
   *  tem liquidação (uma doação recebida não é despesa de UG nenhuma). */
  | { readonly movimentoPatrimonial: string }
  /** Conciliação: o "interno" é PAGAMENTO (tem UG) ou ARRECADAÇÃO/EXTRA (não tem). */
  | { readonly interno: { readonly tipo: string; readonly id: string } }
  | { readonly vinculo: string }
  /** O lançamento manual estornado: as partidas dele podem tocar N fichas — logo, N UGs. */
  | { readonly lancamento: string };

const UG_DA_FICHA = { select: { unidadeOrcId: true } } as const;

export async function ugDaFicha(tx: Tx, fichaId: string): Promise<string | undefined> {
  const f = await tx.fichaOrcamentaria.findUnique({
    where: { id: fichaId },
    ...UG_DA_FICHA,
  });
  return f?.unidadeOrcId;
}

export async function ugDaReserva(tx: Tx, reservaId: string): Promise<string | undefined> {
  const r = await tx.reservaDotacao.findUnique({
    where: { id: reservaId },
    select: { ficha: UG_DA_FICHA },
  });
  return r?.ficha.unidadeOrcId;
}

export async function ugDoEmpenho(tx: Tx, empenhoId: string): Promise<string | undefined> {
  const e = await tx.empenho.findUnique({
    where: { id: empenhoId },
    select: { ficha: UG_DA_FICHA },
  });
  return e?.ficha.unidadeOrcId;
}

export async function ugDaLiquidacao(
  tx: Tx,
  liquidacaoId: string
): Promise<string | undefined> {
  const l = await tx.liquidacao.findUnique({
    where: { id: liquidacaoId },
    select: { empenho: { select: { ficha: UG_DA_FICHA } } },
  });
  return l?.empenho.ficha.unidadeOrcId;
}

export async function ugDoPagamento(
  tx: Tx,
  pagamentoId: string
): Promise<string | undefined> {
  const p = await tx.pagamento.findUnique({
    where: { id: pagamentoId },
    select: { liquidacao: { select: { empenho: { select: { ficha: UG_DA_FICHA } } } } },
  });
  return p?.liquidacao.empenho.ficha.unidadeOrcId;
}

/** O resto a pagar herda a UG do EMPENHO que o inscreveu — ele é o mesmo dinheiro. */
export async function ugDaInscricaoRp(
  tx: Tx,
  inscricaoId: string
): Promise<string | undefined> {
  const i = await tx.inscricaoRestosAPagar.findUnique({
    where: { id: inscricaoId },
    select: { empenho: { select: { ficha: UG_DA_FICHA } } },
  });
  return i?.empenho.ficha.unidadeOrcId;
}

export async function ugDoMovimentoRp(
  tx: Tx,
  movimentoId: string
): Promise<string | undefined> {
  const m = await tx.movimentoRestosAPagar.findUnique({
    where: { id: movimentoId },
    select: { inscricao: { select: { empenho: { select: { ficha: UG_DA_FICHA } } } } },
  });
  return m?.inscricao.empenho.ficha.unidadeOrcId;
}

/**
 * ⚠️ O ESCOPO SEGUE O FATO — e aqui ele pode SUMIR, legitimamente.
 *
 * A ENTRADA de almoxarifado nasce de uma liquidação (TR 5.85) e tem UG. O AJUSTE de inventário
 * e a SAÍDA por consumo não nascem de liquidação nenhuma — e não têm. Estornar um movimento é
 * um ato do MESMO escopo do movimento estornado: se a entrada era da Saúde, desfazê-la é ato da
 * Saúde; se era um ajuste do almoxarifado central, é ato do ente.
 */
export async function ugDoMovimentoAlmoxarifado(
  tx: Tx,
  movimentoId: string
): Promise<string | undefined> {
  const m = await tx.movimentoAlmoxarifado.findUnique({
    where: { id: movimentoId },
    select: { liquidacaoId: true },
  });
  if (m?.liquidacaoId == null) return undefined;
  return ugDaLiquidacao(tx, m.liquidacaoId);
}

export async function ugDoMovimentoPatrimonial(
  tx: Tx,
  movimentoId: string
): Promise<string | undefined> {
  const m = await tx.movimentoPatrimonial.findUnique({
    where: { id: movimentoId },
    select: { liquidacaoId: true },
  });
  if (m?.liquidacaoId == null) return undefined;
  return ugDaLiquidacao(tx, m.liquidacaoId);
}

/**
 * A CONCILIAÇÃO BANCÁRIA — e ela é HETEROGÊNEA por natureza.
 *
 * O vínculo casa uma linha do extrato com um PAGAMENTO (que tem ficha, logo UG), uma
 * ARRECADAÇÃO ou um MOVIMENTO EXTRAORÇAMENTÁRIO (que não têm). O escopo segue o fato interno:
 * conciliar o pagamento da Saúde é ato da Saúde; conciliar uma guia de receita é ato do ente.
 */
export async function ugDoInterno(
  tx: Tx,
  tipoInterno: string,
  internoId: string
): Promise<string | undefined> {
  if (tipoInterno !== "PAGAMENTO") return undefined;
  return ugDoPagamento(tx, internoId);
}

export async function ugDoVinculo(tx: Tx, vinculoId: string): Promise<string | undefined> {
  const v = await tx.vinculoConciliacao.findUnique({
    where: { id: vinculoId },
    select: { tipoInterno: true, internoId: true },
  });
  if (v === null) return undefined;
  return ugDoInterno(tx, v.tipoInterno, v.internoId);
}

/**
 * AS UGs DE UM LANÇAMENTO — pelas fichas que as partidas dele carimbam.
 *
 * ⚠️ PODE SER ZERO (o lançamento manual puro, sem dimensão orçamentária — TR 5.95), UMA, ou
 * VÁRIAS (um lançamento que toca fichas de unidades diferentes). Estornar um lançamento que
 * mexeu na Saúde E na Educação exige poder nas DUAS: o estorno desfaz as duas pernas, e quem
 * só pode numa não pode desfazer a outra "de carona".
 */
export async function ugsDoLancamento(
  tx: Tx,
  lancamentoId: string
): Promise<readonly string[]> {
  const partidas = await tx.partidaContabil.findMany({
    where: { lancamentoId, fichaId: { not: null } },
    select: { ficha: UG_DA_FICHA },
  });
  return [...new Set(partidas.map((p) => p.ficha!.unidadeOrcId))];
}

/** Resolve o escopo em UGs. `[]` = ato do ENTE (só permissão GLOBAL). */
async function resolverUgs(tx: Tx, escopo: EscopoDoFato): Promise<readonly string[]> {
  if (escopo === "ENTE") return [];

  const umaOuNenhuma = (ug: string | undefined): readonly string[] =>
    ug === undefined ? [] : [ug];

  if ("ugs" in escopo) return [...new Set(escopo.ugs)];
  if ("ug" in escopo) return umaOuNenhuma(escopo.ug);
  if ("fichas" in escopo) {
    const ugs = await Promise.all(
      [...new Set(escopo.fichas)].map((f) => ugDaFicha(tx, f))
    );
    return [...new Set(ugs.filter((u): u is string => u !== undefined))];
  }
  if ("ficha" in escopo) return umaOuNenhuma(await ugDaFicha(tx, escopo.ficha));
  if ("reserva" in escopo) return umaOuNenhuma(await ugDaReserva(tx, escopo.reserva));
  if ("empenho" in escopo) return umaOuNenhuma(await ugDoEmpenho(tx, escopo.empenho));
  if ("liquidacao" in escopo) {
    return umaOuNenhuma(await ugDaLiquidacao(tx, escopo.liquidacao));
  }
  if ("pagamento" in escopo) {
    return umaOuNenhuma(await ugDoPagamento(tx, escopo.pagamento));
  }
  if ("inscricaoRp" in escopo) {
    return umaOuNenhuma(await ugDaInscricaoRp(tx, escopo.inscricaoRp));
  }
  if ("movimentoRp" in escopo) {
    return umaOuNenhuma(await ugDoMovimentoRp(tx, escopo.movimentoRp));
  }
  if ("movimentoAlmoxarifado" in escopo) {
    return umaOuNenhuma(
      await ugDoMovimentoAlmoxarifado(tx, escopo.movimentoAlmoxarifado)
    );
  }
  if ("movimentoPatrimonial" in escopo) {
    return umaOuNenhuma(
      await ugDoMovimentoPatrimonial(tx, escopo.movimentoPatrimonial)
    );
  }
  if ("interno" in escopo) {
    return umaOuNenhuma(
      await ugDoInterno(tx, escopo.interno.tipo, escopo.interno.id)
    );
  }
  if ("vinculo" in escopo) return umaOuNenhuma(await ugDoVinculo(tx, escopo.vinculo));
  return ugsDoLancamento(tx, escopo.lancamento);
}

/**
 * AUTORIZA UM ATO NO ESCOPO DO FATO (ou estoura). É esta a chamada que os 76 serviços fazem —
 * uma linha, a mesma forma, em toda a base.
 *
 * ⚠️ **TODAS as UGs do fato têm de passar** — não a primeira, não a maioria. Um decreto que
 * suplementa a Saúde e a Educação é UM ato sobre DUAS unidades: quem só pode na Saúde não
 * executa "a parte dela" — o decreto é indivisível, e metade dele gravada seria um crédito
 * desbalanceado (Σanul == Σsupl deixaria de valer). A permissão GLOBAL cobre todas de uma vez;
 * a de uma UG só cobre a sua.
 */
export async function autorizarNo(
  tx: Tx,
  identificador: string,
  acao: AcaoDoSistema,
  escopo: EscopoDoFato
): Promise<void> {
  const ugs = await resolverUgs(tx, escopo);

  // Ato do ENTE (ou alvo inexistente — ver o cabeçalho): só a permissão GLOBAL autoriza.
  if (ugs.length === 0) {
    await autorizar(tx, identificador, acao);
    return;
  }

  for (const ug of ugs) {
    await autorizar(tx, identificador, acao, ug);
  }
}
