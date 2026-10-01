import { Decimal } from "../../packages/contracts/index.js";
import type { LocalDeIncidencia } from "./calculo-da-retencao.js";

/**
 * LEITURA DAS FONTES OFICIAIS da retenção (V24) — funções puras sobre o texto já extraído dos
 * documentos em `docs/oficial/`. Quem lê o disco e grava no banco é `scripts/carregar-tabelas-da-retencao.ts`.
 *
 * Cada leitor recusa (lança) quando o texto não tem a forma esperada: uma tabela normativa lida pela
 * metade é pior que nenhuma. As conferências independentes estão no teste.
 */

const decimalBr = (s: string): Decimal => new Decimal(s.replace(",", "."));

// ── IR: Anexo I da IN RFB 1.234/2012 ───────────────────────────────────────────────────────────────

export interface LinhaDoAnexoI {
  readonly codigoReceita: string;
  readonly natureza: string;
  /** Percentuais como publicados (1,2 = 1,2%). */
  readonly ir: Decimal;
  readonly csll: Decimal;
  readonly cofins: Decimal;
  readonly pis: Decimal;
  readonly total: Decimal;
}

const LINHA_DE_ALIQUOTAS = /^(.*?)\s{2,}(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d+,\d+)\s+(\d{4})\s*$/;

/** O texto do Anexo I (pdftotext -layout): cada natureza começa na linha que traz as alíquotas. */
export function lerAnexoIDaIN1234(texto: string): readonly LinhaDoAnexoI[] {
  const linhas = texto.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== "");
  const inicio = linhas.findIndex((l) => LINHA_DE_ALIQUOTAS.test(l));
  if (inicio < 0) throw new Error("Anexo I: nenhuma linha de alíquotas encontrada.");
  const saida: { codigoReceita: string; partes: string[]; nums: string[] }[] = [];
  for (const l of linhas.slice(inicio)) {
    const m = LINHA_DE_ALIQUOTAS.exec(l);
    if (m !== null) {
      saida.push({ codigoReceita: m[7]!, partes: [m[1]!.trim()], nums: [m[2]!, m[3]!, m[4]!, m[5]!, m[6]!] });
    } else {
      saida.at(-1)!.partes.push(l.trim());
    }
  }
  return saida.map((s) => ({
    codigoReceita: s.codigoReceita,
    natureza: s.partes.join(" ").replace(/\s+/g, " ").replace(/- /g, "").trim(),
    ir: decimalBr(s.nums[0]!),
    csll: decimalBr(s.nums[1]!),
    cofins: decimalBr(s.nums[2]!),
    pis: decimalBr(s.nums[3]!),
    total: decimalBr(s.nums[4]!),
  }));
}

// ── INSS: IN RFB 2.110/2022 ────────────────────────────────────────────────────────────────────────

/** O trecho de um artigo, do "Art. N." até o próximo "Art.". */
function artigo(texto: string, n: number): string[] {
  const linhas = texto.split(/\r?\n/);
  const i = linhas.findIndex((l) => l.startsWith(`Art. ${n}. `));
  if (i < 0) throw new Error(`IN RFB 2.110/2022: art. ${n} não encontrado.`);
  const fim = linhas.findIndex((l, k) => k > i && /^Art\. \d+(-[A-Z])?\. /.test(l));
  return linhas.slice(i, fim < 0 ? undefined : fim);
}

export interface ServicoLido {
  readonly codigo: string;
  readonly artigo: 111 | 112;
  readonly inciso: string;
  readonly descricao: string;
  readonly somenteCessaoDeMaoDeObra: boolean;
  readonly construcaoCivil: boolean;
}

/** O nome do serviço: o começo do inciso, até a primeira oração que o detalha. */
function nomeDoServico(texto: string): string {
  const m = /^(.*?)(?:,\s(?:que|quando|relacionados|realizados|aqueles|assim|executados)\b|;|$)/.exec(texto);
  return (m?.[1] ?? texto).trim();
}

/** Arts. 111 (cessão ou empreitada) e 112 (só cessão): os incisos, na ordem. */
export function lerServicosDaIN2110(texto: string): readonly ServicoLido[] {
  const saida: ServicoLido[] = [];
  for (const art of [111, 112] as const) {
    for (const l of artigo(texto, art)) {
      const m = /^([IVXL]+) - (.+)$/.exec(l.trim());
      if (m === null) continue;
      const nome = nomeDoServico(m[2]!);
      saida.push({
        codigo: `${art}-${m[1]}`,
        artigo: art,
        inciso: m[1]!,
        descricao: nome,
        somenteCessaoDeMaoDeObra: art === 112,
        construcaoCivil: art === 111 && /^construção civil$/i.test(nome),
      });
    }
  }
  return saida;
}

