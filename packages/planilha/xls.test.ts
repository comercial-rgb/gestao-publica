import { describe, expect, it } from "vitest";
import { lerXls } from "./xls.js";
import { conteiner, dbl, registro, texto16, u16, u32 } from "../../test/fixtures/planilhas.js";

/**
 * ═══ O LEITOR DE .XLS CONTRA UM GRAVADOR INDEPENDENTE ═══
 *
 * Não há arquivo .xls de terceiro no repositório nem biblioteca de planilha instalada. O gravador abaixo é escrito à
 * parte, a partir da especificação pública do formato (MS-CFB para o contêiner, MS-XLS para os registros BIFF8), sem
 * importar nada do leitor. Os valores esperados estão escritos à mão.
 */

const BOF_GLOBAIS = registro(0x0809, u16(0x0600), u16(0x0005), u16(0), u16(0), u32(0), u32(0));
const BOF_FOLHA = registro(0x0809, u16(0x0600), u16(0x0010), u16(0), u16(0), u32(0), u32(0));
const EOF = registro(0x000a);
const celula = (l: number, c: number): Buffer => Buffer.concat([u16(l), u16(c), u16(15)]);

/** A pasta de teste: a aba "Orçamento" com cabeçalho, grupo, dois serviços e o total; uma aba de gráfico que não conta. */
function pasta(opcoes: { readonly linhasExtras?: number; readonly senha?: boolean } = {}): Buffer {
  // SST: 4 textos; o terceiro ("Execução de alvenaria…") PARTIDO entre o SST e o CONTINUE — a 2ª metade em 16 bits.
  const t1 = texto16("Item", false);
  const t2 = texto16("Descrição", false);
  const longo = "Execução de alvenaria em bloco cerâmico";
  const metade = 12;
  const t3inicio = Buffer.concat([u16(longo.length), Buffer.from([0]), Buffer.from(longo.slice(0, metade), "latin1")]);
  const t3fim = Buffer.concat([Buffer.from([1]), Buffer.from(longo.slice(metade), "utf16le")]);
  const t4 = texto16("m²", true);
  const sst = Buffer.concat([registro(0x00fc, u32(6), u32(4), t1, t2, t3inicio), registro(0x003c, t3fim, t4)]);

  const linhasExtras: Buffer[] = [];
  for (let i = 0; i < (opcoes.linhasExtras ?? 0); i += 1) linhasExtras.push(registro(0x0203, celula(10 + i, 0), dbl(i + 0.5)));
  const folha = Buffer.concat([
    BOF_FOLHA,
    registro(0x00fd, celula(0, 0), u32(0)), // "Item"
    registro(0x00fd, celula(0, 1), u32(1)), // "Descrição"
    registro(0x0204, celula(0, 2), texto16("Preço unitário", true)), // LABEL em 16 bits
    registro(0x0204, celula(1, 0), texto16("1", false)),
    registro(0x0204, celula(1, 1), texto16("SERVIÇOS PRELIMINARES", true)),
    registro(0x0204, celula(2, 0), texto16("1.1", false)),
    registro(0x00fd, celula(2, 1), u32(2)), // texto partido
    registro(0x00fd, celula(2, 3), u32(3)), // "m²"
    registro(0x027e, celula(2, 4), u32((12345 << 2) | 0x03)), // RK inteiro ×100 = 123,45
    registro(0x0203, celula(2, 5), dbl(87.3)), // NUMBER
    // MULRK na linha 3: colunas 4 e 5 → 250 (RK inteiro) e 0,75 (RK double sem ×100)
    registro(0x00bd, u16(3), u16(4), u16(15), u32((250 << 2) | 0x02), u16(15), (() => { const b = Buffer.alloc(8); b.writeDoubleLE(0.75); const alto = b.readUInt32LE(4) & 0xfffffffc; return u32(alto); })(), u16(5)),
    // FORMULA numérica: resultado gravado 10777,19; os bytes da expressão (um "=1+1") NÃO se executam.
    registro(0x0006, celula(4, 5), dbl(10777.19), u16(0), u32(0), u16(3), Buffer.from([0x1e, 0x01, 0x00])),
    // FORMULA de texto: resultado no STRING seguinte.
    registro(0x0006, celula(5, 1), Buffer.from([0, 0, 0, 0, 0, 0, 0xff, 0xff]), u16(0), u32(0), u16(0)),
    registro(0x0207, texto16("TOTAL GERAL", false)),
    ...linhasExtras,
    EOF,
  ]);

  const nome1 = Buffer.concat([Buffer.from([9, 1]), Buffer.from("Orçamento", "utf16le")]);
  const nome2 = Buffer.concat([Buffer.from([7, 0]), Buffer.from("Grafico", "latin1")]);
  const bs = (pos: number, tipo: number, nome: Buffer): Buffer => registro(0x0085, u32(pos), Buffer.from([0, tipo]), nome);
  const antes = (pos: number): Buffer => Buffer.concat([BOF_GLOBAIS, ...(opcoes.senha === true ? [registro(0x002f, u16(0))] : []), bs(pos, 0, nome1), bs(0, 2, nome2), sst, EOF]);
  const tamGlobais = antes(0).length;
  return Buffer.concat([antes(tamGlobais), folha]);
}

