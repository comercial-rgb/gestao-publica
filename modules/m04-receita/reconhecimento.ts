import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { parsearNaturezaReceita } from "./natureza.js";

/**
 * M04 — RECONHECIMENTO DA RECEITA PELO FATO GERADOR. TR 5.87/5.88 · 4.62 · NBC TSP.
 *
 * ═══ A COMPETÊNCIA RENASCE AQUI — o outro lado de c398b4f ═══
 * Aquele commit removeu a `competencia` DORMENTE do lançamento (herdada, divergente, SEM
 * LEITOR) e prometeu que a de verdade nasceria na entidade dona, com leitor no mesmo commit.
 * É este arquivo: `dataFatoGerador` é a competência, e `saldoAArrecadar` (abaixo) é o leitor.
 *
 * ═══ O QUE CADA ATO FAZ AO RAZÃO ═══
 *   reconhecer  →  D crédito a receber (ativo, classe 1) × C VPA (classe 4)   [gera riqueza]
 *   arrecadar   →  D caixa × C crédito a receber                              [PERMUTATIVO]
 *   inscrever   →  D dívida ativa × C crédito a receber                       [RECLASSIFICA]
 *   cancelar    →  D VPD × C crédito a receber                                [renúncia/perda]
 *
 * ⚠️ A VPA NASCE **UMA VEZ**, no reconhecimento, e nunca se repete. Arrecadar, inscrever e
 * cancelar apenas MOVEM ou EXTINGUEM o ativo já reconhecido — nenhum deles gera receita nova.
 * Contar VPA de novo em qualquer um deles seria reconhecer a mesma receita duas vezes.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

const zValorPositivo = zMoney.refine((v) => v.greaterThan(0), {
  message: "Valor deve ser > 0",
});
const zMotivo = z
  .string()
  .trim()
  .min(10, "O motivo precisa de ao menos 10 caracteres");

// ═══════════════════════════════════════════════════════════════════════════
// O ROTEIRO — por ORIGEM (derivada do código), fail-closed.
// ═══════════════════════════════════════════════════════════════════════════

interface RoteiroReconhecido {
  readonly contaCreditoAReceberId: string;
  readonly contaVpaId: string;
  readonly contaVpdId: string | null;
}

/**
 * O roteiro da ORIGEM — e a origem SAI DO CÓDIGO, pelo parser de `ef6f559`. Nada de "família"
 * inventada: `IMPOSTOS_TAXAS_CONTRIBUICOES_DE_MELHORIA`, `TRANSFERENCIAS_CORRENTES`... são os
 * mesmos 13 valores que a natureza já classifica.
 *
 * FAIL-CLOSED: origem sem roteiro NÃO reconhece. Nenhuma conta é inventada.
 */
async function exigirRoteiro(
  tx: Tx,
  naturezaCodigo: string
): Promise<RoteiroReconhecido> {
  const origem = parsearNaturezaReceita(naturezaCodigo).origem;

  const r = await tx.roteiroReconhecimento.findUnique({
    where: { origem },
    select: {
      contaCreditoAReceberId: true,
      contaVpaId: true,
      contaVpdId: true,
    },
  });
  if (r === null) {
    throw new Error(
      `Não há RoteiroReconhecimento para a origem ${origem} (natureza ${naturezaCodigo}). ` +
        `As contas do PCASP vêm por PARÂMETRO — nenhuma é inventada no código. Cadastre o ` +
        `roteiro da origem antes de reconhecer receita dela. Nada foi gravado.`
    );
  }
  return r;
}

// ═══════════════════════════════════════════════════════════════════════════
// A DERIVAÇÃO DO SALDO — o LEITOR do 5.87.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * O SALDO A ARRECADAR de UM reconhecimento:
 *   valor reconhecido − Σ arrecadado vinculado (de guias VIVAS) − Σ inscrito − Σ cancelado.
 *
 * ⚠️ "GUIA VIVA" É O PONTO SUTIL. Um vínculo só conta se a arrecadação dele **não é uma
 * anulação** e **não foi anulada**. Quando a guia é anulada, o vínculo não é apagado — ele
 * simplesmente PARA DE CONTAR aqui. É a disciplina do `packages/estornaveis`: não se desfaz o
 * fato, deriva-se em cima dele. Zero escrita para "desfazer o vínculo", e nada a divergir.
 *
 * Reconhecimento ESTORNADO (ou que É estorno) devolve 0 — ele não tem saldo a arrecadar.
 */
