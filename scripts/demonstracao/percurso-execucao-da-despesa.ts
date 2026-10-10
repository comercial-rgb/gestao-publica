import "dotenv/config";
import { exigirDestinoDoPercurso } from "../destino-do-percurso.js";
import { mkdirSync } from "node:fs";
import puppeteer, { type Page } from "puppeteer";

/**
 * PERCURSO DE NAVEGADOR — a emissão do empenho da V22, de ponta a ponta, na aplicação servida.
 *
 * Uso: `npx tsx scripts/demonstracao/percurso-execucao-da-despesa.ts [base] [pasta-das-capturas]`
 * (padrão http://localhost:3011). Entra com o administrador (`SEED_ADMIN_SENHA`), e GRAVA: emite
 * um empenho de verdade a partir de uma ordem de compra. ⚠️ Nunca contra a 3010 (o banco da
 * apresentação) — ver `docs/lotes/V21-continuacao-em-maquina-nova.md`.
 *
 * Cada passo afirma o EFEITO na tela (o texto que aparece, o valor que o campo carrega, a linha que
 * entra na lista), não só que a página abriu.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
// V39-R2 (R2-003): o destino e a natureza da base (declarada no banco) conferidos ANTES de qualquer credencial ou escrita.
await exigirDestinoDoPercurso(BASE);
const PASTA = process.argv[3] ?? "capturas-v22";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

mkdirSync(PASTA, { recursive: true });
let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  if (cond) console.log(`  ok   ${oque}`);
  else {
    console.log(`  FALHA ${oque}`);
    falhas.push(oque);
  }
}
const foto = (p: Page, nome: string): Promise<unknown> => p.screenshot({ path: `${PASTA}/${nome}.png`, fullPage: true });

/** Digita num combobox pelo rótulo, espera a opção que contém `trecho` e escolhe. */
async function escolherNoSeletor(p: Page, rotulo: string, busca: string, trecho: string): Promise<boolean> {
  const campo = await p.waitForSelector(`::-p-xpath(//label[normalize-space()="${rotulo}"]/following-sibling::input[@role="combobox"])`);
  if (campo === null) return false;
  await campo.click();
  await p.keyboard.down("Control");
  await p.keyboard.press("KeyA");
  await p.keyboard.up("Control");
  await p.keyboard.press("Backspace");
  await campo.type(busca, { delay: 30 });
  try {
    const op = await p.waitForSelector(`::-p-xpath(//li[@role="option"][contains(., "${trecho}")])`, { timeout: 15000 });
    await op?.click();
    return true;
  } catch {
    return false;
  }
}

/** Clica no gatilho até a janela abrir — antes da hidratação o botão existe e ainda não responde. */
async function abrirJanela(p: Page, seletor: string): Promise<boolean> {
  for (let i = 0; i < 10; i++) {
    const b = await p.$(seletor);
    await b?.click();
    if ((await p.waitForSelector("dialog[open]", { timeout: 1500 }).catch(() => null)) !== null) return true;
  }
  return false;
}

async function main(): Promise<void> {
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    await percorrer(navegador);
  } finally {
    await navegador.close();
  }
}

