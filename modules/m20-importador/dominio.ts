import { createHash } from "node:crypto";
import { Decimal } from "../../packages/contracts/index.js";

/**
 * M20 — O DOMÍNIO PURO DOS IMPORTADORES (TR 7.10-7.11). Zero I/O, zero Prisma: recebe o TEXTO do
 * arquivo e devolve linhas tipadas + violações. É isto que o teste confronta, sem banco.
 *
 * ═══ O LAYOUT É PARAMETRIZÁVEL, E ISSO NÃO É PREGUIÇA ═══
 * NÃO existe layout oficial de folha do município: o arquivo é insumo do ENTE, e cada folha
 * (RH próprio, terceirizado) tem colunas diferentes. Fixar um layout aqui seria inventar um
 * contrato que ninguém assinou (PATCH §4). Então o MAPA DE COLUNAS é configuração — mesma
 * doutrina do `SPEC_BB` (M17) e da registry do SAGRES (M15): o dado externo entra por um mapa
 * declarado, e trocar de folha é trocar o mapa, não o código.
 *
 * ⚠️ A POC usa uma fixture SINTÉTICA (docs/poc-fixtures/) claramente identificada. Nenhum
 * servidor, matrícula ou CPF corresponde a pessoa real.
 *
 * ⚠️ FAIL-CLOSED POR LINHA: cada violação NOMEIA a linha e o campo. Um arquivo com qualquer
 * violação NÃO é confirmável — a prévia mostra, e nada grava.
 */

// ── O MAPA DE COLUNAS (configuração) ─────────────────────────────────────────────

export interface MapaColunasFolha {
  readonly matricula: string;
  readonly nome: string;
  readonly fichaNumero: string;
  readonly fonteCodigo: string;
  readonly valorBruto: string;
  /** Consignações: rótulo da coluna → código do tipo de consignação (INSS, ISS…). */
  readonly consignacoes: Readonly<Record<string, string>>;
}

/** O mapa da FIXTURE da POC. Trocar de folha = trocar este mapa (config), não o código. */
export const MAPA_FOLHA_POC: MapaColunasFolha = {
  matricula: "matricula",
  nome: "nome",
  fichaNumero: "ficha",
  fonteCodigo: "fonte",
  valorBruto: "bruto",
  consignacoes: { inss: "INSS", iss: "ISS" },
};

export interface MapaColunasTributos {
  readonly guia: string;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly coCodigo: string;
  readonly valor: string;
  readonly data: string;
}

export const MAPA_TRIBUTOS_POC: MapaColunasTributos = {
  guia: "guia",
  naturezaCodigo: "natureza",
  fonteCodigo: "fonte",
  coCodigo: "co",
  valor: "valor",
  data: "data",
};

// ── VIOLAÇÕES (a mesma forma do validador SAGRES: nomeia linha e campo) ────────────

export interface ViolacaoImportacao {
  /** 1-indexada, a linha do ARQUIVO (o cabeçalho é a linha 1). */
  readonly linha: number;
  readonly campo: string;
  readonly detalhe: string;
}

// ── LINHAS TIPADAS ────────────────────────────────────────────────────────────────

export interface ConsignacaoDaLinha {
  readonly tipoCodigo: string;
  readonly valor: string;
}

export interface LinhaFolha {
  readonly linha: number;
  readonly matricula: string;
  readonly nome: string;
  readonly fichaNumero: number;
  readonly fonteCodigo: string;
  readonly valorBruto: string;
  readonly consignacoes: readonly ConsignacaoDaLinha[];
  /** bruto − Σconsignações. Derivado aqui (apresentação/prévia); o funil recalcula na gravação. */
  readonly valorLiquido: string;
}

export interface LinhaTributo {
  readonly linha: number;
  readonly guia: string;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
  readonly coCodigo: string;
  readonly valor: string;
  readonly data: Date;
}

export interface PreviaImportacao<T> {
  readonly nomeArquivo: string;
  readonly arquivoHash: string;
  readonly linhas: readonly T[];
  readonly violacoes: readonly ViolacaoImportacao[];
  readonly totalBruto: string;
  /** Confirmável só quando NÃO há violação (fail-closed). */
  readonly confirmavel: boolean;
}

// ── PARSE CSV (UTF-8, separador ';' — o padrão BR do Excel) ───────────────────────

/** sha256 do conteúdo — a trava de idempotência da origem. */
export function hashDoArquivo(conteudo: string): string {
  return createHash("sha256").update(conteudo, "utf8").digest("hex");
}

