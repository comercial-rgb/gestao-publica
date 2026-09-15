import { Decimal } from "decimal.js";

/**
 * ═══ LER UM .XLS (EXCEL 97-2003) — VALORES, NUNCA FÓRMULAS NEM MACROS ═══
 *
 * O `.xls` não é zip: é um arquivo composto (Compound File Binary, o "OLE2") com um fluxo `Workbook` de registros
 * BIFF8. Este leitor faz só o que a importação de planilha orçamentária precisa: as abas de planilha, e em cada célula o
 * TEXTO ou o NÚMERO gravado. Não interpreta estilo, data, gráfico, nome definido nem escreve nada.
 *
 * ⚠️ FÓRMULA NÃO SE EXECUTA. O registro FORMULA traz o resultado que o próprio arquivo calculou ao ser salvo; é ele que
 * sai, marcado `formula: true` para a prévia contar e mostrar. Os bytes da expressão são pulados sem leitura.
 * ⚠️ MACRO NÃO SE EXECUTA. A presença do armazenamento de VBA é só REPORTADA (`macros: true`); nada dele é lido.
 * ⚠️ RECUSA NOMEADA: arquivo que não é OLE2, sem fluxo `Workbook` (o `Book` do Excel 5/95 é BIFF5 e não tem suporte),
 * BIFF diferente de 8, planilha protegida por senha (FILEPASS), cadeia de setores corrompida ou em laço.
 *
 * ⚠️ AS ARMADILHAS QUE ESTE ARQUIVO TRATA:
 *  · o texto da tabela compartilhada (SST) atravessa registros CONTINUE, e a CONTINUAÇÃO de uma cadeia recomeça com um
 *    byte de opções próprio (a metade pode ser 8 bits e a outra 16);
 *  · o número RK guarda inteiro OU os 30 bits altos de um double, e às vezes ×100 — a divisão por 100 é decimal (medido:
 *    para os valores que o RK representa a impressão do ponto flutuante coincide, mas a regra não depende disso);
 *  · fluxo com menos de 4.096 bytes mora no mini-fluxo, com a sua própria tabela de alocação.
 */

export interface CelulaLida {
  readonly valor: string;
  readonly formula: boolean;
}

export interface AbaLida {
  readonly nome: string;
  /** Linhas por índice (0-based), cada uma por coluna (0-based); célula ausente é `undefined`. */
  readonly linhas: ReadonlyMap<number, ReadonlyMap<number, CelulaLida>>;
}

export interface PastaLida {
  readonly abas: readonly AbaLida[];
  readonly macros: boolean;
}

const ASSINATURA = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const FIM_DE_CADEIA = 0xfffffffe;
const LIVRE = 0xffffffff;

function recusar(motivo: string): never {
  throw new Error(`Arquivo .xls não lido: ${motivo}`);
}

interface Diretorio { readonly nome: string; readonly tipo: number; readonly inicio: number; readonly tamanho: number }

