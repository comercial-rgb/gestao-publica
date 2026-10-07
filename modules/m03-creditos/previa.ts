import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { anoCivil, diaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { liberarReservaNaTransacao, reservarNaTransacao, travarFichas, type Tx } from "../m05-despesa/adapter-prisma.js";
import { exigirExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { travar } from "../../packages/locks/index.js";
import { criarDecretoNaTransacao } from "./adapter-prisma.js";
import { ehRecursoNovo, validarBalanceamento, type OrigemRecurso } from "./dominio.js";
import type { M03Deps } from "./ports.js";

/**
 * M03 — A PRÉVIA DA ALTERAÇÃO ORÇAMENTÁRIA DA DESPESA (TR 5.9.3.23 e 5.9.3.24). Ver `prisma/schema/m03-previas.prisma`.
 *
 * O ciclo: CRIAR (com o primeiro lote) → ACRESCENTAR LOTES → APROVAR → EFETIVAR (ou DESCARTAR em qualquer ponto antes).
 *
 * ═══ O BLOQUEIO ═══
 * Cada anulação reserva o valor na ficha a anular, na transação da prévia (`reservarNaTransacao`, M05 — a mesma reserva
 * de dotação, com saldo conferido sob a trava da ficha e o lançamento D disponível / C reservado). A reserva de bloqueio
 * não serve a empenho e não se libera pela tela de reservas (M05 recusa nomeando a prévia).
 *
 * ═══ A EFETIVAÇÃO, SEM REDIGITAR ═══
 * O decreto nasce dos itens da prévia, pelo MESMO `executarCredito` do decreto digitado (teto da lei, limite da LOA,
 * balanceamento por fonte, disponível da ficha, recurso novo contra os fatos, lançamentos). Dentro da transação dele, antes
 * de ler o decreto, o `preparar` desfaz os bloqueios, cria o decreto e grava o desfecho: se qualquer guarda do crédito
 * recusar, nada disso fica — os bloqueios continuam, a prévia continua aprovada.
 *
 * ═══ AS CORRIDAS ═══
 * Efetivar × descartar: o desfecho é um por prévia (chave única). Acrescentar × aprovar: a aprovação guarda quantos itens
 * e quanto de suplementação aprovou, e a efetivação recusa se a prévia mudou depois.
 */

const ROTULO_DO_TIPO: Record<"SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO", string> = {
  SUPLEMENTAR: "suplementar",
  ESPECIAL: "especial",
  EXTRAORDINARIO: "extraordinário",
};

const zItemDaPrevia = z.object({
  fichaId: z.string().min(1, "Escolha a ficha"),
  tipo: z.enum(["SUPLEMENTACAO", "ANULACAO"]),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "O valor do movimento tem de ser maior que zero" }),
});
export type ItemDaPreviaInput = z.input<typeof zItemDaPrevia>;

export const zCriarPreviaInput = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  tipoCredito: z.enum(["SUPLEMENTAR", "ESPECIAL", "EXTRAORDINARIO"]),
  origemRecurso: z.enum(["ANULACAO", "SUPERAVIT_FINANCEIRO", "EXCESSO_ARRECADACAO", "OPERACAO_CREDITO"]),
  descricao: z.string().trim().min(10, "Descreva o objeto da alteração (ao menos 10 caracteres)"),
  itens: z.array(zItemDaPrevia).min(1, "Informe ao menos um movimento"),
  criadoPor: z.string().min(1),
});
export type CriarPreviaInput = z.input<typeof zCriarPreviaInput>;

const zAcrescentarLoteInput = z.object({
  previaId: z.string().min(1),
  itens: z.array(zItemDaPrevia).min(1, "Informe ao menos um movimento"),
  criadoPor: z.string().min(1),
});
export type AcrescentarLoteInput = z.input<typeof zAcrescentarLoteInput>;

const zAprovarPreviaInput = z.object({
  previaId: z.string().min(1),
  data: z.coerce.date(),
  parecer: z.string().trim().optional(),
  criadoPor: z.string().min(1),
});
export type AprovarPreviaInput = z.input<typeof zAprovarPreviaInput>;

