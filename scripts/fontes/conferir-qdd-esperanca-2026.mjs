// Conferência INDEPENDENTE do CSV derivado do QDD da LOA 2026 de Esperança/PB (Lei Ordinária 613/2025).
//
// Uso: node scripts/fontes/conferir-qdd-esperanca-2026.mjs [--texto <arquivo -raw>] [--csv <csv>] [--tce <csv>]
//   Sem --texto, roda `pdftotext -raw -enc UTF-8 <pdf> -` (executável em PDFTOTEXT, se não estiver no PATH).
//
// Não importa nada de extrair-qdd-esperanca-2026.mjs. Lê o CSV como dado e confronta suas somas com os números
// IMPRESSOS na própria lei, cada um lido por uma regra de leitura própria do quadro onde está:
//   - QDD: "Total da Ficha Orçamentária" (por ação, achada pelo identificador anterior), "Total da Unidade
//     Orçamentaria" (unidade achada pelo identificador de ação anterior, não pelo cabeçalho) e "Total do Orçamento";
//   - art. 3º: grupos de natureza (1.1.1 ... 1.3.1) e "DESPESAS POR UNIDADE ORÇAMENTÁRIA";
//   - Anexo II (resumo geral da despesa): por elemento, grupo e categoria;
//   - Anexo II A: por unidade × elemento e "Total do Órgão";
//   - Anexo IX: por unidade × função;
//   - quadro por unidade e função, subfunção, programa e ação: por unidade × ação (projeto+atividade+especial);
//   - consolidados por ação, fonte, função, programa e subfunção;
//   - consolidado de receitas e despesas por fonte (coluna Despesas (b)).
// Toda diferença sai com valor e linha do texto -raw. Nada é ajustado.
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
const caminhoCsv = arg("--csv") ?? join(PASTA, "qdd-2026-DERIVADO.csv");
const caminhoTce = arg("--tce") ?? join(RAIZ, "docs", "oficial", "tce-pb", "esperanca-078", "unidades-orcamentarias-2026-DERIVADO.csv");

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

