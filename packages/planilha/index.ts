import { lerEntradasDoZip } from "../zip/index.js";

/**
 * ═══ LER UM .XLSX — SÓ O NECESSÁRIO PARA O CORPUS OFICIAL ═══
 *
 * ⚠️ POR QUE ISTO EXISTE. O TCE-PB publica o plano de contas, os subelementos e o
 * relacionamento fonte×CO em `.xlsx`. Sem um leitor, a alternativa para colocar o plano
 * oficial no sistema é DIGITAR código de conta — a fabricação que o smoke do ENT03c se
 * recusou a fazer, e com razão. Esta é a ponte entre "a tabela real" e o banco.
 *
 * ⚠️ É UM LEITOR, NÃO UMA BIBLIOTECA DE PLANILHA. Não há fórmulas, estilos, datas,
 * gráficos nem escrita. O `.xlsx` do TCE é uma grade de texto, e ler mais do que isso
 * seria manter código que ninguém exercita.
 *
 * ═══ ⚠️ AS DUAS ARMADILHAS DO FORMATO QUE ESTE ARQUIVO TRATA ═══
 *
 * **1. A célula VAZIA não aparece.** O XML de uma linha só traz as células escritas: uma
 * linha com A e C vem com duas `<c>`, e quem empilhar por ordem de chegada põe o valor de
 * C na coluna B. Por isso cada célula é posicionada pela SUA REFERÊNCIA (`r="C7"`), nunca
 * pela ordem — e a linha é remontada por índice.
 *
 * **2. O texto mora numa tabela à parte.** `t="s"` significa que `<v>` é um ÍNDICE em
 * `sharedStrings.xml`, e não o texto. Ler o `<v>` direto devolve números onde deveria
 * haver descrição de conta.
 *
 * ⚠️ E A ORDEM DAS ABAS VEM DO `workbook.xml`, NÃO DOS NOMES DOS ARQUIVOS. `sheet1.xml`
 * não é necessariamente a primeira aba; o vínculo passa por `workbook.xml.rels`.
 */

export type LinhaDaPlanilha = readonly string[];

/** As entidades que o XML obriga a escapar. Sem isto, "S&A" chega como "S&amp;A". */
function desescapar(t: string): string {
  return t
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    // ⚠️ `&amp;` POR ÚLTIMO, sempre. Antes dos outros, "&amp;lt;" viraria "<" — o texto
    // literal "&lt;" deixaria de existir.
    .replace(/&amp;/g, "&");
}

/** Todo o texto de `<t>…</t>` dentro de um trecho — um `<si>` pode ter várias corridas. */
function textoDe(trecho: string): string {
  let saida = "";
  for (const m of trecho.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) {
    saida += desescapar(m[1] ?? "");
  }
  return saida;
}

/** "BC" -> 54. A referência da célula é base-26 com letras, sem zero. */
export function indiceDaColuna(referencia: string): number {
  const letras = /^([A-Z]+)/.exec(referencia)?.[1] ?? "";
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function tabelaDeTextos(entradas: ReadonlyMap<string, Buffer>): readonly string[] {
  const xml = entradas.get("xl/sharedStrings.xml");
  if (xml === undefined) return [];
  const texto = xml.toString("utf8");
  return [...texto.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1] ?? ""));
}

function abas(entradas: ReadonlyMap<string, Buffer>): readonly { nome: string; alvo: string }[] {
  const wb = entradas.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const rels = entradas.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";

  const destinos = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /Id="([^"]+)"/.exec(m[0])?.[1];
    const alvo = /Target="([^"]+)"/.exec(m[0])?.[1];
    if (id !== undefined && alvo !== undefined) destinos.set(id, alvo);
  }

  const saida: { nome: string; alvo: string }[] = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const nome = desescapar(/name="([^"]*)"/.exec(m[0])?.[1] ?? "");
    const id = /r:id="([^"]+)"/.exec(m[0])?.[1];
    const alvo = id === undefined ? undefined : destinos.get(id);
    if (alvo === undefined) continue;
    const caminho = alvo.startsWith("/")
      ? alvo.slice(1)
      : alvo.startsWith("xl/")
        ? alvo
        : `xl/${alvo}`;
    saida.push({ nome, alvo: caminho });
  }
  return saida;
}

function linhasDaAba(xml: string, textos: readonly string[]): readonly LinhaDaPlanilha[] {
  const linhas: LinhaDaPlanilha[] = [];
  for (const linha of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas = new Map<number, string>();
    for (const c of (linha[1] ?? "").matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atributos = c[1] ?? "";
      const corpo = c[2] ?? "";
      const referencia = /r="([A-Z]+\d+)"/.exec(atributos)?.[1];
      if (referencia === undefined) continue;
      const tipo = /t="([^"]+)"/.exec(atributos)?.[1];

      let valor: string;
      if (tipo === "inlineStr") {
        valor = textoDe(corpo);
      } else {
        const v = /<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1];
        if (v === undefined) continue;
        // ⚠️ `t="s"` É ÍNDICE, NÃO TEXTO. Ler o `<v>` direto devolveria "412" onde a
        // planilha mostra "ATIVO CIRCULANTE".
        valor = tipo === "s" ? (textos[Number(v)] ?? "") : desescapar(v);
      }
      celulas.set(indiceDaColuna(referencia), valor.trim());
    }
    if (celulas.size === 0) continue;
    const largura = Math.max(...celulas.keys()) + 1;
    linhas.push(
      Array.from({ length: largura }, (_, i) => celulas.get(i) ?? "")
    );
  }
  return linhas;
}

/** As abas da planilha, na ordem do `workbook.xml`, cada uma como grade de texto. */
export function lerPlanilha(conteudo: Buffer): ReadonlyMap<string, readonly LinhaDaPlanilha[]> {
  const entradas = lerEntradasDoZip(conteudo);
  const textos = tabelaDeTextos(entradas);
  const saida = new Map<string, readonly LinhaDaPlanilha[]>();
  for (const { nome, alvo } of abas(entradas)) {
    const xml = entradas.get(alvo);
    if (xml === undefined) continue;
    saida.set(nome, linhasDaAba(xml.toString("utf8"), textos));
  }
  if (saida.size === 0) {
    throw new Error(
      "A planilha não tem nenhuma aba legível. O arquivo pode ser .xls antigo (formato " +
        "binário, não zip) em vez de .xlsx."
    );
  }
  return saida;
}

/** A primeira aba — o formato do TCE tem uma só, sempre. */
export function primeiraAba(conteudo: Buffer): readonly LinhaDaPlanilha[] {
  const planilha = lerPlanilha(conteudo);
  return [...planilha.values()][0] ?? [];
}
