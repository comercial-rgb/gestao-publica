import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { preverTransferenciaNoPpa, quadroDeTransferenciasPrevistas, type QuadroDeTransferencias } from "../../modules/m02b-plurianual/transferencias-previstas";

/**
 * V36 — AS TRANSFERÊNCIAS FINANCEIRAS PREVISTAS NO PPA na tela (TR 5.9.1.17). A regra é do M02b
 * (`modules/m02b-plurianual/transferencias-previstas.ts`); aqui os planos, as entidades e a sessão.
 */

export type { QuadroDeTransferencias };

export interface TelaDasTransferencias {
  readonly planos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly planoId: string | null;
  readonly quadro: QuadroDeTransferencias | null;
  readonly entidades: readonly { readonly id: string; readonly rotulo: string }[];
}

export async function lerTransferenciasDoPpa(planoPedido: string): Promise<TelaDasTransferencias> {
  const prisma = cliente();
  const [planos, entidades] = await Promise.all([
    prisma.planoPlurianual.findMany({ orderBy: { anoInicio: "desc" }, select: { id: true, anoInicio: true, anoFim: true, leiRef: true } }),
    prisma.entidadeContabil.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true } } } }),
  ]);
  const planoId = planos.find((p) => p.id === planoPedido)?.id ?? planos[0]?.id ?? null;
  return {
    planos: planos.map((p) => ({ id: p.id, rotulo: `PPA ${String(p.anoInicio)}–${String(p.anoFim)} (${p.leiRef})` })),
    planoId,
    quadro: planoId === null ? null : await quadroDeTransferenciasPrevistas(prisma, planoId),
    entidades: entidades.map((e) => ({ id: e.id, rotulo: `${e.codigo} — ${e.versoes[0]?.nome ?? ""}` })),
  };
}

export async function preverTransferenciaPelaTela(input: {
  readonly planoId: string;
  readonly entidadeId: string;
  readonly ano: number;
  readonly valor: string;
  readonly finalidade: string;
  readonly motivo: string;
}): Promise<{ readonly versao: number; readonly anterior: string | null }> {
  return comEscritaAutenticada("CADASTRAR_PPA", (criadoPor) =>
    preverTransferenciaNoPpa(cliente(), {
      planoId: input.planoId,
      entidadeId: input.entidadeId,
      ano: input.ano,
      valor: input.valor,
      finalidade: input.finalidade,
      ...(input.motivo !== "" ? { motivo: input.motivo } : {}),
      criadoPor,
    })
  );
}
