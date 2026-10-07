import { z } from "zod";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { formatarMoeda } from "../../packages/contracts/moeda.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { anoNoQuadrienio } from "./dominio.js";

/**
 * M02b — A PREVISÃO DAS TRANSFERÊNCIAS FINANCEIRAS NO PPA (TR 5.9.1.17). Ver `prisma/schema/m02b-transferencias-ppa.prisma`.
 *
 * Por entidade de destino e por ano do quadriênio. A primeira versão de (plano, entidade, ano) nasce com valor positivo;
 * as seguintes corrigem, com motivo (podem zerar). A vigente é a de maior versão; a corrida de duas correções esbarra na
 * chave única e uma delas é recusada com o motivo.
 */

type Leitor = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export const zPreverTransferenciaPpaInput = z.object({
  planoId: z.string().min(1),
  entidadeId: z.string().min(1, "Escolha a entidade de destino"),
  ano: z.number().int(),
  valor: zMoney.refine((v) => v.greaterThanOrEqualTo(0), { message: "O valor previsto não pode ser negativo" }),
  finalidade: z.string().trim().min(5, "Informe a finalidade da transferência (ao menos 5 caracteres)"),
  motivo: z.string().trim().optional(),
  criadoPor: z.string().min(1),
});
export type PreverTransferenciaPpaInput = z.input<typeof zPreverTransferenciaPpaInput>;

const eUnicidade = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";

/** Grava a previsão (versão 1) ou a correção (versão seguinte, com motivo) de (plano, entidade, ano). */
export async function preverTransferenciaNoPpa(prisma: PrismaClient, input: PreverTransferenciaPpaInput): Promise<{ readonly versao: number; readonly anterior: string | null }> {
  const lido = zPreverTransferenciaPpaInput.safeParse(input);
  if (!lido.success) throw new Error(`${lido.error.issues.map((i) => i.message).join(" ")} Nada foi gravado.`);
  const d = lido.data;
  try {
    return await prisma.$transaction(async (tx) => {
      await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.preverTransferenciaNoPpa, "ENTE");
      const plano = await tx.planoPlurianual.findUnique({ where: { id: d.planoId }, select: { anoInicio: true, anoFim: true, leiRef: true } });
      if (plano === null) throw new Error("Plano plurianual não encontrado. Nada foi gravado.");
      if (!anoNoQuadrienio(plano.anoInicio, plano.anoFim, d.ano)) {
        throw new Error(`O ano ${String(d.ano)} não está no quadriênio do plano (${String(plano.anoInicio)} a ${String(plano.anoFim)}). Nada foi gravado.`);
      }
      const entidade = await tx.entidadeContabil.findUnique({ where: { id: d.entidadeId }, select: { id: true } });
      if (entidade === null) throw new Error("Entidade de destino não encontrada no cadastro de entidades. Nada foi gravado.");
      const ultima = await tx.previsaoDeTransferenciaPpa.findFirst({
        where: { planoId: d.planoId, entidadeId: d.entidadeId, ano: d.ano },
        orderBy: { versao: "desc" },
        select: { versao: true, valor: true },
      });
      if (ultima === null && !d.valor.greaterThan(0)) throw new Error("A primeira previsão tem de ter valor maior que zero. Nada foi gravado.");
      if (ultima !== null && (d.motivo === undefined || d.motivo.length < 5)) {
        throw new Error(`Já há previsão para esta entidade em ${String(d.ano)} (${formatarMoeda(ultima.valor.toFixed(2)).texto}): a correção precisa do motivo (ao menos 5 caracteres). Nada foi gravado.`);
      }
      const versao = (ultima?.versao ?? 0) + 1;
      await tx.previsaoDeTransferenciaPpa.create({
        data: { planoId: d.planoId, entidadeId: d.entidadeId, ano: d.ano, versao, valor: d.valor.toFixed(2), finalidade: d.finalidade, motivo: ultima === null ? null : d.motivo!, criadoPor: d.criadoPor },
      });
      return { versao, anterior: ultima === null ? null : ultima.valor.toFixed(2) };
    });
  } catch (e) {
    if (eUnicidade(e)) throw new Error("Outra previsão desta entidade e ano foi gravada ao mesmo tempo. Confira a tabela e grave de novo. Nada foi gravado.", { cause: e });
    throw e;
  }
}

export interface QuadroDeTransferencias {
  readonly anos: readonly number[];
  readonly linhas: readonly {
    readonly entidadeId: string;
    readonly entidade: string;
    readonly porAno: readonly { readonly ano: number; readonly valor: Money | null; readonly versoes: number; readonly finalidade: string | null }[];
    readonly total: Money;
  }[];
  readonly totalPorAno: readonly Money[];
}

/** O quadro vigente: entidades x anos do quadriênio, com o total por ano e por entidade. */
export async function quadroDeTransferenciasPrevistas(leitor: Leitor, planoId: string): Promise<QuadroDeTransferencias | null> {
  const plano = await leitor.planoPlurianual.findUnique({ where: { id: planoId }, select: { anoInicio: true, anoFim: true } });
  if (plano === null) return null;
  const anos = Array.from({ length: plano.anoFim - plano.anoInicio + 1 }, (_, i) => plano.anoInicio + i);
  const linhas = await leitor.previsaoDeTransferenciaPpa.findMany({
    where: { planoId },
    orderBy: [{ versao: "desc" }],
    select: { entidadeId: true, ano: true, versao: true, valor: true, finalidade: true },
  });
  const entidades = await leitor.entidadeContabil.findMany({
    where: { id: { in: [...new Set(linhas.map((l) => l.entidadeId))] } },
    select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } } },
  });
  const vigentes = new Map<string, { valor: Money; versoes: number; finalidade: string }>();
  for (const l of linhas) {
    const k = `${l.entidadeId}|${String(l.ano)}`;
    const ja = vigentes.get(k);
    if (ja === undefined) vigentes.set(k, { valor: toMoney(l.valor.toFixed(2)), versoes: 1, finalidade: l.finalidade });
    else ja.versoes += 1;
  }
  const zero = toMoney("0.00");
  const resultado = entidades
    .map((e) => {
      const porAno = anos.map((ano) => {
        const v = vigentes.get(`${e.id}|${String(ano)}`);
        return { ano, valor: v?.valor ?? null, versoes: v?.versoes ?? 0, finalidade: v?.finalidade ?? null };
      });
      return { entidadeId: e.id, entidade: `${e.codigo} — ${e.versoes[0]?.nome ?? ""}`, porAno, total: porAno.reduce((t, a) => toMoney(t.plus(a.valor ?? zero)), zero) };
    })
    .sort((a, b) => a.entidade.localeCompare(b.entidade));
  const totalPorAno = anos.map((_, i) => resultado.reduce((t, l) => toMoney(t.plus(l.porAno[i]?.valor ?? zero)), zero));
  return { anos, linhas: resultado, totalPorAno };
}
