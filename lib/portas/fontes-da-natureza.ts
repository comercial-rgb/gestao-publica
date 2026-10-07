import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { composicoesVigentes, definirFontesDaNatureza, formatarPercentual } from "../../modules/m04-receita/fontes-da-natureza";
import { preverReceitaPorRateio } from "../../modules/m02-planejamento/previsao-por-rateio";
import { diaCivil } from "../../packages/datas/index.js";
import { toPercentual } from "../../packages/contracts/percentual.js";

/**
 * V36 — AS FONTES DA NATUREZA DA RECEITA COM PERCENTUAL (TR 5.9.3.4) E A PREVISÃO DA LOA POR RATEIO (TR 5.9.3.7) na
 * tela. A regra mora em `modules/m04-receita/fontes-da-natureza.ts` e `modules/m02-planejamento/previsao-por-rateio.ts`;
 * aqui só a forma do formulário (percentual com vírgula) e a sessão.
 */

export interface ComposicaoDaTela {
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly itens: readonly { readonly fonte: string; readonly fonteDescricao: string; readonly percentual: string }[];
  readonly soma: string;
  readonly completa: boolean;
  readonly fonteDoResiduo: string;
  readonly fundamento: string;
  readonly registradaEm: string;
  readonly registradaPor: string;
  readonly versoes: number;
}

export interface TelaDasFontesDaNatureza {
  readonly composicoes: readonly ComposicaoDaTela[];
  readonly naturezas: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
}

export async function lerFontesDasNaturezas(): Promise<TelaDasFontesDaNatureza> {
  const prisma = cliente();
  const [vigentes, versoes, naturezas, fontes] = await Promise.all([
    composicoesVigentes(prisma),
    prisma.composicaoDeFontesDaNatureza.groupBy({ by: ["naturezaReceitaId"], _count: { _all: true } }),
    prisma.naturezaReceita.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true, descricao: true } }),
    prisma.fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { codigo: true, descricao: true } }),
  ]);
  const idDaNatureza = new Map(naturezas.map((n) => [n.codigo, n.id]));
  const contagem = new Map(versoes.map((v) => [v.naturezaReceitaId, v._count._all]));
  const br = (d: Date): string => diaCivil(d).split("-").reverse().join("/");
  return {
    composicoes: vigentes.map((c) => ({
      naturezaCodigo: c.naturezaCodigo,
      naturezaDescricao: c.naturezaDescricao,
      itens: c.itens.map((i) => ({ fonte: i.fonte, fonteDescricao: i.fonteDescricao, percentual: formatarPercentual(i.percentual) })),
      soma: formatarPercentual(c.soma),
      completa: c.completa,
      fonteDoResiduo: c.fonteDoResiduo,
      fundamento: c.fundamento,
      registradaEm: br(c.criadoEm),
      registradaPor: c.criadoPor,
      versoes: contagem.get(idDaNatureza.get(c.naturezaCodigo) ?? "") ?? 1,
    })),
    naturezas: naturezas.map((n) => ({ codigo: n.codigo, descricao: n.descricao })),
    fontes,
  };
}

/** "33,333334" ou "33.333334" -> "33.333334". Vazio fica vazio (o domínio recusa com o motivo). */
const percentualDaTela = (s: string): string => s.trim().replace(/\s/g, "").replace(",", ".");

export async function definirFontesDaNaturezaPelaTela(input: {
  readonly naturezaReceita: string;
  readonly itens: readonly { readonly fonte: string; readonly percentual: string }[];
  readonly fonteDoResiduo: string;
  readonly fundamento: string;
}): Promise<{ readonly soma: string }> {
  return comEscritaAutenticada("PARAMETRIZAR_ROTEIRO_ORCAMENTARIO", async (criadoPor) => {
    const r = await definirFontesDaNatureza(cliente(), {
      naturezaReceita: input.naturezaReceita,
      itens: input.itens.map((i) => ({ fonte: i.fonte.trim(), percentual: percentualDaTela(i.percentual) })),
      fonteDoResiduo: input.fonteDoResiduo.trim(),
      fundamento: input.fundamento,
      criadoPor,
    });
    return { soma: formatarPercentual(toPercentual(r.soma)) };
  });
}

/** As naturezas que podem ratear: as de composição completa (100%). Lista curta por construção. */
export async function naturezasQueRateiam(): Promise<readonly { readonly codigo: string; readonly descricao: string; readonly fontes: string }[]> {
  const vigentes = await composicoesVigentes(cliente());
  return vigentes
    .filter((c) => c.completa)
    .map((c) => ({ codigo: c.naturezaCodigo, descricao: c.naturezaDescricao, fontes: c.itens.map((i) => `${i.fonte} (${formatarPercentual(i.percentual)}%)`).join(", ") }));
}

export async function preverReceitaPorRateioPelaTela(input: { readonly exercicio: number; readonly naturezaReceita: string; readonly valor: string }): Promise<readonly { readonly fonte: string; readonly valor: string }[]> {
  return comEscritaAutenticada("CRIAR_RECEITA_PREVISTA", async (criadoPor) =>
    (await preverReceitaPorRateio(cliente(), { exercicio: input.exercicio, naturezaReceita: input.naturezaReceita, valor: input.valor, criadoPor })).map((p) => ({ fonte: p.fonte, valor: p.valor }))
  );
}
