// Extrai a LISTA DE SERVIÇOS (Anexo I da LC municipal 80/2017, na redação da LC 132/2025 de Esperança/PB)
// do Quinzenário Oficial nº 206, pelas POSIÇÕES do texto no PDF (pdfjs), e grava subitem;descricao.
//
// Uso: node scripts/fontes/extrair-lista-de-servicos-esperanca.mjs
// Saída: docs/oficial/esperanca-pb/esperanca-lc132-2025-anexoI-descricoes-DERIVADO.csv
//
// Como a tabela está diagramada: duas colunas por página (páginas 8 a 11); em cada uma, o código do
// subitem fica na LINHA DE BAIXO da célula, e a descrição ocupa as linhas acima até o código anterior.
// Os cabeçalhos de item (código sem ponto, "7") delimitam as células e não entram na saída.
// A conferência independente (contra a extração em texto corrido e contra as marcas de domicílio)
// está em modules/m07-extraorcamentario/m07-fontes-da-retencao.test.ts.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const PDF = "docs/oficial/esperanca-pb/esperanca-alteracao.pdf";
const SAIDA = "docs/oficial/esperanca-pb/esperanca-lc132-2025-anexoI-descricoes-DERIVADO.csv";
const SHA_ESPERADO = "cac43a9ebdcd04430e567260cf3987c1535bdb36dc12f83dfcbf790087775b3a";

const bytes = readFileSync(PDF);
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== SHA_ESPERADO) throw new Error(`O PDF mudou (sha256 ${sha}); confira a fonte antes de extrair.`);

const COLUNAS = [
  { codigo: 53.4, descDe: 70, descAte: 224 },
  { codigo: 319.1, descDe: 336, descAte: 490 },
];
const perto = (a, b) => Math.abs(a - b) < 2;
const CODIGO = /^\d{1,2}(\.\d{1,3})?$/;

const doc = await getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
const linhas = [];
for (let n = 8; n <= 11; n++) {
  const pg = await doc.getPage(n);
  const itens = (await pg.getTextContent()).items
    .filter((i) => i.str.trim() !== "")
    .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str }));
  // Onde a lista começa (pág. 8, abaixo do título) e onde acaba (pág. 11, no título do Anexo II).
  const titulo = itens.find((i) => i.s.includes("LISTA DE SERVIÇOS"));
  const anexo2 = itens.find((i) => i.s.trim() === "ANEXO II");
  for (const [k, col] of COLUNAS.entries()) {
    if (n === 11 && k === 1) continue; // a coluna direita da pág. 11 já é o Anexo II
    let topo = 760;
    let fundo = 45;
    if (n === 8 && k === 0 && titulo) topo = titulo.y;
    if (n === 11 && k === 0 && anexo2) fundo = anexo2.y + 1;
    const naRegiao = itens.filter((i) => i.y < topo && i.y > fundo);
    const codigos = naRegiao
      .filter((i) => perto(i.x, col.codigo) && CODIGO.test(i.s.trim()))
      .sort((a, b) => b.y - a.y);
    const desc = naRegiao.filter((i) => i.x >= col.descDe && i.x < col.descAte);
    let acima = topo;
    for (const c of codigos) {
      const daCelula = desc.filter((i) => i.y < acima - 0.5 && i.y >= c.y - 0.5);
      const porLinha = new Map();
      for (const i of daCelula) {
        const chave = i.y.toFixed(1);
        if (!porLinha.has(chave)) porLinha.set(chave, []);
        porLinha.get(chave).push(i);
      }
      const texto = [...porLinha.entries()]
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .map(([, its]) => {
          its.sort((a, b) => a.x - b.x);
          let s = "";
          let fim = null;
          for (const i of its) {
            s += fim !== null && i.x - fim < 0.8 ? i.s : (s === "" ? "" : " ") + i.s;
            fim = i.x + i.w;
          }
          return s;
        })
        .join(" ");
      linhas.push({ pagina: n, codigo: c.s.trim(), texto });
      acima = c.y;
    }
  }
}

const normalizarCodigo = (c) => {
  const [i, s] = c.split(".");
  return `${Number(i)}.${s.padStart(2, "0")}`;
};
const saida = [];
for (const l of linhas) {
  if (!l.codigo.includes(".")) continue; // cabeçalho de item
  const descricao = l.texto
    .replace(/^\d{1,2}\.\d{1,3}\s*[-–]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (descricao === "") throw new Error(`Subitem ${l.codigo} (pág. ${l.pagina}) sem descrição.`);
  saida.push(`${normalizarCodigo(l.codigo)};${descricao.replace(/;/g, ",")}`);
}
writeFileSync(SAIDA, ["subitem;descricao", ...saida].join("\n") + "\n", "utf8");
console.log(`${saida.length} subitens gravados em ${SAIDA}`);
