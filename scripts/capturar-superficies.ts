import puppeteer, { type Page } from "puppeteer";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

/**
 * CAPTURAS LOCAIS DAS SUPERFÍCIES — antes/depois de uma rodada de identidade (V6 P0).
 *
 * Uso: `npx tsx scripts/capturar-superficies.ts <rotulo> [base] [usuario] [senha]`
 * Grava em `.registro-de-execucao/v6-capturas/<rotulo>/` (diretório ignorado). O banco é o dos
 * percursos (sintético) — nenhuma captura sai de dado real. Três larguras de referência: 360,
 * 768 e 1366 px (V6 P0.3). Não é teste: não afirma nada, só registra o que a tela mostrou.
 */
const ROTULO = process.argv[2] ?? "sem-rotulo";
const BASE = process.argv[3] ?? "http://localhost:3010";
const USUARIO = process.argv[4] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[5] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const DIR = join(".registro-de-execucao", "v6-capturas", ROTULO);
const LARGURAS = [360, 768, 1366] as const;
const ROTAS_AUTENTICADAS = ["/", "/licitacoes/ordens-de-compra", "/administracao/perfis", "/planejamento/ppa", "/despesa/empenhos"];
const ROTAS_PUBLICAS = ["/login", "/transparencia/demonstrativos", "/consulta"];

function nomeDoArquivo(rota: string, largura: number): string {
  const base = rota === "/" ? "home" : rota.replace(/^\//, "").replace(/[^a-z0-9]+/gi, "-");
  return `${base}@${largura}.png`;
}

async function entrar(page: Page): Promise<void> {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="identificador"]', { timeout: 60000 });
  await page.type('input[name="identificador"]', USUARIO);
  await page.type('input[name="senha"]', SENHA);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    page.evaluate(() => (document.querySelector("form") as HTMLFormElement).requestSubmit()),
  ]);
}

async function capturar(page: Page, rota: string): Promise<void> {
  for (const largura of LARGURAS) {
    await page.setViewport({ width: largura, height: largura < 700 ? 800 : 900 });
    await page.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 60000 });
    await page.screenshot({ path: join(DIR, nomeDoArquivo(rota, largura)), fullPage: false });
    console.log(`[captura] ${rota} @ ${largura}`);
  }
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const rota of ROTAS_PUBLICAS) await capturar(page, rota);
    if (SENHA !== "") {
      await entrar(page);
      for (const rota of ROTAS_AUTENTICADAS) await capturar(page, rota);
    } else {
      console.log("[aviso] sem senha (SEED_ADMIN_SENHA) — só as rotas públicas foram capturadas");
    }
  } finally {
    await browser.close();
  }
  console.log(`capturas em ${DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
