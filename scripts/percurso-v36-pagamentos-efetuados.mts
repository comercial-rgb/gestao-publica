import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DO RELATÓRIO DE PAGAMENTOS EFETUADOS (só leitura), na base fictícia com a etapa financeira:
 *   1. o menu leva ao relatório; o exercício traz os pagamentos com retido (INSS da folha) e líquido = pago − retido;
 *   2. o filtro de conta e o de período recortam; agrupar por credor dá um bloco por credor com subtotal que fecha;
 *   3. "só o valor pago" tira as colunas de retenção; o PDF e o CSV saem com o mesmo recorte.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-pagamentos-efetuados.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
/** "1.234,56" -> centavos (BigInt). */
const centavos = (t: string): bigint => BigInt(t.replace(/[^\d,-]/g, "").replace(",", ""));

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, usuario, senha);

  await irPara(n, page, "/relatorios");
  const noMenu = await page.$$eval('a[href="/relatorios/pagamentos"]', (as) => as.length);
  conferir(noMenu > 0, "a área de relatórios oferece 'Pagamentos efetuados'");

  await irPara(n, page, "/relatorios/pagamentos?exercicio=2026");
  const total = async (k: string): Promise<bigint> => centavos(await page.$eval(`[data-total="${k}"]`, (e) => e.textContent ?? "0"));
  const linhas = await page.$$eval('[data-lista="pagamentos-efetuados"] tr[data-pagamento]', (t) => t.length);
  const [pago, retido, liquido] = [await total("pago"), await total("retido"), await total("liquido")];
  conferir(linhas > 0 && retido > 0n && pago - retido === liquido, `2026: ${String(linhas)} pagamentos; pago ${String(pago)} − retido ${String(retido)} = líquido ${String(liquido)} (centavos)`);

  const contas = await page.$$eval('select[name="conta"] option', (os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
  await irPara(n, page, `/relatorios/pagamentos?exercicio=2026&conta=${encodeURIComponent(contas[0] ?? "")}`);
  const daConta = await page.$$eval('[data-lista="pagamentos-efetuados"] tr[data-pagamento] td:nth-child(7)', (tds) => tds.map((t) => t.textContent ?? ""));
  conferir(daConta.length > 0 && daConta.every((c) => c === contas[0]), `conta ${contas[0] ?? "?"}: ${String(daConta.length)} pagamentos, todos dela`);

  await irPara(n, page, "/relatorios/pagamentos?exercicio=2026&desde=2026-07-01&ate=2026-07-31");
  const datas = await page.$$eval('[data-lista="pagamentos-efetuados"] tr[data-pagamento] td:first-child', (tds) => tds.map((t) => t.textContent ?? ""));
  conferir(datas.length > 0 && datas.every((d) => d.endsWith("/07/2026")), `julho: ${String(datas.length)} pagamentos, todos de julho`);

  await irPara(n, page, "/relatorios/pagamentos?exercicio=2026&agrupar=credor");
  const grupos = await page.$$eval("[data-grupo]", (hs) => hs.map((h) => h.textContent ?? ""));
  const somaDosGrupos = grupos.reduce((s, g) => s + centavos((/pago R\$ ([\d.,]+)/.exec(g) ?? ["", "0"])[1] ?? "0"), 0n);
  conferir(grupos.length > 1 && somaDosGrupos === pago, `agrupado por credor: ${String(grupos.length)} blocos, e os subtotais somam o pago total`);

  await irPara(n, page, "/relatorios/pagamentos?exercicio=2026&retencoes=nao");
  const cabecalhos = await page.$$eval('[data-lista="pagamentos-efetuados"] th', (ths) => ths.map((t) => t.textContent ?? ""));
  conferir(!cabecalhos.includes("Retido") && !cabecalhos.includes("Líquido"), "'só o valor pago' tira as colunas de retenção");

  const hrefPdf = await page.evaluate(() => Array.from(document.querySelectorAll("a")).find((a) => (a.getAttribute("href") ?? "").startsWith("/relatorios/pagamentos/pdf"))?.getAttribute("href") ?? null);
  const pdf = hrefPdf === null ? null : await page.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, tipo: r.headers.get("content-type") ?? "", tamanho: (await r.arrayBuffer()).byteLength }; }, `${n.base}${hrefPdf}`);
  conferir(pdf !== null && pdf.status === 200 && pdf.tipo.includes("pdf") && pdf.tamanho > 1000 && (hrefPdf ?? "").includes("retencoes=nao"), `o PDF leva o mesmo recorte (${hrefPdf ?? "sem botão"}): ${JSON.stringify(pdf)}`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos pagamentos efetuados completo.");