export interface BaseMinimaLida {
  readonly codigo: string;
  readonly descricao: string;
  readonly percentual: Decimal;
  /** O percentual como escrito por extenso, para a conferência. */
  readonly extenso: string;
}

const PCT = /(\d+)% \(([^)]+?) por cento\)/;

/** Art. 117 (incisos I a IV) e art. 118, II (alíneas a e b, itens 1 a 5). */
export function lerBasesMinimasDaIN2110(texto: string): readonly BaseMinimaLida[] {
  const saida: BaseMinimaLida[] = [];
  for (const l of artigo(texto, 117)) {
    const m = /^([IVX]+) - (.+)$/.exec(l.trim());
    const p = m === null ? null : PCT.exec(m[2]!);
    if (m === null || p === null) continue;
    const desc = m[2]!.slice(p.index + p[0].length).replace(/^,?\s*(para os |quando se referir a |nos )?/, "").replace(/[;.]\s*(e)?$/, "").trim();
    saida.push({ codigo: `117-${m[1]}`, descricao: desc, percentual: new Decimal(p[1]!).dividedBy(100), extenso: p[2]! });
  }
  for (const l of artigo(texto, 118)) {
    const t = l.trim();
    const a = /^([a-z])\) (.+)$/.exec(t);
    const n = /^(\d)\. (.+)$/.exec(t);
    const corpo = a?.[2] ?? n?.[2];
    if (corpo === undefined) continue;
    const p = PCT.exec(corpo);
    if (p === null) continue;
    const codigo = a !== null ? `118-II-${a[1]}` : `118-II-b-${n![1]}`;
    const desc = corpo.slice(p.index + p[0].length).replace(/^,?\s*(para (a |os )?)?/, "").replace(/[;.]\s*(e)?$/, "").trim();
    saida.push({ codigo, descricao: desc, percentual: new Decimal(p[1]!).dividedBy(100), extenso: p[2]! });
  }
  return saida;
}

/** Art. 110 (a alíquota) e art. 238 (o mínimo para recolhimento). */
export function lerAliquotaEMinimoDaIN2110(texto: string): { readonly aliquota: Decimal; readonly valorMinimo: Decimal } {
  const a = /deverá reter (\d+)% \(onze por cento\)/.exec(artigo(texto, 110)[0]!);
  const m = /inferior a R\$ (\d+,\d{2}) \(dez reais\)/.exec(artigo(texto, 238)[0]!);
  if (a === null || m === null) throw new Error("IN RFB 2.110/2022: alíquota do art. 110 ou mínimo do art. 238 fora da forma esperada.");
  return { aliquota: new Decimal(a[1]!).dividedBy(100), valorMinimo: decimalBr(m[1]!) };
}

// ── ISS: Anexo I da LC 80/2017 na redação da LC 132/2025 (Esperança) ───────────────────────────────

export interface RegraDeAliquotaDoISS {
  /** Itens inteiros ("1") e subitens avulsos ("10.05") a que a alínea se aplica. Vazio = "demais". */
  readonly itens: readonly string[];
  readonly subitens: readonly string[];
  readonly aliquota: Decimal;
  /** O trecho literal da alínea, conferido contra o texto da lei. */
  readonly trecho: string;
}

/**
 * As alíneas do art. 62, I, na redação do art. 4º da LC 132/2025. A tabela é escrita aqui (a lei é
 * prosa), mas cada linha traz o trecho LITERAL de onde saiu, e `conferirRegrasDoISS` recusa se o trecho
 * não estiver no texto publicado ou se o percentual do trecho não for o da linha.
 */
export const REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA: readonly RegraDeAliquotaDoISS[] = [
  { itens: ["1"], subitens: ["10.09", "10.05"], aliquota: new Decimal("0.02"), trecho: "a) 2% (dois por cento) para os serviços de informática e congêneres, descritos no item 1, e seus subitens, da Lista de Serviços constante do Anexo I deste Código e para os serviços do subitem 10.9 e 10.5" },
  { itens: ["2"], subitens: [], aliquota: new Decimal("0.02"), trecho: "b) 2 % (dois por cento) para os serviços de pesquisas e desenvolvimento de qualquer natureza, descritos no item 2" },
  { itens: ["4"], subitens: [], aliquota: new Decimal("0.02"), trecho: "c) 2% (dois por cento) para os serviços de saúde, assistência médica e congêneres, descritos no item 4, e seus subitens" },
  { itens: ["21"], subitens: [], aliquota: new Decimal("0.036"), trecho: "d) 3,6% (três inteiros e seis décimos por cento) para os serviços de registros públicos, cartorários e notariais descritos no item 21" },
  { itens: ["8"], subitens: [], aliquota: new Decimal("0.03"), trecho: "e) 3% (três por cento) para os serviços de educação, ensino, orientação pedagógica e educacional, instrução, treinamento e avaliação pessoa de qualquer grau ou natureza, descritos no item 8, e seus subitens" },
  { itens: [], subitens: [], aliquota: new Decimal("0.05"), trecho: "f) 5% (cinco por cento) para os demais serviços descritos nos itens e subitens da Lista de Serviços" },
];

