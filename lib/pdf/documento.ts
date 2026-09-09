import { createHash } from "node:crypto";

/**
 * O DOCUMENTO DE UM DEMONSTRATIVO, e o HTML que o imprime (TR 7.5 / 5.120).
 *
 * ⚠️ MÓDULO PURO — zero puppeteer, zero I/O. Recebe DADOS estruturados (as mesmas colunas/linhas da
 * tela) e devolve string: o corpo HTML A4, o hash do conteúdo e o rodapé. É isto que o teste
 * confronta (hash estável para o mesmo conteúdo), sem precisar de navegador nem servidor. O headless
 * só transforma este HTML em PDF — a VERDADE do documento nasce aqui.
 *
 * ⚠️ O HASH É DO CONTEÚDO, NÃO DO PDF. Os bytes do PDF carregam o carimbo de data/hora da geração
 * (variam a cada impressão); o hash SHA-256 é do DADO (o `documento`), então o MESMO demonstrativo
 * dá o MESMO hash — é isso que permite conferir depois que um PDF não foi adulterado.
 */

export interface ColunaPdf {
  readonly rotulo: string;
  readonly alinhamento?: "esquerda" | "direita";
}

export interface SecaoPdf {
  readonly titulo?: string;
  readonly colunas: readonly ColunaPdf[];
  /** Uma linha = os valores JÁ FORMATADOS (a tela já os formatou; o PDF é a tela). */
  readonly linhas: readonly (readonly string[])[];
  /** Linhas de destaque (totais) — negrito. Índices dentro de `linhas`. */
  readonly totais?: readonly number[];
}

export interface DocumentoPdf {
  readonly ente: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly periodo: string;
  readonly secoes: readonly SecaoPdf[];
  /** Notas/interruptores impressos ao fim — a honestidade do demonstrativo. */
  readonly notas?: readonly string[];
}

/** Escapa o que vai virar HTML — o dado do relatório pode ter `<`, `&`, aspas. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** O hash SHA-256 do CONTEÚDO — determinístico (não inclui a hora de geração). */
export function hashDoDocumento(doc: DocumentoPdf): string {
  // Serialização canônica: a ordem dos campos é fixa (o objeto é construído sempre igual).
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

/** O nome canônico do arquivo — minúsculo, sem espaço, com o período. Ex.: rreo-anexo1-2026-bim3.pdf */
export function nomeCanonico(base: string, periodo: string): string {
  const limpo = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${limpo(base)}-${limpo(periodo)}.pdf`;
}

function tabela(secao: SecaoPdf): string {
  const totais = new Set(secao.totais ?? []);
  const thead =
    "<thead><tr>" +
    secao.colunas.map((c) => `<th class="${c.alinhamento === "direita" ? "dir" : "esq"}">${esc(c.rotulo)}</th>`).join("") +
    "</tr></thead>";
  const tbody =
    "<tbody>" +
    secao.linhas
      .map((linha, i) => {
        const cls = totais.has(i) ? ' class="total"' : "";
        const tds = linha
          .map((v, j) => `<td class="${secao.colunas[j]?.alinhamento === "direita" ? "dir" : "esq"}">${esc(v)}</td>`)
          .join("");
        return `<tr${cls}>${tds}</tr>`;
      })
      .join("") +
    "</tbody>";
  const titulo = secao.titulo !== undefined ? `<h2>${esc(secao.titulo)}</h2>` : "";
  return `${titulo}<table>${thead}${tbody}</table>`;
}

/** O CORPO HTML A4 — cabeçalho do ente + as seções. O rodapé (hash, página N de M) é do headless. */
export function renderizarCorpo(doc: DocumentoPdf): string {
  const secoes = doc.secoes.map(tabela).join("");
  const notas =
    doc.notas !== undefined && doc.notas.length > 0
      ? `<section class="notas"><h3>Notas e interruptores</h3><ul>${doc.notas.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>`
      : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>
    * { box-sizing: border-box; }
    body { font-family: "Segoe UI", Arial, sans-serif; font-size: 9pt; color: #111; margin: 0; }
    header.doc { border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    header.doc .ente { font-size: 11pt; font-weight: 700; }
    header.doc .titulo { font-size: 13pt; font-weight: 700; margin-top: 2px; }
    header.doc .sub { color: #444; }
    header.doc .periodo { color: #444; margin-top: 2px; }
    h2 { font-size: 10pt; margin: 12px 0 4px; }
    h3 { font-size: 9pt; margin: 10px 0 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th, td { border: 0.5px solid #bbb; padding: 2px 5px; }
    th { background: #eee; text-align: left; font-weight: 700; }
    td.dir, th.dir { text-align: right; font-variant-numeric: tabular-nums; }
    tr.total td { font-weight: 700; background: #f5f5f5; }
    section.notas { margin-top: 10px; font-size: 8pt; color: #333; }
    section.notas ul { margin: 0; padding-left: 16px; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  </style></head><body>
    <header class="doc">
      <div class="ente">${esc(doc.ente)}</div>
      <div class="titulo">${esc(doc.titulo)}</div>
      <div class="sub">${esc(doc.subtitulo)}</div>
      <div class="periodo">${esc(doc.periodo)}</div>
    </header>
    ${secoes}
    ${notas}
  </body></html>`;
}

/**
 * O RODAPÉ (template do headless, repetido em toda página): hash + hora + a HONESTIDADE IMPRESSA + a
 * paginação. `pageNumber`/`totalPages` são as classes que o Chromium preenche.
 */
export function rodapeTemplate(hash: string, geradoEm: Date): string {
  const quando = geradoEm.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  return `<div style="font-size:7pt;color:#555;width:100%;padding:0 14mm;font-family:Arial,sans-serif;">
    <div style="border-top:0.5px solid #bbb;padding-top:3px;display:flex;justify-content:space-between;">
      <span>SHA-256: ${esc(hash)}</span>
      <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
    </div>
    <div>Gerado em ${esc(quando)} · <strong>documento não assinado digitalmente — assinatura ICP-Brasil pendente de certificado</strong></div>
  </div>`;
}