const zDescartarPreviaInput = z.object({
  previaId: z.string().min(1),
  motivo: z.string().trim().min(5, "Informe o motivo do descarte (ao menos 5 caracteres)"),
  criadoPor: z.string().min(1),
});
export type DescartarPreviaInput = z.input<typeof zDescartarPreviaInput>;

const zEfetivarPreviaInput = z.object({
  previaId: z.string().min(1),
  leiId: z.string().min(1, "Escolha a lei que autoriza o crédito"),
  numeroDecreto: z.string().trim().min(1, "Informe o número do decreto"),
  data: z.coerce.date(),
  criadoPor: z.string().min(1),
});
export type EfetivarPreviaInput = z.input<typeof zEfetivarPreviaInput>;

function ler<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new Error(`${r.error.issues.map((i) => i.message).join(" ")} Nada foi gravado.`);
  return r.data;
}

const eUnicidade = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

const rotulo = (p: { readonly numero: number; readonly exercicio: number }): string => `nº ${String(p.numero)}/${String(p.exercicio)}`;

function exigirSemAnulacaoNoRecursoNovo(origem: OrigemRecurso, itens: readonly { readonly tipo: string }[]): void {
  if (ehRecursoNovo(origem) && itens.some((i) => i.tipo === "ANULACAO")) {
    throw new Error("Esta prévia tem origem em recurso novo: o valor não sai de outra ficha, e por isso ela não tem anulação. Nada foi gravado.");
  }
}

/**
 * A TRAVA DA PRÉVIA, pela fila de travas do repositório (posto `PreviaDeAlteracao`, antes da ficha). Toda operação sobre
 * uma prévia existente começa por ela, ANTES de travar fichas — acrescentar, aprovar, descartar e efetivar se enfileiram,
 * e a que vem depois lê o que a anterior gravou. Sem ela, um lote com anulação confirmado depois de um descarte deixaria o
 * bloqueio preso para sempre. (Não é `FOR UPDATE`: travar linha exige privilégio de UPDATE, que o papel de runtime não
 * tem nesta tabela insert-only.)
 */
async function travarPrevia(tx: Tx, previaId: string): Promise<void> {
  await travar(tx, "PreviaDeAlteracao", [previaId]);
}

/** Fichas existentes e do exercício da prévia. Devolve o número de cada uma para as mensagens. */
async function exigirFichasDoExercicio(tx: Tx, fichaIds: readonly string[], exercicio: number): Promise<ReadonlyMap<string, number>> {
  const fichas = await tx.fichaOrcamentaria.findMany({ where: { id: { in: [...new Set(fichaIds)] } }, select: { id: true, numero: true, exercicio: true } });
  const ausentes = [...new Set(fichaIds)].filter((id) => !fichas.some((f) => f.id === id));
  if (ausentes.length > 0) throw new Error(`Ficha inexistente na prévia. Nada foi gravado.`);
  const deOutro = fichas.filter((f) => f.exercicio !== exercicio);
  if (deOutro.length > 0) throw new Error(`A ficha ${deOutro.map((f) => f.numero).join(", ")} não é do exercício ${String(exercicio)} da prévia. Nada foi gravado.`);
  return new Map(fichas.map((f) => [f.id, f.numero]));
}

/** Grava os itens de um lote; a anulação nasce com o bloqueio (reserva) na ficha a anular. */
async function gravarItens(
  tx: Tx,
  previa: { readonly id: string; readonly numero: number; readonly exercicio: number },
  lote: number,
  itens: readonly { readonly fichaId: string; readonly tipo: "SUPLEMENTACAO" | "ANULACAO"; readonly valor: Money }[],
  criadoPor: string
): Promise<void> {
  // Todas as fichas do lote de uma vez, na ordem do id: travadas uma a uma na ordem da entrada, duas prévias com as
  // mesmas fichas em ordens diferentes se abraçariam.
  await travarFichas(tx, itens.map((i) => i.fichaId));
  for (const i of itens) {
    let reservaId: string | null = null;
    if (i.tipo === "ANULACAO") {
      reservaId = await reservarNaTransacao(tx, {
        reservaId: randomUUID(),
        fichaId: i.fichaId,
        valor: i.valor,
        historico: `Bloqueio da anulação prevista na prévia de alteração orçamentária ${rotulo(previa)}`,
        criadoPor,
      }, { bloqueioDePrevia: true });
    }
    await tx.itemDaPrevia.create({ data: { previaId: previa.id, lote, fichaId: i.fichaId, tipo: i.tipo, valor: i.valor.toFixed(2), reservaId, criadoPor } });
  }
}

