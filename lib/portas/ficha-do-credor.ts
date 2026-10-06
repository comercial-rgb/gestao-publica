import { toMoney } from "../../packages/contracts/index.js";
import { lerAPagar, type APagarDaTela } from "./a-pagar";
import { listarEmpenhosDaExecucao, nomesDosCredores, type EmpenhoDaTela } from "./empenho";
import { filtroDosPagamentos, lerPagamentosEfetuados, type PagamentosEfetuadosDaTela } from "./pagamentos-efetuados";

/**
 * V36 — A FICHA DO CREDOR (TR 5.10.2.61): numa página, o que o ente tem com um credor no exercício — os empenhos com
 * empenhado, liquidado e pago; o que está a liquidar e a pagar, do exercício e de restos; e os pagamentos efetuados,
 * com retido e líquido.
 *
 * ⚠️ NENHUMA ARITMÉTICA NOVA. Cada bloco é a leitura que a tela própria dele já usa (`listarEmpenhosDaExecucao`,
 * `lerAPagar`, `lerPagamentosEfetuados`), com o credor como filtro que desce ao SQL. Os únicos totais daqui são as
 * somas Decimal das colunas da lista de empenhos, que a lista mostra linha a linha.
 *
 * Quem chama passa o recorte JÁ AUTORIZADO (`recorteDePagina(sp, "CONSULTAR_DESPESA")`).
 */

export interface FichaDoCredor {
  readonly documento: string;
  readonly nome: string | null;
  readonly empenhos: readonly EmpenhoDaTela[];
  readonly totaisDosEmpenhos: { readonly empenhadoLiquido: string; readonly liquidado: string; readonly pago: string };
  readonly aPagar: APagarDaTela;
  readonly pagamentos: PagamentosEfetuadosDaTela;
}

/** Os credores que o exercício conhece (empenhos e obrigações), para a escolha. */
export async function credoresDoExercicio(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly { readonly documento: string; readonly nome: string | null }[]> {
  const [empenhos, aPagar] = await Promise.all([listarEmpenhosDaExecucao(p), lerAPagar(p)]);
  const docs = [...new Set([...empenhos.map((e) => e.credorCpfCnpj), ...aPagar.opcoesDeCredor.map((c) => c.documento)])];
  const nomes = await nomesDosCredores(docs);
  return docs
    .map((d) => ({ documento: d, nome: nomes.get(d) ?? null }))
    .sort((a, b) => (a.nome ?? a.documento).localeCompare(b.nome ?? b.documento));
}

export async function lerFichaDoCredor(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
  /** Só dígitos. */
  readonly documento: string;
}): Promise<FichaDoCredor> {
  const recorte = { exercicio: p.exercicio, ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}) };
  const filtro = filtroDosPagamentos({ credor: p.documento }, p.exercicio);
  const [empenhos, aPagar, pagamentos, nomes] = await Promise.all([
    listarEmpenhosDaExecucao({ ...recorte, credorCpfCnpj: p.documento }),
    lerAPagar({ ...recorte, credorCpfCnpj: p.documento }),
    lerPagamentosEfetuados(filtro, p.unidadeCodigo),
    nomesDosCredores([p.documento]),
  ]);
  const somar = (campo: "empenhadoLiquido" | "liquidado" | "pago"): string =>
    empenhos.reduce((s, e) => toMoney(s.plus(e[campo])), toMoney("0.00")).toFixed(2);
  return {
    documento: p.documento,
    nome: nomes.get(p.documento) ?? null,
    empenhos,
    totaisDosEmpenhos: { empenhadoLiquido: somar("empenhadoLiquido"), liquidado: somar("liquidado"), pago: somar("pago") },
    aPagar,
    pagamentos,
  };
}
