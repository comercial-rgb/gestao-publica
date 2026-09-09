import type { Money } from "../../../../packages/contracts/index.js";
import { alfa, data, numerico, valor, zeros, type Onde } from "./formatadores.js";

/**
 * REGISTRY DECLARATIVA — SAGRES Contabilidade TCE-PB, POR VERSÃO DE LAYOUT.
 *
 * O prompt-mestre pede "uma registry declarativa por versão do layout, com nome da entidade,
 * periodicidade, campos, posição inicial/final, tipo, tamanho, obrigatoriedade, origem e função de
 * transformação. Evite dezenas de substring e concatenações dispersas."
 *
 * Aqui está: cada arquivo é uma LISTA de campos (`CampoLayout`), cada campo declara a sua posição
 * OFICIAL (`posInicial`/`posFinal`, copiadas do layout v1.1) e como se extrai o valor do fato
 * (`extrair`). O serializador é UM só, guiado pela lista — não há `substring` espalhado. E a própria
 * lista se AUTO-VALIDA (`validarLayout`): posições têm de ser contíguas a partir de 1, sem buraco nem
 * sobreposição. Um erro de transcrição do layout falha no boot do teste, não no arquivo que vai ao TCE.
 */

export type Periodicidade = "DIARIO" | "MENSAL" | "ANUAL";

/** O tipo de campo decide o formatador aplicado — e como o "não exigido" é preenchido. */
export type TipoCampo =
  | "NUMERICO" // inteiro, zeros à esquerda
  | "VALOR" //    monetário, 13 int + vírgula + 2 dec
  | "DATA" //     ddmmaaaa
  | "ALFA" //     caractere, espaços à direita
  | "RESERVADO"; // = ZEROS (reservado ao TCE)

/** O que um `extrair` pode devolver, por tipo. O serializador aplica o formatador certo. */
export type ValorBruto = string | number | Money | Date | null | undefined;

export interface CampoLayout<T> {
  readonly nome: string;
  readonly posInicial: number;
  readonly posFinal: number;
  readonly tipo: TipoCampo;
  readonly obrigatorio: boolean;
  /** Origem real no modelo (tabela.campo), constante do layout, ou "= ZEROS". Documental — vai à matriz. */
  readonly origem: string;
  /** A função de transformação: do fato ao valor bruto do campo. RESERVADO não precisa. */
  readonly extrair?: (fato: T) => ValorBruto;
}

export interface LayoutArquivo<T> {
  /** Nome oficial do arquivo (o `[Nome]` da nomenclatura, ex.: "Dotacao", "Empenhos"). */
  readonly entidade: string;
  readonly periodicidade: Periodicidade;
  readonly versao: string;
  readonly campos: readonly CampoLayout<T>[];
}

/** Largura do campo, derivada das posições oficiais (não redigitada). */
export function larguraCampo<T>(c: CampoLayout<T>): number {
  return c.posFinal - c.posInicial + 1;
}

/** Largura total do registro = posição final do último campo. */
export function larguraRegistro<T>(layout: LayoutArquivo<T>): number {
  return layout.campos.reduce((max, c) => Math.max(max, c.posFinal), 0);
}

/**
 * AUTO-VALIDAÇÃO DA REGISTRY — a rede que pega erro de transcrição do layout.
 * As posições têm de começar em 1 e ser contíguas (cada campo começa onde o anterior terminou + 1).
 * Buraco ou sobreposição = erro nomeado. Roda no teste; nunca deixa um layout torto gerar arquivo.
 */
export function validarLayout<T>(layout: LayoutArquivo<T>): void {
  let esperado = 1;
  for (const c of layout.campos) {
    if (c.posInicial !== esperado) {
      throw new Error(
        `SAGRES/registry — ${layout.entidade}: campo "${c.nome}" começa em ${c.posInicial}, ` +
          `mas o campo anterior terminou em ${esperado - 1} (esperado ${esperado}). ` +
          `Buraco ou sobreposição de posição — confira contra o layout oficial.`
      );
    }
    if (c.posFinal < c.posInicial) {
      throw new Error(
        `SAGRES/registry — ${layout.entidade}: campo "${c.nome}" tem posFinal ${c.posFinal} < posInicial ${c.posInicial}.`
      );
    }
    if (c.tipo !== "RESERVADO" && c.extrair === undefined) {
      throw new Error(
        `SAGRES/registry — ${layout.entidade}: campo "${c.nome}" (${c.tipo}) não declara \`extrair\`.`
      );
    }
    esperado = c.posFinal + 1;
  }
}

/** Aplica o formatador do tipo, devolvendo EXATAMENTE a largura do campo. */
function formatarCampo<T>(c: CampoLayout<T>, fato: T): string {
  const tam = larguraCampo(c);
  const onde: Onde = { arquivo: "", campo: c.nome };
  if (c.tipo === "RESERVADO") return zeros(tam);
  const bruto = c.extrair!(fato);
  switch (c.tipo) {
    case "NUMERICO":
      return numerico(bruto as string | number | null | undefined, tam, onde);
    case "VALOR":
      return valor(bruto as Money | null | undefined, tam, onde);
    case "DATA":
      return data(bruto as Date | null | undefined, onde);
    case "ALFA":
      return alfa(bruto as string | null | undefined, tam, onde);
  }
}

/**
 * SERIALIZA UM registro (uma linha), guiado pela registry. Cada campo vira exatamente a sua largura;
 * a linha é a concatenação. Uma conferência final garante que a soma bate com a largura do layout —
 * se um formatador devolvesse largura errada, isto pega antes de o byte sair.
 */
export function serializarRegistro<T>(layout: LayoutArquivo<T>, fato: T): string {
  let linha = "";
  for (const c of layout.campos) {
    const s = formatarCampo(c, fato);
    const tam = larguraCampo(c);
    if (s.length !== tam) {
      throw new Error(
        `SAGRES/registry — ${layout.entidade}: campo "${c.nome}" produziu ${s.length} posições, ` +
          `esperado ${tam}. Bug de formatador.`
      );
    }
    linha += s;
  }
  const larguraEsperada = larguraRegistro(layout);
  if (linha.length !== larguraEsperada) {
    throw new Error(
      `SAGRES/registry — ${layout.entidade}: registro com ${linha.length} posições, esperado ${larguraEsperada}.`
    );
  }
  return linha;
}

/**
 * O ARQUIVO, em BYTES UTF-8 (sem BOM) — devolve `Buffer`, não `string`, pela mesma razão do MANAD:
 * a codificação é uma decisão da fronteira, não do chamador. O SAGRES é UTF-8 (layout §3).
 *
 * ⚠️ QUEBRA DE LINHA = CRLF. O layout v1.1 local NÃO especifica CR/LF vs LF; CRLF é a convenção dos
 * arquivos-texto fiscais do TCE-PB (e do MANAD). É uma ESCOLHA documentada — a confirmar no aceite/
 * validador oficial (vai nomeada no bloco verde).
 */
export function serializarArquivo<T>(layout: LayoutArquivo<T>, fatos: readonly T[]): Buffer {
  const texto = fatos.map((f) => serializarRegistro(layout, f) + "\r\n").join("");
  return Buffer.from(texto, "utf8");
}
