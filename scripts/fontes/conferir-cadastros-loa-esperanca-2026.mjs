// Conferência INDEPENDENTE de programas-2026-DERIVADO.csv e orgaos-2026-DERIVADO.csv (LOA 2026 de Esperança/PB).
//
// Uso: node scripts/fontes/conferir-cadastros-loa-esperanca-2026.mjs [--texto <arquivo -raw>]
//
// Não importa o extrator. O extrator lê os nomes do "CONSOLIDADO POR PROGRAMA (P, A)" e dos cabeçalhos
// "X0.0000 - ...". Esta conferência usa outros quadros da mesma lei:
//   - programas: o "DEMONSTRATIVO DOS MACRO OBJETIVOS E PROGRAMAS" (linhas "1001 - NOME valor") para nome e valor,
//     e as linhas de programa ("01.031.1001 NOME p a e") do quadro por unidade e ação para nome. O valor é
//     comparado com a soma do qdd-2026-DERIVADO.csv por programa;
//   - órgãos: o rótulo (LEGISLATIVO/EXECUTIVO) que o QDD imprime antes de cada cabeçalho de unidade. A soma dos
//     "Total da Unidade Orçamentária" sob cada "X0.0000" é comparada com a soma do QDD derivado por órgão.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
const L = texto.split(/\r?\n/).map((l) => l.split("\f").join("").trim());
const RE_BR = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const deBr = (s) => {
  if (!RE_BR.test(s)) throw new Error(`valor fora do formato: ${s}`);
  const [i, c] = s.split(",");
  return BigInt(i.split(".").join("")) * 100n + BigInt(c);
};
const fmt = (c) => `${(c / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(c % 100n).padStart(2, "0")}`;
const csv = (nome) => readFileSync(join(PASTA, nome), "utf8").split("\n").filter(Boolean).map((l) => l.split(";"));

const programas = new Map(csv("programas-2026-DERIVADO.csv").slice(1).map(([c, d]) => [c, d]));
const orgaos = new Map(csv("orgaos-2026-DERIVADO.csv").slice(1).map(([c, d]) => [c, d]));
const qdd = csv("qdd-2026-DERIVADO.csv");
const ix = (n) => qdd[0].indexOf(n);
const somaQdd = (col) => {
  const m = new Map();
  for (const c of qdd.slice(1)) m.set(c[ix(col)], (m.get(c[ix(col)]) ?? 0n) + BigInt(c[ix("valor")].replace(".", "")));
  return m;
};
const progQdd = somaQdd("programa");
const orgQdd = somaQdd("orgao");
const dif = [];
const nota = (s) => (console.log(`  DIFERENÇA ${s}`), dif.push(s));

// ===== Programas =====
console.log(`# Programas: CSV ${programas.size}, QDD ${progQdd.size}`);
for (const p of progQdd.keys()) if (!programas.has(p)) nota(`programa ${p} do QDD sem nome no CSV`);
for (const p of programas.keys()) if (!progQdd.has(p)) nota(`programa ${p} do CSV ausente do QDD`);

const mIni = L.indexOf("0001 - TODOS");
const mFim = L.findIndex((l, i) => i > mIni && /^Total \d/.test(l));
const macro = new Map();
for (let i = mIni; i < mFim; i++) {
  const m = /^(\d{4}) - (.+) (\S+,\d{2})$/.exec(L[i]);
  if (!m || m[1].startsWith("000")) continue;
  if (macro.has(m[1])) throw new Error(`programa ${m[1]} repetido no demonstrativo (linha ${i + 1})`);
  macro.set(m[1], { nome: m[2].trim(), v: deBr(m[3]), linha: i + 1 });
}
let okNome = 0;
let okValor = 0;
for (const [p, nome] of programas) {
  const x = macro.get(p);
  if (!x) {
    nota(`programa ${p}: ausente do demonstrativo dos macro objetivos`);
    continue;
  }
  if (x.nome === nome) okNome++;
  else nota(`programa ${p}: nome no CSV "${nome}" / no demonstrativo "${x.nome}" (linha ${x.linha})`);
  const q = progQdd.get(p) ?? 0n;
  if (x.v === q) okValor++;
  else nota(`programa ${p}: valor no demonstrativo ${fmt(x.v)} / soma do QDD ${fmt(q)} (linha ${x.linha})`);
}
console.log(`## Demonstrativo dos macro objetivos e programas (linhas ${mIni + 1}-${mFim + 1}): ${macro.size} programas; nome igual ${okNome}/${programas.size}; valor igual à soma do QDD ${okValor}/${programas.size}`);

