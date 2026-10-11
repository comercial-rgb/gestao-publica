/**
 * V39-R3 (R3-020) — A REGRA DO NÚMERO MÍNIMO DE PREÇOS, LIDA DO TEXTO OFICIAL da Instrução Normativa SEGES/ME nº 65/2021
 * (docs/oficial/compras/in-seges-me-65-2021.txt). Pura: quem lê o arquivo e confere o sha256 é a carga
 * (scripts/carregar-regra-da-pesquisa-de-precos.ts); o teste usa a MESMA leitura sobre o MESMO arquivo.
 *
 * O número sai da frase do art. 6º ("desde que o cálculo incida sobre um conjunto de três ou mais preços"). A vigência é a
 * da publicação (art. 11: "entra em vigor na data de sua publicação"), lida do "Publicado em" da página oficial guardada,
 * no início do dia civil do ente — não a data do título (o ato é de 7/7; a página diz 8/7). A data do Diário Oficial não
 * foi conferida à parte (pendência nomeada no MODULO.md). Título, publicação ou frase ausentes recusam: nada se presume.
 */
import { inicioDoDiaCivil } from "../../packages/datas/index.js";

const POR_EXTENSO: Readonly<Record<string, number>> = { dois: 2, três: 3, quatro: 4, cinco: 5 };

export function regraDoTextoDaIn65(texto: string): { readonly minimoDePrecos: number; readonly vigenteDesde: Date } {
  const titulo = /N[ºo°]\s*65,\s*DE\s+(\d{1,2})\s+DE\s+JULHO\s+DE\s+(\d{4})/i.exec(texto);
  if (titulo === null) throw new Error("O título da IN 65 não foi achado no texto. Nada foi gravado.");
  const publicado = /Publicado em\s+(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (publicado === null) throw new Error("A data de publicação da IN 65 não foi achada no texto. Nada foi gravado.");
  const vigenteDesde = inicioDoDiaCivil(`${publicado[3] ?? ""}-${publicado[2] ?? ""}-${publicado[1] ?? ""}`);
  const frase = /Art\.\s*6º[^\n]*?conjunto de (\S+) ou mais preços/.exec(texto);
  const minimo = frase === null ? undefined : POR_EXTENSO[frase[1] ?? ""];
  if (minimo === undefined) throw new Error("A frase do art. 6º (\"conjunto de ... ou mais preços\") não foi achada ou não se lê. Nada foi gravado.");
  return { minimoDePrecos: minimo, vigenteDesde };
}