function linhasDoCsv(conteudo: string): string[][] {
  return conteudo
    .replace(/^﻿/, "") // BOM do Excel
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "")
    .map((l) => l.split(";").map((c) => c.trim()));
}

/** Um valor BR ("1.234,56") ou simples ("1234.56") → string decimal canônica. `null` se inválido. */
function valorDecimal(bruto: string): string | null {
  const limpo = bruto.trim();
  if (limpo === "") return null;
  const canonico = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^-?\d+(\.\d{1,2})?$/.test(canonico)) return null;
  try {
    return new Decimal(canonico).toFixed(2);
  } catch {
    return null;
  }
}

/** Data ISO (aaaa-mm-dd) ou BR (dd/mm/aaaa) → Date UTC. `null` se inválida. */
function dataDoTexto(bruto: string): Date | null {
  const t = bruto.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  const [a, m, d] = iso !== null ? [iso[1]!, iso[2]!, iso[3]!] : br !== null ? [br[3]!, br[2]!, br[1]!] : [];
  if (a === undefined) return null;
  const data = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d), 12, 0, 0));
  return Number.isNaN(data.getTime()) ? null : data;
}

// ── PRÉVIA DA FOLHA ───────────────────────────────────────────────────────────────

export function previaDaFolha(
  nomeArquivo: string,
  conteudo: string,
  mapa: MapaColunasFolha = MAPA_FOLHA_POC
): PreviaImportacao<LinhaFolha> {
  const linhas = linhasDoCsv(conteudo);
  const violacoes: ViolacaoImportacao[] = [];
  const resultado: LinhaFolha[] = [];
  let total = new Decimal(0);

  if (linhas.length < 2) {
    violacoes.push({ linha: 1, campo: "arquivo", detalhe: "arquivo sem linhas de dado (só cabeçalho, ou vazio)" });
    return { nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: [], violacoes, totalBruto: "0.00", confirmavel: false };
  }

  const cab = linhas[0]!.map((c) => c.toLowerCase());
  const col = (nome: string): number => cab.indexOf(nome.toLowerCase());
  const obrigatorias = [mapa.matricula, mapa.nome, mapa.fichaNumero, mapa.fonteCodigo, mapa.valorBruto];
  for (const o of obrigatorias) {
    if (col(o) < 0) violacoes.push({ linha: 1, campo: o, detalhe: `coluna "${o}" não existe no arquivo (confira o mapa de colunas)` });
  }
  if (violacoes.length > 0) {
    return { nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: [], violacoes, totalBruto: "0.00", confirmavel: false };
  }

  for (let i = 1; i < linhas.length; i++) {
    const nLinha = i + 1;
    const c = linhas[i]!;
    const pegar = (nome: string): string => c[col(nome)] ?? "";

    const matricula = pegar(mapa.matricula);
    const nome = pegar(mapa.nome);
    const fichaBruta = pegar(mapa.fichaNumero);
    const fonteCodigo = pegar(mapa.fonteCodigo);
    const bruto = valorDecimal(pegar(mapa.valorBruto));

    if (matricula === "") violacoes.push({ linha: nLinha, campo: mapa.matricula, detalhe: "matrícula vazia" });
    if (nome === "") violacoes.push({ linha: nLinha, campo: mapa.nome, detalhe: "nome vazio" });
    const ficha = Number.parseInt(fichaBruta, 10);
    if (!Number.isInteger(ficha)) violacoes.push({ linha: nLinha, campo: mapa.fichaNumero, detalhe: `ficha "${fichaBruta}" não é um número inteiro` });
    if (!/^\d{3}$/.test(fonteCodigo)) violacoes.push({ linha: nLinha, campo: mapa.fonteCodigo, detalhe: `fonte "${fonteCodigo}" deve ter 3 dígitos` });
    if (bruto === null) violacoes.push({ linha: nLinha, campo: mapa.valorBruto, detalhe: `valor bruto "${pegar(mapa.valorBruto)}" inválido` });

    const consignacoes: ConsignacaoDaLinha[] = [];
    let somaConsig = new Decimal(0);
    for (const [coluna, tipoCodigo] of Object.entries(mapa.consignacoes)) {
      const idx = col(coluna);
      if (idx < 0) continue; // consignação opcional: coluna ausente = sem esse desconto
      const v = valorDecimal(c[idx] ?? "0");
      if (v === null) {
        violacoes.push({ linha: nLinha, campo: coluna, detalhe: `consignação "${c[idx] ?? ""}" inválida` });
        continue;
      }
      if (new Decimal(v).greaterThan(0)) {
        consignacoes.push({ tipoCodigo, valor: v });
        somaConsig = somaConsig.plus(v);
      }
    }

    if (bruto !== null) {
      const liquido = new Decimal(bruto).minus(somaConsig);
      if (liquido.lessThan(0)) {
        violacoes.push({ linha: nLinha, campo: mapa.valorBruto, detalhe: `consignações (${somaConsig.toFixed(2)}) excedem o bruto (${bruto})` });
      }
      total = total.plus(bruto);
      resultado.push({
        linha: nLinha, matricula, nome, fichaNumero: Number.isInteger(ficha) ? ficha : 0,
        fonteCodigo, valorBruto: bruto, consignacoes, valorLiquido: liquido.toFixed(2),
      });
    }
  }

  return {
    nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: resultado, violacoes,
    totalBruto: total.toFixed(2), confirmavel: violacoes.length === 0 && resultado.length > 0,
  };
}

