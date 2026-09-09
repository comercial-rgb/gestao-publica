import type { ExportadorTribunal } from "./porta.js";
import { exportador as tcePb } from "../../adapters/tribunais/tce-pb/index.js";
import { exportador as tcmBa } from "../../adapters/tribunais/tcm-ba/index.js";

/**
 * O REGISTRO DE TRIBUNAIS — o único lugar que sabe QUAL código corresponde a QUAL implementação.
 *
 * ═══ POR QUE O REGISTRO CONHECE OS ADAPTERS (E A PORTA NÃO) ═══
 * Este arquivo importa os adapters de propósito: ele é o ponto de composição. A alternativa —
 * cada adapter chamar um `registrar()` no carregamento — deixa o registro VAZIO até que alguém
 * importe o adapter certo, e transforma "o tribunal do ente não existe" num erro que só aparece
 * em produção, dependendo de qual módulo foi carregado antes. Um mapa explícito falha na hora e
 * no lugar certo.
 *
 * ⚠️ NÃO HÁ CICLO EM RUNTIME. O adapter importa a porta com `import type` (só tipos, apagados na
 * compilação); só este arquivo tem import de valor na direção registro → adapter. Se algum dia um
 * adapter precisar de um VALOR da porta, o ciclo nasce — e é aqui que ele apareceria.
 *
 * ⚠️ O TCM-BA ESTÁ REGISTRADO, MAS NÃO HOMOLOGADO. As specs do SIGA vêm de um manual de 2014 obtido
 * de fonte secundária, e nenhum arquivo gerado passou pelo validador oficial do Tribunal. Estar no
 * registro significa "há um adapter que sabe o formato" — não "pode transmitir". Ver o README de
 * `adapters/tribunais/tcm-ba/`. O seed de plano de contas do ente baiano entra em PR próprio.
 */

/**
 * O FORMATO DE UM CÓDIGO DE TRIBUNAL: `AAA-UF`. Três letras de sigla (TCE, TCM, TCU), hífen, a UF
 * em duas letras. Maiúsculas — o código é chave, e chave que aceita caixa mista é duas chaves.
 */
const FORMATO_CODIGO = /^[A-Z]{3}-[A-Z]{2}$/;

/** O mapa código → exportador. Congelado: o registro é leitura, nunca mutação em runtime. */
const TRIBUNAIS: ReadonlyMap<string, ExportadorTribunal> = new Map<string, ExportadorTribunal>([
  [tcePb.codigo, tcePb],
  [tcmBa.codigo, tcmBa],
]);

/**
 * Os códigos suportados, ORDENADOS — a ordem de um `Map` é a de inserção, e uma lista que muda de
 * ordem conforme se acrescenta um adapter faria uma mensagem de erro (ou um teste) variar sem que
 * nada de fato mudasse.
 */
export function tribunaisSuportados(): readonly string[] {
  return [...TRIBUNAIS.keys()].sort();
}

/**
 * RESOLVE O CÓDIGO NO EXPORTADOR DAQUELE TRIBUNAL.
 *
 * ⚠️ CÓDIGO MALFORMADO E CÓDIGO DESCONHECIDO DÃO O MESMO ERRO, e isso é deliberado: para quem
 * chama, "tcE-pb" e "TCX-ZZ" são a mesma coisa — um código que este sistema não sabe exportar.
 * Dois erros distintos convidariam o chamador a tratar um deles como recuperável, e nenhum é: sem
 * exportador não há remessa. O código entra na mensagem para que o operador veja o que o
 * `EnteConfig` realmente tem.
 */
export function resolverTribunal(codigo: string): ExportadorTribunal {
  if (!FORMATO_CODIGO.test(codigo)) {
    throw new Error("TRIBUNAL_NAO_SUPORTADO: " + codigo);
  }
  const exportador = TRIBUNAIS.get(codigo);
  if (exportador === undefined) {
    throw new Error("TRIBUNAL_NAO_SUPORTADO: " + codigo);
  }
  return exportador;
}