/** Cria a prévia com o primeiro lote. As anulações ficam bloqueadas nas fichas. */
export async function criarPrevia(prisma: PrismaClient, input: CriarPreviaInput): Promise<{ readonly previaId: string; readonly numero: number }> {
  const d = ler(zCriarPreviaInput, input);
  exigirSemAnulacaoNoRecursoNovo(d.origemRecurso, d.itens);
  try {
    return await prisma.$transaction(async (tx) => {
      // O bloqueio mexe no disponível de cada ficha: a autoridade de quem prepara o decreto, em todas as unidades.
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.criarPrevia, { fichas: d.itens.map((i) => i.fichaId) });
      await exigirExercicioAberto(tx, d.exercicio, "prévia de alteração orçamentária");
      await exigirFichasDoExercicio(tx, d.itens.map((i) => i.fichaId), d.exercicio);
      const ultima = await tx.previaDeAlteracao.aggregate({ where: { exercicio: d.exercicio }, _max: { numero: true } });
      const numero = (ultima._max.numero ?? 0) + 1;
      const previa = await tx.previaDeAlteracao.create({
        data: { exercicio: d.exercicio, numero, tipoCredito: d.tipoCredito, origemRecurso: d.origemRecurso, descricao: d.descricao, criadoPor: d.criadoPor },
        select: { id: true, numero: true, exercicio: true },
      });
      await gravarItens(tx, previa, 1, d.itens, d.criadoPor);
      return { previaId: previa.id, numero };
    });
  } catch (e) {
    if (eUnicidade(e)) throw new Error("Outra prévia do exercício foi registrada ao mesmo tempo e tomou o número. Nada foi gravado; registre de novo.", { cause: e });
    throw e;
  }
}

/** Situação derivada: só os fatos dizem em que pé a prévia está. */
type Estado = { readonly aprovacao: { readonly id: string } | null; readonly desfecho: { readonly tipo: string } | null };
function exigirEmElaboracao(p: Estado & { readonly numero: number; readonly exercicio: number }, ato: string): void {
  if (p.desfecho !== null) throw new Error(`A prévia ${rotulo(p)} já foi ${p.desfecho.tipo === "EFETIVADA" ? "efetivada" : "descartada"}: não aceita ${ato}. Nada foi gravado.`);
  if (p.aprovacao !== null) throw new Error(`A prévia ${rotulo(p)} já foi aprovada: não aceita ${ato}. Descarte-a e registre outra. Nada foi gravado.`);
}

/** Acrescenta um lote de movimentos à prévia em elaboração. */
export async function acrescentarLoteAPrevia(prisma: PrismaClient, input: AcrescentarLoteInput): Promise<{ readonly lote: number }> {
  const d = ler(zAcrescentarLoteInput, input);
  return prisma.$transaction(async (tx) => {
    await travarPrevia(tx, d.previaId);
    const p = await tx.previaDeAlteracao.findUnique({
      where: { id: d.previaId },
      select: { id: true, numero: true, exercicio: true, origemRecurso: true, aprovacao: { select: { id: true } }, desfecho: { select: { tipo: true } }, itens: { select: { fichaId: true } } },
    });
    if (p === null) throw new Error("Prévia não encontrada. Nada foi gravado.");
    // A autoridade é sobre a prévia inteira (as fichas que ela já tem e as do lote), e vem antes de revelar a situação.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.acrescentarLoteAPrevia, { fichas: [...p.itens.map((i) => i.fichaId), ...d.itens.map((i) => i.fichaId)] });
    exigirEmElaboracao(p, "novo lote");
    exigirSemAnulacaoNoRecursoNovo(p.origemRecurso, d.itens);
    await exigirExercicioAberto(tx, p.exercicio, "prévia de alteração orçamentária");
    await exigirFichasDoExercicio(tx, d.itens.map((i) => i.fichaId), p.exercicio);
    const ultimo = await tx.itemDaPrevia.aggregate({ where: { previaId: p.id }, _max: { lote: true } });
    const lote = (ultimo._max.lote ?? 0) + 1;
    await gravarItens(tx, p, lote, d.itens, d.criadoPor);
    return { lote };
  });
}

