// Extrai da LOA 2026 de Esperança/PB (Lei Ordinária 613/2025) dois cadastros que o QDD usa por código:
//   - programas-2026-DERIVADO.csv  (programa;descricao), lido do quadro "CONSOLIDADO POR PROGRAMA (P, A)";
//   - orgaos-2026-DERIVADO.csv     (orgao;descricao;codigo_na_lei), lido dos cabeçalhos "10.0000 - LEGISLATIVO" e
//     "20.0000 - EXECUTIVO" do quadro "por unidade orçamentária e função, subfunção, programa e ação".
//
// Uso: node scripts/fontes/extrair-cadastros-loa-esperanca-2026.mjs [--texto <arquivo -raw>]
//   Sem --texto, roda `pdftotext -raw -enc UTF-8 <pdf> -` (executável em PDFTOTEXT, se não estiver no PATH).
//
// A descrição fica como a lei imprime, com o corte em 50 caracteres que o sistema emissor da lei aplica (por
// exemplo, "GARANTIR O ACESSO A EDUCAÇÃO (EDUCAÇÃO DE QUALIDAD"). Nenhum nome é completado.
// O código do órgão segue a convenção do qdd-2026-DERIVADO.csv: "0" + o primeiro dígito da unidade de 4 dígitos do
// QDD (1001 -> 01). A lei imprime 10.0000 e 20.0000, e esse código vai em codigo_na_lei.
// Fail-closed: se faltar nome para algum programa ou órgão presente no qdd-2026-DERIVADO.csv, nada é gravado.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PASTA = join(RAIZ, "docs", "oficial", "esperanca-pb");
const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
let texto;
if (arg("--texto") !== undefined) texto = readFileSync(arg("--texto"), "utf8");
else {
  const r = spawnSync(process.env.PDFTOTEXT ?? "pdftotext", ["-raw", "-enc", "UTF-8", join(PASTA, "lei-613-2025-loa-2026.pdf"), "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`pdftotext falhou: ${r.stderr ?? r.error}`);
  texto = r.stdout;
}
const L = texto.split(/\r?\n/).map((l) => l.replace(/\f/g, "").trimEnd());
const unico = (pred, nome) => {
  const achados = L.flatMap((l, i) => (pred(l) ? [i] : []));
  if (achados.length !== 1) throw new Error(`${nome}: esperada 1 linha, achadas ${achados.length}`);
  return achados[0];
};

// ---- programas: o conteúdo do quadro vem ANTES do seu cabeçalho de página no texto -raw ----
const M = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const RE_PROG = new RegExp(`^(\\d{4}) (.+?) ${M} ${M} ${M} ${M}$`);
const fimProg = unico((l) => l === "CONSOLIDADO POR PROGRAMA (P, A)", "cabeçalho do consolidado por programa");
const iniProg = unico((l) => l === "ANEXO - CONSOLIDADO POR FUNCAO (P, A)", "cabeçalho do consolidado por função");
const programas = new Map();
for (let i = iniProg + 1; i < fimProg; i++) {
  if (!/^\d{4}/.test(L[i])) continue;
  const m = RE_PROG.exec(L[i]);
  if (!m) throw new Error(`linha ${i + 1}: programa fora do formato: ${L[i]}`);
  if (programas.has(m[1])) throw new Error(`linha ${i + 1}: programa ${m[1]} repetido`);
  programas.set(m[1], m[2].trim());
}

// ---- órgãos ----
const orgaos = new Map();
for (let i = 0; i < L.length; i++) {
  const m = /^(\d)0\.0000 - (.+)$/.exec(L[i]);
  if (!m) continue;
  const cod = `0${m[1]}`;
  const ant = orgaos.get(cod);
  if (ant !== undefined && ant.descricao !== m[2].trim()) throw new Error(`linha ${i + 1}: órgão ${cod} com dois nomes`);
  orgaos.set(cod, { descricao: m[2].trim(), codigoNaLei: `${m[1]}0.0000` });
}

// ---- tudo o que o QDD usa precisa ter nome ----
const qdd = readFileSync(join(PASTA, "qdd-2026-DERIVADO.csv"), "utf8").split("\n").filter(Boolean);
const cab = qdd[0].split(";");
const [iProg, iOrg] = [cab.indexOf("programa"), cab.indexOf("orgao")];
const progQdd = new Set(qdd.slice(1).map((l) => l.split(";")[iProg]));
const orgQdd = new Set(qdd.slice(1).map((l) => l.split(";")[iOrg]));
const semNomeP = [...progQdd].filter((p) => !programas.has(p));
const semNomeO = [...orgQdd].filter((o) => !orgaos.has(o));
if (semNomeP.length || semNomeO.length) throw new Error(`sem nome na lei: programas ${semNomeP} órgãos ${semNomeO}`);
const sobraP = [...programas.keys()].filter((p) => !progQdd.has(p));
if (sobraP.length) throw new Error(`programas no consolidado e ausentes do QDD: ${sobraP}`);

const campo = (s) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const progOut = ["programa;descricao", ...[...programas].sort(([a], [b]) => a.localeCompare(b)).map(([c, d]) => `${c};${campo(d)}`)];
const orgOut = ["orgao;descricao;codigo_na_lei", ...[...orgaos].sort(([a], [b]) => a.localeCompare(b)).map(([c, o]) => `${c};${campo(o.descricao)};${o.codigoNaLei}`)];
writeFileSync(join(PASTA, "programas-2026-DERIVADO.csv"), progOut.join("\n") + "\n", "utf8");
writeFileSync(join(PASTA, "orgaos-2026-DERIVADO.csv"), orgOut.join("\n") + "\n", "utf8");
console.log(`programas: ${programas.size} (linhas ${iniProg + 2}-${fimProg}); QDD usa ${progQdd.size}`);
console.log(`órgãos: ${orgaos.size}; QDD usa ${orgQdd.size}`);
