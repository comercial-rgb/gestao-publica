import { NextResponse } from "next/server";
import { EscopoDeLeituraError, ExercicioIlegivelError } from "../recorte";

/**
 * A RECUSA DE LEITURA TRADUZIDA EM RESPOSTA HTTP — para as rotas de exportação.
 *
 * ═══ ⚠️ POR QUE ISTO É UM LUGAR SÓ, E NÃO UM `catch` EM CADA ROTA ═══
 * São quatorze rotas de exportação, e o `catch` é idêntico nas quatorze. Este repositório
 * já pagou por essa forma de duplicação: `PERCURSOS-SEM-HELPER-COMUM` registra **dez
 * cópias** de `preencherEEnviar`, uma por percurso, das quais **cinco perderam o ramo do
 * campo de data** — e passavam por acidente do que lhes pediam preencher. Catorze cópias de
 * uma tradução de erro divergiriam do mesmo jeito, e a divergência apareceria como uma rota
 * que devolve 500 onde as outras devolvem 403.
 *
 * ═══ ⚠️ OS DOIS CÓDIGOS SÃO DIFERENTES PORQUE AS CAUSAS SÃO DIFERENTES ═══
 *   · `403` — a unidade pedida não está no acesso de quem pediu. O pedido está bem
 *     formado; o que falta é escopo, e a providência é de outra pessoa (o administrador).
 *   · `400` — o exercício pedido não é um ano. O pedido está malformado, e quem corrige é
 *     quem pediu.
 * Mandar as duas com o mesmo código faria o servidor pedir a coisa errada — a mesma razão
 * pela qual a ESCRITA separa "A AÇÃO" de "O ESCOPO" em
 * `modules/m16-travamento/autorizacao.ts`.
 *
 * ═══ ⚠️ E POR QUE **NÃO** É O 404-PARA-TUDO DO M22 ═══
 * `documentos/anexos/[id]` devolve 404 tanto para "não existe" quanto para "não pode", e
 * está certo: ali o identificador é de um REGISTRO, e a diferença entre 403 e 404 ensinaria
 * a quem varre ids exatamente quais processos existem — metade do que se quer esconder num
 * processo sigiloso. Aqui o identificador é uma UNIDADE GESTORA que o usuário digitou na
 * URL: ele já sabe que ela existe, o 403 não revela nada de novo, e o silêncio de um 404
 * apenas o faria procurar um erro de digitação que não há.
 *
 * ⚠️ `no-store`, E NÃO É DETALHE. Uma recusa é específica de QUEM pediu. Um cache
 * compartilhado — o proxy da rede da prefeitura, por exemplo — que guardasse esta resposta
 * a entregaria ao próximo que pedisse a mesma URL, e uma recusa cacheada é tão errada
 * quanto um deferimento cacheado: a mesma URL responde coisas diferentes para pessoas
 * diferentes, por desenho.
 *
 * ⚠️ O QUE NÃO É RECUSA DE LEITURA **SOBE**. Devolver 500 genérico aqui engoliria
 * `PortaSemBancoError` e qualquer defeito real dentro da mesma resposta, e a rota passaria
 * a mentir sobre a natureza da falha. Quem não reconhece, relança.
 */
export function respostaDaRecusaDeLeitura(erro: unknown): NextResponse | null {
  if (erro instanceof EscopoDeLeituraError) {
    return NextResponse.json(
      { erro: erro.message },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }
  if (erro instanceof ExercicioIlegivelError) {
    return NextResponse.json(
      { erro: erro.message },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
  return null;
}
