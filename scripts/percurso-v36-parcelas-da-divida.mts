import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarDivida } from "../modules/m10-patrimonial/divida.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";
import type { Page } from "puppeteer";

/**
 * V36 — PERCURSO: O RELATÓRIO DA DÍVIDA FUNDADA E AS PARCELAS INFORMADAS (/relatorios/divida).
 *   1. com uma dívida fictícia cadastrada pelo serviço (a base fictícia não tinha nenhuma), a lista mostra a dívida;
 *   2. o cronograma colado com uma linha ruim é recusado nomeando a linha, e nada é gravado;
 *   3. o cronograma certo (3 parcelas, uma com encargos) entra e aparece no comparativo, depois de recarregar;
 *   4. a correção de uma parcela troca o valor e marca "corrigida"; a versão anterior fica gravada;
 *   5. o PDF sai, e dívida inexistente responde 404 com o motivo;
 *   6. quem não tem a consulta da dívida vai para /sem-acesso nomeando a ação, e o PDF responde 403.
 * O comparativo com amortização de verdade está provado em m10-parcelas-da-divida.test.ts (a base fictícia não
 * tem empenho de amortização).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-parcelas-da-divida.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const ADMIN = "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const semDivida = process.env["PERCURSO_SEM_DIVIDA"] ?? "atestador@ficticio.local";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
// Uma dívida fictícia por corrida: o percurso mede a partir do cronograma vazio, e não se apaga dado.
const IDENT = `FIC-FINISA-${new Date().toISOString().slice(0, 16).replace(/\D/g, "")}`;
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

async function pedir(page: Page, caminho: string): Promise<{ status: number; tipo: string; tamanho: number; texto: string }> {
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "same-origin" });
    const tipo = r.headers.get("content-type") ?? "";
    const corpo = new Uint8Array(await r.arrayBuffer());
    return { status: r.status, tipo, tamanho: corpo.length, texto: tipo.includes("pdf") ? "" : new TextDecoder().decode(corpo) };
  }, caminho);
}

// ── A dívida fictícia, pelo serviço (idempotente pelo identificador) ──
let divida = await prisma.dividaConsolidada.findUnique({ where: { identificador: IDENT }, select: { id: true } });
if (divida === null) {
  const conta = await prisma.contaPcasp.findFirst({ where: { codigo: { startsWith: "2.2.2.1" }, analitica: true }, orderBy: { codigo: "asc" }, select: { id: true } });
  if (conta === null) throw new Error("A base não tem conta analítica de empréstimos a longo prazo (2.2.2.1) no plano.");
  const r = await cadastrarDivida(prisma, {
    identificador: IDENT,
    credorNome: "Caixa Econômica Federal (fictício)",
    credorDocumento: "00360305000104",
    tipo: "CONTRATUAL",
    leiAutorizativa: "Lei fictícia de demonstração",
    objeto: "Financiamento fictício de pavimentação (dado de demonstração)",
    contaContabilId: conta.id,
    criadoPor: ADMIN,
  });
  divida = { id: r.dividaId };
}
const parcelasAntes = await prisma.parcelaDaDivida.count({ where: { dividaId: divida.id } });
if (parcelasAntes > 0) throw new Error(`A dívida ${IDENT} já tem parcelas nesta base: o percurso mede a partir do cronograma vazio.`);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, ADMIN, senha);

  await irPara(n, page, "/relatorios/divida");
  const naLista = await page.$$eval("[data-lista='dividas'] tr[data-divida]", (trs) => trs.map((t) => t.getAttribute("data-divida")));
  conferir(naLista.includes(divida.id), `a lista mostra a dívida ${IDENT} (${String(naLista.length)} na lista)`);

  await irPara(n, page, `/relatorios/divida?divida=${divida.id}`);
  const ruim = await preencherEEnviar(page, "informar-parcelas-da-divida", [
    { sel: 'textarea[name="cronograma"]', valor: "1;28/02/2026;10.000,00\n2;31/02/2026;10.000,00" },
  ]);
  conferir(
    /linha 2: vencimento "31\/02\/2026"[\s\S]*Nada foi gravado/.test(ruim.texto) && (await prisma.parcelaDaDivida.count({ where: { dividaId: divida.id } })) === 0,
    `cronograma com dia inexistente recusado nomeando a linha, nada gravado: "${ruim.texto.slice(0, 120)}"`
  );

  const certo = await preencherEEnviar(page, "informar-parcelas-da-divida", [
    { sel: 'textarea[name="cronograma"]', valor: "1;28/02/2026;10.000,00;512,30\n2;31/03/2026;10.000,00\n3;30/04/2026;10.000,00" },
  ]);
  await irPara(n, page, `/relatorios/divida?divida=${divida.id}`);
  const linhas = await page.$$eval("[data-lista='parcelas'] tbody tr[data-parcela]", (trs) => trs.map((t) => Array.from(t.querySelectorAll("td")).map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim())));
  conferir(
    /3 parcela\(s\) informada\(s\)/.test(certo.texto) &&
      linhas.length === 3 &&
      linhas[0]![1] === "28/02/2026" && linhas[0]![2] === "10.000,00" && linhas[0]![3] === "512,30" && linhas[2]![1] === "30/04/2026",
    `três parcelas no comparativo depois de recarregar: ${JSON.stringify(linhas.map((l) => l.slice(0, 4)))}`
  );

  const p2 = await prisma.parcelaDaDivida.findFirstOrThrow({ where: { dividaId: divida.id, numero: 2 }, select: { id: true } });
  const corr = await preencherEEnviar(page, "corrigir-parcela-da-divida", [
    { sel: 'select[name="parcelaId"]', valor: p2.id, tipo: "select" },
    { sel: 'input[name="vencimento"]', valor: "31/03/2026" },
    { sel: 'input[name="principal"]', valor: "9.500,00" },
    { sel: 'input[name="motivo"]', valor: "Aditivo fictício do contrato" },
  ]);
  await irPara(n, page, `/relatorios/divida?divida=${divida.id}`);
  const linha2 = await page.$eval("[data-lista='parcelas'] tr[data-parcela='2']", (t) => (t.textContent ?? "").replace(/\s+/g, " "));
  conferir(
    /Parcela corrigida/.test(corr.texto) && /2 \(corrigida\)/.test(linha2) && linha2.includes("9.500,00") && (await prisma.parcelaDaDivida.count({ where: { dividaId: divida.id } })) === 4,
    `parcela 2 corrigida, a anterior fica gravada: "${linha2.slice(0, 90)}"`
  );

  const pdf = await pedir(page, `/relatorios/divida/pdf?divida=${encodeURIComponent(divida.id)}`);
  const inexistente = await pedir(page, "/relatorios/divida/pdf?divida=nao-existe");
  conferir(
    pdf.status === 200 && pdf.tipo.includes("application/pdf") && pdf.tamanho > 2000 && inexistente.status === 404 && /não existe/.test(inexistente.texto),
    `PDF ${String(pdf.status)} ${String(pdf.tamanho)} bytes; inexistente ${String(inexistente.status)} "${inexistente.texto.slice(0, 70)}"`
  );

  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, semDivida, senhaFicticia);
  await outra.goto(`${n.base}/relatorios/divida?divida=${divida.id}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  const rota = await pedir(outra, `/relatorios/divida/pdf?divida=${encodeURIComponent(divida.id)}`);
  conferir(
    destino.pathname === "/sem-acesso" && destino.searchParams.get("acao") === "CONSULTAR_DIVIDA" && rota.status === 403 && !rota.tipo.includes("pdf"),
    `${semDivida}: tela em ${destino.pathname}?acao=${destino.searchParams.get("acao") ?? ""}; PDF ${String(rota.status)}`
  );
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das parcelas da dívida completo.");