function lerContainer(buf: Buffer): { fluxo: (nome: string) => Buffer | null; nomes: readonly string[] } {
  if (buf.length < 512 || !buf.subarray(0, 8).equals(ASSINATURA)) recusar("não é um arquivo do Excel 97-2003 (assinatura OLE2 ausente). Se for .xlsx, envie com essa extensão.");
  const shift = buf.readUInt16LE(0x1e);
  const miniShift = buf.readUInt16LE(0x20);
  if (shift !== 9 && shift !== 12) recusar(`tamanho de setor inesperado (2^${shift}).`);
  const tam = 1 << shift;
  const miniTam = 1 << miniShift;
  const nFat = buf.readUInt32LE(0x2c);
  const dirInicio = buf.readUInt32LE(0x30);
  const corte = buf.readUInt32LE(0x38);
  const miniFatInicio = buf.readUInt32LE(0x3c);
  let difatSetor = buf.readUInt32LE(0x44);
  const setor = (n: number): Buffer => {
    const off = (n + 1) * tam;
    if (off + tam > buf.length) recusar(`setor ${n} fora do arquivo (truncado?).`);
    return buf.subarray(off, off + tam);
  };

  const fatSetores: number[] = [];
  for (let i = 0; i < 109 && fatSetores.length < nFat; i += 1) fatSetores.push(buf.readUInt32LE(0x4c + i * 4));
  let guarda = 0;
  while (fatSetores.length < nFat && difatSetor !== FIM_DE_CADEIA && difatSetor !== LIVRE) {
    if (++guarda > 100_000) recusar("cadeia de DIFAT em laço.");
    const s = setor(difatSetor);
    for (let i = 0; i < tam / 4 - 1 && fatSetores.length < nFat; i += 1) fatSetores.push(s.readUInt32LE(i * 4));
    difatSetor = s.readUInt32LE(tam - 4);
  }
  const fat: number[] = [];
  for (const f of fatSetores) {
    const s = setor(f);
    for (let i = 0; i < tam / 4; i += 1) fat.push(s.readUInt32LE(i * 4));
  }

  const cadeia = (inicio: number, tabela: readonly number[]): number[] => {
    const saida: number[] = [];
    const vistos = new Set<number>();
    for (let n = inicio; n !== FIM_DE_CADEIA; n = tabela[n] ?? FIM_DE_CADEIA) {
      if (n === LIVRE || n >= tabela.length || vistos.has(n)) recusar("cadeia de setores corrompida ou em laço.");
      vistos.add(n);
      saida.push(n);
    }
    return saida;
  };
  const juntar = (setores: readonly number[]): Buffer => Buffer.concat(setores.map(setor));

  const dir = juntar(cadeia(dirInicio, fat));
  const entradas: Diretorio[] = [];
  for (let off = 0; off + 128 <= dir.length; off += 128) {
    const tipo = dir.readUInt8(off + 0x42);
    if (tipo === 0) continue;
    const bytesNome = Math.max(0, Math.min(64, dir.readUInt16LE(off + 0x40)) - 2);
    entradas.push({ nome: dir.toString("utf16le", off, off + bytesNome), tipo, inicio: dir.readUInt32LE(off + 0x74), tamanho: dir.readUInt32LE(off + 0x78) });
  }
  const raiz = entradas.find((e) => e.tipo === 5);
  if (raiz === undefined) recusar("sem entrada raiz no diretório.");

  let miniFluxo: Buffer | null = null;
  let miniFat: number[] | null = null;
  const fluxo = (nome: string): Buffer | null => {
    const e = entradas.find((x) => x.tipo === 2 && x.nome === nome);
    if (e === undefined) return null;
    if (e.tamanho < corte) {
      if (miniFluxo === null) {
        miniFluxo = raiz.inicio === FIM_DE_CADEIA ? Buffer.alloc(0) : juntar(cadeia(raiz.inicio, fat));
        const mf = miniFatInicio === FIM_DE_CADEIA ? Buffer.alloc(0) : juntar(cadeia(miniFatInicio, fat));
        miniFat = [];
        for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mf.readUInt32LE(i));
      }
      const partes = cadeia(e.inicio, miniFat!).map((n) => {
        const off = n * miniTam;
        if (off + miniTam > miniFluxo!.length) recusar("mini-setor fora do mini-fluxo.");
        return miniFluxo!.subarray(off, off + miniTam);
      });
      return Buffer.concat(partes).subarray(0, e.tamanho);
    }
    return juntar(cadeia(e.inicio, fat)).subarray(0, e.tamanho);
  };
  return { fluxo, nomes: entradas.map((e) => e.nome) };
}

/** O número RK: inteiro de 30 bits ou os 30 bits altos de um double; bit 0 = ×100 (dividido em decimal). */
function numeroRk(rk: number): string {
  const cem = (rk & 0x01) !== 0;
  let base: string;
  if ((rk & 0x02) !== 0) {
    base = String(rk >> 2);
  } else {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(0, 0);
    b.writeUInt32LE((rk & 0xfffffffc) >>> 0, 4);
    base = String(b.readDoubleLE(0));
  }
  return cem ? new Decimal(base).div(100).toString() : new Decimal(base).toString();
}

function numeroDouble(buf: Buffer, off: number): string {
  const d = buf.readDoubleLE(off);
  return Number.isFinite(d) ? new Decimal(String(d)).toString() : "";
}

interface Registro { readonly tipo: number; readonly dados: Buffer; readonly continuacoes: readonly Buffer[] }

