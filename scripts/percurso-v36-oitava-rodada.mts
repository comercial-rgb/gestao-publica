import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO DA OITAVA RODADA:
 *   2. obra no portal (TR 5.10.1.54): documento anexado, publicada, vista e baixada sem sessão; retirada, 404.
 *   1. cronograma pelo percentual de cada mês (TR 5.9.3.37): soma errada recusada dizendo a soma, nada gravado; com
 *      100% a versão nova é gravada e cada fonte fecha com a previsão.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-oitava-rodada.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-6);

async function percentuais(page: Page, valores: readonly string[], ato: string): Promise<string> {
  await irPara(n, page, "/planejamento/cmd-mba?exercicio=2026");
  // Os percentuais são campos controlados: o valor vai pelo setter do protótipo, como o helper faz com a data.
  await page.$$eval("form[data-acao='cronograma-por-percentual'] input[name='percentual']", (is, vs) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    is.forEach((i, k) => {
      setter?.call(i, vs[k] ?? "");
      i.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }, [...valores]);
  const r = await preencherEEnviar(page, "cronograma-por-percentual", [
    { sel: 'input[name="atoRef"]', valor: ato },
    { sel: 'input[name="vigenteDesde"]', valor: "2026-10-07", tipo: "data" },
  ]);
  return r.texto;
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. cronograma pelo percentual de cada mês ──
  const antes = await prisma.versaoCmd.count({ where: { exercicio: 2026 } });
  const recusa = await percentuais(page, ["10", "8", "8", "8", "8", "8", "8", "8", "8", "8", "8", "9"], `Decreto do percurso ${marca}-A`);
  conferir(/somam 99,00%/.test(recusa) && (await prisma.versaoCmd.count({ where: { exercicio: 2026 } })) === antes, `soma 99%: recusada ("${recusa.trim().slice(0, 80)}"), nada gravado`);
  const ok = await percentuais(page, ["10", "8", "8", "8", "8", "8", "8", "8", "8", "8", "8", "10"], `Decreto do percurso ${marca}-B`);
  const versao = await prisma.versaoCmd.findFirst({ where: { exercicio: 2026, atoRef: `Decreto do percurso ${marca}-B` }, select: { id: true, numero: true, cotas: { select: { fonteId: true, mes: true, valor: true } } } });
  const previstas = await prisma.receitaPrevista.findMany({ where: { exercicio: 2026 }, select: { fonteId: true, tipoReceita: true, valorPrevisto: true } });
  const fontes = versao === null ? [] : [...new Set(versao.cotas.map((c) => c.fonteId))];
  const fecha = fontes.every((f) => {
    const soma = versao!.cotas.filter((c) => c.fonteId === f).reduce((a, c) => a + Math.round(Number(c.valor.toFixed(2)) * 100), 0);
    const jan = versao!.cotas.find((c) => c.fonteId === f && c.mes === 1);
    return soma > 0 && jan !== undefined && Math.abs(Math.round(Number(jan.valor.toFixed(2)) * 100) - Math.round(soma / 10)) <= 1;
  });
  conferir(
    versao !== null && fontes.length > 0 && fecha && previstas.length > 0,
    `soma 100%: versão ${String(versao?.numero ?? "-")} gravada com ${String(fontes.length)} fonte(s); janeiro = 10% de cada fonte (${ok.trim().slice(0, 70)})`
  );

  // ── 2. obra no portal da transparência (TR 5.10.1.54) ──
  const identificador = `OB-PORTAL-${marca}`;
  await irPara(n, page, "/licitacoes/obras");
  await preencherEEnviar(page, "criar-obras", [
    { sel: 'input[name="identificador"]', valor: identificador },
    { sel: 'textarea[name="descricao"]', valor: "Obra fictícia publicada pelo percurso" },
    { sel: 'select[name="tipoObraServico"]', valor: "PAVIMENTACAO_ASFALTICA", tipo: "select" },
  ]);
  const obra = await prisma.obra.findUniqueOrThrow({ where: { identificador }, select: { id: true } });
  const caminho = join(tmpdir(), `projeto-da-obra-${marca}.pdf`);
  writeFileSync(caminho, `%PDF-1.4\n% projeto fictício ${marca}\n`);
  await irPara(n, page, `/licitacoes/obras/${obra.id}?aba=anexos`);
  await preencherEEnviar(page, "anexar", [{ sel: 'input[name="arquivo"]', valor: caminho, tipo: "arquivo" }]);
  const anexo = await prisma.anexo.findFirst({ where: { obraId: obra.id }, select: { id: true } });
  conferir(anexo !== null, `documento anexado à obra ${identificador} pela aba Anexos`);
  await irPara(n, page, `/licitacoes/obras/${obra.id}`);
  await preencherEEnviar(page, "publicar-obra", []);
  const anon = await (await nav.createBrowserContext()).newPage();
  anon.setDefaultTimeout(120000);
  await anon.goto(`${n.base}/transparencia/obras`, { waitUntil: "domcontentloaded" });
  const naLista = (await anon.evaluate(() => document.body.innerText)).includes(identificador);
  await anon.goto(`${n.base}/transparencia/obras/${obra.id}`, { waitUntil: "domcontentloaded" });
  const detalhe = await anon.evaluate(() => document.body.innerText);
  const baixa = async (): Promise<number> => (await anon.evaluate(async (u) => (await fetch(u)).status, `${n.base}/transparencia/obras/anexo/${anexo?.id ?? "x"}`));
  const statusPublicado = await baixa();
  conferir(
    naLista && /Valor contratado/i.test(detalhe) && detalhe.includes(`projeto-da-obra-${marca}.pdf`) && statusPublicado === 200,
    `publicada: na lista pública sem sessão, detalhe com valores e o documento, download ${String(statusPublicado)}`
  );
  await irPara(n, page, `/licitacoes/obras/${obra.id}`);
  await preencherEEnviar(page, "publicar-obra", [{ sel: 'input[name="motivo"]', valor: "Retirada para revisão do projeto" }]);
  const resp = await anon.goto(`${n.base}/transparencia/obras/${obra.id}`, { waitUntil: "domcontentloaded" });
  const statusRetirado = await baixa();
  conferir(resp?.status() === 404 && statusRetirado === 404, `retirada: detalhe público ${String(resp?.status())} e download ${String(statusRetirado)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da oitava rodada completo.");
