import type { SlugDeArea } from "./navegacao.js";

/**
 * ═══ O QUE ATRAVESSA A FRONTEIRA PARA O NAVEGADOR ═══
 *
 * ⚠️ ESTE ARQUIVO NÃO IMPORTA DOMÍNIO, e a divisão é cobrada por
 * `test/ui/fronteira-ui.test.ts`: `lib/**` fora de `lib/portas/**` não pode importar
 * `modules/mNN`. Aqui ficam o TIPO do destino e o casamento de texto — as duas coisas que
 * o componente client precisa. Quem monta o índice e aplica a PERMISSÃO é
 * `lib/portas/busca-global.ts`, no servidor.
 *
 * ⚠️ E `acao` É `string` AQUI DE PROPÓSITO. Tipá-la contra o censo do M16 exigiria importar
 * o módulo e derrubaria a fronteira; é a mesma decisão já tomada em `lib/molde/tipos.ts`,
 * onde a ação do descritor é `string` e quem a confere contra o censo é a porta.
 */

export interface DestinoDaBusca {
  readonly rotulo: string;
  readonly href: string;
  /** Onde ele mora — vira a legenda cinza do resultado. */
  readonly contexto: string;
  /** A ação que o habilita; `null` = destino de leitura, sem ação de mutação. */
  readonly acao: string | null;
  readonly area: SlugDeArea;
}

/** Sem acento e em minúsculas — "orcamento" acha "Orçamento". */
export function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * O casamento de texto, isolado para que a tela e o servidor ordenem IGUAL.
 *
 * ⚠️ QUEM COMEÇA COM O TERMO VEM ANTES. Digitar "res" tem de oferecer "Restos a Pagar"
 * acima de "Resultado Primário" — o prefixo é o sinal mais forte que um índice sem
 * histórico de uso tem.
 */
export function filtrarPorTexto(
  destinos: readonly DestinoDaBusca[],
  termo: string,
  limite = 8
): readonly DestinoDaBusca[] {
  const alvo = normalizar(termo);
  if (alvo.length < 2) return [];
  return destinos
    .filter(
      (d) => normalizar(d.rotulo).includes(alvo) || normalizar(d.contexto).includes(alvo)
    )
    .sort((a, b) => {
      const pa = normalizar(a.rotulo).startsWith(alvo) ? 0 : 1;
      const pb = normalizar(b.rotulo).startsWith(alvo) ? 0 : 1;
      return pa !== pb ? pa - pb : a.rotulo.localeCompare(b.rotulo, "pt-BR");
    })
    .slice(0, limite);
}