function registros(fluxo: Buffer, inicio: number): Registro[] {
  const saida: { tipo: number; dados: Buffer; continuacoes: Buffer[] }[] = [];
  let off = inicio;
  while (off + 4 <= fluxo.length) {
    const tipo = fluxo.readUInt16LE(off);
    const len = fluxo.readUInt16LE(off + 2);
    if (off + 4 + len > fluxo.length) recusar(`registro 0x${tipo.toString(16)} ultrapassa o fluxo.`);
    const dados = fluxo.subarray(off + 4, off + 4 + len);
    off += 4 + len;
    if (tipo === 0x003c && saida.length > 0) saida[saida.length - 1]!.continuacoes.push(dados);
    else saida.push({ tipo, dados, continuacoes: [] });
    if (tipo === 0x000a && saida.length > 1) break; // EOF da subcorrente
  }
  return saida;
}

/** Leitor sequencial sobre o registro e as continuações — para cadeias que atravessam CONTINUE. */
class Cursor {
  private parte = 0;
  private off = 0;
  constructor(private readonly partes: readonly Buffer[]) {}
  private atual(): Buffer { return this.partes[this.parte] ?? Buffer.alloc(0); }
  private garantir(n: number): void {
    if (this.off + n <= this.atual().length) return;
    if (this.off === this.atual().length && this.parte + 1 < this.partes.length) { this.parte += 1; this.off = 0; return; }
    recusar("tabela de textos truncada.");
  }
  u8(): number { this.garantir(1); return this.atual().readUInt8(this.off++); }
  u16(): number { this.garantir(2); const v = this.atual().readUInt16LE(this.off); this.off += 2; return v; }
  u32(): number { this.garantir(4); const v = this.atual().readUInt32LE(this.off); this.off += 4; return v; }
  pular(n: number): void {
    let resta = n;
    while (resta > 0) {
      const disp = this.atual().length - this.off;
      if (disp === 0) { if (this.parte + 1 >= this.partes.length) recusar("tabela de textos truncada."); this.parte += 1; this.off = 0; continue; }
      const k = Math.min(disp, resta);
      this.off += k;
      resta -= k;
    }
  }
  /** `cch` caracteres; ao cruzar para a próxima continuação, lê o novo byte de opções (8 ou 16 bits). */
  caracteres(cch: number, altoInicial: boolean): string {
    let alto = altoInicial;
    let s = "";
    let resta = cch;
    while (resta > 0) {
      if (this.off >= this.atual().length) {
        if (this.parte + 1 >= this.partes.length) recusar("texto truncado.");
        this.parte += 1;
        this.off = 0;
        alto = (this.u8() & 0x01) !== 0;
      }
      const largura = alto ? 2 : 1;
      const cabem = Math.min(resta, Math.floor((this.atual().length - this.off) / largura));
      if (cabem === 0) recusar("texto com caractere partido entre registros.");
      const bytes = this.atual().subarray(this.off, this.off + cabem * largura);
      s += alto ? bytes.toString("utf16le") : bytes.toString("latin1");
      this.off += cabem * largura;
      resta -= cabem;
    }
    return s;
  }
}

function textoUnicode(c: Cursor, cchDe16: boolean): string {
  const cch = cchDe16 ? c.u16() : c.u8();
  const opcoes = c.u8();
  const rico = (opcoes & 0x08) !== 0;
  const ext = (opcoes & 0x04) !== 0;
  const runs = rico ? c.u16() : 0;
  const extTam = ext ? c.u32() : 0;
  const s = c.caracteres(cch, (opcoes & 0x01) !== 0);
  if (runs > 0) c.pular(runs * 4);
  if (extTam > 0) c.pular(extTam);
  return s;
}

