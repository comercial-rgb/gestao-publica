import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { Decimal } from "../packages/contracts/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-029) — PELA TELA: O CSV DE UMA LISTA É O CONJUNTO FILTRADO INTEIRO, LIDO POR UM LEITOR INDEPENDENTE.
 *
 * Só lê. Na base R3 (1.054 fichas de 2026, 43 páginas de 25 na tela):
 *   1. o planejador abre as fichas e o link "Exportar CSV" diz o total da consulta; o arquivo baixado pelo link tem a
 *      marca de ordem de bytes, o cabeçalho com os acentos das colunas da tela, e TODAS as linhas — conferidas contra
 *      a contagem e a soma do autorizado feitas AQUI por SQL (precisão: centavo a centavo);
 *   2. com o filtro da tela (unidade 02004), o link leva o filtro, e o arquivo tem exatamente as fichas daquele recorte;
 *   3. quem não consulta o planejamento não recebe o arquivo (vai para a tela de sem acesso).
 * O leitor de CSV é escrito aqui (RFC 4180 com ";"), sem importar o gerador.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

/** Leitor independente: RFC 4180, separador ";", aspas duplicadas, CRLF ou LF. */
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i] as string;
    if (aspas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i += 1; }
      else if (ch === '"') aspas = false;
      else campo += ch;
      continue;
    }
    if (ch === '"') aspas = true;
    else if (ch === ";") { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texto[i + 1] === "\n") i += 1;
      linha.push(campo); campo = "";
      linhas.push(linha); linha = [];
    } else campo += ch;
  }
  if (campo !== "" || linha.length > 0) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

const where = (q?: string) => ({
  exercicio: 2026,
  ...(q === undefined ? {} : { OR: [{ unidadeOrc: { codigo: { startsWith: q } } }, { naturezaDespesa: { codigoCompleto: { startsWith: q } } }, { unidadeOrc: { descricao: { contains: q, mode: "insensitive" as const } } }, ...(/^\d+$/.test(q) && q.length <= 6 ? [{ numero: Number(q) }] : [])] }),
});
const esperado = async (q?: string) => {
  const fs = await prisma.fichaOrcamentaria.findMany({ where: where(q), select: { numero: true, saldoAutorizado: true } });
  return { total: fs.length, soma: fs.reduce((s, f) => s.plus(f.saldoAutorizado.toString()), new Decimal(0)).toFixed(2), numeros: new Set(fs.map((f) => String(f.numero))) };
};

const nav = await lancarNavegadorDoPercurso();
try {
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "planejador@ficticio.local", senha);
  const baixar = async (rota: string) => {
    await irPara(n, p, rota);
    const href = await p.$eval("a[data-exportar-csv]", (a) => ({ href: a.getAttribute("href") ?? "", rotulo: (a.textContent ?? "").trim() })).catch(() => ({ href: "", rotulo: "" }));
    const r = await p.evaluate(async (h: string) => {
      const resp = await fetch(h, { credentials: "same-origin" });
      const buf = new Uint8Array(await resp.arrayBuffer());
      return { status: resp.status, tipo: resp.headers.get("content-type") ?? "", bytes: Array.from(buf.slice(0, 3)), texto: new TextDecoder("utf-8", { ignoreBOM: true }).decode(buf) };
    }, href.href);
    return { ...href, ...r };
  };

  for (const caso of [{ rotulo: "todas as fichas de 2026", rota: "/planejamento/fichas?exercicio=2026", q: undefined }, { rotulo: "o filtro da unidade 02004", rota: "/planejamento/fichas?exercicio=2026&q=02004", q: "02004" }]) {
    const e = await esperado(caso.q);
    const r = await baixar(caso.rota);
    const tabela = lerCsv(r.texto.replace(/^﻿/, ""));
    const [cab = [], ...corpo] = tabela;
    const iFicha = cab.indexOf("Ficha");
    const iAut = cab.indexOf("Autorizado");
    const soma = corpo.reduce((s, l) => s.plus(l[iAut] ?? "0"), new Decimal(0)).toFixed(2);
    const numeros = new Set(corpo.map((l) => l[iFicha] ?? ""));
    const mesmas = numeros.size === e.numeros.size && [...e.numeros].every((x) => numeros.has(x));
    conferir(
      r.status === 200 && /text\/csv/.test(r.tipo) && r.bytes.join(",") === "239,187,191" &&
        cab.join("|") === "Ficha|Exercício|Unidade|Funcional-programática|Natureza|Fonte|Autorizado|Disponível (cache)" &&
        corpo.length === e.total && corpo.every((l) => l.length === cab.length) && mesmas && soma === e.soma &&
        r.rotulo.includes(e.total.toLocaleString("pt-BR")) && (caso.q === undefined || r.href.includes(`q=${caso.q}`)),
      `${caso.rotulo} [href=${r.href} status=${String(r.status)} pagina=${new URL(p.url()).pathname}]: ${String(corpo.length)} linhas (SQL ${String(e.total)}), as mesmas fichas, autorizado ${soma} (SQL ${e.soma}); cabeçalho "${cab.slice(0, 4).join("|")}…"; ${r.rotulo}`
    );
  }
  await ctx.close();

  const ctxN = await nav.createBrowserContext();
  const pn = await ctxN.newPage();
  pn.setDefaultTimeout(300000);
  await entrar(n, pn, "consulta.convenios@ficticio.local", senha);
  await irPara(n, pn, "/planejamento/fichas");
  const r = await pn.evaluate(async () => {
    const resp = await fetch("/exportar/fichas?exercicio=2026", { credentials: "same-origin" });
    return { url: resp.url, tipo: resp.headers.get("content-type") ?? "" };
  });
  conferir(/\/sem-acesso\?acao=CONSULTAR_PLANEJAMENTO/.test(r.url) && !/text\/csv/.test(r.tipo), `quem não consulta o planejamento não recebe o arquivo: vai para ${r.url.replace(/^https?:\/\/[^/]+/, "")}`);
  await ctxN.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do CSV completo.");
