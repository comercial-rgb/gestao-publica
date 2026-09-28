import { ziparEntradas } from "../zip/index.js";

/**
 * ═══ ESCREVER UM .XLSX — A EXPORTAÇÃO PARA EXCEL (V22) ═══
 *
 * Uma pasta de uma aba: cabeçalho em negrito, texto como `inlineStr` (sem tabela compartilhada),
 * valor monetário como NÚMERO com formato `#,##0.00`. O `.xlsx` é um zip de XML; o zip vem de
 * `packages/zip` (entradas armazenadas, data fixa: o mesmo conteúdo gera os mesmos bytes).
 *
 * ⚠️ DINHEIRO ATRAVESSA COMO TEXTO DECIMAL. O valor chega como a string que o domínio produziu
 * ("10000.00") e é gravado no `<v>` sem passar por `number` — nada aqui soma, arredonda ou
 * converte. O formato de exibição (milhar, duas casas) é do Excel, pelo estilo da célula. Uma
 * string que não é decimal é RECUSADA, nomeando a célula: gravar "10.000,00" no `<v>` faria o
 * Excel abrir um arquivo corrompido, ou ler dez.
 *
 * ⚠️ DATA SAI COMO TEXTO dd/mm/aaaa, já na data civil que a tela mostra. Um número de série do
 * Excel exigiria escolher fuso aqui dentro — e a régua da data civil é `packages/datas`, não este
 * arquivo.
 *
 * ⚠️ NÃO GERA FÓRMULA. Célula que começa com `=` é texto como qualquer outro (`inlineStr` não é
 * avaliado) — exportar um histórico "=HYPERLINK(...)" não vira link ativo na máquina de quem abre.
 */

export type CelulaDeSaida =
  | { readonly texto: string }
  | { readonly moeda: string }
  | { readonly inteiro: number };

export interface PlanilhaDeSaida {
  /** Nome da aba (até 31 caracteres; os proibidos pelo Excel são trocados por espaço). */
  readonly aba: string;
  readonly cabecalho: readonly string[];
  readonly linhas: readonly (readonly CelulaDeSaida[])[];
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // caracteres de controle não são XML válido — saem como espaço, e não quebram o arquivo
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

/** A → 0, Z → 25, AA → 26 — o inverso de `indiceDaColuna`. */
export function letraDaColuna(indice: number): string {
  let n = indice + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function nomeDaAba(nome: string): string {
  const limpo = nome.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31);
  return limpo === "" ? "Planilha" : limpo;
}

// estilos: 0 = padrão, 1 = cabeçalho em negrito, 2 = número #,##0.00 (numFmtId 4, embutido)
const ESTILO_CABECALHO = 1;
const ESTILO_MOEDA = 2;

function celula(ref: string, c: CelulaDeSaida): string {
  if ("texto" in c) return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapar(c.texto)}</t></is></c>`;
  if ("moeda" in c) {
    if (!DECIMAL.test(c.moeda)) {
      throw new Error(`Célula ${ref}: "${c.moeda}" não é um valor decimal (esperado como "1234.56"). Nada foi gerado.`);
    }
    return `<c r="${ref}" s="${ESTILO_MOEDA}"><v>${c.moeda}</v></c>`;
  }
  if (!Number.isSafeInteger(c.inteiro)) throw new Error(`Célula ${ref}: ${String(c.inteiro)} não é inteiro. Nada foi gerado.`);
  return `<c r="${ref}"><v>${c.inteiro}</v></c>`;
}

export function gerarXlsx(p: PlanilhaDeSaida): Buffer {
  const largura = p.cabecalho.length;
  const linhasXml: string[] = [];
  linhasXml.push(
    `<row r="1">${p.cabecalho.map((t, i) => `<c r="${letraDaColuna(i)}1" t="inlineStr" s="${ESTILO_CABECALHO}"><is><t xml:space="preserve">${escapar(t)}</t></is></c>`).join("")}</row>`
  );
  p.linhas.forEach((linha, li) => {
    if (linha.length !== largura) {
      throw new Error(`Linha ${li + 2}: ${linha.length} células para ${largura} colunas de cabeçalho. Nada foi gerado.`);
    }
    const r = li + 2;
    linhasXml.push(`<row r="${r}">${linha.map((c, ci) => celula(`${letraDaColuna(ci)}${r}`, c)).join("")}</row>`);
  });
  const ultima = `${letraDaColuna(Math.max(largura - 1, 0))}${p.linhas.length + 1}`;

  const planilha =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<dimension ref="A1:${ultima}"/>` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    `<cols>${p.cabecalho.map((t, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(60, Math.max(12, t.length + 4))}" customWidth="1"/>`).join("")}</cols>` +
    `<sheetData>${linhasXml.join("")}</sheetData>` +
    `<autoFilter ref="A1:${ultima}"/>` +
    `</worksheet>`;

  const estilos =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="3">` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` +
    `<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>` +
    `</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
    `</styleSheet>`;

  const pasta =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapar(nomeDaAba(p.aba))}" sheetId="1" r:id="rId1"/></sheets>` +
    (p.linhas.length > 0 || largura > 0 ? `<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nomeDaAba(p.aba).replace(/'/g, "''")}'!$A$1:$${letraDaColuna(Math.max(largura - 1, 0))}$${p.linhas.length + 1}</definedName></definedNames>` : "") +
    `</workbook>`;

  const utf8 = (s: string): Uint8Array => Buffer.from(s, "utf8");
  return ziparEntradas([
    {
      nome: "[Content_Types].xml",
      conteudo: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
          `<Default Extension="xml" ContentType="application/xml"/>` +
          `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
          `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
          `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
          `</Types>`
      ),
    },
    {
      nome: "_rels/.rels",
      conteudo: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
          `</Relationships>`
      ),
    },
    { nome: "xl/workbook.xml", conteudo: utf8(pasta) },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: utf8(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
          `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
          `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          `</Relationships>`
      ),
    },
    { nome: "xl/worksheets/sheet1.xml", conteudo: utf8(planilha) },
    { nome: "xl/styles.xml", conteudo: utf8(estilos) },
  ]);
}