const normalizarEspacos = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Cada trecho tem de estar no texto da lei, e o percentual escrito nele tem de ser o da regra. */
export function conferirRegrasDoISS(textoDaLei: string, regras: readonly RegraDeAliquotaDoISS[]): void {
  const lei = normalizarEspacos(textoDaLei);
  for (const r of regras) {
    if (!lei.includes(normalizarEspacos(r.trecho))) throw new Error(`Trecho não encontrado no texto da lei: "${r.trecho.slice(0, 80)}..."`);
    const p = /^[a-f]\) (\d+(?:,\d+)?) ?%/.exec(r.trecho);
    if (p === null || !decimalBr(p[1]!).dividedBy(100).equals(r.aliquota)) throw new Error(`O percentual do trecho não é o da regra: "${r.trecho.slice(0, 40)}".`);
  }
}

export interface ItemDaListaLido {
  readonly subitem: string;
  readonly descricao: string;
  readonly aliquota: Decimal;
  readonly localDeIncidencia: LocalDeIncidencia;
  readonly marcadoRetencaoNaFonte: boolean;
}

const lerCsv = (csv: string): string[][] =>
  csv.split(/\r?\n/).filter((l) => l.trim() !== "").slice(1).map((l) => l.split(";"));

/** "2.1" → "2.01": a lei escreve os dois jeitos. Devolve nulo para o que não é código de subitem. */
export function normalizarSubitem(c: string): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})$/.exec(c.trim());
  return m === null ? null : `${Number(m[1])}.${m[2]!.padStart(2, "0")}`;
}

/**
 * Junta as descrições (extraídas por posição) com as marcas de domicílio fiscal (extraídas por posição
 * das marcas) e a alíquota do art. 62. VETADO fica de fora. Um subitem sem marca de domicílio, ou com
 * mais de uma, é recusado: o local de incidência não pode ser adivinhado.
 */
export function montarListaDoISS(descricoesCsv: string, marcasCsv: string, regras: readonly RegraDeAliquotaDoISS[]): readonly ItemDaListaLido[] {
  // As linhas sem código são marcas em linhas de CABEÇALHO de item (conferido no teste) e ficam de fora.
  const marcas = new Map(
    lerCsv(marcasCsv).flatMap((c) => {
      const k = normalizarSubitem(c[0]!);
      return k === null ? [] : [[k, c] as const];
    })
  );
  const demais = regras.find((r) => r.itens.length === 0 && r.subitens.length === 0);
  if (demais === undefined) throw new Error("Falta a alíquota dos demais serviços.");
  const saida: ItemDaListaLido[] = [];
  for (const [subitem, descricao] of lerCsv(descricoesCsv)) {
    if (subitem === undefined || descricao === undefined) continue;
    if (/^VETADO\.?$/i.test(descricao.trim())) continue;
    const m = marcas.get(subitem);
    if (m === undefined) throw new Error(`Subitem ${subitem} sem marca de domicílio fiscal.`);
    const [, prestador, tomador, local, retencao] = m.map((x) => x?.trim() === "x");
    const locais = [prestador && "ESTABELECIMENTO_DO_PRESTADOR", tomador && "ESTABELECIMENTO_DO_TOMADOR", local && "LOCAL_DA_PRESTACAO"].filter(Boolean) as LocalDeIncidencia[];
    if (locais.length !== 1) throw new Error(`Subitem ${subitem}: ${locais.length} marcas de domicílio fiscal; o local de incidência não pode ser escolhido.`);
    const item = subitem.split(".")[0]!;
    const regra = regras.find((r) => r.subitens.includes(subitem.replace(/\.0(\d)$/, ".$1")) || r.subitens.includes(subitem)) ?? regras.find((r) => r.itens.includes(item)) ?? demais;
    saida.push({ subitem, descricao: descricao.trim(), aliquota: regra.aliquota, localDeIncidencia: locais[0]!, marcadoRetencaoNaFonte: retencao === true });
  }
  return saida;
}
