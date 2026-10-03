/**
 * O ALINHAMENTO ENTRE O CONTEXTO (exercício e unidade) E A URL — decisão PURA, sem navegador.
 *
 * ═══ AS DUAS DIREÇÕES, E QUANDO CADA UMA VALE ═══
 * · NA MONTAGEM, A URL VENCE. Quem abre um link com `?exercicio=2026` (de um relatório, de um
 *   favorito, de um colega) está pedindo 2026. Antes, a sincronia sobrescrevia a URL com o exercício
 *   da memória — e o link passava a mostrar outro exercício sem dizer nada. Só se adota o que é
 *   VÁLIDO (exercício existente, unidade entre as permitidas); o resto é ignorado e o contexto segue.
 * · DEPOIS, O SELETOR VENCE. Trocar o exercício ou a unidade no cabeçalho reescreve a URL.
 *
 * ═══ O QUE A TROCA DESCARTA, E O QUE PRESERVA ═══
 * Um filtro de BUSCA (texto, situação, credor, mês) faz sentido em qualquer exercício: fica. Uma
 * SELEÇÃO de registro (o id de um empenho, a ficha escolhida, a página 7 da lista) pertence ao
 * exercício e à unidade de antes: sai. E a página de DETALHE de um registro volta para a lista —
 * mostrar o empenho de 2026 com o cabeçalho dizendo 2027 é exatamente "dois números na mesma
 * janela, discordando". A troca nunca copia fatos nem transporta saldos: só muda o que se olha.
 */

export interface ContextoNaUrl {
  readonly exercicio: number;
  /** Código da unidade (o que a URL leva), ou null para o consolidado. */
  readonly ugCodigo: string | null;
}

export interface Alinhamento {
  /** O que o contexto deve ADOTAR da URL (só na montagem). */
  readonly adotar: Partial<ContextoNaUrl> | null;
  /** A URL para onde navegar (`replace`), ou null se já está alinhada. */
  readonly destino: string | null;
}

/** Parâmetros que apontam para um REGISTRO ou posição — pertencem ao recorte anterior. */
const SELECAO = /^(id|ficha|pagina|cursor)$|Id$/;

/** O último segmento é o identificador de um registro (cuid, uuid ou número)? */
function ehRegistro(segmento: string): boolean {
  return /^c[a-z0-9]{20,}$/.test(segmento) || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(segmento) || /^\d+$/.test(segmento);
}

/** O caminho da LISTA a partir de um detalhe: corta os segmentos de registro do fim. */
export function caminhoDaLista(pathname: string): string {
  const partes = pathname.split("/").filter(Boolean);
  const i = partes.findIndex(ehRegistro);
  if (i < 0) return pathname;
  return `/${partes.slice(0, i).join("/")}`;
}

export function alinharContextoEUrl(args: {
  readonly pathname: string;
  readonly busca: string;
  readonly contexto: ContextoNaUrl;
  /** O contexto da sincronia anterior; null na primeira (montagem da página). */
  readonly anterior: ContextoNaUrl | null;
  readonly exerciciosValidos: readonly number[];
  readonly ugsValidas: readonly string[];
}): Alinhamento {
  const params = new URLSearchParams(args.busca);
  const { contexto, anterior } = args;

  if (anterior === null) {
    const adotar: { exercicio?: number; ugCodigo?: string | null } = {};
    const ex = Number(params.get("exercicio") ?? "");
    if (Number.isInteger(ex) && args.exerciciosValidos.includes(ex) && ex !== contexto.exercicio) adotar.exercicio = ex;
    const ug = params.get("ug");
    if (ug !== null && args.ugsValidas.includes(ug) && ug !== contexto.ugCodigo) adotar.ugCodigo = ug;
    if (adotar.exercicio !== undefined || adotar.ugCodigo !== undefined) return { adotar, destino: null };
  }

  const trocou =
    anterior !== null && (anterior.exercicio !== contexto.exercicio || anterior.ugCodigo !== contexto.ugCodigo);
  let caminho = args.pathname;
  if (trocou) {
    for (const chave of [...params.keys()]) if (SELECAO.test(chave)) params.delete(chave);
    caminho = caminhoDaLista(args.pathname);
  }
  params.set("exercicio", String(contexto.exercicio));
  if (contexto.ugCodigo === null) params.delete("ug");
  else params.set("ug", contexto.ugCodigo);

  const alvo = params.toString();
  if (caminho === args.pathname && alvo === new URLSearchParams(args.busca).toString()) return { adotar: null, destino: null };
  return { adotar: null, destino: `${caminho}?${alvo}` };
}
