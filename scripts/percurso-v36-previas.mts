import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { toMoney } from "../packages/contracts/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DA PRÉVIA DE ALTERAÇÃO ORÇAMENTÁRIA (TR 5.9.3.23 e 5.9.3.24):
 *   o administrador registra pela tela uma prévia por anulação (+100,00 na ficha A, −100,00 na ficha B, mesma fonte); a
 *   ficha B fica com 100,00 bloqueados; acrescenta um segundo lote (+50,00 / −50,00); a minuta do decreto mostra 150,00;
 *   aprova; efetiva contra a lei da LOA com o número do decreto — o decreto nasce com os quatro movimentos, o bloqueio se
 *   desfaz e a dotação muda; uma segunda prévia é registrada e descartada, e o bloqueio dela se desfaz; o contador, que só
 *   consulta o planejamento, lê a lista e a prévia sem os formulários.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-previas.mts
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
const hoje = diaCivil(new Date());
const EX = Number(hoje.slice(0, 4));

const saldo = async (id: string): Promise<{ aut: string; res: string; disp: string }> => {
  const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id }, select: { saldoAutorizado: true, saldoReservado: true, saldoDisponivel: true } });
  return { aut: f.saldoAutorizado.toFixed(2), res: f.saldoReservado.toFixed(2), disp: f.saldoDisponivel.toFixed(2) };
};
const mais = (a: string, b: string): string => toMoney(toMoney(a).plus(b)).toFixed(2);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // O roteiro do bloqueio da prévia é decisão da contabilidade do ente (bloqueio .01 ou outras indisponibilidades .99,
  // sob crédito indisponível). Na BASE FICTÍCIA, e só nela, o percurso publica a .99 quando falta, dizendo que é
  // escolha de demonstração; em produção a prévia com anulação fica recusada até a contabilidade publicar o seu.
  if ((await prisma.roteiroOrcamentario.count({ where: { tipo: "BLOQUEIO_DE_PREVIA" } })) === 0) {
    const { publicarRoteiroOrcamentario } = await import("../modules/m05-despesa/servico-roteiro-orcamentario.js");
    const fundamento = "Base fictícia de demonstração: escolha do percurso, não decisão do ente. A conta do bloqueio da prévia é da contabilidade.";
    await publicarRoteiroOrcamentario(prisma, { tipo: "BLOQUEIO_DE_PREVIA", tipoCredito: null, abertura: null, contaDebitoCodigo: "6.2.2.1.1.00.00", contaCreditoCodigo: "6.2.2.1.2.99.00", fundamento, criadoPor: "admin@cg.pb.gov.br" });
    await publicarRoteiroOrcamentario(prisma, { tipo: "BLOQUEIO_DE_PREVIA_LIBERADO", tipoCredito: null, abertura: null, contaDebitoCodigo: "6.2.2.1.2.99.00", contaCreditoCodigo: "6.2.2.1.1.00.00", fundamento, criadoPor: "admin@cg.pb.gov.br" });
  }

  // Duas fichas da mesma fonte, com disponível folgado.
  const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: EX, saldoDisponivel: { gt: 1000 } }, orderBy: { numero: "asc" }, select: { id: true, numero: true, fonteId: true } });
  const fonte = fichas.find((f) => fichas.filter((g) => g.fonteId === f.fonteId).length >= 2)?.fonteId;
  const [A, B] = fichas.filter((f) => f.fonteId === fonte);
  if (A === undefined || B === undefined) throw new Error("a base não tem duas fichas da mesma fonte com disponível");
  const antesA = await saldo(A.id);
  const antesB = await saldo(B.id);
  const descricao = `Reforço de dotação do percurso ${marca}`;

  // ── 1. a prévia com o primeiro lote ──
  await irPara(n, page, `/planejamento/previas?exercicio=${String(EX)}`);
  const r1 = await preencherEEnviar(page, "criar-previa", [
    { sel: 'input[name="descricao"]', valor: descricao },
    { sel: 'input[name="ficha0"]', valor: String(A.numero) },
    { sel: '[data-mascara="valor"]', indice: 0, valor: "100,00" },
    { sel: 'input[name="ficha1"]', valor: String(B.numero) },
    { sel: 'select[name="tipo1"]', valor: "ANULACAO", tipo: "select" },
    { sel: '[data-mascara="valor"]', indice: 1, valor: "100,00" },
  ]);
  const previa = await prisma.previaDeAlteracao.findFirst({ where: { descricao }, select: { id: true, numero: true } });
  const b1 = await saldo(B.id);
  conferir(r1.tipo === "ok" && previa !== null && b1.res === mais(antesB.res, "100") && b1.disp === mais(antesB.disp, "-100"), `prévia nº ${String(previa?.numero ?? "?")} pela tela; ficha ${String(B.numero)} com 100,00 bloqueados (reservado ${b1.res}) (${r1.texto.slice(0, 80)})`);
  if (previa === null) throw new Error("sem a prévia, o percurso não segue");

  // ── 2. o segundo lote ──
  await irPara(n, page, `/planejamento/previas/${previa.id}`);
  const r2 = await preencherEEnviar(page, "acrescentar-lote", [
    { sel: 'input[name="ficha0"]', valor: String(A.numero) },
    { sel: '[data-mascara="valor"]', indice: 0, valor: "50,00" },
    { sel: 'input[name="ficha1"]', valor: String(B.numero) },
    { sel: 'select[name="tipo1"]', valor: "ANULACAO", tipo: "select" },
    { sel: '[data-mascara="valor"]', indice: 1, valor: "50,00" },
  ]);
  const b2 = await saldo(B.id);
  const lotes = await prisma.itemDaPrevia.findMany({ where: { previaId: previa.id }, select: { lote: true } });
  conferir(r2.tipo === "ok" && new Set(lotes.map((l) => l.lote)).size === 2 && lotes.length === 4 && b2.res === mais(antesB.res, "150"), `segundo lote: 4 movimentos em 2 lotes, 150,00 bloqueados (${r2.texto.slice(0, 60)})`);

  // ── 3. a minuta ──
  await irPara(n, page, `/planejamento/previas/${previa.id}/minuta?documento=decreto`);
  const minuta = await page.evaluate(() => (document.querySelector("[data-minuta]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ") ?? "");
  conferir(/Minuta de decreto/.test(minuta) && /150,00/.test(minuta) && /Dotações anuladas/.test(minuta), `minuta do decreto com 150,00 e as dotações anuladas: "${minuta.slice(0, 120)}"`);

  // ── 4. aprovar ──
  // Aprovar, efetivar e descartar mudam a situação, e o formulário some da página com a resposta dentro: o passo exige
  // que não haja erro e confere o EFEITO no banco.
  await irPara(n, page, `/planejamento/previas/${previa.id}`);
  const r4 = await preencherEEnviar(page, "aprovar-previa", [{ sel: 'input[name="parecer"]', valor: "De acordo (percurso)" }]);
  conferir(r4.tipo !== "erro" && (await prisma.aprovacaoDaPrevia.count({ where: { previaId: previa.id } })) === 1, `aprovada pela tela (${r4.texto.slice(0, 60)})`);

  // ── 5. efetivar ──
  await irPara(n, page, `/planejamento/previas/${previa.id}`);
  const lei = await page.$eval('form[data-acao="efetivar-previa"] select[name="leiId"]', (s) => Array.from((s as HTMLSelectElement).options).find((o) => o.value !== "")?.value ?? "").catch(() => "");
  const numeroDecreto = `PRV-${marca}`;
  const r5 = await preencherEEnviar(page, "efetivar-previa", [
    { sel: 'select[name="leiId"]', valor: lei, tipo: "select" },
    { sel: 'input[name="numero"]', valor: numeroDecreto },
  ]);
  const decreto = await prisma.decretoCredito.findFirst({ where: { numero: numeroDecreto }, select: { id: true, itens: { select: { tipo: true, valor: true } } } });
  const depoisA = await saldo(A.id);
  const depoisB = await saldo(B.id);
  conferir(
    r5.tipo !== "erro" && decreto !== null && decreto.itens.length === 4 && depoisB.res === antesB.res && depoisB.aut === mais(antesB.aut, "-150") && depoisA.aut === mais(antesA.aut, "150"),
    `efetivada: decreto ${numeroDecreto} com ${String(decreto?.itens.length ?? 0)} movimentos; ficha A ${antesA.aut} -> ${depoisA.aut}; ficha B ${antesB.aut} -> ${depoisB.aut}, reservado de volta a ${depoisB.res} (${r5.texto.slice(0, 70)})`
  );
  await irPara(n, page, `/planejamento/previas/${previa.id}`);
  const situacao = await page.$eval("[data-situacao]", (e) => e.getAttribute("data-situacao") ?? "");
  const bloqueios = await page.$$eval("[data-bloqueio]", (els) => els.map((e) => e.getAttribute("data-bloqueio") ?? "").filter((x) => x !== ""));
  conferir(situacao === "EFETIVADA" && bloqueios.length === 2 && bloqueios.every((b) => b === "desfeito"), `a prévia mostra Efetivada e os dois bloqueios desfeitos (${bloqueios.join(",")})`);

  // ── 6. a segunda prévia, descartada ──
  const descricao2 = `Prévia a descartar do percurso ${marca}`;
  await irPara(n, page, `/planejamento/previas?exercicio=${String(EX)}`);
  await preencherEEnviar(page, "criar-previa", [
    { sel: 'input[name="descricao"]', valor: descricao2 },
    { sel: 'input[name="ficha0"]', valor: String(A.numero) },
    { sel: '[data-mascara="valor"]', indice: 0, valor: "10,00" },
    { sel: 'input[name="ficha1"]', valor: String(B.numero) },
    { sel: 'select[name="tipo1"]', valor: "ANULACAO", tipo: "select" },
    { sel: '[data-mascara="valor"]', indice: 1, valor: "10,00" },
  ]);
  const p2 = await prisma.previaDeAlteracao.findFirst({ where: { descricao: descricao2 }, select: { id: true } });
  const comBloqueio = await saldo(B.id);
  await irPara(n, page, `/planejamento/previas/${p2?.id ?? ""}`);
  const r6 = await preencherEEnviar(page, "descartar-previa", [{ sel: 'input[name="motivo"]', valor: "Desistência do remanejamento (percurso)" }]);
  const semBloqueio = await saldo(B.id);
  conferir(r6.tipo !== "erro" && comBloqueio.res === mais(depoisB.res, "10") && semBloqueio.res === depoisB.res, `segunda prévia: bloqueou 10,00 (reservado ${comBloqueio.res}) e o descarte o desfez (reservado ${semBloqueio.res})`);

  // ── 7. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "contador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}/planejamento/previas?exercicio=${String(EX)}`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector("[data-tabela-previas]");
  const semCriar = (await outra.$('form[data-acao="criar-previa"]')) === null;
  await outra.goto(`${n.base}/planejamento/previas/${previa.id}`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector("[data-tabela-itens-da-previa]");
  const formsNoDetalhe = await outra.$$eval("form[data-acao]", (els) => els.length);
  conferir(semCriar && formsNoDetalhe === 0, "o contador lê a lista e a prévia, sem formulário de registro, aprovação, efetivação ou descarte (a recusa no servidor está no teste do domínio)");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da prévia de alteração orçamentária completo.");