export async function saldoReconhecidoDe(
  tx: Tx,
  reconhecimentoId: string
): Promise<Money> {
  const r = await tx.receitaReconhecida.findUnique({
    where: { id: reconhecimentoId },
    select: {
      valor: true,
      estornoDeId: true,
      estornos: { select: { id: true } },
      vinculos: {
        select: {
          valor: true,
          arrecadacao: {
            select: { estornoDeId: true, estornos: { select: { id: true } } },
          },
        },
      },
      inscricoes: { select: { valor: true } },
      cancelamentos: { select: { valor: true } },
    },
  });
  if (r === null) {
    throw new Error(`Reconhecimento ${reconhecimentoId} não existe.`);
  }
  // Estornado, ou é um estorno: não tem saldo.
  if (r.estornoDeId !== null || r.estornos.length > 0) return toMoney("0.00");

  let saldo = toMoney(r.valor.toFixed(2));

  for (const v of r.vinculos) {
    const guiaViva =
      v.arrecadacao.estornoDeId === null && v.arrecadacao.estornos.length === 0;
    if (guiaViva) saldo = toMoney(saldo.minus(toMoney(v.valor.toFixed(2))));
  }
  for (const i of r.inscricoes) {
    saldo = toMoney(saldo.minus(toMoney(i.valor.toFixed(2))));
  }
  for (const c of r.cancelamentos) {
    saldo = toMoney(saldo.minus(toMoney(c.valor.toFixed(2))));
  }
  return saldo;
}

export interface SaldoAArrecadar {
  readonly reconhecido: string;
  readonly arrecadado: string;
  readonly inscrito: string;
  readonly cancelado: string;
  readonly saldo: string;
}

/**
 * O LEITOR DO 5.87 — o saldo a arrecadar de um recorte, cortado pela data do FATO GERADOR.
 *
 * ⚠️ A LIÇÃO DO `campoData` (M01): quem soma diz POR QUAL DATA soma. Aqui o corte é
 * `dataFatoGerador <= ate` — o IPTU de 2026 conta no demonstrativo de 2026 mesmo que a guia
 * entre em julho. É esta data que GOVERNA, e é ela que o relatório por competência usa.
 *
 * ⚠️ E A AMARRAÇÃO (padrão do bloco 5): o `saldo` derivado tem de bater com o saldo da CONTA de
 * crédito a receber no razão — grão = conta. O teste t8 prova, e a mutação acusa.
 */