interface ItemLido {
  readonly id: string;
  readonly fichaId: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  readonly valor: Money;
  readonly fonteId: string;
  readonly reservaId: string | null;
  readonly criadoEm: Date;
}

async function itensDaPrevia(tx: Tx, previaId: string): Promise<readonly ItemLido[]> {
  const itens = await tx.itemDaPrevia.findMany({
    where: { previaId },
    orderBy: [{ lote: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
    select: { id: true, fichaId: true, tipo: true, valor: true, reservaId: true, criadoEm: true, ficha: { select: { fonteId: true } } },
  });
  return itens.map((i) => ({ id: i.id, fichaId: i.fichaId, tipo: i.tipo, valor: toMoney(i.valor.toFixed(2)), fonteId: i.ficha.fonteId, reservaId: i.reservaId, criadoEm: i.criadoEm }));
}

const totalSuplementado = (itens: readonly ItemLido[]): Money =>
  itens.filter((i) => i.tipo === "SUPLEMENTACAO").reduce((t, i) => toMoney(t.plus(i.valor)), toMoney("0.00"));

/**
 * Aprova a prévia: confere o balanceamento do crédito (por anulação, Σ anulado == Σ suplementado no total e em cada
 * fonte; por recurso novo, só suplementação) e guarda o que foi aprovado.
 */
export async function aprovarPrevia(prisma: PrismaClient, input: AprovarPreviaInput): Promise<void> {
  const d = ler(zAprovarPreviaInput, input);
  if (diaCivil(d.data) > diaCivil(new Date())) throw new Error(`A data da aprovação (${diaCivil(d.data)}) é futura. Nada foi gravado.`);
  try {
    await prisma.$transaction(async (tx) => {
      await travarPrevia(tx, d.previaId);
      const p = await tx.previaDeAlteracao.findUnique({
        where: { id: d.previaId },
        select: { id: true, numero: true, exercicio: true, origemRecurso: true, aprovacao: { select: { id: true } }, desfecho: { select: { tipo: true } } },
      });
      if (p === null) throw new Error("Prévia não encontrada. Nada foi gravado.");
      const itens = await itensDaPrevia(tx, p.id);
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.aprovarPrevia, { fichas: itens.map((i) => i.fichaId) });
      exigirEmElaboracao(p, "outra aprovação");
      // Não antes do último lote: o bloqueio de uma anulação nasce no dia em que ela entra, e o que se aprova inclui ela.
      const ultimo = itens.reduce((m, i) => (diaCivil(i.criadoEm) > m ? diaCivil(i.criadoEm) : m), "");
      if (diaCivil(d.data) < ultimo) throw new Error(`A data da aprovação (${diaCivil(d.data)}) é anterior ao último movimento da prévia (${ultimo}). Nada foi gravado.`);
      try {
        validarBalanceamento(p.origemRecurso, itens.map((i) => ({ fichaId: i.fichaId, tipo: i.tipo, valor: i.valor, fonteId: i.fonteId })));
      } catch (e) {
        throw new Error(`A prévia ${rotulo(p)} não pode ser aprovada: ${(e as Error).message} Nada foi gravado.`);
      }
      await tx.aprovacaoDaPrevia.create({
        data: { previaId: p.id, data: d.data, parecer: d.parecer === undefined || d.parecer === "" ? null : d.parecer, quantidadeDeItens: itens.length, totalSuplementado: totalSuplementado(itens).toFixed(2), criadoPor: d.criadoPor },
      });
    });
  } catch (e) {
    if (eUnicidade(e)) throw new Error("A prévia foi aprovada por outra pessoa ao mesmo tempo. Nada foi gravado.", { cause: e });
    throw e;
  }
}

/** Desfaz os bloqueios das anulações da prévia (efetivação ou descarte). */
async function desbloquear(tx: Tx, previa: { readonly numero: number; readonly exercicio: number }, itens: readonly ItemLido[], motivo: string, criadoPor: string, data?: Date): Promise<void> {
  await travarFichas(tx, itens.filter((i) => i.reservaId !== null).map((i) => i.fichaId));
  for (const i of itens) {
    if (i.reservaId === null) continue;
    await liberarReservaNaTransacao(
      tx,
      { reservaLiberacaoId: randomUUID(), reservaOriginalId: i.reservaId, historico: `${motivo} da prévia de alteração orçamentária ${rotulo(previa)}`, criadoPor },
      data !== undefined ? { daPrevia: true, data } : { daPrevia: true }
    );
  }
}

/** Descarta a prévia (em elaboração ou aprovada): desfaz os bloqueios e registra o motivo. */
export async function descartarPrevia(prisma: PrismaClient, input: DescartarPreviaInput): Promise<void> {
  const d = ler(zDescartarPreviaInput, input);
  try {
    await prisma.$transaction(async (tx) => {
      await travarPrevia(tx, d.previaId);
      const p = await tx.previaDeAlteracao.findUnique({ where: { id: d.previaId }, select: { id: true, numero: true, exercicio: true, desfecho: { select: { tipo: true } } } });
      if (p === null) throw new Error("Prévia não encontrada. Nada foi gravado.");
      const itens = await itensDaPrevia(tx, p.id);
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.descartarPrevia, { fichas: itens.map((i) => i.fichaId) });
      if (p.desfecho !== null) throw new Error(`A prévia ${rotulo(p)} já foi ${p.desfecho.tipo === "EFETIVADA" ? "efetivada" : "descartada"}. Nada foi gravado.`);
      // O desbloqueio é movimento de dotação da ficha: exercício encerrado não recebe movimento.
      await exigirExercicioAberto(tx, p.exercicio, `descarte da prévia de alteração orçamentária ${rotulo(p)}`);
      await desbloquear(tx, p, itens, "Desbloqueio pelo descarte", d.criadoPor);
      await tx.desfechoDaPrevia.create({ data: { previaId: p.id, tipo: "DESCARTADA", motivo: d.motivo, criadoPor: d.criadoPor } });
    });
  } catch (e) {
    if (eUnicidade(e)) throw new Error("A prévia foi efetivada ou descartada por outra pessoa ao mesmo tempo. Nada foi gravado.", { cause: e });
    throw e;
  }
}

