// V27 — Deriva do CSV de licitações dos dados abertos do TCE-PB (por município) só as colunas que ligam a licitação
// ao protocolo do Tramita: UG, número da licitação, protocolo, ano e modalidade. Proponentes (nome e CPF/CNPJ) NÃO
// saem daqui: são dados pessoais que o vínculo não precisa.
//
// Uso: node scripts/fontes/derivar-licitacoes-tce-pb.mjs <licitacoes-AAAA.csv> <saida.csv>
//
// O arquivo do Tribunal tem quebras de linha dentro do objeto da licitação: cada registro começa pelo nome do
// município seguido do código da UG (6 dígitos), e as linhas que não começam assim continuam o registro anterior.
import { readFileSync, writeFileSync } from "node:fs";

const [entrada, saida] = process.argv.slice(2);
if (entrada === undefined || saida === undefined) throw new Error("uso: <licitacoes-AAAA.csv> <saida.csv>");
const linhas = readFileSync(entrada, "utf8").replace(/^﻿/, "").split(/\r?\n/);
const cabecalho = linhas.shift().split(";");
const col = (n) => {
  const i = cabecalho.indexOf(n);
  if (i < 0) throw new Error(`coluna ${n} ausente no cabeçalho`);
  return i;
};
const C = ["codigo_unidade_gestora", "descricao_unidade_gestora", "numero_licitacao", "numero_protocolo_tce", "ano_licitacao", "modalidade"].map(col);
const registros = [];
for (const l of linhas) {
  if (/^[^;]+;\d{6};/.test(l)) registros.push(l);
  else if (registros.length > 0) registros[registros.length - 1] += " " + l;
}
const vistos = new Set();
const fora = [cabecalho.length > 0 ? C.map((i) => cabecalho[i]).join(";") : ""];
for (const r of registros) {
  const c = r.split(";");
  // O objeto (coluna 7) pode conter ";": os campos que pegamos vêm antes dele, então não se deslocam.
  const linha = C.map((i) => (c[i] ?? "").trim()).join(";");
  if (!vistos.has(linha)) {
    vistos.add(linha);
    fora.push(linha);
  }
}
writeFileSync(saida, fora.join("\n") + "\n");
console.log(`${String(registros.length)} registros, ${String(fora.length - 1)} licitações distintas`);
