// Extrai o QUADRO DE DETALHAMENTO DA DESPESA (QDD) da LOA 2026 de Esperança/PB (Lei Ordinária 613/2025)
// para um CSV derivado, uma linha por ficha orçamentária (o menor nível que o QDD traz).
//
// Uso: node scripts/fontes/extrair-qdd-esperanca-2026.mjs [--texto <arquivo -raw>] [--saida <csv>]
//   Sem --texto, roda `pdftotext -raw -enc UTF-8 <pdf> -` (poppler; no Git Bash está em /mingw64/bin; o caminho
//   do executável pode vir em PDFTOTEXT). O .txt já versionado na pasta foi extraído SEM -raw: nele o QDD sai com
//   os valores em bloco separado das fichas e não serve para ler valor.
// Saída padrão: docs/oficial/esperanca-pb/qdd-2026-DERIVADO.csv
//
// Fail-closed: qualquer linha dentro do QDD que não seja cabeçalho de página, unidade, ação, ficha (com eventual
// descrição quebrada em várias linhas) ou "Total da Ficha/Unidade" interrompe a extração com o número da linha.
// Valores ficam como texto decimal exato (nunca number). A soma de conferência por ação usa BigInt em centavos
// só para avisar; a conferência de verdade é feita por scripts/fontes/conferir-qdd-esperanca-2026.mjs, que não
// importa nada daqui.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PDF = join(RAIZ, "docs", "oficial", "esperanca-pb", "lei-613-2025-loa-2026.pdf");

const args = process.argv.slice(2);
const arg = (n) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const saida = arg("--saida") ?? join(RAIZ, "docs", "oficial", "esperanca-pb", "qdd-2026-DERIVADO.csv");

