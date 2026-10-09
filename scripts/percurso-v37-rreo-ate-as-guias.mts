import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DO RREO ATÉ AS GUIAS (só leitura): no Anexo 1, o valor "até o bimestre" e o "no bimestre" de uma
 * linha da receita abrem a lista de guias com o recorte dito na tela, e o total da lista é o valor clicado. Também
 * confere que o Anexo 1 tem a exportação das tabelas.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v37-rreo-ate-as-guias.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
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
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  await irPara(n, page, "/relatorios/rreo/anexo1?exercicio=2026&bimestre=5");
  conferir((await page.$("button[data-exportar-tabelas]")) !== null, "o Anexo 1 oferece a exportação das tabelas (CSV)");

  for (const elo of ["guias-ate-o-bimestre", "guias-do-bimestre"]) {
    // A linha mais funda com valor: a última com o elo e valor diferente de zero.
    const alvo = await page.$$eval(`a[data-elo="${elo}"]`, (as) => {
      const comValor = as.map((a) => ({ href: a.getAttribute("href") ?? "", valor: (a.textContent ?? "").trim() })).filter((x) => /[1-9]/.test(x.valor));
      return comValor.length === 0 ? null : comValor[comValor.length - 1];
    });
    if (alvo === null) {
      console.log(`NAO EXECUTADO ${elo}: nenhuma linha com valor no 5º bimestre de 2026`);
      continue;
    }
    await irPara(n, page, alvo.href);
    const corpo = await page.$eval("main", (m) => (m.textContent ?? "").replace(/ /g, " "));
    const aviso = await page.$eval("[data-recorte-da-lista]", (p) => (p.textContent ?? "").trim()).catch(() => "");
    const valor = alvo.valor.replace(/ /g, " ").replace(/^R\$\s*/, "");
    conferir(/código iniciado por|da receita/.test(aviso) && / a /.test(aviso) && corpo.includes(valor), `${elo}: a lista de guias abre com o recorte dito ("${aviso.slice(0, 80)}") e o total ${valor} (${alvo.href})`);
    await irPara(n, page, "/relatorios/rreo/anexo1?exercicio=2026&bimestre=5");
  }
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do RREO até as guias completo.");