/**
 * Efetiva a prévia aprovada: o decreto nasce dela contra a lei escolhida, e o crédito é executado pelo caminho do decreto
 * digitado, numa transação só com o desbloqueio das anulações e o desfecho.
 */
export async function efetivarPrevia(prisma: PrismaClient, deps: Pick<M03Deps, "creditos">, input: EfetivarPreviaInput): Promise<{ readonly decretoId: string }> {
  const d = ler(zEfetivarPreviaInput, input);
  const p = await prisma.previaDeAlteracao.findUnique({
    where: { id: d.previaId },
    select: { id: true, numero: true, exercicio: true, tipoCredito: true, origemRecurso: true, aprovacao: { select: { quantidadeDeItens: true, totalSuplementado: true, data: true } }, desfecho: { select: { tipo: true } } },
  });
  if (p === null) throw new Error("Prévia não encontrada. Nada foi gravado.");
  const itens = await itensDaPrevia(prisma, p.id);
  // As duas autoridades do decreto digitado: executar o crédito (a ação deste serviço, nas unidades das fichas) e criar o
  // decreto (no ente). A segunda vai pelo nome da ação, e não pela chave de outro serviço do censo. Antes de revelar a
  // situação da prévia a quem não pode efetivá-la.
  await autorizarNo(prisma, d.criadoPor, ACAO_DO_SERVICO.efetivarPrevia, { fichas: itens.map((i) => i.fichaId) });
  await autorizarNo(prisma, d.criadoPor, "CRIAR_DECRETO_DE_CREDITO", "ENTE");
  if (p.desfecho !== null) throw new Error(`A prévia ${rotulo(p)} já foi ${p.desfecho.tipo === "EFETIVADA" ? "efetivada" : "descartada"}. Nada foi gravado.`);
  if (p.aprovacao === null) throw new Error(`A prévia ${rotulo(p)} ainda não foi aprovada: aprove-a antes de efetivar. Nada foi gravado.`);
  if (anoCivil(d.data) !== p.exercicio) throw new Error(`A data do decreto (${diaCivil(d.data)}) não é do exercício ${String(p.exercicio)} da prévia. Nada foi gravado.`);
  if (diaCivil(d.data) > diaCivil(new Date())) throw new Error(`A data do decreto (${diaCivil(d.data)}) é futura. Nada foi gravado.`);
  if (diaCivil(d.data) < diaCivil(p.aprovacao.data)) throw new Error(`A data do decreto (${diaCivil(d.data)}) é anterior à aprovação da prévia (${diaCivil(p.aprovacao.data)}). Nada foi gravado.`);
  const mudou = (agora: readonly ItemLido[]): boolean =>
    agora.length !== p.aprovacao!.quantidadeDeItens || !totalSuplementado(agora).equals(p.aprovacao!.totalSuplementado.toFixed(2));
  const MUDOU = `A prévia ${rotulo(p)} mudou depois de aprovada (itens ou total diferentes do aprovado): descarte-a e registre outra. Nada foi gravado.`;
  if (mudou(itens)) throw new Error(MUDOU);
  validarBalanceamento(p.origemRecurso, itens.map((i) => ({ fichaId: i.fichaId, tipo: i.tipo, valor: i.valor, fonteId: i.fonteId })));

  const decretoId = randomUUID();
  try {
    await deps.creditos.executarCredito({
      decretoId,
      itens: itens.map((i) => ({ fichaId: i.fichaId, tipo: i.tipo, valor: i.valor, fonteId: i.fonteId, itemId: randomUUID() })),
      criadoPor: d.criadoPor,
      antesDeTravar: (tx) => travarPrevia(tx, p.id),
      preparar: async (tx) => {
        // Relido sob as travas das fichas: a prévia tem de ser a mesma que foi aprovada e que foi lida acima.
        const agora = await itensDaPrevia(tx, p.id);
        const desfecho = await tx.desfechoDaPrevia.findUnique({ where: { previaId: p.id }, select: { tipo: true } });
        if (desfecho !== null) throw new Error(`A prévia ${rotulo(p)} já foi ${desfecho.tipo === "EFETIVADA" ? "efetivada" : "descartada"}. Nada foi gravado.`);
        const lidos = new Set(itens.map((i) => i.id));
        if (mudou(agora) || agora.length !== itens.length || agora.some((i) => !lidos.has(i.id))) throw new Error(MUDOU);
        const lei = await tx.leiCredito.findUnique({ where: { id: d.leiId }, select: { numero: true, ano: true, tipoCredito: true } });
        if (lei === null) throw new Error("Lei de crédito não encontrada. Nada foi gravado.");
        if (lei.tipoCredito !== p.tipoCredito) {
          throw new Error(`A lei ${lei.numero}/${String(lei.ano)} autoriza crédito ${ROTULO_DO_TIPO[lei.tipoCredito]}, e a prévia é de crédito ${ROTULO_DO_TIPO[p.tipoCredito]}. Nada foi gravado.`);
        }
        // Na data do decreto: é nela que a anulação entra, e o bloqueio não pode sobreviver a ela no mesmo período.
        await desbloquear(tx, p, agora, "Desbloqueio pela efetivação", d.criadoPor, d.data);
        await criarDecretoNaTransacao(tx, { id: decretoId, leiId: d.leiId, numero: d.numeroDecreto, ano: p.exercicio, data: d.data, origemRecurso: p.origemRecurso, criadoPor: d.criadoPor });
        await tx.desfechoDaPrevia.create({ data: { previaId: p.id, tipo: "EFETIVADA", decretoId, criadoPor: d.criadoPor } });
      },
    });
  } catch (e) {
    if (eUnicidade(e)) {
      const ja = await prisma.decretoCredito.findUnique({ where: { ano_numero: { ano: p.exercicio, numero: d.numeroDecreto } }, select: { id: true } });
      throw new Error(
        ja !== null
          ? `Já existe o decreto nº ${d.numeroDecreto}/${String(p.exercicio)}. Nada foi gravado.`
          : "A prévia foi efetivada ou descartada por outra pessoa ao mesmo tempo. Nada foi gravado.",
        { cause: e }
      );
    }
    throw e;
  }
  return { decretoId };
}

