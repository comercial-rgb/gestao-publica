import "dotenv/config";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-028) — AS FAMÍLIAS DE PDF, UMA A UMA, LIDAS PELO pdfjs (independente do gerador, que é o Chromium).
 *
 * Só lê, com quem só consulta (leitura.documentos). Para cada família, um documento representativo da base R3, e em
 * TODA página: o ente no cabeçalho da primeira; o título e o período esperados; "Página i de N" com i em ordem e N = o
 * número real de páginas; o mesmo identificador SHA-256 do conteúdo em todas; o aviso de assinatura; texto além do
 * rodapé (página vazia acusa); nenhum texto fora da largura da página (corte acusa); nenhuma letra do corpo abaixo
 * de 6 pt (o Chromium encolhe a página inteira quando o conteúdo é mais largo que ela: medido com uma tabela a 170%); nenhum código interno
 * (MAIÚSCULAS_COM_SUBLINHADO) e nenhum CPF/CNPJ sem máscara no texto. Família sem documento na base é
 * dita, não contada. PROBE=1 imprime o começo do texto de cada documento.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const PROBE = process.env["PROBE"] === "1";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const nota = (o: string): void => console.log(`--  ${o}`);

const empenho = await prisma.empenho.findFirst({ where: { numero: "R3-PAT-001/2026" }, select: { id: true } });
const conta = await prisma.contaBancaria.findUnique({ where: { codigo: "FIC-PM-500" }, select: { id: true } });
const divida = await prisma.dividaConsolidada.findFirst({ select: { id: true } });
const termo = await prisma.termoPatrimonial.findFirst({ select: { id: true } });
const folha = await prisma.folhaDePagamento.findFirst({ orderBy: { criadoEm: "desc" }, select: { id: true } });

interface Familia {
  readonly nome: string;
  readonly rota: string | null;
  readonly titulo: RegExp;
  readonly periodo: RegExp;
  /** Um total do documento conferido contra o SQL feito aqui (o texto que tem de aparecer). */
  readonly total?: string;
  /** Dispensa NOMEADA da conferência de código interno (o motivo sai na linha do resultado). */
  readonly semCodigoInterno?: string;
}
const br = (v: string): string => { const [i = "0", d = "00"] = v.split("."); return `${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${d}`; };
const dotado2026 = (await prisma.fichaOrcamentaria.aggregate({ where: { exercicio: 2026 }, _sum: { valorDotado: true } }))._sum.valorDotado?.toFixed(2) ?? "0.00";
const FAMILIAS: readonly Familia[] = [
  { nome: "demonstrações contábeis", rota: "/relatorios/demonstracoes/balanco-orcamentario/pdf?exercicio=2026", titulo: /Balanço Orçamentário/i, periodo: /2026/ },
  { nome: "livros", rota: "/relatorios/livros/diario/pdf?desde=2026-10-01&ate=2026-10-15", titulo: /Diário/i, periodo: /01\/10\/2026.*15\/10\/2026/, semCodigoInterno: "o número de controle de cada lançamento é identificador gravado (append-only) e carrega o tipo do fato; pendência NUMERO-DE-CONTROLE-COM-CODIGO-INTERNO" },
  { nome: "listagens operacionais", rota: "/despesa/empenhos/pdf?exercicio=2026", titulo: /Empenhos/i, periodo: /2026/ },
  { nome: "gerencial", rota: "/relatorios/gerenciais/pdf?exercicio=2026", titulo: /Gerencial|empenhos/i, periodo: /2026/ },
  { nome: "documento individual (nota de empenho)", rota: empenho === null ? null : `/despesa/empenhos/ne?id=${empenho.id}`, titulo: /Nota de empenho/i, periodo: /2026/ },
  { nome: "pagamentos efetuados", rota: "/relatorios/pagamentos/pdf?exercicio=2026", titulo: /Pagamentos/i, periodo: /2026/ },
  { nome: "tesouraria (borderô dos movimentos)", rota: conta === null ? null : `/financeiro/movimentacao/bordero?conta=${conta.id}&desde=2026-10-01&ate=2026-10-15`, titulo: /Borderô/i, periodo: /01\/10\/2026.*15\/10\/2026/ },
  { nome: "dívida", rota: divida === null ? null : `/relatorios/divida/pdf?divida=${divida.id}`, titulo: /Dívida/i, periodo: /\d{4}/ },
  { nome: "planejamento (LOA)", rota: "/planejamento/loa/pdf?exercicio=2026", titulo: /Orçament/i, periodo: /2026/, total: `Despesa fixada ${br(dotado2026)}` },
  { nome: "termo patrimonial", rota: termo === null ? null : `/patrimonio/termos/${termo.id}/pdf?via=atual`, titulo: /Termo/i, periodo: /\d{4}/ },
  { nome: "folha (resumo)", rota: folha === null ? null : `/folha/folhas/${folha.id}/resumo?formato=pdf`, titulo: /Resumo/i, periodo: /\d{4}/ },
  { nome: "público (RREO)", rota: "/transparencia/demonstrativos/pdf?slug=rreo-anexo1&exercicio=2026&bimestre=4", titulo: /Resumido da Execução Orçamentária|Balanço Orçamentário/i, periodo: /2026/ },
];

