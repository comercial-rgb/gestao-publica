import { ziparEntradas } from "../../packages/zip/index.js";

/**
 * ═══ GRAVADORES DE PLANILHA PARA TESTE — .xlsx e .xls escritos a partir da especificação ═══
 *
 * Não importam nada de `packages/planilha` (o leitor que se testa). O .xls segue MS-CFB (contêiner) e MS-XLS (BIFF8); o
 * .xlsx, o mínimo do SpreadsheetML (workbook, relações, uma aba com texto em linha, número e fórmula com valor gravado).
 */

const FIM = 0xfffffffe;
const LIVRE = 0xffffffff;
const SETOR_DE_FAT = 0xfffffffd;

export function u16(n: number): Buffer { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
export function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }
export function dbl(n: number): Buffer { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; }
export function registro(tipo: number, ...partes: Buffer[]): Buffer { const d = Buffer.concat(partes); return Buffer.concat([u16(tipo), u16(d.length), d]); }

/** XLUnicodeString com cch de 16 bits; `alto` grava em UTF-16. */
export function texto16(s: string, alto: boolean): Buffer {
  return Buffer.concat([u16(s.length), Buffer.from([alto ? 1 : 0]), Buffer.from(s, alto ? "utf16le" : "latin1")]);
}

export interface Fluxo { readonly nome: string; readonly dados?: Buffer; readonly armazenamento?: boolean }

/** Contêiner CFB versão 3 (setor de 512, mini-setor de 64, corte de 4.096). */
export function conteiner(fluxos: readonly Fluxo[], opcoes: { readonly fatEmLaco?: boolean } = {}): Buffer {
  const setores: Buffer[] = [];
  const fat: number[] = [];
  const alocar = (dados: Buffer): number => {
    if (dados.length === 0) return FIM;
    const inicio = setores.length;
    for (let off = 0; off < dados.length; off += 512) {
      const s = Buffer.alloc(512);
      dados.copy(s, 0, off, Math.min(off + 512, dados.length));
      setores.push(s);
      fat.push(setores.length);
    }
    fat[fat.length - 1] = FIM;
    return inicio;
  };
  const mini: Buffer[] = [];
  const miniFat: number[] = [];
  const entradas: { nome: string; tipo: number; inicio: number; tamanho: number }[] = [];
  for (const f of fluxos) {
    if (f.armazenamento === true) { entradas.push({ nome: f.nome, tipo: 1, inicio: 0, tamanho: 0 }); continue; }
    const dados = f.dados ?? Buffer.alloc(0);
    if (dados.length < 4096) {
      const inicio = mini.length;
      for (let off = 0; off < dados.length; off += 64) {
        const s = Buffer.alloc(64);
        dados.copy(s, 0, off, Math.min(off + 64, dados.length));
        mini.push(s);
        miniFat.push(mini.length);
      }
      miniFat[miniFat.length - 1] = FIM;
      entradas.push({ nome: f.nome, tipo: 2, inicio, tamanho: dados.length });
    } else {
      entradas.push({ nome: f.nome, tipo: 2, inicio: alocar(dados), tamanho: dados.length });
    }
  }
  const miniFluxo = Buffer.concat(mini);
  const raizInicio = alocar(miniFluxo);
  const miniFatInicio = alocar(Buffer.concat(miniFat.map(u32)));
  const todas = [{ nome: "Root Entry", tipo: 5, inicio: raizInicio, tamanho: miniFluxo.length }, ...entradas];
  const dir = Buffer.concat(todas.map((e, i) => {
    const b = Buffer.alloc(128);
    b.write(e.nome, 0, "utf16le");
    b.writeUInt16LE((e.nome.length + 1) * 2, 0x40);
    b.writeUInt8(e.tipo, 0x42);
    b.writeUInt8(1, 0x43); // preto
    b.writeUInt32LE(LIVRE, 0x44);
    b.writeUInt32LE(i > 0 && i < todas.length - 1 ? i + 1 : LIVRE, 0x48); // irmão à direita
    b.writeUInt32LE(i === 0 && todas.length > 1 ? 1 : LIVRE, 0x4c); // filho da raiz
    b.writeUInt32LE(e.inicio, 0x74);
    b.writeUInt32LE(e.tamanho, 0x78);
    return b;
  }));
  const dirInicio = alocar(dir);
  // Setores de FAT no fim: cada um endereça 128 setores, inclusive a si mesmo.
  let nFat = 1;
  while (Math.ceil((setores.length + nFat) / 128) > nFat) nFat += 1;
  const fatInicio = setores.length;
  for (let i = 0; i < nFat; i += 1) { setores.push(Buffer.alloc(512)); fat.push(SETOR_DE_FAT); }
  if (opcoes.fatEmLaco === true) fat[dirInicio] = dirInicio;
  const tabela = Buffer.alloc(nFat * 512, 0xff);
  fat.forEach((v, i) => tabela.writeUInt32LE(v >>> 0, i * 4));
  for (let i = 0; i < nFat; i += 1) tabela.copy(setores[fatInicio + i]!, 0, i * 512, (i + 1) * 512);

  const h = Buffer.alloc(512);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(h, 0);
  h.writeUInt16LE(0x3e, 0x18); h.writeUInt16LE(3, 0x1a); h.writeUInt16LE(0xfffe, 0x1c);
  h.writeUInt16LE(9, 0x1e); h.writeUInt16LE(6, 0x20);
  h.writeUInt32LE(nFat, 0x2c); h.writeUInt32LE(dirInicio, 0x30); h.writeUInt32LE(4096, 0x38);
  h.writeUInt32LE(miniFatInicio, 0x3c); h.writeUInt32LE(Math.ceil(miniFat.length * 4 / 512), 0x40);
  h.writeUInt32LE(FIM, 0x44); h.writeUInt32LE(0, 0x48);
  for (let i = 0; i < 109; i += 1) h.writeUInt32LE(i < nFat ? fatInicio + i : LIVRE, 0x4c + i * 4);
  return Buffer.concat([h, ...setores]);
}


