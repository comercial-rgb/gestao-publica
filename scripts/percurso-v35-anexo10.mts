import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V35 — PERCURSO DO RREO ANEXO 10 pela tela: o 5º bimestre não mostra o anexo; no 6º, a projeção é registrada pelo
 * formulário (tabela colada, formato brasileiro), e a recarga mostra a tabela com o saldo acumulado conferido à mão:
 * saldo anterior 5.000,00 + 75 anos × (1.000,00 − 800,00) = 20.000,00 em 2099.
 *
 * Uso: BASE=http://localhost:3011 PERCURSO_USUARIO=... PERCURSO_SENHA=... npx tsx scripts/percurso-v35-anexo10.mts
 * Grava no banco servido: só em base de demonstração ou ensaio.
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

  const quinto = await irPara(n, page, "/relatorios/rreo/anexo10?exercicio=2026&bimestre=5");
  conferir(/anexo do último bimestre/i.test(quinto), "5º bimestre: o anexo não aparece, e a tela diz por quê");

  const sexto = await irPara(n, page, "/relatorios/rreo/anexo10?exercicio=2026&bimestre=6");
  const jaTinha = /fundo em capitalização \(plano previdenciário\)\s/i.test(sexto) && /20\.000,00/.test(sexto);
  if (!jaTinha) {
    const linhas = Array.from({ length: 75 }, (_, i) => `${String(2025 + i)};1.000,00;800,00`).join("\n");
    await page.select('form[data-acao="registrar-projecao-atuarial"] select[name="plano"]', "CAPITALIZACAO");
    await page.$eval('form[data-acao="registrar-projecao-atuarial"] input[name="dataDaAvaliacao"]', (el) => {
      (el as HTMLInputElement).value = "2025-03-31";
    });
    await page.type('form[data-acao="registrar-projecao-atuarial"] input[name="saldoFinanceiroAnterior"]', "5.000,00");
    await page.type('form[data-acao="registrar-projecao-atuarial"] input[name="documento"]', "Avaliação atuarial de demonstração, data-base 31/12/2024");
    await page.$eval('form[data-acao="registrar-projecao-atuarial"] textarea[name="tabela"]', (el, v) => {
      (el as HTMLTextAreaElement).value = v;
    }, linhas);
    await page.click('form[data-acao="registrar-projecao-atuarial"] button[type="submit"]');
    await page.waitForSelector('[data-resultado-da-acao="registrar-projecao-atuarial"]');
    const r = await page.$eval('[data-resultado-da-acao="registrar-projecao-atuarial"]', (el) => el.textContent ?? "");
    conferir(/projeção registrada: 75 anos|projeção substituída/i.test(r), `registro pela tela: "${r}"`);
  }
  const recarga = await irPara(n, page, "/relatorios/rreo/anexo10?exercicio=2026&bimestre=6");
  conferir(/fundo em capitalização \(plano previdenciário\)/i.test(recarga), "recarga: a tabela da capitalização aparece");
  conferir(/5\.200,00/.test(recarga) && /20\.000,00/.test(recarga), "recarga: saldo de 2025 = 5.200,00 e de 2099 = 20.000,00 (à mão)");
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do Anexo 10 completo.");
