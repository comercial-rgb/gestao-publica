import type { Periodicidade } from "./registry.js";

/**
 * NOMENCLATURA OFICIAL DOS ARQUIVOS — layout §3.
 *
 * Copiada do layout local (exemplos conferidos):
 *   · DIÁRIA: `[codUG][ddmmaaaa][Nome].txt`  →  ex. `20100101012019Empenhos.txt`
 *   · MENSAL: `[codUG][mmaaaa][Nome].txt`     →  ex. `201001012019SaldoMensal.txt`
 *   · ANUAL:  `[codUG][aaaa][Nome].txt`       →  ex. `2010012020PloaAcao.txt`
 *
 * O `codUG` inicia o nome. A competência é a data do FATO (sempre UTC). O `[Nome]` é a `entidade`
 * do layout (ex.: "Empenhos", "Dotacao"). Extensão `.txt`.
 */

function dd(d: Date): string {
  return String(d.getUTCDate()).padStart(2, "0");
}
function mm(d: Date): string {
  return String(d.getUTCMonth() + 1).padStart(2, "0");
}
function aaaa(d: Date): string {
  return String(d.getUTCFullYear()).padStart(4, "0");
}

export interface NomeArquivoInput {
  readonly codUnidadeGestora: string;
  readonly periodicidade: Periodicidade;
  /** O `[Nome]` do layout — a entidade (ex.: "Empenhos"). */
  readonly entidade: string;
  /** A competência do arquivo (a data do fato). O dia só é usado na periodicidade DIÁRIA. */
  readonly competencia: Date;
}

export function nomeArquivo(input: NomeArquivoInput): string {
  const { codUnidadeGestora, periodicidade, entidade, competencia: c } = input;
  if (Number.isNaN(c.getTime())) {
    throw new Error(`SAGRES/nomenclatura — competência inválida para ${entidade}.`);
  }
  let dataParte: string;
  switch (periodicidade) {
    case "DIARIO":
      dataParte = `${dd(c)}${mm(c)}${aaaa(c)}`;
      break;
    case "MENSAL":
      dataParte = `${mm(c)}${aaaa(c)}`;
      break;
    case "ANUAL":
      dataParte = aaaa(c);
      break;
  }
  return `${codUnidadeGestora}${dataParte}${entidade}.txt`;
}