let texto;
if (arg("--texto") !== undefined) {
  texto = readFileSync(arg("--texto"), "utf8");
} else {
  const r = spawnSync(process.env.PDFTOTEXT ?? "pdftotext", ["-raw", "-enc", "UTF-8", PDF, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`pdftotext falhou (status ${r.status}): ${r.stderr ?? r.error}`);
  texto = r.stdout;
}

// \f marca a quebra de página no -raw e cola no início da linha seguinte.
const linhas = texto.split(/\r?\n/).map((l) => l.replace(/\f/g, "").trimEnd());

const DINHEIRO = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const RE_INICIO = /^Identificador Classificação Descrição Fonte Valor Total$/;
const RE_FIM = new RegExp(`^Total do Orçamento (${DINHEIRO})$`);
const RE_UNIDADE = /^(\d{4}) - (.+)$/;
const RE_ACAO = /^(\d{4})\.(\d{2})\.(\d{3})\.(\d{4})\.(\d{4}) - (.+)$/;
const RE_FICHA = /^(\d{5}) (\d)\.(\d)\.(\d{2})\.(\d{2})\.(\d{2})\.(\d{2})(?: (.*))?$/;
const RE_FECHO_FICHA = new RegExp(`^(.*?) ?(\\d{3}) (${DINHEIRO})$`);
const RE_TOTAL_FICHA = new RegExp(`^Total da Ficha Orçamentária (${DINHEIRO})$`);
const RE_TOTAL_UNIDADE = new RegExp(`^Total da Unidade Orçamentaria (${DINHEIRO})$`);
const RE_CABECALHO = [
  /^Copyright 2025 , Info Public Tecnologia/,
  /^PREFEITURA MUNICIPAL DE ESPERANÇA$/,
  /^ESTADO DA PARAÍBA$/,
  /^QUADRO DE DETALHAMENTO DA DESPESAS - Q\.D\.D$/,
  /^EXERCÍCIO: 2026$/,
  /^Página: \d+\/34$/,
  /^R\$ 1,00$/,
  RE_INICIO,
  /^da Despesa$/,
  /^LEGISLATIVO$/,
  /^EXECUTIVO$/,
];

const inicio = linhas.findIndex((l) => RE_INICIO.test(l));
if (inicio < 0) throw new Error("início do QDD não encontrado");
const fim = linhas.findIndex((l, i) => i > inicio && RE_FIM.test(l));
if (fim < 0) throw new Error("'Total do Orçamento' não encontrado depois do início do QDD");

const paraDecimal = (v) => v.replace(/\./g, "").replace(",", ".");
const centavos = (v) => BigInt(paraDecimal(v).replace(".", ""));

let unidade = null; // { codigo4, descricao }
let acao = null; // { funcao, subfuncao, programa, acao, descricao }
let somaAcao = 0n;
const registros = [];
const avisos = [];

for (let i = inicio; i < fim; i++) {
  const l = linhas[i];
  const n = i + 1; // linha 1-based do texto -raw
  if (l === "" || RE_CABECALHO.some((re) => re.test(l))) continue;
  let m;
  if ((m = RE_ACAO.exec(l))) {
    if (unidade === null || m[1] !== unidade.codigo4) throw new Error(`linha ${n}: ação ${m[1]} fora da unidade corrente`);
    acao = { funcao: m[2], subfuncao: m[3], programa: m[4], acao: m[5], descricao: m[6].trim() };
    somaAcao = 0n;
    continue;
  }
  if ((m = RE_UNIDADE.exec(l))) {
    unidade = { codigo4: m[1], descricao: m[2].trim() };
    acao = null;
    continue;
  }
  if ((m = RE_FICHA.exec(l))) {
    if (acao === null) throw new Error(`linha ${n}: ficha sem ação corrente`);
    const [, ficha, d1, d2, d34, d56, sub1, sub2] = m;
    let resto = m[8] ?? "";
    let j = i;
    let f;
    while (!(f = RE_FECHO_FICHA.exec(resto))) {
      j++;
      if (j >= fim) throw new Error(`linha ${n}: ficha ${ficha} sem fonte/valor até o fim do QDD`);
      const prox = linhas[j];
      if (RE_FICHA.test(prox) || RE_ACAO.test(prox) || RE_TOTAL_FICHA.test(prox)) {
        throw new Error(`linha ${n}: ficha ${ficha} sem fonte/valor antes da linha ${j + 1}`);
      }
      resto = resto === "" ? prox : `${resto} ${prox}`;
    }
    i = j;
    registros.push({
      orgao: `0${unidade.codigo4[0]}`,
      unidade: `0${unidade.codigo4}`,
      descricaoUnidade: unidade.descricao,
      ...acao,
      natureza: `${d1}${d2}${d34}${d56}`,
      naturezaQdd: `${d1}.${d2}.${d34}.${d56}.${sub1}.${sub2}`,
      fonte: f[2],
      valor: paraDecimal(f[3]),
      ficha,
      linha: n,
    });
    somaAcao += centavos(f[3]);
    continue;
  }
  if ((m = RE_TOTAL_FICHA.exec(l))) {
    if (centavos(m[1]) !== somaAcao) avisos.push(`linha ${n}: Total da Ficha ${m[1]} difere da soma das fichas da ação`);
    continue;
  }
  if (RE_TOTAL_UNIDADE.test(l)) continue;
  throw new Error(`linha ${n}: linha não reconhecida dentro do QDD: ${JSON.stringify(l)}`);
}

const campo = (s) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const cab = "orgao;unidade_orcamentaria;descricao_unidade;funcao;subfuncao;programa;acao;descricao_acao;natureza_despesa;fonte;valor;ficha;natureza_qdd";
const corpo = registros.map((r) =>
  [r.orgao, r.unidade, r.descricaoUnidade, r.funcao, r.subfuncao, r.programa, r.acao, r.descricao, r.natureza, r.fonte, r.valor, r.ficha, r.naturezaQdd]
    .map(campo)
    .join(";"),
);
const fichas = new Set(registros.map((r) => r.ficha));
if (fichas.size !== registros.length) throw new Error(`ficha repetida: ${registros.length} linhas, ${fichas.size} fichas`);

writeFileSync(saida, [cab, ...corpo].join("\n") + "\n", "utf8");
const total = registros.reduce((s, r) => s + BigInt(r.valor.replace(".", "")), 0n);
const reais = `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
console.log(`QDD: linhas ${inicio + 1}-${fim + 1} do texto -raw; ${registros.length} fichas; total ${reais}; saída ${saida}`);
for (const a of avisos) console.log(`AVISO ${a}`);
