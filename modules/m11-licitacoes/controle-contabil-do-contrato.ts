import { randomUUID } from "node:crypto";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { formatarMoeda } from "../../packages/contracts/moeda.js";
import { diaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { roteiroPatrimonialVigente } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";

/**
 * V39-R2 (R2-008 a 013, V39-032) — O CONTROLE CONTÁBIL DO CONTRATO NO RAZÃO.
 *
 * Os fatos do M11 que mudam o valor a executar de um contrato — o REGISTRO (o contrato, pelo valor inicial), o
 * ACRESCIMO e a SUPRESSAO (aditivos de valor) e a EXECUCAO (a liquidação das parcelas recebidas) — lançam no
 * subsistema de CONTROLE pelo roteiro declarado da família CONTRATO (as contas são do contador, nenhuma vem do código).
 * Medição, recebimento provisório e definitivo NÃO lançam: medir não executa, receber prepara a liquidação; é a
 * liquidação que reconhece a execução (uma etapa só, sem repetir o efeito).
 *
 * ⚠️ SEM ROTEIRO, NÃO SE LANÇA — E ISSO FICA VISÍVEL. O contrato é cadastrado mesmo sem a decisão da contadora; a
 * tela do contrato diz, por evento, que o controle não está declarado. Bloquear o contrato pelo roteiro pararia as
 * compras do ente por uma escolha contábil ainda não feita.
 *
 * ⚠️ IDEMPOTÊNCIA PELO BANCO: UNIQUE (evento, origem). ⚠️ O ESTORNO inverte as contas que o lançamento original
 * USOU (lidas das partidas), nunca o roteiro vigente: trocar o roteiro depois não muda a inversão histórica.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type EventoDoControleDoContrato = "REGISTRO" | "ACRESCIMO" | "SUPRESSAO" | "EXECUCAO";

const ROTULO_DO_EVENTO: Readonly<Record<EventoDoControleDoContrato | "ESTORNO", string>> = {
  REGISTRO: "registro do contrato",
  ACRESCIMO: "acréscimo de valor",
  SUPRESSAO: "supressão de valor",
  EXECUCAO: "execução (liquidação)",
  ESTORNO: "estorno",
};

export type ResultadoDoControle =
  | { readonly situacao: "LANCADO"; readonly lancamentoId: string; readonly versaoDoRoteiro: number | null }
  | { readonly situacao: "JA_LANCADO"; readonly lancamentoId: string }
  | { readonly situacao: "SEM_ROTEIRO" }
  | { readonly situacao: "SEM_VALOR" }
  | { readonly situacao: "CONTROLE_NAO_ABERTO" }
  | { readonly situacao: "SEM_LANCAMENTO_ORIGINAL" }
  | { readonly situacao: "NADA_A_ESTORNAR" };

/** Lança o controle de um fato do contrato pelo roteiro CONTRATO vigente (ou devolve o que já foi lançado). */
export async function lancarControleDoContrato(
  tx: Tx,
  p: { readonly contratoId: string; readonly evento: EventoDoControleDoContrato; readonly origemId: string; readonly valor: Money; readonly dia: string; readonly criadoPor: string }
): Promise<ResultadoDoControle> {
  const ja = await tx.lancamentoDeControleDoContrato.findUnique({ where: { evento_origemId: { evento: p.evento, origemId: p.origemId } }, select: { lancamentoId: true } });
  if (ja !== null) return { situacao: "JA_LANCADO", lancamentoId: ja.lancamentoId };
  if (!p.valor.greaterThan(0)) return { situacao: "SEM_VALOR" };
  // O controle do contrato começa no REGISTRO. Contrato cadastrado antes do roteiro não tem o "a executar" aberto:
  // baixar dele a execução, ou somar-lhe um acréscimo, deixaria o saldo do controle sem o valor de origem (negativo,
  // ou só com o aditivo). Esses fatos não lançam, e a tela do contrato diz que o controle dele não foi aberto.
  if (p.evento !== "REGISTRO") {
    const registro = await tx.lancamentoDeControleDoContrato.findUnique({ where: { evento_origemId: { evento: "REGISTRO", origemId: p.contratoId } }, select: { id: true } });
    if (registro === null) return { situacao: "CONTROLE_NAO_ABERTO" };
  }
  const roteiro = await roteiroPatrimonialVigente(tx, "CONTRATO", p.evento);
  if (roteiro === null) return { situacao: "SEM_ROTEIRO" };
  const contrato = await tx.contrato.findUniqueOrThrow({ where: { id: p.contratoId }, select: { numeroContrato: true, contratadoNome: true } });
  const lancamentoId = randomUUID();
  await lancarNoRazao(tx, {
    id: lancamentoId,
    numeroControle: `CTR-${contrato.numeroContrato}-${p.evento}-${p.origemId.slice(-8)}`,
    dataTransacao: inicioDoDiaCivil(p.dia),
    historico: `${roteiro.historicoPadrao} — contrato ${contrato.numeroContrato} (${contrato.contratadoNome}), ${ROTULO_DO_EVENTO[p.evento]} de R$ ${formatarMoeda(p.valor.toFixed(2)).texto}`,
    origemTipo: `CONTRATO_${p.evento}`,
    origemId: p.origemId,
    criadoPor: p.criadoPor,
    partidas: [
      { contaId: roteiro.contaDebito.id, tipo: "DEBITO", subsistema: "CONTROLE", valor: p.valor.toFixed(2) },
      { contaId: roteiro.contaCredito.id, tipo: "CREDITO", subsistema: "CONTROLE", valor: p.valor.toFixed(2) },
    ],
  });
  await tx.lancamentoDeControleDoContrato.create({
    data: { contratoId: p.contratoId, evento: p.evento, origemId: p.origemId, lancamentoId, valor: p.valor.toFixed(2), versaoDoRoteiro: roteiro.versao, criadoPor: p.criadoPor },
  });
  return { situacao: "LANCADO", lancamentoId, versaoDoRoteiro: roteiro.versao };
}

/**
 * V39-R2 (R2-012) — a EXECUÇÃO do contrato no controle: a LIQUIDAÇÃO de empenho vinculado a contrato é a etapa que
 * reconhece a execução (medir e receber não lançam; pagar não executa de novo). Qualquer caminho que grava liquidação
 * (parcela recebida, medição de obra, liquidação direta, restos a pagar) chama isto no mesmo commit; sem contrato no
 * empenho ou sem roteiro, nada se lança.
 */
export async function lancarExecucaoDaLiquidacao(tx: Tx, liquidacaoId: string, criadoPor: string): Promise<ResultadoDoControle | null> {
  const liq = await tx.liquidacao.findUniqueOrThrow({ where: { id: liquidacaoId }, select: { valor: true, data: true, empenho: { select: { contratoId: true } } } });
  if (liq.empenho.contratoId === null) return null;
  return lancarControleDoContrato(tx, { contratoId: liq.empenho.contratoId, evento: "EXECUCAO", origemId: liquidacaoId, valor: toMoney(liq.valor.toFixed(2)), dia: diaCivil(liq.data), criadoPor });
}

/**
 * O efeito LÍQUIDO de um elo: o valor dele menos o efeito líquido de cada estorno que o aponta (o estorno de uma glosa
 * desfeita devolve o que a glosa tirou). Derivado, nunca gravado.
 */
function efeitoLiquido(id: string, elos: readonly { readonly id: string; readonly valor: Money; readonly estornoDeId: string | null }[]): Money {
  const elo = elos.find((x) => x.id === id);
  if (elo === undefined) return toMoney(0);
  return elos.filter((x) => x.estornoDeId === id).reduce((t, e) => toMoney(t.minus(efeitoLiquido(e.id, elos))), elo.valor);
}

/**
 * Estorna o controle de um fato (o movimento contratual estornado, a liquidação anulada inteira ou em parte, a glosa
 * desfeita): inverte as contas do lançamento ORIGINAL. Sem `valor`, estorna o efeito líquido que resta; com `valor`
 * (a glosa parcial), só ele — e nunca acima do que resta. Sem controle original (o roteiro não estava declarado
 * quando o fato aconteceu), não há o que inverter. Idempotente pelo UNIQUE (ESTORNO, origem do estorno).
 */
export async function estornarControleDoContrato(
  tx: Tx,
  p: {
    readonly eventoOriginal: EventoDoControleDoContrato | "ESTORNO";
    readonly origemOriginalId: string;
    readonly origemDoEstornoId: string;
    readonly valor?: Money;
    readonly dia: string;
    readonly criadoPor: string;
  }
): Promise<ResultadoDoControle> {
  const ja = await tx.lancamentoDeControleDoContrato.findUnique({ where: { evento_origemId: { evento: "ESTORNO", origemId: p.origemDoEstornoId } }, select: { lancamentoId: true } });
  if (ja !== null) return { situacao: "JA_LANCADO", lancamentoId: ja.lancamentoId };
  const original = await tx.lancamentoDeControleDoContrato.findUnique({
    where: { evento_origemId: { evento: p.eventoOriginal, origemId: p.origemOriginalId } },
    select: { id: true, contratoId: true, evento: true, lancamentoId: true, contrato: { select: { numeroContrato: true } } },
  });
  if (original === null) return { situacao: "SEM_LANCAMENTO_ORIGINAL" };
  const elos = (await tx.lancamentoDeControleDoContrato.findMany({ where: { contratoId: original.contratoId }, select: { id: true, valor: true, estornoDeId: true } }))
    .map((x) => ({ id: x.id, valor: toMoney(x.valor.toFixed(2)), estornoDeId: x.estornoDeId }));
  const resta = efeitoLiquido(original.id, elos);
  const valor = p.valor === undefined ? resta : toMoney(p.valor.toFixed(2));
  if (valor.greaterThan(resta)) {
    throw new Error(`O estorno do controle do contrato ${original.contrato.numeroContrato} pede R$ ${formatarMoeda(valor.toFixed(2)).texto}, mas o lançamento original só tem R$ ${formatarMoeda(resta.toFixed(2)).texto} a estornar. Nada foi gravado.`);
  }
  if (!valor.greaterThan(0)) return { situacao: "NADA_A_ESTORNAR" };
  const doOriginal = elos.find((x) => x.id === original.id)!;
  const totalEUnico = valor.equals(doOriginal.valor) && !elos.some((x) => x.estornoDeId === original.id);
  const partidas = await tx.partidaContabil.findMany({ where: { lancamentoId: original.lancamentoId }, select: { tipo: true, contaId: true } });
  const debito = partidas.find((x) => x.tipo === "DEBITO");
  const credito = partidas.find((x) => x.tipo === "CREDITO");
  if (debito === undefined || credito === undefined) throw new Error(`O lançamento de controle do contrato ${original.contrato.numeroContrato} não foi encontrado para estornar. Nada foi gravado.`);
  const rotulo = original.evento === "ESTORNO" ? "estorno desfeito" : ROTULO_DO_EVENTO[original.evento as EventoDoControleDoContrato];
  const lancamentoId = randomUUID();
  await lancarNoRazao(tx, {
    id: lancamentoId,
    numeroControle: `CTR-${original.contrato.numeroContrato}-ESTORNO-${p.origemDoEstornoId.slice(-8)}`,
    dataTransacao: inicioDoDiaCivil(p.dia),
    historico: `Estorno do controle do contrato ${original.contrato.numeroContrato} (${rotulo}) de R$ ${formatarMoeda(valor.toFixed(2)).texto}`,
    origemTipo: "CONTRATO_ESTORNO",
    origemId: p.origemDoEstornoId,
    // O elo do razão (LancamentoContabil.estornoDeId) é um por lançamento: vai só no estorno ÚNICO e TOTAL. Os parciais
    // (a glosa, e a anulação do que restou depois dela) ficam ligados pelo elo daqui, que aceita mais de um.
    ...(totalEUnico ? { estornoDeId: original.lancamentoId } : {}),
    criadoPor: p.criadoPor,
    partidas: [
      { contaId: credito.contaId, tipo: "DEBITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
      { contaId: debito.contaId, tipo: "CREDITO", subsistema: "CONTROLE", valor: valor.toFixed(2) },
    ],
  });
  await tx.lancamentoDeControleDoContrato.create({
    data: { contratoId: original.contratoId, evento: "ESTORNO", origemId: p.origemDoEstornoId, lancamentoId, valor: valor.toFixed(2), versaoDoRoteiro: null, estornoDeId: original.id, criadoPor: p.criadoPor },
  });
  return { situacao: "LANCADO", lancamentoId, versaoDoRoteiro: null };
}

export interface LinhaDoControleDoContrato {
  readonly evento: EventoDoControleDoContrato | "ESTORNO";
  readonly rotulo: string;
  readonly valor: string;
  /** O que o lançamento ainda produz depois dos estornos que o apontam (nos fatos; "—" no próprio estorno). */
  readonly efeito: string | null;
  readonly numeroControle: string;
  readonly dia: Date;
  readonly versaoDoRoteiro: number | null;
}

/**
 * Leitura: o controle contábil do contrato, lançamento a lançamento, o saldo a executar que ele registra
 * (registro + acréscimos − supressões − execução, pelos efeitos líquidos) e os eventos sem roteiro declarado.
 */
export async function controleContabilDoContrato(
  tx: Tx,
  contratoId: string
): Promise<{
  readonly linhas: readonly LinhaDoControleDoContrato[];
  readonly aExecutar: string;
  readonly controleAberto: boolean;
  /** Por que o controle não foi aberto: o contrato não tem valor, não há roteiro do registro, ou foi cadastrado antes dele. */
  readonly motivoDoControleFechado: "SEM_VALOR" | "SEM_ROTEIRO_DO_REGISTRO" | "ANTERIOR_AO_ROTEIRO" | null;
  readonly eventosSemRoteiro: readonly EventoDoControleDoContrato[];
}> {
  const ls = await tx.lancamentoDeControleDoContrato.findMany({
    where: { contratoId },
    orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, evento: true, valor: true, estornoDeId: true, versaoDoRoteiro: true, lancamento: { select: { numeroControle: true, dataTransacao: true } } },
  });
  const elos = ls.map((x) => ({ id: x.id, valor: toMoney(x.valor.toFixed(2)), estornoDeId: x.estornoDeId }));
  let aExecutar = toMoney(0);
  const linhas: LinhaDoControleDoContrato[] = ls.map((l) => {
    const evento = l.evento as EventoDoControleDoContrato | "ESTORNO";
    const efeito = evento === "ESTORNO" ? null : efeitoLiquido(l.id, elos);
    if (efeito !== null) aExecutar = toMoney(evento === "SUPRESSAO" || evento === "EXECUCAO" ? aExecutar.minus(efeito) : aExecutar.plus(efeito));
    return {
      evento, rotulo: ROTULO_DO_EVENTO[evento], valor: toMoney(l.valor.toFixed(2)).toFixed(2), efeito: efeito === null ? null : efeito.toFixed(2),
      numeroControle: l.lancamento.numeroControle, dia: l.lancamento.dataTransacao, versaoDoRoteiro: l.versaoDoRoteiro,
    };
  });
  const sem: EventoDoControleDoContrato[] = [];
  for (const e of ["REGISTRO", "ACRESCIMO", "SUPRESSAO", "EXECUCAO"] as const) if ((await roteiroPatrimonialVigente(tx, "CONTRATO", e)) === null) sem.push(e);
  const controleAberto = ls.some((l) => l.evento === "REGISTRO");
  const valorInicial = controleAberto ? null : (await tx.contrato.findUniqueOrThrow({ where: { id: contratoId }, select: { valorInicial: true } })).valorInicial;
  const motivoDoControleFechado = controleAberto ? null : !toMoney(valorInicial!.toFixed(2)).greaterThan(0) ? "SEM_VALOR" : sem.includes("REGISTRO") ? "SEM_ROTEIRO_DO_REGISTRO" : "ANTERIOR_AO_ROTEIRO";
  return { linhas, aExecutar: aExecutar.toFixed(2), controleAberto, motivoDoControleFechado, eventosSemRoteiro: sem };
}