const valor = (p: ReturnType<typeof lerXls>, l: number, c: number): string | undefined => p.abas[0]!.linhas.get(l)?.get(c)?.valor;

describe("lerXls — contra o gravador independente", () => {
  it("XL01: fluxo pequeno (mini-fluxo) — textos do SST partidos em 8/16 bits, LABEL, RK ×100, NUMBER, MULRK e fórmulas sem execução", () => {
    const wb = pasta();
    expect(wb.length).toBeLessThan(4096);
    const p = lerXls(conteiner([{ nome: "Workbook", dados: wb }]));
    expect(p.abas.map((a) => a.nome)).toEqual(["Orçamento"]); // a aba de gráfico não conta
    expect(p.macros).toBe(false);
    expect([valor(p, 0, 0), valor(p, 0, 1), valor(p, 0, 2)]).toEqual(["Item", "Descrição", "Preço unitário"]);
    expect([valor(p, 1, 0), valor(p, 1, 1)]).toEqual(["1", "SERVIÇOS PRELIMINARES"]);
    expect([valor(p, 2, 0), valor(p, 2, 1), valor(p, 2, 3), valor(p, 2, 4), valor(p, 2, 5)]).toEqual(["1.1", "Execução de alvenaria em bloco cerâmico", "m²", "123.45", "87.3"]);
    expect([valor(p, 3, 4), valor(p, 3, 5)]).toEqual(["250", "0.75"]);
    expect(p.abas[0]!.linhas.get(4)?.get(5)).toEqual({ valor: "10777.19", formula: true });
    expect(p.abas[0]!.linhas.get(5)?.get(1)).toEqual({ valor: "TOTAL GERAL", formula: true });
    expect(p.abas[0]!.linhas.get(2)?.get(5)?.formula).toBe(false);
  });

  it("XL02: fluxo grande (setores regulares, mais de um setor de FAT) e o armazenamento de macro só reportado", () => {
    const wb = pasta({ linhasExtras: 5000 });
    expect(wb.length).toBeGreaterThan(128 * 512); // mais de 128 setores: dois setores de FAT
    const p = lerXls(conteiner([{ nome: "Workbook", dados: wb }, { nome: "_VBA_PROJECT_CUR", armazenamento: true }]));
    expect(p.macros).toBe(true);
    expect(valor(p, 2, 1)).toBe("Execução de alvenaria em bloco cerâmico");
    expect(valor(p, 5009, 0)).toBe("4999.5");
    expect(p.abas[0]!.linhas.size).toBe(6 + 5000);
  });

  it("XL03: recusas nomeadas — não é OLE2, protegido por senha, Excel 5/95 e cadeia de setores em laço", () => {
    expect(() => lerXls(Buffer.from("PK isto é um zip".padEnd(600, " ")))).toThrow(/assinatura OLE2 ausente/);
    expect(() => lerXls(conteiner([{ nome: "Workbook", dados: pasta({ senha: true }) }]))).toThrow(/protegida por senha/);
    expect(() => lerXls(conteiner([{ nome: "Book", dados: pasta() }]))).toThrow(/Excel 5\/95/);
    expect(() => lerXls(conteiner([{ nome: "Workbook", dados: pasta() }], { fatEmLaco: true }))).toThrow(/corrompida ou em laço/);
  });
});
