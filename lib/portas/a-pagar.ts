import { porCredor, posicaoAPagar, type EmpenhoSemInscricao, type ObrigacaoAPagar, type TotaisDoCredor } from "../../modules/m05-despesa/a-pagar.js";
import { toMoney } from "../../packages/contracts/index.js";
import { diaCivil } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";

/**
 * V33 — A PAGAR NA TELA E NO PDF. A aritmética é do módulo (`modules/m05-despesa/a-pagar.ts`); aqui o nome do
 * credor, o recorte de fase e origem e os totais — UMA vez, para a tela, o CSV e o PDF lerem o mesmo resultado.
 * Quem chama passa o recorte JÁ AUTORIZADO (`recorteDePagina(sp, "CONSULTAR_DESPESA")`): a unidade de quem só lê uma
 * unidade desce ao SQL, nunca é filtrada depois.
 */

export type { EmpenhoSemInscricao, ObrigacaoAPagar };

export interface CredorAPagar extends TotaisDoCredor {
  readonly credorNome: string | null;
}

export type FaseDoFiltro = "" | ObrigacaoAPagar["fase"];
export type OrigemDoFiltro = "" | "exercicio" | "restos";

export interface APagarDaTela {
  readonly exercicio: number;
  /** Os credores com as obrigações que passam no filtro de fase e origem. */
  readonly credores: readonly CredorAPagar[];
  /** Os totais do que está na tela: exigível (liquidado a pagar) e compromisso (a liquidar), nunca somados. */
  readonly totais: { readonly liquidadoAPagar: string; readonly aLiquidar: string };
  readonly semInscricao: readonly (EmpenhoSemInscricao & { readonly credorNome: string | null })[];
  /** Os credores do recorte, para o filtro (só os que aparecem — nenhuma escolha rende tela vazia). */
  readonly opcoesDeCredor: readonly { readonly documento: string; readonly nome: string | null }[];
  /** V36 — as fontes que têm obrigação no recorte (sem o filtro de fonte, para o select não colapsar). */
  readonly opcoesDeFonte: readonly string[];
}

export function faseDoFiltro(v: string): FaseDoFiltro {
  return v === "A_LIQUIDAR" || v === "LIQUIDADO_A_PAGAR" ? v : "";
}
export function origemDoFiltro(v: string): OrigemDoFiltro {
  return v === "exercicio" || v === "restos" ? v : "";
}
/** V36 — "vence até" (dia civil AAAA-MM-DD). Valor que não é um dia vira "sem filtro", nunca um corte inventado. */
export function venceAteDoFiltro(v: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

const somar = (os: readonly ObrigacaoAPagar[]): string => os.reduce((s, o) => s.plus(o.saldo), toMoney("0")).toFixed(2);

export async function lerAPagar(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  readonly credorCpfCnpj?: string | undefined;
  readonly fase?: FaseDoFiltro;
  readonly origem?: OrigemDoFiltro;
  /**
   * V36 — só as obrigações com vencimento até este dia civil (o vencimento é a data prevista da ordem de
   * pagamento). Obrigação sem ordem não tem vencimento e fica fora do recorte — a tela diz isso.
   */
  readonly venceAte?: string;
}): Promise<APagarDaTela> {
  const prisma = cliente();
  const recorte = { exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo, fonteCodigo: p.fonteCodigo };
  const semFiltroDeOpcoes = { exercicio: p.exercicio, unidadeCodigo: p.unidadeCodigo };
  const [posicao, todos] = await Promise.all([
    posicaoAPagar(prisma, { ...recorte, credorCpfCnpj: p.credorCpfCnpj }),
    // As opções dos filtros ignoram o filtro de credor e o de fonte (senão o select colapsaria numa opção só).
    p.credorCpfCnpj === undefined && p.fonteCodigo === undefined ? null : posicaoAPagar(prisma, semFiltroDeOpcoes),
  ]);
  const base = todos ?? posicao;
  const docs = [...new Set([...base.obrigacoes.map((o) => o.credorCpfCnpj), ...base.semInscricao.map((e) => e.credorCpfCnpj)])];
  const nomes = await nomesDosCredores(docs);
  const fase = p.fase ?? "";
  const origem = p.origem ?? "";
  const venceAte = p.venceAte ?? "";
  const passa = (o: ObrigacaoAPagar): boolean =>
    (fase === "" || o.fase === fase) &&
    (origem === "" || (origem === "exercicio" ? o.situacao === "EXERCICIO" : o.situacao !== "EXERCICIO")) &&
    (venceAte === "" || (o.vencimento !== null && diaCivil(o.vencimento) <= venceAte));
  const filtradas = posicao.obrigacoes.filter(passa);
  return {
    exercicio: posicao.exercicio,
    credores: porCredor(filtradas).map((c) => ({ ...c, credorNome: nomes.get(c.credorCpfCnpj) ?? null })),
    totais: {
      liquidadoAPagar: somar(filtradas.filter((o) => o.fase === "LIQUIDADO_A_PAGAR")),
      aLiquidar: somar(filtradas.filter((o) => o.fase === "A_LIQUIDAR")),
    },
    semInscricao: posicao.semInscricao.map((e) => ({ ...e, credorNome: nomes.get(e.credorCpfCnpj) ?? null })),
    opcoesDeCredor: docs
      .map((d) => ({ documento: d, nome: nomes.get(d) ?? null }))
      .sort((a, b) => (a.nome ?? a.documento).localeCompare(b.nome ?? b.documento)),
    opcoesDeFonte: [...new Set(base.obrigacoes.map((o) => o.fonteCodigo))].sort(),
  };
}

/** Os rótulos de tela (e de PDF e CSV) — o enum do domínio não vai ao papel. */
export const ROTULO_DA_SITUACAO: Readonly<Record<ObrigacaoAPagar["situacao"], string>> = {
  EXERCICIO: "Exercício",
  RP_PROCESSADO: "Restos processados",
  RP_NAO_PROCESSADO: "Restos não processados",
};
export const ROTULO_DA_FASE: Readonly<Record<ObrigacaoAPagar["fase"], string>> = { A_LIQUIDAR: "A liquidar", LIQUIDADO_A_PAGAR: "Liquidado a pagar" };
