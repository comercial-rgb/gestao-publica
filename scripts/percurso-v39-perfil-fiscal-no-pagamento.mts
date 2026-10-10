import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-009 (AUD-034/039) — DA PRÉVIA DAS RETENÇÕES AO PERFIL FISCAL DO FORNECEDOR, E DE VOLTA, SEM PERDER O QUE SE DIGITOU.
 * Não grava nada (não paga, não registra perfil): só navega.
 *   1. no pagamento, escolhe a primeira liquidação da fila, digita número, valor, data e histórico, liga o cálculo e
 *      pede a prévia;
 *   2. a prévia traz o atalho "Cadastrar/Alterar o perfil fiscal" para a pessoa do fornecedor, com o retorno;
 *   3. na pessoa, o "Voltar ao pagamento" e a âncora do perfil fiscal;
 *   4. de volta, a mesma liquidação escolhida e os campos digitados repostos.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const F = 'form[data-acao="pagar"]';

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, usuario, senha);
  await irPara(n, page, "/despesa/pagamentos");
  // Só digita depois de o formulário hidratar (a chave de comando fica pronta): antes disso o React repõe os campos.
  await page.waitForSelector(`${F} input[name="__chave"][data-chave-de-comando="pronta"]`);
  const liquidacao = await page.$$eval(`${F} select[name="liquidacaoId"] option`, (os) => os.map((o) => o.getAttribute("value") ?? "").find((v) => v !== "") ?? "");
  if (liquidacao === "") throw new Error("Nenhuma liquidação na fila de pagamento desta base.");
  await page.select(`${F} select[name="liquidacaoId"]`, liquidacao);
  await page.type(`${F} input[name="numero"]`, "7777");
  await page.type(`${F} input[data-mascara="valor"]`, "1000");
  await page.$eval(`${F} input[name="data"]`, (e) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(e, "2026-10-09");
    e.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.type(`${F} input[name="historico"]`, "Pagamento do percurso V39");
  const enviado = await page.$eval(F, (f) => { const d = new FormData(f as HTMLFormElement); return { liquidacaoId: String(d.get("liquidacaoId")), valor: String(d.get("valor")), data: String(d.get("data")) }; });
  console.log(`   o formulário envia: ${JSON.stringify(enviado)}`);
  // A caixa e o botão ficam dentro de um bloco que pode estar recolhido: o clique vai pelo DOM.
  await page.$eval(`${F} input[name="retencaoCalculada"]`, (e) => { if (!(e as HTMLInputElement).checked) (e as HTMLInputElement).click(); });
  await page.waitForSelector(`${F} button[data-acao="calcular-retencoes"]`);
  await page.$eval(`${F} button[data-acao="calcular-retencoes"]`, (e) => (e as HTMLButtonElement).click());
  await page.waitForFunction((f) => document.querySelector(`${f} [data-previa-das-retencoes]`) !== null || Array.from(document.querySelectorAll(`${f} [role="alert"]`)).some((e) => (e.textContent ?? "").length > 0), { timeout: 120000 }, F);
  const alerta = await page.$$eval(`${F} [role="alert"]`, (es) => es.map((e) => (e.textContent ?? "").trim()).filter((t) => t !== "").join(" | "));
  if (alerta !== "") console.log(`   aviso na tela: ${alerta.slice(0, 300)}`);
  const atalho = await page.$eval(`${F} [data-previa-das-retencoes] a[data-atalho-de-cadastro]`, (a) => ({ href: a.getAttribute("href") ?? "", texto: a.textContent ?? "" })).catch(() => null);
  conferir(atalho !== null && atalho.href.includes("/cadastros/pessoas/") && atalho.href.includes(encodeURIComponent(`/despesa/pagamentos?liquidacao=${liquidacao}`)), `a prévia traz o atalho "${atalho?.texto ?? ""}" para a pessoa do fornecedor, com o retorno`);
  if (atalho === null) throw new Error("sem o atalho, o percurso não segue");

  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click(`${F} [data-previa-das-retencoes] a[data-atalho-de-cadastro]`)]);
  await page.waitForSelector("#perfil-fiscal");
  const voltar = await page.$eval("#perfil-fiscal a[data-voltar]", (a) => a.getAttribute("href") ?? "").catch(() => "");
  conferir(voltar === `/despesa/pagamentos?liquidacao=${liquidacao}`, `a pessoa mostra "Voltar ao pagamento" (${voltar})`);

  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click("#perfil-fiscal a[data-voltar]")]);
  await page.waitForSelector(`${F} input[name="numero"]`);
  await new Promise((r) => setTimeout(r, 1500));
  // Sem função nomeada dentro do código que roda no navegador (o transpilador injetaria um `__name` que lá não existe).
  const volta = await page.$eval(F, (f) => Object.fromEntries(["liquidacaoId", "numero", "valor", "data", "historico"].map((n) => [n, ((f as HTMLFormElement).elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value ?? ""])));
  const voltaLiquidacao = volta["liquidacaoId"] ?? "";
  conferir(voltaLiquidacao === liquidacao, "de volta, a mesma liquidação escolhida");
  conferir(volta["numero"] === "7777" && volta["data"] === "2026-10-09" && volta["historico"] === "Pagamento do percurso V39", `número, data e histórico repostos (${volta["numero"]}, ${volta["data"]}, ${volta["historico"]})`);
  conferir(/1\.000,00|1000/.test((volta["valor"] ?? "")), `valor reposto (${(volta["valor"] ?? "")})`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do perfil fiscal no pagamento completo.");
