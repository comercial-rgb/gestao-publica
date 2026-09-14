import { Decimal, sumMoney, toMoney } from "../../../packages/contracts/index.js";
import { lotacaoVigenteEm } from "../../../modules/m32-pessoal/dominio.js";
import { bordasDaCompetencia } from "../../../modules/m33-folha/dominio.js";
import { encargosDaFolha } from "../../../modules/m33-folha/encargos-servico.js";
import { formatarMoeda } from "../../format/moeda";
import type { DocumentoPdf, SecaoPdf } from "../../pdf/documento";
import { nomeDoEnteParaDocumentos } from "../../pdf/ente.js";
import { cliente } from "../cliente";

/**
 * ═══ O RESUMO DA FOLHA — bruto, descontos, líquido e PATRONAL, lado a lado (V6.2 U1) ═══
 *
 * ⚠️ QUATRO COLUNAS QUE NÃO SE MISTURAM. Bruto menos descontos é o líquido do servidor; o patronal é
 * do ENTE e fica ao lado, nunca somado ao líquido nem subtraído dele. O custo da folha para o ente é
 * bruto + patronal — e o documento diz isso numa linha própria, para ninguém somar de cabeça.
 *
 * ⚠️ UMA CONSULTA, DUAS SAÍDAS. O CSV e o PDF saem da MESMA `lerResumoDaFolha`, autorizada na rota.
 *
 * ⚠️ A LOTAÇÃO É A VIGENTE NO ÚLTIMO DIA DA COMPETÊNCIA (M32), não a de hoje.
 *
 * ⚠️ O PATRONAL É O DA APURAÇÃO VIGENTE. Sem apuração, a coluna diz "não apurado" — nunca zero.
 */

export interface LinhaParaResumo {
  readonly regime: string;
  readonly lotacao: string;
  readonly bruto: string;
  readonly descontos: string;
  readonly liquido: string;
  /** Nulo = encargos não apurados para este vínculo. */
  readonly patronal: string | null;
}

export interface GrupoDoResumo {
  readonly regime: string;
  readonly lotacao: string;
  readonly vinculos: number;
  readonly bruto: string;
  readonly descontos: string;
  readonly liquido: string;
  readonly patronal: string | null;
}

/** Agrega por regime × lotação, somando em Decimal. PURA — é o que o teste confere contra contas à mão. */
export function agregarResumoDaFolha(linhas: readonly LinhaParaResumo[]): { readonly grupos: readonly GrupoDoResumo[]; readonly total: GrupoDoResumo; readonly custoDoEnte: string | null } {
  const mapa = new Map<string, LinhaParaResumo[]>();
  for (const l of linhas) {
    const k = `${l.regime} ${l.lotacao}`;
    mapa.set(k, [...(mapa.get(k) ?? []), l]);
  }
  const somar = (ls: readonly LinhaParaResumo[], regime: string, lotacao: string): GrupoDoResumo => ({
    regime,
    lotacao,
    vinculos: ls.length,
    bruto: sumMoney(ls.map((l) => toMoney(l.bruto))).toFixed(2),
    descontos: sumMoney(ls.map((l) => toMoney(l.descontos))).toFixed(2),
    liquido: sumMoney(ls.map((l) => toMoney(l.liquido))).toFixed(2),
    patronal: ls.some((l) => l.patronal === null) ? null : sumMoney(ls.map((l) => toMoney(l.patronal as string))).toFixed(2),
  });
  const grupos = [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, ls]) => somar(ls, ls[0]?.regime ?? "", ls[0]?.lotacao ?? ""));
  const total = somar(linhas, "TOTAL", "");
  return { grupos, total, custoDoEnte: total.patronal === null ? null : toMoney(new Decimal(total.bruto).plus(total.patronal)).toFixed(2) };
}

export interface ResumoDaFolha {
  readonly competencia: string;
  readonly calculo: number;
  readonly apuracao: number | null;
  readonly filtros: { readonly regime: string; readonly lotacao: string };
  readonly grupos: readonly GrupoDoResumo[];
  readonly total: GrupoDoResumo;
  readonly custoDoEnte: string | null;
  readonly porComponente: readonly { readonly codigo: string; readonly descricao: string; readonly total: string }[];
}