async function percorrer(navegador: Awaited<ReturnType<typeof puppeteer.launch>>): Promise<void> {
  const p = await navegador.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  console.log("1. entrada");
  await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
  afirmar((await p.$('img[src="/marca/engine-horizontal-fundo-escuro.svg"]')) !== null, "a entrada assina com a marca Engine");
  await foto(p, "01-entrada");
  await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
  await p.type('input[name="senha"]', SENHA);
  await p.click('button[type="submit"]');
  await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
  afirmar(!p.url().includes("/login"), `a sessão abriu (${p.url()})`);
  if (p.url().includes("/login")) throw new Error("Sem sessão, o resto do percurso afirmaria sobre a página de entrada.");

  console.log("2. empenhos — a ficha com o disponível em reais");
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 180000 });
  const opcoesDaFicha = await p.$$eval('select[name="fichaId"] option', (os) => os.map((o) => o.textContent ?? ""));
  // ⚠️ N > 0 ANTES do "toda": sem fichas, o "every" passa por vacuidade — já passou uma vez, sobre a página errada.
  afirmar(opcoesDaFicha.length > 1, `o formulário oferece fichas (${opcoesDaFicha.length - 1})`);
  afirmar(opcoesDaFicha.length > 1 && opcoesDaFicha.slice(1).every((t) => /disponível R\$\s*[\d.]+,\d{2}/.test(t)), `toda ficha mostra "disponível R$ 0.000,00" (${opcoesDaFicha.length - 1} fichas)`);
  afirmar(!opcoesDaFicha.some((t) => /disponível \d+\.\d{2}\b/.test(t)), "nenhuma ficha mostra o valor cru (ex.: 10000.00)");
  const barra = await p.$eval('aside[data-superficie="grafite"]', (a) => getComputedStyle(a).backgroundColor).catch(() => "");
  afirmar(barra === "rgb(26, 26, 26)", `a barra lateral é grafite (${barra})`);

  console.log("3. a ordem de compra preenche o formulário");
  // ⚠️ A ORDEM NÃO É FIXA: cada corrida empenha uma, e o catálogo só oferece ordem com saldo a
  // empenhar. O percurso escolhe a primeira oferecida e afirma contra os dados DELA.
  const campoOrdem = await p.waitForSelector(`::-p-xpath(//label[normalize-space()="Ordem de compra"]/following-sibling::input[@role="combobox"])`);
  await campoOrdem?.type("OC", { delay: 30 });
  const primeira = await p.waitForSelector('::-p-xpath(//li[@role="option"][starts-with(normalize-space(.), "OC ")])', { timeout: 15000 }).catch(() => null);
  const rotuloDaOrdem = ((await primeira?.evaluate((li) => li.querySelector("span")?.textContent ?? "")) ?? "").trim();
  afirmar(primeira !== null, `digitar "OC" filtra e oferece ordens com saldo (${rotuloDaOrdem})`);
  if (primeira === null) throw new Error("Nenhuma ordem com saldo a empenhar — rode de novo o semeador ou anule um empenho de ordem.");
  await primeira.click();
  const numeroDaOrdem = /^(OC \S+)/.exec(rotuloDaOrdem)?.[1] ?? "";
  // ⚠️ sem o número, "o histórico cita a ordem" e "a ordem voltou" passariam por vacuidade — já passaram
  if (numeroDaOrdem === "") throw new Error(`Não li o número da ordem em "${rotuloDaOrdem}".`);
  const nomeDoCredor = rotuloDaOrdem.split(" — ").slice(1).join(" — ");
  await p.waitForFunction((n) => (document.querySelector('textarea[name="historico"]') as HTMLTextAreaElement | null)?.value.includes(n) === true, { timeout: 15000 }, numeroDaOrdem).catch(() => undefined);
  const historico = await p.$eval('textarea[name="historico"]', (t) => (t as HTMLTextAreaElement).value);
  afirmar(historico.startsWith(`Empenho referente à Ordem de Compra ${numeroDaOrdem} - `) && !historico.includes("..") && !/[—–]/.test(historico), `o histórico se autopreencheu, sem travessão (o MANAD só aceita ISO 8859-1): "${historico}"`);
  const fichaEscolhida = await p.$eval('select[name="fichaId"]', (s) => (s as HTMLSelectElement).value);
  afirmar(fichaEscolhida !== "", "a ficha da ordem foi selecionada");
  await p.waitForFunction(() => /^(\d{11}|\d{14})$/.test((document.querySelector('input[type="hidden"][name="credor"]') as HTMLInputElement | null)?.value ?? ""), { timeout: 15000 }).catch(() => undefined);
  const credor = await p.$eval('input[type="hidden"][name="credor"]', (i) => (i as HTMLInputElement).value);
  const textoDoCredor = await p.$eval(`::-p-xpath(//label[normalize-space()="Credor"]/following-sibling::input[@role="combobox"])`, (i) => (i as HTMLInputElement).value);
  afirmar(/^(\d{11}|\d{14})$/.test(credor) &&textoDoCredor.includes(nomeDoCredor), `o credor da ordem veio conferido do cadastro (${textoDoCredor})`);
  const valor = await p.$eval('input[type="hidden"][name="valor"]', (i) => (i as HTMLInputElement).value);
  afirmar(/^\d+\.\d{2}$/.test(valor),`o valor a empenhar da ordem veio para o campo (${valor})`);
  const tipoDoEmpenho = await p.$eval('select[name="tipo"]', (s) => (s as HTMLSelectElement).value);
  afirmar(tipoDoEmpenho !== "", `o tipo do empenho acompanhou a ordem (${tipoDoEmpenho})`);
  const sugestoes = await p.$$eval("[data-sugestoes-de-historico] button", (b) => b.length);
  afirmar(sugestoes >= 1, `há textos sugeridos para o histórico (${sugestoes})`);
  await foto(p, "02-empenho-preenchido-pela-ordem");

  console.log("4. o credor se busca por CPF/CNPJ");
  afirmar(await escolherNoSeletor(p, "Credor", "4172", "Papelaria Central"), "digitar 4172 lista a Papelaria Central Ltda");
  await foto(p, "03-credor-por-documento");
  afirmar(await escolherNoSeletor(p, "Credor", credor.slice(0, 5), nomeDoCredor), `e volta ao credor da ordem pelos 5 primeiros dígitos (${credor.slice(0, 5)})`);

  console.log("4b. a nota de empenho se vincula à campanha publicitária");
  afirmar(await escolherNoSeletor(p, "Campanha publicitária", "vacina", "CP-001/2026"), 'digitar "vacina" lista a campanha CP-001/2026 e ela é escolhida');

  console.log("5. emitir e ver na lista");
  const numero = `9${String(Date.now()).slice(-6)}`; // numérico de 7 dígitos: é o que o SAGRES aceita
  await p.type('input[name="numero"]', numero);
  await p.$eval('input[name="data"]', (i) => {
    const el = i as HTMLInputElement;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    set?.call(el, "2026-09-28");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await p.select('select[name="categoria"]', "PRESTACAO_SERVICOS");
  await p.click('form[data-acao="empenhar"] button[type="submit"]');
  const resposta = await p
    .waitForSelector("[data-resultado-do-envio]", { timeout: 60000 })
    .then((el) => el?.evaluate((e) => `${e.getAttribute("data-resultado-do-envio") ?? ""}: ${e.textContent ?? ""}`));
  afirmar(resposta?.startsWith("sucesso:") === true, `a emissão foi aceita (${resposta ?? "sem resposta"})`);
  const valorEmReais = /R\$ ([\d.]+,\d{2})/.exec(resposta ?? "")?.[1] ?? "?";
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 120000 });
  const naLista = await p.$(`::-p-xpath(//button[@aria-label="Abrir o empenho ${numero}"])`);
  afirmar(naLista !== null, `o empenho ${numero} está na lista depois de recarregar`);

  console.log("6. clicar no número abre o modal");
  await abrirJanela(p, `::-p-xpath(//button[@aria-label="Abrir o empenho ${numero}"])`);
  const modal = await p.$("dialog[open]");
  const textoDoModal = (await modal?.evaluate((d) => d.textContent ?? "")) ?? "";
  afirmar(textoDoModal.includes(nomeDoCredor) && textoDoModal.includes(valorEmReais), `o modal mostra o credor pelo nome e o valor em reais (${valorEmReais})`);
  afirmar(textoDoModal.includes("Campanha publicitária") && textoDoModal.includes("CP-001/2026"), "o modal mostra a campanha publicitária vinculada (CP-001/2026)");
  afirmar(textoDoModal.includes("Nota de Empenho (PDF)") && textoDoModal.includes("Imprimir") && textoDoModal.includes("dossiê"), "o modal oferece NE em PDF, impressão e o dossiê");
  await foto(p, "04-modal-do-empenho");
  await p.keyboard.press("Escape");

  console.log("7. exportar Excel");
  const href = await p.$eval('a[download][href*="/despesa/empenhos/xlsx"]', (a) => (a as HTMLAnchorElement).href);
  const xlsx = await p.evaluate(async (u) => {
    const r = await fetch(u);
    const b = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, tipo: r.headers.get("content-type") ?? "", pk: b[0] === 0x50 && b[1] === 0x4b, tamanho: b.length };
  }, href);
  afirmar(xlsx.status === 200 && xlsx.tipo.includes("spreadsheetml") && xlsx.pk, `o Excel sai como .xlsx (${xlsx.status}, ${xlsx.tamanho} bytes)`);
  await foto(p, "05-lista-de-empenhos");

  console.log("8. o botão principal do modal é legível");
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 120000 });
  afirmar(await abrirJanela(p, `::-p-xpath(//button[@aria-label="Abrir o empenho ${numero}"])`), "o modal abre de novo depois de recarregar");
  const cores = await p.$eval("dialog[open] a[href^='/despesa/empenhos/']", (a) => {
    const c = getComputedStyle(a);
    return { cor: c.color, fundo: c.backgroundColor, texto: a.textContent ?? "" };
  });
  afirmar(cores.texto.includes("dossiê") && cores.cor !== cores.fundo, `"Abrir o dossiê completo" com texto ${cores.cor} sobre ${cores.fundo}`);
  await p.keyboard.press("Escape");

  console.log("9. liquidação: modal e comprovante do banco");
  await p.goto(`${BASE}/despesa/liquidacoes`, { waitUntil: "networkidle0", timeout: 180000 });
  const botoes = await p.$$('button[aria-label^="Abrir a liquidação"]');
  afirmar(botoes.length > 0, `a lista de liquidações abre por modal (${botoes.length} liquidações)`);
  const rotuloDaLiq = await botoes[0]?.evaluate((b) => b.getAttribute("aria-label") ?? "");
  await abrirJanela(p, `button[aria-label="${rotuloDaLiq ?? ""}"]`);
  const dlg = await p.$("dialog[open]");
  const textoLiq = (await dlg?.evaluate((d) => d.textContent ?? "")) ?? "";
  afirmar(textoLiq.includes("Nota fiscal") && textoLiq.includes("Comprovantes") && textoLiq.includes("Responsável pelo atesto"), "o modal da liquidação mostra nota fiscal, atesto e comprovantes");
  // um PDF mínimo, gerado aqui — o conteúdo não importa, a verificação (SHA-256) sim
  const pdf = Buffer.from(["%PDF-1.4", "1 0 obj<<>>endobj", "trailer<<>>", "%%EOF", `comprovante ${String(Date.now())}`].join(String.fromCharCode(10)));
  const caminho = `${PASTA}/comprovante-banco.pdf`;
  (await import("node:fs")).writeFileSync(caminho, pdf);
  const arquivo = await p.$('dialog[open] input[type="file"][name="arquivo"]');
  await arquivo?.uploadFile(caminho);
  await p.click('dialog[open] form[data-acao="anexar"] button[type="submit"]');
  const okAnexo = await p
    .waitForFunction(() => (document.querySelector("dialog[open] form[data-acao='anexar']")?.textContent ?? "").includes("anexado"), { timeout: 60000 })
    .then(() => true)
    .catch(() => false);
  afirmar(okAnexo, "o comprovante foi anexado (mensagem com a verificação)");
  await foto(p, "06-modal-da-liquidacao-com-comprovante");
  await p.goto(`${BASE}/despesa/liquidacoes`, { waitUntil: "networkidle0", timeout: 120000 });
  await abrirJanela(p, `button[aria-label="${rotuloDaLiq ?? ""}"]`);
  // o ÚLTIMO anexo é o desta corrida (a lista é por ordem de envio); o primeiro pode ser de outra
  const hrefAnexo = await p
    .$$eval("dialog[open] [data-comprovantes] a[data-anexo]", (as) => (as.at(-1) as HTMLAnchorElement | undefined)?.href ?? "")
    .catch(() => "");
  afirmar(hrefAnexo !== "", "depois de recarregar, o comprovante está na liquidação");
  const baixado = await p.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, texto: new TextDecoder().decode(await r.arrayBuffer()) };
  }, hrefAnexo);
  afirmar(baixado.status === 200 && baixado.texto === pdf.toString("latin1"), `o comprovante baixa íntegro (${baixado.status})`);
  const excelLiq = await p.$eval('a[download][href*="/despesa/liquidacoes/xlsx"]', (a) => (a as HTMLAnchorElement).href);
  const xl = await p.evaluate(async (u) => (await fetch(u)).status, excelLiq);
  afirmar(xl === 200, "a lista de liquidações exporta Excel");

  console.log("10. negação: quem não lê a despesa não baixa o comprovante");
  const outro = await navegador.createBrowserContext();
  const q = await outro.newPage();
  await q.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
  await q.type('input[name="identificador"]', "almoxarifado@percursos.local");
  await q.type('input[name="senha"]', process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026");
  await q.click('button[type="submit"]');
  await q.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
  afirmar(!q.url().includes("/login"), "o almoxarife entrou");
  await q.goto(`${BASE}/despesa/liquidacoes`, { waitUntil: "networkidle0", timeout: 120000 });
  const recusaDaTela = await q.evaluate(() => document.body.textContent ?? "");
  // ⚠️ o MOTIVO: a tela diz que a despesa não está no acesso dele — não só "não abriu"
  afirmar(/não está no seu acesso|não tem acesso|permissão/i.test(recusaDaTela) && !recusaDaTela.includes("Comprovantes"), "a lista de liquidações recusa o almoxarife por falta de acesso à despesa");
  const negado = await q.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, texto: new TextDecoder().decode(await r.arrayBuffer()) };
  }, hrefAnexo);
  afirmar(negado.status === 404 && !negado.texto.includes("%PDF"), `o download do comprovante responde ${negado.status} sem o conteúdo`);
  await outro.close();

  console.log("11. anular o empenho do percurso (estorno por registro novo) — e a ordem volta a ser oferecida");
  // ⚠️ O PERCURSO DEVOLVE O QUE CONSUMIU. Sem isto, cada corrida esgotaria uma ordem ordinária, e a
  // apresentação ficaria sem ordem com saldo. O estorno é o ato do domínio (append-only), pela tela.
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 120000 });
  const linha = `//tr[.//button[@aria-label="Abrir o empenho ${numero}"]]`;
  for (let i = 0; i < 10; i++) {
    await (await p.$(`::-p-xpath(${linha}//summary)`))?.click();
    if ((await p.$(`::-p-xpath(${linha}//details[@open])`)) !== null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const formDaAnulacao = `::-p-xpath(${linha}//details[@open]//form)`;
  await (await p.$(`${formDaAnulacao.slice(0, -1)}//input[@name="numero"])`))?.type(`8${String(Date.now()).slice(-6)}`);
  await (await p.$(`${formDaAnulacao.slice(0, -1)}//input[@name="motivo"])`))?.type("estorno do empenho emitido pelo percurso de teste");
  await (await p.$(`${formDaAnulacao.slice(0, -1)}//input[@name="data"])`))?.evaluate((i) => {
    const el = i as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, "2026-09-28");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await (await p.$(`${formDaAnulacao.slice(0, -1)}//button[@type="submit"])`))?.click();
  await new Promise((r) => setTimeout(r, 3000));
  await p.goto(`${BASE}/despesa/empenhos`, { waitUntil: "networkidle0", timeout: 120000 });
  const situacao = await p.$eval(`::-p-xpath(${linha})`, (tr) => tr.textContent ?? "").catch(() => "");
  afirmar(situacao.includes("Anulado"), `o empenho ${numero} aparece como Anulado — o original continua na lista`);
  const devolvida = await p.evaluate(async (n) => {
    const r = await fetch(`/opcoes/ordens-para-empenho?q=${encodeURIComponent(n)}&pagina=1`);
    const c = (await r.json()) as { opcoes?: { rotulo: string }[] };
    return (c.opcoes ?? []).some((o) => o.rotulo.startsWith(n));
  }, numeroDaOrdem);
  afirmar(devolvida, `a ${numeroDaOrdem} voltou a ser oferecida para empenho`);

  console.log(`\n${passos - falhas.length}/${passos} afirmações`);
  if (falhas.length > 0) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
