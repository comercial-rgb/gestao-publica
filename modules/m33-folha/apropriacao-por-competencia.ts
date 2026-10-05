import { z } from "zod";
import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import { janelaCivilDoAno, janelaCivilDoMes } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somasPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { roteiroPatrimonialVigente } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { parametroVigenteDoExercicio } from "./decimo-terceiro-servico.js";

/**
 * V35 — A APROPRIAÇÃO MENSAL DO 13º E DAS FÉRIAS POR COMPETÊNCIA (MCASP 11ª ed., Parte II, item 18).
 * Ver `prisma/schema/m33-apropriacao-por-competencia.prisma`.
 *
 * ═══ A REGRA ═══
 * Para a competência C, sobre as folhas MENSAL e MENSAL_COMPLEMENTAR de C já FECHADAS:
 *   base do vínculo = Σ linhas do contracheque fechado cujas rubricas são as da BASE DO 13º vigente do exercício
 *   13º do vínculo   = base / avosNoExercicio                     (o parâmetro do 13º — nunca um 12 no código)
 *   férias do vínculo = base / meses × (incluiRemuneracao ? 1 : 0) + base / meses × abono
 *                                                                  (o parâmetro de férias declarado pelo ente)
 * Um lançamento por tipo, pelo roteiro declarado APROPRIACAO_PESSOAL (D VPD / C pessoal a pagar), datado no
 * último instante do mês civil de C — o funil do razão confere a competência travada.
 *
 * ═══ A BAIXA E O ACERTO ═══
 * A liquidação da folha que PAGA o 13º (ou o abono) baixa o passivo apropriado: o grupo de empenho dessa folha
 * declara como conta debitada a conta do passivo apropriado (classe 2) e como creditada a obrigação a pagar —
 * o roteiro da liquidação da folha já lança o que o grupo declara. No fim do exercício o MCASP manda não restar
 * saldo do 13º apropriado: `acertarDecimoTerceiro` lança a diferença (para mais ou para menos), e RECUSA se o
 * passivo não recebeu baixa nenhuma no exercício — sem isso o acerto estornaria o ano inteiro e esconderia uma
 * liquidação mal configurada.
 *
 * Fail-closed: folha mensal da competência não fechada, complementar aberta, parâmetro ausente ou roteiro não
 * declarado recusam sem gravar nada. Idempotência: uma apropriação por competência e tipo (único no banco).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

// ═══════════════════════════════════════════════════════════════════════════
// O PARÂMETRO DAS FÉRIAS
// ═══════════════════════════════════════════════════════════════════════════

export const zDeclararParametroDeFerias = z
  .object({
    exercicio: z.number().int().min(2000).max(2100),
    mesesDoPeriodoAquisitivo: z.number().int().min(1).max(24),
    abonoNumerador: z.number().int().min(0),
    abonoDenominador: z.number().int().min(1),
    incluiRemuneracaoDoPeriodo: z.boolean(),
    fundamento: z.string().trim().min(20, "Cite o ato do ente (estatuto, lei) e o dispositivo constitucional."),
    criadoPor: z.string().min(1),
  })
  .refine((d) => d.abonoNumerador <= d.abonoDenominador, { message: "O abono não passa de uma remuneração inteira.", path: ["abonoNumerador"] });

export async function declararParametroDeFerias(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararParametroDeFerias>
): Promise<{ readonly versao: number }> {
  const d = zDeclararParametroDeFerias.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararParametroDeFerias, "ENTE");
    const vigente = await tx.parametroDaApropriacaoDeFerias.findFirst({ where: { exercicio: d.exercicio }, orderBy: { versao: "desc" }, select: { versao: true } });
    const r = await tx.parametroDaApropriacaoDeFerias.create({
      data: {
        exercicio: d.exercicio, versao: (vigente?.versao ?? 0) + 1, mesesDoPeriodoAquisitivo: d.mesesDoPeriodoAquisitivo,
        abonoNumerador: d.abonoNumerador, abonoDenominador: d.abonoDenominador, incluiRemuneracaoDoPeriodo: d.incluiRemuneracaoDoPeriodo,
        fundamento: d.fundamento, criadoPor: d.criadoPor,
      },
      select: { versao: true },
    });
    return { versao: r.versao };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A APROPRIAÇÃO DA COMPETÊNCIA
// ═══════════════════════════════════════════════════════════════════════════

export const zApropriarPorCompetencia = z.object({
  competencia: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Competência no formato AAAA-MM."),
  criadoPor: z.string().min(1),
});

export interface ResultadoDaApropriacao {
  readonly competencia: string;
  readonly decimoTerceiro: Dinheiro;
  readonly ferias: Dinheiro;
  readonly vinculos: number;
}

interface BaseDoVinculo {
  readonly vinculoId: string;
  readonly base: Money;
}

/** A base de cada vínculo nas folhas fechadas da competência, pelas rubricas da base do 13º. Recusa a folha aberta. */
async function basesDaCompetencia(tx: Tx, competencia: string, rubricasDaBase: ReadonlySet<string>): Promise<readonly BaseDoVinculo[]> {
  const folhas = await tx.folhaDePagamento.findMany({
    where: { competencia, tipo: { in: ["MENSAL", "MENSAL_COMPLEMENTAR"] } },
    select: { id: true, tipo: true, fechamento: { select: { calculoId: true } } },
  });
  if (!folhas.some((f) => f.tipo === "MENSAL" && f.fechamento !== null)) {
    throw new Error(`A folha mensal de ${competencia} não está fechada. A apropriação lê a folha fechada, e só ela. Nada foi gravado.`);
  }
  const abertas = folhas.filter((f) => f.fechamento === null);
  if (abertas.length > 0) {
    throw new Error(`Há folha de ${competencia} ainda aberta (${abertas.map((f) => f.tipo).join(", ")}): a base mudaria depois de apropriada. Feche-a primeiro. Nada foi gravado.`);
  }
  const linhas = await tx.linhaDoContracheque.findMany({
    where: { contracheque: { calculoId: { in: folhas.map((f) => f.fechamento!.calculoId) } }, rubricaId: { in: [...rubricasDaBase] } },
    select: { valor: true, contracheque: { select: { vinculoId: true } } },
  });
  const porVinculo = new Map<string, Money>();
  for (const l of linhas) {
    const v = l.contracheque.vinculoId;
    porVinculo.set(v, toMoney((porVinculo.get(v) ?? toMoney("0.00")).plus(l.valor.toFixed(2))));
  }
  return [...porVinculo.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([vinculoId, base]) => ({ vinculoId, base }));
}