// ---------- dinheiro em centavos (BigInt), lido do texto da lei ("1.234,56") e do CSV ("1234.56") ----------
const RE_BR = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const deBr = (s) => {
  if (!RE_BR.test(s)) throw new Error(`valor fora do formato brasileiro: ${s}`);
  const [int, cent] = s.split(",");
  return BigInt(int.split(".").join("")) * 100n + BigInt(cent);
};
const deCsv = (s) => {
  if (!/^\d+\.\d{2}$/.test(s)) throw new Error(`valor do CSV fora do formato: ${s}`);
  return BigInt(s.replace(".", ""));
};
const fmt = (c) => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const int = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}${int},${String(a % 100n).padStart(2, "0")}`;
};

// ---------- CSV ----------
const linhasCsv = readFileSync(caminhoCsv, "utf8").split("\n").filter((l) => l !== "");
if (linhasCsv.some((l) => l.includes('"'))) throw new Error("CSV com aspas: esta conferência lê campos simples");
const cab = linhasCsv[0].split(";");
const ix = (n) => {
  const i = cab.indexOf(n);
  if (i < 0) throw new Error(`coluna ${n} ausente`);
  return i;
};
const C = Object.fromEntries(
  ["orgao", "unidade_orcamentaria", "funcao", "subfuncao", "programa", "acao", "natureza_despesa", "fonte", "valor", "ficha"].map((n) => [n, ix(n)]),
);
const dot = linhasCsv.slice(1).map((l) => {
  const c = l.split(";");
  if (c.length !== cab.length) throw new Error(`linha do CSV com ${c.length} campos: ${l}`);
  return c;
});
const somaPor = (chave) => {
  const m = new Map();
  for (const c of dot) {
    const k = chave(c);
    m.set(k, (m.get(k) ?? 0n) + deCsv(c[C.valor]));
  }
  return m;
};
const totalCsv = dot.reduce((s, c) => s + deCsv(c[C.valor]), 0n);

// ---------- leitura de quadros impressos ----------
const idx = (re, desde = 0) => {
  for (let i = desde; i < L.length; i++) if (re.test(L[i])) return i;
  throw new Error(`âncora não encontrada: ${re} depois da linha ${desde + 1}`);
};
const idxUltimoAntes = (re, antes) => {
  for (let i = antes - 1; i >= 0; i--) if (re.test(L[i])) return i;
  throw new Error(`âncora não encontrada: ${re} antes da linha ${antes + 1}`);
};
// Registro = linha que começa por um código; a descrição pode quebrar em várias linhas; o registro termina na
// linha em que o texto acumulado acaba em EXATAMENTE n valores. Outro código antes disso = erro.
const contarValoresNoFim = (s) => {
  const t = s.split(/\s+/).filter(Boolean);
  let k = 0;
  while (k < t.length && RE_BR.test(t[t.length - 1 - k])) k++;
  return { k, valores: t.slice(t.length - k) };
};
function lerQuadro(ini, fim, reCodigo, n, { contexto } = {}) {
  const out = [];
  let ctx = null;
  for (let i = ini; i < fim; i++) {
    if (contexto) {
      const m = contexto.exec(L[i]);
      if (m) {
        ctx = m[1];
        continue;
      }
    }
    const m = reCodigo.exec(L[i]);
    if (!m) continue;
    let acum = L[i].slice(m[0].length).replace(/R\$/g, " ");
    let j = i;
    for (;;) {
      const { k, valores } = contarValoresNoFim(acum);
      if (k === n) {
        out.push({ codigo: m[1], ctx, valores: valores.map(deBr), linha: i + 1 });
        break;
      }
      if (k > n) throw new Error(`linha ${i + 1}: ${k} valores, esperados ${n}: ${acum}`);
      j++;
      if (j >= fim || reCodigo.test(L[j])) throw new Error(`linha ${i + 1}: registro ${m[1]} sem ${n} valores`);
      acum += " " + L[j].replace(/R\$/g, " ");
    }
    i = j;
  }
  return out;
}

const divergencias = [];
function comparar(titulo, impresso, csv, { rotulo = (k) => k } = {}) {
  // impresso: Map chave -> {valor, linha}; csv: Map chave -> centavos
  const chaves = [...new Set([...impresso.keys(), ...csv.keys()])].sort();
  let ok = 0;
  const linhas = [];
  for (const k of chaves) {
    const a = impresso.get(k);
    const b = csv.get(k) ?? 0n;
    const lei = a?.valor ?? null;
    if (lei !== null && lei === b) {
      ok++;
      continue;
    }
    const d = (b ?? 0n) - (lei ?? 0n);
    const desc = `${titulo} | ${rotulo(k)} | lei ${lei === null ? "(ausente)" : fmt(lei)} | CSV ${fmt(b)} | CSV-lei ${fmt(d)} | linha ${a?.linha ?? "-"}`;
    linhas.push(desc);
    divergencias.push(desc);
  }
  console.log(`\n## ${titulo}: ${chaves.length} chaves, ${ok} iguais, ${chaves.length - ok} diferentes`);
  for (const l of linhas) console.log(`  DIFERENÇA ${l}`);
  return { chaves: chaves.length, ok };
}
const mapa = (regs, chave, valor) => {
  const m = new Map();
  for (const r of regs) {
    const k = chave(r);
    if (m.has(k)) throw new Error(`chave repetida ${k} (linhas ${m.get(k).linha} e ${r.linha})`);
    m.set(k, { valor: valor(r), linha: r.linha });
  }
  return m;
};
const soma3 = (r) => r.valores.reduce((s, v) => s + v, 0n);

console.log(`# Conferência do QDD 2026 — CSV ${caminhoCsv}`);
console.log(`linhas do CSV (sem cabeçalho): ${dot.length}; total do CSV: ${fmt(totalCsv)}`);