export type CelulaDeTeste = string | number | { readonly f: string; readonly v?: string | number } | null;

const BOF = (dt: number): Buffer => registro(0x0809, u16(0x0600), u16(dt), u16(0), u16(0), u32(0), u32(0));
const FIM_DE_REGISTROS = registro(0x000a);

/** Um .xls com uma aba: texto em LABEL (16 bits se não couber em latin1), número em NUMBER, fórmula com o resultado gravado. */
export function xlsDeTeste(nomeDaAba: string, linhas: readonly (readonly CelulaDeTeste[])[], opcoes: { readonly macros?: boolean } = {}): Buffer {
  const cel = (l: number, c: number): Buffer => Buffer.concat([u16(l), u16(c), u16(15)]);
  const alto = (s: string): boolean => /[^\u0000-\u00ff]/.test(s);
  const corpo: Buffer[] = [BOF(0x0010)];
  linhas.forEach((linha, l) => linha.forEach((v, c) => {
    if (v === null || v === "") return;
    if (typeof v === "string") corpo.push(registro(0x0204, cel(l, c), texto16(v, alto(v))));
    else if (typeof v === "number") corpo.push(registro(0x0203, cel(l, c), dbl(v)));
    else if (v.v === undefined || typeof v.v === "number") corpo.push(registro(0x0006, cel(l, c), v.v === undefined ? Buffer.from([3, 0, 0, 0, 0, 0, 0xff, 0xff]) : dbl(v.v), u16(0), u32(0), u16(0)));
    else { corpo.push(registro(0x0006, cel(l, c), Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]), u16(0), u32(0), u16(0))); corpo.push(registro(0x0207, texto16(v.v, alto(v.v)))); }
  }));
  corpo.push(FIM_DE_REGISTROS);
  const folha = Buffer.concat(corpo);
  const nome = Buffer.concat([Buffer.from([nomeDaAba.length, 1]), Buffer.from(nomeDaAba, "utf16le")]);
  const globais = (pos: number): Buffer => Buffer.concat([BOF(0x0005), registro(0x0085, u32(pos), Buffer.from([0, 0]), nome), FIM_DE_REGISTROS]);
  const wb = Buffer.concat([globais(globais(0).length), folha]);
  return conteiner([{ nome: "Workbook", dados: wb }, ...(opcoes.macros === true ? [{ nome: "_VBA_PROJECT_CUR", armazenamento: true }] : [])]);
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ref = (l: number, c: number): string => { let s = ""; let n = c + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return `${s}${l + 1}`; };

/** Um .xlsx com uma aba: texto em linha (inlineStr), número e fórmula (`<f>` com `<v>` gravado, ou sem). */
export function xlsxDeTeste(nomeDaAba: string, linhas: readonly (readonly CelulaDeTeste[])[], opcoes: { readonly macros?: boolean } = {}): Buffer {
  const rows = linhas.map((linha, l) => {
    const cs = linha.map((v, c) => {
      if (v === null || v === "") return "";
      if (typeof v === "string") return `<c r="${ref(l, c)}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
      if (typeof v === "number") return `<c r="${ref(l, c)}"><v>${v}</v></c>`;
      if (typeof v.v === "string") return `<c r="${ref(l, c)}" t="str"><f>${esc(v.f)}</f><v>${esc(v.v)}</v></c>`;
      return `<c r="${ref(l, c)}"><f>${esc(v.f)}</f>${v.v === undefined ? "" : `<v>${v.v}</v>`}</c>`;
    }).join("");
    return `<row r="${l + 1}">${cs}</row>`;
  }).join("");
  const e = (nome: string, xml: string) => ({ nome, conteudo: Buffer.from(xml, "utf8") });
  return ziparEntradas([
    e("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    e("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(nomeDaAba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    e("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    e("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`),
    ...(opcoes.macros === true ? [{ nome: "xl/vbaProject.bin", conteudo: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]) }] : []),
  ]);
}
