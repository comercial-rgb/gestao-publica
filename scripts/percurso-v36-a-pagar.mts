import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS FILTROS DO A PAGAR (fonte e vencimento), só leitura.
 *
 * Na base fictícia de Esperança há liquidações a pagar sem ordem de pagamento (FIC-L1 a FIC-L3, fonte da ficha
 * 339039). Afirmações:
 *   1. sem filtro, o total liquidado a pagar não é zero e a fonte aparece entre as opções;
 *   2. filtrando pela fonte das liquidações, o total é o mesmo (todas são dela); por uma fonte sem obrigação, zero;
 *   3. "vence até" esvazia o recorte — nenhuma tem ordem, logo nenhuma tem vencimento — e a tela DIZ por quê;
 *   4. o PDF responde com os mesmos filtros.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-a-pagar.mts
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
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  await irPara(n, page, "/despesa/a-pagar?exercicio=2026");
  const total = async (): Promise<string> =>
    page.$eval('[data-total="liquidado-a-pagar"]', (el) => (el.textContent ?? "").trim());
  const semFiltro = await total();
  const fontes = await page.$$eval('select[name="fonte"] option', (os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
  conferir(!/^R\$\s*0,00$/.test(semFiltro) && fontes.length > 0, `sem filtro: liquidado a pagar ${semFiltro}; fontes oferecidas: ${fontes.join(", ")}`);

  const fonte = fontes[0] ?? "";
  await irPara(n, page, `/despesa/a-pagar?exercicio=2026&fonte=${encodeURIComponent(fonte)}`);
  const daFonte = await total();
  const opcoesComFiltro = await page.$$eval('select[name="fonte"] option', (os) => os.length);
  conferir(fontes.length > 1 ? daFonte !== "" : daFonte === semFiltro, `fonte ${fonte}: ${daFonte} (sem filtro ${semFiltro})`);
  conferir(opcoesComFiltro === fontes.length + 1, "com a fonte escolhida, o select continua oferecendo todas as fontes");

  await irPara(n, page, "/despesa/a-pagar?exercicio=2026&fonte=FONTE-SEM-OBRIGACAO");
  conferir(/0,00/.test(await total()), "fonte sem obrigação: total zero");

  const venc = await irPara(n, page, "/despesa/a-pagar?exercicio=2026&venceAte=2026-12-31");
  conferir(/0,00/.test(await total()), "vence até 31/12: nenhuma liquidação tem ordem de pagamento, o recorte fica vazio");
  conferir(/sem ordem não tem vencimento/i.test(venc), "a tela diz que obrigação sem ordem fica fora do recorte de vencimento");

  const pdf = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", tamanho: (await r.arrayBuffer()).byteLength };
  }, `${n.base}/despesa/a-pagar/pdf?exercicio=2026&fonte=${encodeURIComponent(fonte)}&venceAte=2026-12-31`);
  conferir(pdf.status === 200 && pdf.tipo.includes("pdf") && pdf.tamanho > 1000, `PDF com os filtros: ${String(pdf.status)} ${pdf.tipo} ${String(pdf.tamanho)} bytes`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos filtros do a pagar completo.");
