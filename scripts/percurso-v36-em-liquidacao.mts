import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { conferirDocumentoFiscal, registrarDocumentoFiscal } from "../modules/m11-licitacoes/documento-fiscal.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS EMPENHOS E RESTOS EM LIQUIDAÇÃO (TR 5.10.1.42):
 *   empenho de 500,00 pela tela; uma nota de 300,00 do credor registrada e conferida para ele (pelo domínio, como o
 *   administrador — a tela de notas tem percurso próprio); a tela de em liquidação mostra o empenho com 300,00 e a nota;
 *   o recorte "só restos" o deixa de fora; a liquidação pela tela com a nota tira o empenho da lista (a nota não tem
 *   mais o que liquidar); quem não consulta a despesa não abre a tela.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-em-liquidacao.mts
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
// O dia civil do ENTE, pela régua de `packages/datas` (nunca um fuso cravado aqui).
const hoje = diaCivil(new Date());
const meioDia = new Date(`${hoje}T15:00:00.000Z`);

async function texto(page: Page, form: string, nome: string, valor: string): Promise<void> {
  await page.$eval(`${form} [name='${nome}']`, (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. empenho pela tela ──
  const pessoa = await prisma.pessoa.findFirst({ orderBy: { documento: "asc" }, where: { documento: { not: { startsWith: "0" } } }, select: { id: true, documento: true } });
  if (pessoa === null) throw new Error("a base não tem pessoa para credor");
  await irPara(n, page, "/despesa/empenhos?exercicio=2026");
  const ficha = await page.evaluate(() => {
    const s = document.querySelector('form[data-acao="empenhar"] select[name="fichaId"]');
    if (!(s instanceof HTMLSelectElement)) return "";
    let melhor = { v: "", saldo: 0 };
    for (const o of Array.from(s.options)) {
      if (o.value === "" || o.disabled) continue;
      const t = (o.textContent ?? "").trim();
      if (!/—\s*339039/.test(t)) continue;
      const m = /disponível R\$\s*([\d.]+,\d{2})\s*$/.exec(t);
      const saldo = m === null ? 0 : Number((m[1] ?? "0").replace(/\./g, "").replace(",", "."));
      if (saldo > melhor.saldo) melhor = { v: o.value, saldo };
    }
    return melhor.v;
  });
  const historico = `Serviço com nota conferida ${marca} (percurso)`;
  await texto(page, 'form[data-acao="empenhar"]', "historico", historico);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('form[data-acao="empenhar"] button')].find((x) => /Credor sem cadastro/i.test(x.textContent ?? ""));
    (b as HTMLButtonElement | undefined)?.click();
  });
  await preencherEEnviar(page, "empenhar", [
    { sel: 'select[name="fichaId"]', valor: ficha, tipo: "select" },
    { sel: '[data-mascara="cpf-cnpj"]', valor: pessoa.documento },
    { sel: '[data-mascara="valor"]', valor: "500,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'select[name="categoria"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
  ]);
  const empenho = await prisma.empenho.findFirst({ where: { historico }, select: { id: true, numero: true } });
  conferir(empenho !== null, `empenho de R$ 500,00 pela tela (${empenho?.numero ?? "nenhum"})`);
  if (empenho === null) throw new Error("sem empenho, o percurso não segue");

  // ── 2. a nota conferida (domínio, como o administrador) ──
  const { documentoId } = await registrarDocumentoFiscal(prisma, {
    emitenteId: pessoa.id, modelo: "NFE", serie: "1", numero: `7${marca}`, dataEmissao: meioDia, dataRecebimento: meioDia, empenhoId: empenho.id,
    valorBruto: "300.00", valorTotal: "300.00",
    itens: [{ descricao: "Serviço do percurso", unidade: "UN", quantidade: "1", valorUnitario: "300.00", valorTotal: "300.00" }],
    criadoPor: "admin@cg.pb.gov.br",
  });
  await conferirDocumentoFiscal(prisma, { documentoId, data: meioDia, motivo: "Conferida com a entrega (percurso)", criadoPor: "admin@cg.pb.gov.br" });

  // ── 3. a tela mostra o empenho em liquidação ──
  const tela = "/despesa/em-liquidacao?exercicio=2026";
  await irPara(n, page, tela);
  const linha = await page.$eval(`[data-em-liquidacao="${empenho.numero}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
  conferir(linha.includes("300,00") && linha.includes("500,00") && /NF-e 7/.test(linha), `em liquidação: saldo 500,00, nota de 300,00 e 300,00 em liquidação ("${linha.slice(0, 140)}")`);

  // ── 4. o recorte "só restos" o deixa de fora ──
  await irPara(n, page, `${tela}&origem=restos`);
  const emRestos = await page.$(`[data-em-liquidacao="${empenho.numero}"]`);
  conferir(emRestos === null, "o recorte de restos deixa o empenho do exercício de fora");

  // ── 5. a liquidação com a nota o tira da lista ──
  await irPara(n, page, "/despesa/liquidacoes?exercicio=2026");
  await texto(page, 'form[data-acao="liquidar"]', "historico", `Liquidação da nota ${marca}`);
  await preencherEEnviar(page, "liquidar", [
    // V37 — o empenho da liquidação é escolhido pela BUSCA (não há mais o select com todos os liquidáveis).
    { sel: "empenhoId", valor: empenho.id, busca: empenho.numero, tipo: "referencia" },
    { sel: 'select[name="documentoFiscalId"]', valor: documentoId, tipo: "select" },
    { sel: '[data-mascara="valor"]', valor: "300,00" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="atesto"]', valor: "Servidor fictício do atesto" },
  ]);
  const liq = await prisma.liquidacao.findFirst({ where: { empenhoId: empenho.id, documentoFiscalId: documentoId }, select: { numero: true } });
  await irPara(n, page, tela);
  const depois = await page.$(`[data-em-liquidacao="${empenho.numero}"]`);
  conferir(liq !== null && depois === null, `liquidada com a nota pela tela (${liq?.numero ?? "nenhuma"}), o empenho sai da lista`);

  // ── 6. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${tela}`, { waitUntil: "domcontentloaded" });
  const t = await outra.evaluate(() => document.body.innerText);
  const destino = new URL(outra.url());
  // O motivo tem de ser O da falta de consulta da despesa — não "unidade fora do acesso", que é outra recusa.
  const recusa = destino.pathname === "/sem-acesso" ? `sem-acesso ${destino.searchParams.get("acao") ?? ""}` : (/ação de leitura cobrada é CONSULTAR_DESPESA/.exec(t)?.[0] ?? "");
  conferir(/CONSULTAR_DESPESA/.test(recusa) && !t.includes(`NF-e 7${marca}`), `sem consulta da despesa: a tela não abre (${recusa.slice(0, 100)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos empenhos em liquidação completo.");
