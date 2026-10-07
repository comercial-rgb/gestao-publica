import "dotenv/config";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS PARCERIAS PÚBLICO-PRIVADAS (TR 5.10.1.87-89):
 *   cadastro pela lista (tipo, empresa, objeto, vigência e valores), com a situação inicial; parcelas com linha ruim
 *   recusadas nomeando a linha, nada gravado, e depois gravadas com o total na tela; situação suspensa com motivo, e a
 *   repetição recusada; contrato anexado e baixado; um empenho emitido pela tela com a parceria aparece no detalhe dela
 *   com o líquido; quem não consulta licitações não abre a parceria.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-parcerias.mts
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
const marca = String(Date.now()).slice(-6);
const numero = `PPP-${marca}/2026`;

async function textoLongo(page: Page, form: string, nome: string, valor: string): Promise<void> {
  await page.$eval(`form[data-acao='${form}'] textarea[name='${nome}']`, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  // O formulário de empenho pergunta antes de sair com dados não salvos; o percurso confirma.
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. cadastro ──
  await irPara(n, page, "/licitacoes/ppp");
  await textoLongo(page, "criar-parcerias-publico-privadas", "objeto", "Iluminação pública em LED com manutenção e telegestão (fictícia)");
  await preencherEEnviar(page, "criar-parcerias-publico-privadas", [
    { sel: 'input[name="numero"]', valor: numero },
    { sel: 'select[name="tipo"]', valor: "ADMINISTRATIVA", tipo: "select" },
    { sel: 'input[name="parceiroPrivado"]', valor: "Concessionária Luz Fictícia S.A." },
    { sel: 'input[name="vigenciaInicio"]', valor: "2026-01-01", tipo: "data" },
    { sel: 'input[name="vigenciaFim"]', valor: "2030-12-31", tipo: "data" },
    { sel: 'input[data-mascara="valor"]', valor: "12.000.000,00", indice: 0 },
    { sel: 'input[data-mascara="valor"]', valor: "2.400.000,00", indice: 1 },
  ]);
  const ppp = await prisma.contratoPPP.findFirst({ where: { numero }, select: { id: true, tipo: true, situacoes: { select: { situacao: true } } } });
  conferir(ppp !== null && ppp.tipo === "ADMINISTRATIVA" && ppp.situacoes.map((s) => s.situacao).join() === "EM_EXECUCAO", `parceria ${numero} cadastrada pela lista, administrativa, em execução`);
  if (ppp === null) throw new Error("sem parceria, o percurso não segue");
  const detalhe = `/licitacoes/ppp/${ppp.id}`;

  // ── 2. parcelas ──
  await irPara(n, page, detalhe);
  await textoLongo(page, "parcelas", "linhas", "2026; 2.000.000,00\n2027 dois milhões");
  const ruim = await preencherEEnviar(page, "parcelas", []);
  conferir(/linha 2/i.test(ruim.texto) && (await prisma.parcelaDaPpp.count({ where: { contratoPppId: ppp.id } })) === 0, `linha ruim recusada nomeando a linha ("${ruim.texto.trim().slice(0, 80)}"), nada gravado`);
  await irPara(n, page, detalhe);
  await textoLongo(page, "parcelas", "linhas", "2026; 2.000.000,00\n2027; 2.400.000,50");
  await preencherEEnviar(page, "parcelas", []);
  await irPara(n, page, detalhe);
  const total = await page.$eval("[data-total-das-parcelas]", (e) => (e as HTMLElement).innerText.trim()).catch(() => "");
  conferir(total.includes("4.400.000,50"), `parcelas gravadas e somadas na tela (${total})`);

  // ── 3. situação ──
  const suspender = async (): Promise<string> => {
    await irPara(n, page, detalhe);
    await textoLongo(page, "situacao", "motivo", "Suspensão para revisão do equilíbrio econômico-financeiro");
    return (await preencherEEnviar(page, "situacao", [
      { sel: 'select[name="situacao"]', valor: "SUSPENSA", tipo: "select" },
      { sel: 'input[name="data"]', valor: "2026-06-01", tipo: "data" },
    ])).texto;
  };
  await suspender();
  const repetida = await suspender();
  const situacoes = await prisma.situacaoDaPpp.count({ where: { contratoPppId: ppp.id } });
  conferir(/já está suspensa/i.test(repetida) && situacoes === 2, `suspensa com motivo; repetir recusado ("${repetida.trim().slice(0, 70)}"); ${String(situacoes)} situações`);

  // ── 4. documento ──
  const caminho = join(tmpdir(), `contrato-ppp-${marca}.pdf`);
  writeFileSync(caminho, `%PDF-1.4\n% contrato fictício ${marca}\n`);
  await irPara(n, page, `${detalhe}?aba=anexos`);
  await preencherEEnviar(page, "anexar", [{ sel: 'input[name="arquivo"]', valor: caminho, tipo: "arquivo" }]);
  const anexo = await prisma.anexo.findFirst({ where: { contratoPppId: ppp.id }, select: { id: true } });
  const baixa = async (p: Page): Promise<number> => p.evaluate(async (u) => (await fetch(u)).status, `${n.base}/documentos/anexos/${anexo?.id ?? "x"}`);
  const stAdmin = await baixa(page);
  conferir(anexo !== null && stAdmin === 200, `contrato anexado pela aba Anexos e baixado (${String(stAdmin)})`);

  // ── 5. empenho com a parceria ──
  // A base fictícia não tem pessoa com papel de credor: o empenho vai pelo caminho "credor sem cadastro" da tela.
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "asc" }, where: { documento: { not: { startsWith: "0" } } }, select: { documento: true } });
  await irPara(n, page, "/despesa/empenhos?exercicio=2026");
  const ficha = await page.evaluate(() => {
    const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
    if (!(s instanceof HTMLSelectElement)) return "";
    let melhor = { v: "", saldo: 0 };
    for (const o of Array.from(s.options)) {
      if (o.value === "" || o.disabled) continue;
      // "10812 — 339039 Outros Serviços de Terceiros · fonte 500 · disponível R$ 1.234,56": só despesa corrente
      // de serviços (3390), para não cair na exigência de obra (4490.51) nem de dívida (grupo 6).
      const texto = (o.textContent ?? "").trim();
      if (!/—\s*3390/.test(texto)) continue;
      const m = /disponível R\$\s*([\d.]+,\d{2})\s*$/.exec(texto);
      const saldo = m === null ? 0 : Number((m[1] ?? "0").replace(/\./g, "").replace(",", "."));
      if (saldo > melhor.saldo) melhor = { v: o.value, saldo };
    }
    return melhor.v;
  });
  await page.$eval('form[data-acao="empenhar"] [name="historico"]', (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, `Contraprestação da parceria ${numero} (percurso)`);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("form[data-acao=\"empenhar\"] button")].find((x) => /Credor sem cadastro/i.test(x.textContent ?? ""));
    (b as HTMLButtonElement | undefined)?.click();
  });
  const r = await preencherEEnviar(page, "empenhar", [
    { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
    { sel: "[data-mascara=\"cpf-cnpj\"]", valor: pessoa?.documento ?? "" },
    { sel: '[data-mascara="valor"]', valor: "1,23" },
    { sel: 'input[name="data"]', valor: "2026-10-06", tipo: "data" },
    { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
    { sel: "contratoPppId", valor: ppp.id, tipo: "referencia", busca: numero },
  ]);
  console.log(`   envio do empenho: ${r.tipo} — ${r.texto.trim().slice(0, 200)}`);
  const invalidos = await page.$$eval("form[data-acao=\"empenhar\"] :invalid", (els) => els.map((e) => (e.getAttribute("name") ?? e.tagName) + ": " + ((e as HTMLInputElement).validationMessage ?? "")));
  if (r.tipo === "silencio" && invalidos.length > 0) console.log(`   campos inválidos: ${invalidos.join(" | ")}`);
  const empenho = await prisma.empenho.findFirst({ where: { contratoPppId: ppp.id }, select: { numero: true } });
  await irPara(n, page, detalhe);
  const linha = await page.$eval(`[data-empenho-da-ppp="${empenho?.numero ?? "x"}"]`, (e) => (e as HTMLElement).innerText).catch(() => "");
  conferir(empenho !== null && linha.includes("1,23"), `empenho emitido pela tela com a parceria aparece no detalhe dela com o líquido (${empenho?.numero ?? r.texto.trim().slice(0, 120)})`);

  // ── 6. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${detalhe}`, { waitUntil: "domcontentloaded" });
  const texto = await outra.evaluate(() => document.body.innerText);
  const stOutra = await baixa(outra);
  const motivo = (/[^.\n]*(acesso|permiss)[^.\n]*/i.exec(texto)?.[0] ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  conferir(!texto.includes("Concessionária Luz Fictícia") && motivo !== "" && stOutra !== 200, `sem consulta de licitações: a parceria não abre ("${motivo}") e o download responde ${String(stOutra)}`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das parcerias completo.");