export async function lerResumoDaFolha(folhaId: string, filtros: { readonly regime?: string; readonly lotacao?: string }): Promise<ResumoDaFolha | null> {
  const prisma = cliente();
  const f = await prisma.folhaDePagamento.findUnique({ where: { id: folhaId }, select: { competencia: true, fechamento: { select: { calculoId: true, calculo: { select: { numero: true } } } } } });
  if (f === null || f.fechamento === null) return null;
  const fim = bordasDaCompetencia(f.competencia).fim;
  const [ccs, lotacoes, enc] = await Promise.all([
    prisma.contracheque.findMany({
      where: { calculoId: f.fechamento.calculoId },
      select: { vinculoId: true, regime: true, totalProventos: true, totalDescontos: true, liquido: true, vinculo: { select: { eventos: { select: { data: true, criadoEm: true, tipo: true, cargoId: true, lotacaoId: true, salarioBase: true } } } } },
    }),
    prisma.lotacao.findMany({ select: { id: true, codigo: true, nome: true } }),
    encargosDaFolha(prisma, folhaId),
  ]);
  const nomeDaLotacao = new Map(lotacoes.map((l) => [l.id, `${l.codigo} — ${l.nome}`]));
  const patronalPorVinculo = new Map<string, Decimal>();
  if (enc.vigente !== null) {
    for (const i of enc.vigente.itens) {
      if (typeof i["valor"] !== "string") continue;
      const v = String(i["vinculoId"]);
      patronalPorVinculo.set(v, (patronalPorVinculo.get(v) ?? new Decimal(0)).plus(new Decimal(i["valor"])));
    }
  }
  const linhas: LinhaParaResumo[] = ccs
    .map((c) => {
      const lot = lotacaoVigenteEm(c.vinculo.eventos.map((e) => ({ ...e, tipo: e.tipo as never, salarioBase: e.salarioBase === null ? null : toMoney(e.salarioBase) })), fim);
      return {
        regime: c.regime,
        lotacao: lot === null ? "sem lotação" : (nomeDaLotacao.get(lot) ?? lot),
        bruto: toMoney(c.totalProventos).toFixed(2),
        descontos: toMoney(c.totalDescontos).toFixed(2),
        liquido: toMoney(c.liquido).toFixed(2),
        patronal: enc.vigente === null ? null : toMoney(patronalPorVinculo.get(c.vinculoId) ?? 0).toFixed(2),
      };
    })
    .filter((l) => (filtros.regime ?? "") === "" || l.regime === filtros.regime)
    .filter((l) => (filtros.lotacao ?? "") === "" || l.lotacao.toLowerCase().includes((filtros.lotacao ?? "").toLowerCase()));
  const a = agregarResumoDaFolha(linhas);
  return {
    competencia: f.competencia,
    calculo: f.fechamento.calculo.numero,
    apuracao: enc.vigente?.numero ?? null,
    filtros: { regime: filtros.regime ?? "", lotacao: filtros.lotacao ?? "" },
    ...a,
    porComponente: enc.vigente === null ? [] : enc.vigente.porComponente.map((p) => ({ codigo: p.codigo, descricao: p.descricao, total: p.total })),
  };
}

const brl = (v: string | null): string => (v === null ? "não apurado" : formatarMoeda(v).texto);
const COLUNAS = ["Regime", "Lotação", "Vínculos", "Bruto", "Descontos", "Líquido", "Patronal (ente)"] as const;

export function linhasDoResumo(r: ResumoDaFolha): readonly (readonly string[])[] {
  return [...r.grupos, r.total].map((g) => [g.regime, g.lotacao, String(g.vinculos), brl(g.bruto), brl(g.descontos), brl(g.liquido), brl(g.patronal)]);
}

export function colunasDoResumo(): readonly string[] {
  return COLUNAS;
}

export async function documentoDoResumo(r: ResumoDaFolha): Promise<DocumentoPdf> {
  const principal: SecaoPdf = {
    titulo: "Por regime e lotação (lotação vigente no último dia da competência)",
    colunas: COLUNAS.map((c, i) => (i >= 2 ? { rotulo: c, alinhamento: "direita" as const } : { rotulo: c })),
    linhas: linhasDoResumo(r),
    totais: [r.grupos.length],
  };
  const componentes: SecaoPdf = {
    titulo: "Encargos do empregador por componente",
    colunas: [{ rotulo: "Componente" }, { rotulo: "Descrição" }, { rotulo: "Total", alinhamento: "direita" }],
    linhas: r.porComponente.length === 0 ? [["—", "encargos não apurados", "—"]] : r.porComponente.map((p) => [p.codigo, p.descricao, brl(p.total)]),
  };
  return {
    ente: await nomeDoEnteParaDocumentos(),
    titulo: `Resumo da folha mensal de ${r.competencia}`,
    subtitulo: `Cálculo fechado nº ${r.calculo}${r.apuracao === null ? " · encargos não apurados" : ` · apuração dos encargos nº ${r.apuracao}`}`,
    periodo: `Competência ${r.competencia}`,
    secoes: [principal, componentes],
    notas: [
      "Bruto menos descontos é o líquido do servidor. O patronal é obrigação do ente: não se soma ao líquido nem dele se desconta.",
      r.custoDoEnte === null ? "Custo do ente (bruto + patronal): indisponível — os encargos não foram apurados." : `Custo do ente (bruto + patronal): ${brl(r.custoDoEnte)}.`,
      `Filtros: regime ${r.filtros.regime === "" ? "todos" : r.filtros.regime}; lotação ${r.filtros.lotacao === "" ? "todas" : `"${r.filtros.lotacao}"`}.`,
      "Relatório de posição da apuração vigente na data da emissão; não substitui contracheque nem guia de recolhimento.",
    ],
  };
}
