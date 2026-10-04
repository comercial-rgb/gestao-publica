// Conferência INDEPENDENTE de receita-prevista-2026-DERIVADO.csv (LOA 2026 de Esperança/PB, Lei 613/2025).
//
// Uso: node scripts/fontes/conferir-receita-esperanca-2026.mjs [--texto <arquivo -raw>] [--csv <csv>]
//
// Não importa o extrator. O extrator lê só as linhas ANALÍTICAS do Anexo II da receita. Esta conferência lê outros
// números impressos e soma o CSV para cada um deles:
//   - cada linha SINTÉTICA ("--- ") do mesmo anexo, com receita e dedução, contra a soma do CSV pelo prefixo do
//     código (os níveis têm largura fixa, então o prefixo dos dígitos identifica o nível sem ambiguidade);
//   - os totais do anexo: por categoria, da lei orçamentária, da lei intra-orçamentária e total geral;
//   - o art. 2º, item por item;
//   - o consolidado das receitas e despesas por fonte (coluna Receitas (a), que é líquida de dedução);
//   - a tabela de deduções já conferida em loa-2026-deducoes.md.
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

const RE_BR = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;
const deBr = (s) => {
  if (!RE_BR.test(s)) throw new Error(`valor fora do formato: ${s}`);
  const neg = s.startsWith("-");
  const [i, c] = s.replace("-", "").split(",");
  const v = BigInt(i.split(".").join("")) * 100n + BigInt(c);
  return neg ? -v : v;
};
const deCsv = (s) => {
  if (!/^\d+\.\d{2}$/.test(s)) throw new Error(`valor do CSV fora do formato: ${s}`);
  return BigInt(s.replace(".", ""));
};
const fmt = (c) => {
  const a = c < 0n ? -c : c;
  return `${c < 0n ? "-" : ""}${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${String(a % 100n).padStart(2, "0")}`;
};

// ---------- CSV (aceita campo entre aspas com "" escapado) ----------
const lerCsv = (t) => {
  const linhas = [];
  for (const l of t.split("\n").filter(Boolean)) {
    const c = [];
    let s = "";
    let q = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (q) {
        if (ch === '"' && l[i + 1] === '"') (s += '"'), i++;
        else if (ch === '"') q = false;
        else s += ch;
      } else if (ch === '"') q = true;
      else if (ch === ";") c.push(s), (s = "");
      else s += ch;
    }
    c.push(s);
    linhas.push(c);
  }
  return linhas;
};
const tab = lerCsv(readFileSync(arg("--csv") ?? join(PASTA, "receita-prevista-2026-DERIVADO.csv"), "utf8"));
const cab = tab[0];
const C = Object.fromEntries(["natureza", "fonte", "valor", "deducao", "tipo_deducao", "natureza_lei"].map((n) => [n, cab.indexOf(n)]));
if (Object.values(C).some((i) => i < 0)) throw new Error("coluna ausente no CSV");
const rows = tab.slice(1).map((c) => ({
  dig: c[C.natureza_lei].split(".").join(""),
  nat: c[C.natureza],
  fonte: c[C.fonte],
  rec: deCsv(c[C.valor]),
  ded: deCsv(c[C.deducao]),
  tipo: c[C.tipo_deducao],
}));
for (const r of rows) if (!r.dig.startsWith(r.nat) || r.nat.length !== 8 || r.dig.length !== 10) throw new Error(`natureza incoerente ${r.nat} / ${r.dig}`);
const soma = (f, campo) => rows.filter(f).reduce((s, r) => s + r[campo], 0n);
const totRec = soma(() => true, "rec");
const totDed = soma(() => true, "ded");

const divergencias = [];
function conferir(titulo, itens) {
  // itens: [{chave, lei, csv, linha}]
  let ok = 0;
  const dif = [];
  for (const it of itens) {
    if (it.lei === it.csv) ok++;
    else dif.push(`${titulo} | ${it.chave} | lei ${it.lei === null ? "(ausente)" : fmt(it.lei)} | CSV ${fmt(it.csv)} | CSV-lei ${fmt(it.csv - (it.lei ?? 0n))} | linha ${it.linha ?? "-"}`);
  }
  console.log(`\n## ${titulo}: ${itens.length} itens, ${ok} iguais, ${dif.length} diferentes`);
  for (const d of dif) console.log(`  DIFERENÇA ${d}`), divergencias.push(d);
}

console.log(`# Conferência da receita prevista 2026`);
console.log(`linhas do CSV: ${rows.length}; receita bruta ${fmt(totRec)}; dedução ${fmt(totDed)}; líquida ${fmt(totRec - totDed)}`);