// ===== 1. QDD: totais impressos dentro do próprio quadro =====
const qIni = idx(/^Identificador Classificação Descrição Fonte Valor Total$/);
const qFim = idx(/^Total do Orçamento /, qIni);
const RE_ID = /^(\d{4})\.(\d{2})\.(\d{3})\.(\d{4})\.(\d{4}) - /;
const fichaImpressa = new Map();
const unidadeImpressa = new Map();
for (let i = qIni; i <= qFim; i++) {
  let m;
  if ((m = /^Total da Ficha Orçamentária (\S+)$/.exec(L[i]))) {
    const id = RE_ID.exec(L[idxUltimoAntes(RE_ID, i)]);
    const k = `0${id[1]}|${id[2]}.${id[3]}.${id[4]}.${id[5]}`;
    if (fichaImpressa.has(k)) throw new Error(`ação ${k} com dois totais (linha ${i + 1})`);
    fichaImpressa.set(k, { valor: deBr(m[1]), linha: i + 1 });
  } else if ((m = /^Total da Unidade Orçamentaria (\S+)$/.exec(L[i]))) {
    const id = RE_ID.exec(L[idxUltimoAntes(RE_ID, i)]);
    unidadeImpressa.set(`0${id[1]}`, { valor: deBr(m[1]), linha: i + 1 });
  }
}
const totalOrcamento = deBr(/^Total do Orçamento (\S+)$/.exec(L[qFim])[1]);
const porAcaoUnidade = somaPor((c) => `${c[C.unidade_orcamentaria]}|${c[C.funcao]}.${c[C.subfuncao]}.${c[C.programa]}.${c[C.acao]}`);
const porUnidade = somaPor((c) => c[C.unidade_orcamentaria]);
const porOrgao = somaPor((c) => c[C.orgao]);
comparar("QDD — Total da Ficha Orçamentária por ação", fichaImpressa, porAcaoUnidade);
comparar("QDD — Total da Unidade Orçamentaria", unidadeImpressa, porUnidade);
comparar("QDD — Total do Orçamento", new Map([["total", { valor: totalOrcamento, linha: qFim + 1 }]]), new Map([["total", totalCsv]]));

// ===== 2. Art. 3º =====
const a3 = idx(/^Art\. 3º /);
const a3Und = idx(/^DESPESAS POR UNIDADE ORÇAMENTÁRIA$/, a3);
const a3Fim = idx(/^TOTAL GERAL R\$ /, a3Und);
const GRUPO_ART3 = { "1.1.1": "31", "1.1.2": "32", "1.1.3": "33", "1.2.1": "44", "1.2.2": "45", "1.2.3": "46", "1.3.1": "99" };
const gruposArt3 = lerQuadro(a3, a3Und, /^(1\.\d\.\d) /, 1);
comparar(
  "Art. 3º — grupos de natureza (1.1.1 pessoal ... 1.3.1 reserva)",
  mapa(gruposArt3, (r) => GRUPO_ART3[r.codigo] ?? `?${r.codigo}`, (r) => r.valores[0]),
  somaPor((c) => c[C.natureza_despesa].slice(0, 2)),
);
// "10.01" = poder 1, unidade 01 -> 01001; "20.16" -> 02016 (mesmo código de 5 dígitos que o Anexo IX imprime)
const undArt3 = lerQuadro(a3Und + 1, a3Fim, /^(\d{2}\.\d{2}) /, 1);
comparar(
  "Art. 3º — despesas por unidade orçamentária",
  mapa(undArt3, (r) => `0${r.codigo[0]}0${r.codigo.slice(3)}`, (r) => r.valores[0]),
  porUnidade,
);
comparar(
  "Art. 3º — coerência interna: soma das unidades impressas × TOTAL GERAL impresso (coluna 'CSV' = soma das unidades)",
  new Map([["total", { valor: deBr(/R\$ (\S+)$/.exec(L[a3Fim])[1]), linha: a3Fim + 1 }]]),
  new Map([["total", undArt3.reduce((s, r) => s + r.valores[0], 0n)]]),
);
comparar("Art. 3º — TOTAL GERAL da despesa", new Map([["total", { valor: deBr(/R\$ (\S+)$/.exec(L[a3Fim])[1]), linha: a3Fim + 1 }]]), new Map([["total", totalCsv]]));