export async function apropriarPorCompetencia(
  prisma: PrismaClient,
  input: z.input<typeof zApropriarPorCompetencia>
): Promise<ResultadoDaApropriacao> {
  const d = zApropriarPorCompetencia.parse(input);
  const exercicio = Number(d.competencia.slice(0, 4));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apropriarPorCompetencia, "ENTE");

    // ── pré-condições, todas antes de qualquer escrita ──
    const ja = await tx.apropriacaoPorCompetencia.findMany({ where: { competencia: d.competencia }, select: { tipo: true } });
    if (ja.length > 0) throw new Error(`A competência ${d.competencia} já foi apropriada (${ja.map((j) => j.tipo).join(", ")}). Nada foi gravado.`);
    const p13 = await parametroVigenteDoExercicio(tx, exercicio);
    const pf = await tx.parametroDaApropriacaoDeFerias.findFirst({ where: { exercicio }, orderBy: { versao: "desc" } });
    if (pf === null) {
      throw new Error(`Não há parâmetro de férias declarado para ${String(exercicio)} (meses do período aquisitivo, abono constitucional e inclusão da remuneração do período). Nada foi gravado.`);
    }
    const r13 = await roteiroPatrimonialVigente(tx, "APROPRIACAO_PESSOAL", "APROPRIACAO/DECIMO_TERCEIRO");
    const rFe = await roteiroPatrimonialVigente(tx, "APROPRIACAO_PESSOAL", "APROPRIACAO/FERIAS");
    if (r13 === null || rFe === null) {
      throw new Error("O roteiro da apropriação do 13º e das férias não está declarado. Declare-o em Contabilidade, Roteiros patrimoniais. Nada foi gravado.");
    }
    const bases = await basesDaCompetencia(tx, d.competencia, new Set(p13.rubricasDaBase));

    // ── a conta, por vínculo ──
    const itens = bases.map((b) => ({
      vinculoId: b.vinculoId,
      base: b.base,
      decimo: toMoney(b.base.dividedBy(p13.parametro.avosNoExercicio)),
      // a fração das férias como razão de inteiros, sem float: base × (inclui·den + num) / (meses·den)
      ferias: toMoney(
        b.base
          .times((pf.incluiRemuneracaoDoPeriodo ? pf.abonoDenominador : 0) + pf.abonoNumerador)
          .dividedBy(pf.mesesDoPeriodoAquisitivo * pf.abonoDenominador)
      ),
    }));
    const soma = (k: "decimo" | "ferias") => itens.reduce((a, i) => toMoney(a.plus(i[k])), toMoney("0.00"));
    const total13 = soma("decimo");
    const totalFe = soma("ferias");
    const fim = janelaCivilDoMes(d.competencia).fim;

    const gravar = async (tipo: "DECIMO_TERCEIRO" | "FERIAS", total: Money, r: NonNullable<typeof r13>, chave: "decimo" | "ferias") => {
      let lancamentoId: string | null = null;
      if (!total.isZero()) {
        lancamentoId = await lancarNoRazao(tx, {
          numeroControle: `APC-${tipo === "DECIMO_TERCEIRO" ? "13" : "FE"}-${d.competencia}`,
          dataTransacao: fim,
          historico: `${r.historicoPadrao} — competência ${d.competencia.split("-").reverse().join("/")}`,
          origemTipo: "APROPRIACAO_POR_COMPETENCIA",
          criadoPor: d.criadoPor,
          partidas: [
            { contaId: r.contaDebito.id, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: total.toFixed(2) },
            { contaId: r.contaCredito.id, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: total.toFixed(2) },
          ],
        });
      }
      await tx.apropriacaoPorCompetencia.create({
        data: {
          competencia: d.competencia, exercicio, tipo, total: total.toFixed(2), parametroDoDecimoTerceiroId: p13.parametro.id,
          parametroDeFeriasId: tipo === "FERIAS" ? pf.id : null, lancamentoId, criadoPor: d.criadoPor,
          itens: { create: itens.map((i) => ({ vinculoId: i.vinculoId, base: i.base.toFixed(2), valor: i[chave].toFixed(2) })) },
        },
      });
    };
    await gravar("DECIMO_TERCEIRO", total13, r13, "decimo");
    await gravar("FERIAS", totalFe, rFe, "ferias");
    return { competencia: d.competencia, decimoTerceiro: serializar(total13), ferias: serializar(totalFe), vinculos: itens.length };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// O ACERTO DO 13º NO FIM DO EXERCÍCIO
