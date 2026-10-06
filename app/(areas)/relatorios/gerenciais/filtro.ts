import { soDigitos } from "../../../../lib/format/mascaras";
import type { VinculoDoEmpenho } from "../../../../modules/m05-despesa/consultas";

/**
 * O RECORTE GERENCIAL LIDO DA URL — credor e fonte.
 *
 * ⚠️ ESTE MÓDULO EXISTE PARA QUE A TELA E A ROTA DE PDF LEIAM A URL DO **MESMO** JEITO.
 * São dois arquivos diferentes lendo a mesma query string; duas cópias de
 * `sp.get("credor")` divergiriam no primeiro caso de borda (o parâmetro repetido, o
 * documento mascarado colado à mão) — e aí o papel sairia com um recorte e a tela com
 * outro, que é precisamente a mentira que a exportação não pode contar.
 *
 * ⚠️ SEM DOMÍNIO E SEM PRISMA — é leitura de string, no espírito de `lib/recorte.ts`.
 */

export interface RecorteGerencial {
  /** CPF/CNPJ só dígitos. `undefined` = todos os credores. */
  readonly credorCpfCnpj: string | undefined;
  /** Código da fonte. `undefined` = todas as fontes. */
  readonly fonteCodigo: string | undefined;
  /**
   * V36 — o vínculo de cadastro de que se abriram os empenhos (obra, convênio, precatório,
   * consórcio, dívida). Os cadastros apontam para cá com `?obra={id}` e afins; antes este leitor
   * ignorava o parâmetro e a tela mostrava TODOS os empenhos com o título do vínculo.
   */
  readonly vinculo: VinculoDoEmpenho | undefined;
}

/** Parâmetro da URL -> dimensão do empenho. A ordem decide se vierem dois (vale o primeiro). */
const PARAMETRO_DO_VINCULO: readonly (readonly [string, VinculoDoEmpenho["dimensao"]])[] = [
  ["obra", "obraId"],
  ["convenio", "convenioId"],
  ["precatorio", "precatorioId"],
  ["consorcio", "consorcioId"],
  ["divida", "dividaId"],
];

type Params = Record<string, string | string[] | undefined>;

/** Um `searchParam` pode vir repetido (`?fonte=a&fonte=b`); vale o primeiro. */
function primeiro(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Lê o recorte gerencial.
 *
 * ⚠️ O CREDOR É NORMALIZADO PARA **SÓ DÍGITOS** AQUI, NA BORDA. A coluna
 * `Empenho.credorCpfCnpj` guarda o documento cru, e o filtro é casamento EXATO — um
 * "12.345.678/0001-95" colado de um e-mail não casaria com "12345678000195" e a tela
 * responderia "sem empenhos", que é falso. `soDigitos` é a mesma função que a máscara da
 * UI usa: uma só definição de "o que é o documento".
 */
export function recorteGerencialDe(sp: Params): RecorteGerencial {
  const credor = soDigitos(primeiro(sp["credor"]) ?? "");
  const fonte = (primeiro(sp["fonte"]) ?? "").trim();
  let vinculo: VinculoDoEmpenho | undefined;
  for (const [parametro, dimensao] of PARAMETRO_DO_VINCULO) {
    const id = (primeiro(sp[parametro]) ?? "").trim();
    if (id !== "") {
      vinculo = { dimensao, id };
      break;
    }
  }
  return {
    credorCpfCnpj: credor !== "" ? credor : undefined,
    fonteCodigo: fonte !== "" ? fonte : undefined,
    vinculo,
  };
}

/** "credor 12345678000195 · fonte 500" — o que dizer ao leitor sobre o que ele NÃO está vendo. */
export function descreverFiltroGerencial(r: RecorteGerencial): readonly string[] {
  return [
    r.credorCpfCnpj !== undefined ? `credor ${r.credorCpfCnpj}` : null,
    r.fonteCodigo !== undefined ? `fonte ${r.fonteCodigo}` : null,
  ].filter((x): x is string => x !== null);
}

/** O parâmetro da URL que carrega o vínculo — para a tela devolvê-lo ao link do PDF. */
export function parametroDoVinculo(v: VinculoDoEmpenho): string {
  const par = PARAMETRO_DO_VINCULO.find(([, d]) => d === v.dimensao);
  // Toda dimensão de VinculoDoEmpenho está na tabela; o tipo garante, o fallback só fecha o switch.
  return par === undefined ? v.dimensao : par[0];
}