// ===== 3. Anexo II — resumo geral da despesa =====
const a2Ini = idx(/^DEMONSTRATIVO DA EVOLUÇÃO DA DESPESA$/);
const a2Fim = idx(/^Total Geral: /, a2Ini);
const a2 = lerQuadro(a2Ini, a2Fim, /^(\d(?:\.\d(?:\.\d{2}(?:\.\d{2})?)?)?)(?= |$)/, 1);
const elem = a2.filter((r) => r.codigo.length === 9);
comparar(
  "Anexo II — por elemento",
  mapa(elem, (r) => r.codigo.split(".").join(""), (r) => r.valores[0]),
  somaPor((c) => c[C.natureza_despesa]),
);
comparar(
  "Anexo II — por categoria e grupo",
  mapa(a2.filter((r) => r.codigo.length <= 3), (r) => r.codigo.split(".").join(""), (r) => r.valores[0]),
  new Map([...somaPor((c) => c[C.natureza_despesa][0]), ...somaPor((c) => c[C.natureza_despesa].slice(0, 2))]),
);
comparar(
  "Anexo II — por modalidade (d.d.dd)",
  mapa(a2.filter((r) => r.codigo.length === 6), (r) => r.codigo.split(".").join(""), (r) => r.valores[0]),
  somaPor((c) => c[C.natureza_despesa].slice(0, 4)),
);
// Coerência interna do Anexo II: soma dos elementos impressos contra a modalidade impressa (não usa o CSV).
{
  const mod = new Map();
  for (const r of elem) mod.set(r.codigo.slice(0, 6), (mod.get(r.codigo.slice(0, 6)) ?? 0n) + r.valores[0]);
  const imp = mapa(a2.filter((r) => r.codigo.length === 6), (r) => r.codigo, (r) => r.valores[0]);
  comparar("Anexo II — coerência interna: modalidade impressa × soma dos elementos impressos (coluna 'CSV' = soma dos elementos)", imp, mod);
}
// Mesmo elemento, só com as fichas de desdobramento 00.00 (natureza_qdd), para explicar diferença por desdobramento.
{
  const iq = cab.indexOf("natureza_qdd");
  if (iq >= 0) {
    const m = new Map();
    for (const c of dot) if (c[iq].endsWith(".00.00")) m.set(c[C.natureza_despesa], (m.get(c[C.natureza_despesa]) ?? 0n) + deCsv(c[C.valor]));
    comparar(
      "Anexo II — por elemento, CSV só com desdobramento 00.00",
      mapa(elem, (r) => r.codigo.split(".").join(""), (r) => r.valores[0]),
      m,
    );
    const fora = dot.filter((c) => !c[iq].endsWith(".00.00"));
    for (const c of fora) console.log(`  FICHA COM DESDOBRAMENTO ${c[iq]}: ficha ${c[C.ficha]}, unidade ${c[C.unidade_orcamentaria]}, fonte ${c[C.fonte]}, ${fmt(deCsv(c[C.valor]))}`);
  }
}
comparar("Anexo II — Total Geral", new Map([["total", { valor: deBr(/(\S+)$/.exec(L[a2Fim])[1]), linha: a2Fim + 1 }]]), new Map([["total", totalCsv]]));

