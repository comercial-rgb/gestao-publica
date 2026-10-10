import "dotenv/config";
import { exigirDestinoDoPercurso } from "../destino-do-percurso.js";
import puppeteer from "puppeteer";
import { ROTEIRO } from "./roteiro-da-apresentacao.js";

/**
 * VELOCIDADE DAS TELAS DA APRESENTAÇÃO — somente leitura: entra com o administrador, abre cada tela do
 * roteiro até o evento "load" e imprime mediana, p90, máximo e as seis mais lentas.
 *
 * Uso: `npx tsx scripts/demonstracao/medir-velocidade-das-telas.ts [base]` (padrão http://localhost:3010).
 */
const BASE = process.argv[2] ?? "http://localhost:3010";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
const nav = await puppeteer.launch({ headless: true });
const p = await nav.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
await p.type('input[name="senha"]', SENHA);
await p.click('button[type="submit"]');
await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 });
const tempos: [number, string][] = [];
for (const [nome, rota] of ROTEIRO) {
  const t0 = Date.now();
  await p.goto(`${BASE}${rota}`, { waitUntil: "load", timeout: 180000 });
  tempos.push([Date.now() - t0, nome]);
}
await nav.close();
tempos.sort((a, b) => a[0] - b[0]);
const q = (f: number) => tempos[Math.min(tempos.length - 1, Math.floor(tempos.length * f))]![0];
console.log(`telas ${tempos.length} | mediana ${q(0.5)} ms | p90 ${q(0.9)} ms | máx ${tempos.at(-1)![0]} ms`);
for (const [ms, nome] of tempos.slice(-6).reverse()) console.log(`  ${ms} ms  ${nome}`);
