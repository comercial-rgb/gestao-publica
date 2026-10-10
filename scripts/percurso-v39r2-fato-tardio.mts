import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-001) — PELA TELA: ENCERRAR UM PERÍODO, REGISTRAR DEPOIS UM FATO COM DATA DENTRO DELE, E VER QUE A
 * CONFERÊNCIA ENCERRADA NÃO MUDOU E O FATO APARECE À PARTE.
 *   1. no período aberto (já terminado) da conta, justifica cada pendência com um motivo próprio e encerra;
 *   2. a tela diz que a conferência é a do encerramento (`data-fonte-do-relatorio`); fotografa saldos e pendências;
 *   3. na movimentação bancária, registra um depósito com DATA dentro do período encerrado;
 *   4. o período encerrado mostra os mesmos saldos e pendências, e o depósito em "Registrado depois do encerramento";
 *   5. confere no banco que a data de ocorrência do depósito é a digitada (não foi mexida).
 * GRAVA (base de demonstração/ensaio, conferida pelo `entrar`): justificativas, o encerramento e um depósito.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const CONTA = process.env["PERCURSO_CONTA"] ?? "FIC-PM-500";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const hoje = diaCivil(new Date());
const doBr = (d: string): string => d.split("/").reverse().join("-");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");
  await irPara(n, page, "/financeiro/conciliacao/periodo");
  const contaId = await page.$$eval('form[data-acao="abrir-conciliacao"] select[name="conta"] option', (os, c) => os.find((o) => (o.textContent ?? "").startsWith(c as string))?.getAttribute("value") ?? "", CONTA);
  if (contaId === "") throw new Error(`A conta ${CONTA} não está entre as contas da conciliação.`);
  await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${contaId}`);
  const periodos = await page.$$eval("li[data-periodo]", (ls) => ls.map((l) => ({ texto: (l.textContent ?? "").replace(/\s+/g, " ").trim(), href: l.querySelector("a")?.getAttribute("href") ?? "" })));
  const fimDe = (t: string): string => doBr(/a (\d{2}\/\d{2}\/\d{4})/.exec(t)?.[1] ?? "9999-12-31");
  const inicioDe = (t: string): string => doBr(/(\d{2}\/\d{2}\/\d{4}) a/.exec(t)?.[1] ?? "9999-12-31");
  const alvo = periodos.find((p) => !p.texto.includes("encerrada") && fimDe(p.texto) < hoje);
  if (alvo === undefined) throw new Error(`A conta ${CONTA} não tem período aberto já terminado: ${periodos.map((p) => p.texto).join("; ")}`);
  conferir(true, `período aberto e já terminado: ${alvo.texto}`);

  // 1. justificar cada pendência (motivo próprio) e encerrar
  await irPara(n, page, alvo.href);
  const pendencias = await page.$$eval("[data-pendencia-extrato], [data-pendencia-interna]", (ls) => ls.map((l) => ({ ref: l.getAttribute("data-pendencia-extrato") ?? l.getAttribute("data-pendencia-interna") ?? "", dia: l.getAttribute("data-dia") ?? "", valor: (l.querySelector("div > span.tabular-nums")?.textContent ?? "").trim(), extrato: l.hasAttribute("data-pendencia-extrato") })));
  let justificadas = 0;
  for (const p of pendencias) {
    await irPara(n, page, alvo.href);
    const r = await preencherEEnviar(page, `form[data-acao="justificar-pendencia"]:has(input[name="referencia"][value="${p.ref}"])`, [{ sel: 'input[name="motivo"]', valor: p.extrato ? `Lançamento do banco de ${p.dia} (${p.valor}) sem registro correspondente no razão no período; a conferir (ensaio V39-R2).` : `Registro de ${p.dia} (${p.valor}) ainda não compensado pelo banco no período (ensaio V39-R2).` }]);
    if (r.tipo === "ok") justificadas += 1;
  }
  conferir(justificadas === pendencias.length, `${String(justificadas)} de ${String(pendencias.length)} pendência(s) justificadas pela tela`);
  await irPara(n, page, alvo.href);
  const re = await preencherEEnviar(page, "encerrar-conciliacao", []);
  await irPara(n, page, alvo.href);
  const estado = await page.$eval("[data-estado]", (e) => e.getAttribute("data-estado") ?? "").catch(() => "");
  const fonte = await page.$eval("[data-fonte-do-relatorio]", (e) => e.getAttribute("data-fonte-do-relatorio") ?? "").catch(() => "");
  conferir(estado === "ENCERRADA" && fonte === "FOTO_DO_ENCERRAMENTO", `encerrado pela tela (${estado}); a tela diz que a conferência é a do encerramento (${fonte}) — ${re.texto.slice(0, 60)}`);
  const foto = async (): Promise<{ saldos: string; pendencias: string[] }> => ({
    saldos: await page.$eval("[data-conciliacao] dl", (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()),
    pendencias: (await page.$$eval("[data-pendencia-extrato], [data-pendencia-interna]", (ls) => ls.map((l) => l.getAttribute("data-pendencia-extrato") ?? l.getAttribute("data-pendencia-interna") ?? ""))).sort(),
  });
  const antes = await foto();

  // 3. o depósito registrado DEPOIS, com data DENTRO do período encerrado
  const dia = (() => { const d = new Date(`${inicioDe(alvo.texto)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 14); return d.toISOString().slice(0, 10); })();
  await irPara(n, page, "/financeiro/movimentacao");
  await page.waitForSelector('form[data-acao="registrar-movimento-bancario"] input[name="__chave"][data-chave-de-comando="pronta"]');
  await page.select('form[data-acao="registrar-movimento-bancario"] select[name="conta"]', contaId);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('form[data-acao="registrar-movimento-bancario"] select[name="fonte"] option')).some((o) => (o.getAttribute("value") ?? "") !== ""));
  const fonteId = await page.$$eval('form[data-acao="registrar-movimento-bancario"] select[name="fonte"] option', (os) => os.map((o) => o.getAttribute("value") ?? "").find((v) => v !== "") ?? "");
  const contrapartida = await page.$$eval('form[data-acao="registrar-movimento-bancario"] select[name="contrapartida"] option', (os) => os.map((o) => o.getAttribute("value") ?? "").find((v) => v !== "") ?? "");
  const rm = await preencherEEnviar(page, "registrar-movimento-bancario", [
    { sel: 'select[name="fonte"]', valor: fonteId, tipo: "select" },
    { sel: 'select[name="tipo"]', valor: "DEPOSITO", tipo: "select" },
    { sel: 'input[data-mascara="valor"]', valor: "333,33" },
    { sel: 'input[name="dia"]', valor: dia, tipo: "data" },
    { sel: 'select[name="contrapartida"]', valor: contrapartida, tipo: "select" },
    { sel: 'input[name="historico"]', valor: "Depósito registrado depois do encerramento (ensaio V39-R2)" },
  ]);
  const mov = await prisma.movimentoBancario.findFirst({ where: { historico: "Depósito registrado depois do encerramento (ensaio V39-R2)" }, orderBy: { criadoEm: "desc" }, select: { id: true, data: true, criadoEm: true } });
  conferir(rm.tipo === "ok" && mov !== null && diaCivil(mov.data) === dia, `depósito de 333,33 registrado agora com data de ocorrência ${dia}, dentro do período (${rm.texto.slice(0, 60)})`);

  // 4. a conferência encerrada não mudou; o depósito aparece à parte
  await irPara(n, page, alvo.href);
  const depois = await foto();
  conferir(depois.saldos === antes.saldos && JSON.stringify(depois.pendencias) === JSON.stringify(antes.pendencias), "a conferência encerrada mostra os mesmos saldos e pendências");
  const tardio = await page.$$eval("[data-fato-tardio]", (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
  conferir(mov !== null && tardio.some((t) => t.includes("333.33")), `o depósito aparece em "Registrado depois do encerramento" (${tardio.join(" | ").slice(0, 120)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do fato tardio completo.");