// ── PRÉVIA DOS TRIBUTOS ───────────────────────────────────────────────────────────

export function previaDeTributos(
  nomeArquivo: string,
  conteudo: string,
  mapa: MapaColunasTributos = MAPA_TRIBUTOS_POC
): PreviaImportacao<LinhaTributo> {
  const linhas = linhasDoCsv(conteudo);
  const violacoes: ViolacaoImportacao[] = [];
  const resultado: LinhaTributo[] = [];
  let total = new Decimal(0);

  if (linhas.length < 2) {
    violacoes.push({ linha: 1, campo: "arquivo", detalhe: "arquivo sem linhas de dado (só cabeçalho, ou vazio)" });
    return { nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: [], violacoes, totalBruto: "0.00", confirmavel: false };
  }

  const cab = linhas[0]!.map((c) => c.toLowerCase());
  const col = (nome: string): number => cab.indexOf(nome.toLowerCase());
  for (const o of [mapa.guia, mapa.naturezaCodigo, mapa.fonteCodigo, mapa.valor, mapa.data]) {
    if (col(o) < 0) violacoes.push({ linha: 1, campo: o, detalhe: `coluna "${o}" não existe no arquivo (confira o mapa de colunas)` });
  }
  if (violacoes.length > 0) {
    return { nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: [], violacoes, totalBruto: "0.00", confirmavel: false };
  }

  for (let i = 1; i < linhas.length; i++) {
    const nLinha = i + 1;
    const c = linhas[i]!;
    const pegar = (nome: string): string => c[col(nome)] ?? "";

    const guia = pegar(mapa.guia);
    const natureza = pegar(mapa.naturezaCodigo);
    const fonte = pegar(mapa.fonteCodigo);
    const coIdx = col(mapa.coCodigo);
    const co = coIdx >= 0 ? (c[coIdx] ?? "") : "";
    const valor = valorDecimal(pegar(mapa.valor));
    const data = dataDoTexto(pegar(mapa.data));

    if (guia === "") violacoes.push({ linha: nLinha, campo: mapa.guia, detalhe: "guia vazia" });
    if (!/^\d{8}$/.test(natureza)) violacoes.push({ linha: nLinha, campo: mapa.naturezaCodigo, detalhe: `natureza "${natureza}" deve ter 8 dígitos` });
    if (!/^\d{3}$/.test(fonte)) violacoes.push({ linha: nLinha, campo: mapa.fonteCodigo, detalhe: `fonte "${fonte}" deve ter 3 dígitos` });
    if (valor === null || new Decimal(valor).lessThanOrEqualTo(0)) violacoes.push({ linha: nLinha, campo: mapa.valor, detalhe: `valor "${pegar(mapa.valor)}" deve ser positivo` });
    if (data === null) violacoes.push({ linha: nLinha, campo: mapa.data, detalhe: `data "${pegar(mapa.data)}" inválida (use aaaa-mm-dd ou dd/mm/aaaa)` });

    if (valor !== null && data !== null) {
      total = total.plus(valor);
      resultado.push({ linha: nLinha, guia, naturezaCodigo: natureza, fonteCodigo: fonte, coCodigo: co, valor, data });
    }
  }

  return {
    nomeArquivo, arquivoHash: hashDoArquivo(conteudo), linhas: resultado, violacoes,
    totalBruto: total.toFixed(2), confirmavel: violacoes.length === 0 && resultado.length > 0,
  };
}
