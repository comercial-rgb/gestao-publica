// Extrai a RECEITA PREVISTA por natureza e fonte do Anexo II "RESUMO GERAL DA RECEITA" da LOA 2026 de
// Esperança/PB (Lei Ordinária 613/2025), com o valor bruto e a dedução de cada linha analítica.
//
// Uso: node scripts/fontes/extrair-receita-esperanca-2026.mjs [--texto <arquivo -raw>] [--saida <csv>]
//   Sem --texto, roda `pdftotext -raw -enc UTF-8 <pdf> -` (executável em PDFTOTEXT, se não estiver no PATH).
// Saída padrão: docs/oficial/esperanca-pb/receita-prevista-2026-DERIVADO.csv
//
// Lê SÓ as linhas analíticas do anexo, isto é, as que têm código completo de 10 dígitos e fonte de 3 dígitos
// (`1.7.1.1.51.1.1.00 500 ... 50.737.500,00 -10.147.500,00`). As linhas sintéticas (`--- `) não entram, porque
// são somas. A descrição pode quebrar em várias linhas, e o registro termina quando o texto acumulado acaba em dois
// valores (receita e dedução). O que fica fora:
//   - natureza: os 8 primeiros dígitos (17115111). O código como a lei imprime vai em natureza_lei, porque o
//     detalhamento local (.00, .02) distingue linhas que, com 8 dígitos, teriam a mesma natureza e a mesma fonte;
//   - deducao: o valor absoluto do que a lei imprime com sinal negativo. Uma dedução positiva interrompe a extração;
//   - tipo_deducao: "3" (dedução para o Fundeb, na tabela do Tribunal) nas linhas com dedução, e só quando a soma
//     das deduções do anexo é igual ao "4.1 - Total Destinado ao FUNDEB (Deduções Cadastradas no Sistema)" do
//     demonstrativo da MDE da mesma lei. Se não for igual, a extração para. Nas linhas sem dedução fica vazio.
// Valores ficam como texto decimal exato. Este script não importa nada da conferência.
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
const saida = arg("--saida") ?? join(PASTA, "receita-prevista-2026-DERIVADO.csv");
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
const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\f/g, "").trimEnd());

const M = String.raw`-?\d{1,3}(?:\.\d{3})*,\d{2}`;
const RE_FOLHA = /^(\d)\.(\d)\.(\d)\.(\d)\.(\d{2})\.(\d)\.(\d)\.(\d{2}) (\d{3})(?: (.*))?$/;
const RE_SINTETICA = /^\d(?:\.\d+)* --- /;
const RE_FECHO = new RegExp(`^(.*?) ?(${M}) (${M})$`);

const anexoDespesa = linhas.findIndex((l) => l === "ANEXO II - RESUMO GERAL DAS DESPESAS");
if (anexoDespesa < 0) throw new Error("Anexo II da despesa não encontrado");
const ini = linhas.findIndex((l, i) => i > anexoDespesa && l === "RECEITAS CORRENTES ORÇAMENTÁRIAS");
const fim = linhas.findIndex((l, i) => i > ini && l.startsWith("Total Geral das receitas (Orçamentárias + Intra-Orçamentárias)"));
if (ini < 0 || fim < 0) throw new Error("limites do Anexo II da receita não encontrados");

const decimal = (v) => v.replace(/\./g, "").replace(",", ".");
const centavos = (v) => BigInt(decimal(v).replace("-", "").replace(".", "")) * (v.startsWith("-") ? -1n : 1n);

const regs = [];
for (let i = ini; i < fim; i++) {
  const m = RE_FOLHA.exec(linhas[i]);
  if (!m) continue;
  let acum = m[10] ?? "";
  let j = i;
  let f;
  while (!(f = RE_FECHO.exec(acum))) {
    j++;
    const p = linhas[j];
    if (j >= fim || RE_FOLHA.test(p) || RE_SINTETICA.test(p)) throw new Error(`linha ${i + 1}: natureza sem receita e dedução`);
    acum = acum === "" ? p : `${acum} ${p}`;
  }
  i = j;
  const [rec, ded] = [f[2], f[3]];
  if (rec.startsWith("-")) throw new Error(`linha ${i + 1}: receita negativa ${rec}`);
  if (centavos(ded) > 0n) throw new Error(`linha ${i + 1}: dedução positiva ${ded}`);
  regs.push({
    natureza: m.slice(1, 8).join(""),
    naturezaLei: m.slice(1, 9).join("."),
    descricao: f[1].trim(),
    fonte: m[9],
    valor: decimal(rec),
    deducao: decimal(ded.replace("-", "")),
    linha: i + 1,
  });
}

// tipo_deducao: só com o total do demonstrativo da MDE lido do mesmo texto.
const mde = linhas.map((l) => /^4\.1 - Total Destinado ao FUNDEB \(Deduções Cadastradas no Sistema\) (\S+)$/.exec(l)).filter(Boolean);
if (mde.length !== 1) throw new Error(`esperada uma linha 4.1 do demonstrativo da MDE, achadas ${mde.length}`);
const somaDed = regs.reduce((s, r) => s + BigInt(r.deducao.replace(".", "")), 0n);
if (somaDed !== centavos(mde[0][1])) throw new Error(`deduções do anexo (${somaDed} centavos) diferem do 4.1 da MDE (${mde[0][1]})`);

const campo = (s) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const out = ["natureza;descricao;fonte;valor;deducao;tipo_deducao;natureza_lei"];
for (const r of regs) {
  const tipo = r.deducao === "0.00" ? "" : "3";
  out.push([r.natureza, r.descricao, r.fonte, r.valor, r.deducao, tipo, r.naturezaLei].map(campo).join(";"));
}
writeFileSync(saida, out.join("\n") + "\n", "utf8");

const somaRec = regs.reduce((s, r) => s + BigInt(r.valor.replace(".", "")), 0n);
const fmt = (c) => `${c / 100n}.${String(c % 100n).padStart(2, "0")}`;
const chaves = new Map();
for (const r of regs) chaves.set(`${r.natureza}|${r.fonte}`, [...(chaves.get(`${r.natureza}|${r.fonte}`) ?? []), r.naturezaLei]);
console.log(`Anexo II receita: linhas ${ini + 1}-${fim + 1}; ${regs.length} linhas analíticas; receita ${fmt(somaRec)}; dedução ${fmt(somaDed)}; líquida ${fmt(somaRec - somaDed)}`);
for (const [k, v] of chaves) if (v.length > 1) console.log(`AVISO natureza+fonte ${k} repetida com 8 dígitos: ${v.join(", ")}`);