// ===== 4. Anexo II A — unidade × elemento e Total do Órgão =====
const iaIni = idx(/^ANEXO I - DEMONSTRATIVO DA RECEITA E DESPESA$/, idx(/^ANEXO I - DEMONSTRATIVO DA RECEITA E DESPESA$/) + 1);
const iaFim = idx(/^Descrição da Unidade Orçamentária \/ Função Valor$/, iaIni);
const a2aElem = lerQuadro(iaIni, iaFim, /^(\d\.\d\.\d{2}\.\d{2})(?= |$)/, 1, { contexto: /^(\d{4}) - / });
comparar(
  "Anexo II A — unidade × elemento",
  mapa(a2aElem, (r) => `0${r.ctx}|${r.codigo.split(".").join("")}`, (r) => r.valores[0]),
  somaPor((c) => `${c[C.unidade_orcamentaria]}|${c[C.natureza_despesa]}`),
);
const a2aMod = lerQuadro(iaIni, iaFim, /^(\d\.\d\.\d{2})(?= |$)/, 1, { contexto: /^(\d{4}) - / });
comparar(
  "Anexo II A — unidade × modalidade",
  mapa(a2aMod, (r) => `0${r.ctx}|${r.codigo.split(".").join("")}`, (r) => r.valores[0]),
  somaPor((c) => `${c[C.unidade_orcamentaria]}|${c[C.natureza_despesa].slice(0, 4)}`),
);
const a2aTot = lerQuadro(iaIni, iaFim, /^Total do (Órgão):/, 1, { contexto: /^(\d{4}) - / });
comparar("Anexo II A — Total do Órgão (por unidade)", mapa(a2aTot, (r) => `0${r.ctx}`, (r) => r.valores[0]), porUnidade);

// ===== 5. Anexo IX — unidade × função =====
const ixFim = idx(/^Total Geral: /, iaFim);
const a9 = lerQuadro(iaFim, ixFim, /^Função: (\d{2}) - /, 1, { contexto: /^(\d{5}) - / });
comparar(
  "Anexo IX — unidade × função",
  mapa(a9, (r) => `${r.ctx}|${r.codigo}`, (r) => r.valores[0]),
  somaPor((c) => `${c[C.unidade_orcamentaria]}|${c[C.funcao]}`),
);
const a9Tot = lerQuadro(iaFim, ixFim, /^Total do (Órgão):/, 1, { contexto: /^(\d{5}) - / });
comparar("Anexo IX — Total do Órgão (por unidade)", mapa(a9Tot, (r) => r.ctx, (r) => r.valores[0]), porUnidade);
comparar("Anexo IX — Total Geral", new Map([["total", { valor: deBr(/(\S+)$/.exec(L[ixFim])[1]), linha: ixFim + 1 }]]), new Map([["total", totalCsv]]));

// ===== 6. Por unidade orçamentária e função, subfunção, programa e ação =====
const uaIni = idx(/^DEMONSTRATIVO DOS MACRO OBJETIVOS E PROGRAMAS$/, idx(/^DEMONSTRATIVO DOS MACRO OBJETIVOS E PROGRAMAS$/) + 1);
const uaFim = idx(/^DEMONSTRATIVO DOS MACRO OBJETIVOS$/, uaIni);
const ua = lerQuadro(uaIni, uaFim, /^(\d{2}\.\d{3}\.\d{4}\.\d{4})(?= |$)/, 3, { contexto: /^(\d{5}) - / });
comparar("Quadro por unidade e ação — unidade × ação (P+A+E)", mapa(ua, (r) => `${r.ctx}|${r.codigo}`, soma3), porAcaoUnidade);

// ===== 7. Consolidados (P, A) =====
const acFim = idxUltimoAntes(/^CONSOLIDADO POR AÇÃO \(P, A\)$/, idx(/^CONSOLIDADO POR FONTE \(P, A\)$/));
const ac = lerQuadro(ixFim + 1, acFim, /^(\d{4})(?= |$)/, 4);
comparar("Consolidado por ação — total", mapa(ac, (r) => r.codigo, (r) => r.valores[3]), somaPor((c) => c[C.acao]));