/** Lê o .xls: as abas de planilha (na ordem do arquivo), com texto/número de cada célula e a marca de fórmula. */
export function lerXls(conteudo: Buffer): PastaLida {
  const { fluxo, nomes } = lerContainer(conteudo);
  const macros = nomes.some((n) => n === "_VBA_PROJECT_CUR" || n === "VBA" || n === "Macros" || n === "_VBA_PROJECT");
  const wb = fluxo("Workbook");
  if (wb === null) {
    if (fluxo("Book") !== null) recusar("é do Excel 5/95 (BIFF5), sem suporte. Salve como .xlsx ou como Excel 97-2003 e envie de novo.");
    recusar("sem o fluxo Workbook.");
  }
  const globais = registros(wb, 0);
  const bof = globais[0];
  if (bof === undefined || bof.tipo !== 0x0809 || bof.dados.readUInt16LE(0) !== 0x0600) recusar("não é BIFF8 (Excel 97-2003).");
  if (globais.some((r) => r.tipo === 0x002f)) recusar("a planilha está protegida por senha. Remova a proteção e envie de novo.");

  let sst: string[] = [];
  const folhas: { nome: string; posicao: number }[] = [];
  for (const r of globais) {
    if (r.tipo === 0x00fc) {
      const c = new Cursor([r.dados, ...r.continuacoes]);
      c.u32();
      const unicos = c.u32();
      sst = [];
      for (let i = 0; i < unicos; i += 1) sst.push(textoUnicode(c, true));
    } else if (r.tipo === 0x0085) {
      const posicao = r.dados.readUInt32LE(0);
      const tipoDaFolha = r.dados.readUInt8(5);
      const c = new Cursor([r.dados.subarray(6)]);
      const nome = textoUnicode(c, false);
      if (tipoDaFolha === 0) folhas.push({ nome, posicao });
    }
  }

  const abas: AbaLida[] = folhas.map(({ nome, posicao }) => {
    const linhas = new Map<number, Map<number, CelulaLida>>();
    const por = (l: number, col: number, cel: CelulaLida): void => {
      const linha = linhas.get(l) ?? new Map<number, CelulaLida>();
      linha.set(col, cel);
      linhas.set(l, linha);
    };
    const rs = registros(wb, posicao);
    if (rs[0]?.tipo !== 0x0809) recusar(`a aba "${nome}" não começa por BOF.`);
    let formulaTextoPendente: { l: number; col: number } | null = null;
    for (const r of rs.slice(1)) {
      const d = r.dados;
      switch (r.tipo) {
        case 0x00fd: por(d.readUInt16LE(0), d.readUInt16LE(2), { valor: (sst[d.readUInt32LE(6)] ?? "").trim(), formula: false }); break;
        case 0x0204: por(d.readUInt16LE(0), d.readUInt16LE(2), { valor: textoUnicode(new Cursor([d.subarray(6), ...r.continuacoes]), true).trim(), formula: false }); break;
        case 0x0203: por(d.readUInt16LE(0), d.readUInt16LE(2), { valor: numeroDouble(d, 6), formula: false }); break;
        case 0x027e: por(d.readUInt16LE(0), d.readUInt16LE(2), { valor: numeroRk(d.readUInt32LE(6)), formula: false }); break;
        case 0x00bd: {
          const l = d.readUInt16LE(0);
          const primeira = d.readUInt16LE(2);
          const n = (d.length - 6) / 6;
          for (let i = 0; i < n; i += 1) por(l, primeira + i, { valor: numeroRk(d.readUInt32LE(4 + i * 6 + 2)), formula: false });
          break;
        }
        case 0x0205: {
          const erro = d.readUInt8(7) !== 0;
          por(d.readUInt16LE(0), d.readUInt16LE(2), { valor: erro ? "" : String(d.readUInt8(6)), formula: false });
          break;
        }
        case 0x0006: {
          const l = d.readUInt16LE(0);
          const col = d.readUInt16LE(2);
          if (d.readUInt16LE(12) === 0xffff) {
            const t = d.readUInt8(6);
            if (t === 0) formulaTextoPendente = { l, col };
            else por(l, col, { valor: t === 1 ? String(d.readUInt8(8)) : "", formula: true });
          } else {
            por(l, col, { valor: numeroDouble(d, 6), formula: true });
          }
          break;
        }
        case 0x0207:
          if (formulaTextoPendente !== null) {
            por(formulaTextoPendente.l, formulaTextoPendente.col, { valor: textoUnicode(new Cursor([d, ...r.continuacoes]), true).trim(), formula: true });
            formulaTextoPendente = null;
          }
          break;
        default:
          break;
      }
    }
    return { nome, linhas };
  });
  if (abas.length === 0) recusar("nenhuma aba de planilha.");
  return { abas, macros };
}
