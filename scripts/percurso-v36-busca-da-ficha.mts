import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA BUSCA DA DOTAÇÃO NO EMPENHO (só leitura; nada é enviado).
 * Na base fictícia (LOA real de Esperança, centenas de fichas): digitar a natureza 339014 reduz a lista às fichas
 * de diárias; acrescentar um termo restringe mais; a ficha escolhida não some da lista quando a busca a exclui.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v36-busca-da-ficha.mts
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
  await irPara(n, page, "/despesa/empenhos?exercicio=2026");
  const opcoes = (): Promise<string[]> =>
    page.$$eval('select[name="fichaId"] option', (os) => os.map((o) => (o as HTMLOptionElement).textContent ?? "").filter((t) => !/escolha/i.test(t)));
  const total = (await opcoes()).length;
  const digitar = async (t: string): Promise<void> => {
    await page.click("[data-busca-da-ficha]", { count: 3 });
    await page.keyboard.press("Backspace");
    await page.type("[data-busca-da-ficha]", t);
  };

  await digitar("339014");
  const diarias = await opcoes();
  conferir(total > 20 && diarias.length > 0 && diarias.length < total && diarias.every((t) => t.includes("339014")), `"339014": ${String(diarias.length)} de ${String(total)} fichas, todas de diárias`);
  const contador = await page.$eval("[data-fichas-encontradas]", (e) => e.textContent ?? "");
  conferir(contador.includes(`${String(diarias.length)} de ${String(total)}`), `a tela diz quantas casaram (${contador})`);

  await digitar("339014 fonte 500");
  const mais = await opcoes();
  // Os termos valem em QUALQUER parte da ficha (inclusive classificação e unidade, que a opção não mostra):
  // afirma-se que o segundo termo restringe e que o primeiro continua valendo.
  conferir(mais.length > 0 && mais.length < diarias.length && mais.every((t) => t.includes("339014")), `"339014 fonte 500": ${String(mais.length)} de ${String(diarias.length)} — o segundo termo restringe`);

  const valor = await page.$eval('select[name="fichaId"] option:not([disabled])', (o) => (o as HTMLOptionElement).value);
  await page.select('select[name="fichaId"]', valor);
  await digitar("termo-que-nao-existe");
  const restantes = await page.$$eval('select[name="fichaId"] option:not([disabled])', (os) => os.map((o) => (o as HTMLOptionElement).value));
  const escolhida = await page.$eval('select[name="fichaId"]', (s) => (s as HTMLSelectElement).value);
  conferir(restantes.length === 1 && restantes[0] === valor && escolhida === valor, "busca sem resultado: a ficha escolhida continua escolhida e visível");
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da busca da dotação completo.");