// ═══ LEITURA ═══

export type SituacaoDaPrevia = "EM_ELABORACAO" | "APROVADA" | "EFETIVADA" | "DESCARTADA";

export interface PreviaNaLista {
  readonly id: string;
  readonly numero: number;
  readonly exercicio: number;
  readonly tipoCredito: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly origemRecurso: OrigemRecurso;
  readonly descricao: string;
  readonly situacao: SituacaoDaPrevia;
  readonly suplementado: Money;
  readonly anulado: Money;
  readonly itens: number;
  readonly lotes: number;
  readonly decreto: { readonly id: string; readonly numero: string; readonly ano: number } | null;
}

type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const situacaoDe = (p: { readonly aprovacao: unknown; readonly desfecho: { readonly tipo: string } | null }): SituacaoDaPrevia =>
  p.desfecho !== null ? (p.desfecho.tipo === "EFETIVADA" ? "EFETIVADA" : "DESCARTADA") : p.aprovacao !== null ? "APROVADA" : "EM_ELABORACAO";

export async function listarPrevias(leitor: Leitor, p: { readonly exercicio: number }): Promise<readonly PreviaNaLista[]> {
  const linhas = await leitor.previaDeAlteracao.findMany({
    where: { exercicio: p.exercicio },
    orderBy: { numero: "desc" },
    select: {
      id: true, numero: true, exercicio: true, tipoCredito: true, origemRecurso: true, descricao: true,
      aprovacao: { select: { id: true } },
      desfecho: { select: { tipo: true, decreto: { select: { id: true, numero: true, ano: true } } } },
      itens: { select: { tipo: true, valor: true, lote: true } },
    },
  });
  return linhas.map((l) => ({
    id: l.id, numero: l.numero, exercicio: l.exercicio, tipoCredito: l.tipoCredito, origemRecurso: l.origemRecurso, descricao: l.descricao,
    situacao: situacaoDe(l),
    suplementado: l.itens.filter((i) => i.tipo === "SUPLEMENTACAO").reduce((t, i) => toMoney(t.plus(i.valor.toFixed(2))), toMoney("0.00")),
    anulado: l.itens.filter((i) => i.tipo === "ANULACAO").reduce((t, i) => toMoney(t.plus(i.valor.toFixed(2))), toMoney("0.00")),
    itens: l.itens.length,
    lotes: new Set(l.itens.map((i) => i.lote)).size,
    decreto: l.desfecho?.decreto ?? null,
  }));
}