export async function saldoAArrecadar(
  tx: Tx,
  filtro: {
    readonly naturezaCodigo?: string;
    readonly fonteId?: string;
    readonly ate: Date;
  }
): Promise<SaldoAArrecadar> {
  const reconhecimentos = await tx.receitaReconhecida.findMany({
    where: {
      ...(filtro.naturezaCodigo !== undefined
        ? { naturezaCodigo: filtro.naturezaCodigo }
        : {}),
      ...(filtro.fonteId !== undefined ? { fonteId: filtro.fonteId } : {}),
      dataFatoGerador: { lte: filtro.ate },
      // só os VIVOS (nem estorno, nem estornados) — o estorno cancela o par no líquido.
      estornoDeId: null,
      estornos: { none: {} },
    },
    select: { id: true, valor: true },
  });

  let reconhecido = toMoney("0.00");
  let saldoTotal = toMoney("0.00");
  let arrecadado = toMoney("0.00");
  let inscrito = toMoney("0.00");
  let cancelado = toMoney("0.00");

  for (const rec of reconhecimentos) {
    reconhecido = toMoney(reconhecido.plus(toMoney(rec.valor.toFixed(2))));
    const saldo = await saldoReconhecidoDe(tx, rec.id);
    saldoTotal = toMoney(saldoTotal.plus(saldo));
  }

  // As baixas, para o demonstrativo (o saldo já as descontou; aqui é só detalhamento).
  const ids = reconhecimentos.map((r) => r.id);
  if (ids.length > 0) {
    const [vinc, insc, canc] = await Promise.all([
      tx.vinculoArrecadacaoReconhecimento.findMany({
        where: {
          reconhecimentoId: { in: ids },
          arrecadacao: { estornoDeId: null, estornos: { none: {} } },
        },
        select: { valor: true },
      }),
      tx.inscricaoDeReconhecimento.findMany({
        where: { reconhecimentoId: { in: ids } },
        select: { valor: true },
      }),
      tx.cancelamentoDeReconhecimento.findMany({
        where: { reconhecimentoId: { in: ids } },
        select: { valor: true },
      }),
    ]);
    for (const v of vinc) arrecadado = toMoney(arrecadado.plus(toMoney(v.valor.toFixed(2))));
    for (const i of insc) inscrito = toMoney(inscrito.plus(toMoney(i.valor.toFixed(2))));
    for (const c of canc) cancelado = toMoney(cancelado.plus(toMoney(c.valor.toFixed(2))));
  }

  return {
    reconhecido: reconhecido.toFixed(2),
    arrecadado: arrecadado.toFixed(2),
    inscrito: inscrito.toFixed(2),
    cancelado: cancelado.toFixed(2),
    saldo: saldoTotal.toFixed(2),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// reconhecerReceita
// ═══════════════════════════════════════════════════════════════════════════

export const zReconhecerReceitaInput = z.object({
  naturezaCodigo: z.string(),
  fonteId: z.string().min(1),
  /** A data do FATO GERADOR — a competência. */
  dataFatoGerador: z.coerce.date(),
  valor: zValorPositivo,
  /** ⚠️ SIGILO 7.4.2 — referência OPACA (nunca CPF). Ver o schema. */
  contribuinteRef: z.string().optional(),
  historico: z.string().min(1),
  /** TR 7.6/4.68 — o gancho de idempotência da integração tributária. */
  referenciaExterna: z.string().optional(),
  criadoPor: z.string().min(1),
});
export type ReconhecerReceitaInput = z.input<typeof zReconhecerReceitaInput>;

/**
 * RECONHECE — o crédito nasce no fato gerador. D crédito a receber × C VPA.
 *
 * ⚠️ SEM UG: a receita é do ENTE (art. 167, IV), como toda arrecadação. Só permissão GLOBAL.
 */
export async function reconhecerReceita(
  prisma: PrismaClient,
  input: ReconhecerReceitaInput
): Promise<{ readonly reconhecimentoId: string; readonly lancamentoId: string }> {
  const d = zReconhecerReceitaInput.parse(input);
  // Valida o código (8 dígitos) fora da tx — fail-closed antes de tocar o banco.
  parsearNaturezaReceita(d.naturezaCodigo);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.reconhecerReceita, "ENTE");

    const roteiro = await exigirRoteiro(tx, d.naturezaCodigo);

    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `REC-${d.naturezaCodigo}-${d.dataFatoGerador
        .toISOString()
        .slice(0, 10)}`,
      dataTransacao: d.dataFatoGerador,
      historico: d.historico,
      origemTipo: "RECONHECIMENTO_RECEITA",
      criadoPor: d.criadoPor,
      partidas: [
        {
          contaId: roteiro.contaCreditoAReceberId,
          tipo: "DEBITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
        {
          contaId: roteiro.contaVpaId,
          tipo: "CREDITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
      ],
    });

    const rec = await tx.receitaReconhecida.create({
      data: {
        naturezaCodigo: d.naturezaCodigo,
        fonteId: d.fonteId,
        dataFatoGerador: d.dataFatoGerador,
        valor: d.valor.toFixed(2),
        contribuinteRef: d.contribuinteRef ?? null,
        historico: d.historico,
        referenciaExterna: d.referenciaExterna ?? null,
        lancamentoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return { reconhecimentoId: rec.id, lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// vincularReconhecimentoNaTx — a PERNA da arrecadação vinculada.
// ═══════════════════════════════════════════════════════════════════════════

export interface VinculoDeReconhecimento {
  readonly reconhecimentoId: string;
  readonly valor: string;
}

/**
 * VINCULA uma arrecadação (JÁ persistida) a N reconhecimentos, DENTRO da transação dela.
 *
 * ⚠️ NÃO É SERVIÇO PÚBLICO — é a perna interna da composta `arrecadarComVinculo`. Está no
 * `FORA_DO_CENSO` pelo mesmo motivo do `receberNaTx`: a autorização é a da arrecadação, na
 * borda; esta perna é parte do mesmo fato.
 *
 * ⚠️ SOMA-DECIDE-GRAVA, com LOCK. Trava CADA reconhecimento (posto 8, antes da dívida ativa),
 * lê o saldo DENTRO da trava, e recusa se `Σ baixas > saldo`. Sem o lock, duas guias
 * concorrentes leriam o mesmo saldo e as duas baixariam — o crédito a receber ficaria negativo.
 */
export async function vincularReconhecimentoNaTx(
  tx: Tx,
  arrecadacaoId: string,
  vinculos: readonly VinculoDeReconhecimento[]
): Promise<readonly string[]> {
  if (vinculos.length === 0) return [];

  // Agrupa por reconhecimento (uma guia pode citar o mesmo duas vezes? não — a unicidade do
  // banco `(arrecadacao, reconhecimento)` recusa; mas somamos por segurança do guard).
  const porReconhecimento = new Map<string, Money>();
  for (const v of vinculos) {
    const atual = porReconhecimento.get(v.reconhecimentoId) ?? toMoney("0.00");
    porReconhecimento.set(
      v.reconhecimentoId,
      toMoney(atual.plus(toMoney(v.valor)))
    );
  }

  // ⚠️ LOCK NA ORDEM: os ids ORDENADOS, para que duas guias que toquem os mesmos
  // reconhecimentos os travem na MESMA ordem (senão, deadlock). O `packages/locks` cobra a
  // ordem ENTRE recursos; DENTRO de um recurso, ordenar os ids é por nossa conta.
  const ids = [...porReconhecimento.keys()].sort();
  await travar(tx, "ReceitaReconhecida", ids);

  const criados: string[] = [];
  for (const reconhecimentoId of ids) {
    const pedido = porReconhecimento.get(reconhecimentoId)!;
    const saldo = await saldoReconhecidoDe(tx, reconhecimentoId);

    if (pedido.greaterThan(saldo)) {
      throw new Error(
        `VÍNCULO ACIMA DO SALDO RECONHECIDO: a guia quer baixar ${pedido.toFixed(2)} do ` +
          `reconhecimento ${reconhecimentoId}, que tem saldo de apenas ${saldo.toFixed(2)}. ` +
          `Não se arrecada mais do que se reconheceu — o crédito a receber ficaria negativo. ` +
          `Nada foi gravado.`
      );
    }

    // Grava um vínculo por (arrecadacao, reconhecimento) — o valor agrupado.
    const criado = await tx.vinculoArrecadacaoReconhecimento.create({
      data: {
        arrecadacaoId,
        reconhecimentoId,
        valor: pedido.toFixed(2),
        criadoPor: "COMPOSTA",
      },
      select: { id: true },
    });
    criados.push(criado.id);
  }

  return criados;
}

// ═══════════════════════════════════════════════════════════════════════════
// estornarReconhecimento — livre se sem baixas; porta fechada se houver.
// ═══════════════════════════════════════════════════════════════════════════

export const zEstornarReconhecimentoInput = z.object({
  reconhecimentoId: z.string().min(1),
  motivo: zMotivo,
  criadoPor: z.string().min(1),
});
export type EstornarReconhecimentoInput = z.input<
  typeof zEstornarReconhecimentoInput
>;

/**
 * ESTORNA um reconhecimento — o crédito que NUNCA DEVERIA TER EXISTIDO (erro de lançamento).
 *
 * ⚠️ PORTA FECHADA SE HOUVER BAIXA. Um reconhecimento já arrecadado, inscrito ou cancelado tem
 * FILHOS — e estorná-lo deixaria a arrecadação apontando para um crédito que "nunca existiu", a
 * dívida ativa sem lastro, o cancelamento órfão. Desfaz-se pelas PONTAS: anula a arrecadação,
 * estorna a inscrição, e SÓ ENTÃO o reconhecimento fica livre. É o precedente do recebimento de
 * dívida ativa (não se anula a receita sob um movimento vivo).
 *
 * ⚠️ E ESTORNAR NÃO É CANCELAR. Aqui o fato se NEGA (era erro): inverte-se o lançamento, a VPA
 * volta atrás, não houve perda. Cancelar (renúncia/prescrição) é OUTRO ato, com VPD — ver
 * `cancelarReconhecimento`.
 */
export async function estornarReconhecimento(
  prisma: PrismaClient,
  input: EstornarReconhecimentoInput
): Promise<{ readonly estornoId: string; readonly lancamentoId: string }> {
  const d = zEstornarReconhecimentoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.estornarReconhecimento, "ENTE");

    await travar(tx, "ReceitaReconhecida", [d.reconhecimentoId]);

    const original = await tx.receitaReconhecida.findUnique({
      where: { id: d.reconhecimentoId },
      select: {
        id: true,
        naturezaCodigo: true,
        fonteId: true,
        dataFatoGerador: true,
        valor: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        vinculos: {
          select: {
            arrecadacao: {
              select: { estornoDeId: true, estornos: { select: { id: true } } },
            },
          },
        },
        inscricoes: { select: { id: true } },
        cancelamentos: { select: { id: true } },
        lancamento: {
          select: {
            partidas: {
              select: {
                contaId: true,
                tipo: true,
                subsistema: true,
                valor: true,
              },
            },
          },
        },
      },
    });
    if (original === null) {
      throw new Error(`Reconhecimento ${d.reconhecimentoId} não existe.`);
    }
    if (original.estornoDeId !== null) {
      throw new Error(
        `Reconhecimento ${d.reconhecimentoId} JÁ É um estorno — não se estorna um estorno.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(`Reconhecimento ${d.reconhecimentoId} já foi estornado.`);
    }

    // ⚠️ AS BAIXAS VIVAS FECHAM A PORTA.
    const vinculosVivos = original.vinculos.filter(
      (v) =>
        v.arrecadacao.estornoDeId === null && v.arrecadacao.estornos.length === 0
    );
    if (
      vinculosVivos.length > 0 ||
      original.inscricoes.length > 0 ||
      original.cancelamentos.length > 0
    ) {
      throw new Error(
        `RECONHECIMENTO COM BAIXA NÃO SE ESTORNA DIRETO (${d.reconhecimentoId}): ele tem ` +
          `${vinculosVivos.length} arrecadação(ões) viva(s), ${original.inscricoes.length} ` +
          `inscrição(ões) e ${original.cancelamentos.length} cancelamento(s). Estorná-lo ` +
          `deixaria esses fatos apontando para um crédito que "nunca existiu". Desfaça pelas ` +
          `PONTAS: anule a arrecadação, estorne a inscrição — e só então o reconhecimento fica ` +
          `livre. Nada foi gravado.`
      );
    }

    // O estorno INVERTE o lançamento do reconhecimento (C crédito a receber × D VPA).
    const estornoLancId = randomUUID();
    await lancarNoRazao(tx, {
      id: estornoLancId,
      numeroControle: `REC-EST-${original.naturezaCodigo}`,
      dataTransacao: new Date(),
      historico: `ESTORNO do reconhecimento ${d.reconhecimentoId}: ${d.motivo}`,
      origemTipo: "RECONHECIMENTO_ESTORNADO",
      criadoPor: d.criadoPor,
      partidas: original.lancamento.partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const),
        subsistema: p.subsistema,
        valor: p.valor.toFixed(2),
      })),
    });

    const estorno = await tx.receitaReconhecida.create({
      data: {
        naturezaCodigo: original.naturezaCodigo,
        fonteId: original.fonteId,
        dataFatoGerador: original.dataFatoGerador,
        valor: original.valor.toFixed(2),
        historico: `ESTORNO: ${d.motivo}`,
        motivo: d.motivo,
        estornoDeId: original.id,
        lancamentoId: estornoLancId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return { estornoId: estorno.id, lancamentoId: estornoLancId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// cancelarReconhecimento — a renúncia/prescrição. VPD, NÃO estorno.
// ═══════════════════════════════════════════════════════════════════════════

export const zCancelarReconhecimentoInput = z.object({
  reconhecimentoId: z.string().min(1),
  valor: zValorPositivo,
  motivo: zMotivo,
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type CancelarReconhecimentoInput = z.input<
  typeof zCancelarReconhecimentoInput
>;

/**
 * CANCELA (total ou parcialmente) — o crédito que EXISTIU e MORREU. D VPD × C crédito a receber.
 *
 * ⚠️ ISTO NÃO É ESTORNO, e a diferença é o número que o TCE procura. O crédito foi reconhecido
 * com razão (a VPA de janeiro é verdadeira e FICA); o que se perdeu depois — anistia, remissão,
 * prescrição — é uma VARIAÇÃO DIMINUTIVA. Estornar apagaria a renúncia da história; cancelar por
 * VPD a REVELA. É o precedente da REVERSAO de provisão (reverter não é estornar).
 *
 * Guard: Σ cancelado <= saldo (não se cancela o que já foi arrecadado ou inscrito).
 */
export async function cancelarReconhecimento(
  prisma: PrismaClient,
  input: CancelarReconhecimentoInput
): Promise<{ readonly cancelamentoId: string; readonly lancamentoId: string }> {
  const d = zCancelarReconhecimentoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.cancelarReconhecimento, "ENTE");

    await travar(tx, "ReceitaReconhecida", [d.reconhecimentoId]);

    const rec = await tx.receitaReconhecida.findUnique({
      where: { id: d.reconhecimentoId },
      select: { id: true, naturezaCodigo: true },
    });
    if (rec === null) {
      throw new Error(`Reconhecimento ${d.reconhecimentoId} não existe.`);
    }

    const roteiro = await exigirRoteiro(tx, rec.naturezaCodigo);
    if (roteiro.contaVpdId === null) {
      throw new Error(
        `A origem da natureza ${rec.naturezaCodigo} NÃO tem conta de VPD cadastrada no ` +
          `RoteiroReconhecimento — e cancelar exige uma (D VPD × C crédito a receber). ` +
          `Cadastre a conta de VPD da origem, ou reveja se este crédito não seria caso de ` +
          `ESTORNO (erro) em vez de cancelamento (renúncia). Nada foi gravado.`
      );
    }

    const saldo = await saldoReconhecidoDe(tx, d.reconhecimentoId);
    if (d.valor.greaterThan(saldo)) {
      throw new Error(
        `CANCELAMENTO ACIMA DO SALDO: quer cancelar ${d.valor.toFixed(2)} do reconhecimento ` +
          `${d.reconhecimentoId}, que tem saldo de ${saldo.toFixed(2)}. Não se cancela o que ` +
          `já foi arrecadado ou inscrito. Nada foi gravado.`
      );
    }

    const lancamentoId = randomUUID();
    await lancarNoRazao(tx, {
      id: lancamentoId,
      numeroControle: `REC-CANC-${rec.naturezaCodigo}`,
      dataTransacao: d.data,
      historico: `CANCELAMENTO (VPD) do reconhecimento ${d.reconhecimentoId}: ${d.motivo}`,
      origemTipo: "RECONHECIMENTO_CANCELADO",
      criadoPor: d.criadoPor,
      partidas: [
        {
          contaId: roteiro.contaVpdId,
          tipo: "DEBITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
        {
          contaId: roteiro.contaCreditoAReceberId,
          tipo: "CREDITO",
          subsistema: "PATRIMONIAL",
          valor: d.valor.toFixed(2),
        },
      ],
    });

    const canc = await tx.cancelamentoDeReconhecimento.create({
      data: {
        reconhecimentoId: d.reconhecimentoId,
        valor: d.valor.toFixed(2),
        motivo: d.motivo,
        lancamentoId,
        criadoPor: d.criadoPor,
      },
      select: { id: true },
    });

    return { cancelamentoId: canc.id, lancamentoId };
  });
}