// ===== 1. Linhas sintéticas do Anexo II da receita =====
const ini = L.findIndex((l, i) => i > L.indexOf("ANEXO II - RESUMO GERAL DAS DESPESAS") && l === "RECEITAS CORRENTES ORÇAMENTÁRIAS");
const fim = L.findIndex((l, i) => i > ini && l.startsWith("Total Geral das receitas"));
if (ini < 0 || fim < 0) throw new Error("limites do anexo da receita");
const RE_SINT = /^(\d(?:\.\d+)*) --- /;
const sint = [];
for (let i = ini; i < fim; i++) {
  const m = RE_SINT.exec(L[i]);
  if (!m) continue;
  let acum = L[i];
  let j = i;
  for (;;) {
    // O sinal da dedução pode ficar sozinho no fim da linha e o número na seguinte ("204.895.546,50 -" / "13.517.240,00").
    acum = acum.replace(/ - (\d{1,3}(?:\.\d{3})*,\d{2})$/, " -$1");
    const t = acum.split(/\s+/);
    if (t.length >= 2 && RE_BR.test(t[t.length - 1]) && RE_BR.test(t[t.length - 2])) break;
    j++;
    if (j >= fim || RE_SINT.test(L[j]) || /^\d(\.\d+){7} \d{3}/.test(L[j])) throw new Error(`linha ${i + 1}: sintética sem 2 valores`);
    acum += " " + L[j];
  }
  const t = acum.split(/\s+/);
  sint.push({ codigo: m[1], dig: m[1].split(".").join(""), rec: deBr(t[t.length - 2]), ded: deBr(t[t.length - 1]), linha: i + 1 });
  i = j;
}
conferir(
  "Anexo II receita — linhas sintéticas, receita",
  sint.map((s) => ({ chave: s.codigo, lei: s.rec, csv: soma((r) => r.dig.startsWith(s.dig), "rec"), linha: s.linha })),
);
conferir(
  "Anexo II receita — linhas sintéticas, dedução (impressa negativa)",
  sint.map((s) => ({ chave: s.codigo, lei: s.ded, csv: -soma((r) => r.dig.startsWith(s.dig), "ded"), linha: s.linha })),
);
// Toda linha do CSV tem de estar sob alguma sintética de 10 dígitos com a mesma soma (a folha repete o código).
const sint10 = new Set(sint.filter((s) => s.dig.length === 10).map((s) => s.dig));
const orfas = rows.filter((r) => !sint10.has(r.dig));
console.log(`  linhas do CSV sem sintética de 10 dígitos correspondente: ${orfas.length}`);

// ===== 2. Totais do anexo =====
const totLinha = (re) => {
  const out = [];
  for (let i = ini; i <= fim; i++) {
    const m = re.exec(L[i]);
    if (m) out.push({ v: deBr(m[1]), linha: i + 1 });
  }
  return out;
};
const cat = totLinha(/^Total da Categoria Econômica \(receitas - deduções\) R\$ (\S+)$/);
if (cat.length !== 4) throw new Error(`esperados 4 totais de categoria, achados ${cat.length}`);
const liq = (p) => soma((r) => r.dig.startsWith(p), "rec") - soma((r) => r.dig.startsWith(p), "ded");
// Ordem impressa: correntes, capital, correntes intra, capital intra (cabeçalhos RECEITAS ... ORÇAMENTÁRIAS / INTRA).
conferir(
  "Anexo II receita — Total da Categoria Econômica (receitas - deduções), na ordem impressa 1, 2, 7, 8",
  ["1", "2", "7", "8"].map((p, k) => ({ chave: `categoria ${p}`, lei: cat[k].v, csv: liq(p), linha: cat[k].linha })),
);
const tlo = totLinha(/^Total da Lei Orçamentária \(receitas - deduções\) R\$ (\S+)$/);
const tli = totLinha(/^Total da Lei Intra Orçamentária \(receitas - deduções\) R\$ (\S+)$/);
const tg = totLinha(/^Total Geral das receitas \(Orçamentárias \+ Intra-Orçamentárias\)R\$ (\S+)$/);
conferir("Anexo II receita — totais da lei", [
  { chave: "Lei Orçamentária (1+2)", lei: tlo[0].v, csv: liq("1") + liq("2"), linha: tlo[0].linha },
  { chave: "Lei Intra Orçamentária (7+8)", lei: tli[0].v, csv: liq("7") + liq("8"), linha: tli[0].linha },
  { chave: "Total Geral", lei: tg[0].v, csv: totRec - totDed, linha: tg[0].linha },
]);