interface PaginaLida {
  readonly texto: string;
  readonly largura: number;
  readonly foraDaLargura: number;
  readonly itensForaDoRodape: number;
  /** A menor letra do corpo, em pontos (o Chromium ENCOLHE a página inteira quando o conteúdo é mais largo que ela). */
  readonly menorLetra: number;
}
async function lerPdf(bytes: Uint8Array): Promise<PaginaLida[]> {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const paginas: PaginaLida[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pg = await doc.getPage(i);
    const vista = pg.getViewport({ scale: 1 });
    const conteudo = await pg.getTextContent();
    let fora = 0;
    let corpo = 0;
    let menor = Number.POSITIVE_INFINITY;
    const partes: string[] = [];
    for (const it of conteudo.items) {
      if (!("str" in it)) continue;
      partes.push(it.str);
      const x = it.transform[4] as number;
      const y = it.transform[5] as number;
      if (it.str.trim() !== "" && (x < -1 || x + it.width > vista.width + 1)) fora += 1;
      // o rodapé mora nos ~24 mm de baixo (y pequeno no sistema do PDF)
      if (it.str.trim() !== "" && y > 70) {
        corpo += 1;
        menor = Math.min(menor, Math.hypot(it.transform[2] as number, it.transform[3] as number));
      }
    }
    paginas.push({ texto: partes.join(" ").replace(/\s+/g, " "), largura: vista.width, foraDaLargura: fora, itensForaDoRodape: corpo, menorLetra: menor });
  }
  return paginas;
}

const nav = await lancarNavegadorDoPercurso();
try {
  const ctx = await nav.createBrowserContext();
  const p = await ctx.newPage();
  p.setDefaultTimeout(300000);
  await entrar(n, p, "leitura.documentos@ficticio.local", senha);
  await irPara(n, p, "/");
  for (const f of FAMILIAS.filter((x) => process.env["SO_FAMILIA"] === undefined || x.nome.startsWith(process.env["SO_FAMILIA"]))) {
    if (f.rota === null) {
      nota(`${f.nome}: sem documento desta família na base R3`);
      continue;
    }
    const r = await p.evaluate(async (rota: string) => {
      const resp = await fetch(rota, { credentials: "same-origin" });
      const buf = new Uint8Array(await resp.arrayBuffer());
      let bin = "";
      for (const b of buf) bin += String.fromCharCode(b);
      return { status: resp.status, tipo: resp.headers.get("content-type") ?? "", url: resp.url, b64: btoa(bin) };
    }, f.rota);
    if (!/application\/pdf/.test(r.tipo)) {
      conferir(false, `${f.nome}: ${f.rota} não devolveu PDF (status ${String(r.status)}, ${r.tipo}, ${new URL(r.url).pathname})`);
      continue;
    }
    const paginas = await lerPdf(Uint8Array.from(Buffer.from(r.b64, "base64")));
    const N = paginas.length;
    if (PROBE) console.log(`\n[${f.nome}] ${String(N)} pág.\n  p1: ${paginas[0]?.texto.slice(0, 500) ?? ""}\n  fim: ${paginas[N - 1]?.texto.slice(-300) ?? ""}`);
    const hashes = paginas.map((pg) => /Identificador do conteúdo \(SHA-256\): ([0-9a-f]{64})/.exec(pg.texto)?.[1] ?? "");
    const paginacao = paginas.every((pg, i) => pg.texto.includes(`Página ${String(i + 1)} de ${String(N)}`));
    const assinatura = paginas.every((pg) => /documento não assinado digitalmente/.test(pg.texto) || /Assinatura|assinatura e data/.test(pg.texto));
    const vazias = paginas.map((pg, i) => (pg.itensForaDoRodape === 0 ? i + 1 : 0)).filter((x) => x > 0);
    const cortadas = paginas.map((pg, i) => (pg.foraDaLargura > 0 ? `${String(i + 1)}(${String(pg.foraDaLargura)})` : "")).filter((x) => x !== "");
    const p1 = paginas[0]?.texto ?? "";
    const menorLetra = Math.min(...paginas.map((pg) => pg.menorLetra));
    const totalOk = f.total === undefined || p1.includes(f.total);
    const codigos = [...new Set(paginas.flatMap((pg) => pg.texto.match(/\b[A-Z]{2,}(?:_[A-Z0-9]+)+\b/g) ?? []))];
    const semMascara = [...new Set(paginas.flatMap((pg) => pg.texto.match(/(?<![\w.\/-])(?:\d{11}|\d{14})(?![\w.\/-])/g) ?? []))];
    conferir(
      N > 0 && /Esperança/.test(p1) && f.titulo.test(p1) && f.periodo.test(p1) && paginacao && hashes.every((h) => h !== "" && h === hashes[0]) && assinatura && vazias.length === 0 && cortadas.length === 0 && (codigos.length === 0 || f.semCodigoInterno !== undefined) && semMascara.length === 0 && totalOk && menorLetra >= 6,
      `${f.nome}: ${String(N)} pág.; ente ${/Esperança/.test(p1) ? "sim" : "NÃO"}, título ${f.titulo.test(p1) ? "sim" : "NÃO"}, período ${f.periodo.test(p1) ? "sim" : "NÃO"}, paginação ${paginacao ? "sim" : "NÃO"}, hash ${hashes.every((h) => h !== "" && h === hashes[0]) ? "o mesmo em todas" : "DIVERGE"}, assinatura ${assinatura ? "dita" : "NÃO"}, vazias [${vazias.join(",")}], cortadas [${cortadas.join(",")}], menor letra ${menorLetra.toFixed(1)} pt, códigos internos ${f.semCodigoInterno !== undefined ? `dispensados (${f.semCodigoInterno})` : `[${codigos.slice(0, 5).join(",")}]`}, documentos sem máscara [${semMascara.slice(0, 3).join(",")}]${f.total === undefined ? "" : `, "${f.total}" (SQL) ${totalOk ? "no documento" : "AUSENTE"}`}`
    );
  }
  await ctx.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das famílias de PDF completo.");