export interface ItemDaPreviaLido {
  readonly lote: number;
  readonly fichaId: string;
  readonly fichaNumero: number;
  readonly unidade: string;
  readonly natureza: string;
  readonly acao: string;
  readonly fonte: string;
  readonly tipo: "SUPLEMENTACAO" | "ANULACAO";
  readonly valor: Money;
  /** O bloqueio da anulação: `null` na suplementação. */
  readonly bloqueio: { readonly reservaId: string; readonly desfeito: boolean } | null;
}

export interface PreviaDetalhada extends PreviaNaLista {
  readonly criadoPor: string;
  readonly criadoEm: Date;
  readonly itensDetalhados: readonly ItemDaPreviaLido[];
  readonly porFonte: readonly { readonly fonte: string; readonly suplementado: Money; readonly anulado: Money }[];
  readonly aprovacao: { readonly data: Date; readonly parecer: string | null; readonly criadoPor: string } | null;
  readonly desfechoDetalhe: { readonly tipo: string; readonly motivo: string | null; readonly criadoPor: string; readonly criadoEm: Date } | null;
}

export async function detalharPrevia(leitor: Leitor, previaId: string): Promise<PreviaDetalhada | null> {
  const l = await leitor.previaDeAlteracao.findUnique({
    where: { id: previaId },
    select: {
      id: true, numero: true, exercicio: true, tipoCredito: true, origemRecurso: true, descricao: true, criadoPor: true, criadoEm: true,
      aprovacao: { select: { id: true, data: true, parecer: true, criadoPor: true } },
      desfecho: { select: { tipo: true, motivo: true, criadoPor: true, criadoEm: true, decreto: { select: { id: true, numero: true, ano: true } } } },
      itens: {
        orderBy: [{ lote: "asc" }, { criadoEm: "asc" }, { id: "asc" }],
        select: {
          lote: true, tipo: true, valor: true, reservaId: true,
          reserva: { select: { estornos: { select: { id: true } } } },
          ficha: {
            select: {
              id: true, numero: true,
              unidadeOrc: { select: { codigo: true } },
              naturezaDespesa: { select: { codigoCompleto: true } },
              acao: { select: { codigo: true } },
              fonte: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });
  if (l === null) return null;
  const itensDetalhados: ItemDaPreviaLido[] = l.itens.map((i) => ({
    lote: i.lote,
    fichaId: i.ficha.id,
    fichaNumero: i.ficha.numero,
    unidade: i.ficha.unidadeOrc.codigo,
    natureza: i.ficha.naturezaDespesa.codigoCompleto,
    acao: i.ficha.acao.codigo,
    fonte: i.ficha.fonte.codigo,
    tipo: i.tipo,
    valor: toMoney(i.valor.toFixed(2)),
    bloqueio: i.reservaId === null ? null : { reservaId: i.reservaId, desfeito: (i.reserva?.estornos.length ?? 0) > 0 },
  }));
  const fontes = new Map<string, { suplementado: Money; anulado: Money }>();
  for (const i of itensDetalhados) {
    const f = fontes.get(i.fonte) ?? { suplementado: toMoney("0.00"), anulado: toMoney("0.00") };
    if (i.tipo === "SUPLEMENTACAO") f.suplementado = toMoney(f.suplementado.plus(i.valor));
    else f.anulado = toMoney(f.anulado.plus(i.valor));
    fontes.set(i.fonte, f);
  }
  const soma = (t: "SUPLEMENTACAO" | "ANULACAO"): Money => itensDetalhados.filter((i) => i.tipo === t).reduce((a, i) => toMoney(a.plus(i.valor)), toMoney("0.00"));
  return {
    id: l.id, numero: l.numero, exercicio: l.exercicio, tipoCredito: l.tipoCredito, origemRecurso: l.origemRecurso, descricao: l.descricao,
    situacao: situacaoDe(l),
    suplementado: soma("SUPLEMENTACAO"),
    anulado: soma("ANULACAO"),
    itens: itensDetalhados.length,
    lotes: new Set(itensDetalhados.map((i) => i.lote)).size,
    decreto: l.desfecho?.decreto ?? null,
    criadoPor: l.criadoPor,
    criadoEm: l.criadoEm,
    itensDetalhados,
    porFonte: [...fontes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fonte, v]) => ({ fonte, ...v })),
    aprovacao: l.aprovacao === null ? null : { data: l.aprovacao.data, parecer: l.aprovacao.parecer, criadoPor: l.aprovacao.criadoPor },
    desfechoDetalhe: l.desfecho === null ? null : { tipo: l.desfecho.tipo, motivo: l.desfecho.motivo, criadoPor: l.desfecho.criadoPor, criadoEm: l.desfecho.criadoEm },
  };
}