// ===== 3. Art. 2º =====
const a2 = L.findIndex((l) => l.startsWith("Art. 2º "));
const a2f = L.findIndex((l, i) => i > a2 && l === "Seção II");
const ART2 = { "1.1": ["11"], "1.2": ["12"], "1.3": ["13"], "1.4": ["17"], "1.5": ["19"], "2.1": ["24"], "3.1": ["72"] };
const itens2 = [];
let subtotais = [];
for (let i = a2; i < a2f; i++) {
  let m;
  if ((m = /^(\d\.\d) .+ R\$ (\S+)$/.exec(L[i]))) {
    if (m[1] === "1.6") itens2.push({ chave: "1.6 dedução", lei: deBr(m[2]), csv: -soma((r) => r.dig.startsWith("1"), "ded"), linha: i + 1 });
    else if (ART2[m[1]]) {
      const p = ART2[m[1]][0];
      itens2.push({ chave: `${m[1]} (natureza ${p})`, lei: deBr(m[2]), csv: soma((r) => r.dig.startsWith(p), "rec"), linha: i + 1 });
    } else throw new Error(`linha ${i + 1}: item do art. 2º sem correspondência: ${L[i]}`);
  } else if ((m = /^SUB – TOTAL R\$ (\S+)$/.exec(L[i]))) subtotais.push({ v: deBr(m[1]), linha: i + 1 });
  else if ((m = /^TOTAL GERAL R\$ (\S+)$/.exec(L[i]))) itens2.push({ chave: "TOTAL GERAL", lei: deBr(m[1]), csv: totRec - totDed, linha: i + 1 });
}
if (subtotais.length !== 3) throw new Error(`art. 2º: esperados 3 subtotais, achados ${subtotais.length}`);
["1 correntes (líquido)", "2 capital", "3 intra correntes"].forEach((n, k) =>
  itens2.push({ chave: `SUB-TOTAL ${n}`, lei: subtotais[k].v, csv: liq(["1", "2", "7"][k]), linha: subtotais[k].linha }),
);
conferir("Art. 2º — itens, subtotais e total", itens2);

// ===== 4. Consolidado das receitas e despesas por fonte, coluna Receitas (a) =====
const fIni = L.findIndex((l) => l === "Fonte Descrição Receitas (a) Despesas (b) Saldo (a - b)");
const fFim = L.findIndex((l, i) => i > fIni && /^Total \S+ \S+ \S+$/.test(l));
const fontesLei = new Map();
for (let i = fIni + 1; i < fFim; i++) {
  const m = /^(\d{3})(?: |$)/.exec(L[i]);
  if (!m) continue;
  let acum = L[i];
  let j = i;
  while (!/ \S+,\d{2} \S+,\d{2} \S+,\d{2}$/.test(acum)) acum += " " + L[++j];
  const t = acum.split(/\s+/);
  fontesLei.set(m[1], { v: deBr(t[t.length - 3]), linha: i + 1 });
  i = j;
}
const fontesCsv = new Set(rows.map((r) => r.fonte));
const chavesF = [...new Set([...fontesLei.keys(), ...fontesCsv])].sort();
conferir(
  "Consolidado por fonte — Receitas (a) contra receita líquida do CSV",
  chavesF
    .map((f) => ({ chave: f, lei: fontesLei.get(f)?.v ?? null, csv: soma((r) => r.fonte === f, "rec") - soma((r) => r.fonte === f, "ded"), linha: fontesLei.get(f)?.linha }))
    // fonte só com linhas 0,00 no anexo e ausente do consolidado: não é diferença de valor, vai listada à parte
    .filter((it) => !(it.lei === null && it.csv === 0n)),
);
for (const f of chavesF) if (!fontesLei.has(f)) console.log(`  fonte ${f}: só no CSV, receita ${fmt(soma((r) => r.fonte === f, "rec"))} (ausente do consolidado por fonte)`);

// ===== 5. Deduções já conferidas em loa-2026-deducoes.md =====
const md = readFileSync(join(PASTA, "loa-2026-deducoes.md"), "utf8");
const dedMd = [...md.matchAll(/^\| [\d.]+ \| (\d{8}) \| [^|]+ \| (\d{3}) \| ([\d.,]+) \| ([\d.,]+) \| 3 /gm)];
if (dedMd.length !== 4) throw new Error(`esperadas 4 deduções no .md, achadas ${dedMd.length}`);
const comDed = rows.filter((r) => r.ded !== 0n);
conferir(
  "Deduções contra loa-2026-deducoes.md (natureza, fonte, receita, dedução, tipo 3)",
  dedMd.flatMap((m) => {
    const r = comDed.filter((x) => x.nat === m[1] && x.fonte === m[2]);
    return [
      { chave: `${m[1]}/${m[2]} receita`, lei: deBr(m[3]), csv: r.reduce((s, x) => s + x.rec, 0n), linha: "md" },
      { chave: `${m[1]}/${m[2]} dedução`, lei: deBr(m[4]), csv: r.reduce((s, x) => s + x.ded, 0n), linha: "md" },
      { chave: `${m[1]}/${m[2]} tipo 3`, lei: 1n, csv: BigInt(r.filter((x) => x.tipo === "3").length), linha: "md" },
    ];
  }),
);
console.log(`  linhas do CSV com dedução: ${comDed.length}; com tipo_deducao preenchido: ${rows.filter((r) => r.tipo !== "").length}`);

console.log(`\n## Resumo: ${divergencias.length} diferença(s)`);
for (const d of divergencias) console.log(`  ${d}`);