// Linhas de programa (função.subfunção.programa) no quadro por unidade e ação, só as de uma linha.
const nomesUa = new Map();
for (let i = 0; i < L.length; i++) {
  const m = /^\d{2}\.\d{3}\.(\d{4}) (.+?) \S+,\d{2} \S+,\d{2} \S+,\d{2}$/.exec(L[i]);
  if (m) nomesUa.set(m[1], [...new Set([...(nomesUa.get(m[1]) ?? []), m[2].trim()])]);
}
let okUa = 0;
for (const [p, nome] of programas) {
  const v = nomesUa.get(p);
  if (v === undefined) continue;
  if (v.length === 1 && v[0] === nome) okUa++;
  else nota(`programa ${p}: nome no CSV "${nome}" / nos quadros por função.subfunção.programa ${JSON.stringify(v)}`);
}
console.log(`## Linhas "ff.sss.pppp NOME" dos quadros por função, subfunção e programa: ${nomesUa.size} programas achados em linha única; nome igual ${okUa}`);

// ===== Órgãos =====
console.log(`\n# Órgãos: CSV ${orgaos.size}, QDD ${orgQdd.size}`);
const qIni = L.indexOf("Identificador Classificação Descrição Fonte Valor Total");
const qFim = L.findIndex((l, i) => i > qIni && l.startsWith("Total do Orçamento "));
const rotuloQdd = new Map();
for (let i = qIni; i < qFim; i++) {
  if (L[i] !== "LEGISLATIVO" && L[i] !== "EXECUTIVO") continue;
  const u = /^(\d)\d{3} - /.exec(L[i + 1]);
  if (!u) continue;
  const o = `0${u[1]}`;
  const set = rotuloQdd.get(o) ?? new Set();
  set.add(L[i]);
  rotuloQdd.set(o, set);
}
for (const [o, nome] of orgaos) {
  const r = [...(rotuloQdd.get(o) ?? [])];
  if (r.length === 1 && r[0] === nome) console.log(`## órgão ${o}: CSV "${nome}" = rótulo do QDD antes das unidades ${o}xxx`);
  else nota(`órgão ${o}: CSV "${nome}" / rótulos no QDD ${JSON.stringify(r)}`);
}
const uaIni = L.findIndex((l) => /^10\.0000 - /.test(l));
const uaFim = L.findIndex((l, i) => i > uaIni && l === "Total Geral");
const somaUa = new Map();
let org = null;
for (let i = uaIni; i < uaFim; i++) {
  let m;
  if ((m = /^(\d)0\.0000 - /.exec(L[i]))) org = `0${m[1]}`;
  else if ((m = /^Total da Unidade Orçamentária (\S+)$/.exec(L[i]))) somaUa.set(org, (somaUa.get(org) ?? 0n) + deBr(m[1]));
}
for (const o of orgaos.keys()) {
  const a = somaUa.get(o) ?? 0n;
  const b = orgQdd.get(o) ?? 0n;
  if (a === b) console.log(`## órgão ${o}: soma dos "Total da Unidade Orçamentária" sob ${o[1]}0.0000 = ${fmt(a)} = soma do QDD`);
  else nota(`órgão ${o}: quadro por unidade e ação ${fmt(a)} / QDD ${fmt(b)}`);
}

console.log(`\n## Resumo: ${dif.length} diferença(s)`);
