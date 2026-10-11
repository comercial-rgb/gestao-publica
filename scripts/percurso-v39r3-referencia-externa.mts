import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-017, V39-033) — PELA TELA: A REFERÊNCIA EXTERNA DO EMPENHO, DECLARADA E CONFERIDA POR OUTRA PESSOA.
 *
 * Pré-requisito: a massa da R3 (empenho R3-MED-001/2026; a contadora, que empenha, e a conferente da despesa).
 *   1. a contadora registra no dossiê do empenho a referência do sistema de compras da saúde; a tela a mostra como
 *      "declarada, ainda não conferida" (e não como protocolo confirmado);
 *   2. a contadora tenta conferir a própria declaração: recusada com o motivo, nada gravado;
 *   3. a conferente confirma pela tela; a condição muda e diz quem conferiu e como; o empenho não muda de valor.
 * GRAVA (base de ensaio ou demonstração). Cada corrida usa um identificador novo.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const empenho = await prisma.empenho.findFirst({ where: { numero: "R3-MED-001/2026" }, select: { id: true, valor: true } });
if (empenho === null) throw new Error("A massa da R3 não está nesta base (empenho R3-MED-001/2026).");
const identificador = `REQ-${String(Date.now()).slice(-6)}`;
const url = `/despesa/empenhos/${empenho.id}`;

const nav = await lancarNavegadorDoPercurso();
try {
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "contador@ficticio.local", senha);
  await irPara(n, pa, url);
  const r = await preencherEEnviar(pa, "registrar-referencia-externa", [
    { sel: 'input[name="sistemaDeOrigem"]', valor: "Sistema de compras da Saúde (fictício)" },
    { sel: 'input[name="identificador"]', valor: identificador },
    { sel: 'input[name="documento"]', valor: "Despacho da coordenação de compras (fictício)" },
  ], "registrar-referencia-externa");
  const ref = await prisma.referenciaExternaDoEmpenho.findFirst({ where: { empenhoId: empenho.id, identificador }, select: { id: true, criadoPor: true, conferencia: { select: { id: true } } } });
  conferir(r.tipo === "ok" && ref?.criadoPor === "contador@ficticio.local" && ref.conferencia === null, `referência ${identificador} registrada pela tela como declarada (${r.texto.slice(0, 80)})`);
  await irPara(n, pa, url);
  const condicao = await pa.$eval(`[data-referencia="${identificador}"]`, (e) => `${e.getAttribute("data-condicao") ?? ""}|${(e.textContent ?? "").replace(/\s+/g, " ")}`).catch(() => "");
  conferir(condicao.startsWith("DECLARADA|") && /declarada, ainda não conferida no sistema de origem/.test(condicao), `a tela diz que a referência está declarada e não conferida (${condicao.slice(0, 120)})`);
  const propria = await preencherEEnviar(pa, `form[data-acao="conferir-referencia-externa"][data-referencia="${identificador}"]`, [
    { sel: 'input[name="meio"]', valor: "Consulta ao sistema de compras" },
  ], `conferir-referencia-${identificador}`);
  conferir(propria.tipo === "erro" && /Quem declarou a referência .* não a confere/.test(propria.texto) && (await prisma.conferenciaDaReferenciaExterna.count({ where: { referenciaId: ref?.id ?? "" } })) === 0, `quem declarou não confere: recusado pela tela com o motivo (${propria.texto.slice(0, 80)})`);
  await ctxA.close();

  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "conferente.despesa@ficticio.local", senha);
  await irPara(n, pb, url);
  const rc = await preencherEEnviar(pb, `form[data-acao="conferir-referencia-externa"][data-referencia="${identificador}"]`, [
    { sel: 'select[name="resultado"]', valor: "CONFIRMADA", tipo: "select" },
    { sel: 'input[name="meio"]', valor: "Consulta ao sistema de compras da Saúde" },
  ], `conferir-referencia-${identificador}`);
  const conf = await prisma.conferenciaDaReferenciaExterna.findFirst({ where: { referenciaId: ref?.id ?? "" }, select: { resultado: true, criadoPor: true } });
  conferir(rc.tipo === "ok" && conf?.resultado === "CONFIRMADA" && conf.criadoPor === "conferente.despesa@ficticio.local", `a conferente confirma pela tela (${rc.texto.slice(0, 60)})`);
  await irPara(n, pb, url);
  const depois = await pb.$eval(`[data-referencia="${identificador}"]`, (e) => `${e.getAttribute("data-condicao") ?? ""}|${(e.textContent ?? "").replace(/\s+/g, " ")}`).catch(() => "");
  conferir(depois.startsWith("CONFIRMADA|") && /conferida e confirmada em .* por conferente\.despesa@ficticio\.local/.test(depois) && (await pb.$(`form[data-acao="conferir-referencia-externa"][data-referencia="${identificador}"]`)) === null, `a tela mostra a conferência, com quem conferiu e como, e não oferece conferir de novo`);
  const valor = (await prisma.empenho.findUniqueOrThrow({ where: { id: empenho.id }, select: { valor: true } })).valor.toFixed(2);
  conferir(valor === empenho.valor.toFixed(2), `o empenho não muda (valor ${valor})`);
  await ctxB.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da referência externa do empenho completo.");