// ═══════════════════════════════════════════════════════════════════════════

export const zAcertarDecimoTerceiro = z.object({ exercicio: z.number().int().min(2000).max(2100), criadoPor: z.string().min(1) });

export async function acertarDecimoTerceiro(
  prisma: PrismaClient,
  input: z.input<typeof zAcertarDecimoTerceiro>
): Promise<{ readonly saldoAntes: Dinheiro; readonly lancamentoId: string | null }> {
  const d = zAcertarDecimoTerceiro.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.acertarDecimoTerceiro, "ENTE");
    if ((await tx.acertoDoDecimoTerceiro.findUnique({ where: { exercicio: d.exercicio }, select: { id: true } })) !== null) {
      throw new Error(`O 13º apropriado de ${String(d.exercicio)} já foi acertado. Nada foi gravado.`);
    }
    const folha13 = await tx.folhaDePagamento.findFirst({ where: { exercicio: d.exercicio, tipo: "DECIMO_TERCEIRO" }, select: { fechamento: { select: { id: true } } } });
    if (folha13?.fechamento == null) {
      throw new Error(`A folha do 13º de ${String(d.exercicio)} não está fechada: o acerto só vem depois do pagamento. Nada foi gravado.`);
    }
    const r = await roteiroPatrimonialVigente(tx, "APROPRIACAO_PESSOAL", "APROPRIACAO/DECIMO_TERCEIRO");
    if (r === null) throw new Error("O roteiro da apropriação do 13º não está declarado. Nada foi gravado.");
    const passivo = await tx.contaPcasp.findUniqueOrThrow({ where: { id: r.contaCredito.id }, select: { codigo: true } });
    const { inicio, fim } = janelaCivilDoAno(d.exercicio);
    const noAno = (await somasPorConta(tx, { codigos: [passivo.codigo], desde: inicio, ate: fim, campoData: "dataTransacao" }))[0];
    if (noAno === undefined || noAno.debito.isZero()) {
      throw new Error(
        `O passivo do 13º apropriado (${passivo.codigo}) não recebeu baixa nenhuma em ${String(d.exercicio)}: a liquidação da folha do 13º ` +
          "não está debitando o passivo apropriado. Confira a conta debitada do grupo de empenho dessa folha; acertar agora estornaria o ano inteiro. Nada foi gravado."
      );
    }
    const ate = (await somasPorConta(tx, { codigos: [passivo.codigo], ate: fim, campoData: "dataTransacao" }))[0]!;
    const saldo = toMoney(ate.credito.minus(ate.debito));
    let lancamentoId: string | null = null;
    if (!saldo.isZero()) {
      // sobrou passivo (apropriado a mais): D passivo / C VPD; faltou: D VPD / C passivo — o roteiro, num sentido ou no outro.
      const [debito, credito] = saldo.greaterThan(0) ? [r.contaCredito.id, r.contaDebito.id] : [r.contaDebito.id, r.contaCredito.id];
      const valor = toMoney(saldo.abs()).toFixed(2);
      lancamentoId = await lancarNoRazao(tx, {
        numeroControle: `APC-13-ACERTO-${String(d.exercicio)}`,
        dataTransacao: fim,
        historico: `Acerto do 13º apropriado de ${String(d.exercicio)}: ${saldo.greaterThan(0) ? "apropriado a mais" : "apropriado a menos"} que o pago`,
        origemTipo: "ACERTO_DO_DECIMO_TERCEIRO",
        criadoPor: d.criadoPor,
        partidas: [
          { contaId: debito, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
          { contaId: credito, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
        ],
      });
    }
    await tx.acertoDoDecimoTerceiro.create({ data: { exercicio: d.exercicio, saldoAntes: saldo.toFixed(2), lancamentoId, criadoPor: d.criadoPor } });
    return { saldoAntes: serializar(saldo), lancamentoId };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// A LEITURA
// ═══════════════════════════════════════════════════════════════════════════

export interface ApropriacaoNaLista {
  readonly competencia: string;
  readonly tipo: "DECIMO_TERCEIRO" | "FERIAS";
  readonly total: Dinheiro;
  readonly vinculos: number;
  readonly lancou: boolean;
}

export async function apropriacoesDoExercicio(prisma: Tx, exercicio: number): Promise<readonly ApropriacaoNaLista[]> {
  const linhas = await prisma.apropriacaoPorCompetencia.findMany({
    where: { exercicio },
    orderBy: [{ competencia: "desc" }, { tipo: "asc" }],
    select: { competencia: true, tipo: true, total: true, lancamentoId: true, _count: { select: { itens: true } } },
  });
  return linhas.map((l) => ({ competencia: l.competencia, tipo: l.tipo, total: l.total.toFixed(2), vinculos: l._count.itens, lancou: l.lancamentoId !== null }));
}