const foHdr = idx(/^CONSOLIDADO POR FONTE \(P, A\)$/);
const fo = lerQuadro(idxUltimoAntes(/^Projeto Atividade Especial Total$/, foHdr), foHdr, /^(\d{3})(?= |$)/, 4);
const porFonte = somaPor((c) => c[C.fonte]);
comparar("Consolidado por fonte (P, A) — total", mapa(fo, (r) => r.codigo, (r) => r.valores[3]), porFonte);

const fuHdr = idx(/^ANEXO - CONSOLIDADO POR FUNCAO \(P, A\)$/);
const fu = lerQuadro(idxUltimoAntes(/^Projeto Atividade Especial Total$/, fuHdr), fuHdr, /^(\d{2})(?= )/, 4);
comparar("Consolidado por função — total", mapa(fu, (r) => r.codigo, (r) => r.valores[3]), somaPor((c) => c[C.funcao]));

const prHdr = idx(/^CONSOLIDADO POR PROGRAMA \(P, A\)$/);
const pr = lerQuadro(fuHdr + 1, prHdr, /^(\d{4})(?= )/, 4);
comparar("Consolidado por programa — total", mapa(pr, (r) => r.codigo, (r) => r.valores[3]), somaPor((c) => c[C.programa]));

const sfHdr2 = idx(/^CONSOLIDADO POR SUBFUNÇÃO \(P, A\)$/, idx(/^CONSOLIDADO POR SUBFUNÇÃO \(P, A\)$/) + 1);
const sf = lerQuadro(prHdr + 1, sfHdr2, /^(\d{3})(?= )/, 4);
comparar("Consolidado por subfunção — total", mapa(sf, (r) => r.codigo, (r) => r.valores[3]), somaPor((c) => c[C.subfuncao]));

// ===== 8. Consolidado das receitas e despesas por fonte — coluna Despesas (b) =====
const rfIni = idx(/^Fonte Descrição Receitas \(a\) Despesas \(b\) Saldo \(a - b\)$/);
const rfFim = idx(/^Total \S+ \S+ \S+$/, rfIni);
const rf = lerQuadro(rfIni, rfFim, /^(\d{3})(?= |$)/, 3);
comparar("Receitas e despesas por fonte — Despesas (b)", mapa(rf, (r) => r.codigo, (r) => r.valores[1]), porFonte);
comparar("Receitas e despesas por fonte — Receitas (a) contra despesa do CSV", mapa(rf, (r) => r.codigo, (r) => r.valores[0]), porFonte);

// ===== 9. Órgão (poder) — soma das unidades impressas no QDD por primeiro dígito =====
const orgImpresso = new Map();
for (const [u, v] of unidadeImpressa) {
  const o = u.slice(0, 2);
  const cur = orgImpresso.get(o) ?? { valor: 0n, linha: [] };
  cur.valor += v.valor;
  cur.linha.push(v.linha);
  orgImpresso.set(o, cur);
}
for (const v of orgImpresso.values()) v.linha = `soma das linhas ${v.linha.join(", ")}`;
comparar("Órgão (01 Legislativo, 02 Executivo) — soma dos totais de unidade impressos no QDD", orgImpresso, porOrgao);

// ===== 10. Unidades do QDD contra as declaradas ao TCE-PB =====
const tce = readFileSync(caminhoTce, "utf8").split(/\r?\n/).filter(Boolean).slice(1).map((l) => l.split(";"));
const undTce = new Map(tce.map((c) => [c[1], c[2]]));
const undCsv = new Set(dot.map((c) => c[C.unidade_orcamentaria]));
console.log(`\n## Unidades: CSV ${undCsv.size}, TCE-PB ${undTce.size}`);
for (const u of [...undCsv].sort()) if (!undTce.has(u)) console.log(`  SÓ NO QDD ${u}`);
for (const [u, d] of [...undTce].sort()) if (!undCsv.has(u)) console.log(`  SÓ NO TCE-PB ${u} ${d}`);

console.log(`\n## Resumo: ${divergencias.length} diferença(s)`);
for (const d of divergencias) console.log(`  ${d}`);
