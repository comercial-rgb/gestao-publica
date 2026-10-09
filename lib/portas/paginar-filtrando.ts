/**
 * V37 — A PÁGINA DE UM CATÁLOGO QUANDO PARTE DO FILTRO NÃO DESCE AO BANCO.
 *
 * "O credor vigente" é "o ÚLTIMO movimento do papel é a concessão", e a consulta não diz "o último". Filtrar depois de
 * paginar entregava a página curta — no limite, vazia com "há mais" —, e um credor vigente podia ficar escondido atrás
 * de vinte encerrados. Aqui a página se monta em LOTES na mesma ordem da consulta, guardando só o que passa no filtro,
 * até ter a página pedida e um a mais (que diz se há mais) ou a consulta acabar.
 */
const LOTE = 100;

export async function paginarFiltrando<T>(
  consultar: (skip: number, take: number) => Promise<readonly T[]>,
  manter: (linha: T) => boolean,
  pagina: number,
  tamanho: number
): Promise<{ readonly linhas: readonly T[]; readonly temMais: boolean }> {
  const inicio = (pagina - 1) * tamanho;
  const precisa = inicio + tamanho + 1;
  const mantidas: T[] = [];
  for (let skip = 0; mantidas.length < precisa; skip += LOTE) {
    const lote = await consultar(skip, LOTE);
    for (const l of lote) if (manter(l)) mantidas.push(l);
    if (lote.length < LOTE) break;
  }
  return { linhas: mantidas.slice(inicio, inicio + tamanho), temMais: mantidas.length > inicio + tamanho };
}
