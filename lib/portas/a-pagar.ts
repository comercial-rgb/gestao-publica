import { porCredor, posicaoAPagar, type EmpenhoSemInscricao, type ObrigacaoAPagar, type TotaisDoCredor } from "../../modules/m05-despesa/a-pagar.js";
import { cliente } from "./cliente";
import { nomesDosCredores } from "./empenho";

/**
 * V33 — A PAGAR NA TELA. A aritmética é do módulo (`modules/m05-despesa/a-pagar.ts`); aqui só o nome do credor e a
 * forma da tela. Quem chama passa o recorte JÁ AUTORIZADO (`recorteDePagina(sp, "CONSULTAR_DESPESA")`): a unidade de
 * quem só lê uma unidade desce ao SQL, nunca é filtrada depois.
 */

export type { EmpenhoSemInscricao, ObrigacaoAPagar };

export interface CredorAPagar extends TotaisDoCredor {
  readonly credorNome: string | null;
}

export interface APagarDaTela {
  readonly exercicio: number;
  readonly credores: readonly CredorAPagar[];
  readonly semInscricao: readonly (EmpenhoSemInscricao & { readonly credorNome: string | null })[];
  /** Os credores do recorte, para o filtro (só os que aparecem — nenhuma escolha rende tela vazia). */
  readonly opcoesDeCredor: readonly { readonly documento: string; readonly nome: string | null }[];
}

export async function lerAPagar(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  readonly fonteCodigo?: string | undefined;
  readonly credorCpfCnpj?: string | undefined;
}): Promise<APagarDaTela> {
  const prisma = cliente();
  const [posicao, todos] = await Promise.all([
    posicaoAPagar(prisma, p),
    // As opções do filtro ignoram o próprio filtro de credor (senão o select colapsaria numa opção só).
    p.credorCpfCnpj === undefined ? null : posicaoAPagar(prisma, { ...p, credorCpfCnpj: undefined }),
  ]);
  const base = todos ?? posicao;
  const docs = [...new Set([...base.obrigacoes.map((o) => o.credorCpfCnpj), ...base.semInscricao.map((e) => e.credorCpfCnpj)])];
  const nomes = await nomesDosCredores(docs);
  return {
    exercicio: posicao.exercicio,
    credores: porCredor(posicao.obrigacoes).map((c) => ({ ...c, credorNome: nomes.get(c.credorCpfCnpj) ?? null })),
    semInscricao: posicao.semInscricao.map((e) => ({ ...e, credorNome: nomes.get(e.credorCpfCnpj) ?? null })),
    opcoesDeCredor: docs
      .map((d) => ({ documento: d, nome: nomes.get(d) ?? null }))
      .sort((a, b) => (a.nome ?? a.documento).localeCompare(b.nome ?? b.documento)),
  };
}
