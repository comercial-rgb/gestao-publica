import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, escolherPelaBusca, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V38 4ª leva — os achados da contadora que eram de encontrar e de não perder o que se digitou, na base fictícia:
 *   1. o Livro Razão com a conta pela BUSCA (código ou nome), não digitada (AUD-067);
 *   2. as ORDENS DE SERVIÇO numa lista própria, no menu, com o link até a ordem (AUD-122);
 *   3. a proposta com os atalhos no topo e a âncora de cada ficha (AUD-093);
 *   4. o empenho que sai pelo atalho "Cadastrar este credor" guarda o RASCUNHO e o repõe na volta com o credor (AUD-015).
 * Só lê, exceto o rascunho na aba do navegador. Nada é gravado no banco.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v38-quarta-leva.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. o razão pela busca da conta ──
  const linha = await prisma.partidaContabil.findFirst({ where: { conta: { analitica: true } }, orderBy: { lancamento: { dataTransacao: "desc" } }, select: { conta: { select: { codigo: true, nome: true } }, lancamento: { select: { dataTransacao: true } } } });
  if (linha === null) {
    console.log("NAO EXECUTADO passo 1: a base não tem lançamento em conta analítica");
  } else {
    const ano = linha.lancamento.dataTransacao.toISOString().slice(0, 4);
    await irPara(n, page, `/relatorios/livros/razao?desde=${ano}-01-01&ate=${ano}-12-31`);
    const campoDigitado = (await page.$('input[aria-label="Código da conta"]')) !== null;
    // Aquecer a busca: no servidor de desenvolvimento, a primeira consulta da página espera a compilação (medido: uma
    // corrida com mais de 20 s na primeira e 228 ms aquecida). A espera longa é só aqui; a escolha usa a régua comum.
    const COMBO = '[data-conta-do-razao] [data-seletor] input[role="combobox"]';
    await page.waitForSelector(COMBO);
    await page.type(COMBO, linha.conta.codigo, { delay: 10 });
    await page.waitForSelector('[data-conta-do-razao] [role="option"]', { timeout: 120000 }).catch(() => undefined);
    const escolhida = await escolherPelaBusca(page, "[data-conta-do-razao]", "conta", linha.conta.codigo, linha.conta.codigo);
    await Promise.all([
      page.waitForFunction((c) => location.search.includes(`conta=${encodeURIComponent(c)}`), { timeout: 120000 }, linha.conta.codigo).catch(() => undefined),
      page.evaluate(() => (Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Aplicar") as HTMLButtonElement | undefined)?.click()),
    ]);
    // ⚠️ innerText, não textContent: o textContent inclui os scripts com os dados da primeira renderização, que ainda
    // trazem o "Informe uma conta" de antes da navegação (medido neste percurso).
    await page.waitForFunction(() => !document.body.innerText.includes("Informe uma conta"), { timeout: 120000 }).catch(() => undefined);
    const texto = await page.evaluate(() => document.body.innerText);
    conferir(
      !campoDigitado && escolhida === linha.conta.codigo && page.url().includes(`conta=${encodeURIComponent(linha.conta.codigo)}`) && !texto.includes("Informe uma conta"),
      `razão: a conta ${linha.conta.codigo} escolhida pela busca (campo digitado: ${String(campoDigitado)}; escolhida: ${escolhida}; "Informe uma conta" na tela: ${String(texto.includes("Informe uma conta"))}) e o livro aberto (${page.url().replace(n.base, "").slice(0, 80)})`
    );
  }

  // ── 2. as ordens de serviço ──
  await irPara(n, page, "/licitacoes/ordens-de-servico");
  const titulo = await page.$eval("h1", (h) => h.textContent ?? "").catch(() => "");
  const linhas = Number(await page.$eval("[data-ordens-de-servico]", (t) => t.getAttribute("data-ordens-de-servico") ?? "-1").catch(() => "0"));
  const vazia = (await page.$("[data-sem-ordens]")) !== null;
  const noBanco = await prisma.ordemDeServicoDoContrato.count();
  // O menu leva o exercício do contexto no endereço (`?exercicio=`): o prefixo basta.
  const noMenu = (await page.$('aside a[href^="/licitacoes/ordens-de-servico"]')) !== null;
  conferir(titulo.includes("Ordens de serviço") && noMenu && (noBanco === 0 ? vazia : linhas === Math.min(noBanco, 300)), `ordens de serviço: título "${titulo.trim()}", no menu: ${String(noMenu)}, vazia: ${String(vazia)}; ${String(noBanco === 0 ? 0 : linhas)} ordem(ns) na tela, ${String(noBanco)} no banco (o administrador alcança todas)`);
  if (linhas > 0) {
    const href = await page.$eval("[data-ordem] a", (a) => a.getAttribute("href") ?? "");
    await irPara(n, page, href);
    conferir(/\/licitacoes\/contratos\/[^/]+\/ordens\/[^/]+$/.test(page.url()) && !(await page.evaluate(() => document.body.textContent ?? "")).includes("404"), `a primeira ordem da lista abre a tela da ordem (${href.slice(0, 60)})`);
  }

  // ── 3. a proposta: atalhos no topo e âncora por ficha ──
  const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { efetivacao: { isNot: null } }, orderBy: { criadoEm: "desc" }, select: { id: true, linhasDeDespesa: { where: { fichaDeOrigemId: { not: null } }, take: 1, select: { fichaDeOrigem: { select: { numero: true } } } } } });
  if (proposta === null) {
    console.log("NAO EXECUTADO passo 3: a base não tem proposta efetivada");
  } else {
    await irPara(n, page, `/planejamento/proposta-orcamentaria/${proposta.id}`);
    const atalhos = await page.$$eval('nav[aria-label="Atalhos da proposta"] a', (as) => as.map((a) => a.getAttribute("href") ?? ""));
    const numero = proposta.linhasDeDespesa[0]?.fichaDeOrigem?.numero;
    const ancora = numero === undefined ? false : (await page.$(`#ficha-${String(numero)}`)) !== null;
    conferir(atalhos.includes("#receitas") && atalhos.includes("#fichas") && ancora, `proposta efetivada: atalhos no topo (${atalhos.length} links) e a âncora #ficha-${String(numero)}`);
  }

  // ── 4. o rascunho do empenho atravessa o atalho de cadastro ──
  await irPara(n, page, "/despesa/empenhos");
  const FORM = 'form[data-acao="empenhar"]';
  await page.waitForSelector(`${FORM} select[name="fichaId"]`, { timeout: 120000 });
  const fichaId = await page.$eval(`${FORM} select[name="fichaId"]`, (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== "") ?? "");
  await page.select(`${FORM} select[name="fichaId"]`, fichaId);
  const VALOR = "1.234,56";
  await page.click(`${FORM} [data-mascara="valor"]`, { count: 3 }).catch(() => undefined);
  await page.type(`${FORM} [data-mascara="valor"]`, VALOR, { delay: 10 });
  const HISTORICO = `Rascunho do percurso V38 ${String(Date.now()).slice(-6)}`;
  await page.click(`${FORM} [name="historico"]`, { count: 3 });
  await page.keyboard.press("Backspace");
  await page.type(`${FORM} [name="historico"]`, HISTORICO, { delay: 5 });
  // Um CPF válido que não está no cadastro: a busca não acha, e aparece "Cadastrar este credor".
  let cpf = "";
  for (const c of ["52998224725", "39053344705", "86288366757", "11144477735", "71428793860", "87748248800"]) {
    if ((await prisma.pessoa.count({ where: { documento: c } })) === 0) { cpf = c; break; }
  }
  const RAIZ_CREDOR = `${FORM} [data-seletor]:has(input[type="hidden"][name="credor"])`;
  await page.type(`${RAIZ_CREDOR} input[role="combobox"]`, cpf, { delay: 10 });
  const atalho = await page.waitForSelector(`${RAIZ_CREDOR} a[data-atalho-de-cadastro]`, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!atalho || cpf === "") {
    conferir(false, `empenho: o atalho "Cadastrar este credor" não apareceu para o CPF ${cpf === "" ? "(nenhum livre)" : cpf}`);
  } else {
    await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 120000 }), page.click(`${RAIZ_CREDOR} a[data-atalho-de-cadastro]`)]);
    const guardado = await page.evaluate(() => sessionStorage.getItem("rascunho-do-empenho"));
    const campos = (guardado === null ? {} : (JSON.parse(guardado) as { campos?: Record<string, string> }).campos ?? {}) as Record<string, string>;
    conferir(page.url().includes("/cadastros/pessoas/nova") && campos["fichaId"] === fichaId && campos["valor"] === "1234.56" && campos["historico"] === HISTORICO && campos["credor"] === undefined, `o clique em "Cadastrar este credor" guardou o rascunho na aba (ficha, valor 1234.56, histórico; sem o credor) e abriu o cadastro`);

    // A volta com o credor (o retorno do cadastro), aqui com uma pessoa que já existe — nada é cadastrado.
    const existente = await prisma.pessoa.findFirst({ where: { tipo: "JURIDICA" }, select: { documento: true } });
    await irPara(n, page, `/despesa/empenhos?credor=${existente?.documento ?? ""}`);
    await page.waitForFunction((sel, h) => (document.querySelector(sel) as HTMLTextAreaElement | HTMLInputElement | null)?.value === h, { timeout: 120000 }, `${FORM} [name="historico"]`, HISTORICO).catch(() => undefined);
    const ficha2 = await page.$eval(`${FORM} select[name="fichaId"]`, (s) => (s as HTMLSelectElement).value).catch(() => "");
    const hist2 = await page.$eval(`${FORM} [name="historico"]`, (s) => (s as HTMLTextAreaElement).value).catch(() => "");
    const valor2 = await page.$eval(`${FORM} input[type="hidden"][name="valor"]`, (s) => (s as HTMLInputElement).value).catch(() => "");
    const credor2 = await page.$eval(`${RAIZ_CREDOR} input[type="hidden"][name="credor"]`, (s) => (s as HTMLInputElement).value).catch(() => "");
    const sobrou = await page.evaluate(() => sessionStorage.getItem("rascunho-do-empenho"));
    conferir(ficha2 === fichaId && hist2 === HISTORICO && valor2 === "1234.56" && sobrou === null, `na volta com o credor, o empenho repôs a ficha (${String(ficha2 === fichaId)}), o valor (${valor2}) e o histórico (${String(hist2 === HISTORICO)}: "${hist2.slice(0, 40)}"); credor ${credor2 === "" ? "vazio" : "escolhido"}; rascunho na aba: ${String(sobrou !== null)}`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da 4ª leva completo.");
