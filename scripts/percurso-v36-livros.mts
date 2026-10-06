import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS LIVROS EM PDF (só leitura): o botão do Livro Diário e o do Razão de uma conta levam ao
 * PDF com os termos; sem conta, o Razão não oferece o botão, e a rota sem conta responde 400 com o motivo.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-livros.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, usuario, senha);
  const baixar = (u: string) =>
    page.evaluate(async (url) => {
      const r = await fetch(url);
      return { status: r.status, tipo: r.headers.get("content-type") ?? "", tamanho: (await r.arrayBuffer()).byteLength };
    }, u.startsWith("http") ? u : `${n.base}${u}`);
  const botao = async (): Promise<string | null> =>
    page.evaluate(() => Array.from(document.querySelectorAll("a")).find((a) => /\/pdf\?/.test(a.getAttribute("href") ?? ""))?.getAttribute("href") ?? null);

  await irPara(n, page, "/relatorios/livros/diario?desde=2026-07-01&ate=2026-07-31");
  const hDiario = await botao();
  conferir(hDiario !== null && hDiario.includes("desde=2026-07-01") && hDiario.includes("ate=2026-07-31"), `o Diário oferece o PDF do mesmo período (${hDiario ?? "sem botão"})`);
  const d = hDiario === null ? null : await baixar(hDiario);
  conferir(d !== null && d.status === 200 && d.tipo.includes("pdf") && d.tamanho > 1000, `o Livro Diário em PDF (${JSON.stringify(d)})`);

  await irPara(n, page, "/relatorios/livros/razao?desde=2026-01-01&ate=2026-12-31");
  conferir((await botao()) === null, "sem conta, o Razão não oferece o PDF");
  await irPara(n, page, "/relatorios/livros/razao?desde=2026-01-01&ate=2026-12-31&conta=1.1.1.1.1.19.00");
  const hRazao = await botao();
  const r = hRazao === null ? null : await baixar(hRazao);
  conferir(r !== null && r.status === 200 && r.tipo.includes("pdf") && r.tamanho > 1000, `o Razão da conta de bancos em PDF (${JSON.stringify(r)})`);
  const semConta = await baixar("/relatorios/livros/razao/pdf?desde=2026-01-01&ate=2026-12-31");
  conferir(semConta.status === 400, `a rota do Razão sem conta responde 400 (${String(semConta.status)})`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos livros completo.");
